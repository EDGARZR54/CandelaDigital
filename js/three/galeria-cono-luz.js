/* ==================================================
   galeria-cono-luz.js

   Reposiciona/reapunta "keyLight" (SpotLight, ver
   galeria-escena.js) cada frame para que la luz — y su
   sombra, la única de toda la escena — venga siempre
   desde donde tiene sentido según qué elemento está en
   foco. Portado de Maqueta.html (actualizarCono/
   actualizarPuntoEnLinea/calcularRadioCono), pero con el
   modelo de fases MÁS SIMPLE que confirmó el pedido
   original (la maqueta tiene un arco de cámara propio de
   2 tramos; acá se apoya directo en "ladoActual", que ya
   expone galeria-escena.js):

   - "ladoActual" 0 -> 1 (revelado + construcción del
     carrusel, ver setCameraLado en galeria-escena.js):
     el punto al que apunta la luz (puntoEnLinea) se
     desliza en línea recta entre el extremo inicial y el
     extremo final de la fila.
   - En el instante en que "ladoActual" llega a 1 (círculo
     ya cerrado, foco cae en el primer elemento): la luz
     se CONGELA por completo (posición, dirección y
     radio) y no se vuelve a tocar durante el resto de
     "fichas" — sea cual sea el elemento en foco después
     (a diferencia de la maqueta, acá la cantidad de
     "paradas" de rotación la decide la cantidad real de
     elementos, no un número fijo).
   - Si se vuelve a subir el scroll y "ladoActual" baja de
     1, se descongela solo y retoma el deslizamiento.

   No conoce nada de fases/scroll — solo integra
   "ladoActual" + posiciones de la fila + foco vigente,
   frame a frame. Quien sabe en qué fase está la galería
   (galeria.js) es quien decide CUÁNDO llamar a update()
   y con qué "focoWeights" (mismo mapa que ya recibe
   actualizarLucesPorCaja, galeria-luces.js — misma señal,
   dos consumidores) y "carruselFormado".

   También arma y controla el POLVO en suspensión dentro
   del haz (mismo módulo, no uno aparte: comparte posición/
   eje/radio con el haz visible vía los mismos uniforms,
   así que separarlo obligaría a duplicar esa
   sincronización) — ver actualizarPolvo()/
   actualizarBasePerp() más abajo.
================================================== */

import * as THREE from 'three';
import { IS_MOBILE_TIER } from "./galeria-dispositivo.js";
import { smoothstep } from "./galeria-utils.js";

/*
    Geometría base del haz: un cono con el ápice en el
    ORIGEN local (no centrado) — mismo truco que la
    maqueta (ConeGeometry nace centrado en Y, se traslada
    -0.5 para que el ápice quede en y=0 y la base en
    y=-1). Así, position=apex + quaternion (alinea el "hacia
    abajo" local con axisDir) + scale.y=height dan
    exactamente el cono real, sin más matemática en cada
    frame. Se construye UNA sola vez (no depende de
    ninguna instancia): si createConoLuz() se llamara más
    de una vez compartirían esta misma geometría, pero hoy
    solo hay un cono de luz en toda la escena.
*/
/*
    Gateado por IS_MOBILE_TIER — mismo precedente que
    shadowMapSize (config.lights.key) y dust.count
    (config.lights.key.conoLuz.dust): el haz es una malla
    semitransparente con blending aditivo, vista casi
    siempre desde lejos/de costado, así que el faceteado
    con menos segmentos no se nota en la práctica, y baja
    de forma directa el conteo de vértices de una malla que
    está activa en casi todas las fases.
*/
const CONO_RADIAL_SEGMENTS =
    IS_MOBILE_TIER ? 28 : 64;

const conoGeometriaBase =
    new THREE.ConeGeometry(1, 1, CONO_RADIAL_SEGMENTS, 1, true);

conoGeometriaBase.translate(0, -0.5, 0);


/*
    Shader del haz — igual que Maqueta.html: por cada
    fragmento del cono (una malla real, no un billboard),
    calcula la distancia del rayo de vista al EJE del cono
    (no a la superficie) para dar un perfil de intensidad
    suave hacia el centro del haz, más un fundido cerca del
    ápice y de la base — sin esto, un cono sólido
    semitransparente se vería como una superficie lisa, no
    como un haz de luz con volumen.
*/
const CONO_VERTEX_SHADER = `
    varying vec3 vWorldPos;
    void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
    }
`;

const CONO_FRAGMENT_SHADER = `
    uniform vec3  uColor, uApex, uAxis;
    uniform float uOpacity, uTanAngle, uLength;
    varying vec3 vWorldPos;
    void main() {
        vec3 rd = normalize(vWorldPos - cameraPosition);
        vec3 n  = cross(rd, uAxis);
        float nl = length(n);
        float d  = (nl < 1e-5) ? 0.0 : abs(dot(uApex - cameraPosition, n / nl));
        float tAx   = dot(vWorldPos - uApex, uAxis);
        float rHere = max(uTanAngle * tAx, 0.0015);
        float x     = clamp(d / rHere, 0.0, 1.0);
        float profile = pow(1.0 - x * x, 1.7);
        float tn       = clamp(tAx / uLength, 0.0, 1.0);
        float fadeApex = smoothstep(0.00, 0.10, tn);
        float fadeBase = 1.0 - smoothstep(0.80, 1.00, tn);
        gl_FragColor = vec4(uColor, profile * fadeApex * fadeBase * uOpacity);
    }
`;


/*
    Polvo: partículas confinadas al volumen del cono
    (mismos uniforms uApex/uAxis/uTanAngle/uLength que el
    haz — ver más abajo, "dustMat" los REUSA como
    referencia, no como copia, así que seguir al cono es
    automático). Cada partícula tiene su posición de
    "descanso" en coordenadas del cono (aAxial 0..1 a lo
    largo del eje, aRadial 0..1 del eje al borde, aAngle
    ángulo) y el vertex shader las anima con torbellino +
    parpadeo en función del tiempo — portado literal de
    Maqueta.html.
*/
const DUST_VERTEX_SHADER = `
    attribute float aSeed, aSize, aTint, aBright, aAxial, aRadial, aAngle;
    uniform float uTime, uPixelRatio, uWarmth, uPower, uTanAngle, uLength;
    uniform vec3 uApex, uAxis, uPerpA, uPerpB;
    varying float vAlpha, vTint;
    void main() {
        float s = aSeed, t = uTime;
        float dir = (s > 50.0) ? 1.0 : -1.0;
        float u = fract(aAxial + (t * 0.045 + fract(s * 0.173) * 0.35) * dir);
        const float T0 = 0.16, T1 = 0.84;
        float tn = T0 + u * (T1 - T0);

        float swirlRate = 0.09 + fract(s * 0.137) * 0.20;
        float ang = aAngle + t * swirlRate * dir
                  + sin(t * 0.47 + s * 3.1) * 0.22
                  + sin(t * 0.23 + s * 7.9) * 0.11;
        float radialMod = 1.0 + sin(t * 0.36 + s * 2.7) * 0.24
                              + sin(t * 0.17 + s * 6.3) * 0.14;

        float rHere = uTanAngle * uLength * tn;
        float rr = aRadial * rHere * radialMod;
        vec3 pos = uApex + uAxis * (tn * uLength)
                 + uPerpA * (cos(ang) * rr) + uPerpB * (sin(ang) * rr);
        pos.y += sin(t * 0.62 + s * 4.7) * 0.022
               + sin(t * 0.29 + s * 8.3) * 0.014;

        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;

        float depth = max(-mv.z, 0.001);
        gl_PointSize = clamp(aSize * 900.0 * uPixelRatio / depth, 0.7, 14.0);

        vec3 viewDirV = normalize(-mv.xyz);
        vec3 axisV = normalize((viewMatrix * vec4(uAxis, 0.0)).xyz);
        float forward = clamp(dot(viewDirV, axisV), 0.0, 1.0);
        float scatter = mix(0.20, 1.0, pow(forward, 1.6));

        float radC = clamp(aRadial * radialMod, 0.0, 1.0);
        float radialFade = pow(max(0.0, 1.0 - radC * radC), 1.4);
        float axial = smoothstep(T0, T0 + 0.10, tn)
                    * (1.0 - smoothstep(T1 - 0.10, T1, tn));
        float twinkle = 0.76 + 0.16 * sin(t * 0.52 + s * 12.7)
                             + 0.08 * sin(t * 0.23 + s * 5.1);

        vAlpha = aBright * scatter * radialFade * axial * twinkle * 0.80 * uPower;
        vTint = mix(aTint, uWarmth, 0.5);
    }
`;

const DUST_FRAGMENT_SHADER = `
    varying float vAlpha, vTint;
    void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float a = exp(-dot(uv, uv) * 18.0);
        if (a < 0.01) discard;
        vec3 warm = vec3(1.00, 0.93, 0.82);
        vec3 cool = vec3(0.78, 0.87, 1.00);
        gl_FragColor = vec4(mix(cool, warm, vTint), a * vAlpha);
    }
`;

export function createConoLuz(
    config,
    {
        scene, keyLight, camera,
        getLadoActual, getEjePrincipal,
        getPositions, getOrder, getHeroSlot,
        restY, elementCount, cones, bboxesPorIndice
    }
) {

    const cfg = config.lights.conoLuz;

    /*
        "angleMin"/"angleMax" NO viven en
        config.lights.conoLuz (el "cfg" de este módulo) sino
        en config.lights.key, junto al resto de los
        parámetros del SpotLight en sí (es de ahí que los lee
        galeria-escena.js al construirlo). Leerlos de "cfg"
        daría undefined en las dos, y el clamp de más abajo
        —Math.min(undefined, Math.max(undefined, x))— produce
        NaN sin que ningún guard lo note: con angle NaN un
        SpotLight no ilumina NADA ni proyecta sombra — ni
        "piscina de luz" en el piso ni sombra del objeto.
        "anguloCalculado" (el atan2) es independiente de esto.
    */
    const keyCfg = config.lights.key;

    const ANGLE_MIN = keyCfg.angleMin;
    const ANGLE_MAX = keyCfg.angleMax;

    /*
        "alturaApex" NO es una constante: es
        "extensionEjeSecundario * 1.5", con
        "extensionEjeSecundario" la extensión real (max-min)
        de los bboxes en el eje secundario de cámara (altura
        del elemento más alto, en horizontal) — mismo criterio
        que Maqueta.html línea 1397.

        Por qué importa: la intersección de un SpotLight real
        (un cono 3D) con el piso (un plano) es una sección
        cónica — elipse, parábola o hipérbola según se compare
        el semi-ángulo del cono (keyLight.angle) contra la
        ELEVACIÓN del eje del cono sobre el piso
        (atan2(altura, distanciaHorizontal)). Con "alturaApex"
        fijo y la distancia horizontal apex→fila creciendo con
        el ancho real de la fila (geometría real, más grande),
        esa elevación se derrumbaría por debajo del
        semi-ángulo — la luz "se acostaría" y la piscina
        dejaría de cerrar en elipse.

        Se calcula UNA vez por cada eje posible (no una sola
        vez a secas: "ejePrincipal" puede cruzar horizontal↔
        vertical en caliente, ver
        manejarPosibleCambioDeOrientacion en
        galeria-escena.js, lo que invierte cuál es el eje
        secundario) — "bboxesPorIndice" no cambia nunca
        después de construir la escena (geometría normalizada
        una sola vez), así que las dos extensiones posibles
        son estables y no hace falta recalcularlas por frame,
        solo elegir cuál mirar según getEjePrincipal() vigente.
    */
    function extensionEnEje(eje) {

        let lo = Infinity;
        let hi = -Infinity;

        for (let id = 0; id < elementCount; id++) {

            const bbox = bboxesPorIndice[id];

            if (!bbox) continue;

            if (bbox.min[eje] < lo) lo = bbox.min[eje];
            if (bbox.max[eje] > hi) hi = bbox.max[eje];

        }

        return (hi > lo) ? (hi - lo) : 0;

    }

    const EXTENSION_SECUNDARIA = {
        x: extensionEnEje("x"),
        y: extensionEnEje("y")
    };

    /*
        La altura del ápice no alcanza con atarla solo a la
        altura del elemento más alto (ver "alturaApexMinimo"
        más abajo) — eso es la mitad de la ecuación. La OTRA
        mitad, verificada contra Maqueta.html línea
        ~1710-1720 (idéntica en los dos proyectos): el ápice
        se ubica como el REFLEJO de la cámara a través de
        "puntoEnLinea" — "apex.xz = puntoEnLinea.xz +
        direcciónCámara * distancia", con "distancia =
        camera.distanceTo(puntoEnLinea)" la distancia 3D
        COMPLETA cámara→target— así que el offset horizontal
        del ápice ES, literalmente, la distancia cámara→fila.
        Esa distancia crece con el ancho REAL de la fila (la
        cámara se aleja para que entre todo en cuadro); la
        altura del elemento más alto no tiene por qué crecer
        al mismo ritmo. En la maqueta ambas magnitudes
        coincidían en orden de magnitud por la escala chica de
        sus 6 cajas de prueba (fila de ~9 unidades de ancho,
        caja más alta de 3.5) — coincidencia de esa escena en
        particular, no una relación real.

        La corrección: además del piso por contenido
        (alturaApexMinimo — se conserva como mínimo razonable
        para filas angostas/cámara muy cerca), sumar una
        componente PROPORCIONAL a "distancia"
        (cfg.alturaApexRatio) así la elevación del eje del
        cono (atan2(alturaApex, distancia)) queda INVARIANTE a
        la escala de la escena: si "distancia" se duplica,
        "alturaApex" también, y el ángulo de elevación se
        mantiene igual sin importar qué tan ancha sea la fila
        real. Se aplica en el call site (ver más abajo, junto
        a "apex.y ="), porque "distancia" recién existe ahí
        (se computa una vez por frame contra la cámara real).
    */
    function alturaApexMinimo() {

        const ejeSecundario =
            getEjePrincipal() === "x" ? "y" : "x";

        return EXTENSION_SECUNDARIA[ejeSecundario] * cfg.alturaApexFactor;

    }

    const beamUniforms = {
        uColor: { value: new THREE.Color(cfg.beam.color) },
        uOpacity: { value: cfg.beam.opacity },
        uApex: { value: new THREE.Vector3() },
        uAxis: { value: new THREE.Vector3(0, -1, 0) },
        uTanAngle: { value: 0 },
        uLength: { value: 0 }
    };

    const conoMaterial =
        new THREE.ShaderMaterial({
            uniforms: beamUniforms,
            vertexShader: CONO_VERTEX_SHADER,
            fragmentShader: CONO_FRAGMENT_SHADER,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });

    const conoMesh =
        new THREE.Mesh(conoGeometriaBase, conoMaterial);

    conoMesh.visible = false;
    scene.add(conoMesh);

    // Alinea el "hacia abajo" local del cono (ápice en el
    // origen, base en y=-1, ver conoGeometriaBase) con la
    // dirección real del haz en cada frame.
    const _down = new THREE.Vector3(0, -1, 0);

    /*
        Base ortonormal perpendicular al eje del cono —
        la usa el polvo para ubicar cada partícula
        radialmente (uPerpA/uPerpB). "_upRefAlt" evita que
        la base degenere cuando el eje del cono ya está
        casi vertical (producto cruz con "up" casi paralelo
        da un vector casi nulo) — mismo fallback que la
        maqueta.
    */
    const perpA = new THREE.Vector3();
    const perpB = new THREE.Vector3();
    const _upRef = new THREE.Vector3(0, 1, 0);
    const _upRefAlt = new THREE.Vector3(1, 0, 0);

    function actualizarBasePerp(dirEje) {

        const ref =
            Math.abs(dirEje.y) > 0.98 ? _upRefAlt : _upRef;

        perpA.crossVectors(dirEje, ref).normalize();
        perpB.crossVectors(dirEje, perpA).normalize();

    }


    /*
        Polvo — ver el comentario grande junto a los shaders,
        arriba. "DUST_COUNT" gateado por dispositivo
        (config.lights.conoLuz.dust.countMobile/Desktop).
        Los atributos por partícula se sortean UNA sola vez
        al construir (posición de descanso dentro del cono,
        tamaño, tinte, brillo) — el movimiento después es
        enteramente del shader, no se tocan buffers por
        frame.
    */
    const dustCfg = cfg.dust;

    const DUST_COUNT =
        IS_MOBILE_TIER
            ? dustCfg.countMobile
            : dustCfg.countDesktop;

    const ATTR_NAMES =
        ['aSeed', 'aSize', 'aTint', 'aBright', 'aAxial', 'aRadial', 'aAngle'];

    const dustAttr =
        Object.fromEntries(
            ATTR_NAMES.map(n => [n, new Float32Array(DUST_COUNT)])
        );

    const dustPos = new Float32Array(DUST_COUNT * 3);

    for (let i = 0; i < DUST_COUNT; i++) {

        dustAttr.aAxial[i] = Math.random();
        dustAttr.aRadial[i] = Math.sqrt(Math.random()) * 0.98;
        dustAttr.aAngle[i] = Math.random() * Math.PI * 2;
        dustAttr.aSeed[i] = Math.random() * 100;
        dustAttr.aSize[i] = 0.014 + Math.random() * 0.022;
        dustAttr.aTint[i] = 0.55 + Math.random() * 0.45;
        dustAttr.aBright[i] =
            Math.pow(Math.random(), 2.2) * 0.9 + 0.10;

    }

    const dustGeom = new THREE.BufferGeometry();

    dustGeom.setAttribute(
        'position', new THREE.BufferAttribute(dustPos, 3)
    );

    for (const n of ATTR_NAMES) {

        dustGeom.setAttribute(
            n, new THREE.BufferAttribute(dustAttr[n], 1)
        );

    }

    // Mismo criterio de gating que el resto del proyecto
    // (ver PIXEL_RATIO en galeria-escena.js/galeria-habitacion.js)
    // — se recalcula acá en vez de recibirlo por parámetro
    // para no sumar una dependencia más a la firma de
    // createConoLuz() por un valor tan chico.
    const PIXEL_RATIO = Math.min(window.devicePixelRatio, 2);

    const dustMat =
        new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uPixelRatio: { value: PIXEL_RATIO },
                uWarmth: { value: 1.0 },
                uPower: { value: 1.0 },
                // Referencias (no copias) a los uniforms del
                // haz: el polvo sigue al cono automáticamente,
                // sin que este módulo tenga que sincronizar
                // nada aparte.
                uApex: beamUniforms.uApex,
                uAxis: beamUniforms.uAxis,
                uTanAngle: beamUniforms.uTanAngle,
                uLength: beamUniforms.uLength,
                uPerpA: { value: perpA },
                uPerpB: { value: perpB }
            },
            vertexShader: DUST_VERTEX_SHADER,
            fragmentShader: DUST_FRAGMENT_SHADER,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

    const dust = new THREE.Points(dustGeom, dustMat);

    dust.frustumCulled = false;
    dust.visible = false;
    scene.add(dust);

    let lastNowDust = null;


    /*
        Mismo shaping que pesoFoco() en galeria-luces.js
        (createLucesPorCaja) — misma función smoothstep
        (importada de galeria-utils.js, no reinventada), pero
        comparado contra un umbral DISTINTO
        (dustCfg.umbralFoco, mucho más bajo: 0.05 vs. la banda
        0.35..0.65 de las luces). No se importa "pesoFoco" en
        sí desde galeria-luces.js porque ahí vive como función
        interna de createLucesPorCaja, no exportada — se arma
        de nuevo acá contra la misma config
        (lightsAdicionales.porCaja) para no exponer una API
        nueva solo por esto.
    */
    function pesoFocoPolvo(w) {

        const porCajaCfg = config.lightsAdicionales.porCaja;

        return smoothstep(
            (w - porCajaCfg.umbral) / porCajaCfg.ancho
        );

    }

    function actualizarPolvo(dt, focoWeights) {

        let cajasEnFoco = 0;

        for (let id = 0; id < elementCount; id++) {

            const w = (focoWeights && focoWeights[id]) || 0;

            if (pesoFocoPolvo(w) > dustCfg.umbralFoco) {

                cajasEnFoco++;

            }

        }

        if (cajasEnFoco > dustCfg.limiteOcultar) {

            dust.visible = false;
            return;

        }

        dust.visible = true;

        if (cajasEnFoco <= dustCfg.limiteFreeze) {

            dustMat.uniforms.uTime.value += dt;

        }

    }


    const apex = new THREE.Vector3();
    const puntoEnLinea = new THREE.Vector3();
    const axisDir = new THREE.Vector3();
    const vectorCamara = new THREE.Vector3();

    const _toElemento = new THREE.Vector3();
    const _perp = new THREE.Vector3();
    const _sizeTmp = new THREE.Vector3();

    let radioSuavizado = null;

    let congelado = false;
    const apexCongelado = new THREE.Vector3();
    const puntoEnLineaCongelado = new THREE.Vector3();
    const axisDirCongelado = new THREE.Vector3(0, -1, 0);
    let anguloCongelado = ANGLE_MIN ?? 0;
    let alturaCongelada = 0;
    let radioCongelado = 0;


    /*
        Punto de la fila para un SLOT dado, en su posición de
        DESCANSO (no la posición animada actual) — mismo
        "extremoDeFila"/"posicionAsentadaDeFila" de la
        maqueta. El eje SECUNDARIO se fija en la altura de
        PISO, en vez de usar la altura real del slot, para
        que el punto viva siempre sobre la línea central de
        la fila, no sobre cada elemento individual.

        Esa altura de piso es "pos.y" (0 en horizontal), NO
        "restY". Desde que cada elemento se apoya en su base
        propia (-bbox.min.y, ver galeria-revelado.js/
        galeria-reordenar.js/galeria-carrusel.js), el punto
        más bajo de CUALQUIER elemento en mundo queda
        exactamente en "slot.y": la cuenta es
        (-bbox.min.y) + slot.y + bbox.min.y = slot.y, sin
        importar cómo se haya construido su geometría. Usar
        "restY" (el peor caso global) en cambio dejaría el
        ancla de la luz por ENCIMA del piso real, apuntando a
        una altura que no corresponde a ningún elemento en
        particular.

        El "slot" es la posición del ORIGEN LOCAL del bbox de
        cada geometría (ver calculatePositions en
        galeria-escena.js — el slot se calcula como "donde
        tiene que caer el bbox.min del elemento para no
        colisionar con el anterior", así que apunta al
        borde, no al punto medio). Para geometrías
        asimétricas, la coordenada del slot NO coincide con
        el centroide del elemento que lo ocupa: difieren en
        exactamente (bbox.min[eje] + bbox.max[eje]) / 2, el
        centro del bbox en coordenadas LOCALES. Si el cono
        apuntara a esa coordenada del slot (el borde), en
        elementos asimétricos el haz quedaría descentrado
        respecto del elemento. Por eso se suma ese centro
        local en el eje principal para que el cono apunte al
        CENTROIDE real del elemento en foco. Se aplica al eje
        PRINCIPAL (no solo a X) por simetría: en vertical
        (ejePrincipal="y") el razonamiento es idéntico, solo
        cambia qué componente del vector destino se corrige.

        SIMPLIFICACIÓN CONSCIENTE: sigue sin aplicarse
        corrección de centroide en el EJE SECUNDARIO (ver
        "corregirSecundario" en galeria-revelado.js/
        galeria-reordenar.js) — ese eje se fuerza a 0 (piso)
        más abajo, y ese "0" es la línea central de la fila
        en el piso, no la coordenada del elemento. Esto es
        solo el ANCLA de hacia dónde apunta una luz, no un
        objeto que se renderiza, así que un desvío chico en
        el secundario (a lo sumo medio ancho de un elemento)
        no es perceptible. Si llegara a notarse, portar el
        mismo corregirSecundario que ya usan esos dos
        módulos.
    */
    function puntoDeDescanso(slot, ejeSecundario, destino) {

        const positions = getPositions();
        const pos = positions[slot];

        destino.set(
            pos.x,
            pos.y,
            pos.z
        );

        destino[ejeSecundario] = 0;

        /*
            Corrección por centroide en el EJE PRINCIPAL:
            "getOrder()[slot]" da el cupID del elemento que
            OCUPA este slot ahora mismo (el slot es una
            posición de layout, no un elemento — con el
            criterio de ordenamiento cambiado, el mismo slot
            puede estar ocupado por otra geometría, de otro
            ancho, con otro centro local). "bboxesPorIndice"
            da su bbox LOCAL (el mismo que usa
            calculatePositions para armar la fila), así que
            sumar su centro local en el eje principal mueve
            el punto del borde al centroide real.
        */
        const ejePrincipal =
            ejeSecundario === "x" ? "y" : "x";

        const id = getOrder()[slot];
        const bbox = bboxesPorIndice[id];

        if (bbox) {

            destino[ejePrincipal] +=
                (bbox.min[ejePrincipal] +
                 bbox.max[ejePrincipal]) / 2;

        }

        return destino;

    }


    const _inicial = new THREE.Vector3();
    const _final = new THREE.Vector3();

    /*
        Radio del cono: el mayor entre todos los elementos de
        "distancia perpendicular al eje del cono, más el
        radio inscrito del propio elemento, pesado por su
        pesoFoco" — mismo criterio que calcularRadioCono() en
        la maqueta (es un MÁXIMO ponderado, no una suma: el
        cono se dimensiona para cubrir al elemento más en
        foco, no a todos a la vez).

        "carruselFormado": con el carrusel ya armado, se usa
        la posición REAL de cada cono (mundo, ya en el
        círculo); si no, la de DESCANSO (fila en línea recta,
        aunque el elemento todavía esté animándose hacia ahí)
        — mismo motivo que en la maqueta: evita que el radio
        tiemble mientras los elementos siguen en pleno
        movimiento de la cascada/reordenamiento.
    */
    function calcularRadio(apex, axisDir, focoWeights, carruselFormado, ejeSecundario) {

        let radio = 0;

        const order = getOrder();

        for (let slot = 0; slot < elementCount; slot++) {

            const id = order[slot];

            const w = (focoWeights && focoWeights[id]) || 0;
            if (w <= 0) continue;

            let posRef;

            if (carruselFormado) {

                posRef = cones[id].position;

            } else {

                posRef =
                    puntoDeDescanso(
                        slot, ejeSecundario, _toElemento
                    );

            }

            _toElemento
                .set(posRef.x, posRef.y, posRef.z)
                .sub(apex);

            const proy = _toElemento.dot(axisDir);

            _perp
                .copy(_toElemento)
                .addScaledVector(axisDir, -proy);

            const bbox = bboxesPorIndice[id];

            const radioInscrito =
                bbox.getSize(_sizeTmp).length() * 0.5;

            const escala =
                carruselFormado ? cones[id].scale.x : 1;

            const d = _perp.length() + radioInscrito * escala;

            const contrib = w * d;

            if (contrib > radio) radio = contrib;

        }

        return radio;

    }


    function aplicarCongelado() {

        keyLight.position.copy(apexCongelado);
        keyLight.target.position.copy(puntoEnLineaCongelado);
        keyLight.target.updateMatrixWorld();

        keyLight.angle = anguloCongelado;

        /*
            "distance" NO se deriva de la geometría del cono
            (altura/radio). Con la fórmula de atenuación
            LINEAL de r128 (la que reproduce el shim de
            compat — ver galeria-compat-r128.js), "distance"
            no es un simple corte físico más allá del cual no
            llega nada — es TODA la rampa de caída, 0 en el
            ápice, 1 en el borde. Un "distance" que siguiera
            de cerca a la geometría del cono (vía hypot())
            dejaría los elementos siempre cerca del borde de
            esa rampa, es decir, siempre casi apagados.

            Se usa "keyCfg.distance" (30, el valor real de
            Maqueta.html — LIGHT_CONE_CONFIG.distance, fijo
            SIEMPRE en aplicarConoComoLuz() ahí también, ver
            Maqueta.html línea ~1660) en las dos ramas
            (congelada y en vivo).

            La cota natural para "distance" es la distancia
            REAL del ápice a la CÁMARA — cualquier punto que
            la cámara ve está a lo sumo a esa distancia del
            ápice (más el margen de "cfg.toleranciaDistancia"
            por si algún punto visible queda un poco por
            detrás de la cámara respecto del ápice). Un
            margen de tipo "×2" sobre
            max(keyCfg.distance, hypot(...)) daría de MÁS con
            la cámara lejos (aplana la rampa de atenuación
            innecesariamente, menos "spot") y de MENOS con la
            cámara cerca; la distancia real ápice→cámara es
            la cota correcta y no depende de ninguna
            constante calibrada a ojo.

            Se conservan DOS pisos por seguridad, dentro del
            Math.max:
              - keyCfg.distance (30): mínimo de la maqueta,
                para no oscurecer escenas chicas.
              - hypot(altura, radio): por si el radio del
                cono crece tanto que la base queda más lejos
                del ápice que la propia cámara (elemento en
                foco muy ancho).
            El resultado se multiplica por
            cfg.toleranciaDistancia (~1.10) para dejar un
            margen chico por sobre la cámara.

            "cfg.distanceMargenFactor" (declarado en
            config.lights.conoLuz, ver el comentario ahí)
            queda sin uso: la altura del ápice actual
            (alturaApexMinimo() sola, ver el comentario junto
            a "apex.y =", más abajo en el archivo) mantiene la
            distancia real ápice→elementos chica, así que
            "keyCfg.distance" (30) alcanza de sobra sin ese
            margen extra.
        */
        keyLight.distance =
            Math.max(
                keyCfg.distance,
                Math.hypot(alturaCongelada, radioCongelado),
                apexCongelado.distanceTo(camera.position)
            ) * cfg.toleranciaDistancia;

        conoMesh.visible = true;
        conoMesh.position.copy(apexCongelado);
        conoMesh.quaternion.setFromUnitVectors(
            _down, axisDirCongelado
        );
        conoMesh.scale.set(
            radioCongelado, alturaCongelada, radioCongelado
        );

        beamUniforms.uApex.value.copy(apexCongelado);
        beamUniforms.uAxis.value.copy(axisDirCongelado);
        beamUniforms.uTanAngle.value =
            radioCongelado / Math.max(alturaCongelada, 1e-4);
        beamUniforms.uLength.value = alturaCongelada;

    }


    function update(focoWeights, carruselFormado, now) {

        /*
            "now" viene de requestAnimationFrame (rAF) — un
            DOMHighResTimeStamp en MILISEGUNDOS. La maqueta
            alimenta "uTime" con THREE.Clock.getDelta(), que
            da SEGUNDOS. Por eso se divide entre 1000: sin
            esa conversión, "uTime" avanzaría ~1000× más
            rápido que en la maqueta — todo el movimiento del
            polvo (torbellino, parpadeo, deriva axial, todos
            calculados contra "uTime" en DUST_VERTEX_SHADER)
            quedaría a una velocidad absurda.
        */
        const dt =
            lastNowDust === null
                ? 0
                : Math.min(100, Math.max(0, now - lastNowDust)) / 1000;

        lastNowDust = now;

        if (elementCount === 0) {

            conoMesh.visible = false;
            dust.visible = false;
            return;

        }

        const ejePrincipal = getEjePrincipal();
        const ejeSecundario =
            ejePrincipal === "x" ? "y" : "x";

        const ladoActual = getLadoActual();

        const debeEstarCongelado = ladoActual >= 1;

        /*
            Se descongela apenas "ladoActual" baja de 1 (el
            visitante retomó el scroll hacia atrás) — el
            deslizamiento se retoma solo, sin ningún estado
            extra que limpiar.
        */
        if (!debeEstarCongelado) congelado = false;

        if (congelado) {

            aplicarCongelado();
            actualizarBasePerp(axisDirCongelado);
            actualizarPolvo(dt, focoWeights);
            return;

        }


        // 1) Punto al que apunta la luz: desliza entre los
        // dos extremos de la fila según "ladoActual".
        const heroSlot = getHeroSlot();
        const otroExtremoSlot =
            elementCount - 1 - heroSlot;

        const t =
            Math.min(1, Math.max(0, ladoActual));

        puntoDeDescanso(heroSlot, ejeSecundario, _inicial);
        puntoDeDescanso(otroExtremoSlot, ejeSecundario, _final);

        puntoEnLinea.lerpVectors(_inicial, _final, t);


        // 2) Ápice: a la misma distancia de "puntoEnLinea"
        // que la cámara, pero desplazado a lo largo de hacia
        // dónde MIRA la cámara (proyectada sobre el plano
        // HORIZONTAL, Y aplanada a 0) — mismo criterio que
        // "vectorCamaraTemp"/"puntoFinalLineaRosa" en la
        // maqueta. Con altura fija (cfg.alturaApex): el ápice
        // no sigue a la fila (NUNCA, en ninguna orientación:
        // "igual que Maqueta.html" — ver más abajo), es una
        // altura de "foco" deliberada.
        //
        // Se aplana/fija siempre en Y, no en "ejeSecundario":
        // en horizontal (ejeSecundario = "y") ambas
        // coordenadas coinciden, pero en vertical
        // ejeSecundario es "x", y aplanar/fijar ahí en vez de
        // en Y dejaría el empuje lateral en el eje
        // equivocado —el pitch de la cámara movería el ápice
        // en altura, cuando tiene que quedar siempre
        // horizontal— y, lo que de verdad importa, la altura
        // del ápice dejaría de ser fija: heredaría
        // "puntoEnLinea.y" (la altura REAL del elemento en
        // foco dentro de la columna), así que el eje del cono
        // terminaría casi horizontal en vez de apuntando
        // hacia abajo (con un elemento en foco a
        // target.y=8.559, el ápice — que debe fijarse en
        // cfg.alturaApex=6 — terminaría TAMBIÉN en y=8.559).
        camera.getWorldDirection(vectorCamara);
        vectorCamara.y = 0;

        if (vectorCamara.lengthSq() < 1e-9) {

            conoMesh.visible = false;
            dust.visible = false;
            return;

        }

        vectorCamara.normalize();

        const distancia =
            camera.position.distanceTo(puntoEnLinea);

        apex
            .copy(puntoEnLinea)
            .addScaledVector(vectorCamara, distancia);

        // Siempre se usa "y", no "ejeSecundario" (ver el
        // comentario grande más arriba): la altura del ápice
        // es fija en las dos orientaciones, igual que en
        // Maqueta.html.
        //
        // Queda como SOLO "alturaApexMinimo()" (extensión
        // real del elemento más alto × alturaApexFactor) —
        // mismo comportamiento que Maqueta.html
        // (alturaPuntoFinalLineaRosa = extensionEjeSecundario
        // * 1.5), sin ningún ajuste adicional por escala de
        // fila: un enfoque que combinara esto con
        // "distancia * cfg.alturaApexRatio" para forzar
        // elipse en filas anchas cambiaría demasiado la
        // altura real de la luz respecto a como se ve hoy
        // (ver "alturaApexRatio"/"distanceMargenFactor" en
        // galeria-config.js, ambos sin uso desde acá pero
        // declarados por si se retoma este camino más
        // adelante).
        apex.y = alturaApexMinimo();


        axisDir.subVectors(puntoEnLinea, apex);
        const height = axisDir.length();

        if (height < 1e-6) {

            conoMesh.visible = false;
            dust.visible = false;
            return;

        }

        axisDir.normalize();


        // 3) Radio, con el mismo suavizado exponencial que
        // la maqueta mientras no está congelado (evita saltos
        // frame a frame mientras el foco cambia de elemento).
        const radioObjetivo =
            calcularRadio(
                apex, axisDir, focoWeights,
                carruselFormado, ejeSecundario
            );

        radioSuavizado =
            radioSuavizado === null
                ? radioObjetivo
                : radioSuavizado +
                  (radioObjetivo - radioSuavizado) *
                  cfg.suavizadoRadio;


        // 4) Aplicar a la luz real.
        keyLight.position.copy(apex);
        keyLight.target.position.copy(puntoEnLinea);
        keyLight.target.updateMatrixWorld();

        const anguloCalculado =
            Math.atan2(radioSuavizado, height);

        keyLight.angle =
            Math.min(
                ANGLE_MAX,
                Math.max(ANGLE_MIN, anguloCalculado)
            );

        /*
            La cota natural para "distance" es la distancia
            REAL del ápice a la CÁMARA (mismo criterio que en
            aplicarCongelado(), ver el comentario grande ahí)
            — cualquier punto visible está a lo sumo a esa
            distancia del ápice (más el margen de
            cfg.toleranciaDistancia). Un margen de tipo "×2"
            daría de MÁS con la cámara lejos (aplana la
            rampa lineal del shim innecesariamente → menos
            "spot") y de MENOS con la cámara cerca.

            Se conservan dos pisos por seguridad dentro del
            Math.max:
              - keyCfg.distance (30): mínimo de la maqueta,
                para no oscurecer escenas chicas.
              - hypot(height, radioSuavizado): por si el
                radio del cono crece tanto que la base queda
                más lejos del ápice que la propia cámara
                (elemento en foco muy ancho).
            El resultado se multiplica por
            cfg.toleranciaDistancia (~1.10) para dejar un
            margen chico por sobre la cámara.

            Bajo la fórmula LINEAL del shim, la rampa 0→1 se
            estira con "distance"; un "distance" que
            siguiera de cerca a la geometría del cono (vía
            hypot() puro, sin la distancia a cámara) dejaría
            los elementos siempre cerca del borde de esa
            rampa, casi apagados — pero el piso de la maqueta
            (30) sigue siendo el mínimo para no oscurecer
            escenas chicas.
        */
        keyLight.distance =
            Math.max(
                keyCfg.distance,
                Math.hypot(height, radioSuavizado),
                apex.distanceTo(camera.position)
            ) * cfg.toleranciaDistancia;


        // 4b) Malla visible del haz (ver conoGeometriaBase:
        // ápice en el origen local, base en y=-1) + uniforms
        // del shader (espacio de mundo, independientes de la
        // transform de la malla).
        conoMesh.visible = true;
        conoMesh.position.copy(apex);
        conoMesh.quaternion.setFromUnitVectors(_down, axisDir);
        conoMesh.scale.set(
            radioSuavizado, height, radioSuavizado
        );

        beamUniforms.uApex.value.copy(apex);
        beamUniforms.uAxis.value.copy(axisDir);
        beamUniforms.uTanAngle.value =
            radioSuavizado / Math.max(height, 1e-4);
        beamUniforms.uLength.value = height;


        // 5) Si "ladoActual" llegó a 1 justo este frame,
        // guardar el estado ya aplicado como el congelado
        // definitivo — el PRÓXIMO frame ya entra por la rama
        // de arriba (congelado === true) y no vuelve a tocar
        // nada de esto.
        if (debeEstarCongelado) {

            congelado = true;

            apexCongelado.copy(apex);
            puntoEnLineaCongelado.copy(puntoEnLinea);
            axisDirCongelado.copy(axisDir);
            anguloCongelado = keyLight.angle;
            alturaCongelada = height;
            radioCongelado = radioSuavizado;

        }


        // 6) Base perpendicular (para el polvo) + polvo en
        // sí — al final, ya con axisDir/apex/radio definitivos
        // de este frame.
        actualizarBasePerp(axisDir);
        actualizarPolvo(dt, focoWeights);

    }


    /*
        Mitad "haz visible" del sistema día/noche — ver el
        comentario grande junto a actualizarTemaLuces() en
        galeria-escena.js. Misma fuente de verdad
        (config.tema): "w"/"i"/"d" se recalculan acá con la
        misma fórmula en vez de recibirlos ya calculados,
        para no depender de un orden de llamada entre este
        módulo y el otro — cualquiera de los dos puede
        llamarse primero en el mismo frame sin que el
        resultado cambie.
    */
    const temaCfg = config.tema;

    const _colorTemaTmp = new THREE.Color();
    const _warmBeam = new THREE.Color(temaCfg.warm.beamColor);
    const _coldBeam = new THREE.Color(temaCfg.cold.beamColor);

    function actualizarTema(k) {

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

        beamUniforms.uColor.value.copy(
            _colorTemaTmp.copy(_warmBeam).lerp(_coldBeam, wT)
        );

        const beamVis = i * (1 - 0.55 * d);

        beamUniforms.uOpacity.value =
            cfg.beam.opacity * beamVis;

        // Mismas "w"/"beamVis" ya calculadas arriba para el
        // haz — el polvo usa "w" cruda (no wT) para el tinte:
        // a diferencia del color del haz (que lerpea HACIA
        // frío con wT), acá el shader del polvo mezcla
        // aTint/uWarmth mitad y mitad (ver "vTint = mix(aTint,
        // uWarmth, 0.5)" en DUST_VERTEX_SHADER) — portado
        // literal de la maqueta, mismo criterio.
        dustMat.uniforms.uWarmth.value = w;
        dustMat.uniforms.uPower.value = beamVis;

    }


    return { update, actualizarTema };

}