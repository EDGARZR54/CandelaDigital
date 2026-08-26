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
    findCenteredLookAtX,
    findFittedMagnitude,
    findHiddenDrop,
    projectToNdc
} from "./galeria-utils.js";
import { obtenerFuncionConstructora } from "./galeria-generadores.js";


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
            .catch(err => {

                console.error(
                    "galeria-escena.js: no se pudo " +
                    "cargar el generador \"" + id +
                    "\", se usa el de respaldo " +
                    "(" + GENERADOR_RESPALDO + "):",
                    err
                );

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

    - ALINEACIÓN FRONTAL (Z): la traslada para que su
      cara MÁS CERCANA A LA CÁMARA (bbox.max.z — la
      cámara está del lado +Z, mirando hacia lookAtZ=0)
      quede en z=0 en su propio espacio local. Necesario
      porque nada garantiza que dos generadores centren
      su fórmula igual en Z: si dos elementos de
      profundidad distinta se pararan con su ORIGEN (no
      su cara frontal) en el mismo slot.z, sus caras
      frontales quedarían a distinta distancia de la
      cámara y, con la cámara en escorzo, eso se ve como
      una diferencia de tamaño/posición en pantalla. Al
      hornear el ajuste en la geometría misma, el resto
      del código (calculatePositions, verticesMundoDeFila,
      galeria-reordenar.js, las cajas de debug) no
      necesita saber nada: la cara frontal de cada
      elemento ya está en su slot.z tal cual la leen.

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
    del elemento enfocado (sliders de "Geometría") — ver
    geometria-recalculo-centroide.md.
*/
export function normalizarGeometriaElemento(geometry) {

    geometry.computeBoundingBox();

    const desplazamientoFrente =
        -geometry.boundingBox.max.z;

    geometry.translate(0, 0, desplazamientoFrente);

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
    compensa las mallas para que el resultado visual con
    rotation.y=0 no cambie (ver el porqué de este pivote
    separado en el comentario de armarGroup3D, más abajo).

    Exportada para que galeria-panel-parametros.js la
    vuelva a llamar cada vez que reconstruye la geometría
    del elemento enfocado: el centro del bbox puede
    correrse, y si nadie lo recalcula el pivote queda
    desalineado del bbox nuevo.
*/
export function posicionarPivote(pivote, mallaFrontal, mallaTrasera, bbox) {

    const pivotX = (bbox.min.x + bbox.max.x) / 2;
    const pivotZ = (bbox.min.z + bbox.max.z) / 2;

    pivote.position.set(pivotX, 0, pivotZ);

    mallaFrontal.position.set(-pivotX, 0, -pivotZ);
    mallaTrasera.position.set(-pivotX, 0, -pivotZ);

}


// Arma, para un elemento, el Group con las dos mallas
// (frontal y trasera, sin backface culling — mismo
// patrón que fondo-3d.js) a partir de una geometría YA
// construida por prepararGeometria().
function armarGroup3D(elemento, modulo, geometry, matCfg) {

    const color =
        new THREE.Color(
            elemento.color.r / 255,
            elemento.color.g / 255,
            elemento.color.b / 255
        );

    function crearMaterial(side) {

        return new THREE.MeshPhysicalMaterial({
            color,
            roughness: matCfg.roughness,
            metalness: matCfg.metalness,
            clearcoat: matCfg.clearcoat,
            clearcoatRoughness:
                matCfg.clearcoatRoughness,
            side,
            transparent: true,
            opacity: 1
        });

    }

    const materialFrontal =
        crearMaterial(THREE.FrontSide);

    const materialTrasera =
        crearMaterial(THREE.BackSide);

    const mallaFrontal =
        new THREE.Mesh(geometry, materialTrasera);

    const mallaTrasera =
        new THREE.Mesh(geometry, materialFrontal);

    mallaFrontal.castShadow = true;
    mallaTrasera.castShadow = true;


    /*
        Pivote de rotación separado del grupo de
        posicionamiento: "group" (más abajo) se coloca
        vía cone.position.set(x, restY, z) con origen en
        el punto de ANCLAJE de la geometría (base en
        y=0, cara frontal en z=0 — ver prepararGeometria),
        no en el centro del bbox. Girar "group"
        directamente rotaría alrededor de ese anclaje, y
        si no coincide con el centro real, el objeto
        "orbita" en vez de girar en el lugar.

        Las mallas cuelgan de un grupo intermedio
        ("pivote"), corrido al centro real del bbox en
        X/Z, y compensado en sentido contrario en las
        mallas — así el resultado visual con rotación 0
        no cambia, pero rotation.y gira alrededor del
        centro real.

        "geometry.boundingBox" ya está calculado desde
        prepararGeometria() (incluye el translate de la
        cara frontal) — no hace falta recomputarlo acá.
    */
    const pivote = new THREE.Group();

    posicionarPivote(
        pivote, mallaFrontal, mallaTrasera,
        geometry.boundingBox
    );

    pivote.add(mallaTrasera);
    pivote.add(mallaFrontal);


    const group = new THREE.Group();

    group.add(pivote);


    /*
        Referencias que usa galeria-panel-parametros.js
        para reconstruir geometría y material en vivo
        (sliders de "Geometría", overlay de malla) sin
        que este módulo sepa nada de paneles. "indice"
        (= elemento.indice, el mismo cupID que indexa
        bboxesPorIndice más abajo) le permite a ese panel
        actualizar la entrada correspondiente tras
        reconstruir — si no, galeria-carrusel.js/
        galeria-zoom.js/las cajas de debug seguirían
        viendo el bbox con el que se armó la escena la
        primera vez.
    */
    group.userData.modulo = modulo;
    group.userData.mallas = [mallaFrontal, mallaTrasera];
    group.userData.pivote = pivote;
    group.userData.color = color;
    group.userData.matCfg = matCfg;
    group.userData.indice = elemento.indice;


    /*
        Proxy de ".material.opacity": galeria-revelado,
        galeria-reordenar y galeria-carrusel siguen
        escribiendo "cone.material.opacity = x" sin saber
        que por dentro hay dos mallas. Lee/escribe el
        material VIGENTE de cada mesh (no las variables
        capturadas arriba), para seguir funcionando si el
        panel de parámetros reemplaza el material más
        adelante.

        También empuja el overlay de malla (ver
        galeria-panel-material.js) si el grupo tiene uno
        puesto: el overlay debe atenuarse con la distancia
        al foco igual que la superficie sólida, así que se
        multiplica el mismo fundido por distancia por
        "overlay.userData.opacidadBase" (la opacidad base
        que decide galeria-panel-material.js según el tipo
        de material — este módulo solo compone, no conoce
        esos números). Default 1 si "opacidadBase" aún no
        se seteó, para no dejar la malla en 0 por un frame.
    */
    group.material = {

        get opacity() {

            return mallaFrontal.material.opacity;

        },

        set opacity(valor) {

            mallaFrontal.material.opacity = valor;
            mallaTrasera.material.opacity = valor;

            const overlay = group.userData.overlayMalla;

            if (overlay) {

                overlay.material.opacity =
                    valor *
                    (overlay.userData.opacidadBase ?? 1);

            }

        }

    };



    return group;

}


/*
    Arma, para TODA la fila, la lista de vértices de
    bounding box en coordenadas de MUNDO (8 por
    elemento) que necesita findCenteredLookAtX() para
    centrar el conjunto por su silueta proyectada real,
    no por el punto central de cada slot.

    "preparados[i].bbox" está en el espacio LOCAL de
    cada geometría; para llevarlo a mundo se le suma la
    posición del slot en X/Z (positions[i]) y "restY" en
    Y — mismo criterio de posicionamiento que usan
    galeria-revelado.js/galeria-reordenar.js cuando un
    elemento está en su lugar de reposo.

    Se arma sobre TODOS los elementos sin importar
    fase/visibilidad: el reencuadre es por el conjunto
    completo, nunca por objeto.
*/
function verticesMundoDeFila(preparados, positions, restY) {

    const vertices = [];

    preparados.forEach((preparado, i) => {

        const { bbox } = preparado;
        const slot = positions[i];

        [bbox.min.x, bbox.max.x].forEach(lx => {

            [bbox.min.y, bbox.max.y].forEach(ly => {

                [bbox.min.z, bbox.max.z].forEach(lz => {

                    vertices.push({
                        x: slot.x + lx,
                        y: restY + ly,
                        z: slot.z + lz
                    });

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


export async function createScene(container, elementos, config) {

    const scene =
        new THREE.Scene();

    // Fondo y niebla, calculados en vivo desde
    // --color-fondo (colorFondoEscena() arriba) —
    // actualizarColoresTema() (devuelta más abajo) los
    // recalcula si el visitante cambia de tema.
    scene.background =
        colorFondoEscena();

    // near/far se fijan más abajo ("distMax"), una vez
    // conocida la distancia real cámara-fila (depende
    // del bbox real, sólo disponible tras el Promise.all
    // de los generadores).
    scene.fog =
        new THREE.Fog(
            scene.background.getHex(),
            0, 1
        );


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


    const renderer =
        new THREE.WebGLRenderer({
            antialias: true
        });

    renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, 2)
    );

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type =
        THREE.PCFSoftShadowMap;

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
        Luces
    */

    const ambientCfg = config.lights.ambient;

    scene.add(
        new THREE.AmbientLight(
            ambientCfg.color,
            ambientCfg.intensity
        )
    );


    const keyCfg = config.lights.key;

    const keyLight =
        new THREE.DirectionalLight(
            keyCfg.color,
            keyCfg.intensity
        );

    keyLight.position.set(
        keyCfg.position.x,
        keyCfg.position.y,
        keyCfg.position.z
    );

    keyLight.castShadow = true;

    keyLight.shadow.mapSize.set(
        keyCfg.shadowMapSize,
        keyCfg.shadowMapSize
    );

    // Límites provisorios (valor de respaldo, ver
    // shadowCameraBounds en galeria-config.js) — se
    // recalculan más abajo con el ancho real de la fila.
    keyLight.shadow.camera.left =
        -keyCfg.shadowCameraBounds;
    keyLight.shadow.camera.right =
        keyCfg.shadowCameraBounds;
    keyLight.shadow.camera.top =
        keyCfg.shadowCameraBounds;
    keyLight.shadow.camera.bottom =
        -keyCfg.shadowCameraBounds;

    keyLight.shadow.bias =
        keyCfg.shadowBias;

    scene.add(keyLight);


    const fillCfg = config.lights.fill;

    const fillLight =
        new THREE.DirectionalLight(
            fillCfg.color,
            fillCfg.intensity
        );

    fillLight.position.set(
        fillCfg.position.x,
        fillCfg.position.y,
        fillCfg.position.z
    );

    scene.add(fillLight);


    // El piso/mesa se arma más abajo, tras conocer el
    // bbox real de la fila (se ajusta exactamente a él,
    // ver config.table en galeria-config.js).

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
        DEBUG TEMPORAL (agregado para investigar por qué
        el centrado de bbox en "fichas" —galeria-carrusel.js—
        sólo parece funcionar en 2 de 5 elementos): además
        de desplazamientoBase, ahora también se loguea el
        bbox COMPLETO (min/max en X/Y/Z) y su centro en
        X/Z —los mismos valores que usa
        createCarouselController vía "bboxesPorIndice"
        para calcular pivotX/pivotY/pivotZ—, para poder
        comparar los 5 elementos de un vistazo y detectar
        cualquier bbox degenerado (min≈max≈0), repetido
        entre índices, o sospechosamente simétrico en X
        cuando no debería serlo. Sacar este bloque (dejar
        sólo el de arriba) una vez resuelto.
    */
    console.log(
        "[debug bbox] desplazamientoBase por " +
        "elemento:",
        preparados.map((p, i) => ({
            i,
            generadorId: elementos[i].generadorId,
            desplazamientoBase: p.desplazamientoBase
        }))
    );

    console.log(
        "[debug bbox] bbox completo por elemento " +
        "(min/max y centro X/Z — mismos valores que " +
        "usa galeria-carrusel.js para pivotX/Y/Z):",
        preparados.map((p, i) => ({
            i,
            generadorId: elementos[i].generadorId,
            min: {
                x: p.bbox.min.x,
                y: p.bbox.min.y,
                z: p.bbox.min.z
            },
            max: {
                x: p.bbox.max.x,
                y: p.bbox.max.y,
                z: p.bbox.max.z
            },
            centroX: (p.bbox.min.x + p.bbox.max.x) / 2,
            centroY: (p.bbox.min.y + p.bbox.max.y) / 2,
            centroZ: (p.bbox.min.z + p.bbox.max.z) / 2
        }))
    );

    console.log(
        "[debug bbox] restY global " +
        "(máximo de arriba):", restY
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
    const positions =
        calculatePositions(
            preparados.map(p => p.bbox),
            config.row.spacing
        );

    /*
        Layout real de la fila para un "order" dado —
        misma calculatePositions() de arriba, pero
        alimentada con los bbox de quien ocupa cada slot
        en ESE order, no en el crudo.

        Hace falta porque el gap entre vecinos que arma
        calculatePositions depende del ancho real de
        quien ocupa cada slot: en cuanto otro elemento
        (de ancho distinto) pasa a ocupar ese slot —cosa
        que ya pasa desde el arranque, ver
        galeria-reordenar.js— "positions" (arriba) deja
        de ser válido para ese order. Quien reordena debe
        llamar a esta función cada vez que "order" cambia
        y usarla también como fuente de "positions", no
        solo de "order".
    */
    function computeRowPositions(order) {

        return calculatePositions(
            order.map(cupID => bboxesPorIndice[cupID]),
            config.row.spacing
        );

    }


    // Vértices de bounding box de TODA la fila, en
    // mundo — insumo del solver de centrado
    // (verticesMundoDeFila). No dependen del aspecto de
    // la ventana: se calculan una vez y se reutilizan
    // acá y en cada resize().
    const worldVertices =
        verticesMundoDeFila(
            preparados, positions, restY
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

        Tiene que ser POLAR (no solo escalar la distancia
        en X con Z fijo): si no, el ángulo de vista se
        achata cuanto más ancha es la fila, y con una fila
        muy ancha los elementos terminan ocluyéndose entre
        sí. Escalar dx y dz juntos mantiene el mismo grado
        de escorzo sin importar cuánto crezca la fila.

        Se guarda en "cameraPos" (no en
        config.camera.position) para que todo lo que
        necesite la posición real de la cámara use
        siempre el mismo valor.
    */
    const xsFila =
        worldVertices.map(v => v.x);

    const loFila = Math.min(...xsFila);
    const hiFila = Math.max(...xsFila);
    const anchoFila = hiFila - loFila;

    /*
        lookAtY real (reemplaza a config.camera.lookAtY,
        que queda solo como respaldo para fila vacía): se
        usa la MEDIANA de la altura de cada elemento, no
        el punto medio entre el Y mínimo y máximo de toda
        la fila. Las alturas son dispares entre elementos
        (ver "protomartir", con más del doble de alto que
        el resto — confirmable con el debug de bounding
        boxes) y promediar extremos absolutos deja el
        punto de mira muy arriba, empujando a la mayoría
        de los elementos hacia la mitad inferior del
        cuadro. La mediana es tolerante a ese outlier: el
        costo es que su punta puede quedar recortada por
        el borde superior de pantalla, a cambio de que la
        mayoría quede bien encuadrada (ver
        encuadre-camara.md).
    */
    const ysFila =
        worldVertices.map(v => v.y);

    const zsFila =
        worldVertices.map(v => v.z);

    const topesPorElemento =
        preparados.map(p => restY + p.bbox.max.y);

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
            ? Math.min(...ysFila)
            : 0;

    const lookAtYReal =
        worldVertices.length > 0
            ? (baseFila + medianaTope) / 2
            : config.camera.lookAtY;

    console.log(
        "[debug bbox] topes por elemento (Y):",
        topesPorElemento,
        " mediana:", medianaTope,
        " baseFila:", baseFila,
        " lookAtYReal:", lookAtYReal
    );


    /*
        Piso/mesa: plano INVISIBLE (THREE.ShadowMaterial
        — sin superficie de color propia, solo tiñe la
        zona donde cae sombra) dimensionado al bbox real
        de la fila (xsFila para X, zsFila para Z).

        PlaneGeometry en vez de Cylinder: la fila es
        angosta en Z (la profundidad de un elemento) y
        ancha en X (toda la fila), así que un ancho/
        profundidad independientes cubren mejor que un
        único radio — sobre todo porque la cara frontal
        de cada elemento está en z=0 (ver
        "desplazamientoFrente" en prepararGeometria) y la
        fila se extiende hacia Z negativo, no simétrica
        alrededor de 0.
    */
    const tableCfg = config.table;

    const loFilaZ =
        worldVertices.length > 0
            ? Math.min(...zsFila)
            : 0;

    const hiFilaZ =
        worldVertices.length > 0
            ? Math.max(...zsFila)
            : 0;

    const tableWidth =
        (hiFila - loFila) + tableCfg.padding * 2;

    const tableDepth =
        (hiFilaZ - loFilaZ) + tableCfg.padding * 2;

    const table =
        new THREE.Mesh(
            new THREE.PlaneGeometry(
                Math.max(tableWidth, tableCfg.padding),
                Math.max(tableDepth, tableCfg.padding)
            ),
            new THREE.ShadowMaterial({
                opacity: tableCfg.shadowOpacity,
                depthWrite: false
            })
        );

    /*
        depthWrite:false + renderOrder:-1: los conos
        también son "transparent" (ver crearMaterial en
        armarGroup3D, para el fade de revelado), y
        Three.js ordena la cola de objetos transparentes
        de forma aproximada (por objeto, no por píxel).
        Sin esto, el plano puede terminar dibujándose
        DESPUÉS de partes de algún cono que caen bajo
        y=0 y, como sí escribiría profundidad, esas
        partes del cono quedarían ocluidas. Forzando al
        plano a no escribir profundidad y a dibujarse
        siempre primero, queda fuera de esa pelea por
        completo — la sombra en sí no depende de esto
        (sale del shadow map de la luz), así que se ve
        igual.
    */
    table.renderOrder = -1;

    // PlaneGeometry nace parada en el plano XY (mirando
    // a +Z) — se acuesta sobre XZ, mirando hacia +Y, con
    // -90° en X.
    table.rotation.x = -Math.PI / 2;

    table.position.set(
        (loFila + hiFila) / 2,
        // Un pelo por debajo de 0: evita z-fighting con
        // la base de cualquier elemento apoyado en y=0.
        -0.001,
        (loFilaZ + hiFilaZ) / 2
    );

    table.receiveShadow = true;

    scene.add(table);


    /*
        ==================================================
        DEBUG TEMPORAL — cajas de bounding box visibles.
        Poner DEBUG_BOUNDING_BOXES en "false" (o borrar
        este bloque) una vez resuelto el problema de
        centrado reportado.

        Una caja semitransparente por elemento (con el
        bbox real que usa calculatePositions/
        verticesMundoDeFila) más una caja para el bbox
        TOTAL de la fila (blanca, más tenue) — así se ve
        a ojo, en la propia escena, si lo que el código
        entiende por "centrado" coincide con lo que se
        espera visualmente, en vez de inferirlo indirecto
        desde una captura de pantalla.

        A diferencia de la versión anterior (un solo
        dibujo, con el orden crudo, al armar la escena),
        estas cajas ahora se arman/rearman con
        dibujarCajasDebug(order) — mismo "order" que usa
        computeLookAtX — así siguen mostrando la silueta
        REAL, sea cual sea el criterio de orden vigente
        en el GUI, no solo la del arranque.
        ==================================================
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

            const min = {
                x: slot.x + bbox.min.x,
                y: restY + bbox.min.y,
                z: slot.z + bbox.min.z
            };

            const max = {
                x: slot.x + bbox.max.x,
                y: restY + bbox.max.y,
                z: slot.z + bbox.max.z
            };

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

        console.log(
            "[debug bbox] caja TOTAL de la fila " +
            "(mundo), orden vigente:", minTotal, maxTotal
        );

    }

    const anguloVista =
        config.camera.anguloVistaGrados *
        Math.PI / 180;

    // Centro real de la fila en X — mismo punto que usa
    // la mesa más abajo. Es el pivote del arco de cámara
    // (cameraPosFromMagnitud/setCameraLado): por
    // construcción simétrica, los puntos "más allá del
    // extremo derecho" e "izquierdo" quedan a la misma
    // distancia de este centro, sobre un mismo círculo.
    const cxFila = (loFila + hiFila) / 2;

    /*
        Lado vigente de la cámara: 0 = más allá del
        extremo DERECHO (arranque, fases "hero"/
        "proyecto"), 1 = más allá del extremo IZQUIERDO
        (fases "orden"/"fichas"/"final"). Durante
        "revelado" viaja de 0 a 1 (ver setCameraLado()).
        Se guarda acá para que resize() y
        calcularMagnitudRasante() —que llaman a
        cameraPosFromMagnitud(m) sin pasar "t"— respeten
        el lado vigente en vez de asumir siempre el mismo
        extremo.
    */
    let ladoActual = 0;

    /*
        cameraPosFromMagnitud(m, t): arma un ARCO real
        alrededor de cxFila (mismo radio para cualquier
        "t") y devuelve la posición sobre ese arco para
        "t" (0 = extremo derecho, 1 = extremo izquierdo,
        valores intermedios = puntos sobre el arco). "m"
        es la magnitud (fracción del ancho de fila): la
        usan el camino normal (escritorio,
        m=margenRasante), el "fit to width" de celular
        (m por bisección) y "revelado" (m=magnitudRasante
        vigente, t=avance de la fase).

        "t" por defecto toma "ladoActual", así que
        cualquier llamada que no sepa nada de "lado"
        (resize(), la bisección de findFittedMagnitude)
        mantiene la posición angular vigente en vez de
        resetear al extremo derecho.
    */
    function cameraPosFromMagnitud(m, t = ladoActual) {

        const magnitud = m * anchoFila;

        const dx =
            magnitud * Math.cos(anguloVista);

        const dz =
            magnitud * Math.sin(anguloVista);

        if (worldVertices.length === 0) {

            return {
                x: config.camera.position.x,
                y: config.camera.position.y,
                z: config.camera.position.z
            };

        }

        // Vector cxFila -> extremo derecho, en el plano
        // XZ: su magnitud es el radio del arco, su
        // ángulo el punto de partida (t=0). El punto de
        // llegada (t=1) es el reflejo especular de ese
        // ángulo respecto al eje Z — mismo radio, lado
        // opuesto del centro.
        const vx = anchoFila / 2 + dx;
        const vz = dz;

        const radio = Math.hypot(vx, vz);

        const anguloDerecha = Math.atan2(vz, vx);
        const anguloIzquierda = Math.PI - anguloDerecha;

        const anguloActual =
            anguloDerecha +
            (anguloIzquierda - anguloDerecha) * t;

        return {
            x: cxFila + radio * Math.cos(anguloActual),
            y: config.camera.position.y,
            z: radio * Math.sin(anguloActual)
        };

    }


    // Rango de búsqueda para findFittedMagnitude(), más
    // abajo — generoso a propósito (0.02 = cámara casi
    // pegada a la fila, 8 = carísimamente lejos) para no
    // forzar el resguardo de "sin cambio de signo" en un
    // caso con solución real (ver galeria-utils.js).
    const MAGNITUD_MIN = 0.02;
    const MAGNITUD_MAX = 8;

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

        return findFittedMagnitude(
            cameraPosFromMagnitud,
            lookAtYReal,
            config.camera.lookAtZ,
            worldVertices,
            config.camera.fov,
            aspectActual,
            MAGNITUD_MIN,
            MAGNITUD_MAX
        );

    }


    let magnitudRasante =
        calcularMagnitudRasante(aspect);

    let cameraPos =
        cameraPosFromMagnitud(magnitudRasante);

    camera.position.set(
        cameraPos.x, cameraPos.y, cameraPos.z
    );


    /*
        Fog: se deriva de la distancia real entre la
        cámara y el punto más lejano del bbox de la fila
        (los vértices completos, no solo "hiFila", por si
        el punto más lejano cae en una esquina). Ver
        "nearFactor"/"farFactor" en galeria-config.js.

        Función aparte para poder llamarla de nuevo desde
        resize(): si la ventana cambia de apaisada a
        vertical, cameraPos hace un dolly real (no solo
        cambia el aspecto), así que el fog también hay
        que recalcularlo.
    */
    function recalcularFog(cameraPosActual) {

        const distMax =
            worldVertices.length > 0
                ? Math.max(
                    ...worldVertices.map(v =>
                        Math.hypot(
                            v.x - cameraPosActual.x,
                            v.y - cameraPosActual.y,
                            v.z - cameraPosActual.z
                        )
                    )
                  )
                : config.scene.fog.farFactor;

        scene.fog.near =
            config.scene.fog.nearFactor * distMax;
        scene.fog.far =
            config.scene.fog.farFactor * distMax;

    }

    recalcularFog(cameraPos);


    // Frustum de sombra del keyLight: semiancho real de
    // la fila más un margen fijo (para que la sombra no
    // quede recortada en el borde), en vez del valor fijo
    // de respaldo. Cuadrado porque la fila es más ancha
    // en X que profunda en Z.
    if (worldVertices.length > 0) {

        const shadowBounds =
            anchoFila / 2 +
            keyCfg.shadowCameraPadding;

        keyLight.shadow.camera.left = -shadowBounds;
        keyLight.shadow.camera.right = shadowBounds;
        keyLight.shadow.camera.top = shadowBounds;
        keyLight.shadow.camera.bottom = -shadowBounds;

        keyLight.shadow.camera.updateProjectionMatrix();

    }


    const matCfg = config.material;

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
        El punto de mira en X se calcula solo, para
        que la fila quede centrada sin importar
        cuántos elementos haya (ver
        findCenteredLookAtX en galeria-utils.js).
    */

    const lookAtX =
        findCenteredLookAtX(
            cameraPos,
            lookAtYReal,
            config.camera.lookAtZ,
            worldVertices,
            config.camera.fov,
            aspect
        );

    camera.lookAt(
        lookAtX,
        lookAtYReal,
        config.camera.lookAtZ
    );


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

        return order.map((cupID, i) => ({
            x: pos[i].x,
            y: restY + bboxesPorIndice[cupID].max.y,
            z: pos[i].z
        }));

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

        return order.map((cupID, i) => ({
            x: pos[i].x,
            y: restY + bboxesPorIndice[cupID].min.y,
            z: pos[i].z + bboxesPorIndice[cupID].max.z
        }));

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

        return findHiddenDrop(
            cameraPosActual,
            {
                x: lookAtXActual,
                y: lookAtYReal,
                z: config.camera.lookAtZ
            },
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

        computePuntosInferioresFila(order).forEach(punto => {

            const ndc =
                projectToNdc(
                    cameraPosActual,
                    {
                        x: lookAtXActual,
                        y: lookAtYReal,
                        z: config.camera.lookAtZ
                    },
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
                    bbox: bboxesPorIndice[cupID]
                })),
                computeRowPositions(order),
                restY
            );

        return findCenteredLookAtX(
            cameraPos,
            lookAtYReal,
            config.camera.lookAtZ,
            lookAtWorldVertices,
            config.camera.fov,
            camera.aspect
        );

    }


    // Aplica un lookAtX ya calculado (computeLookAtX) a
    // la cámara. Separado en dos pasos para que quien
    // anima la cámara llame a setLookAtX() en cada frame
    // con un X intermedio interpolado, sin saltar de
    // golpe al final.
    function setLookAtX(x) {

        camera.lookAt(
            x,
            lookAtYReal,
            config.camera.lookAtZ
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

        cameraPos =
            cameraPosFromMagnitud(magnitudRasante);

        camera.position.set(
            cameraPos.x, cameraPos.y, cameraPos.z
        );

        recalcularFog(cameraPos);

        // El punto de mira que mejor centra la fila
        // también cambia con el aspecto de la ventana.
        const newLookAtX =
            findCenteredLookAtX(
                cameraPos,
                lookAtYReal,
                config.camera.lookAtZ,
                lookAtWorldVertices,
                config.camera.fov,
                newAspect
            );

        camera.lookAt(
            newLookAtX,
            lookAtYReal,
            config.camera.lookAtZ
        );

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
        extremo derecho (t=0) y el izquierdo (t=1) — ver
        cameraPosFromMagnitud/cxFila más arriba. Misma
        cadena de recálculo que resize() (fog, lookAtX,
        hiddenDrop), pero disparada por el avance de la
        fase "revelado" (galeria.js la llama en cada frame
        de esa fase), no por un cambio de aspecto — por
        eso NO toca camera.aspect/updateProjectionMatrix/
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
            "revelado". Durante "orden" eso es t=1 en cada
            frame aunque la cámara ya esté asentada ahí —
            si se recalculara el lookAt igual, cada llamada
            pisaría con un salto la interpolación suave que
            reorder.step() hace ese mismo frame vía
            setLookAtX() (ver fromLookAtX/toLookAtX en
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

        recalcularFog(cameraPos);

        const nuevoLookAtX =
            findCenteredLookAtX(
                cameraPos,
                lookAtYReal,
                config.camera.lookAtZ,
                lookAtWorldVertices,
                config.camera.fov,
                camera.aspect
            );

        camera.lookAt(
            nuevoLookAtX,
            lookAtYReal,
            config.camera.lookAtZ
        );

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
    // Ya NO toca "table": desde que el piso es un plano
    // invisible (ShadowMaterial, solo recibe sombra) no
    // tiene superficie de color propia que sincronizar.
    function actualizarColoresTema() {

        const fondo =
            colorFondoEscena();

        scene.background = fondo;

        scene.fog.color.copy(fondo);

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

        resize,
        computeLookAtX,
        setLookAtX,
        setCameraLado,
        actualizarCajasDebug: dibujarCajasDebug,
        actualizarColoresTema,
        getHiddenDrop,
        getRowBottomScreenY,

        // Recalcula hiddenDropActual/filaBottomNdcYActual
        // para un "order" nuevo — debe llamarse cada vez
        // que "order" cambia de verdad (ver
        // galeria-reordenar.js).
        actualizarHiddenDropParaOrden
    };

}


/*
    Calcula la posición X de cada slot de la fila a
    partir del bounding box REAL (en X) de cada elemento.
    "gap" es la separación mínima libre entre el borde
    derecho de un elemento y el borde izquierdo del
    siguiente (no distancia centro-a-centro).

    No se asume que cada geometría esté centrada en su
    propio origen local (igual que en Y, ver
    desplazamientoBase): se usan los bordes reales
    bbox.min.x/max.x, así que el cálculo es correcto
    incluso con geometrías asimétricas.

    Se arma primero una fila "cruda" arrancando en x=0, y
    al final se traslada en bloque para que quede
    centrada sobre el bounding box real del conjunto.
*/
function calculatePositions(bboxesX, gap) {

    const count = bboxesX.length;

    if (count === 0) return [];

    const positions = [];

    let x = 0;

    positions.push({ x, z: 0 });

    for (let i = 1; i < count; i++) {

        const bordeDerechoAnterior =
            x + bboxesX[i - 1].max.x;

        const bordeIzquierdoActual =
            bboxesX[i].min.x;

        /*
            Slot i: el más chico que deja, entre el
            borde derecho del elemento anterior (ya
            ubicado) y el borde izquierdo de éste, al
            menos "gap" de separación.
        */
        x =
            bordeDerechoAnterior +
            gap -
            bordeIzquierdoActual;

        positions.push({ x, z: 0 });

    }


    const bordeIzquierdoTotal =
        positions[0].x + bboxesX[0].min.x;

    const bordeDerechoTotal =
        positions[count - 1].x +
        bboxesX[count - 1].max.x;

    const centroTotal =
        (bordeIzquierdoTotal + bordeDerechoTotal) / 2;

    positions.forEach(p => {

        p.x -= centroTotal;

    });


    return positions;

}