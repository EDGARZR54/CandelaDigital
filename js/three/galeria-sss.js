/* ==================================================
   galeria-sss.js

   SSS aproximado (translucidez por contraluz) INYECTADO
   en los materiales que ya usa la galería — no es una
   malla ni un material aparte.

   TÉCNICA: "Approximating Translucency" (Barré-Brisebois
   & Bouchard, GDC 2011), modulada por un grosor aparente
   (1 - |N·V|)^falloff — portada de VISORSSS.html.

   POR QUÉ ESTA Y NO LA DE Maqueta.html: la de la maqueta
   aproxima el grosor con un "boxChord" — cuánto atraviesa
   el rayo fragmento→luz una CAJA MACIZA del tamaño del
   bbox. Ahí funcionaba porque los objetos eran, literal,
   BoxGeometry. Las geometrías de esta galería son
   cáscaras paramétricas ABIERTAS (ver paraguas_0.js: un
   hypar de N pétalos; los-manantiales.js: un paraboloide
   modulado) — el bbox de una cáscara está casi todo
   vacío, así que el boxChord les daría grosor máximo en
   el hueco central y mínimo en los bordes, justo al revés
   de lo que se ve en una cáscara real a contraluz.
   (1 - |N·V|) no mira el bbox: da 1 donde la superficie
   es tangente a la vista (la silueta) y 0 mirándola de
   frente.

   POR QUÉ INYECTADO Y NO UN ShaderMaterial PROPIO (como
   sí hace VISORSSS.html, que reemplaza el material
   entero): ese visor no tiene nada más que mantener. Acá
   el material de cada elemento participa de cosas que se
   perderían con un ShaderMaterial crudo:

     - recibe la sombra del keyLight (shadow map),
     - lo recorta "clippingPlanes" (galeria-corte.js),
     - lo funden por "opacity" varias fases
       (revelado/carrusel/zoom),
     - pasa por el tone mapping ACES + sRGB del renderer.

   Inyectando en "lights_fragment_end" y sumando a
   "reflectedLight.indirectDiffuse", el SSS hereda las
   cuatro cosas sin código extra: entra a la cadena ANTES
   del tone mapping, así que no hace falta el
   linearToSRGB() a mano que sí necesitaba VISORSSS.html
   (un ShaderMaterial escribe gl_FragColor sin pasar por
   el chunk de colorspace).

   SOLO EL KEY LIGHT: las luces adicionales (cyan/cálida/
   de sala/por caja, ver galeria-luces.js) NO aportan SSS
   — decisión explícita. El efecto se ata al cono
   (posición + dirección + ángulo + penumbra + distancia
   del SpotLight, ver galeria-cono-luz.js), que es el que
   dirige la atención en esta galería. Sin la máscara de
   cono, TODOS los elementos de la fila brillarían por
   contraluz aunque el cono esté apuntando a otro.

   La atenuación por distancia usa la MISMA fórmula lineal
   que parcha galeria-compat-r128.js sobre el chunk
   lights_pars_begin — si el SSS usara la Frostbite de
   0.169 se apagaría en un punto distinto que la luz
   directa del mismo keyLight, sobre el mismo elemento.

   ESTADO COMPARTIDO: los uniforms son objetos de módulo,
   uno solo para TODOS los materiales (cada shader recibe
   la misma referencia). Por eso actualizar() escribe cinco
   valores por frame en total, no por elemento — a
   diferencia de una malla de glow por cono, el costo acá
   no crece con la cantidad de elementos.
================================================== */

import * as THREE from 'three';


/*
    Un objeto por uniform, compartido por todos los
    materiales: aplicarSSS() le pasa a cada shader ESTA
    misma referencia, así que escribir ".value" una vez
    (ver actualizar/actualizarTema) los alcanza a todos.
*/
const uSSSLightPos   = { value: new THREE.Vector3() };
const uSSSLightColor = { value: new THREE.Color(1, 1, 1) };
const uSSSSpotDir    = { value: new THREE.Vector3(0, -1, 0) };
const uSSSCutoff     = { value: 0 };
const uSSSDecay      = { value: 2 };

/*
    FIX: arrancaban en (-1, -1) — los dos bordes de
    smoothstep() iguales, división por cero, comportamiento
    indefinido (puede dar NaN). Y "uSSSCutoff" en 0 hacía que
    "atenSSS" (más abajo) cayera al else y diera 1.0 — SSS A
    FULL, SIN atenuar por distancia ni por cono — en TODA la
    fila, hasta el primer frame en que actualizar() corriera
    de verdad. Si por lo que sea actualizar() no llega a
    correr (hookup faltante en galeria.js, o el primer frame
    antes de que corra), el estado por defecto ahora es "SSS
    apagado" (atenSSS cae a 0 más abajo) en vez de "SSS a
    full en toda la escena" — fallar en silencio hacia
    "invisible" es mucho más seguro que fallar hacia "un velo
    parejo sobre todo".
*/
const uSSSCosOuter   = { value: -1 };
const uSSSCosInner   = { value: -1 + 1e-3 };

const uSSSDistortion = { value: 0.35 };
const uSSSPower      = { value: 4.0 };
const uSSSScale      = { value: 4.5 };
const uSSSAmbient    = { value: 0.05 };
const uSSSAmbientFueraCono = { value: 0.25 };
const uSSSThickness  = { value: 1.6 };
const uSSSStrength   = { value: 1.0 };


// Se llenan en configurarSSS(), antes de construir ningún
// material (ver createScene, galeria-escena.js).
let keyLightRef = null;
let cfgSSS = null;
let temaRef = null;

const _tmpDir = new THREE.Vector3();


const DECLARACION_UNIFORMS = `
uniform vec3  uSSSLightPos;
uniform vec3  uSSSLightColor;
uniform vec3  uSSSSpotDir;
uniform float uSSSCutoff;
uniform float uSSSDecay;
uniform float uSSSCosOuter;
uniform float uSSSCosInner;
uniform float uSSSDistortion;
uniform float uSSSPower;
uniform float uSSSScale;
uniform float uSSSAmbient;
uniform float uSSSAmbientFueraCono;
uniform float uSSSThickness;
uniform float uSSSStrength;
`;


/*
    Todo el cálculo va en ESPACIO DE VISTA, no de mundo
    como en VISORSSS.html — porque acá los dos vectores que
    hacen falta ya vienen dados en ese espacio por el
    propio shader de three:

      "normal"        — normal ya interpolada Y YA DADA
                        VUELTA para la cara trasera por
                        <normal_fragment_begin> (multiplica
                        por faceDirection en materiales
                        DoubleSide). O sea que el
                        "if (!gl_FrontFacing) N = -N;" que
                        VISORSSS.html hacía a mano acá ya
                        está hecho: repetirlo lo
                        desharía.

      "vViewPosition" — vector del fragmento A LA CÁMARA
                        (es -mvPosition.xyz), así que la
                        posición del fragmento es su
                        negativo, y V = normalize(
                        vViewPosition) directamente, sin
                        necesidad de un uniform de
                        posición de cámara como el
                        uCameraPos de VISORSSS.html.

    La luz sí llega en mundo (uSSSLightPos/uSSSSpotDir) y
    se pasa a vista con "viewMatrix", que three declara en
    el fragment shader.
*/
const BLOQUE_SSS = `
    {
        vec3 posVista = - vViewPosition;
        vec3 vDir     = normalize( vViewPosition );
        vec3 nDir     = normalize( normal );

        vec3 luzVista = ( viewMatrix * vec4( uSSSLightPos, 1.0 ) ).xyz;
        vec3 haciaLuz = luzVista - posVista;
        float distLuz = length( haciaLuz );
        vec3 lDir     = haciaLuz / max( distLuz, 1e-6 );

        // Atenuación LINEAL de r128 — misma fórmula que el
        // parche de galeria-compat-r128.js, para que el SSS
        // se apague en el mismo punto que la luz directa
        // del mismo keyLight.
        // FIX: el fallback era "1.0" (SIN atenuar, a full) —
        // pensado como "sin cutoff configurado, no limitar el
        // alcance". Pero "cutoff=0" es también el estado
        // INICIAL antes de la primera actualizar() (ver el
        // comentario grande junto a uSSSCosOuter/uSSSCosInner
        // más arriba), así que ese fallback hacía que CUALQUIER
        // frame sin datos reales del cono todavía se viera con
        // el SSS a full en toda la fila. "0.0" es el default
        // seguro: sin datos reales, SSS invisible, no
        // "iluminado sin límite".
        float atenSSS = ( uSSSCutoff > 0.0 && uSSSDecay > 0.0 )
            ? pow( saturate( 1.0 - distLuz / uSSSCutoff ), uSSSDecay )
            : 0.0;

        // Máscara del cono: sin esto brillarían por
        // contraluz también los elementos a los que el cono
        // no está apuntando.
        vec3 dirCono = normalize( ( viewMatrix * vec4( uSSSSpotDir, 0.0 ) ).xyz );
        float cosAng = dot( - lDir, dirCono );
        float mascaraCono = smoothstep( uSSSCosOuter, uSSSCosInner, cosAng );

        // Grosor aparente de la cáscara: 1 en la silueta (donde
        // N·V=0), 0 mirando la cara de frente (donde N·V=1).
        // (El comentario viejo decía lo contrario — ver FIX D,
        // más abajo.)
        //
        // FIX D (t=0.5, contraluz puro: luz/objeto/cámara
        // alineados — ver galeria-cono-luz.js, en esa pose
        // "vectorCamara" apunta perpendicular a la fila, el
        // ápex queda detrás de la fila sobre el eje de vista, y
        // "dot(vDir, -dirLT)" se acerca a 1 en TODA la
        // superficie: el lóbulo direccional "puntoLT" está en su
        // máximo pero se multiplica por "grosor = 0" en las
        // caras de frente, que es justo lo único que ve la
        // cámara ahí — la superficie queda mate con un anillo
        // estridente en la silueta, el peor contraste posible).
        //
        // La fórmula original "pow(1-|N·V|, falloff)" da 0
        // exacto en N·V=1, no importa el exponente (por eso
        // bajar thicknessFalloff 1.2→0.65 no alcanza solo).
        // Piso de 0.20 sobre el valor base: la superficie de
        // frente conserva 20% del lóbulo (visible, no opaca),
        // la silueta sigue con 100% (el efecto de borde se
        // preserva). El rango 0.15–0.25 es sano; subirlo
        // "aplana" el degradado hacia el borde, bajarlo
        // devuelve la opacidad en poses frontales.
        float grosorBase = pow( 1.0 - abs( dot( nDir, vDir ) ), uSSSThickness );
        float grosor = 0.20 + 0.80 * grosorBase;

        // Translucidez (Barré-Brisebois): el lóbulo se
        // desplaza con la normal para que el brillo siga la
        // forma en vez de ser un contorno plano.
        vec3  dirLT = lDir + nDir * uSSSDistortion;
        float puntoLT = pow( clamp( dot( vDir, - dirLT ), 0.0, 1.0 ), uSSSPower ) * uSSSScale;

        // La MÁSCARA DE CONO se aplica sólo al lóbulo
        // direccional, NO al piso: si no, "uSSSAmbient" —
        // que existe justamente para sostener la lectura de
        // la forma FUERA del contraluz — se apagaba en cero
        // apenas el cono apuntaba a otro elemento, y ningún
        // valor de config.sss podía levantarlo (todo iba
        // multiplicado por 0). Con penumbra 0.55 y el cono en
        // su ángulo mínimo (angleMin 0.25, ver
        // galeria-config.js) esa máscara es casi un corte
        // duro, así que el efecto era muy visible.
        /*
            FIX (encontrado auditando por qué se veía "opaco"/
            un velo parejo en TODA la fila, no sólo cerca del
            cono): "uSSSAmbient" estaba desacoplado de
            "mascaraCono" a propósito (ver el comentario de más
            arriba, de cuando el problema era el opuesto: se
            iba a negro fuera del cono) — pero sólo estaba
            gateado por "atenSSS", que es una atenuación por
            DISTANCIA al ápice del cono, no por si el cono
            apunta ahí. Con un "cutoff" de ~30 unidades (medido
            para cubrir el alcance real de la luz directa, ver
            galeria-cono-luz.js), ese piso llega a CASI TODA la
            fila por igual, sin importar hacia dónde mire el
            cono — cada elemento recibía el mismo brillo base
            constante, y eso es exactamente lo que se ve como
            "opaco"/sin contraste: nada se lee como
            genuinamente en sombra.

            No hay que volver a gatear "uSSSAmbient" del todo
            por "mascaraCono" (eso es lo que causaba el
            problema ANTERIOR: negro fuera del cono). El punto
            medio es un piso MENOR fuera del cono, no cero:
            "uSSSAmbientFueraCono" es la fracción de
            "uSSSAmbient" que queda cuando "mascaraCono" es 0 —
            suficiente para que la forma se siga leyendo en
            sombra, chico como para que el elemento realmente
            iluminado por el cono se note en contraste, no
            igual a todo el resto de la fila.
        */
        float ambientEfectivo =
            mix(
                uSSSAmbient * uSSSAmbientFueraCono,
                uSSSAmbient,
                mascaraCono
            );

        /*
            FIX A (t=0.5, contraluz puro): "ambientEfectivo"
            estaba DENTRO de la multiplicación por "grosor" —
            y en vista de frente "grosor" se iba a 0 (con la
            fórmula original), así que el único término pensado
            para sostener la lectura de la forma "fuera del
            contraluz" se apagaba exactamente donde más hacía
            falta. Se saca de esa multiplicación: el lóbulo
            direccional sigue concentrado por "grosor" (eso
            está bien, es lo que le da forma de translucidez
            real), pero el piso queda con su propia intensidad,
            sin depender de que el fragmento esté en la
            silueta.

            Con el piso de "grosor" (FIX D) el efecto de FIX A
            se atenúa, pero se deja igual por dos motivos:
            (a) conceptualmente el piso no debería depender
            del grosor aparente — es un término de
            "sostén" no de "forma"; (b) si en el futuro se
            calibra "grosorFloor" a 0 (vuelta al
            comportamiento estricto), FIX A sigue protegiendo
            la pose t=0.5.
        */
        float fLT = atenSSS * ( puntoLT * mascaraCono * grosor + ambientEfectivo );

        // Suma a la indirecta (no a gl_FragColor): así entra
        // ANTES del tone mapping y de la conversión de
        // espacio de color, como cualquier otra luz.
        // "diffuseColor.rgb" tiñe el SSS con el color propio
        // del elemento, sea el de estado, el del tema
        // (sólido) o el de normales.
        reflectedLight.indirectDiffuse +=
            diffuseColor.rgb * uSSSLightColor * ( fLT * uSSSStrength );
    }
`;


/*
    Se llama UNA vez, en createScene(), antes de construir
    ningún material. Guarda la referencia al keyLight (no
    copia: su posición/color los mutan in-place
    galeria-cono-luz.js y actualizarTemaLuces(), y
    actualizar() los lee de ahí cada frame) y siembra los
    parámetros del efecto desde config.sss.
*/
export function configurarSSS(config, keyLight) {

    keyLightRef = keyLight;
    cfgSSS = config.sss;
    temaRef = config.tema;

    uSSSDistortion.value = cfgSSS.distortion;
    uSSSPower.value      = cfgSSS.power;
    uSSSScale.value      = cfgSSS.scale;
    uSSSAmbient.value    = cfgSSS.ambient;
    uSSSAmbientFueraCono.value =
        cfgSSS.ambientFueraCono !== undefined
            ? cfgSSS.ambientFueraCono
            : 0.25;
    uSSSThickness.value  = cfgSSS.thicknessFalloff;
    uSSSStrength.value   = cfgSSS.strength;

}


/*
    Inyecta el SSS en un material ya construido. Se llama
    desde los DOS lugares donde nacen materiales de
    elemento: armarGroup3D() (galeria-escena.js, material
    inicial) y construirMaterial() /
    construirMaterialSolido() / construirMaterialNormales()
    (galeria-panel-material.js, al cambiar de tipo).

    ENCADENA onBeforeCompile en vez de pisarlo:
    construirMaterialSolido() ya trae el suyo (el override
    de color por gl_FrontFacing) y construirMaterialNormales()
    también — si acá se asignara uno nuevo a secas, esos
    materiales perderían su color. Los anclajes son
    distintos entre sí ("color_fragment" /
    "lights_physical_fragment" los de ellos,
    "lights_fragment_end" el de acá), así que las
    inyecciones conviven sin pisarse.

    "claveVariante": three.js CACHEA programas compilados y,
    salvo que el material defina customProgramCacheKey, dos
    MeshPhysicalMaterial con la MISMA configuración de
    defines comparten programa aunque sus onBeforeCompile
    inyecten GLSL distinto — con lo cual el segundo material
    se dibujaría con el shader del primero. Como los tres
    tipos de esta galería son todos MeshPhysicalMaterial y
    ahora cada uno inyecta algo distinto, hace falta una
    clave por variante.
*/
export function aplicarSSS(material, claveVariante = "sss") {

    const anterior = material.onBeforeCompile;

    material.onBeforeCompile = (shader, renderer) => {

        if (typeof anterior === "function") {

            anterior(shader, renderer);

        }

        shader.uniforms.uSSSLightPos   = uSSSLightPos;
        shader.uniforms.uSSSLightColor = uSSSLightColor;
        shader.uniforms.uSSSSpotDir    = uSSSSpotDir;
        shader.uniforms.uSSSCutoff     = uSSSCutoff;
        shader.uniforms.uSSSDecay      = uSSSDecay;
        shader.uniforms.uSSSCosOuter   = uSSSCosOuter;
        shader.uniforms.uSSSCosInner   = uSSSCosInner;
        shader.uniforms.uSSSDistortion = uSSSDistortion;
        shader.uniforms.uSSSPower      = uSSSPower;
        shader.uniforms.uSSSScale      = uSSSScale;
        shader.uniforms.uSSSAmbient    = uSSSAmbient;
        shader.uniforms.uSSSAmbientFueraCono = uSSSAmbientFueraCono;
        shader.uniforms.uSSSThickness  = uSSSThickness;
        shader.uniforms.uSSSStrength   = uSSSStrength;

        shader.fragmentShader =
            shader.fragmentShader
                .replace(
                    "#include <common>",
                    "#include <common>\n" + DECLARACION_UNIFORMS
                )
                .replace(
                    "#include <lights_fragment_end>",
                    "#include <lights_fragment_end>\n" + BLOQUE_SSS
                );

    };

    material.customProgramCacheKey = () => claveVariante;

    return material;

}


/*
    Una pasada por frame (galeria.js, mismo call site que
    actualizarCastShadow). Es BARATA Y DE COSTO CONSTANTE:
    cinco escrituras en total, no una por elemento — los
    uniforms son compartidos.

    Hay que rehacerla cada frame igual, porque el cono se
    mueve, apunta a otro elemento y RECALCULA SU DISTANCE
    todo el tiempo (ver galeria-cono-luz.js: distance =
    altura del cono + margen).
*/
export function actualizarSSS() {

    if (!keyLightRef) return;

    keyLightRef.updateWorldMatrix(true, false);
    uSSSLightPos.value.setFromMatrixPosition(keyLightRef.matrixWorld);

    uSSSLightColor.value.copy(keyLightRef.color);

    // Dirección luz→target, en mundo. El target es un
    // Object3D aparte que el cono mueve por su cuenta, así
    // que se lee su matriz de mundo, no su .position.
    if (keyLightRef.target) {

        keyLightRef.target.updateWorldMatrix(true, false);
        _tmpDir.setFromMatrixPosition(keyLightRef.target.matrixWorld);

    } else {

        _tmpDir.set(0, 0, 0);

    }

    uSSSSpotDir.value
        .subVectors(_tmpDir, uSSSLightPos.value)
        .normalize();

    uSSSCutoff.value = keyLightRef.distance || 0;
    uSSSDecay.value  = keyLightRef.decay;

    // smoothstep(exterior, interior, cos) necesita
    // exterior < interior: el coseno CRECE hacia el eje del
    // cono, así que el borde exterior es el coseno más
    // chico. "penumbra" 0 = corte duro, 1 = degradado desde
    // el eje — misma semántica que SpotLight.penumbra.
    //
    // OJO (ver más abajo, "Por qué solo el del medio se
    // ilumina"): con "cosExterior = cos(keyLight.angle)",
    // un elemento que cae EXACTAMENTE en el borde del cono
    // (cosAng = cos(angle)) recibe "mascaraCono = 0" por
    // construcción — smoothstep(a, b, a) = 0. Y "calcularRadio"
    // (galeria-cono-luz.js) dimensiona el cono justo para el
    // elemento más lejano con w>0, así que ese elemento cae
    // justo ahí. Se agrega un ensanchamiento opcional
    // ("uSSSMascaraFactor", ver galeria-config.js sss) — 1.0
    // desactiva, valores >1 ensanchan la máscara del SSS sin
    // tocar el cono real de la luz.
    const mascaraFactor = cfgSSS.mascaraFactor ?? 1.0;

    const cosExterior = Math.cos(keyLightRef.angle * mascaraFactor);
    const cosInterior = Math.cos(
        keyLightRef.angle * (1 - keyLightRef.penumbra) * mascaraFactor
    );

    uSSSCosOuter.value = cosExterior;
    uSSSCosInner.value =
        cosInterior > cosExterior ? cosInterior : cosExterior + 1e-4;

}


/*
    Día/noche — mismo "k" ya suavizado que actualizarTemaLuces()
    (galeria-escena.js) y conoLuz.actualizarTema(). El color NO
    se toca acá: uSSSLightColor sale del propio keyLight.color
    en actualizar(), y a ese ya lo tiñe actualizarTemaLuces().
    Solo se reescala la intensidad del efecto.
*/
export function actualizarTemaSSS(k) {

    if (!cfgSSS || !temaRef) return;

    /*
        FIX: esto decía "strength * (1 - 0.35 * k)" — usaba
        el "k" crudo donde refresh(k) de Maqueta.html usa el
        factor "day" YA INTERPOLADO entre los dos extremos
        del tema. No es lo mismo: "day" va de 0.0 (dark) a
        0.60 (bright), no de 0 a 1, así que en modo brillante
        el SSS quedaba en 0.65 de su valor en vez de 0.79 —
        se apagaba de más justo donde más se notaba.
    */
    const d =
        temaRef.dark.day +
        (temaRef.bright.day - temaRef.dark.day) * k;

    uSSSStrength.value = cfgSSS.strength * (1 - 0.35 * d);

}