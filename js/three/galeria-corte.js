/* ==================================================
   galeria-corte.js

   Corte por planos ("clippingPlanes" de three.js) sobre la
   geometría del elemento en foco durante "fichas" — solo
   recorta, NO intenta tapar/rellenar el corte.

   VERSIÓN ANTERIOR (reemplazada): la primera versión de este
   archivo portaba "createPlaneStencilGroup" del ejemplo
   oficial de three.js "webgl_clipping_stencil" — una técnica
   de stencil que TAPA el agujero del corte con una tapa
   sólida, pensada para geometría CERRADA (un volumen sin
   bordes, como el TorusKnot de ese demo: el stencil cuenta
   cruces de caras front/back para saber "achá hay un agujero
   en un sólido, hay que rellenarlo"). Las geometrías
   paramétricas de esta galería (ver protomartir.js,
   acceso-cardenas.js) son SUPERFICIES ABIERTAS —una sola capa,
   sin volumen cerrado, ya renderizada como dos mallas
   front/back para simular espesor sin culling (ver
   armarGroup3D en galeria-escena.js)—, no sólidos: no hay
   ningún "adentro" real que rellenar, y el conteo de stencil
   del ejemplo da resultados basura sobre geometría no cerrada
   (el artefacto amarillo reportado). Cortar una lámina abierta
   con un plano simplemente le saca un pedazo, sin nada
   "detrás" que tapar — es el resultado geométricamente
   correcto para este tipo de contenido, así que esta versión
   NO arma stencil ni tapas: solo asigna "clippingPlanes" a los
   materiales que ya existen (mallaFrontal/mallaTrasera) y listo.
   Si en algún momento se suma geometría CERRADA de verdad a la
   galería, ahí sí valdría la pena reincorporar la técnica de
   tapa — para lo que hay hoy, sería complejidad sin beneficio
   (y con el bug de fondo que reportó el usuario).

   NO conoce el DOM: solo recibe "percent"/"invertido" ya
   decodificados — ver galeria-corte-controles.js para los
   sliders/botones reales y cómo llaman a este archivo.

   ====================================================
   POR QUÉ HAY DOS REPRESENTACIONES DE CADA PLANO (LOCAL Y
   MUNDO):

   Cada elemento ("cono") se mueve y rota TODO el tiempo
   durante "fichas" (posición sobre el arco del carrusel,
   autorotado, rotado manual, escala de énfasis — ver
   galeria-carrusel.js), y "material.clippingPlanes" de
   three.js SIEMPRE se evalúa en espacio de MUNDO, sin
   excepción. Si se le pasara un plano fijo a esas materiales,
   el corte quedaría atado a coordenadas de la ESCENA, no del
   OBJETO: al girar el elemento, el plano se vería
   "atravesarlo" desde un ángulo distinto en vez de cortarlo
   siempre por el mismo eje local — visualmente, el corte
   "orbitaría" alrededor del objeto en vez de girar CON él.

   La solución: cada eje tiene un plano LOCAL (normal/constant
   calculados en las coordenadas de la propia geometría — el
   mismo espacio que "geometry.boundingBox"/"bboxesPorIndice",
   ver galeria-escena.js/galeria-carrusel.js) que solo cambia
   cuando el visitante mueve el slider o invierte el eje — y un
   plano de MUNDO (el que de verdad reciben los materiales),
   recalculado CADA FRAME a partir del local vía
   "Plane.applyMatrix4(matrixWorld)". Los objetos de plano de
   MUNDO se MUTAN in-place (.copy() + .applyMatrix4(), nunca se
   reasignan) — así el array "clippingPlanes" que ya tiene cada
   material sigue apuntando a los mismos objetos para siempre,
   sin tener que reasignárselo en cada frame.
   ====================================================

   POR QUÉ "INVERTIR" NO ES UN ESPEJO — bug real de la primera
   versión, reportado y corregido: invertir un eje NO debe
   mover el límite del corte a la posición opuesta del rango
   (eso lo espeja, un bug) — debe dejar el límite EXACTAMENTE
   donde está y cambiar únicamente qué lado se conserva. Con el
   bbox normalizado 0..1 y el corte en 0.25: sin invertir se ve
   [0, 0.25]; invertido tiene que verse [0.25, 1] (complementario,
   mismo límite) — nunca [0.75, 1] (que sería el límite
   reflejado a (1 - 0.25), un eje distinto).

   Por eso "constantLocal" usa el MISMO "b = min + percent*
   (max-min)" para los dos estados — invertir solo cambia el
   signo de la normal (y, para mantener la convención de plano
   de three.js, el signo del constant también, pero sobre el
   mismo "b", no sobre "1-percent").

   CONSTRUCCIÓN PEREZOSA POR CONO: los 2 planos (local/mundo)
   por eje se crean recién la primera vez que un cono se activa
   acá, cacheados en "cono.userData.corte" — no arma nada para
   el resto de los elementos que el visitante nunca llega a
   enfocar con "Corte" abierto.

   SOLO EL ELEMENTO EN FOCO CORTA A LA VEZ: cambiar de foco
   (setElementoActivo) desactiva al anterior — le saca los
   "clippingPlanes" a sus materiales y le resetea el estado a
   "sin cortar" para la próxima vez que se vuelva a enfocar— y
   activa al nuevo.

   HECHO — el bbox cacheado acá SÍ se invalida cuando
   galeria-panel-parametros.js reconstruye la geometría de
   un cono en caliente (mismo caso que ya afecta al pivote
   de rotación): ver invalidarBboxCono(), exportada más
   abajo justamente para que ese panel la llame después de
   recalcular el bbox de cada elemento.
================================================== */


import * as THREE from "three";


const EJES = ["x", "y", "z"];

/*
    Normal LOCAL "no invertido" de cada eje: apunta hacia el
    lado NEGATIVO de su eje, así que a percent=1 el plano queda
    en bbox.max (nada clippeado) y a percent=0 en bbox.min
    (casi todo clippeado) — ver "constantLocal" más abajo.
*/
const NORMAL_BASE = {
    x: new THREE.Vector3(-1, 0, 0),
    y: new THREE.Vector3(0, -1, 0),
    z: new THREE.Vector3(0, 0, -1)
};


function estadoPorDefecto() {

    return { x: { percent: 1, invertido: false },
             y: { percent: 1, invertido: false },
             z: { percent: 1, invertido: false } };

}


/*
    Plano LOCAL para un eje/percent/invertido, contra el bbox
    LOCAL de esa geometría (mismo espacio que "bboxesPorIndice",
    ver la cabecera del archivo).

    "b" es el límite del corte, y es EL MISMO para los dos
    estados de "invertido" — ver "POR QUÉ INVERTIR NO ES UN
    ESPEJO" en la cabecera del archivo: invertir solo cambia
    qué lado de ESE límite se conserva, nunca dónde está el
    límite.

    No invertido: normal apunta al lado negativo del eje,
    constant=b — conserva x<=b (percent=1 → b=max → nada
    clippeado; percent=0 → b=min → casi todo clippeado).

    Invertido: normal opuesta, constant=-b — conserva x>=b, el
    mismo "b" con el lado dado vuelta.
*/
function planoLocalPara(eje, percent, invertido, bbox) {

    const min = bbox.min[eje];
    const max = bbox.max[eje];

    const b = min + percent * (max - min);

    if (!invertido) {

        return new THREE.Plane(
            NORMAL_BASE[eje].clone(), b
        );

    }

    return new THREE.Plane(
        NORMAL_BASE[eje].clone().negate(), -b
    );

}


/*
    Refresca "cono.userData.corte" contra un bbox NUEVO,
    preservando el estado (percent/invertido) que el
    visitante ya tenía puesto en cada eje — ver el
    "IMPORTANTE" de la cabecera del archivo: exactamente el
    caso que faltaba cubrir, ahora que
    galeria-panel-parametros.js SÍ reconstruye geometría en
    caliente.

    No-op si el cono todavía no tiene infraestructura de
    corte armada (nunca se activó "Corte" para él) — no hay
    nada que refrescar, se va a construir bien de cero, con
    el bbox correcto, la primera vez que se active.

    "planosMundo" NO se toca acá a propósito: son los mismos
    3 objetos Plane que sincronizarMundo() muta in-place cada
    frame (ver "obtenerEstadoActivo" más abajo) — quedan
    stale hasta el próximo frame de "fichas", pero
    sincronizarMundo() ya corre siempre que ese cono está
    activo, así que se autocorrigen solos sin que este
    módulo tenga que recalcular nada de mundo acá.

    Exportada para que galeria-panel-parametros.js la llame
    justo después de recalcular el bbox de un elemento — ver
    ese archivo. Si el cono en cuestión es el que "Corte"
    tiene activo en este momento (activoInfo === el mismo
    objeto que se está mutando acá), el corte real
    (clippingPlanes) queda al día en el próximo frame sin
    que este módulo ni el panel necesiten coordinarse por
    ningún otro canal — es el mismo objeto en memoria.
*/
export function invalidarBboxCono(cono, nuevoBbox) {

    const info = cono.userData.corte;

    if (!info) return;

    info.bbox = nuevoBbox;

    EJES.forEach(eje => {

        const { percent, invertido } = info.estado[eje];

        info.planosLocales[eje] =
            planoLocalPara(
                eje, percent, invertido, nuevoBbox
            );

    });

}


function obtenerInfraestructura(cono, bbox) {

    if (cono.userData.corte) {

        return cono.userData.corte;

    }

    const planosMundo = {};
    const planosLocales = {};

    EJES.forEach(eje => {

        planosMundo[eje] = new THREE.Plane();

        planosLocales[eje] =
            planoLocalPara(eje, 1, false, bbox);

    });

    const info = {
        planosMundo,
        planosLocales,
        bbox,
        estado: estadoPorDefecto()
    };

    cono.userData.corte = info;

    return info;

}


export function createCorteController(
    { cones, bboxesPorIndice, onElementoCambiado } = {}
) {

    if (!cones || !bboxesPorIndice) {

        return {
            setElementoActivo() {},
            actualizarEje() {},
            invertirEje() { return false; },
            sincronizarMundo() {},
            obtenerEstadoActivo() { return null; },
            reset() {}
        };

    }


    let activoId = null;
    let activoInfo = null;


    /*
        Aplica un estado (percent/invertido) nuevo a UN eje del
        cono activo: recalcula su plano LOCAL. El plano de
        MUNDO correspondiente NO se toca acá — lo resuelve
        "sincronizarMundo()" en el próximo frame (ver la
        cabecera del archivo, "por qué hay dos
        representaciones").
    */
    function aplicarEje(info, eje, percent, invertido) {

        info.estado[eje] = { percent, invertido };

        info.planosLocales[eje] =
            planoLocalPara(
                eje, percent, invertido, info.bbox
            );

    }


    function activar(id) {

        const cono = cones[id];

        if (!cono) return;

        const info =
            obtenerInfraestructura(
                cono, bboxesPorIndice[id]
            );

        const [mallaFrontal, mallaTrasera] =
            cono.userData.mallas;

        const planosArray =
            EJES.map(eje => info.planosMundo[eje]);

        mallaFrontal.material.clippingPlanes =
            planosArray;

        mallaTrasera.material.clippingPlanes =
            planosArray;

        activoId = id;
        activoInfo = info;

    }


    function desactivar() {

        if (activoId === null) return;

        const cono = cones[activoId];

        if (cono) {

            const [mallaFrontal, mallaTrasera] =
                cono.userData.mallas;

            mallaFrontal.material.clippingPlanes = [];
            mallaTrasera.material.clippingPlanes = [];

            /*
                Vuelve el ESTADO (no solo los materiales) a
                "sin cortar" — así, si el visitante vuelve a
                enfocar este mismo elemento más adelante,
                arranca otra vez sin corte, en vez de heredar
                el que había dejado la vez anterior (mismo
                criterio que el resto de los controles de
                "fichas" — autorotar, zoom, etc.).
            */
            EJES.forEach(eje =>
                aplicarEje(activoInfo, eje, 1, false)
            );

        }

        activoId = null;
        activoInfo = null;

    }


    return {

        /*
            Mismo patrón que
            interaccionFicha.setElementoActivo/
            zoom.setObjetoActivo en galeria.js: se llama
            TODOS los frames de "fichas" con el foco vigente,
            sin que quien llama necesite saber si cambió — acá
            adentro es un no-op barato si el id es el mismo de
            ya (el caso común, todos los frames salvo el del
            cambio de foco).
        */
        setElementoActivo(id) {

            if (id === activoId) return;

            desactivar();

            if (id !== null && id !== undefined) {

                activar(id);

                if (onElementoCambiado) {

                    onElementoCambiado(id);

                }

            }

        },

        /*
            "eje": "x"|"y"|"z". "percent": 0..1 (el slider del
            DOM, 0-100, es responsabilidad de
            galeria-corte-controles.js convertirlo). No-op si
            no hay cono activo (p.ej. un evento tardío justo al
            cambiar de fase).
        */
        actualizarEje(eje, percent) {

            if (activoId === null) return;

            aplicarEje(
                activoInfo,
                eje,
                percent,
                activoInfo.estado[eje].invertido
            );

        },

        /*
            Devuelve el nuevo estado "invertido" (o null si no
            hay cono activo) para que
            galeria-corte-controles.js pueda reflejarlo en
            "aria-pressed" sin tener que preguntarle a este
            módulo por separado.
        */
        invertirEje(eje) {

            if (activoId === null) return null;

            const nuevoInvertido =
                !activoInfo.estado[eje].invertido;

            aplicarEje(
                activoInfo,
                eje,
                activoInfo.estado[eje].percent,
                nuevoInvertido
            );

            return nuevoInvertido;

        },

        /*
            Se llama UNA VEZ POR FRAME durante "fichas",
            DESPUÉS de que carousel.update() ya movió/rotó al
            cono este frame (ver la cabecera del archivo, "por
            qué hay dos representaciones") — no-op barato si no
            hay cono activo.
        */
        sincronizarMundo() {

            if (activoId === null) return;

            const cono = cones[activoId];
            const [mallaFrontal] = cono.userData.mallas;

            /*
                Fuerza el recálculo de matrixWorld a partir de
                la posición/rotación/escala YA fijadas este
                frame por carousel.update(), sin esperar al
                recorrido automático que hace el renderer recién
                al llamar a renderer.render() — necesitamos el
                valor FRESCO ahora, para que los planos de mundo
                que se computan a continuación reflejen este
                mismo frame y no el anterior.
            */
            mallaFrontal.updateWorldMatrix(true, false);

            EJES.forEach(eje => {

                activoInfo.planosMundo[eje]
                    .copy(activoInfo.planosLocales[eje])
                    .applyMatrix4(mallaFrontal.matrixWorld);

            });

        },

        /*
            Lectura de solo consulta del estado vigente del
            corte — para que OTRO módulo (ver
            galeria-corte-interseccion.js, el switch "Mostrar
            intersección") pueda calcular curvas de
            intersección sin duplicar el estado que ya vive
            acá adentro (mismo criterio de "inyectar la
            decisión, no importar el módulo ajeno" que ya usa
            el resto de esta página: galeria.js llama a esto y
            le pasa el resultado a galeria-corte-interseccion.js,
            este módulo no conoce a ese otro).

            Devuelve null si no hay ningún cono cortando en
            este momento. Los objetos que devuelve
            (planosLocales, planosMundo, bbox, estado) son los
            MISMOS que usa este módulo puertas adentro — de
            solo lectura, quien los reciba no debería
            mutarlos. "planosMundo" en particular es seguro de
            guardar por referencia y usar en un THREE.PlaneHelper
            (ver galeria-plano-corte.js): son los mismos 3
            objetos Plane que "sincronizarMundo()" MUTA in-place
            cada frame (ver la cabecera del archivo) — un
            PlaneHelper que apunte a ellos se actualiza solo,
            sin que este módulo ni el que los usa tengan que
            reasignar nada frame a frame.
        */
        obtenerEstadoActivo() {

            if (activoId === null) return null;

            return {
                id: activoId,
                cono: cones[activoId],
                bbox: activoInfo.bbox,
                planosLocales: activoInfo.planosLocales,
                planosMundo: activoInfo.planosMundo,
                estado: activoInfo.estado
            };

        },

        /*
            Mismo momento que
            autorotar.reset()/zoom.reset()/etc. — los 4 puntos
            donde galeria.js sale de "fichas" (ver ese
            archivo). Desactiva lo que estuviera activo y
            resetea su estado, dejando el módulo entero sin
            ningún cono cortando.
        */
        reset() {

            desactivar();

        }

    };

}
