/* ==================================================
   galeria-escena.js

   Arma la escena de Three.js (cámara, luces, mesa y
   los "conos") a partir de un array de "elementos" ya
   normalizados (ver galeria-datos.js) y de CONFIG.

   Cada elemento indica en elemento.generadorId qué
   módulo de ./geometrias/ debe usarse para construir
   su geometría (ver normalizarElemento en
   galeria-config.js). Este módulo no sabe nada de
   edificios ni de fórmulas: solo importa el módulo
   indicado, le pide una geometría y arma con ella un
   par de mallas (frontal/trasera, sin backface
   culling) más el color por estado que ya trae cada
   elemento.

   THREE ya NO es global: se importa como módulo ES
   (ver el <script type="importmap"> de galeria.html).
================================================== */

import * as THREE from 'three';
import {
    findCenteredLookAtX,
    findFittedMagnitude,
    findHiddenDrop,
    projectToNdc
} from "./galeria-utils.js";
import { obtenerFuncionConstructora } from "./galeria-generadores.js";


/*
    Nombre del generador de respaldo (fallback), para
    cualquier elemento sin módulo dedicado todavía
    (elemento.generadorId === null/undefined) o cuyo
    import() falle. Debe existir como archivo en
    ./geometrias/.
*/
const GENERADOR_RESPALDO = "cono-sinusoidal";


/*
    Caché de módulos ya importados, por generadorId.
    Evita reimportar el mismo módulo una vez por cada
    elemento que lo use (por ejemplo, si a futuro dos
    edificios distintos comparten geometría).
*/
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
    ==================================================
    COLORES DE LA ESCENA SEGÚN EL TEMA
    (fondo, niebla, mesa)

    A diferencia del color de cada elemento (por
    estado de conservación, ver ESTADO_COLOR en
    galeria-config.js — ese NO cambia con el tema),
    el fondo/niebla/mesa de la escena sí siguen el
    tema claro/oscuro del sitio: se leen en vivo desde
    las variables CSS --color-fondo / --color-fondo-alt
    (ver variables.css), igual que hace
    js/fondo-3d.js con el fondo decorativo de
    index.html. Así, si el visitante cambia de tema
    mientras está en galeria.html, createScene()
    devuelve "actualizarColoresTema()" para
    recalcularlos sin tener que recrear toda la escena
    (ver el MutationObserver en galeria.js).
    ==================================================
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
    Carga el generador y construye la geometría de un
    elemento, con su bounding box ya calculado.

    Se separa de "armarGroup3D" (más abajo) porque el
    bounding box hace falta ANTES de poder fijar
    "positions" (ver calculatePositions): el espaciado
    de la fila ahora depende del ancho real de cada
    geometría procedural, así que createScene() necesita
    resolver todas las geometrías primero, calcular las
    posiciones a partir de sus bbox, y recién ahí armar
    los Group finales (ver más abajo, en createScene).

    Devuelve también "desplazamientoBase" (la mitad de
    la altura sobre el eje Y, ver detalle debajo), para
    que createScene() pueda calcular un restY global que
    acomode a todos los elementos sobre la mesa sin
    dejar a ninguno enterrado.

    ALINEACIÓN FRONTAL (eje Z): además del ajuste en Y,
    acá se traslada la geometría en Z para que su cara
    MÁS CERCANA A LA CÁMARA (bbox.max.z — la cámara está
    del lado +Z, mirando hacia lookAtZ=0, ver
    config.camera en galeria-config.js) quede en z = 0
    en su propio espacio local.

    Por qué hace falta esto y no alcanza con lo que ya
    hace calculatePositions() para X: en X, el espaciado
    de la fila ya se arma a partir de los bordes REALES
    de cada bbox (ver calculatePositions más abajo), así
    que ahí el origen local de cada geometría no importa.
    En Z, en cambio, cada elemento se sigue colocando en
    el mismo slot.z (siempre 0, ver "positions" en
    createScene) usando tal cual el origen local con el
    que su módulo generador construyó la geometría — y
    nada garantiza que todos los generadores centren su
    fórmula igual respecto a Z. Si dos elementos tienen
    profundidades (Z) distintas y ambos se paran con su
    ORIGEN en z=0 (en vez de con su CARA FRONTAL en
    z=0), sus caras frontales terminan a distancias
    distintas de la cámara. Con la cámara en escorzo
    (ver el ángulo "anguloVistaGrados" del comentario de
    cameraPos en createScene), esa diferencia de
    profundidad se proyecta también como una diferencia
    de tamaño/posición horizontal en pantalla — eso es
    lo que se percibía como "más hueco" alrededor de
    algunos elementos.

    Al hornear este ajuste directamente en la geometría
    (en vez de aplicarlo como un offset aparte al
    posicionar cada cono), el resto del código —
    calculatePositions, verticesMundoDeFila,
    galeria-reordenar.js, galeria-revelado.js, las cajas
    de debug— no necesita enterarse de nada: para todos
    ellos, la cara frontal de cada elemento YA está en
    su slot.z tal cual la leen, sin importar en qué
    posición de la fila (ni en qué orden, tras un
    reordenamiento) termine cada uno.
*/
/*
    Normaliza una geometría RECIÉN CONSTRUIDA por un
    generador: la alinea (cara frontal en z=0, ver
    "ALINEACIÓN FRONTAL" en el comentario grande de
    prepararGeometria() más abajo) y calcula todo lo que
    el resto de la escena necesita saber de ella — bbox
    ya alineado, desplazamientoBase, y bounding sphere
    (para raycasting/frustum culling, que Three.js NUNCA
    recalcula solo por reemplazar `geometry`).

    Extraída de prepararGeometria() para que
    galeria-panel-parametros.js pueda aplicar EXACTAMENTE
    el mismo criterio de alineación cuando reconstruye la
    geometría del elemento enfocado (sliders de
    "Geometría") — antes esa reconstrucción devolvía la
    geometría cruda del generador, sin alinear y sin
    bbox/sphere recalculados: el objeto quedaba con la
    cara frontal desalineada de su slot.z y con un bbox
    stale (el del objeto ANTERIOR), y además — ver
    posicionarPivote() más abajo — el pivote de rotación
    seguía apuntando al centro viejo. Ver
    geometria-recalculo-centroide.md.
*/
export function normalizarGeometriaElemento(geometry) {

    geometry.computeBoundingBox();

    const desplazamientoFrente =
        -geometry.boundingBox.max.z;

    geometry.translate(0, 0, desplazamientoFrente);

    /*
        Se recalcula DESPUÉS del translate: el bbox
        crudo (antes de mover la geometría) ya cumplió
        su propósito —calcular desplazamientoFrente—
        pero de acá en más (desplazamientoBase, X del
        elemento, verticesMundoDeFila, cajas de debug,
        etc.) todo el resto del código tiene que ver el
        bbox YA alineado, no el original.
    */
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const bbox = geometry.boundingBox;

    /*
        Desplazamiento en Y necesario para que el
        punto MÁS BAJO de esta geometría quede en
        y = 0 si el Group se colocara en el origen
        (no todas las fórmulas están centradas en su
        propio eje, a diferencia del ConeGeometry
        original).
    */
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
    Arma, para un elemento, el Group con las dos
    mallas (frontal y trasera, sin backface culling —
    mismo patrón que fondo-3d.js), a partir de una
    geometría YA construida por prepararGeometria() (no
    se vuelve a invocar el generador ni a recomputar el
    bounding box).
*/
/*
    Coloca (o RECOLOCA) el pivote de rotación de un
    elemento y compensa las mallas para que, con
    rotation.y = 0, el resultado visual no cambie — ver
    el comentario grande de armarGroup3D() más abajo
    sobre por qué existe este pivote separado.

    Extraída para que galeria-panel-parametros.js pueda
    llamarla de nuevo cada vez que reconstruye la
    geometría del elemento enfocado: el nuevo bbox puede
    tener su centro X/Z corrido respecto al que se usó
    para construir el pivote la primera vez, y si nadie
    lo recalcula, el pivote de rotación queda desalineado
    del bbox nuevo — exactamente el mismo bug que este
    pivote vino a resolver, reintroducido cada vez que se
    mueve un slider de "Geometría".
*/
export function posicionarPivote(pivote, mallaFrontal, mallaTrasera, bbox) {

    const pivotX = (bbox.min.x + bbox.max.x) / 2;
    const pivotZ = (bbox.min.z + bbox.max.z) / 2;

    pivote.position.set(pivotX, 0, pivotZ);

    mallaFrontal.position.set(-pivotX, 0, -pivotZ);
    mallaTrasera.position.set(-pivotX, 0, -pivotZ);

}


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
        PIVOTE DE ROTACIÓN, separado del grupo de
        posicionamiento.

        "group" (más abajo) es el que reordenar/revelado
        posicionan vía cone.position.set(x, restY, z) —
        su origen local es el punto de ANCLAJE de la
        geometría (base en y=0 por desplazamientoBase,
        cara frontal en z=0 por desplazamientoFrente, ver
        prepararGeometria), no necesariamente el CENTRO
        del bounding box. Girar "group" directamente
        (como se hacía antes) rotaba entonces alrededor
        de ese punto de anclaje: si el anclaje no
        coincide con el centro real del objeto, el
        objeto no gira en el lugar, "orbita"/se corre
        mientras rota — el bug reportado.

        Para separar "dónde se ancla" de "alrededor de
        qué gira", las mallas se cuelgan de un grupo
        intermedio ("pivote"), corrido al centro real
        del bbox en X/Z (Y no importa: rotation.y no
        mueve el eje Y). Las mallas, a su vez, se corren
        exactamente lo opuesto — así el resultado visual
        con rotación 0 es IDÉNTICO a antes (no se mueve
        nada), pero rotation.y ahora gira alrededor del
        centro real, no del anclaje.

        "geometry.boundingBox" ya está calculado y
        cacheado desde prepararGeometria() (incluye el
        translate de la cara frontal, ver ese
        comentario) — no hace falta recomputarlo acá.
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
        Se guarda una referencia al módulo generador,
        a las dos mallas, y a color/matCfg: lo usa
        galeria-panel-parametros.js para poder
        reconstruir geometría Y material en vivo
        (parámetros de la fórmula, tipo de material
        sólido/normales, overlay de malla)
        sin que este módulo (galeria-escena.js)
        necesite saber nada de paneles ni de lil-gui.

        HECHO: galeria-panel-parametros.js reemplaza la
        geometría de las mallas en vivo, y como el nuevo
        bbox puede tener un centro X/Z distinto,
        recalcula "pivote.position" y el offset de las
        mallas con el mismo criterio — ver
        posicionarPivote(), exportada más arriba
        justamente para que ese panel la reuse en vez de
        reimplementar el cálculo.

        "indice" (= elemento.indice, el mismo id/cupID
        que usa bboxesPorIndice más abajo) se guarda acá
        para que ese mismo panel, tras reconstruir la
        geometría, pueda actualizar la entrada
        correspondiente de bboxesPorIndice — si no,
        galeria-carrusel.js/galeria-zoom.js/las cajas de
        debug seguirían viendo el bbox con el que se
        armó la escena la primera vez.
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
        escribiendo "cone.material.opacity = x" sin
        saber que por dentro hay dos mallas — así no
        hace falta tocar esos tres módulos.

        IMPORTANTE: lee/escribe a través de
        "mallaFrontal.material" / "mallaTrasera.material"
        (el material VIGENTE de cada mesh en este
        instante), no de las variables materialFrontal/
        materialTrasera capturadas arriba. Así, si el
        panel de parámetros más adelante reemplaza el
        material (por ejemplo al cambiar a "estado" o
        "normales"), la opacidad de las fases A/B/C
        sigue funcionando sobre el material que esté
        puesto en cada momento, en vez de quedar
        aplicada a un material viejo ya desconectado
        de la malla.

        TAMBIÉN empuja al overlay de malla (ver
        galeria-panel-material.js), si este grupo tiene
        uno puesto (group.userData.overlayMalla) — pedido
        explícito: el overlay de malla tiene que atenuarse
        con la distancia al foco exactamente igual que la
        superficie sólida, no quedar siempre a su opacidad
        fija (0.22/0.9) sin importar cuán lejos del
        ancla/ficha destacada esté ese elemento. Se
        multiplica "valor" (el mismo factor de fundido por
        distancia que ya reciben mallaFrontal/mallaTrasera)
        por "overlay.userData.opacidadBase" — la opacidad
        BASE que decide galeria-panel-material.js según el
        tipo de material (0.22 normal, 0.9 con "ninguno";
        ver actualizarAristasVisualDeGrupo en ese archivo)
        — este módulo (galeria-escena.js) no sabe nada de
        esos números, sólo compone: valor final = fundido ×
        base. Si "opacidadBase" todavía no está seteado
        (overlay recién creado, antes de la primera pasada
        de actualizarAristasVisualDeGrupo) se usa 1 como
        default inofensivo, para no dejar la malla en 0 por
        un frame.
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
    no por el punto central de cada slot (ver esa
    función en galeria-utils.js).

    "preparados[i].bbox" está en el espacio LOCAL de
    cada geometría (el mismo en el que se mide
    bbox.min.y para desplazamientoBase); para llevarlo
    a mundo se le suma la posición del slot en X/Z
    (positions[i]) y "restY" en Y — el mismo criterio
    de posicionamiento que usan galeria-revelado.js/
    galeria-reordenar.js/galeria-carrusel.js cuando un
    elemento está en su lugar de reposo (ver, por
    ejemplo, el caso "moved: false" en
    galeria-reordenar.js: "cone.position.set(to.x,
    restY, to.z)").

    Se arma sobre TODOS los elementos sin importar
    fase/visibilidad, a propósito: el Objetivo 2 pide
    reencuadrar por el conjunto completo, nunca por
    objeto — mismo criterio que ya usaba
    findCenteredLookAtX antes de este cambio.
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
    ==================================================
    DEBUG TEMPORAL — quitar (o poner
    DEBUG_BOUNDING_BOXES en false, ver createScene) una
    vez resuelto el problema de centrado reportado.

    Dibuja un bounding box (dado por sus esquinas
    "min"/"max" en coordenadas de MUNDO) como una caja
    semitransparente + aristas — para poder ver a ojo,
    en la propia escena, qué bounding box está usando
    de verdad el cálculo de centrado, en vez de inferirlo
    indirectamente a partir de capturas de pantalla.
================================================== */
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

    /*
        Fondo y niebla: mismo tono, calculado en vivo
        a partir de --color-fondo (ver
        colorFondoEscena() arriba) — sigue el tema
        claro/oscuro del sitio desde el arranque, y
        actualizarColoresTema() (devuelta más abajo)
        permite recalcularlo si el visitante cambia de
        tema sin recargar la página.
    */

    scene.background =
        colorFondoEscena();

    /*
        near/far del fog se fijan más abajo (ver
        "distMax" en este mismo createScene), una vez
        conocida la distancia real entre la cámara y el
        punto más lejano de la fila — no puede ser
        antes por la misma razón que cameraPos: depende
        del bbox real, que sólo se conoce tras el
        Promise.all de los generadores.
    */
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

    /*
        Posición X real: se fija más abajo (ver
        "cameraX" en este mismo createScene), una vez
        conocido el bbox real de la fila — no puede ser
        antes, porque depende de un cálculo async
        (cargar los generadores). Acá sólo se deja
        colocada en Y/Z (que sí son fijos) para que la
        cámara exista como objeto desde ya; su X
        arranca en el valor de respaldo de config
        (fila vacía) y se sobreescribe apenas se
        conoce el ancho real.
    */
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

    /*
        Habilita que "material.clippingPlanes" (ver
        galeria-corte.js) realmente recorte geometría — sin
        esto three.js ignora cualquier plano de clipping
        asignado a un material, sea cual sea. "local" (no
        "global") porque cada elemento define sus propios 3
        planos según SU bbox — no hay un único set de planos
        compartido por toda la escena.

        NO hace falta "stencil: true" acá: galeria-corte.js
        solo recorta (clippingPlanes puro), no arma ninguna
        tapa rellena vía stencil buffer — la técnica de tapa
        del ejemplo de three.js "webgl_clipping_stencil" no
        aplica a la geometría paramétrica ABIERTA de esta
        galería (ver la cabecera de galeria-corte.js).
    */
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

    /*
        Límites provisorios (valor de respaldo, ver
        comentario de shadowCameraBounds en
        galeria-config.js) — se recalculan más abajo,
        una vez conocido el ancho real de la fila (ver
        "shadowBounds" en este mismo createScene).
    */
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


    /*
        El piso/mesa se arma más abajo, DESPUÉS de
        conocer el bounding box real de la fila (ver
        "loFila/hiFila"/"zsFila") — no puede dimensionarse
        acá porque, a diferencia del disco de radio fijo
        que tenía antes, ahora se ajusta exactamente a
        ese bbox (ver comentario grande junto a su
        creación, más abajo, y config.table en
        galeria-config.js).
    */


    /*
        Geometrías (antes: un único ConeGeometry
        compartido, ahora: un módulo procedural por
        elemento, ver prepararGeometria arriba).

        Se resuelven todas en paralelo antes de
        seguir, porque cargar un módulo de
        ./geometrias/ es asíncrono (import()
        dinámico) — y porque el espaciado de la fila
        (calculatePositions, más abajo) ya necesita
        conocer el bounding box real de cada una antes
        de poder fijar "positions".
    */

    const preparados =
        await Promise.all(
            elementos.map(prepararGeometria)
        );

    /*
        bbox de cada elemento, indexado por
        "elemento.indice" (el mismo id que usa
        galeria-reordenar.js como "cupID" en su
        "order"). "preparados" está en el mismo orden
        que "elementos", y elemento.indice === su
        posición en ese array (ver normalizarElemento
        en galeria-config.js) — por eso alcanza con
        este map directo, sin necesidad de un
        Map/objeto por id.

        Es el insumo de computeLookAtX()/
        dibujarCajasDebug() (más abajo): a
        diferencia de "positions" (que son los SLOTS
        físicos, fijos), esto permite reconstruir la
        silueta real de la fila para CUALQUIER orden
        de ocupación de esos slots, no solo el orden
        crudo con el que se armó la escena.
    */
    const bboxesPorIndice =
        preparados.map(p => p.bbox);


    /*
        restY global: en vez del antiguo
        "geoCfg.height / 2" (pensado para un único
        ConeGeometry compartido), se usa el mayor
        desplazamiento de base que pida cualquiera
        de los elementos, para que ninguno quede
        enterrado en la mesa. Como cada geometría
        tiene su propia proporción (son exploraciones
        geométricas que todavía se van a ajustar),
        los más "bajos" pueden quedar levemente
        flotando por ahora — ver conversación sobre
        normalizar con bounding box.
    */

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
        Posiciones de la fila, para el orden CRUDO
        (índice = elemento.indice, no necesariamente el
        orden que se ve primero en pantalla — ver
        computeRowPositions más abajo para eso).

        Se usa ACÁ ADENTRO solo como aproximación de
        bootstrap: cameraPos, fog y el frustum de sombra
        dependen del ANCHO TOTAL de la fila, que —a
        diferencia del gap entre pares puntuales— sí es
        casi invariante ante una permutación de los
        mismos elementos (ver el comentario grande de
        "cameraPos" más abajo). Para todo lo demás
        —colocar cada elemento, centrar la cámara,
        dibujar las cajas de debug— hace falta el layout
        real de CUALQUIER orden dado, no el de este
        orden crudo (ver computeRowPositions).

        A diferencia de la versión anterior (espaciado
        FIJO, sin relación al ancho real de cada
        elemento), acá se usa el bounding box en X de
        cada geometría (preparados[i].bbox) para
        separar cada par de elementos lo justo y
        necesario para no colisionar — ver
        calculatePositions más abajo.
    */

    const positions =
        calculatePositions(
            preparados.map(p => p.bbox),
            config.row.spacing
        );


    /*
        Layout REAL de la fila para un orden dado —
        misma calculatePositions() de arriba, pero
        alimentada con los bbox de "order" en vez de
        con los del orden crudo.

        Por qué hace falta esto y "positions" (arriba)
        no alcanza: cada slot de "positions" fue
        dimensionado (el gap hacia sus vecinos) en
        función del ANCHO del elemento que ocupaba ESE
        índice en el orden crudo. En cuanto un elemento
        de ancho distinto pasa a ocupar ese mismo slot
        —cosa que pasa siempre, no en un caso raro: el
        "order" inicial ya es el cronológico, no el
        crudo, ver galeria-reordenar.js— el gap hacia
        sus vecinos deja de ser el "config.row.spacing"
        pedido: puede quedar más chico o más grande
        según cuánto más angosto/ancho sea el nuevo
        ocupante respecto al original de ese slot. Eso
        es lo que se percibía como separación (entre
        CARAS de bounding box, no entre centros)
        despareja de un elemento a otro.

        computeRowPositions(order) resuelve esto
        recalculando el layout completo para el orden
        efectivamente vigente en cada momento — mismo
        criterio que ya usa computeLookAtX(order) más
        abajo para la cámara, ahora aplicado también a
        dónde se para cada elemento. Quien reordena
        (galeria-reordenar.js) es quien debe llamarla
        cada vez que cambia "order" — tanto al armar el
        order inicial como en cada animateTo() — y
        volverse la fuente de verdad también de
        "positions", no solo de "order" (ver su propio
        comentario de cabecera).
    */

    function computeRowPositions(order) {

        return calculatePositions(
            order.map(cupID => bboxesPorIndice[cupID]),
            config.row.spacing
        );

    }


    /*
        Vértices de bounding box de TODA la fila, en
        mundo — insumo del solver de centrado (ver
        verticesMundoDeFila arriba). No dependen del
        aspecto de la ventana, así que se calculan UNA
        sola vez y se reutilizan tanto acá como en cada
        resize() más abajo.
    */

    const worldVertices =
        verticesMundoDeFila(
            preparados, positions, restY
        );


    /*
        Posición real de la cámara: más allá del
        extremo izquierdo del bounding box REAL de la
        fila, en un desplazamiento POLAR (dx, dz) —
        magnitud proporcional al ancho total, ángulo
        fijo respecto al eje de la fila (ver comentario
        de "margenRasante"/"anguloVistaGrados" en
        galeria-config.js). Reemplaza a
        config.camera.position.x/z, que sólo quedan
        como respaldo para el caso límite de fila
        vacía.

        Importante que sea POLAR y no sólo "cameraX
        más lejos": si sólo se escalara la distancia en
        X (dejando z fijo, como en un primer intento),
        el ÁNGULO de vista se achata cuanto más ancha es
        la fila — con una fila muy ancha, la cámara
        termina casi en el mismo eje de los elementos y
        se ocluyen por completo entre sí. Escalar dx y
        dz juntos, a partir del mismo ángulo, mantiene
        el mismo grado de "escorzo" (ni de perfil ni
        rasante al punto de tapar todo) sin importar
        cuánto crezca o achique la fila.

        Se guarda en "cameraPos" (no en
        config.camera.position, que no se toca) para
        que TODO lo que necesite la posición real de la
        cámara —el propio camera.position.set(), el
        solver de lookAtX acá abajo, y el mismo solver
        en cada resize()— use siempre el mismo valor.
    */

    const xsFila =
        worldVertices.map(v => v.x);

    const loFila = Math.min(...xsFila);
    const hiFila = Math.max(...xsFila);
    const anchoFila = hiFila - loFila;

    /*
        lookAtY real: reemplaza a config.camera.lookAtY,
        que sólo queda como respaldo para el caso límite
        de fila vacía.

        Segunda versión de este cálculo: la primera
        promediaba el Y mínimo y el Y máximo de TODA la
        fila (punto medio de los extremos absolutos).
        Eso resultó vulnerable a un solo outlier: con
        datos reales, "protomartir" (H_top=39 en su
        propio módulo, contra H_apex≈11-17 en el resto —
        ver protomartir.js) mide 3.51 de alto, entre 2×
        y casi 5× más que los demás elementos (confirmado
        con el debug de bounding boxes). Promediar
        extremos absolutos dejaba el punto de mira muy
        arriba (≈1.76), empujando a los otros CUATRO
        elementos —la mayoría— hacia la mitad inferior
        del cuadro, chicos y apretados.

        Se decidió (conversación con el arquitecto)
        dejar las alturas de las geometrías como están
        por ahora (siguen siendo placeholders, ver
        encuadre-camara.md) y hacer que el ENCUADRE sea
        tolerante a ese tipo de outlier: en vez del punto
        medio de los extremos, se usa la MEDIANA de la
        altura de cada elemento — así un único pico
        desproporcionado no pesa más que el resto sólo
        por ser más alto. El costo aceptado es que la
        punta de ese pico puede quedar recortada por el
        borde superior de pantalla; a cambio, la mayoría
        de los elementos queda bien encuadrada.
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
        — no tiene superficie de color propia, sólo tiñe
        la zona donde cae sombra) dimensionado al
        bounding box REAL de la fila, ya conocido acá
        (xsFila para X, zsFila para Z — este último no se
        usaba hasta ahora). Reemplaza al disco de radio
        fijo que había antes (ver historial en
        config.table, en galeria-config.js): ese radio
        fijo (7.4) no alcanzaba a cubrir filas más anchas
        y, al estar centrado en z=0, quedaba desfasado
        respecto al bbox real en Z (la cara FRONTAL de
        cada elemento está en z=0 — ver
        "desplazamientoFrente" en prepararGeometria() — y
        la fila se extiende hacia atrás, a Z negativo, no
        de forma simétrica alrededor de 0).

        PlaneGeometry en vez de Cylinder: permite un
        ancho (X) y una profundidad (Z) independientes,
        en vez de forzar un único radio — la fila es
        angosta en Z (la profundidad de un solo elemento)
        y ancha en X (todos los elementos en fila), así
        que un círculo era, de por sí, la forma menos
        eficiente para cubrirla.
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
                /*
                    FIX: por defecto todo material de
                    Three.js escribe en el depth buffer
                    aunque sea "transparent" (ShadowMaterial
                    ya viene con transparent=true, pero
                    depthWrite sigue en true salvo que se
                    lo pise acá). Los conos TAMBIÉN son
                    transparent (ver crearMaterial en
                    armarGroup3D, para el fade de
                    revelado) y su depthWrite queda en su
                    default (true) — así que plano y conos
                    compiten por el depth buffer en la
                    cola de objetos transparentes, que en
                    Three.js se ordena de forma aproximada
                    (por objeto, no por píxel). Cuando la
                    geometría de un elemento cae por
                    debajo de y=0 (donde vive este plano),
                    esa cola aproximada puede terminar
                    dibujando el plano DESPUÉS de esa
                    parte del cono; como el plano sí
                    escribía profundidad, el test de
                    profundidad descartaba esos fragmentos
                    del cono — eso es la oclusión reportada
                    durante la rotación vertical.

                    depthWrite:false saca al plano de esa
                    pelea por completo: nunca vuelve a
                    poder tapar nada vía depth test, sea
                    cual sea el orden en que la cola
                    transparente decida dibujar. La sombra
                    en sí no depende de esto (sale del
                    shadow map de la luz, no del depth
                    buffer de la escena), así que se ve
                    exactamente igual.
                */
                depthWrite: false
            })
        );

    /*
        FIX (complemento de depthWrite:false, arriba):
        fuerza a que el plano se dibuje ANTES que
        cualquier otro objeto transparente (conos
        incluidos), sin importar cómo los ordene Three.js
        por distancia. Con esto el plano queda siempre
        "pintado" primero y todo lo demás se dibuja
        encima con normalidad — nunca al revés.
    */
    table.renderOrder = -1;

    /*
        PlaneGeometry nace parada en el plano XY (mirando
        a +Z) — se acuesta sobre XZ, mirando hacia +Y
        (arriba), rotándola -90° en X.
    */
    table.rotation.x = -Math.PI / 2;

    table.position.set(
        (loFila + hiFila) / 2,
        /*
            Un pelo por debajo de 0 (no exactamente 0):
            evita z-fighting con la base de cualquier
            elemento que se apoye justo en y=0 (ver
            restY/desplazamientoBase). Ya no depende de
            "thickness" (el plano no tiene espesor).
        */
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

    /*
        Centro real de la fila en X — mismo punto que ya
        usa la mesa/piso más abajo ((loFila+hiFila)/2).
        Es el pivote del arco de cámara (ver
        cameraPosFromMagnitud/setCameraLado): por
        construcción simétrica del offset polar
        original, el punto "más allá del extremo
        derecho" y el punto "más allá del extremo
        izquierdo" quedan a la MISMA distancia de este
        centro, así que ambos ya caen sobre un mismo
        círculo sin ningún cálculo adicional.
    */
    const cxFila = (loFila + hiFila) / 2;

    /*
        Lado vigente de la cámara: 0 = más allá del
        extremo DERECHO (arranque de la galería, fases
        "hero"/"proyecto"), 1 = más allá del extremo
        IZQUIERDO (fases "orden"/"fichas"/"final" en
        adelante). Durante "revelado" viaja de 0 a 1 —
        ver setCameraLado() más abajo, que es quien lo
        actualiza. Se guarda acá (no solo como parámetro
        de cameraPosFromMagnitud) para que resize() y
        calcularMagnitudRasante()/findFittedMagnitude()
        —que llaman a cameraPosFromMagnitud(m) SIN pasar
        "t"— respeten el lado vigente en vez de asumir
        siempre el mismo extremo.
    */
    let ladoActual = 0;

    /*
        cameraPosFromMagnitud(m, t): ya no arma un punto
        fijo "más allá del extremo izquierdo" — arma un
        ARCO real alrededor de cxFila (mismo radio para
        cualquier "t", ver comentario de cxFila arriba)
        y devuelve la posición sobre ese arco para el
        parámetro "t" (0 = extremo derecho, 1 = extremo
        izquierdo, cualquier valor intermedio = punto
        sobre el arco entre ambos). "m" sigue siendo la
        magnitud (fracción del ancho de fila) que ya
        usaba la fórmula original — la usa tanto el
        camino normal (escritorio, m = margenRasante)
        como el "fit to width" de más abajo (celular, m
        resuelto por bisección) como el nuevo camino de
        revelado (m = magnitudRasante vigente, t = avance
        de la fase).

        "t" por defecto toma "ladoActual" (no un valor
        fijo): así, cualquier llamada existente que no
        sepa nada de "lado" (resize(), la bisección de
        findFittedMagnitude) automáticamente mantiene la
        posición angular vigente en vez de resetear al
        extremo derecho en cada resize.
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

        /*
            Vector cxFila -> extremo derecho, en el
            plano XZ. Su magnitud (Math.hypot) es el
            radio del arco; su ángulo (Math.atan2) es
            el punto de partida (t=0). El punto de
            llegada (t=1, extremo izquierdo) es el
            reflejo especular de ese ángulo respecto al
            eje Z (Math.PI - anguloDerecha) — mismo
            radio, lado opuesto del centro.
        */

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


    /*
        Rango de búsqueda para findFittedMagnitude(),
        más abajo — generoso a propósito (0.02 = cámara
        casi pegada a la fila, 8 = carísimamente lejos)
        para no acotar de más y forzar el resguardo de
        "sin cambio de signo" (ver ese comentario en
        galeria-utils.js) en un caso que sí tenía
        solución real.
    */

    const MAGNITUD_MIN = 0.02;
    const MAGNITUD_MAX = 8;

    /*
        Ventana VERTICAL (celular, o cualquier ventana
        angosta — no es un breakpoint de ancho fijo en
        píxeles, sino la relación real de aspecto): acá
        el margenRasante fijo, calibrado a mano para
        pantallas apaisadas, deja la fila recortada por
        los costados en vez de entrar completa (ver
        comentario grande de findFittedMagnitude en
        galeria-utils.js). Se resuelve por bisección la
        magnitud que hace que el ANCHO PROYECTADO de la
        fila ocupe el cuadro completo, de borde a borde,
        para el aspecto vigente.

        Se reevalúa en cada resize() (más abajo) —no
        sólo acá al armar la escena— para que rotar el
        celular, o pasar de apaisado a vertical
        agrandando/achicando la ventana del navegador,
        recalculen el encuadre correcto en cada caso.
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
        Fog: mismo criterio que cameraPos y el frustum
        de sombra — se deriva de la distancia REAL
        entre la cámara y el punto más lejano del
        bounding box de la fila (no sólo "hiFila": se
        usan los vértices completos, por si el punto
        más lejano no está en el eje X sino en una
        esquina del bbox). Ver "nearFactor"/"farFactor"
        en galeria-config.js.

        Se separa en función aparte (antes era un
        cálculo suelto acá) para poder llamarla de
        nuevo desde resize(): si la ventana pasa de
        apaisada a vertical (o viceversa), cameraPos se
        recalcula con una magnitud bien distinta —dolly
        real, no sólo un cambio de aspecto/FOV— así que
        el fog también tiene que recalcularse o queda
        mal calibrado para la nueva distancia.
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


    /*
        Frustum de sombra del keyLight: mismo criterio
        que cameraX — semiancho real de la fila (con un
        pequeño margen adicional, no proporcional, para
        que la sombra no quede recortada justo en el
        borde) en vez del valor fijo de respaldo. Un
        frustum ortográfico cuadrado alcanza porque la
        fila es más ancha en X que profunda en Z.
    */

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


    /*
        MARGEN_NDC_OCULTO: colchón extra por debajo
        del borde inferior real de pantalla (NDC.y =
        -1) al calcular hiddenDrop más abajo — así un
        elemento "escondido" no queda apenas rozando
        el borde, sino con margen de sobra.

        HIDDEN_DROP_MIN/MAX: rango de búsqueda para la
        bisección de findHiddenDrop() — mismo criterio
        que MAGNITUD_MIN/MAX más arriba: generoso a
        propósito para no forzar el resguardo de "sin
        cambio de signo" en un caso que sí tiene
        solución real.
    */

    const MARGEN_NDC_OCULTO = 0.06;
    const HIDDEN_DROP_MIN = 0;
    const HIDDEN_DROP_MAX = 60;

    /*
        FIX: antes, "puntosSuperioresFila" (y su gemelo
        "puntosInferioresFila", más abajo) eran arrays
        FIJOS, calculados una sola vez emparejando cada
        elemento con su slot de la fila CRUDA (bajo el
        supuesto — equivocado — de que esto era "casi
        invariante" ante una permutación, igual que
        cameraPos/fog/frustum de sombra).

        Ese supuesto vale para cameraPos/fog/sombra
        porque esos tres solo dependen del ANCHO TOTAL
        de la fila, que en efecto no cambia al permutar
        los mismos elementos entre los mismos slots. Pero
        acá lo que importa es la altura de CADA elemento
        en SU slot X/Z puntual — y como cada elemento
        tiene su propia geometría/tamaño, esa altura por
        slot SÍ cambia con el order: si un elemento "alto"
        pasa a ocupar un slot que en el order crudo tenía
        un elemento más bajo, el hiddenDrop calculado para
        el crudo se queda corto y el elemento alto asoma
        por el borde inferior de pantalla aunque
        galeria-revelado.js lo esté posicionando en
        "hiddenY" — el bug reportado: con el order default
        no se nota (ahí el emparejamiento crudo coincide
        con el vigente), pero se ve apenas se reordena una
        vez.

        Se convierten entonces en funciones de "order"
        (mismo patrón que computeLookAtX(order) más abajo
        y computeRowPositions(order) en galeria-reordenar.js):
        se recalculan con el layout y el bbox REAL de quien
        ocupa cada slot bajo ESE order, no bajo el crudo.
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
        Mismo criterio que computePuntosSuperioresFila
        (arriba), pero para el borde INFERIOR de la fila,
        tal cual se ve en pantalla — lo necesita galeria.js
        para no clavar #gui (los botones de reordenar) a
        media altura de la geometría 3D visible (bug
        reportado: en celular horizontal, con poca altura
        de viewport, la fila ocupa buena parte de la
        pantalla y #gui —que hasta ahora sólo perseguía el
        borde superior de la ficha, o un piso fijo en
        rem— podía terminar superpuesto con los conos).

        Se usa la esquina inferior-FRENTE de cada bbox
        (bbox.min.y: la más baja: bbox.max.z: la más
        cercana a cámara) en vez de sólo bbox.min.y en el
        slot: por perspectiva, la esquina más cercana a
        cámara es la que más "abajo" cae en pantalla, así
        que es la que de verdad determina dónde termina
        visualmente la fila, no sólo su altura real en Y.
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
        "order" vigente para efectos de hiddenDrop/
        filaBottomNdcY — arranca en el orden crudo (el
        único que existe todavía en este punto del
        armado; galeria-reordenar.js ni se construyó
        aún) y se actualiza en vivo vía
        actualizarHiddenDropParaOrden() (más abajo, parte
        del export), que galeria-reordenar.js llama cada
        vez que "order" cambia de verdad — tanto al
        construirse (el order inicial ya es el
        cronológico, no el crudo) como al terminar cada
        reordenamiento del GUI. resize()/setCameraLado()
        leen este mismo "ordenActual" en vez de un array
        fijo, para seguir siendo correctos aunque el
        resize/giro de cámara ocurra parado en un order
        distinto del inicial.
    */

    let ordenActual =
        elementos.map(el => el.indice);

    /*
        Cuánto hay que bajar (en Y) cualquier elemento
        "escondido" (fases "revelado"/"fichas") para
        que quede completamente fuera del frustum de
        la cámara VIGENTE — reemplaza al antiguo
        config.reveal.hiddenDrop fijo (ver
        galeria-config.js), que sólo estaba calibrado
        para el encuadre de escritorio: en pantallas
        angostas la cámara puede terminar más lejos de
        la fila (ver calcularMagnitudRasante más
        arriba), y a esa distancia un mismo "drop" fijo
        cubre menos pantalla — justo lo que se veía
        como cajas de debug asomando en la esquina en
        capturas de celular.

        Se recalcula acá (armado inicial), de nuevo en
        cada resize()/setCameraLado() —mismos
        disparadores que cameraPos/lookAtX, ver más
        abajo, usando siempre "ordenActual"— Y AHORA
        TAMBIÉN cada vez que "order" cambia de verdad
        (ver actualizarHiddenDropParaOrden(), más abajo):
        a diferencia de cameraPos/fog/sombra (que sólo
        dependen del ancho total de la fila, invariante
        ante una permutación), el hiddenDrop sí depende
        de qué elemento puntual cae en cada slot.
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

    /*
        Getter en vivo (mismo criterio que
        getPositions()/getOrder() en
        galeria-reordenar.js): quien lo consuma
        (galeria-revelado.js/galeria-carrusel.js) debe
        llamarlo en cada frame, no capturar su valor
        una sola vez al crear el controller — si no,
        un resize a mitad de sesión (rotar el celular,
        por ejemplo) dejaría el drop desactualizado.
    */

    function getHiddenDrop() {

        /*
            hiddenDropFactor (ver galeria-config.js):
            margen de seguridad parejo sobre el drop
            calculado — el cálculo por bisección da el
            mínimo teórico para el "order" vigente, pero
            es aproximado; en vez de perseguir precisión
            exacta para cada combinación elemento+slot,
            se infla el resultado un poco para cubrir el
            margen de error.
        */

        return (
            hiddenDropActual *
            config.reveal.hiddenDropFactor
        );

    }


    /*
        NDC.y (-1 abajo, 1 arriba) del punto más bajo de
        toda la fila, tal cual se ve con la cámara/lookAt
        VIGENTE — mismo criterio de recálculo que
        hiddenDropActual (ver calcularHiddenDrop, y el FIX
        de más arriba): se recalcula acá, de nuevo en cada
        resize()/setCameraLado() (usando "ordenActual"), y
        AHORA TAMBIÉN cada vez que "order" cambia de verdad
        vía actualizarHiddenDropParaOrden() — el punto más
        bajo de la fila sí depende de qué elemento puntual
        cae en el slot más cercano a cámara, así que no es
        invariante ante una permutación (mismo motivo que
        hiddenDropActual).
    */

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

    /*
        Getter en vivo (mismo criterio que
        getHiddenDrop()/getPositions()/getOrder()): se
        expresa en píxeles CSS relativos al contenedor de
        la escena (0 = borde superior del viewport), para
        que galeria.js lo pueda comparar directo contra
        getBoundingClientRect().top sin tener que
        convertir NDC del lado de allá.
    */

    function getRowBottomScreenY() {

        return (
            (1 - filaBottomNdcYActual) / 2
        ) * container.clientHeight;

    }


    /*
        Vértices de mundo que representan la silueta
        HOY apuntada por la cámara. Arranca igual a
        "worldVertices" (silueta del orden crudo, la
        misma que ya se usó arriba para cameraPos/fog/
        sombra) pero se reemplaza cada vez que se llama
        a computeLookAtX() — resize() la reutiliza para no
        volver a centrar sobre un orden viejo cuando
        cambia el aspecto de la ventana.
    */
    let lookAtWorldVertices = worldVertices;


    /*
        Recalcula el punto de mira en X que centraría la
        fila según un orden DADO de ocupación de los
        slots — no necesariamente el orden crudo con el
        que se armó la escena.

        "order" es un array posición -> índice de
        elemento (mismo formato que devuelve
        getOrder()/getSortedOrder() en
        galeria-reordenar.js: order[i] = qué elemento
        ocupa el slot "positions[i]"). No se sabe nada
        de criterios de orden acá: solo se usa para
        emparejar cada slot con el bbox real de quien
        lo ocupa.

        Deliberadamente NO recalcula cameraPos, fog ni
        el frustum de sombra: el ancho total de la fila
        (que es lo que gobierna esos tres) es, en la
        práctica, casi invariante ante una permutación
        de los mismos elementos entre los mismos slots
        — mover solo el punto de mira alcanza para que
        la silueta se vea centrada, sin el costo/riesgo
        de reubicar la cámara o la sombra en cada click
        del GUI.

        Es una función PURA respecto de la cámara: solo
        devuelve el X calculado (y de paso actualiza
        "lookAtWorldVertices", que sí es un cache
        legítimo para que resize() no vuelva a centrar
        sobre un orden viejo). No mueve la cámara — eso
        es tarea de setLookAtX(), más abajo. Se separan
        a propósito: quien reordena (hoy,
        galeria-reordenar.js) necesita el X DESTINO antes
        de que la cámara llegue ahí, para poder animar la
        transición entre el X viejo y el nuevo en vez de
        aplicarlo de un salto.
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


    /*
        Aplica un lookAtX ya calculado (ver
        computeLookAtX arriba) a la cámara. Separado en
        dos pasos para que quien mueve la cámara pueda
        llamar a setLookAtX() una vez por frame, con un
        X intermedio interpolado, en vez de saltar de
        golpe al X final apenas termina de recalcularse.
    */
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

        /*
            Dolly de cámara para pantallas verticales
            (ver calcularMagnitudRasante/cameraPosFromMagnitud
            más arriba): a diferencia de sólo centrar
            (lookAtX), esto SÍ puede cambiar cameraPos
            de verdad — por ejemplo, al rotar el celular
            de vertical a apaisado. Recalcularlo acá es
            lo que hace que ese cambio de orientación
            deje a la fila bien encuadrada en el nuevo
            aspecto, no sólo centrada en el viejo.
        */

        magnitudRasante =
            calcularMagnitudRasante(newAspect);

        cameraPos =
            cameraPosFromMagnitud(magnitudRasante);

        camera.position.set(
            cameraPos.x, cameraPos.y, cameraPos.z
        );

        recalcularFog(cameraPos);

        /*
            Al cambiar el aspecto de la ventana, el
            punto de mira que mejor centra la fila
            también cambia un poco: se recalcula
            para que el encuadre siga viéndose bien
            en cualquier tamaño de pantalla.
        */

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

        /*
            Mismo disparador que cameraPos/lookAtX de
            arriba: el drop necesario para esconder un
            elemento depende de la distancia y el
            ángulo de la cámara, así que hay que
            remedirlo cada vez que esos cambian, no
            solo al armar la escena.
        */
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
        extremo derecho (t=0) y el izquierdo (t=1) —
        ver cameraPosFromMagnitud/cxFila más arriba.
        Misma cadena de recálculo que ya dispara
        resize() al cambiar cameraPos de verdad (fog,
        lookAtX, hiddenDrop): acá el disparador no es un
        cambio de aspecto sino el avance de la fase
        "revelado" (ver galeria.js, que es quien llama a
        esto en cada frame de esa fase con el progreso
        0..1 del tramo).

        A diferencia de resize(), NO toca camera.aspect
        ni camera.updateProjectionMatrix()/renderer.
        setSize(): el aspecto de la ventana no cambió,
        solo la posición angular de la cámara sobre el
        arco — mezclar ambos disparadores en una sola
        función haría redundante (y más caro) llamar a
        setCameraLado() en cada frame de "revelado".

        "ladoActual" queda actualizado adentro de
        cameraPosFromMagnitud (le llega como "t" acá
        abajo y se guarda ahí mismo): así, si el visitante
        redimensiona la ventana a mitad de la cascada,
        resize() —que llama a cameraPosFromMagnitud(m)
        sin pasar "t"— retoma automáticamente el mismo
        punto del arco en el que iba, en vez de saltar al
        extremo derecho.
    */

    function setCameraLado(t) {

        /*
            galeria.js llama a esto en TODOS los frames
            de "hero"/"proyecto"/"orden"/"fichas", no
            solo en "revelado" (ver su propio comentario
            de cabecera): más simple que rastrear "recién
            entré a esta fase" ahí. Pero durante "orden"
            eso significa llamar con t=1 en cada frame
            aunque la cámara ya esté asentada ahí —si acá
            abajo se recalculara el lookAt igual, cada
            llamada pisaría con un salto la interpolación
            suave que reorder.step() está haciendo ESE
            MISMO frame vía setLookAtX() (ver
            fromLookAtX/toLookAtX en
            galeria-reordenar.js), y el reordenamiento se
            vería brusco en vez de disimulado.

            Por eso: si "t" ya es el lado vigente Y la
            posición resultante es la misma (mismo "m",
            mismo "t" => mismo resultado, determinista),
            no hay nada que mover — se sale sin tocar
            cameraPos/fog/lookAt/hiddenDrop, dejando que
            quien sí esté animando el punto de mira en
            este frame (reorder.step()) sea la única
            fuente de verdad de camera.lookAt(). Solo
            cuando el lado CAMBIA de verdad (t distinto,
            típicamente en cada frame de "revelado", o el
            primer frame al asentarse en un extremo) se
            recalcula la cadena completa.
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
        FIX: pieza que faltaba para que el reordenamiento
        no rompa hiddenDrop/filaBottomNdcY (ver el
        comentario grande junto a computePuntosSuperioresFila,
        más arriba). galeria-reordenar.js llama a esto en
        los dos únicos momentos en que "order" cambia de
        verdad — al construirse el controller (el order
        inicial ya es el cronológico, no el crudo) y al
        terminar cada animateTo() del GUI — exactamente el
        mismo par de momentos en que ya llama a
        actualizarCajasDebug(order).

        Recalcula con el lookAtX real del order NUEVO
        (mismo cálculo que ya hace computeLookAtX() por
        dentro para el propio reordenamiento) y con el
        cameraPos vigente — no hace falta esperar a que la
        cámara termine de animar su lookAt hacia ese punto:
        alcanza con que apunte más o menos ahí para que el
        hiddenDrop resultante sea el correcto.
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


    /*
        Se llama una vez ahora mismo para fijar el
        tamaño real del renderer desde el arranque
        (si no, el <canvas> se queda con el tamaño
        por defecto de WebGLRenderer —300×150px— y
        se ve estirado/pixelado hasta el primer
        resize de la ventana).
    */

    resize();


    /*
        Recalcula fondo/niebla a partir de las variables
        CSS vigentes en este instante. La llama
        galeria.js desde un MutationObserver que escucha
        cambios en el atributo data-tema del <html> — así,
        si el visitante alterna el tema mientras está
        parado en esta página, la escena 3D cambia de
        tono sin recargar y sin tener que reconstruir
        cámara, luces ni elementos.

        Ya NO toca "table": desde que el piso pasó a ser
        un plano invisible (ShadowMaterial, sólo recibe
        sombra — ver su creación más arriba), no tiene
        una superficie de color propia que sincronizar
        con el tema.
    */

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

        /*
            "positions": layout crudo, sólo válido para
            el orden con el que se armó la escena — NO
            usar para posicionar/animar elementos bajo
            ningún "order" real (ver comentario grande
            junto a su cálculo, más arriba). Se deja acá
            nada más que como valor de referencia/
            respaldo para el caso límite de fila vacía.

            Para posicionar/animar CUALQUIER order
            vigente, usar computeRowPositions(order),
            justo abajo — es lo que debe consumir
            galeria-reordenar.js (y, a través de su
            getPositions(), galeria-revelado.js) en vez
            de este array fijo.
        */
        positions,
        computeRowPositions,

        restY,

        /*
            bbox local (min/max.x/y/z) por cupID, ya
            calculado para el layout de la fila (ver
            "const bboxesPorIndice" más arriba). Lo
            consume createCarouselController para
            centrar cada elemento en su bbox real (no
            en su punto de anclaje frontal/base) al
            armar la curva línea->círculo, y para
            proyectar ese offset sobre la base que rota
            junto con la curva — ver galeria-carrusel.js.
        */
        bboxesPorIndice,

        resize,
        computeLookAtX,
        setLookAtX,
        setCameraLado,
        actualizarCajasDebug: dibujarCajasDebug,
        actualizarColoresTema,
        getHiddenDrop,
        getRowBottomScreenY,

        /*
            FIX: recalcula hiddenDropActual/filaBottomNdcYActual
            para un "order" nuevo — ver el comentario grande
            junto a computePuntosSuperioresFila. Debe llamarse
            cada vez que "order" cambia de verdad (ver
            galeria-reordenar.js).
        */
        actualizarHiddenDropParaOrden
    };

}


/*
    Calcula la posición X de cada slot de la fila a
    partir del bounding box REAL (en X) de cada
    elemento — "bboxesX[i]" es el boundingBox de la
    geometría i (objeto con .min.x / .max.x, en las
    coordenadas locales con las que esa geometría fue
    construida, el mismo espacio en el que ya se mide
    bbox.min.y para desplazamientoBase). "gap" es la
    separación mínima libre que debe quedar entre el
    borde derecho de un elemento y el borde izquierdo
    del siguiente (antes era config.row.spacing, usado
    como distancia centro-a-centro; ahora se usa como
    esa holgura mínima — ver comentario en
    galeria-config.js).

    No se asume que cada geometría esté centrada en su
    propio origen local (algunas fórmulas no lo están,
    igual que ya pasa en Y — ver desplazamientoBase):
    se usan los bordes reales bbox.min.x/bbox.max.x de
    cada una, así que el cálculo es correcto incluso
    con geometrías asimétricas.

    Se arma primero una fila "cruda" arrancando en
    x = 0 para el primer slot, y al final se traslada
    en bloque para que el borde izquierdo del primer
    elemento y el borde derecho del último queden
    centrados alrededor de x = 0 — mismo resultado que
    antes (fila centrada en abstracto), pero ahora
    centrado sobre el bounding box real del conjunto,
    no sobre un ancho fijo supuesto.
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