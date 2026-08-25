/* ==================================================
   galeria-plano-corte.js

   Switch "Mostrar plano de corte" (ver "#boton-mostrar-
   plano-corte", sección "Corte" del panel derecho). Dibuja,
   para los 3 ejes (X/Y/Z) del elemento en foco, el plano de
   corte en sí como un cuadrado con líneas cruzadas — a
   diferencia de galeria-corte-interseccion.js, que dibuja el
   BORDE donde ese plano cruza la geometría, esto dibuja el
   plano COMPLETO (recortado a un tamaño fijo proporcional al
   bbox), útil para entender la orientación del corte más que
   su silueta exacta.

   VISIBLE EN TODO EL RANGO [0,1], límites incluidos (pedido
   explícito): antes se ocultaba el plano de un eje si
   "percent" no era menor a 1 (el default, "sin cortar") —
   eso lo dejaba invisible justo en percent=1.0 exacto, el
   caso más común (el default de cada eje al arrancar). Ya no
   depende de si ese eje está recortando geometría de verdad
   en este momento: mientras el switch global esté prendido,
   los 3 planos se ven siempre, en la posición que le
   corresponda a cada "percent" actual.

   ====================================================
   HISTORIA — por qué esto NO usa THREE.PlaneHelper (versión
   anterior, con un bug real reportado por el usuario: el
   plano se veía corrido respecto a la geometría, y no
   giraba con el objeto ni en autorotado ni en arrastre
   manual):

   THREE.PlaneHelper SÍ calcula bien la orientación/posición
   del plano matemático — eso se confirmó a fondo (ver el
   historial de debug de este archivo, comparando a mano el
   plano recalculado contra el que ya usaba el helper: distancia
   ~0 siempre). El problema es otro, y es un límite conocido
   del propio THREE.PlaneHelper: el cuadrado FINITO que dibuja
   siempre queda centrado en el punto del plano más cercano al
   ORIGEN DEL MUNDO (ver su updateMatrixWorld: "lookAt(normal)"
   + "translateZ(-constant)" arrancando siempre desde
   posición (0,0,0) de su padre) — no en el objeto que se está
   cortando. Con geometría cerca del origen (como el ejemplo
   oficial "webgl_clipping_stencil", del que viene la técnica)
   eso no se nota. Acá los conos de "fichas" están dispuestos
   sobre un arco lejos del origen — el punto "más cercano al
   origen" cae en un lugar arbitrario, lejos de la geometría, y
   como ese punto se recalcula distinto en cada frame según la
   orientación del plano, el cuadrado se ve "flotando" en otro
   lado y sin girar visiblemente CON el cono (gira alrededor del
   origen del mundo, no alrededor del cono).

   LA SOLUCIÓN: dejar de posicionar nada en espacio de MUNDO.
   Este módulo arma el cuadrado en espacio LOCAL (mismo bbox
   que ya usa galeria-corte.js) centrado en el punto real del
   corte —b, centroDelBboxEnLosOtrosDosEjes— y lo cuelga como
   HIJO de "mallaFrontal", exactamente igual que las curvas de
   galeria-corte-interseccion.js y que la caja de debug que se
   usó para diagnosticar este bug. Al ser hijo, Three.js le
   compone automáticamente toda la cadena de transforms
   (carrusel, autorotado, arrastre manual, énfasis) en cada
   frame sin que este módulo tenga que sincronizar NADA a mano
   — ni "sincronizarMundo()", ni matrixWorld, ni Plane de
   mundo. Esto también simplifica el módulo: ya no hace falta
   ningún dato de "planosMundo", alcanza con "bbox" y "estado".
   ====================================================

   NO conoce el DOM (mismo criterio que
   galeria-corte-interseccion.js): el switch en sí vive
   cableado desde galeria.js, acá solo entra un booleano vía
   "setActivo". Tampoco se llama desde el tick de cada frame —
   solo en los momentos en que algo pudo haber cambiado (cambio
   de foco, mover un slider, invertir un eje, prender el
   switch): reposicionar/mostrar/ocultar es barato pero no hace
   falta hacerlo 60 veces por segundo si nadie tocó el corte —
   la ROTACIÓN/movimiento del cono no necesita ningún aviso
   porque ahora es automática, por jerarquía (ver arriba).

   TAMAÑO DEL CUADRADO: proporcional a la diagonal del bbox
   LOCAL del cono activo (mismo bbox que ya usa
   galeria-corte.js) — así se ve bien apoyado sobre la
   geometría sin importar si el elemento en foco es grande o
   chico, en vez de un tamaño fijo que a veces sobra y a veces
   se queda corto.
================================================== */


import * as THREE from "three";


const EJES = ["x", "y", "z"];

const COLOR_PLANO = 0x00e5ff;

/*
    Multiplica la diagonal del bbox para que el cuadrado quede
    un poco más grande que la geometría misma — ver "TAMAÑO
    DEL CUADRADO" en la cabecera.
*/
const FACTOR_TAMANO = 1.4;

/*
    Cuánto se levanta cada línea sobre la superficie a lo
    largo de la normal del corte, en unidades LOCALES — evita
    z-fighting con la propia geometría que corta sin depender
    de "depthTest:false" (que además tapaba mal contra otros
    elementos transparentes de la escena).
*/
const LEVANTE_LOCAL = 0.01;


/*
    Rotación (Euler, LOCAL) que lleva un THREE.PlaneGeometry
    —que por defecto vive en el plano XY, normal +Z— a quedar
    perpendicular a cada eje. El signo no importa acá: es un
    plano de visualización simétrico, no nos jugamos nada en
    "para qué lado mira".
*/
const ROTACION_PARA_EJE = {
    x: new THREE.Euler(0, Math.PI / 2, 0),
    y: new THREE.Euler(Math.PI / 2, 0, 0),
    z: new THREE.Euler(0, 0, 0)
};


function tamanoParaBbox(bbox) {

    return bbox.min.distanceTo(bbox.max) * FACTOR_TAMANO;

}


/*
    Centro LOCAL del cuadrado para un eje/percent dado: en el
    eje que corta, en el límite del corte ("b", mismo cálculo
    que "planoLocalPara" en galeria-corte.js); en los otros
    dos ejes, en el centro del bbox — así el cuadrado queda
    centrado sobre la geometría real, no sobre un punto
    arbitrario (ver la cabecera, "LA SOLUCIÓN").
*/
function centroParaCorte(eje, percent, bbox) {

    const centro = new THREE.Vector3(
        (bbox.min.x + bbox.max.x) / 2,
        (bbox.min.y + bbox.max.y) / 2,
        (bbox.min.z + bbox.max.z) / 2
    );

    const min = bbox.min[eje];
    const max = bbox.max[eje];

    centro[eje] = min + percent * (max - min);

    return centro;

}


/*
    Arma el cuadrado de un eje: borde + cruz (mismo look que
    THREE.PlaneHelper) más una tapa translúcida, todo como
    LineSegments/Mesh sin rotar/posicionar todavía — eso lo
    hace "reposicionar()" cada vez, según el eje/percent/bbox
    vigentes.
*/
function crearPlano() {

    const grupo = new THREE.Group();

    const mitad = 0.5;

    const puntosBorde = [
        new THREE.Vector3(-mitad, -mitad, 0),
        new THREE.Vector3(mitad, -mitad, 0),
        new THREE.Vector3(mitad, -mitad, 0),
        new THREE.Vector3(mitad, mitad, 0),
        new THREE.Vector3(mitad, mitad, 0),
        new THREE.Vector3(-mitad, mitad, 0),
        new THREE.Vector3(-mitad, mitad, 0),
        new THREE.Vector3(-mitad, -mitad, 0),
        /*
            Cruz en diagonales — une CORNERS opuestos (X) en
            vez de midpoints de lados opuestos (+). Puramente
            decorativa, para comparar look contra la versión
            con cruz en +.
        */
        new THREE.Vector3(-mitad, -mitad, 0),
        new THREE.Vector3(mitad, mitad, 0),
        new THREE.Vector3(-mitad, mitad, 0),
        new THREE.Vector3(mitad, -mitad, 0)
    ];

    const geometriaBorde =
        new THREE.BufferGeometry().setFromPoints(
            puntosBorde
        );

    const lineas = new THREE.LineSegments(
        geometriaBorde,
        new THREE.LineBasicMaterial({
            color: COLOR_PLANO,
            transparent: true,
            opacity: 0.9
        })
    );

    lineas.renderOrder = 10;

    const tapa = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
            color: COLOR_PLANO,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide,
            depthWrite: false
        })
    );

    tapa.renderOrder = 9;

    grupo.add(tapa);
    grupo.add(lineas);

    /*
        Referencia directa a la tapa (Mesh sólido, área
        completa) — la usa obtenerMallasHitTest() más abajo
        para no depender de un índice fijo dentro de
        "grupo.children" (frágil si el día de mañana se
        agrega o reordena algo en crearPlano()).
    */
    grupo.userData.tapa = tapa;

    return grupo;

}


/*
    Reposiciona/reorienta/reescala un grupo ya creado para el
    eje/percent/bbox vigentes — todo en espacio LOCAL de
    "mallaFrontal", del que este grupo cuelga como hijo (ver
    la cabecera, "LA SOLUCIÓN").
*/
function reposicionar(grupo, eje, percent, bbox, tamano) {

    const centro = centroParaCorte(eje, percent, bbox);

    /*
        Empuja el cuadrado un pelo hacia afuera de la
        geometría (ver LEVANTE_LOCAL) para que no le
        parpadee encima — "afuera" es "en la mitad ya
        conservada por el corte", así el plano se ve
        apoyado sobre la cara recién cortada, no enterrado
        del lado que se descarta.
    */
    centro[eje] += LEVANTE_LOCAL;

    grupo.position.copy(centro);
    grupo.rotation.copy(ROTACION_PARA_EJE[eje]);
    grupo.scale.setScalar(tamano);

}


export function createPlanoCorte({ scene } = {}) {

    /*
        "scene" ya no hace falta para nada (ver la cabecera,
        "LA SOLUCIÓN": ahora todo cuelga de "mallaFrontal", no
        de "scene") — se sigue aceptando en la firma para no
        tener que tocar el call site en galeria.js.
    */

    let activo = false;

    /*
        Un grupo por eje, creado UNA sola vez y reutilizado
        para siempre (se reposiciona/reescala y se
        muestra/oculta según haga falta) — evita estar
        creando/destruyendo geometría en cada cambio de foco,
        a diferencia de las curvas de intersección (esas sí
        cambian de FORMA en cada recorte, estos cuadrados no:
        solo cambian dónde y sobre qué mallaFrontal cuelgan).
    */
    const grupos = {};

    EJES.forEach(eje => {

        grupos[eje] = null;

    });

    /*
        Qué mallaFrontal tiene los grupos puestos HOY — si
        cambia el foco, hay que sacarlos de la vieja y
        ponerlos en la nueva (mismo criterio que
        "idConCurvasPuestas" en
        galeria-corte-interseccion.js).
    */
    let mallaConGruposPuestos = null;


    function ocultarTodos() {

        EJES.forEach(eje => {

            if (grupos[eje]) grupos[eje].visible = false;

        });

    }


    function quitarDeEscena() {

        EJES.forEach(eje => {

            if (grupos[eje] && grupos[eje].parent) {

                grupos[eje].parent.remove(grupos[eje]);

            }

        });

        mallaConGruposPuestos = null;

    }


    return {

        /*
            Prende/apaga el switch. GLOBAL, no por ficha —
            mismo criterio que "Autorotado"/"Mostrar
            intersección" (ver esos módulos): la preferencia
            persiste al cambiar de ficha; lo que se vea o no
            depende de si el nuevo elemento arranca cortando
            (naturalmente no, ver galeria-corte.js), no de
            este switch.
        */
        setActivo(nuevoActivo) {

            activo = nuevoActivo;

            if (!activo) {

                ocultarTodos();
                quitarDeEscena();

            }

        },

        /*
            "estadoActivo": lo que devuelve
            corte.obtenerEstadoActivo() — null, o { cono,
            bbox, estado } (ya no hace falta "planosMundo"
            acá, ver la cabecera). Muestra/reposiciona los 3
            cuadrados según el "percent" actual de cada eje
            (ver la cabecera: los 3 se ven siempre que el
            switch esté prendido, no solo mientras estén
            recortando geometría de verdad); no-op barato si
            el switch está apagado.
        */
        actualizar(estadoActivo) {

            if (!activo) return;

            if (!estadoActivo) {

                ocultarTodos();
                return;

            }

            const { cono, bbox, estado } = estadoActivo;

            const [mallaFrontal] = cono.userData.mallas;

            if (mallaFrontal !== mallaConGruposPuestos) {

                quitarDeEscena();
                mallaConGruposPuestos = mallaFrontal;

            }

            const tamano = tamanoParaBbox(bbox);

            /*
                Antes se ocultaba el plano de un eje si
                "estado[eje].percent" NO era menor a 1 (el
                default, "sin cortar" — ese umbral vivía en
                una constante PERCENT_SIN_CORTE, ya
                eliminada): la lectura era "percent=1 es el
                default, sin cortar, nada que resaltar" —
                pero eso dejaba al plano invisible justo en
                el límite superior del rango [0,1]
                (percent=1.0 exacto), y también en el
                default de CADA eje al arrancar. Pedido
                explícito: el plano tiene que verse en todo
                el rango, límites incluidos — no depende de
                si ese eje está "cortando de verdad" en este
                momento, solo de si el switch global
                "Mostrar plano de corte" está activo.
            */
            EJES.forEach(eje => {

                if (!grupos[eje]) {

                    grupos[eje] = crearPlano();

                }

                if (!grupos[eje].parent) {

                    mallaFrontal.add(grupos[eje]);

                }

                reposicionar(
                    grupos[eje],
                    eje,
                    estado[eje].percent,
                    bbox,
                    tamano
                );

                grupos[eje].visible = true;

            });

        },

        /*
            Mismo momento que
            corteInterseccion.reset()/corte.reset()/etc. — los
            4 puntos donde galeria.js sale de "fichas". Se
            APAGA (no vuelve a prender solo, mismo criterio
            que "Mostrar intersección": es un control
            secundario de visualización).
        */
        reset() {

            activo = false;
            ocultarTodos();
            quitarDeEscena();

        },

        /*
            Mallas hit-testables de los planos VISIBLES en
            este momento — pedido explícito: técnicamente
            cuelgan del mismo "mallaFrontal" que la geometría
            real (ver la cabecera, "LA SOLUCIÓN"), y pueden
            sobresalir bastante más allá de ella (ver
            FACTOR_TAMANO) — sin esto, el wheel-zoom
            (galeria-zoom.js) y el drag de rotación manual
            (galeria-interaccion-ficha.js) sólo reconocían la
            geometría real, así que apuntar justo al plano que
            el visitante pidió ver con el switch no disparaba
            nada, se sentía roto.

            Sólo la TAPA (Mesh sólido, área completa) entra
            acá, nunca las líneas de borde/cruz: un raycast
            contra LineSegments depende de un threshold en
            unidades de mundo, mucho menos confiable como
            área de agarre que un Mesh — mismo motivo por el
            que la tapa ya es el elemento "grande" del grupo,
            el borde es puramente decorativo (ver crearPlano).

            No-op barato (array vacío) con el switch apagado
            — mismo guard que ya usa "actualizar()" — así que
            quien llame esto en cada frame (zoom) o de forma
            perezosa en cada hit-test (interacción-ficha) no
            necesita chequear "activo" por su cuenta.
        */
        obtenerMallasHitTest() {

            if (!activo) return [];

            return EJES
                .map(eje => grupos[eje])
                .filter(grupo => grupo && grupo.visible)
                .map(grupo => grupo.userData.tapa);

        }

    };

}
