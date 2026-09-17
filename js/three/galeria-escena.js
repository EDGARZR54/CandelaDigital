/* ==================================================
   galeria-escena.js

   Arma la escena de Three.js (cámara, luces, mesa y
   los "conos") a partir de un array de "elementos" ya
   normalizados (ver galeria-datos.js) y de CONFIG.

   Cada elemento indica en elemento.generadorId qué
   módulo de ./geometrias/ construye su geometría (ver
   normalizarElemento en galeria-config.js). Este
   módulo no sabe nada de edificios ni de fórmulas:
   importa el generador indicado, le pide una
   geometría y arma con ella un par de mallas
   (frontal/trasera, sin backface culling) más el
   color por estado que ya trae cada elemento.

   THREE se importa como módulo ES (ver el
   <script type="importmap"> de galeria.html).
================================================== */

import * as THREE from 'three';
import {
    findCenteredLookAtPrincipal,
    findFittedMagnitude,
    findHiddenDrop,
    projectToNdc,
    smoothstep
} from "./galeria-utils.js";
import { obtenerFuncionConstructora } from "./galeria-generadores.js";
import { IS_MOBILE_TIER } from "./galeria-dispositivo.js";
import { createHabitacion } from "./galeria-habitacion.js";
import { createLucesAdicionales, createLucesPorCaja } from "./galeria-luces.js";
import { createSombraContacto } from "./galeria-sombra-contacto.js";


// Generador de respaldo: se usa si un elemento no
// tiene generadorId propio, o si su import() falla.
// Debe existir como archivo en ./geometrias/.
const GENERADOR_RESPALDO = "cono-sinusoidal";

// Caché de módulos ya importados, por generadorId —
// evita reimportar si dos elementos comparten geometría.
const cacheGeneradores = new Map();

function cargarGenerador(generadorId) {

    const id = generadorId || GENERADOR_RESPALDO;

    if (cacheGeneradores.has(id)) {

        return cacheGeneradores.get(id);

    }

    const promesa =
        import(`./geometrias/${id}.js`)
            .catch(() => {

                return cargarGenerador(
                    GENERADOR_RESPALDO
                );

            });

    cacheGeneradores.set(id, promesa);

    return promesa;

}


/*
    Fondo/niebla de la escena siguen el tema
    claro/oscuro del sitio: se leen en vivo de las
    variables CSS --color-fondo/--color-fondo-alt (ver
    variables.css), igual que fondo-3d.js. El color de
    cada elemento (por estado, ESTADO_COLOR en
    galeria-config.js) es aparte y NO cambia con el
    tema. createScene() devuelve actualizarColoresTema()
    para recalcular esto sin recrear la escena (ver el
    MutationObserver en galeria.js).
*/

function leerColorCSS(variable, alternativo) {

    const valor =
        getComputedStyle(document.documentElement)
            .getPropertyValue(variable)
            .trim();

    return new THREE.Color(valor || alternativo);

}


function colorFondoEscena() {

    return leerColorCSS('--color-fondo', '#121212');

}


/*
    Normaliza una geometría RECIÉN CONSTRUIDA por un
    generador:

    - ALINEACIÓN POR CENTROIDE EN Z (reemplaza a la
      alineación "cara frontal a z=0" anterior): la
      traslada para que el CENTRO de su bbox en Z caiga
      en z=0 en su propio espacio local, en vez de su
      cara MÁS CERCANA A LA CÁMARA (bbox.max.z).

      Por qué el cambio: la alineación a cara frontal
      desplazaba el centroide en Z por
      -(bbox.min.z + bbox.max.z)/2, así que el slot —que
      vive siempre en z=0— dejaba de coincidir con el
      centroide de la geometría que lo ocupa. Todo el
      código que "apunta al elemento" desde su slot
      (empezando por el cono de luz, ver puntoDeDescanso
      en galeria-cono-luz.js, que copia pos.z tal cual,
      sin corrección alguna) quedaba descentrado en Z por
      esa diferencia. Con la alineación por centroide,
      slot.z ES el centroide: no hace falta ninguna
      corrección extra aguas abajo.

      Efecto colateral aceptado: las CARAS FRONTALES de
      elementos de distinta profundidad ya no quedan a
      paño entre sí (antes sí, por construcción). Se ven
      "escalonadas" en Z según la profundidad de cada
      uno. Para la composición de esta escena —donde la
      cámara mira mayormente de frente o levemente
      escorzada, y los elementos son volúmenes de
      cascarón, no placas— ese escalonamiento no molesta
      y a cambio se gana un anclaje coherente en las
      tres dimensiones.

      Nada más del pipeline depende de que la cara
      frontal esté en z=0: calculatePositions y
      verticesMundoDeFila leen bbox.min.z/bbox.max.z como
      EXTENSIÓN (siguen siendo correctos), y los pivotes
      de rotación (posicionarPivote, más abajo en este
      archivo, y el equivalente en galeria-carrusel.js)
      ya calculaban (min.z + max.z)/2 como centro — con
      la alineación nueva ese valor da 0, que es
      exactamente el centroide.

    - Recalcula bbox (ya alineado) y bounding sphere —
      Three.js nunca los recalcula solo por reemplazar
      "geometry".

    Devuelve también "desplazamientoBase" (cuánto subir
    el elemento en Y para que su punto más bajo quede en
    y=0), que createScene() usa para calcular un restY
    global que acomode a todos los elementos sin dejar a
    ninguno enterrado.

    Exportada para que galeria-panel-parametros.js
    aplique el mismo criterio al reconstruir la geometría
    del elemento enfocado (sliders de "Geometría"): al
    reemplazar la geometría de una malla en vivo, hay que
    volver a correr esta misma normalización para que el
    bbox/desplazamientoBase vigentes sigan coincidiendo
    con los que usa el resto de la escena.
*/
export function normalizarGeometriaElemento(geometry) {

    geometry.computeBoundingBox();

    /*
        ALINEACIÓN POR CENTROIDE EN Z (reemplaza a la
        alineación "cara frontal a z=0" anterior): se
        traslada la geometría para que el CENTRO de su bbox
        en Z caiga en z=0 local, en vez de su cara MÁS
        CERCANA A LA CÁMARA (bbox.max.z).

        Por qué el cambio: la alineación a cara frontal
        desplazaba el centroide en Z por
        -(bbox.min.z + bbox.max.z)/2, así que el slot
        (que vive siempre en z=0) dejaba de coincidir con
        el centroide de la geometría que lo ocupa. Todo el
        código que "apunta al elemento" desde su slot
        —empezando por el cono de luz (puntoDeDescanso en
        galeria-cono-luz.js, que copia pos.z tal cual, sin
        corrección)— quedaba descentrado en Z por esa
        diferencia. Con la alineación por centroide, slot.z
        ES el centroide: no hace falta ninguna corrección
        extra aguas abajo.

        Efecto colateral aceptado: las CARAS FRONTALES de
        elementos de distinta profundidad ya no quedan a
        paño entre sí (antes sí, por construcción). Se ven
        "escalonadas" en Z según la profundidad de cada
        uno. Para la composición de esta escena —donde la
        cámara mira mayormente de frente o levemente
        escorzada, y los elementos son volúmenes de
        cascarón, no placas— ese escalonamiento no molesta
        y a cambio se gana un anclaje coherente en las
        tres dimensiones.
    */
    const centroZ =
        (geometry.boundingBox.min.z +
         geometry.boundingBox.max.z) / 2;

    geometry.translate(0, 0, -centroZ);

    // Se recalcula DESPUÉS del translate: de acá en
    // más, todo el resto del código (desplazamientoBase,
    // verticesMundoDeFila, cajas de debug...) tiene que
    // ver el bbox YA alineado, no el original.
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const bbox = geometry.boundingBox;

    // Cuánto subir en Y para que el punto más bajo de
    // esta geometría quede en y=0 (no todas las fórmulas
    // están centradas en su propio eje).
    const desplazamientoBase = -bbox.min.y;

    return { bbox, desplazamientoBase };

}


async function prepararGeometria(elemento) {

    const modulo =
        await cargarGenerador(
            elemento.generadorId
        );

    /*
        Cada módulo de ./geometrias/ nombra su
        función constructora como quiere
        (crearGeometriaConoSinusoidal,
        crearGeometriaBovedaEstrellada,
        crearGeometriaCubiertaHypar, ...) — ver
        galeria-generadores.js.
    */
    const construirGeometria =
        obtenerFuncionConstructora(modulo);

    const geometry =
        construirGeometria();

    const { bbox, desplazamientoBase } =
        normalizarGeometriaElemento(geometry);

    return { modulo, geometry, bbox, desplazamientoBase };

}


/*
    Coloca (o recoloca) el pivote de rotación de un
    elemento en el centro real de su bbox (X/Z), y
    compensa la malla para que el resultado visual con
    rotation.y=0 no cambie (ver el porqué de este pivote
    separado en el comentario de armarGroup3D, más abajo).

    Exportada para que galeria-panel-parametros.js la
    vuelva a llamar cada vez que reconstruye la geometría
    del elemento enfocado: el centro del bbox puede
    correrse, y si nadie lo recalcula el pivote queda
    desalineado del bbox nuevo.
*/
export function posicionarPivote(pivote, malla, bbox) {

    const pivotX = (bbox.min.x + bbox.max.x) / 2;
    const pivotZ = (bbox.min.z + bbox.max.z) / 2;

    pivote.position.set(pivotX, 0, pivotZ);

    malla.position.set(-pivotX, 0, -pivotZ);

}


// Arma, para un elemento, el Group con UNA sola malla
// DoubleSide (sin backface culling — mismo efecto que
// antes lograban dos mallas FrontSide/BackSide
// superpuestas, ver fondo-3d.js para la versión vieja) a
// partir de una geometría YA construida por
// prepararGeometria().
//
// Antes eran DOS mallas por dos motivos, no uno solo:
// (a) evitar backface culling en una superficie abierta
// (DoubleSide lo resuelve igual de bien con una sola
// malla), y (b) permitir que el tipo de material
// "sólido" del panel de material pintara cada cara de un
// color distinto (algo que un material estándar no puede
// hacer solo — ver construirMaterialSolido() en
// galeria-panel-material.js, que ahora lo logra con un
// parche de shader sobre gl_FrontFacing en esta única
// malla).
function armarGroup3D(elemento, modulo, geometry, matCfg) {

    const color =
        new THREE.Color(
            elemento.color.r / 255,
            elemento.color.g / 255,
            elemento.color.b / 255
        );

    const material =
        new THREE.MeshPhysicalMaterial({
            color,
            roughness: matCfg.roughness,
            metalness: matCfg.metalness,
            clearcoat: matCfg.clearcoat,
            clearcoatRoughness:
                matCfg.clearcoatRoughness,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 1
        });

    const malla =
        new THREE.Mesh(geometry, material);

    // Valor de ARRANQUE nomás: a partir del primer frame lo
    // gobierna actualizarCastShadow() (más abajo, una pasada
    // por frame) según si el elemento tiene alguna parte por
    // encima del piso. Arranca en true para que un elemento
    // ya asentado proyecte sombra desde el frame 0, sin
    // esperar a la primera pasada.
    malla.castShadow = true;


    /*
        Pivote de rotación separado del grupo de
        posicionamiento: "group" (más abajo) se coloca vía
        cone.position.set(x, desplazamientoBase + slot.y, z)
        (ver galeria-revelado.js/galeria-reordenar.js/
        galeria-carrusel.js — cada uno usa la base propia de
        ESTE elemento, no un "restY" compartido) con origen
        en el punto de ANCLAJE de la geometría (cara frontal
        en z=0 — ver prepararGeometria), no en el centro del
        bbox. Girar "group"
        directamente rotaría alrededor de ese anclaje, y
        si no coincide con el centro real, el objeto
        "orbita" en vez de girar en el lugar.

        La malla cuelga de un grupo intermedio
        ("pivote"), corrido al centro real del bbox en
        X/Z, y compensado en sentido contrario en la
        malla — así el resultado visual con rotación 0
        no cambia, pero rotation.y gira alrededor del
        centro real.

        "geometry.boundingBox" ya está calculado desde
        prepararGeometria() (incluye el translate de la
        cara frontal) — no hace falta recomputarlo acá.
    */
    const pivote = new THREE.Group();

    posicionarPivote(
        pivote, malla,
        geometry.boundingBox
    );

    pivote.add(malla);


    const group = new THREE.Group();

    group.add(pivote);


    /*
        Referencias que usa galeria-panel-parametros.js
        para reconstruir geometría y material en vivo
        (sliders de "Geometría", overlay de malla), y
        galeria-corte.js para el corte por planos, sin que
        este módulo sepa nada de ninguno de los dos.
        "indice" (= elemento.indice, el mismo cupID que
        indexa bboxesPorIndice más abajo) le permite a ese
        panel actualizar la entrada correspondiente tras
        reconstruir — si no, galeria-carrusel.js/
        galeria-zoom.js/las cajas de debug seguirían
        viendo el bbox con el que se armó la escena la
        primera vez.

        "mallas" sigue siendo un ARRAY (de un solo
        elemento) a propósito, no "malla" a secas: minimiza
        el diff en los módulos que ya lo desestructuran
        como "const [mallaFrontal, mallaTrasera] =
        group.userData.mallas" — ahora es
        "const [malla] = group.userData.mallas".
    */
    group.userData.modulo = modulo;
    group.userData.mallas = [malla];
    group.userData.pivote = pivote;
    group.userData.color = color;
    group.userData.matCfg = matCfg;
    group.userData.indice = elemento.indice;


    /*
        YA NO HAY proxy ".material" acá: existía para que
        galeria-revelado/galeria-carrusel pudieran escribir
        "cone.material.opacity = x" sin saber que por dentro
        hay un Group con una malla, no un Mesh directo, y de
        paso empujaba ese mismo valor al overlay de malla
        (ver galeria-panel-material.js). Ninguna fase le
        escribe hoy un valor distinto de 1 (el gradiente de
        opacidad por distancia al foco se sacó del carrusel;
        revelado ya la fija en 1 sin animarla), así que el
        proxy quedó multiplicando siempre por 1 — código
        muerto. Si algún día vuelve a hacer falta animar
        opacidad por fase, se escribe directo sobre
        "group.userData.mallas[0].material.opacity" (el
        mismo camino que ya usa galeria-panel-material.js
        para sus propios cambios de tipo de material).
    */


    return group;

}


/*
    Arma, para TODA la fila, la lista de vértices de
    bounding box en coordenadas de MUNDO (8 por elemento)
    que necesita findCenteredLookAtPrincipal() para centrar
    el conjunto por su silueta proyectada real, no por el
    punto central de cada slot.

    "preparados[i].bbox" está en el espacio LOCAL de cada
    geometría; para llevarlo a mundo se le suma la posición
    del slot (positions[i]) y la altura de PISO PROPIA de
    ESE elemento (preparados[i].desplazamientoBase) en Y —
    mismo criterio de posicionamiento que usan
    galeria-revelado.js/galeria-reordenar.js cuando un
    elemento está en su lugar de reposo (ver el comentario
    grande en normalizarGeometriaElemento sobre por qué no
    se puede usar un "restY" único compartido: no todas las
    geometrías nacen con su punto más bajo en y=0, así que
    un restY global —el peor caso entre todas— dejaba
    flotando a cualquier elemento menos "profundo" que ese
    peor caso). Se arma sobre TODOS los elementos sin
    importar fase/visibilidad: el reencuadre es por el
    conjunto completo, nunca por objeto. "positions" ya trae
    el reparto en el eje principal vigente ("x" fila
    horizontal / "y" columna vertical, ver
    calculatePositions), así que esta función sirve para los
    dos modos sin distinción.

    El eje secundario ("ejeSecundario") se centra distinto
    según cuál sea: en Y (modo horizontal) es un PAÑO físico
    real — cada elemento aporta su coordenada local cruda
    encima de SU PROPIA base, sin centrar ("apoyado en el
    piso"). En X (modo vertical) no hay equivalente físico de
    piso para el costado, así que se centra por CENTROIDE: se
    resta a cada coordenada local su propio pivote en ese eje,
    para que el centro real del bbox de cada elemento —no su
    origen local, que puede no coincidir si la geometría es
    asimétrica— caiga sobre la misma línea (slot.x, compartida
    por todos).
*/
function verticesMundoDeFila(preparados, positions, ejeSecundario) {

    const vertices = [];

    preparados.forEach((preparado, i) => {

        const { bbox, desplazamientoBase } = preparado;
        const slot = positions[i];

        const pivotSecundario =
            (bbox.min[ejeSecundario] +
                bbox.max[ejeSecundario]) / 2;

        [bbox.min.x, bbox.max.x].forEach(lx => {

            [bbox.min.y, bbox.max.y].forEach(ly => {

                [bbox.min.z, bbox.max.z].forEach(lz => {

                    const punto = {
                        x: slot.x + lx,
                        y: desplazamientoBase + slot.y + ly,
                        z: slot.z + lz
                    };

                    if (ejeSecundario === "x") {

                        punto.x =
                            slot.x + (lx - pivotSecundario);

                    }

                    vertices.push(punto);

                });

            });

        });

    });

    return vertices;

}


/*
    Utilidad de debug: dibuja un bounding box (esquinas
    "min"/"max" en coordenadas de MUNDO) como una caja
    semitransparente + aristas — para ver a ojo, en la
    propia escena, qué bounding box está usando de
    verdad el cálculo de centrado (ver
    DEBUG_BOUNDING_BOXES/dibujarCajasDebug más abajo).
*/
function crearCajaDebug(min, max, color, opacidad) {

    const size = {
        x: max.x - min.x,
        y: max.y - min.y,
        z: max.z - min.z
    };

    const center = {
        x: (min.x + max.x) / 2,
        y: (min.y + max.y) / 2,
        z: (min.z + max.z) / 2
    };

    const grupo = new THREE.Group();

    const geo =
        new THREE.BoxGeometry(size.x, size.y, size.z);

    const mat =
        new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: opacidad,
            depthWrite: false,
            side: THREE.DoubleSide
        });

    grupo.add(new THREE.Mesh(geo, mat));

    const geoAristas =
        new THREE.EdgesGeometry(geo);

    const matAristas =
        new THREE.LineBasicMaterial({ color });

    grupo.add(
        new THREE.LineSegments(geoAristas, matAristas)
    );

    grupo.position.set(
        center.x, center.y, center.z
    );

    return grupo;

}


export async function createScene(
    container, elementos, config,
    // Getter opcional: devuelve { top, bottom } en PÍXELES
    // CSS del espacio que NO puede ocupar la geometría —
    // navbar arriba, botones de orden (+ su margen) abajo.
    // Se lee en vivo (mismo criterio que getHiddenDrop()):
    // esos elementos de UI pueden cambiar de alto con el
    // tema/viewport. Sin esto (default), se comporta
    // exactamente como antes — margen 0, banda completa.
    // Solo importa en modo vertical (retrato): en
    // horizontal la fila nunca usó el alto completo, así
    // que este margen no tiene nada que recortar ahí.
    getMargenVerticalPx = () => ({ top: 0, bottom: 0 }),
    // Getter opcional: devuelve { left, right } en PÍXELES
    // CSS del espacio que el navbar reserva a los costados
    // para que su propio texto/botón tengan margen — NO es
    // "hasta dónde llega el navbar en pantalla" (eso casi
    // siempre es el ancho completo), es el margen INTERNO
    // que ese contenido necesita. Se lee en vivo, mismo
    // criterio que getMargenVerticalPx. Sin esto (default),
    // se comporta exactamente como antes — margen 0, fila
    // ajustada borde a borde de pantalla. Solo importa en
    // modo horizontal: en vertical el ancho nunca fue la
    // restricción (ver calcularTargetPrincipal más abajo).
    getMargenHorizontalPx = () => ({ left: 0, right: 0 })
) {

    const scene =
        new THREE.Scene();

    // Fondo y niebla, calculados en vivo desde
    // --color-fondo (colorFondoEscena() arriba) —
    // actualizarColoresTema() (devuelta más abajo) los
    // recalcula si el visitante cambia de tema.
    scene.background =
        colorFondoEscena();

    /*
        Se usa FogExp2 (caída exponencial suave desde la
        cámara) en vez de Fog lineal (sin efecto hasta
        "near", full opaco recién en "far"): son curvas de
        caída distintas, y con Fog lineal se nota sobre
        todo en los elementos del fondo de la fila.

        RIESGO A VIGILAR (motivo por el que un near/far
        dinámico sigue siendo una alternativa válida, ver
        config.scene.fog): con las cajas de prueba de la
        maqueta, distMax (cámara → punto más lejano de la
        fila) rondaba las 13-14 unidades; con contenido real
        más grande la distancia real puede superar eso por
        bastante (mismo motivo por el que hubo que subir
        camera.far y agrandar la sala dinámicamente, ver
        esos comentarios) — con una density FIJA calibrada al
        tamaño de prueba de la maqueta, una fila real mucho
        más ancha podría quedar "devorada" por la niebla antes
        de tiempo, igual que pasaría con un near/far fijo (ver
        el comentario en config.scene.fog). Se deja igual a la
        maqueta por ahora, a revisar a ojo con contenido real.
    */
    scene.fog =
        new THREE.FogExp2(
            scene.background.getHex(),
            config.scene.fog.density
        );

    const FOG_DENSITY_BASE = config.scene.fog.density;


    const aspect =
        container.clientWidth /
        container.clientHeight;

    const camera =
        new THREE.PerspectiveCamera(
            config.camera.fov,
            aspect,
            config.camera.near,
            config.camera.far
        );

    // Posición X real: se fija más abajo, una vez
    // conocido el bbox real de la fila (depende de
    // cargar los generadores, async). Acá sólo Y/Z
    // (fijos); X arranca en el valor de respaldo de
    // config para el caso de fila vacía.
    camera.position.set(
        config.camera.position.x,
        config.camera.position.y,
        config.camera.position.z
    );


    const PIXEL_RATIO =
        Math.min(window.devicePixelRatio, 2);

    /*
        Mismo criterio que Maqueta.html: con devicePixelRatio
        ya en 2 (la mayoría de las pantallas de celular), el
        antialiasing por MSAA es en gran parte redundante con
        el supersampling que ya da ese pixelRatio, y cuesta
        caro. Se apaga en ese caso — depende del pixelRatio
        real de la pantalla, no de IS_MOBILE_TIER (un monitor
        de escritorio con pixelRatio 1 sigue queriendo
        antialias aunque el hardware sea modesto).
    */
    const USE_ANTIALIAS =
        PIXEL_RATIO < 2;

    const renderer =
        new THREE.WebGLRenderer({
            antialias: USE_ANTIALIAS
        });

    renderer.setPixelRatio(PIXEL_RATIO);

    /*
        Sin esto (renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;, tal como los
        setea la maqueta) el renderer queda con NoToneMapping
        (el default de Three.js): highlights de las luces
        (sobre todo el keyLight a intensidad 6.5, ver
        config.lights.key) se recortan en vez de comprimirse
        con curva ACES, y el color sale en el espacio de
        trabajo lineal en vez de sRGB — se ve más plano/lavado
        que en la maqueta.

        "outputColorSpace"/"SRGBColorSpace", no
        "outputEncoding"/"sRGBEncoding": esta versión de three
        (0.169.0, ver import map de galeria.html) ya renombró
        esa API — "outputEncoding" fue removida, no solo
        deprecada.
    */
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type =
        IS_MOBILE_TIER
            ? THREE.PCFShadowMap
            : THREE.PCFSoftShadowMap;

    /*
        SOMBRA "DIRTY": por defecto Three.js recalcula el
        shadow map completo en CADA renderer.render(), sin
        importar si algo que proyecta sombra se movió desde
        el frame anterior. Con autoUpdate=false, el shadow map
        queda CONGELADO salvo que alguien pida explícitamente
        un recálculo con needsUpdate=true.

        "marcarSombraDirty()" la llama cualquier código que
        mueva/rote/escale una malla con castShadow=true (ver
        los call sites en galeria.js: reveal/rotation/reorder/
        carousel). "prepararRenderDeSombra()" hay que llamarla
        SIEMPRE, inmediatamente antes de cada
        renderer.render(scene, camera) — nunca en otro
        momento, o un needsUpdate pendiente queda sin aplicar
        y la sombra se ve vieja/pegada hasta el próximo marcado.

        Arranca en `true` (sombraDirty) porque el primer frame
        sí necesita un shadow map real: todavía no se pintó
        ninguno.
    */
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;

    let sombraDirty = true;

    function marcarSombraDirty() {

        sombraDirty = true;

    }

    function prepararRenderDeSombra() {

        if (sombraDirty) {

            renderer.shadowMap.needsUpdate = true;
            sombraDirty = false;

        }

    }

    // Habilita que "material.clippingPlanes" (ver
    // galeria-corte.js) recorte geometría — sin esto
    // Three.js los ignora. "local" (no "global") porque
    // cada elemento define sus propios 3 planos según SU
    // bbox. No hace falta "stencil: true": este corte no
    // arma tapa rellena, solo recorta.
    renderer.localClippingEnabled = true;

    container.appendChild(
        renderer.domElement
    );


    /*
        Habitación atmosférica (piso + pared, ver
        galeria-habitacion.js). Se crea acá porque necesita
        "renderer" (para el anisotropy máximo de las
        texturas) ya armado, y "scene" para poder agregarse.

        SACADA (ver Maqueta.html): la "mesa" (plano
        ShadowMaterial invisible que existía acá antes,
        aparte de la habitación) — "roomFloor" es ahora el
        ÚNICO receptor de la sombra real de "keyLight"
        (receiveShadow=true, ver galeria-habitacion.js). Un
        ShadowMaterial invisible solo puede OSCURECER, nunca
        mostrar la "piscina de luz" (el parche más iluminado
        donde el cono del spot toca el piso, que sí puede
        verse en un MeshPhysicalMaterial real como
        roomFloor) — y al convivir casi coincidente con
        roomFloor, duplicaba el receptor de sombra sobre
        (casi) el mismo plano sin aportar nada.
    */
    const habitacion =
        createHabitacion(scene, renderer, config);

    /*
        Luces adicionales (rim/hemisferios/cálido-frío, ver
        galeria-luces.js) — puramente aditivas, no tocan
        ambient/key/fill de más abajo.
    */
    const lucesAdicionales =
        createLucesAdicionales(scene, config);


    /*
        Luces
    */

    const ambientCfg = config.lights.ambient;

    const ambient =
        new THREE.AmbientLight(
            ambientCfg.color,
            ambientCfg.intensity
        );

    scene.add(ambient);


    const keyCfg = config.lights.key;

    const keyLight =
        new THREE.SpotLight(
            keyCfg.color,
            keyCfg.intensity,
            keyCfg.distance,
            keyCfg.angleMax,
            keyCfg.penumbra,
            keyCfg.decay
        );

    // Posición/target de RESPALDO (fila vacía) — con
    // contenido real, createConoLuz() (galeria-cono-luz.js)
    // los recalcula cada frame; ver el comentario grande en
    // config.lights.key.
    keyLight.position.set(
        keyCfg.position.x,
        keyCfg.position.y,
        keyCfg.position.z
    );

    keyLight.target.position.set(
        keyCfg.target.x,
        keyCfg.target.y,
        keyCfg.target.z
    );

    keyLight.castShadow = true;

    /*
        Gama media/baja: mapa de sombra más chico (mismo
        precedente que Maqueta.html, 1024->512). Se usa
        Math.min contra el valor de config en vez de un 512
        fijo, para que si algún día config.lights.key.
        shadowMapSize baja de 512 por otro motivo, el tier
        móvil no lo suba de nuevo.
    */
    const shadowMapSize =
        IS_MOBILE_TIER
            ? Math.min(512, keyCfg.shadowMapSize)
            : keyCfg.shadowMapSize;

    keyLight.shadow.mapSize.set(
        shadowMapSize,
        shadowMapSize
    );

    /*
        A diferencia de DirectionalLight (frustum ortográfico
        manual, left/right/top/bottom, que este proyecto
        calibraba a mano contra el ancho real de la fila —
        función ya retirada), el shadow camera de SpotLight
        es una PerspectiveCamera cuyo FOV deriva
        AUTOMÁTICAMENTE de "keyLight.angle" en cada
        actualización del shadow map — no hace falta
        recalcularlo a mano. Solo hacen falta near/far.
    */
    keyLight.shadow.camera.near =
        keyCfg.shadowCameraNear;
    keyLight.shadow.camera.far =
        keyCfg.shadowCameraFar;

    keyLight.shadow.bias =
        keyCfg.shadowBias;
    keyLight.shadow.normalBias =
        keyCfg.shadowNormalBias;

    scene.add(keyLight);
    scene.add(keyLight.target);


    // El piso real (roomFloor, ver createHabitacion más
    // arriba) ya existe a esta altura — no hace falta armar
    // nada más acá.

    // Geometrías: un módulo procedural por elemento (ver
    // prepararGeometria arriba). Se resuelven todas en
    // paralelo porque import() es asíncrono, y porque el
    // espaciado de la fila necesita el bbox real de cada
    // una antes de poder fijar "positions".
    const preparados =
        await Promise.all(
            elementos.map(prepararGeometria)
        );

    /*
        bbox de cada elemento, indexado por
        "elemento.indice" (el mismo "cupID" que usa
        galeria-reordenar.js en su "order" —
        elemento.indice === su posición en "elementos",
        ver normalizarElemento en galeria-config.js).

        Insumo de computeLookAtX()/dibujarCajasDebug()
        más abajo: a diferencia de "positions" (los
        slots físicos, fijos), permite reconstruir la
        silueta real de la fila para CUALQUIER orden de
        ocupación, no solo el orden crudo inicial.
    */
    const bboxesPorIndice =
        preparados.map(p => p.bbox);

    // restY global: el mayor desplazamientoBase entre
    // todos los elementos, para que ninguno quede
    // enterrado en la mesa (cada geometría tiene su
    // propia proporción; los más "bajos" pueden quedar
    // levemente flotando).
    const restY =
        preparados.reduce(
            (max, p) =>
                Math.max(max, p.desplazamientoBase),
            0
        );


    /*
        Posiciones de la fila para el orden CRUDO
        (índice = elemento.indice). Se usa acá adentro
        solo como aproximación de bootstrap: cameraPos,
        fog y el frustum de sombra dependen del ANCHO
        TOTAL de la fila, que es casi invariante ante una
        permutación de los mismos elementos (ver
        "cameraPos" más abajo). Para posicionar cada
        elemento de verdad, centrar la cámara y dibujar
        las cajas de debug hace falta el layout real de
        CUALQUIER orden dado, no el de este orden crudo
        — ver computeRowPositions, justo abajo.

        Usa el bounding box en X de cada geometría
        (preparados[i].bbox) para separar cada par de
        elementos lo justo y necesario sin colisionar —
        ver calculatePositions al final del archivo.
    */

    /*
        Eje principal del layout ("x" = fila horizontal;
        "y" = columna vertical, portrait) y eje secundario
        de CÁMARA (el que queda casi fijo en
        cameraPosFromMagnitud, más abajo).

        CONECTADO a "aspect < 1" — mismo criterio ("retrato")
        que ya usa calcularMagnitudRasante más abajo.

        "ejePrincipal" y todo lo que depende de él (ver
        calcularLayoutDeFila, más abajo) son mutables:
        manejarPosibleCambioDeOrientacion(), expuesta en el
        retorno de createScene, los recalcula cuando
        galeria.js detecta (en cada resize/orientationchange/
        fullscreenchange, con debounce) un cruce real
        horizontal↔vertical.
    */
    let ejePrincipal;
    let ejeSecundarioCamara;
    let positions;
    let worldVertices;
    let magnitudPrincipal;
    let centroPrincipal;
    let lookAtYReal;

    // Semiancho real de la fila (X literal, no
    // "ejePrincipal") — ya no lo consume nada: antes
    // alimentaba actualizarFrustumSombra() (retirada, ver el
    // comentario junto al keyLight: con SpotLight el shadow
    // camera ya no necesita un frustum ortográfico calibrado
    // a mano). Se deja calculado por si vuelve a hacer falta
    // (p. ej. para calibrar algo del cono de luz a futuro),
    // no cuesta nada mantenerlo.
    let anchoFilaActual = 0;

    /*
        Layout real de la fila para un "order" dado — usa el
        "ejePrincipal" VIGENTE (variable mutable, ver arriba):
        quien reordena/revela/arma el carrusel llama siempre
        a ESTA función (nunca a "positions" crudo) para que un
        cruce de orientación se refleje solo, sin que
        galeria-reordenar.js/galeria-revelado.js/
        galeria-carrusel.js tengan que enterarse de nada — su
        propio "ejePrincipal" (recibido como prop en su
        construcción) sigue siendo el que decide CÓMO leer
        estas posiciones (from/to, dirección de cascada,
        etc.), pero el layout FÍSICO en sí ya viene resuelto
        con el eje correcto.

        Hace falta porque el gap entre vecinos que arma
        calculatePositions depende del ancho real de quien
        ocupa cada slot: en cuanto otro elemento (de ancho
        distinto) pasa a ocupar ese slot —cosa que ya pasa
        desde el arranque, ver galeria-reordenar.js—
        "positions" (más abajo) deja de ser válido para ese
        order. Quien reordena debe llamar a esta función cada
        vez que "order" cambia y usarla también como fuente
        de "positions", no solo de "order".
    */
    function computeRowPositions(order) {

        return calculatePositions(
            order.map(cupID => bboxesPorIndice[cupID]),
            config.row.spacing,
            ejePrincipal
        );

    }

    /*
        calcularLayoutDeFila(): arma/rearma TODO lo que
        depende de "ejePrincipal" — se llama una vez al
        iniciar la escena y de nuevo cada vez que
        manejarPosibleCambioDeOrientacion() detecta un cruce
        real horizontal↔vertical. NO toca "preparados"/
        "bboxesPorIndice"/"restY" (arriba): esas son
        propiedades intrínsecas de la GEOMETRÍA de cada
        elemento (cargada async, una sola vez), no del
        layout — no dependen de para qué lado crece la fila.
    */
    function calcularLayoutDeFila() {

        const aspectVigente =
            container.clientWidth /
            container.clientHeight;

        ejePrincipal =
            aspectVigente < 1 ? "y" : "x";
        ejeSecundarioCamara =
            ejePrincipal === "x" ? "y" : "x";

        positions =
            calculatePositions(
                preparados.map(p => p.bbox),
                config.row.spacing,
                ejePrincipal
            );

        // Vértices de bounding box de TODA la fila, en
        // mundo — insumo del solver de centrado
        // (verticesMundoDeFila).
        worldVertices =
            verticesMundoDeFila(
                preparados, positions, ejeSecundarioCamara
            );

        /*
            Posición real de la cámara: más allá del extremo
            izquierdo del bbox real de la fila, en un
            desplazamiento POLAR (dx, dz) — magnitud
            proporcional al ancho total, ángulo fijo respecto
            al eje de la fila (ver "margenRasante"/
            "anguloVistaGrados" en galeria-config.js).
            Reemplaza a config.camera.position.x/z, que
            quedan solo como respaldo para fila vacía.
        */
        const xsFila =
            worldVertices.map(v => v.x);

        const loFila =
            worldVertices.length > 0 ? Math.min(...xsFila) : 0;
        const hiFila =
            worldVertices.length > 0 ? Math.max(...xsFila) : 0;

        anchoFilaActual = hiFila - loFila;

        /*
            "magnitudPrincipal"/"centroPrincipal": mismo par
            que "anchoFila" arriba, pero leídos sobre
            "ejePrincipal" en vez de X literal — alimentan el
            arco de cámara (cameraPosFromMagnitud, más abajo),
            que sí necesita saber sobre qué eje crece la fila.
            "anchoFila" (arriba) se DEJA como está (X literal):
            lo sigue usando la mesa y el frustum de sombra, que
            son del plano del piso (X/Z reales), no del eje de
            layout.
        */
        const coordsPrincipalFila =
            worldVertices.map(v => v[ejePrincipal]);

        const loPrincipal =
            worldVertices.length > 0 ? Math.min(...coordsPrincipalFila) : 0;
        const hiPrincipal =
            worldVertices.length > 0 ? Math.max(...coordsPrincipalFila) : 0;

        magnitudPrincipal = hiPrincipal - loPrincipal;
        centroPrincipal = (loPrincipal + hiPrincipal) / 2;

        /*
            lookAt del eje SECUNDARIO real: se usa la MEDIANA
            de la extensión de cada elemento en ese eje, no el
            punto medio entre el mínimo y máximo de toda la
            fila — tolerante a outliers como "protomartir".
        */
        const coordsSecundarioFila =
            worldVertices.map(v => v[ejeSecundarioCamara]);

        const topesPorElemento =
            preparados.map(p => {

                if (ejeSecundarioCamara === "y") {

                    return p.desplazamientoBase + p.bbox.max.y;

                }

                const pivotSecundario =
                    (p.bbox.min[ejeSecundarioCamara] +
                        p.bbox.max[ejeSecundarioCamara]) / 2;

                return (
                    p.bbox.max[ejeSecundarioCamara] -
                    pivotSecundario
                );

            });

        const topesOrdenados =
            [...topesPorElemento].sort((a, b) => a - b);

        const n = topesOrdenados.length;

        const medianaTope =
            n === 0
                ? 0
                : n % 2 === 1
                    ? topesOrdenados[(n - 1) / 2]
                    : (topesOrdenados[n / 2 - 1] +
                       topesOrdenados[n / 2]) / 2;

        const baseFila =
            worldVertices.length > 0
                ? Math.min(...coordsSecundarioFila)
                : 0;

        lookAtYReal =
            worldVertices.length > 0
                ? (baseFila + medianaTope) / 2
                : config.camera.lookAtY;

    }

    calcularLayoutDeFila();


    /*
        Utilidad de debug (activar con DEBUG_BOUNDING_BOXES):
        dibuja una caja semitransparente por elemento (bbox
        real, el que usa calculatePositions/
        verticesMundoDeFila) más una caja para el bbox TOTAL
        de la fila, para verificar a ojo el centrado.
        dibujarCajasDebug(order) se arma/rearma con el mismo
        "order" que usa computeLookAtX, así que muestra la
        silueta real para cualquier orden vigente en el GUI,
        no solo la del arranque.
    */

    const DEBUG_BOUNDING_BOXES = false;

    let gruposDebugElementos = [];
    let grupoDebugTotal = null;

    function limpiarCajasDebug() {

        gruposDebugElementos.forEach(grupo => {

            scene.remove(grupo);

        });

        gruposDebugElementos = [];

        if (grupoDebugTotal) {

            scene.remove(grupoDebugTotal);
            grupoDebugTotal = null;

        }

    }

    const paletaDebug = [
        0xff6b6b, 0x4ecdc4, 0xffe66d,
        0xa06bff, 0x6bffb8, 0xff9f4e
    ];

    function dibujarCajasDebug(order) {

        if (!DEBUG_BOUNDING_BOXES) return;
        if (order.length === 0) return;

        limpiarCajasDebug();

        /*
            Layout real para ESTE order — no el
            "positions" crudo (ver comentario grande de
            computeRowPositions más arriba): las cajas
            de debug tienen que mostrar la misma
            separación que el visitante ve en pantalla,
            calculada para quien REALMENTE ocupa cada
            slot en este momento.
        */
        const slots =
            computeRowPositions(order);

        const minsX = [], maxsX = [];
        const minsY = [], maxsY = [];
        const minsZ = [], maxsZ = [];

        order.forEach((cupID, i) => {

            const bbox = bboxesPorIndice[cupID];
            const slot = slots[i];

            // Base propia de ESTE elemento (misma cuenta que
            // normalizarGeometriaElemento), no "restY"
            // compartido — ver el comentario grande en
            // verticesMundoDeFila.
            const desplazamientoBase = -bbox.min.y;

            const pivotSecundario =
                (bbox.min[ejeSecundarioCamara] +
                    bbox.max[ejeSecundarioCamara]) / 2;

            const min = {
                x: slot.x + bbox.min.x,
                y: desplazamientoBase + slot.y + bbox.min.y,
                z: slot.z + bbox.min.z
            };

            const max = {
                x: slot.x + bbox.max.x,
                y: desplazamientoBase + slot.y + bbox.max.y,
                z: slot.z + bbox.max.z
            };

            // Mismo centrado por centroide que
            // verticesMundoDeFila cuando el eje secundario
            // es X (modo vertical) — ver ese comentario.
            if (ejeSecundarioCamara === "x") {

                min.x = slot.x + (bbox.min.x - pivotSecundario);
                max.x = slot.x + (bbox.max.x - pivotSecundario);

            }

            minsX.push(min.x); maxsX.push(max.x);
            minsY.push(min.y); maxsY.push(max.y);
            minsZ.push(min.z); maxsZ.push(max.z);

            const color =
                paletaDebug[i % paletaDebug.length];

            const grupo =
                crearCajaDebug(min, max, color, 0.18);

            scene.add(grupo);
            gruposDebugElementos.push(grupo);

        });

        const minTotal = {
            x: Math.min(...minsX),
            y: Math.min(...minsY),
            z: Math.min(...minsZ)
        };

        const maxTotal = {
            x: Math.max(...maxsX),
            y: Math.max(...maxsY),
            z: Math.max(...maxsZ)
        };

        grupoDebugTotal =
            crearCajaDebug(
                minTotal, maxTotal, 0xffffff, 0.06
            );

        scene.add(grupoDebugTotal);

    }

    const anguloVista =
        config.camera.anguloVistaGrados *
        Math.PI / 180;

    // Centro real de la fila sobre el eje principal —
    // ya calculado como "centroPrincipal" más arriba
    // (junto con "magnitudPrincipal"), generalizado para
    // no asumir X. Es el pivote del arco de cámara
    // (cameraPosFromMagnitud/setCameraLado): por
    // construcción simétrica, los puntos "más allá del
    // extremo derecho" e "izquierdo" quedan a la misma
    // distancia de este centro, sobre un mismo círculo.

    /*
        Lado vigente de la cámara: 0 = más allá del extremo
        DERECHO (arranque, fases "hero"/"proyecto"), 0.5 =
        vista de FRENTE, sin escorzo (fases "orden" y el
        arranque de "fichas"), 1 = alineado con el ancla del
        carrusel YA CERRADO (resto de "fichas"/"final").
        "revelado" recorre 0->0.5 (group shot parejo, sin
        oclusión); 0.5->1 (giro hacia el ancla) ocurre en
        paralelo con el doblez línea->círculo de "fichas"
        (ver galeria.js).

        Se guarda acá para que resize() y
        calcularMagnitudRasante() —que llaman a
        cameraPosFromMagnitud(m) sin pasar "t"— respeten el
        lado vigente en vez de asumir siempre el mismo
        extremo.
    */
    let ladoActual = 0;

    /*
        Magnitud SEPARADA, calibrada específicamente para la
        vista de FRENTE en horizontal (t=0.5, "orden") — ver
        el comentario grande junto a calcularArcoCamara, más
        abajo, y calcularMagnitudAnchoHorizontal(). Null hasta
        que se calcula por primera vez (después de la
        configuración inicial de cámara, más abajo en este
        archivo) — mientras sea null, calcularArcoCamara no
        mezcla nada (usa "m" tal cual), así que la primerísima
        vez que se necesita ANTES de que esto exista (la
        propia bisección que lo calcula, que llama a
        cameraPosFromMagnitud/calcularArcoCamara puertas
        adentro) no genera una dependencia circular. Solo
        aplica en horizontal — en vertical queda null para
        siempre, sin efecto.
    */
    let magnitudRasanteAncho = null;

    /*
        Geometría del CÍRCULO CERRADO del carrusel (el
        círculo azul de galeria-carrusel.js, una vez
        formado) y de la coordenada del ancla sobre
        "ejePrincipal" — necesarias para el tramo EXTRA
        del arco de cámara (t>0.5, ver
        calcularArcoCamara()/cameraPosFromMagnitud más
        abajo), que termina alineado con el ancla en vez
        de seguir el arco de encuadre de siempre.

        Son geometría del CARRUSEL (dependen del "order"/
        ancla vigentes, calculados en
        galeria-carrusel.js), no de la cámara en sí — por
        eso se reciben desde afuera vía
        actualizarSetupCarrusel(), más abajo, en vez de
        calcularse acá. galeria.js la llama cada frame de
        "fichas", justo después de carousel.update() (que
        es quien conoce el "order" vigente).

        Se cachean (no se recalculan solas) para que
        resize()/calcularMagnitudRasante() —que pueden
        llamar a cameraPosFromMagnitud() en cualquier
        momento, incluso fuera de "fichas"— tengan un
        valor razonable. "null" = todavía no se entró
        nunca a "fichas" en esta carga: el tramo extra cae
        de vuelta al comportamiento de siempre (alineado
        con el extremo de encuadre de siempre, sin ningún
        ancla que mirar) — ver el respaldo en
        calcularArcoCamara().
    */
    let circuloCerradoActual = null;
    let anclaPrincipalMundoActual = 0;

    // Coordenada X real del ancla en mundo (el círculo del
    // carrusel vive siempre en XZ) — la usa
    // calcularAnguloFinalVerde() más abajo, exclusiva del
    // tramo vertical t>0.5 (círculo verde). Mismo criterio de
    // cacheo que circuloCerradoActual/anclaPrincipalMundoActual.
    let anclaMundoXActual = 0;

    // lookAt con el que arrancó el tramo verde (t>0.5,
    // vertical) la última vez que se entró — null mientras no
    // se está en ese tramo. setCameraLado() lo usa para que el
    // cruce en 0.5 blendee hacia el horizonte fijo en vez de
    // saltar de golpe.
    let lookAtVerdeBase = null;

    // E: mismo mecanismo que lookAtVerdeBase, pero para el
    // resto del arco NARANJA (horizontal, t>0.5, o vertical
    // antes de cruzar al círculo verde): sin esto,
    // setCameraLado() seguía recalculando "lookAtFilaPlana"
    // con la búsqueda por bisección (findCenteredLookAtPrincipal)
    // en CADA llamada durante todo ese tramo, aunque el punto
    // que mejor centra la fila ya no varía de forma monótona
    // ahí — eso producía un salto de encuadre visible
    // (aprox. t≈0.737→0.894 en "fichas"). Se congela el valor
    // tal cual estaba al cruzar t=0.5 (a diferencia del tramo
    // verde, acá no hay un segundo punto al que blendear: el
    // acercamiento al ancla ya lo resuelve "extraBlend", más
    // abajo, por separado). null mientras t<=0.5.
    let lookAtNaranjaBase = null;

    function actualizarSetupCarrusel({ circuloCerrado, anclaPrincipalMundo, anclaMundoX }) {

        circuloCerradoActual = circuloCerrado;
        anclaPrincipalMundoActual = anclaPrincipalMundo;
        anclaMundoXActual = anclaMundoX;

    }

    /*
        calcularAnguloFinalVerde(radio): EQUIVALENTE a
        "anguloFinal" (ver calcularArcoCamara, más abajo),
        pero resuelto en el plano X-Z REAL, no en
        "(ejePrincipal, Z)".

        "anguloFinal" resuelve la alineación asumiendo que la
        cámara vive en el plano (ejePrincipal, Z) — cierto
        siempre en horizontal (donde ejePrincipal="x" YA ES
        ese plano), pero solo cierto en vertical HASTA
        "anguloIzquierda": después, la cámara pasa a vivir en
        el plano X-Z real (ver cameraPosFromMagnitud). El
        círculo del carrusel (y la línea centro-azul->ancla)
        vive SIEMPRE en X-Z, sea cual sea "ejePrincipal" — así
        que la alineación para el tramo verde tiene que
        resolverse con la coordenada X real de la ancla
        ("anclaMundoXActual", ver más arriba), no con
        "ejePrincipal".
    */
    function calcularAnguloFinalVerde(radio) {

        const cosAlineadoVerde =
            Math.max(-1, Math.min(1, anclaMundoXActual / radio));

        const anguloAlineadoFrenteVerde = Math.acos(cosAlineadoVerde);

        let anguloFinalVerde =
            Math.PI * 2 - anguloAlineadoFrenteVerde;

        while (anguloFinalVerde <= Math.PI / 2) {
            anguloFinalVerde += Math.PI * 2;
        }

        return anguloFinalVerde;

    }

    /*
        calcularArcoCamara(m): geometría del arco de
        cámara (radio + los tres ángulos de referencia)
        para la magnitud "m" — factorizado fuera de
        cameraPosFromMagnitud (antes vivía mezclado ahí
        adentro, calculado una sola vez con un solo uso)
        para poder reusar radio/ángulos también en la
        mezcla del lookAt (ver setCameraLado más abajo)
        sin repetir la fórmula dos veces.

        "Mismos radios" (solo HORIZONTAL): el radio del arco
        no sale de la fórmula de encuadre
        (magnitud·cos/sin(anguloVista) sobre
        magnitudPrincipal/2) sino que es la distancia real
        entre el centro del propio arco ("centroPrincipal",
        z=0) y el centro del círculo YA CERRADO del carrusel
        ("circuloCerradoActual"). La DIRECCIÓN del arco
        (anguloDerecha/Izquierda) no depende del radio — el
        ángulo de atan2 depende solo de la RAZÓN
        vz/vPrincipal, no de su escala. Sin círculo cerrado
        conocido todavía, se usa la fórmula de encuadre como
        respaldo.

        En VERTICAL el radio sigue siendo el de siempre
        (hypot(vPrincipal, vz)): no hay "mismos radios" ahí.

        anguloFinal: el ángulo donde la cámara queda
        ALINEADA con la línea que une el centro del
        círculo cerrado con el centroide del ancla —
        resuelto como intersección de esa recta (vertical
        en el sistema ejePrincipal/Z, pasa siempre por
        "ejePrincipal = anclaPrincipalMundoActual") con el
        círculo que recorre la cámara (centro
        "centroPrincipal", radio "radio"). Se toma el
        cruce que sigue el mismo sentido de giro creciente
        en el que la cámara ya venía barriendo desde
        "anguloIzquierda". Sin círculo cerrado conocido
        todavía, no hay nada con qué alinear: respaldo =
        "anguloIzquierda" (el tramo extra no gira nada,
        t>0.5 se queda clavado en el extremo de encuadre
        de siempre).
    */
    /*
        "margenRasante" es la distancia fija de cámara
        calibrada para la composición angulada de "hero"/
        "proyecto" (t≈0), donde por escorzo la fila ocupa
        poco ancho en pantalla. En "orden" (t=0.5, vista de
        FRENTE, sin escorzo) la misma fila necesita más ancho
        de cuadro para la misma distancia de cámara, así que
        "margenRasante" no alcanza ahí.

        "magnitudRasanteAncho" (calculada más abajo por
        bisección, igual que el fit-to-navbar vertical pero
        ajustando al ANCHO y evaluada en t=0.5) reemplaza a
        "m" de forma progresiva a medida que "t" se acerca a
        0.5: en t=0 da exactamente "m"; en t=0.5 ya es
        completamente "magnitudRasanteAncho". Más allá de
        t=0.5 ("fichas") se queda en ese valor hasta que
        "mismos radios" (ver "radio" más abajo) lo reemplaza
        apenas "circuloCerradoActual" esté disponible.

        En vertical "magnitudRasanteAncho" nunca se calcula
        (queda null) y el blend no se activa: el ajuste es
        específico del ancho en horizontal.
    */
    function calcularArcoCamara(m, t = ladoActual) {

        const mEfectiva =
            ejePrincipal === "x" && magnitudRasanteAncho !== null
                ? m + (magnitudRasanteAncho - m) *
                  smoothstep(Math.min(1, Math.max(0, t) / 0.5))
                : m;

        const magnitud = mEfectiva * magnitudPrincipal;

        const dx = magnitud * Math.cos(anguloVista);
        const dz = magnitud * Math.sin(anguloVista);

        const vPrincipal = magnitudPrincipal / 2 + dx;
        const vz = dz;

        const anguloDerecha = Math.atan2(vz, vPrincipal);
        const anguloIzquierda = Math.PI - anguloDerecha;

        /*
            "radio" usa siempre "radioAncho" (el de encuadre
            por ancho) para t<=0.5 ("orden" y antes), y recién
            para t>0.5 lo mezcla, con un smoothstep en la
            mitad opuesta del recorrido de "mEfectiva", hacia
            la distancia real al círculo cerrado del carrusel
            ("circuloCerradoActual"). "orden" queda así
            desacoplado de si ya se visitó "fichas" antes en
            la sesión o de qué tan vigente esté
            "circuloCerradoActual" (que solo se resetea en un
            cruce de orientación, ver
            manejarPosibleCambioDeOrientacion) — el radio se
            acerca al del carrusel de forma continua a medida
            que t avanza de 0.5 a 1, sin salto de zoom.
        */
        const radioAncho =
            Math.hypot(vPrincipal, vz);

        const radio =
            ejePrincipal === "x" && circuloCerradoActual
                ? radioAncho +
                  (Math.hypot(
                      centroPrincipal - circuloCerradoActual.x,
                      0 - circuloCerradoActual.z
                  ) - radioAncho) *
                  smoothstep(Math.max(0, (t - 0.5) / 0.5))
                : radioAncho;

        let anguloFinal = anguloIzquierda;

        if (circuloCerradoActual) {

            const cosAlineado =
                Math.max(-1, Math.min(1,
                    (anclaPrincipalMundoActual - centroPrincipal) / radio
                ));

            const anguloAlineadoFrente = Math.acos(cosAlineado);

            anguloFinal = Math.PI * 2 - anguloAlineadoFrente;

            while (anguloFinal <= anguloIzquierda) {
                anguloFinal += Math.PI * 2;
            }

        }

        return { radio, anguloDerecha, anguloIzquierda, anguloFinal };

    }

    /*
        Función PURA: no lee ni escribe "magnitudRasanteAncho",
        "circuloCerradoActual" ni ningún otro estado mutable —
        necesario porque findFittedMagnitude() la evalúa por
        bisección, y calcularMagnitudAnchoHorizontal() calcula
        justamente "magnitudRasanteAncho"; si esta función
        dependiera de ese mismo valor, cada candidato de la
        bisección devolvería la misma posición y la búsqueda
        no convergería.

        Replica exactamente la geometría que
        "cameraPosFromMagnitud(m, 0.5)" daría para una "m"
        cruda: a t=0.5 exacto "anguloActual" siempre es
        "anguloMedio" (π/2), así que alcanza con "radio"
        (independiente del blend y del círculo cerrado, que en
        horizontal recién existe en "fichas").
    */
    function posVistaDeFrenteParaAncho(m) {

        const magnitud = m * magnitudPrincipal;

        const dx = magnitud * Math.cos(anguloVista);
        const dz = magnitud * Math.sin(anguloVista);

        const vPrincipal = magnitudPrincipal / 2 + dx;
        const vz = dz;

        const radio = Math.hypot(vPrincipal, vz);

        const anguloMedio = Math.PI / 2;

        const pos = { x: 0, y: 0, z: radio * Math.sin(anguloMedio) };
        pos[ejePrincipal] = centroPrincipal + radio * Math.cos(anguloMedio);
        pos[ejeSecundarioCamara] =
            ejeSecundarioCamara === "y"
                ? config.camera.position.y
                : 0;

        return pos;

    }


    /*
        cameraPosFromMagnitud(m, t): arma un ARCO real
        alrededor de centroPrincipal y devuelve la
        posición sobre ese arco para "t" (0 = extremo
        derecho, 0.5 = vista de frente, 1 = alineado con
        el ancla del carrusel — ver el comentario grande
        de "ladoActual", más arriba). "m" es la magnitud
        (fracción del ancho de fila): la usan el camino
        normal (escritorio, m=margenRasante), el "fit to
        width" de celular (m por bisección) y "revelado"
        (m=magnitudRasante vigente, t=avance de la fase).

        "t" por defecto toma "ladoActual", así que
        cualquier llamada que no sepa nada de "lado"
        (resize(), la bisección de findFittedMagnitude)
        mantiene la posición angular vigente en vez de
        resetear al extremo derecho.
    */
    function cameraPosFromMagnitud(m, t = ladoActual) {

        if (worldVertices.length === 0) {

            return {
                x: config.camera.position.x,
                y: config.camera.position.y,
                z: config.camera.position.z
            };

        }

        const { radio, anguloDerecha, anguloFinal } =
            calcularArcoCamara(m, t);

        const anguloMedio = Math.PI / 2;

        /*
            "centroArco" tiene que ser "centroPrincipal" (el
            centro real de la fila, que escala con el
            contenido) y no un valor fijo como
            "config.camera.position.y": "calcularMagnitudRasante"/
            "findFittedMagnitude" asumen que el arco está
            anclado ahí para poder resolver, por bisección, una
            magnitud que encuadre dentro de la banda vertical
            real (navbar arriba, botones abajo — ver
            calcularTargetPrincipal más abajo). Con la cámara
            clavada en una altura arbitraria esa bisección
            pierde sentido y la fila se sale del cuadro.

            Como cos(anguloMedio)=cos(π/2)=0 exacto,
            "pos[ejePrincipal]" en t=0.5 da "centroArco" sin
            importar cuál sea su valor, así que usarlo acá no
            afecta la continuidad con el tramo t>0.5.
        */
        const centroArco =
            centroPrincipal;

        /*
            En vertical, más allá de la vista de frente
            (t>0.5), la cámara deja de recorrer el arco
            naranja (plano ejePrincipal-Z) y pasa a recorrer un
            CÍRCULO VERDE en el plano X-Z real — mismo radio
            "radio" (ver calcularArcoCamara, "mismos radios"),
            centrado en el origen de ese plano. "Y" queda FIJO
            en "centroArco" (el horizonte, ya alcanzado en
            t=0.5): no hay que seguir bajando/subiendo, solo
            "X"/"Z" giran.

            El ángulo arranca en π/2 (mismo valor que
            "anguloActual" trae del arco naranja en t=0.5 —
            ahí X=0 también, por construcción: cos(π/2)=0) y
            termina en "anguloFinalVerde" (alineado con el
            ancla, resuelto en X-Z real — ver
            calcularAnguloFinalVerde) en t=1, con
            "smoothstep" para que el arranque del giro en X no
            sea instantáneo (derivada 0 en t=0.5, continuo con
            el reposo que traía el arco naranja).

            En horizontal, sin cambios: sigue siendo el arco
            naranja de siempre para cualquier t.
        */
        if (ejePrincipal === "y" && t > 0.5) {

            const anguloFinalVerde =
                calcularAnguloFinalVerde(radio);

            const s = smoothstep((t - 0.5) / 0.5);

            const anguloVerde =
                anguloMedio + (anguloFinalVerde - anguloMedio) * s;

            const posVerde = {
                x: radio * Math.cos(anguloVerde),
                y: centroArco,
                z: radio * Math.sin(anguloVerde)
            };

            return posVerde;

        }

        /*
            "t" recorre el arco en dos mitades:
              - t<=0.5: derecho (anguloDerecha) -> FRENTE
                (anguloMedio=π/2, "group shot" sin escorzo,
                cos(π/2)=0 exacto — cámara centrada en el
                medio de la fila, todo el desplazamiento en Z,
                sin componente lateral).
              - t>0.5: FRENTE -> alineado con el ancla
                (anguloFinal, ver calcularArcoCamara). Solo
                aplica en HORIZONTAL — en vertical, t>0.5 ya
                salió por el "return" del círculo verde, más
                arriba.
        */
        const anguloActual =
            t <= 0.5
                ? anguloDerecha +
                  (anguloMedio - anguloDerecha) * (t / 0.5)
                : anguloMedio +
                  (anguloFinal - anguloMedio) * ((t - 0.5) / 0.5);

        /*
            El eje principal recorre el arco (varía con t); el
            eje secundario de cámara queda FIJO. En horizontal
            ese fijo es "y", tomado de
            "config.camera.position.y" — un valor real,
            calibrado a mano. "config.camera.position.x" no
            tiene ese mismo rol (solo es placeholder para la
            rama de fila vacía), así que cuando el secundario
            es "x" (modo vertical) se usa 0 en vez de
            "config.camera.position.x" — mismo valor "de
            frente, centrado" que usa "restSecundario" en
            galeria-carrusel.js.
        */
        const pos = { x: 0, y: 0, z: radio * Math.sin(anguloActual) };
        pos[ejePrincipal] = centroArco + radio * Math.cos(anguloActual);
        pos[ejeSecundarioCamara] =
            ejeSecundarioCamara === "y"
                ? config.camera.position.y
                : 0;

        return pos;

    }


    // Rango de búsqueda para findFittedMagnitude(), más
    // abajo — generoso a propósito (0.02 = cámara casi
    // pegada a la fila, 8 = carísimamente lejos) para no
    // forzar el resguardo de "sin cambio de signo" en un
    // caso con solución real (ver galeria-utils.js).
    const MAGNITUD_MIN = 0.02;
    const MAGNITUD_MAX = 8;

    /*
        Banda REAL disponible para la geometría sobre el eje
        PRINCIPAL vigente — en vez de siempre el cuadro NDC
        completo (-1 a 1):

        - ejePrincipal="y" (columna, retrato): navbar arriba,
          botones de orden (+ su margen) abajo.
        - ejePrincipal="x" (fila, horizontal): margen interno
          del navbar a izquierda/derecha (el que necesita su
          propio texto/botón) — sin este margen, ajustar la
          fila a pantalla completa la haría invadir ese
          espacio. "getMargenHorizontalPx" (0 por default,
          ver createScene) permite pasar el margen real.

        Conversión px -> NDC en Y: mismo sistema de
        coordenadas que ya usa getRowBottomScreenY (más
        abajo) al revés — NDC 1 (arriba) = píxel 0, NDC -1
        (abajo) = píxel clientHeight. En X no hace falta
        invertir: píxel 0 (izquierda) ya corresponde a NDC -1.
    */
    function calcularTargetPrincipal() {

        if (ejePrincipal === "y") {

            const { top, bottom } =
                getMargenVerticalPx();

            const h = container.clientHeight;

            if (!(h > 0)) {

                return { targetSize: 2, targetNdcCenter: 0 };

            }

            return {
                targetSize: 2 * (1 - (top + bottom) / h),
                targetNdcCenter: (bottom - top) / h
            };

        }

        if (ejePrincipal === "x") {

            const { left, right } =
                getMargenHorizontalPx();

            const w = container.clientWidth;

            if (!(w > 0)) {

                return { targetSize: 2, targetNdcCenter: 0 };

            }

            return {
                targetSize: 2 * (1 - (left + right) / w),
                targetNdcCenter: (left - right) / w
            };

        }

        return { targetSize: 2, targetNdcCenter: 0 };

    }

    /*
        Ventana VERTICAL (celular, o cualquier relación
        de aspecto angosta): el margenRasante fijo,
        calibrado para pantallas apaisadas, deja la fila
        recortada por los costados. Se resuelve por
        bisección la magnitud que hace que el ancho
        proyectado de la fila ocupe el cuadro completo
        (ver findFittedMagnitude en galeria-utils.js). Se
        reevalúa en cada resize() para que rotar el
        celular recalcule el encuadre correcto.
    */
    function calcularMagnitudRasante(aspectActual) {

        const retrato = aspectActual < 1;

        if (!retrato) return config.camera.margenRasante;

        const { targetSize, targetNdcCenter } =
            calcularTargetPrincipal();

        /*
            La fase que necesita este ajuste (evitar navbar/
            botones) es "orden", que descansa en t=0.5 (vista
            de frente, sin escorzo) — un ángulo distinto del de
            "hero" (t=0). Por eso se fija "t" a 0.5 siempre acá,
            sin importar qué "ladoActual" esté vigente cuando
            se dispare resize(): la magnitud queda resuelta
            contra la pose que "orden" (y el arranque de
            "fichas") necesitan que entre bien en el cuadro.
        */
        const cameraPosFromMagnitudVistaDeFrente =
            (m) => cameraPosFromMagnitud(m, 0.5);

        return findFittedMagnitude(
            cameraPosFromMagnitudVistaDeFrente,
            lookAtYReal,
            config.camera.lookAtZ,
            worldVertices,
            config.camera.fov,
            aspectActual,
            MAGNITUD_MIN,
            MAGNITUD_MAX,
            // cameraPosFromMagnitud y "lookAtYReal" (que se
            // lee sobre "ejeSecundarioCamara", no solo Y —
            // ver su cálculo más arriba) ya saben moverse/
            // leerse sobre cualquiera de los dos ejes.
            ejePrincipal,
            targetSize,
            targetNdcCenter
        );

    }

    /*
        Calcula, por bisección (mismo mecanismo que
        calcularMagnitudRasante usa para el alto en vertical,
        pero acá para el ANCHO en horizontal), la magnitud que
        hace entrar la fila en el ancho de pantalla disponible
        cuando la cámara está de FRENTE (t=0.5, fijo — la vista
        de "orden"). El target se resuelve con
        "calcularTargetPrincipal()", que en horizontal usa el
        margen real de "getMargenHorizontalPx" (0 por default,
        ver createScene) — mismo criterio que
        "calcularMagnitudRasante" usa para el margen vertical
        del modo columna.

        Solo tiene sentido en horizontal — no se llama nunca en
        vertical (ver los dos call-sites, junto a
        magnitudRasante).
    */
    function calcularMagnitudAnchoHorizontal(aspectActual) {

        const { targetSize, targetNdcCenter } =
            calcularTargetPrincipal();

        /*
            Ver el comentario grande junto a
            "posVistaDeFrenteParaAncho" (más arriba, junto a
            calcularArcoCamara): esta bisección usa esa
            función PURA en vez de
            "cameraPosFromMagnitud"/"calcularArcoCamara"
            porque esta última depende de "magnitudRasanteAncho"
            —el mismo valor que se está calculando—, así que
            cualquier candidato "m" que probara findFittedMagnitude
            terminaría dando siempre la misma posición (la del
            valor previo), con derivada nula y NaN/Infinity río
            abajo. Con una función sin ninguna variable
            compartida de por medio, ese ciclo no puede darse.
        */
        return findFittedMagnitude(
            posVistaDeFrenteParaAncho,
            lookAtYReal,
            config.camera.lookAtZ,
            worldVertices,
            config.camera.fov,
            aspectActual,
            MAGNITUD_MIN,
            MAGNITUD_MAX,
            ejePrincipal,
            targetSize,
            targetNdcCenter
        );

    }


    let magnitudRasante =
        calcularMagnitudRasante(aspect);

    // Solo tiene sentido en horizontal (ver el comentario
    // grande junto a calcularMagnitudAnchoHorizontal). Se
    // calcula DESPUÉS de "magnitudRasante" (que
    // calcularArcoCamara usa como respaldo/base del blend
    // mientras esto sea null) pero ANTES de la primera
    // posición de cámara real, para que ya esté disponible
    // si el arranque llega a necesitarlo.
    if (ejePrincipal === "x") {

        magnitudRasanteAncho =
            calcularMagnitudAnchoHorizontal(aspect);

    }

    let cameraPos =
        cameraPosFromMagnitud(magnitudRasante);

    camera.position.set(
        cameraPos.x, cameraPos.y, cameraPos.z
    );


    /*
        Fog: RETIRADO el recálculo de near/far contra la
        distancia real (ver el comentario grande junto a la
        construcción de scene.fog, más arriba) — FogExp2 no
        tiene near/far, solo "density" (fija, salvo por el
        propio sistema día/noche — ver actualizarTemaLuces()
        más abajo, que la modula igual que refresh(k) en la
        maqueta). No queda nada que recalibrar acá en resize
        ni en cruces de orientación.
    */


    /*
        Frustum de sombra del keyLight: RETIRADO. Con
        DirectionalLight hacía falta recalcular a mano el
        frustum ortográfico (left/right/top/bottom) contra el
        ancho real de la fila — con SpotLight (ver el
        comentario grande junto a la construcción de
        keyLight, más arriba) el shadow camera es una
        PerspectiveCamera cuyo FOV deriva solo de
        "keyLight.angle", recalculado cada frame por
        createConoLuz() (galeria-cono-luz.js) — no queda
        nada que recalibrar acá.
    */

    /*
        A (a pedido): recalcula el layout completo
        (ejePrincipal, positions, worldVertices, mesa,
        frustum de sombra) SOLO si el aspecto vigente cruzó
        el umbral horizontal↔vertical desde la última vez —
        pensada para que galeria.js la llame en cada
        resize/orientationchange/fullscreenchange (con
        debounce), y así reaccionar a girar el celular o
        entrar/salir de pantalla completa sin recargar la
        página.

        Devuelve {cambio:false} si no cruzó (el caso normal:
        la inmensa mayoría de los resizes —cambiar el ANCHO
        de una ventana ya angosta, por ejemplo— no cruzan el
        umbral) — ahí no hay nada más que hacer, el resize()
        de siempre ya alcanza. Si cruzó, devuelve
        {cambio:true, ejePrincipal} para que galeria.js sepa
        que tiene que recrear reorder/reveal/carousel con el
        eje nuevo: esos tres SÍ necesitan reconstruirse —
        cada uno decide, en su propia construcción, varias
        cosas que dependen del eje (dirección de cascada,
        uHat/vHat, etc.) que no se pueden simplemente
        "reasignar" sobre la instancia vieja sin rehacerlas
        desde cero.
    */
    function manejarPosibleCambioDeOrientacion() {

        const aspectVigente =
            container.clientWidth /
            container.clientHeight;

        const nuevoEjePrincipal =
            aspectVigente < 1 ? "y" : "x";

        if (nuevoEjePrincipal === ejePrincipal) {

            return { cambio: false };

        }

        calcularLayoutDeFila();

        /*
            Reset defensivo del estado de cámara ligado al
            carrusel/orientación anterior (ver
            "circuloCerradoActual"/"lookAtVerdeBase", más
            abajo en este archivo): con el layout recién
            rearmado, cualquier geometría de círculo cerrado/
            ancla que venía de ANTES del cruce ya no
            corresponde a nada real — galeria.js va a recrear
            "carousel" a continuación (fuera de este archivo,
            ver recrearControllersPorOrientacion en
            galeria.js), que recién vuelve a poblar esto la
            próxima vez que se entre a "fichas".
        */
        ladoActual = 0;
        circuloCerradoActual = null;
        anclaPrincipalMundoActual = 0;
        anclaMundoXActual = 0;
        lookAtVerdeBase = null;
        lookAtNaranjaBase = null;

        // "magnitudPrincipal"/"worldVertices" ya cambiaron en
        // calcularLayoutDeFila (arriba); resize(), que
        // galeria.js llama a continuación, recalcula
        // "magnitudRasanteAncho" — se limpia acá para no usar
        // mientras tanto un valor del eje anterior.
        magnitudRasanteAncho = null;

        return {
            cambio: true,
            ejePrincipal
        };

    }


    /*
        clearcoat en MeshPhysicalMaterial fuerza un pase
        extra de normales/reflexión en el shader — es de los
        features más caros del material, y se paga por CADA
        elemento de la fila (no es un costo fijo de escena).
        Gateado por IS_MOBILE_TIER, mismo precedente que
        shadowMapSize/dust.count: en mobile se arma un
        matCfg propio con clearcoat=0 (roughness/metalness
        se mantienen, son baratos) en vez de tocar
        config.material directamente — así desktop no se ve
        afectado y armarGroup3D no necesita saber de tiers.
    */
    const matCfg =
        IS_MOBILE_TIER
            ? {
                  ...config.material,
                  clearcoat: 0,
                  clearcoatRoughness: 0
              }
            : config.material;

    const cones =
        preparados.map(({ modulo, geometry }, i) => {

            const group =
                armarGroup3D(
                    elementos[i],
                    modulo,
                    geometry,
                    matCfg
                );

            scene.add(group);

            return group;

        });


    /*
        Fase 4 (lucesPorCaja, ver galeria-luces.js): recién
        acá existen "cones"/"bboxesPorIndice" — no se puede
        crear junto con "lucesAdicionales" más arriba, que
        se arma antes de que la fila exista.
    */
    const lucesPorCaja =
        createLucesPorCaja(
            config,
            {
                cones,
                bboxesPorIndice,
                elementCount: cones.length
            }
        );


    /*
        Fase 5 (sombra de contacto, ver
        galeria-sombra-contacto.js): mismas dependencias que
        lucesPorCaja — "bboxesPorIndice" alcanza para el
        chequeo "sobreElPiso" (base PROPIA de cada elemento,
        ya no un "restY" compartido).
    */
    const sombraContacto =
        createSombraContacto(
            scene,
            config,
            {
                cones,
                bboxesPorIndice,
                elementCount: cones.length
            }
        );


    /*
        El punto de mira en X se calcula solo, para
        que la fila quede centrada sin importar
        cuántos elementos haya (ver
        findCenteredLookAtPrincipal en galeria-utils.js).
    */

    const lookAtX =
        findCenteredLookAtPrincipal(
            cameraPos,
            lookAtYReal,
            config.camera.lookAtZ,
            worldVertices,
            config.camera.fov,
            aspect,
            ejePrincipal,
            calcularTargetPrincipal().targetNdcCenter
        );

    // Mismo criterio que setLookAtX (definida más abajo,
    // pero function declaration = hoisted): ubicar el
    // escalar ya resuelto en su eje de mundo correcto.
    setLookAtX(lookAtX);


    // MARGEN_NDC_OCULTO: colchón extra por debajo del
    // borde inferior real de pantalla (NDC.y=-1) al
    // calcular hiddenDrop, para que un elemento
    // "escondido" no quede apenas rozando el borde.
    // HIDDEN_DROP_MIN/MAX: rango de búsqueda para la
    // bisección de findHiddenDrop() — generoso a
    // propósito, mismo criterio que MAGNITUD_MIN/MAX.
    const MARGEN_NDC_OCULTO = 0.06;
    const HIDDEN_DROP_MIN = 0;
    const HIDDEN_DROP_MAX = 60;

    /*
        "puntosSuperioresFila" (y su gemelo
        "puntosInferioresFila" más abajo) son funciones
        de "order", no arrays fijos: a diferencia de
        cameraPos/fog/sombra (que solo dependen del ANCHO
        TOTAL de la fila, invariante ante una permutación),
        la altura de cada elemento en SU slot SÍ cambia
        con el order — cada elemento tiene su propia
        geometría/tamaño. Se recalculan con el layout y el
        bbox real de quien ocupa cada slot bajo el order
        vigente (mismo patrón que computeLookAtX(order)
        más abajo).
    */
    function computePuntosSuperioresFila(order) {

        const pos =
            computeRowPositions(order);

        // Mismo centrado por centroide que
        // verticesMundoDeFila cuando el eje secundario es
        // X — sin esto, estos puntos (insumo del cálculo
        // de hiddenDrop) quedarían tan desalineados en X
        // como los conos mismos.
        return order.map((cupID, i) => {

            const bbox = bboxesPorIndice[cupID];

            const x =
                ejeSecundarioCamara === "x"
                    ? pos[i].x - (bbox.min.x + bbox.max.x) / 2
                    : pos[i].x;

            return {
                x,
                y: -bbox.min.y + pos[i].y + bbox.max.y,
                z: pos[i].z
            };

        });

    }

    /*
        Mismo criterio que computePuntosSuperioresFila,
        pero para el borde INFERIOR de la fila tal cual se
        ve en pantalla — lo necesita galeria.js para no
        superponer #gui (los botones de reordenar) con los
        conos en viewports bajos.

        Usa la esquina inferior-FRENTE de cada bbox
        (bbox.min.y, bbox.max.z) en vez de solo bbox.min.y:
        por perspectiva, la esquina más cercana a cámara es
        la que más "abajo" cae en pantalla, así que es la
        que determina dónde termina visualmente la fila.
    */
    function computePuntosInferioresFila(order) {

        const pos =
            computeRowPositions(order);

        return order.map((cupID, i) => {

            const bbox = bboxesPorIndice[cupID];

            const x =
                ejeSecundarioCamara === "x"
                    ? pos[i].x - (bbox.min.x + bbox.max.x) / 2
                    : pos[i].x;

            return {
                x,
                // -bbox.min.y + bbox.min.y == 0: el punto
                // inferior de CUALQUIER elemento, apoyado en
                // su propia base, siempre cae exactamente en
                // su slot (más pos[i].y en vertical) — ya no
                // depende de "restY" ni de qué tan "profunda"
                // sea la geometría de este elemento en
                // particular.
                y: pos[i].y,
                z: pos[i].z + bbox.max.z
            };

        });

    }

    /*
        "order" vigente para hiddenDrop/filaBottomNdcY —
        arranca en el orden crudo (galeria-reordenar.js
        aún no se construyó) y se actualiza en vivo vía
        actualizarHiddenDropParaOrden() (parte del
        export), que galeria-reordenar.js llama cada vez
        que "order" cambia de verdad. resize()/
        setCameraLado() leen este mismo "ordenActual" en
        vez de un array fijo, para seguir correctos si el
        resize ocurre parado en un order distinto del
        inicial.
    */
    let ordenActual =
        elementos.map(el => el.indice);

    /*
        Cuánto hay que bajar (en Y) cualquier elemento
        "escondido" (fases "revelado"/"fichas") para que
        quede completamente fuera del frustum de la
        cámara VIGENTE — reemplaza a un
        config.reveal.hiddenDrop fijo, que en pantallas
        angostas (cámara más lejos de la fila, ver
        calcularMagnitudRasante) cubre menos de lo
        necesario.

        Se recalcula al armar la escena, en cada
        resize()/setCameraLado() (usando "ordenActual") y
        cada vez que "order" cambia de verdad (ver
        actualizarHiddenDropParaOrden más abajo): a
        diferencia de cameraPos/fog/sombra, el hiddenDrop
        sí depende de qué elemento puntual cae en cada
        slot.
    */
    function calcularHiddenDrop(cameraPosActual, lookAtXActual, order) {

        // Arma el lookAt real ubicando el escalar ya
        // resuelto ("lookAtXActual", el nombre es
        // histórico — es la coordenada sobre ejePrincipal)
        // y "lookAtYReal" (ídem, sobre ejeSecundarioCamara)
        // en sus componentes de mundo correctas — mismo
        // criterio que setLookAtX más abajo.
        const lookAtReal = { x: 0, y: 0, z: config.camera.lookAtZ };
        lookAtReal[ejePrincipal] = lookAtXActual;
        lookAtReal[ejeSecundarioCamara] = lookAtYReal;

        return findHiddenDrop(
            cameraPosActual,
            lookAtReal,
            config.camera.fov,
            camera.aspect,
            computePuntosSuperioresFila(order),
            MARGEN_NDC_OCULTO,
            HIDDEN_DROP_MIN,
            HIDDEN_DROP_MAX
        );

    }

    let hiddenDropActual =
        calcularHiddenDrop(cameraPos, lookAtX, ordenActual);

    // Getter en vivo (mismo criterio que getPositions()/
    // getOrder() en galeria-reordenar.js): quien lo
    // consuma debe llamarlo en cada frame, no capturar su
    // valor una sola vez, o un resize a mitad de sesión
    // dejaría el drop desactualizado.
    function getHiddenDrop() {

        // hiddenDropFactor (galeria-config.js): margen de
        // seguridad sobre el drop calculado — la bisección
        // da el mínimo teórico pero es aproximado, así que
        // se infla un poco para cubrir el error.
        return (
            hiddenDropActual *
            config.reveal.hiddenDropFactor
        );

    }


    // NDC.y (-1 abajo, 1 arriba) del punto más bajo de
    // toda la fila con la cámara/lookAt vigente — mismo
    // criterio de recálculo que hiddenDropActual (mismo
    // motivo: depende de qué elemento cae en el slot más
    // cercano a cámara, así que no es invariante ante una
    // permutación).
    function calcularFilaBottomNdcY(cameraPosActual, lookAtXActual, order) {

        let peor = 1;

        // Mismo criterio que calcularHiddenDrop: ubicar los
        // dos escalares ya resueltos en su eje de mundo
        // correcto. "peor" (NDC.y) sigue siendo NDC.y sin
        // generalizar a propósito — es literalmente "borde
        // inferior de PANTALLA", una noción de espacio de
        // pantalla, no de eje de layout: projectToNdc usa
        // siempre up=(0,1,0) de mundo, así que "abajo en
        // pantalla" es NDC.y en los dos modos por igual.
        const lookAtReal = { x: 0, y: 0, z: config.camera.lookAtZ };
        lookAtReal[ejePrincipal] = lookAtXActual;
        lookAtReal[ejeSecundarioCamara] = lookAtYReal;

        computePuntosInferioresFila(order).forEach(punto => {

            const ndc =
                projectToNdc(
                    cameraPosActual,
                    lookAtReal,
                    punto,
                    config.camera.fov,
                    camera.aspect
                );

            if (ndc.y < peor) peor = ndc.y;

        });

        return peor;

    }

    let filaBottomNdcYActual =
        calcularFilaBottomNdcY(cameraPos, lookAtX, ordenActual);

    // Getter en vivo (mismo criterio que
    // getHiddenDrop()/getPositions()/getOrder()), en
    // píxeles CSS relativos al contenedor (0 = borde
    // superior), para que galeria.js lo compare directo
    // contra getBoundingClientRect().top.
    function getRowBottomScreenY() {

        return (
            (1 - filaBottomNdcYActual) / 2
        ) * container.clientHeight;

    }


    // Vértices de mundo de la silueta HOY apuntada por
    // la cámara. Arranca igual a "worldVertices" (orden
    // crudo) y se reemplaza en cada computeLookAtX() —
    // resize() la reutiliza para no centrar sobre un
    // orden viejo al cambiar el aspecto de la ventana.
    let lookAtWorldVertices = worldVertices;


    /*
        Recalcula el punto de mira en X que centraría la
        fila para un "order" DADO (array posición ->
        índice de elemento, mismo formato que
        getOrder()/getSortedOrder() en
        galeria-reordenar.js) — no necesariamente el
        orden crudo con el que se armó la escena.

        Deliberadamente NO recalcula cameraPos/fog/sombra:
        el ancho total de la fila (lo que los gobierna) es
        casi invariante ante una permutación de los mismos
        elementos, así que mover solo el punto de mira
        alcanza para centrar la silueta.

        Función PURA respecto de la cámara: solo devuelve
        el X (y de paso cachea "lookAtWorldVertices" para
        resize()). No mueve la cámara — eso es tarea de
        setLookAtX(), más abajo. Se separan porque quien
        reordena necesita el X DESTINO antes de que la
        cámara llegue ahí, para animar la transición.
    */
    function computeLookAtX(order) {

        lookAtWorldVertices =
            verticesMundoDeFila(
                order.map(cupID => ({
                    bbox: bboxesPorIndice[cupID],
                    // Misma cuenta que
                    // normalizarGeometriaElemento(): la base
                    // propia de ESTE elemento, no un restY
                    // compartido.
                    desplazamientoBase:
                        -bboxesPorIndice[cupID].min.y
                })),
                computeRowPositions(order),
                ejeSecundarioCamara
            );

        return findCenteredLookAtPrincipal(
            cameraPos,
            lookAtYReal,
            config.camera.lookAtZ,
            lookAtWorldVertices,
            config.camera.fov,
            camera.aspect,
            ejePrincipal,
            calcularTargetPrincipal().targetNdcCenter
        );

    }


    // Aplica un lookAtX ya calculado (computeLookAtX) a
    // la cámara. Separado en dos pasos para que quien
    // anima la cámara llame a setLookAtX() en cada frame
    // con un X intermedio interpolado, sin saltar de
    // golpe al final.
    /*
        "coordPrincipal" es el escalar que ya devolvió
        computeLookAtX() — la coordenada sobre ejePrincipal,
        sea cual sea. Se ubica en el eje que corresponda; el
        eje secundario de cámara toma "lookAtYReal", que corre
        sobre "ejeSecundarioCamara" (no siempre Y — ver su
        cálculo más arriba).
    */
    function setLookAtX(coordPrincipal) {

        const lookAt = { x: 0, y: 0, z: config.camera.lookAtZ };
        lookAt[ejePrincipal] = coordPrincipal;
        lookAt[ejeSecundarioCamara] = lookAtYReal;

        camera.lookAt(
            lookAt.x,
            lookAt.y,
            lookAt.z
        );

    }


    function resize() {

        const newAspect =
            container.clientWidth /
            container.clientHeight;

        camera.aspect = newAspect;

        // Dolly de cámara para pantallas verticales
        // (calcularMagnitudRasante/cameraPosFromMagnitud):
        // a diferencia de solo centrar, esto sí cambia
        // cameraPos de verdad — p. ej. al rotar el
        // celular — para que la fila quede bien
        // encuadrada en el nuevo aspecto.
        magnitudRasante =
            calcularMagnitudRasante(newAspect);

        // Recalculada acá también porque el ancho disponible
        // cambia con newAspect, igual que magnitudRasante (ver
        // calcularMagnitudAnchoHorizontal).
        if (ejePrincipal === "x") {

            magnitudRasanteAncho =
                calcularMagnitudAnchoHorizontal(newAspect);

        }

        cameraPos =
            cameraPosFromMagnitud(magnitudRasante);

        camera.position.set(
            cameraPos.x, cameraPos.y, cameraPos.z
        );

        /*
            Un resize/rotación de pantalla en pleno tramo del
            círculo verde (ladoActual>0.5 en vertical) es un
            REENCUADRE INSTANTÁNEO, no una animación —a
            diferencia de setCameraLado() (más abajo), que
            anima el cruce con "lookAtVerdeBase". Alcanza con
            ir directo al horizonte fijo: "findCenteredLookAtPrincipal"
            está pensada para una cámara que se mueve sobre
            "ejePrincipal", y en este tramo la cámara ya no lo
            hace.
        */
        const enCirculoVerdeResize =
            ejePrincipal === "y" && ladoActual > 0.5;

        // El punto de mira que mejor centra la fila también
        // cambia con el aspecto de la ventana. El horizonte
        // fijo del tramo verde es "centroPrincipal" (mismo
        // criterio que "centroArco" en cameraPosFromMagnitud):
        // así no rompe el fit-to-navbar, que asume la cámara
        // anclada al centro real de la fila.
        const newLookAtX =
            enCirculoVerdeResize
                ? centroPrincipal
                : findCenteredLookAtPrincipal(
                    cameraPos,
                    lookAtYReal,
                    config.camera.lookAtZ,
                    lookAtWorldVertices,
                    config.camera.fov,
                    newAspect,
                    ejePrincipal,
                    calcularTargetPrincipal().targetNdcCenter
                );

        setLookAtX(newLookAtX);

        // Mismo disparador que cameraPos/lookAtX: el
        // drop necesario para esconder un elemento
        // depende de la distancia y el ángulo de cámara.
        hiddenDropActual =
            calcularHiddenDrop(cameraPos, newLookAtX, ordenActual);

        filaBottomNdcYActual =
            calcularFilaBottomNdcY(cameraPos, newLookAtX, ordenActual);

        camera.updateProjectionMatrix();

        renderer.setSize(
            container.clientWidth,
            container.clientHeight
        );

    }


    /*
        Mueve la cámara a un punto "t" del arco entre el
        extremo derecho (t=0), la vista de frente (t=0.5)
        y alineado con el ancla del carrusel (t=1) — ver
        cameraPosFromMagnitud/centroPrincipal más arriba.
        Misma cadena de recálculo que resize() (fog,
        lookAtX, hiddenDrop), pero disparada por el avance
        de las fases "revelado"/"fichas" (galeria.js la
        llama en cada frame de esas fases), no por un
        cambio de aspecto — por eso NO toca
        camera.aspect/updateProjectionMatrix/
        renderer.setSize.

        "ladoActual" se guarda dentro de
        cameraPosFromMagnitud (recibe "t" y lo persiste
        ahí), así que si el visitante redimensiona a mitad
        de la cascada, resize() retoma el mismo punto del
        arco en vez de saltar al extremo derecho.
    */
    function setCameraLado(t) {

        /*
            galeria.js llama a esto en TODOS los frames de
            "hero"/"proyecto"/"orden"/"fichas", no solo en
            "revelado". Durante "orden" eso es t=0.5 en
            cada frame aunque la cámara ya esté asentada
            ahí — si se recalculara el lookAt igual, cada
            llamada pisaría con un salto la interpolación
            suave que reorder.step() hace ese mismo frame
            vía setLookAtX() (ver fromLookAtX/toLookAtX en
            galeria-reordenar.js).

            Por eso: si "t" ya es el lado vigente y la
            posición resultante es la misma, se sale sin
            tocar cameraPos/fog/lookAt/hiddenDrop, dejando
            que reorder.step() sea la única fuente de
            verdad de camera.lookAt() ese frame. Solo se
            recalcula la cadena completa cuando el lado
            cambia de verdad.
        */
        const nuevaPos =
            cameraPosFromMagnitud(magnitudRasante, t);

        const sinCambios =
            t === ladoActual &&
            nuevaPos.x === cameraPos.x &&
            nuevaPos.z === cameraPos.z;

        ladoActual = t;

        if (sinCambios) return;

        cameraPos = nuevaPos;

        camera.position.set(
            cameraPos.x, cameraPos.y, cameraPos.z
        );

        // "centroArco" es siempre "centroPrincipal" (mismo
        // criterio que cameraPosFromMagnitud): usar
        // "config.camera.position.y" acá rompería el
        // fit-to-navbar vertical, sin ganar nada de
        // continuidad real (cos(π/2)=0 la garantiza igual).
        const centroArco =
            centroPrincipal;

        const enCirculoVerde =
            ejePrincipal === "y" && t > 0.5;

        /*
            E: el resto del arco naranja (t>0.5) que NO pasa
            al círculo verde — hoy eso es siempre el caso en
            horizontal (esa rama no existe ahí), y también el
            tramo vertical con t>0.5 antes de llegar acá NO
            aplica porque enCirculoVerde ya lo captura primero.
            En este tramo "findCenteredLookAtPrincipal" sigue
            siendo válida en principio (la cámara todavía se
            mueve sobre "ejePrincipal"), pero el punto que
            mejor centra la fila deja de variar de forma
            monótona a medida que el ángulo de vista se achica
            hacia el ancla — recalcularlo cada frame podía
            saltar visiblemente. Se congela el valor tal cual
            estaba al cruzar t=0.5, sin blendear hacia ningún
            otro punto (a diferencia del tramo verde: acá no
            hay un "horizonte" nuevo — el acercamiento al ancla
            ya lo resuelve "extraBlend", más abajo, por
            separado).
        */
        const congelarLookAtNaranja =
            !enCirculoVerde && t > 0.5;

        let lookAtFilaPlana;

        if (enCirculoVerde) {

            /*
                "findCenteredLookAtPrincipal" —la búsqueda por
                bisección que encuadra la columna ENTERA— está
                pensada para una cámara que se mueve sobre
                "ejePrincipal" (el plano naranja). Una vez que
                la cámara pasa al círculo verde (t>0.5, ver
                cameraPosFromMagnitud), ya no se mueve en esa
                dirección: queda fija en altura (el horizonte,
                "centroArco") y solo cambia su posición en X.
                Pasar esa posición por esa búsqueda
                reintroduciría una inclinación hacia abajo sin
                sentido.

                El horizonte fijo tampoco coincide, en general,
                con el valor que daba "findCenteredLookAtPrincipal"
                en t=0.5 — pasar de uno a otro de golpe sería un
                salto de dirección (la posición de la cámara ya
                es continua en ese cruce, ver
                cameraPosFromMagnitud; el lookAt tiene que serlo
                también). Por eso el tramo verde arranca desde
                el valor con el que salió el arco naranja
                ("lookAtVerdeBase", calculado una sola vez por
                cada entrada a este tramo) y blendea desde ahí
                hacia el horizonte, con el mismo cronograma
                smoothstep que mueve la cámara por el círculo
                verde (ver "s" en cameraPosFromMagnitud) — así
                arranca donde lo dejó el arco naranja y termina
                plano en el horizonte en t=1, sin salto.
            */
            if (lookAtVerdeBase === null) {

                lookAtVerdeBase =
                    findCenteredLookAtPrincipal(
                        cameraPos,
                        lookAtYReal,
                        config.camera.lookAtZ,
                        lookAtWorldVertices,
                        config.camera.fov,
                        camera.aspect,
                        ejePrincipal,
                        calcularTargetPrincipal().targetNdcCenter
                    );

            }

            const s = smoothstep((t - 0.5) / 0.5);

            lookAtFilaPlana =
                lookAtVerdeBase + (centroArco - lookAtVerdeBase) * s;

        } else if (congelarLookAtNaranja) {

            if (lookAtNaranjaBase === null) {

                lookAtNaranjaBase =
                    findCenteredLookAtPrincipal(
                        cameraPos,
                        lookAtYReal,
                        config.camera.lookAtZ,
                        lookAtWorldVertices,
                        config.camera.fov,
                        camera.aspect,
                        ejePrincipal,
                        calcularTargetPrincipal().targetNdcCenter
                    );

            }

            lookAtFilaPlana = lookAtNaranjaBase;

            // Ya no estamos en el tramo verde (si se venía de
            // ahí, p. ej. tras cruzar de orientación a mitad de
            // "fichas") — se limpia esa base por el mismo
            // motivo que se limpia lookAtNaranjaBase más abajo.
            lookAtVerdeBase = null;

        } else {

            lookAtFilaPlana =
                findCenteredLookAtPrincipal(
                    cameraPos,
                    lookAtYReal,
                    config.camera.lookAtZ,
                    lookAtWorldVertices,
                    config.camera.fov,
                    camera.aspect,
                    ejePrincipal,
                    calcularTargetPrincipal().targetNdcCenter
                );

            // t<=0.5: no estamos en ninguno de los dos tramos
            // congelados — se limpian las dos bases para que la
            // PRÓXIMA vez que se cruce a t>0.5 (scroll hacia
            // adelante otra vez, tras haber retrocedido) se
            // recalculen frescas, no una vieja de una pasada
            // anterior que ya no corresponde a la posición
            // actual de cámara.
            lookAtVerdeBase = null;
            lookAtNaranjaBase = null;

        }

        /*
            "Apuntar directo al ancla" no puede pasar de golpe
            apenas arranca el giro extra (t>0.5): antes de
            "anguloIzquierda" (el final del arco de encuadre
            sin el giro extra) el lookAt sigue siendo el de
            encuadre de toda la fila; recién después se mezcla
            de forma continua hacia "mirar al ancla", llegando
            al 100% en "anguloFinal" (t=1).

            En el tramo del círculo verde esto se fuerza a 0:
            la alineación horizontal con el ancla ya la resuelve
            la POSICIÓN de la cámara sobre ese círculo (ver
            calcularAnguloFinalVerde/cameraPosFromMagnitud), no
            el lookAt. "anguloIzquierda"/"anguloFinal"
            (calcularArcoCamara) pertenecen al arco naranja y no
            tienen relación con el círculo verde, que vive en su
            propio plano con su propio cronograma (arranca
            derecho en t=0.5, no en "anguloIzquierda").
        */
        const extraBlend =
            enCirculoVerde
                ? 0
                : (() => {

                    const { anguloDerecha, anguloIzquierda, anguloFinal } =
                        calcularArcoCamara(magnitudRasante, t);

                    const anguloMedio = Math.PI / 2;

                    const anguloActualParaBlend =
                        t <= 0.5
                            ? anguloDerecha +
                              (anguloMedio - anguloDerecha) * (t / 0.5)
                            : anguloMedio +
                              (anguloFinal - anguloMedio) * ((t - 0.5) / 0.5);

                    return anguloFinal > anguloIzquierda
                        ? Math.max(0, Math.min(1,
                            (anguloActualParaBlend - anguloIzquierda) /
                            (anguloFinal - anguloIzquierda)
                          ))
                        : 0;

                })();

        const nuevoLookAtX =
            lookAtFilaPlana +
            (anclaPrincipalMundoActual - lookAtFilaPlana) * extraBlend;

        setLookAtX(nuevoLookAtX);

        hiddenDropActual =
            calcularHiddenDrop(cameraPos, nuevoLookAtX, ordenActual);

        filaBottomNdcYActual =
            calcularFilaBottomNdcY(cameraPos, nuevoLookAtX, ordenActual);

    }



    /*
        Recalcula hiddenDropActual/filaBottomNdcYActual
        para un "order" nuevo — necesario porque, a
        diferencia de cameraPos/fog/sombra, dependen de
        qué elemento cae en cada slot (ver
        computePuntosSuperioresFila más arriba).
        galeria-reordenar.js llama a esto en los dos
        únicos momentos en que "order" cambia de verdad
        (al construirse el controller y al terminar cada
        animateTo()) — mismo par de momentos en que ya
        llama a actualizarCajasDebug(order).

        Recalcula con el lookAtX real del order nuevo y el
        cameraPos vigente — no hace falta esperar a que la
        cámara termine de animar su lookAt: alcanza con que
        apunte más o menos ahí.
    */
    function actualizarHiddenDropParaOrden(order) {

        ordenActual = order;

        const loX =
            computeLookAtX(order);

        hiddenDropActual =
            calcularHiddenDrop(cameraPos, loX, order);

        filaBottomNdcYActual =
            calcularFilaBottomNdcY(cameraPos, loX, order);

    }


    // Fija el tamaño real del renderer desde el arranque
    // (si no, el <canvas> queda con el tamaño por defecto
    // de WebGLRenderer —300×150px— hasta el primer resize).
    resize();


    // Recalcula fondo/niebla desde las variables CSS
    // vigentes. La llama galeria.js desde un
    // MutationObserver sobre data-tema del <html>, para
    // que cambiar de tema actualice la escena 3D sin
    // recargar ni reconstruir cámara/luces/elementos.
    // No toca "roomFloor"/"roomWall": su color no sigue el
    // tema claro/oscuro del sitio (solo fondo/niebla).
    function actualizarColoresTema() {

        const fondo =
            colorFondoEscena();

        scene.background = fondo;

        scene.fog.color.copy(fondo);

    }


    /*
        Sistema día/noche (ver config.tema, galeria-config.js)
        — portado de refresh(k) en Maqueta.html. A diferencia
        de actualizarColoresTema() (arriba, instantánea, atada
        a un evento de cambio de atributo), esta se llama cada
        frame con un "k" YA suavizado (el propio suavizado
        vive en galeria.js: actualizarTemaSuave) — acá adentro
        no hay animación, solo aplicar el "k" que le llega tal
        cual, como hacía "refresh" con el valor crudo del
        slider.

        Cubre todo lo que este closure ya posee directo
        (keyLight/ambient) o alcanza a través de otros
        controllers construidos ACÁ ADENTRO (lucesAdicionales,
        habitacion) — lo único que queda afuera es el haz de
        luz visible (beamUniforms), que vive en
        galeria-cono-luz.js: ese módulo expone su propia
        actualizarTema(k), con el mismo "config.tema" como
        única fuente de verdad, para que ambas mitades del
        sistema día/noche no puedan desincronizarse por leer
        valores base distintos.

        PENDIENTE, cuando existan (no en este pase): SSS
        (uIntensity por elemento), polvo (uWarmth/uPower) y
        sombra de contacto (opacity) — la maqueta también los
        toca acá; portar esas líneas cuando esos sistemas
        existan.
    */
    const temaCfg = config.tema;

    const KEY_INTENSITY_BASE = keyCfg.intensity;
    const AMBIENT_INTENSITY_BASE = ambientCfg.intensity;
    const RIM_INTENSITY_BASE =
        config.lightsAdicionales.rim.intensity;

    const _colorTemaTmp = new THREE.Color();
    const _warmColor = new THREE.Color(temaCfg.warm.keyColor);
    const _coldColor = new THREE.Color(temaCfg.cold.keyColor);
    const _warmAmbient = new THREE.Color(temaCfg.warm.ambientColor);
    const _coldAmbient = new THREE.Color(temaCfg.cold.ambientColor);
    const _roomNight = new THREE.Color(temaCfg.roomNight);
    const _roomDay = new THREE.Color(temaCfg.roomDay);
    const _floorNight = new THREE.Color(temaCfg.floorNight);
    const _floorDay = new THREE.Color(temaCfg.floorDay);

    function actualizarTemaLuces(k) {

        const w =
            temaCfg.dark.warmth +
            (temaCfg.bright.warmth - temaCfg.dark.warmth) * k;

        const i =
            temaCfg.dark.intensity +
            (temaCfg.bright.intensity - temaCfg.dark.intensity) * k;

        const d =
            temaCfg.dark.day +
            (temaCfg.bright.day - temaCfg.dark.day) * k;

        const wT = 1 - w;

        keyLight.color.copy(
            _colorTemaTmp.copy(_warmColor).lerp(_coldColor, wT)
        );

        ambient.color.copy(
            _colorTemaTmp.copy(_warmAmbient).lerp(_coldAmbient, wT)
        );

        keyLight.intensity = KEY_INTENSITY_BASE * i;

        ambient.intensity =
            AMBIENT_INTENSITY_BASE * (0.4 + 0.6 * i) +
            0.12 * d;

        lucesAdicionales.roomLight.intensity =
            temaCfg.hemiMax * d;

        lucesAdicionales.wallLight.intensity =
            temaCfg.wallLightMax * d;

        lucesAdicionales.rim.intensity =
            RIM_INTENSITY_BASE * (1 - 0.85 * d);

        const roomMat = habitacion.roomWall.material;

        roomMat.color.copy(_roomNight).lerp(_roomDay, d);
        roomMat.emissive.copy(roomMat.color);

        const floorMat = habitacion.roomFloor.material;

        floorMat.color.copy(_floorNight).lerp(_floorDay, d);
        floorMat.emissive
            .copy(floorMat.color)
            .multiplyScalar(0.18);

        // La densidad de la niebla también se modula con
        // el día/noche (más clara/lejos se ve en modo día),
        // igual que en la maqueta — aplica con FogExp2 (ver
        // arriba), que sí tiene "density".
        scene.fog.density =
            FOG_DENSITY_BASE * (1 - 0.72 * d);

    }


    /*
        Gating de "castShadow" por elemento (portado del
        criterio de "sobreElPiso" en Maqueta.html) — se llama
        una vez por frame desde galeria.js, junto a
        actualizarPisoSegunGeometria(), sin importar la fase.

        POR QUÉ CENTRALIZADO (y no en galeria-revelado.js/
        galeria-reordenar.js/galeria-carrusel.js, que son
        quienes mueven los conos): lo único que importa es
        DÓNDE quedó cada cono ESTE frame, no qué fase lo puso
        ahí. Una sola pasada acá cubre las tres fases (y
        cualquiera futura) sin repetir la misma regla tres
        veces ni arriesgar que una quede desincronizada.

        CRITERIO LAXO (pedido explícito): NO hace falta que el
        elemento esté ENTERO por encima del piso — alcanza con
        que una PARTE lo esté. Por eso compara el TOPE del
        bbox (cone.position.y + bbox.max.y), no su base ni su
        centroide: un elemento asomando apenas por el piso ya
        proyecta sombra, en vez de encenderla de golpe recién
        cuando terminó de salir.

        El flag va en la MALLA, no en el "cone": "cone" es un
        Group de posicionamiento (no se renderiza), así que
        castShadow ahí no tendría ningún efecto — three.js lo
        lee del objeto que efectivamente dibuja. Ver
        armarGroup3D ("group.userData.mallas").

        "pisoY" es el piso VISIBLE de ahora mismo
        (roomGroup.position.y, el mismo que ya persigue
        actualizarPisoSegunGeometria), no una altura fija:
        en vertical el piso sigue al elemento más bajo, así
        que la referencia se mueve sola con él.
    */
    function actualizarCastShadow() {

        const pisoY =
            habitacion.roomGroup.position.y;

        let huboCambio = false;

        for (let id = 0; id < cones.length; id++) {

            const cone = cones[id];
            const bbox = bboxesPorIndice[id];

            if (!bbox) continue;

            const topeMundo =
                cone.position.y + bbox.max.y;

            const proyecta =
                topeMundo > pisoY + 1e-3;

            const mallas =
                cone.userData.mallas;

            for (let m = 0; m < mallas.length; m++) {

                if (mallas[m].castShadow === proyecta) continue;

                mallas[m].castShadow = proyecta;
                huboCambio = true;

            }

        }

        /*
            El shadow map NO se re-renderiza solo: hay que
            marcarlo (ver marcarSombraDirty/
            prepararRenderDeSombra más arriba). Sin esto, un
            elemento que acaba de asomar sobre el piso no
            proyectaría sombra hasta que algo MÁS marcara
            dirty por su cuenta — y uno que acaba de hundirse
            dejaría su sombra vieja congelada en el piso.

            Solo cuando hubo un cambio REAL de flag: esto
            corre cada frame, y marcar dirty siempre forzaría
            un re-render del shadow map en todos los frames,
            que es justo lo que el sistema de "dirty" existe
            para evitar.
        */
        if (huboCambio) marcarSombraDirty();

    }


    return {
        scene,
        camera,
        renderer,
        cones,

        // "positions": layout crudo, solo válido para el
        // orden con el que se armó la escena (ver
        // comentario junto a su cálculo, más arriba) — se
        // deja como valor de respaldo para fila vacía.
        // Para CUALQUIER order vigente usar
        // computeRowPositions(order), justo abajo, que es
        // lo que deben consumir galeria-reordenar.js y
        // (vía getPositions()) galeria-revelado.js.
        positions,
        computeRowPositions,

        restY,

        // bbox local por cupID (ver "bboxesPorIndice" más
        // arriba). Lo consume createCarouselController
        // para centrar cada elemento en su bbox real al
        // armar la curva línea->círculo — ver
        // galeria-carrusel.js.
        bboxesPorIndice,

        // "eje principal" vigente del layout ("x" fila
        // horizontal / "y" columna vertical — ver
        // calcularLayoutDeFila, más arriba). Lo consumen
        // galeria-reordenar.js (assignLayers, armado de
        // cone.position), galeria-revelado.js (orden/
        // dirección de la cascada) y galeria-carrusel.js
        // (plano del círculo): un SNAPSHOT al momento en que
        // se llama a createScene(), no una referencia viva —
        // si "manejarPosibleCambioDeOrientacion()" (más
        // abajo) detecta un cruce real más tarde, quien
        // consume esto tiene que releerlo del resultado de
        // esa llamada, no asumir que este valor se actualiza
        // solo.
        ejePrincipal,

        resize,
        computeLookAtX,
        setLookAtX,
        setCameraLado,

        // Accesor de debug para inspeccionar el encuadre
        // vertical (magnitudRasante) desde afuera.
        getMagnitudRasanteDebug: () => magnitudRasante,

        // A: galeria.js la llama en cada
        // resize/orientationchange/fullscreenchange (con
        // debounce) para detectar un cruce real horizontal↔
        // vertical y, si corresponde, recrear
        // reorder/reveal/carousel con el eje nuevo — ver el
        // comentario grande junto a su definición, más
        // arriba.
        manejarPosibleCambioDeOrientacion,

        // B: galeria.js la llama cada frame de "fichas",
        // justo después de carousel.update() — le pasa la
        // geometría del círculo cerrado + coordenada del
        // ancla que necesita calcularArcoCamara() (dentro
        // de cameraPosFromMagnitud/setCameraLado) para el
        // tramo t>0.5 del arco. Ver el comentario grande
        // junto a "circuloCerradoActual", más arriba.
        actualizarSetupCarrusel,

        actualizarCajasDebug: dibujarCajasDebug,
        actualizarColoresTema,
        actualizarTemaLuces,
        getHiddenDrop,
        getRowBottomScreenY,

        // Ver el comentario grande junto a su definición
        // (arriba, junto al armado del renderer). galeria.js
        // llama marcarSombraDirty() en cada punto donde mueve/
        // rota/escala una malla con sombra, y
        // prepararRenderDeSombra() justo antes de cada
        // renderer.render().
        marcarSombraDirty,
        prepararRenderDeSombra,

        // Fase 3 (habitación, ver galeria-habitacion.js):
        // "cones"/"restY"/"ejePrincipal" son los mismos que ya
        // vive este closure (no una copia) — se leen frescos
        // en cada llamada porque "ejePrincipal" puede cambiar
        // (cruce de orientación) y las posiciones de "cones"
        // cambian cada frame. galeria.js la llama una vez por
        // frame, sin importar la fase (mismo criterio que la
        // maqueta).
        actualizarPisoSegunGeometria: () =>
            habitacion.actualizarPisoSegunGeometria(
                cones, restY, ejePrincipal, bboxesPorIndice
            ),

        actualizarCastShadow,

        // Fase 4 (luces adicionales, ver galeria-luces.js):
        // mismo criterio que actualizarPisoSegunGeometria —
        // "camera"/"ejePrincipal" son los mismos que ya vive
        // este closure, se leen frescos en cada llamada.
        // "anchoFilaActual" (semiancho real de la fila en X,
        // ver calcularLayoutDeFila más arriba — no expuesto
        // hasta ahora fuera de este archivo) permite que
        // galeria-luces.js escale la posición X del par
        // cálido/frío con el ancho REAL de la fila en vez de
        // una constante calibrada a ojo para el ancho de
        // Maqueta.html — ver actualizarSegunCamara en
        // galeria-luces.js.
        actualizarLucesAdicionalesSegunCamara: () =>
            lucesAdicionales.actualizarSegunCamara(
                camera, ejePrincipal, anchoFilaActual
            ),

        // Fase 4 (lucesPorCaja): a diferencia de las otras
        // dos, esta SÍ necesita datos frescos por frame desde
        // afuera (el mapa de foco vigente, que depende de la
        // fase — ver galeria.js), así que no se arma como un
        // wrapper sin argumentos como los de arriba.
        // Se pasa "ejePrincipal" (leído fresco del closure,
        // igual que en actualizarLucesAdicionalesSegunCamara)
        // porque lucesPorCaja.actualizar() lo necesita para
        // apagarse en horizontal, igual que la maqueta.
        actualizarLucesPorCaja: (focoWeights) =>
            lucesPorCaja.actualizar(focoWeights, ejePrincipal),

        // Fase 5 (sombra de contacto): "habitacion.roomGroup.
        // position.y" es la MISMA Y que ya sigue el piso (ver
        // actualizarPisoSegunGeometria más arriba) — se lee
        // fresca en cada llamada, no capturada.
        actualizarSombrasDeContacto: () =>
            sombraContacto.actualizar(
                habitacion.roomGroup.position.y
            ),

        actualizarTemaSombraContacto: (k) =>
            sombraContacto.actualizarTema(k),

        // Fase 5 (cono de luz, ver galeria-cono-luz.js): ese
        // módulo vive AFUERA de este closure (necesita
        // getPositions()/getOrder(), que vienen de
        // galeria-reordenar.js, construido en galeria.js
        // DESPUÉS de que createScene() ya devolvió) — así que
        // no puede leer "keyLight"/"ladoActual"/"ejePrincipal"
        // directo del closure como hacen
        // actualizarPisoSegunGeometria/
        // actualizarLucesAdicionalesSegunCamara. Se exponen
        // sin envolver: "ladoActual"/"ejePrincipal" cambian
        // con el tiempo, así que van como GETTERS (leen el
        // valor vigente en cada llamada), no como el valor
        // capturado en el momento de este return.
        keyLight,
        getLadoActual: () => ladoActual,
        getEjePrincipal: () => ejePrincipal,

        // Recalcula hiddenDropActual/filaBottomNdcYActual
        // para un "order" nuevo — debe llamarse cada vez
        // que "order" cambia de verdad (ver
        // galeria-reordenar.js).
        actualizarHiddenDropParaOrden
    };

}


/*
    Calcula la posición de cada slot de la fila a lo
    largo de un ÚNICO eje principal ("eje": "x" o "y"),
    a partir del bounding box REAL (en ese eje) de cada
    elemento. "gap" es la separación mínima libre entre
    el borde "final" de un elemento y el borde "inicial"
    del siguiente (no distancia centro-a-centro).

    Sirve tanto para una fila en X como para una columna
    en Y (layout vertical) sin duplicar la función: el
    algoritmo de acumulado+gap+centrado es idéntico, solo
    cambia qué componente de cada bbox/posición se lee o
    escribe (ver el "Modelo mental: eje principal" en
    la documentación de encuadre 3D).

    Devuelve SIEMPRE {x, y, z}: la coordenada del eje
    principal se calcula por acumulado + gap, centrado al
    final sobre el bbox real del conjunto; la del eje
    secundario (el otro entre x/y) queda en 0 — la posición
    real en ese eje, si la hay, la resuelve elemento por
    elemento quien arma la escena (ver verticesMundoDeFila).
    "z" queda siempre en 0: es el eje de profundidad
    (cámara/anti-colisión), no cambia con el modo de layout.

    No se asume que cada geometría esté centrada en su
    propio origen local: se usan los bordes reales
    bbox.min[eje]/max[eje], así que el cálculo es correcto
    incluso con geometrías asimétricas.

    Se arma primero una fila/columna "cruda" arrancando en
    0, y al final se traslada en bloque para que quede
    centrada sobre el bounding box real del conjunto.

    El eje ("x"/"y") lo decide quien llama, no esta función
    (agnóstica del origen del valor) — ver
    calcularLayoutDeFila() para cómo se resuelve a partir
    del aspect ratio, en vivo ante cualquier cambio de
    orientación.
*/
function calculatePositions(bboxesPrincipal, gap, eje = "x") {

    const count = bboxesPrincipal.length;

    if (count === 0) return [];

    const positions = [];

    let coord = 0;

    positions.push({ x: 0, y: 0, z: 0 });
    positions[0][eje] = coord;

    for (let i = 1; i < count; i++) {

        const bordeFinAnterior =
            coord + bboxesPrincipal[i - 1].max[eje];

        const bordeInicioActual =
            bboxesPrincipal[i].min[eje];

        /*
            Slot i: el más chico que deja, entre el
            borde "final" del elemento anterior (ya
            ubicado) y el borde "inicial" de éste, al
            menos "gap" de separación.
        */
        coord =
            bordeFinAnterior +
            gap -
            bordeInicioActual;

        const p = { x: 0, y: 0, z: 0 };
        p[eje] = coord;
        positions.push(p);

    }


    const bordeInicioTotal =
        positions[0][eje] + bboxesPrincipal[0].min[eje];

    const bordeFinTotal =
        positions[count - 1][eje] +
        bboxesPrincipal[count - 1].max[eje];

    const centroTotal =
        (bordeInicioTotal + bordeFinTotal) / 2;

    positions.forEach(p => {

        p[eje] -= centroTotal;

    });

    return positions;

}