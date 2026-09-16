/* ==================================================
   galeria-reordenar.js

   Fase B: mantiene el "order" vigente (posición ->
   índice de elemento), calcula el nuevo orden según
   el criterio elegido en el GUI (usando
   config.sortOptions, sin saber nada del dominio) y
   anima la transición con anti-colisión por niveles
   (ver assignLayers en galeria-utils.js).

   Este módulo es la fuente de verdad de "order" para
   el resto de la app: galeria-revelado.js y
   galeria-carrusel.js lo consultan vía getOrder().
   También es fuente de verdad de "positions" (ver
   getPositions()): el layout físico de la fila (dónde
   cae cada slot en X) depende de QUÉ elemento ocupa
   cada slot, así que no puede fijarse una sola vez al
   armar la escena (ver computeRowPositions en
   galeria-escena.js).

   El "order" INICIAL ya NO es el orden crudo del
   GeoJSON: arranca ordenado por config.sortOptions[0]
   ("anio"/Cronológico — ver galeria-config.js), el
   mismo criterio que queda marcado activo por defecto
   en el GUI (ver renderSortButtons() en galeria.js).
   "originalOrder" se conserva solo como respaldo
   interno de getSortedOrder(), no como estado inicial
   visible.
================================================== */

import {
    ease,
    liftEnvelope,
    assignLayers
} from "./galeria-utils.js";


export function createReorderController(
    config,
    {
        cones, computeRowPositions, elementos, restY,
        computeLookAtX, setLookAtX, actualizarCajasDebug,
        actualizarHiddenDrop,
        // Bounding box real en mundo por elemento (mismo
        // dato que ya usa galeria-carrusel.js). Opcional
        // por compatibilidad hacia atrás: si no se pasa,
        // se cae al cálculo viejo (constante fija) — ver
        // más abajo.
        bboxesPorIndice,
        // Eje principal vigente del layout (ver
        // galeria-escena.js) — decide sobre qué
        // coordenada de from/to se detecta "cambió de
        // posición" (slid) y sobre cuál mide
        // assignLayers() la superposición para el arco
        // anti-colisión. Default "x" por compatibilidad
        // hacia atrás con quien todavía no lo pasa.
        ejePrincipal = "x",
        // A: order inicial opcional — si no se pasa, arranca
        // ordenado por el primer criterio de
        // config.sortOptions, mismo comportamiento de
        // siempre (ver "order" más abajo). Se pasa cuando
        // galeria.js recrea este controller tras un cruce
        // real de orientación horizontal/vertical (ver
        // manejarPosibleCambioDeOrientacion en
        // galeria-escena.js): así el visitante no pierde un
        // reordenamiento manual propio solo por rotar la
        // pantalla.
        initialOrder = null
    }
) {

    // Eje horizontal que NO es "ejePrincipal" (Y hoy, X en
    // modo vertical) — mismo par que ejeSecundarioCamara
    // en galeria-escena.js y ejeSecundario en
    // galeria-carrusel.js, recalculado acá mismo (es una
    // función pura de ejePrincipal, no vale la pena
    // agregar otra dependencia solo para esto).
    const ejeSecundario =
        ejePrincipal === "x" ? "y" : "x";

    /*
        Eje sobre el que se mueve el arco anti-colisión
        (el "lift" que separa dos elementos que se cruzan
        de slot al reordenar). Hasta ahora siempre era Z
        (hacia/desde cámara) — tiene sentido en horizontal,
        donde la fila es una línea y Z es "hacia adentro
        del cuadro", perpendicular a ella.

        En vertical eso deja de leerse bien: la columna ya
        ocupa la dimensión vertical de pantalla, y mover el
        arco hacia cámara (Z) hace que el cruce se vea de
        frente, difícil de seguir — mejor lateral (X), que
        de verdad se ve como un quiebre hacia un costado.
        Como X ya es el eje secundario en ese modo (con su
        propio centrado por centroide, ver
        "corregirSecundario"), el lift se SUMA sobre esa
        base, no la reemplaza.
    */
    const ejeLift =
        ejePrincipal === "x" ? "z" : ejeSecundario;

    /*
        PROPUESTA — centrado por centroide del eje
        secundario (ver notas-encuadre-3d.md y el mismo
        criterio ya aplicado en verticesMundoDeFila, en
        galeria-escena.js): cuando el secundario es X
        (modo vertical), no hay un "restY" físico
        (apoyado en el piso) equivalente para el costado
        — alinear por el borde/origen local de cada
        geometría (lo que hacía el código antes de esto)
        deja a cada elemento en un lugar lateral distinto
        si sus pivotes locales no coinciden, en vez de
        centrados en la misma línea vertical. Se les resta
        su propio pivote (centro real del bbox en ese eje)
        para que sea el CENTROIDE, no el origen local, el
        que caiga en la coordenada compartida.

        Cuando el secundario es Y (horizontal, sin
        cambios), esto no se aplica: el borde/piso de cada
        elemento (ver baseDe, abajo) es su propia base, sin
        centrar.
    */
    function corregirSecundario(valor, cupID) {

        if (ejeSecundario !== "x") return valor;
        if (!bboxesPorIndice) return valor;

        const bbox = bboxesPorIndice[cupID];

        const pivotSecundario =
            (bbox.min.x + bbox.max.x) / 2;

        return valor - pivotSecundario;

    }

    /*
        FIX (piso al 100%): "restY" es un colchón GLOBAL (el
        MAYOR desplazamientoBase entre todos los elementos,
        ver galeria-escena.js) — usarlo para posicionar CADA
        elemento dejaba flotando a cualquiera cuya geometría
        no fuera tan "profunda" como ese peor caso, que es
        justo el motivo por el que el piso no quedaba debajo
        del 100% de los objetos. Acá se usa la base PROPIA de
        cada uno (misma cuenta que "desplazamientoBase" en
        normalizarGeometriaElemento: -bbox.min.y), para que
        su punto más bajo real caiga exactamente en su slot.
        Fallback a "restY" si no llega "bboxesPorIndice"
        (dependencia opcional, mismo criterio que
        corregirSecundario).
    */
    function baseDe(cupID) {

        if (!bboxesPorIndice) return restY;

        return -bboxesPorIndice[cupID].min.y;

    }

    /*
        Separación entre "niveles" del arco de
        reordenamiento (ver assignLayers en
        galeria-utils.js).

        NO puede ser un valor fijo derivado de
        config.row.spacing: ese número describe el
        espaciado HORIZONTAL de la fila, no tiene
        relación con cuánto ocupa una geometría en Z, y
        assignLayers reparte niveles únicamente en base a
        superposición en X — nunca mira la profundidad
        real de lo que está moviendo. Si un elemento es
        más "profundo" en Z que ese valor fijo, dos
        niveles que assignLayers considera "separados"
        pueden terminar solapándose en Z de todos modos.

        El hueco real entre niveles NO es uniforme: con
        layer=±1 y layerMagnitude=floor(level/2)+1 (ver
        assignLayers), los offsets en unidades de
        levelSeparation son -1,+1,-2,+2,-3,+3... para los
        niveles 0,1,2,3,4,5... — el hueco mínimo entre dos
        niveles que pueden estar activos a la vez (X
        superpuesto) es de 1× levelSeparation (p.ej. nivel
        0 vs nivel 2: -1 vs -2), no 2× como asume una
        lectura ingenua de "niveles alternados". Y un
        "slid" (mismo slot, sin arco — ver step()) reserva
        carril en assignLayers pero su Z real quedó
        siempre en offset 0 (plano): contra un "moved" en
        nivel 0 o 1 (±1) el hueco real efectivo también
        puede ser de apenas 1×.

        Por eso la cota tiene que salir de la geometría:
        para que dos elementos cualesquiera —en el peor
        caso, los dos más profundos de la fila— no se
        toquen aun con un hueco de 1×, alcanza y hace
        falta que levelSeparation sea al menos la
        extensión máxima (max - min) sobre "ejeLift" de
        cualquier elemento que pueda estar en movimiento
        (halfDepthA + halfDepthB ≤ levelSeparation, peor
        caso con A=B=el más profundo, da depthMax).
        levelSeparationFactor pasa a ser un margen de
        seguridad multiplicativo sobre esa cota (>= 1),
        no un factor sobre el spacing de la fila.

        GENERALIZACIÓN: antes esto medía siempre Z
        ("bbox.max.z - bbox.min.z"), porque el lift
        siempre iba a Z. Ahora mide sobre "ejeLift" — en
        horizontal sigue siendo Z exactamente igual que
        antes (pixel-idéntico); en vertical pasa a medir
        el ancho en X de cada elemento, porque ahí es
        donde realmente va el lift.
    */
    const levelSeparation =
        bboxesPorIndice
            ? Math.max(
                  ...elementos.map(el => {

                      const bbox =
                          bboxesPorIndice[el.indice];

                      return bbox
                          ? bbox.max[ejeLift] - bbox.min[ejeLift]
                          : 0;

                  })
              ) * config.reorder.levelSeparationFactor
            // Sin bboxesPorIndice (dependencia opcional):
            // se cae al cálculo viejo, para no romper a
            // quien todavía no actualizó el call site.
            : config.row.spacing *
              config.reorder.levelSeparationFactor;


    const originalOrder =
        elementos.map(el => el.indice);

    // Arranca ordenado por el primer criterio de
    // config.sortOptions ("anio"/Cronológico), no por el
    // orden crudo del GeoJSON — mismo criterio marcado
    // activo por defecto en el GUI (ver
    // renderSortButtons() en galeria.js). getSortedOrder()
    // está definida más abajo pero, al ser function
    // declaration, queda hoisteada.
    let order =
        initialOrder ??
        getSortedOrder(
            config.sortOptions[0].key
        );

    // "positions" es el layout real para "order" (arriba),
    // vía computeRowPositions() — misma función que centra
    // la cámara, ahora también fuente de la posición física
    // de cada elemento. Se recalcula en cada animateTo(), y
    // se promueve a estado vigente en step() cuando la
    // animación termina (mismo momento en que "order" se
    // promueve).
    let positions =
        computeRowPositions(order);

    /*
        FIX (cono de luz saltando "de golpe" al terminar un
        reordenamiento — reportado contra galeria-cono-luz.js):
        "positions" (arriba) es la fuente de verdad que
        consume getPositions(), y hasta ahora quedaba
        CONGELADA durante toda la animación de animateTo()
        —solo se promovía a "newPositions" en el frame exacto
        en que step() llega a t>=1 (ver más abajo)—, mientras
        los propios conos SÍ se movían de a poco cada frame
        (interpolando from/to con "e"). Cualquier consumidor
        de getPositions() que ancle algo contra el LAYOUT (no
        contra un elemento en particular) —el caso de
        galeria-cono-luz.js: puntoDeDescanso() usa
        getPositions()[slot] para los dos extremos del eje de
        la luz— se quedaba leyendo el layout VIEJO todo el
        reordenamiento entero, y saltaba de una sola vez al
        layout nuevo en el último frame.

        "positionsAnimadas": snapshot por-slot, recalculado en
        cada step() mientras hay animación en curso — mismo
        lerp componente a componente que ya usa el caso "slid"
        más abajo (from + (to-from)*e), pero aplicado a TODO
        el layout (por slot, no por elemento) en vez de a un
        movimiento individual. null mientras no se está
        animando: ahí getPositions() sigue devolviendo
        "positions" crudo, sin ningún costo extra.
    */
    let positionsAnimadas = null;

    /*
        La escena (galeria-escena.js) centra la cámara al
        armarse usando el orden CRUDO de "elementos" (no
        sabe de sortOptions). Como acá el "order" inicial
        ya es el cronológico, hay que recalcular y aplicar
        el lookAtX real apenas se conoce ese order — si no,
        la fila arranca descentrada antes de que el
        visitante toque el GUI.

        Se aplica de un salto (sin animar): todavía no se
        pintó ni un frame, así que no hay nada que
        disimular — a diferencia de animateTo()/step() más
        abajo.

        "lookAtX" se guarda como estado propio del
        controller solo para el caso sin computeLookAtX y
        como valor que step() promueve al terminar cada
        animación — NO es de acá de donde animateTo() saca
        su "fromLookAtX" (ver ese comentario, más abajo:
        se recalcula fresco en cada llamada, porque la
        cámara puede haberse movido por fuera de este
        módulo).
    */
    let lookAtX =
        computeLookAtX
            ? computeLookAtX(order)
            : null;

    if (setLookAtX && lookAtX !== null) {

        setLookAtX(lookAtX);

    }

    if (actualizarCajasDebug) {

        actualizarCajasDebug(order);

    }

    /*
        El "order" inicial ya es el cronológico
        (config.sortOptions[0]), no el crudo con el que
        galeria-escena.js armó hiddenDropActual/
        filaBottomNdcYActual la primera vez — sin este
        llamado, el primer paint podía arrancar con un
        hiddenDrop calculado para el order equivocado. Se
        aplica de un salto (sin animar), mismo criterio
        que lookAtX unas líneas más arriba.
    */
    if (actualizarHiddenDrop) {

        actualizarHiddenDrop(order);

    }


    let busy = false;
    let animState = null;


    function getOrder() {

        return order;

    }


    function getPositions() {

        return positionsAnimadas || positions;

    }


    // Devuelve un nuevo array de "indice" en el orden que
    // corresponde al criterio "type", usando
    // config.sortOptions. No sabe nada del dominio: solo
    // llama a option.getValue(el) para obtener el valor a
    // comparar.
    function getSortedOrder(type) {

        if (type === "original") {

            return [...originalOrder];

        }


        const option =
            config.sortOptions.find(
                o => o.key === type
            );

        if (!option) return [...originalOrder];


        const sorted = [...elementos];

        sorted.sort((a, b) => {

            const va = option.getValue(a);
            const vb = option.getValue(b);

            if (option.type === "string") {

                return String(va || "")
                    .localeCompare(String(vb || ""));

            }

            // Números: los nulos/indefinidos van al final,
            // sin importar el criterio.
            const na =
                va === null || va === undefined
                    ? Infinity
                    : va;

            const nb =
                vb === null || vb === undefined
                    ? Infinity
                    : vb;

            return na - nb;

        });


        return sorted.map(el => el.indice);

    }


    function animateTo(newOrder) {

        if (busy) return;


        if (
            newOrder.every(
                (id, i) => id === order[i]
            )
        ) {

            return;

        }


        busy = true;


        // Layout destino para newOrder (mismo criterio que
        // el "positions" inicial de arriba). "positions"
        // (todavía el viejo, no se reemplaza hasta que
        // termine la animación, ver step()) sigue siendo el
        // layout correcto para "order" (el vigente, previo
        // a este cambio).
        const newPositions =
            computeRowPositions(newOrder);


        const movements = [];

        for (
            let newPosition = 0;
            newPosition < newOrder.length;
            newPosition++
        ) {

            const cupID =
                newOrder[newPosition];

            const oldPosition =
                order.indexOf(cupID);

            const from = positions[oldPosition];
            const to = newPositions[newPosition];

            // "moved" (cambió de slot): necesita el arco
            // anti-colisión de assignLayers, porque puede
            // cruzarse en Z con otro elemento en tránsito.
            const slotChanged =
                oldPosition !== newPosition;

            // Mismo slot, pero coordenada real distinta
            // (computeRowPositions recalculó el layout por
            // los bboxes de los elementos vecinos). No hay
            // colisión posible (nadie más ocupa este slot a
            // la vez), así que alcanza con un slide lineal,
            // sin arco/lift/scale. Se compara sobre
            // ejePrincipal (antes, X fijo) — Z se deja
            // afuera a propósito: "positions[].z" siempre
            // vale 0 antes del arco anti-colisión (ver
            // calculatePositions en galeria-escena.js), así
            // que nunca aporta una diferencia real acá.
            const slid =
                !slotChanged &&
                from[ejePrincipal] !== to[ejePrincipal];

            movements.push({

                cone: cones[cupID],
                cupID,

                from,
                to,

                moved: slotChanged,
                slid

            });

        }


        // Los "slid" (mismo slot, coordenada distinta) no
        // arquean —siguen planos en step()—, pero SÍ hay
        // que pasarlos por assignLayers: su tramo de X
        // sigue "ocupado" mientras se desliza, y es
        // justamente ese tramo el que assignLayers usa para
        // decidir si un "moved" puede compartir plano Z o
        // necesita un carril propio. Excluirlos de acá deja
        // a los "moved" sin ver ese tramo, y pueden terminar
        // cruzándose en Z con un "slid" que se quedó plano.
        assignLayers(movements, ejePrincipal);


        /*
            fromLookAtX: NO se reusa el "lookAtX" guardado
            como estado propio del controller — se
            recalcula FRESCO acá, contra el "order" vigente
            (todavía sin cambiar) y la posición ACTUAL de
            la cámara, con la misma computeLookAtX() que
            usa setCameraLado() por dentro.

            Hace falta porque, entre una llamada a
            animateTo() y la siguiente, la cámara se sigue
            moviendo SOLA por fuera de este módulo:
            setCameraLado(t) (que galeria.js llama en cada
            frame de "hero"/"proyecto"/"revelado") aplica
            un camera.lookAt() nuevo sin nunca actualizar
            el "lookAtX" que este módulo guardó al
            construirse. Si se reusara ese valor guardado,
            el PRIMER animateTo() de la sesión interpolaría
            desde un punto stale (el lookAt de "hero"), y
            la cámara —no los conos, que están bien
            ubicados— saltaría de golpe al arrancar la
            animación. En reordenamientos posteriores no
            se nota porque step() ya promovió "lookAtX" al
            valor correcto al terminar el anterior.

            Si no hay computeLookAtX (dependencia
            opcional), se cae al "lookAtX" guardado como
            respaldo.
        */
        const fromLookAtX =
            computeLookAtX
                ? computeLookAtX(order)
                : lookAtX;

        // lookAtX destino para este newOrder — mismo
        // cálculo que fromLookAtX, contra newOrder.
        const toLookAtX =
            computeLookAtX
                ? computeLookAtX(newOrder)
                : lookAtX;


        animState = {
            movements,
            start: performance.now(),
            duration: config.reorder.duration,
            newOrder,
            newPositions,
            // Snapshot del layout ANTES de este reordenamiento
            // — punto de partida del lerp de
            // "positionsAnimadas" en step(). "positions" en sí
            // recién se reemplaza al terminar la animación
            // (más abajo), así que esta referencia es la única
            // forma de recordar de dónde salió cada slot una
            // vez que "positions" ya haya sido promovido.
            oldPositions: positions,
            fromLookAtX,
            toLookAtX
        };

    }


    // Devuelve true si había una animación en curso (y la
    // hizo avanzar un frame).
    function step(now) {

        if (!animState) return false;

        let t =
            (now - animState.start) /
            animState.duration;

        t = Math.min(1, t);

        const e = ease(t);
        const envelope = liftEnvelope(t);


        /*
            positionsAnimadas: lerp por-slot entre el layout
            viejo (oldPositions) y el nuevo (newPositions), con
            la MISMA "e" que ya interpola cada cono individual
            más abajo — ver el FIX grande junto a la
            declaración de "positionsAnimadas", arriba. Se
            recalcula todos los frames de la animación (barato:
            un array chico, un lerp por componente), y se limpia
            a null cuando la animación termina (ver más abajo,
            junto a "positions = animState.newPositions").
        */
        positionsAnimadas =
            animState.newPositions.map((to, slot) => {

                const from =
                    animState.oldPositions[slot] || to;

                return {
                    x: from.x + (to.x - from.x) * e,
                    y: from.y + (to.y - from.y) * e,
                    z: from.z + (to.z - from.z) * e
                };

            });


        animState.movements.forEach(movement => {

            const {
                cone,
                cupID,
                from,
                to,
                moved,
                slid,
                layer,
                layerMagnitude
            } = movement;


            /*
                GENERALIZACIÓN (ver notas-encuadre-3d.md):
                antes "restY" bastaba solo porque "to.y"/
                "from.y" siempre valían 0 (layout en X). Con
                "ejePrincipal" en "y" (columna vertical),
                "to.y"/"from.y" pasan a ser la posición real
                de cada elemento en la columna — sumarlos acá
                (baseDe(cupID) + y) es el mismo criterio que
                ya usa verticesMundoDeFila() en
                galeria-escena.js.

                FIX (piso al 100%): la altura de piso es
                "baseDe(cupID)" — la base PROPIA de ESTE
                elemento — no el "restY" global que se usaba
                antes; ver el comentario de baseDe más arriba.

                "corregirSecundario" (ver más arriba) hace lo
                mismo del otro lado: cuando el secundario es
                X, corrige el CENTROIDE de "x" en vez de
                dejar el borde/origen local crudo.
            */

            const baseElemento = baseDe(cupID);

            if (!moved && !slid) {

                cone.position.set(
                    corregirSecundario(to.x, cupID),
                    baseElemento + to.y,
                    to.z
                );

                cone.scale.setScalar(1);

                return;

            }


            if (slid) {

                // Mismo slot, solo cambia la coordenada:
                // slide lineal derecho, sin arco de nivel
                // ni bump de escala (eso es exclusivo del
                // anti-colisión entre elementos que se
                // cruzan de slot).
                const x = from.x + (to.x - from.x) * e;
                const y = from.y + (to.y - from.y) * e;
                const z = from.z + (to.z - from.z) * e;

                cone.position.set(
                    corregirSecundario(x, cupID),
                    baseElemento + y,
                    z
                );
                cone.scale.setScalar(1);

                return;

            }


            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const x = from.x + dx * e;
            const y = from.y + dy * e;

            const arc =
                levelSeparation * layerMagnitude;

            const liftOffset =
                layer * arc * envelope;

            const scale =
                1 + envelope * .12;

            /*
                El lift se SUMA sobre "ejeLift" — en
                horizontal es Z (from.z de por sí es 0 antes
                del arco, ver calculatePositions en
                galeria-escena.js, así que esto da
                exactamente "layer*arc*envelope" como antes).
                En vertical es X: se suma sobre el X ya
                corregido por centroide
                (corregirSecundario), no lo reemplaza — el
                elemento se desvía del centro de la columna
                hacia un costado mientras cruza, y vuelve al
                centro cuando "envelope" vuelve a 0.
            */
            const xFinal =
                ejeLift === "x"
                    ? corregirSecundario(x, cupID) + liftOffset
                    : corregirSecundario(x, cupID);

            const zFinal =
                ejeLift === "z"
                    ? from.z + liftOffset
                    : from.z;

            cone.position.set(
                xFinal, baseElemento + y, zFinal
            );
            cone.scale.setScalar(scale);

        });


        // Mismo "e" que ya mueve los conos: el punto de
        // mira viaja disimulado, a la par de la fila, en
        // vez de saltar de golpe al terminar (ver
        // "fromLookAtX"/"toLookAtX" en animateTo()).
        if (
            setLookAtX &&
            animState.fromLookAtX !== null &&
            animState.toLookAtX !== null
        ) {

            const xCamara =
                animState.fromLookAtX +
                (animState.toLookAtX -
                    animState.fromLookAtX) * e;

            setLookAtX(xCamara);

        }


        if (t >= 1) {

            order = animState.newOrder;
            positions = animState.newPositions;
            // "positions" ya quedó promovido a su valor final
            // (idéntico a lo que positionsAnimadas ya daba en
            // e=1) — se limpia para que getPositions() vuelva
            // a leer "positions" crudo, sin el overhead del
            // lerp, hasta el próximo animateTo().
            positionsAnimadas = null;
            lookAtX = animState.toLookAtX;
            busy = false;
            animState = null;

            if (actualizarCajasDebug) {

                actualizarCajasDebug(order);

            }

            /*
                "order" recién se promovió arriba al valor
                nuevo: este es el momento exacto en que
                hiddenDropActual/filaBottomNdcYActual (en
                galeria-escena.js) quedarían desincronizados
                del order vigente hasta el próximo resize/
                setCameraLado si no se recalculan acá. Mismo
                punto que actualizarCajasDebug(order): es el
                único lugar donde "order" cambia de verdad
                fuera del armado inicial.
            */
            if (actualizarHiddenDrop) {

                actualizarHiddenDrop(order);

            }

        }


        return true;

    }


    function isBusy() {

        return busy;

    }


    function isAnimating() {

        return !!animState;

    }


    /*
        Id (índice en "cones"/"elementos") del elemento que
        ocupa el slot dado del "order" vigente — punto único
        de indexado para quien necesite "qué cono está en tal
        posición" (antes se repetía "getOrder()[slot]" a mano
        en cada call site de galeria.js: heroConeId/
        primerFichaConeId/ultimoFichaConeId).
    */
    function getConeIdEnSlot(slot) {

        return getOrder()[slot];

    }


    return {
        getOrder,
        getPositions,
        getSortedOrder,
        animateTo,
        step,
        isBusy,
        isAnimating,
        getConeIdEnSlot
    };

}