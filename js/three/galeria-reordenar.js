/* ==================================================
   galeria-reordenar.js

   Fase B: mantiene el "order" vigente (posición ->
   índice de elemento), calcula el nuevo orden según
   el criterio elegido en el GUI (usando
   config.sortOptions, sin saber nada del dominio) y
   anima la transición con anti-colisión por niveles
   (ver assignLayers en galeria-utils.js).

   Este módulo es también la fuente de verdad de
   "order" para el resto de la app: galeria-revelado.js
   y galeria-carrusel.js lo consultan vía getOrder().
   Desde este cambio, es TAMBIÉN la fuente de verdad de
   "positions" (ver getPositions() más abajo) — no solo
   de "order" — por la misma razón: el layout físico de
   la fila (dónde cae cada slot en X) depende de QUÉ
   elemento ocupa cada slot, así que no puede fijarse
   una sola vez al armar la escena (ver el comentario
   grande de computeRowPositions en galeria-escena.js
   para el detalle del bug que esto corrige — separación
   pareja entre CENTROS pero no entre CARAS de bounding
   box, porque el layout crudo de galeria-escena.js
   estaba dimensionado para el orden crudo del GeoJSON,
   no para el orden cronológico con el que arranca la
   fila).

   El "order" INICIAL (antes de que el visitante toque
   el GUI) ya NO es el orden crudo del GeoJSON: se
   arranca directamente ordenado por config.sortOptions[0]
   ("anio"/Cronológico — ver galeria-config.js), que es
   el criterio que además queda marcado activo por
   defecto en el GUI (ver renderSortButtons() en
   galeria.js). "originalOrder" se conserva solo como
   respaldo interno de getSortedOrder() (por si algún
   sortOption pidiera volver al orden crudo), ya no
   como estado inicial visible.
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
        actualizarHiddenDrop
    }
) {

    /*
        Separación vertical entre "niveles" del arco
        de reordenamiento (ver assignLayers). Antes
        se derivaba de config.geometry.radius (el
        radio del cono simple); ahora que cada
        elemento tiene su propia geometría/tamaño, se
        deriva del espaciado horizontal de la fila,
        que sigue siendo la referencia de escala de
        toda la escena.
    */

    const levelSeparation =
        config.row.spacing *
        config.reorder.levelSeparationFactor;


    const originalOrder =
        elementos.map(el => el.indice);

    /*
        Arranca ordenado por el primer criterio de
        config.sortOptions ("anio"/Cronológico), no
        por el orden crudo del GeoJSON — mismo
        criterio que queda marcado activo por defecto
        en el GUI (ver renderSortButtons() en
        galeria.js). getSortedOrder() está definida
        más abajo en este mismo archivo, pero al ser
        function declaration queda "hoisteada": se
        puede llamar acá arriba sin problema.
    */
    let order =
        getSortedOrder(
            config.sortOptions[0].key
        );

    /*
        "positions" ya NO es un array fijo recibido de
        afuera: es el layout real para "order" (arriba),
        recalculado con computeRowPositions() — misma
        función que ya se usaba para centrar la cámara,
        ahora también fuente de la posición física de
        cada elemento (ver comentario de cabecera). Se
        recalcula de nuevo en cada animateTo(), y se
        promueve a estado vigente en step() cuando la
        animación termina (mismo momento en que "order"
        se promueve).
    */
    let positions =
        computeRowPositions(order);

    /*
        La escena (galeria-escena.js) centra la cámara
        al armarse usando el orden CRUDO de "elementos"
        (no tiene por qué saber de sortOptions ni de
        cuál es el criterio default). Como acá arriba
        el "order" inicial ya es el cronológico, no el
        crudo, hay que recalcular y aplicar el lookAtX
        real apenas se conoce ese order — si no, la fila
        arranca descentrada desde el primer frame, antes
        de que el visitante toque nada del GUI.

        Acá SÍ se aplica de un salto (sin animar): todavía
        no se pintó ni un frame, así que no hay nada que
        "disimular" — a diferencia de animateTo()/step()
        más abajo, donde el salto sería visible.

        "lookAtX" queda guardado como estado propio del
        controller (mismo criterio que "order") solo para
        el caso sin computeLookAtX y como valor que
        step() promueve al terminar cada animación — YA
        NO es de acá de donde animateTo() saca su
        "fromLookAtX" (ver el fix ahí, más abajo: ese
        valor se recalcula fresco en cada llamada, porque
        la cámara puede haberse movido por fuera de este
        módulo desde la última vez que este "lookAtX" se
        actualizó — bug real que esto corrigió: el primer
        reordenamiento de la sesión saltaba de golpe toda
        la escena, ver el comentario grande en
        animateTo()).
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
        FIX: el "order" inicial ya es el cronológico
        (config.sortOptions[0]), no el crudo con el que
        galeria-escena.js armó hiddenDropActual/
        filaBottomNdcYActual la primera vez — sin este
        llamado, el primer paint (antes de que el
        visitante toque el GUI) podía arrancar con un
        hiddenDrop calculado para el order equivocado,
        el mismo bug que motivó este fix, pero desde el
        arranque en vez de recién al reordenar. Se aplica
        de un salto (sin animar), mismo criterio que
        lookAtX unas líneas más arriba: todavía no se
        pintó ni un frame.
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

        return positions;

    }


    /*
        Devuelve un nuevo array de "indice" en el
        orden que corresponde al criterio "type",
        usando config.sortOptions. No sabe nada del
        dominio: solo llama a option.getValue(el)
        para obtener el valor a comparar.
    */

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

            /*
                Números: los nulos/indefinidos van
                al final, sin importar el criterio.
            */

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


        /*
            Layout destino para newOrder — recalculado
            del mismo modo que el "positions" inicial de
            arriba (ver comentario ahí y en
            computeRowPositions, en galeria-escena.js).
            "positions" (todavía el viejo acá, no se
            reemplaza hasta que termine la animación, ver
            step()) sigue siendo el layout correcto para
            "order" (el vigente, previo a este cambio).
        */
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

            movements.push({

                cone: cones[cupID],

                from: positions[oldPosition],
                to: newPositions[newPosition],

                moved:
                    oldPosition !== newPosition

            });

        }


        assignLayers(movements);


        /*
            fromLookAtX: NO se reusa el "lookAtX" que este
            controller tiene guardado como estado propio —
            se recalcula FRESCO acá, contra el "order"
            vigente (todavía sin cambiar) y la posición
            ACTUAL de la cámara, con la misma
            computeLookAtX() que ya usa setCameraLado() por
            dentro (galeria-escena.js).

            Por qué hace falta esto: entre una llamada a
            animateTo() y la siguiente, la cámara se sigue
            moviendo SOLA por fuera de este módulo —
            setCameraLado(t), que galeria.js llama en cada
            frame de "hero"/"proyecto"/"revelado", recalcula
            y aplica un camera.lookAt() nuevo cada vez que
            la cámara avanza por el arco. Ese movimiento
            nunca actualiza el "lookAtX" que este módulo
            guardó al construirse (ver más arriba) — así
            que, para el PRIMER animateTo() de toda la
            sesión (el único que ocurre recién después de
            que "revelado" movió la cámara de punta a punta
            del arco sin que este módulo se enterara), ese
            "lookAtX" guardado quedaba stale: apuntando a
            donde miraba la cámara al construirse (arranque
            de "hero"), no a donde mira en verdad ahora
            ("orden", cámara ya asentada en el extremo
            izquierdo). step() interpolaba entonces DESDE
            ese valor viejo — el primer frame de la
            animación saltaba de golpe desde el lookAt real
            hacia ese valor stale, antes de recién ahí
            empezar a viajar hacia el destino. Como es la
            CÁMARA la que salta (no los conos, que están
            bien ubicados todo el tiempo), se veía como si
            TODA la escena —conos y sus bounding boxes por
            igual— se moviera de golpe. En reordenamientos
            posteriores no pasaba porque step() ya había
            promovido "lookAtX" al valor correcto al
            terminar el primero (ver el final de step(), más
            abajo) — de ahí que el bug desapareciera "solo"
            después del primer uso, sin relación con qué
            criterio se haya elegido.

            Si no hay computeLookAtX (dependencia opcional),
            se cae al "lookAtX" guardado como antes — sin
            este dependency no hay forma de saber el valor
            real vigente, así que no hay mejora posible ahí.
        */
        const fromLookAtX =
            computeLookAtX
                ? computeLookAtX(order)
                : lookAtX;

        /*
            lookAtX destino para este newOrder — mismo
            cálculo de siempre, ahora simplemente
            renombrado junto a "fromLookAtX" de arriba
            para que se lea como el par que en verdad son.
        */
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
            fromLookAtX,
            toLookAtX
        };

    }


    /*
        Devuelve true si había una animación en
        curso (y la hizo avanzar un frame).
    */

    function step(now) {

        if (!animState) return false;

        let t =
            (now - animState.start) /
            animState.duration;

        t = Math.min(1, t);

        const e = ease(t);
        const envelope = liftEnvelope(t);


        animState.movements.forEach(movement => {

            const {
                cone,
                from,
                to,
                moved,
                layer,
                layerMagnitude
            } = movement;


            if (!moved) {

                cone.position.set(
                    to.x, restY, to.z
                );

                cone.scale.setScalar(1);

                return;

            }


            const dx = to.x - from.x;
            const x = from.x + dx * e;

            const arc =
                levelSeparation * layerMagnitude;

            const z =
                from.z + layer * arc * envelope;

            const scale =
                1 + envelope * .12;

            cone.position.set(x, restY, z);
            cone.scale.setScalar(scale);

        });


        /*
            Mismo "e" que ya mueve los conos: el punto
            de mira viaja disimulado, a la par de la
            fila, en vez de saltar de golpe al terminar
            (ver "fromLookAtX"/"toLookAtX" en
            animateTo()).
        */
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
            lookAtX = animState.toLookAtX;
            busy = false;
            animState = null;

            if (actualizarCajasDebug) {

                actualizarCajasDebug(order);

            }

            /*
                FIX: acá es donde se corregía el bug
                reportado — "order" recién se promovió
                arriba al valor nuevo, así que este es el
                momento exacto en que hiddenDropActual/
                filaBottomNdcYActual (en galeria-escena.js)
                quedaban desincronizados del order vigente
                hasta el próximo resize/setCameraLado. Se
                llama en el mismo punto que
                actualizarCajasDebug(order), por la misma
                razón: es el único lugar donde "order"
                cambia de verdad fuera del armado inicial.
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


    return {
        getOrder,
        getPositions,
        getSortedOrder,
        animateTo,
        step,
        isBusy,
        isAnimating
    };

}
