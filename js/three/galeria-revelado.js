/* ==================================================
   galeria-revelado.js

   Fase "revelado": al llegar acá solo se ve el último
   elemento de la fila (el mismo que ya estaba visible
   desde el arranque — ver "hero" y "proyecto"); los
   demás arrancan bien abajo, fuera del cuadro de la
   cámara, y suben en cascada a medida que se hace
   scroll (no todos de golpe).

   El orden de revelado y cuál elemento se ve desde el
   principio se calculan solos a partir de
   "elementCount" — no hay nada hardcodeado para una
   cantidad fija de elementos.

   update(progress) también se llama con progress=0
   durante "hero"/"proyecto" (ver galeria.js): eso
   mantiene a los conos escondidos quietos debajo del
   cuadro sin que la cascada arranque todavía — solo
   avanza cuando la fase vigente es "revelado".

   No toca el DOM: el fundido del hero de texto usa
   heroFadeEnvelope(), más abajo, independiente de esta
   cascada.

   Además de mover los conos, update() devuelve un mapa
   {id -> peso 0..1} de cuánto debería estar girando
   cada cono ahora mismo (ver galeria-rotacion.js): cada
   cono en plena subida gira con un peso en forma de
   campana sobre su propio localT (misma curva que el
   "settle bounce" de escala). El cono hero no aparece
   en el mapa: su peso es 0 implícito.

   "positions" no llega fijo desde afuera — se lee en
   cada frame vía getPositions() (misma fuente que
   getOrder(), provista por galeria-reordenar.js): el
   layout físico de la fila depende de qué elemento
   ocupa cada slot, así que tiene que leerse junto con
   "order" en cada update(), no capturarse una sola vez.
================================================== */

import { ease, smoothstep } from "./galeria-utils.js";


export function createRevealController(
    config,
    {
        cones, getPositions, getOrder, elementCount,
        restY, getHiddenDrop,
        // Mismos dos datos que ya reciben
        // galeria-reordenar.js/galeria-carrusel.js, con el
        // mismo propósito: centrar por CENTROIDE el eje
        // secundario cuando es X (modo vertical) — ver
        // corregirSecundario más abajo. Opcionales por
        // compatibilidad hacia atrás.
        bboxesPorIndice,
        ejePrincipal = "x"
    }
) {

    const span =
        config.reveal.span;

    const ejeSecundario =
        ejePrincipal === "x" ? "y" : "x";

    /*
        Mismo criterio que galeria-reordenar.js/
        galeria-escena.js (verticesMundoDeFila): cuando el
        eje secundario es X, no hay un "restY" físico
        equivalente para el costado — se centra por
        CENTROIDE (se resta el pivote propio de cada
        elemento) en vez de dejar su origen local crudo.
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
        APOYO PLENO EN EL PISO: "restY" es un colchón
        GLOBAL (el peor caso entre todos los elementos, ver
        galeria-escena.js) — usarlo para posicionar CADA
        elemento dejaría flotando a cualquiera cuya
        geometría no fuera tan "profunda" como ese peor
        caso. Acá se usa la base PROPIA de cada elemento
        (misma cuenta que "desplazamientoBase" en
        normalizarGeometriaElemento: -bbox.min.y), para que
        el punto más bajo de CADA elemento quede exactamente
        en su slot, sin importar cómo se haya construido su
        geometría. Fallback a "restY" si no llega
        "bboxesPorIndice" (compatibilidad hacia atrás, mismo
        criterio que corregirSecundario).
    */
    function baseDe(cupID) {

        if (!bboxesPorIndice) return restY;

        return -bboxesPorIndice[cupID].min.y;

    }


    /*
        Se ve desde el principio la ÚLTIMA posición
        de la fila. El resto revela en cascada, de
        la penúltima hacia la primera (más cercana
        a la cámara, la más grande/dramática),
        quedando de cierre.

        EN VERTICAL: leemos de arriba hacia abajo, así que
        el elemento que se ve desde el principio es el de
        ABAJO (slot 0 — calculatePositions arma la fila con
        el slot 0 en el extremo de coordenada MÁS BAJA sobre
        el eje principal, que en Y es "abajo"), no el de
        arriba (slot N-1). El resto de la cascada mantiene
        el mismo criterio de siempre ("desde el más cercano
        al hero, alejándose"), solo que recorre hacia ARRIBA
        (1, 2, ..., N-1) en vez de hacia abajo (N-2, ..., 0).
        En horizontal, sin cambios.
    */

    const initialVisiblePosition =
        ejePrincipal === "y"
            ? 0
            : Math.max(0, elementCount - 1);

    const revealOrder = [];

    if (ejePrincipal === "y") {

        for (let i = 1; i < elementCount; i++) {

            revealOrder.push(i);

        }

    } else {

        for (let i = elementCount - 2; i >= 0; i--) {

            revealOrder.push(i);

        }

    }

    const step =
        revealOrder.length > 1
            ? (1 - span) / (revealOrder.length - 1)
            : 0;


    function update(progress) {

        const order =
            getOrder();

        const positions =
            getPositions();

        // Se lee en cada frame, no se captura una sola
        // vez (mismo criterio que getPositions()/
        // getOrder()): el drop depende del encuadre
        // vigente de la cámara, que puede cambiar por un
        // resize (ver getHiddenDrop() en galeria-escena.js).
        //
        // "getHiddenDrop()" devuelve una MAGNITUD (una
        // distancia a bajar), no una posición absoluta:
        // restarla directamente de un "restY" único solo
        // es correcto en horizontal, donde todos los
        // elementos comparten el mismo "restY" real. Se
        // guarda como "dropMagnitude" para aplicarla POR
        // ELEMENTO más abajo (ver el cálculo de "y"), no
        // como un "hiddenY" único y global.
        const dropMagnitude =
            getHiddenDrop();

        const rotationWeights = {};

        /*
            Peso de foco CRUDO (0..1) por elemento — a
            diferencia de "rotationWeights" (una campana que
            sube y baja durante la subida, pensada para el
            giro), este es monótono: 0 mientras el elemento
            sigue escondido, sube parejo con "e" a medida que
            se asienta, y quiere quedarse en 1 una vez arriba
            — mismo rol que "focoWeight"/"pesoFoco" en
            Maqueta.html (ver aplicarColorFoco), que
            alimenta lucesPorCaja (galeria-luces.js). El cono
            hero siempre vale 1 acá (igual que
            aplicarColorFoco(heroSlot, 1) en la maqueta): es
            el único visible desde el principio, así que es
            el único con "foco" real durante todo "hero"/
            "proyecto" y el inicio de "revelado".
        */
        const focoWeights = {};


        if (elementCount === 0) return { rotationWeights, focoWeights };


        /*
            El elemento que se ve desde el principio
            se queda siempre quieto en su lugar. Usa
            el "order" vigente (no una suposición
            fija) para seguir funcionando bien aunque
            ya se haya reordenado antes de volver a
            subir el scroll.
        */

        const heroCone =
            cones[order[initialVisiblePosition]];

        const heroCupID =
            order[initialVisiblePosition];

        const heroPos =
            positions[initialVisiblePosition];

        heroCone.position.set(
            // "heroPos.y" generaliza el mismo criterio que
            // ya usan galeria-escena.js/galeria-reordenar.js
            // (baseDe(cupID) + slot.y): en horizontal es la
            // base propia del hero + 0; en vertical, la
            // altura real del hero dentro de la columna.
            //
            // "corregirSecundario" centra por CENTROIDE el
            // eje secundario cuando es X — ver más arriba.
            corregirSecundario(heroPos.x, heroCupID),
            baseDe(heroCupID) + heroPos.y,
            heroPos.z
        );

        focoWeights[heroCupID] = 1;


        revealOrder.forEach(
            (posIndex, revealIndex) => {

                const cone =
                    cones[order[posIndex]];

                const pos =
                    positions[posIndex];

                const start =
                    revealIndex * step;

                const localT =
                    Math.min(
                        1,
                        Math.max(
                            0,
                            (progress - start) /
                            span
                        )
                    );

                const e =
                    ease(localT);

                /*
                    EN VERTICAL: leemos de arriba hacia
                    abajo, así que cada elemento CAE desde
                    arriba de su lugar, no SUBE desde abajo —
                    "dropMagnitude" (una distancia, ver más
                    abajo) se suma en vez de restarse. En
                    horizontal, sigue subiendo, como siempre.

                    APROXIMACIÓN A CONFIRMAR EN LA ESCENA REAL
                    (no derivable solo de álgebra):
                    "dropMagnitude" se calibra en
                    getHiddenDrop() (galeria-escena.js) contra
                    el borde INFERIOR de pantalla — la distancia
                    correcta para garantizar "fuera de cuadro
                    por abajo". Acá se reusa ESA MISMA
                    magnitud para el borde SUPERIOR, que no
                    tiene por qué medir exactamente lo mismo
                    (el margen reservado arriba —navbar— y
                    abajo —botones de orden— no son iguales, ver
                    calcularTargetVertical en galeria-escena.js).
                    Es la aproximación más simple disponible;
                    si algún elemento asoma por arriba antes
                    de tiempo, hace falta una magnitud
                    separada calibrada contra el borde superior,
                    no ajustar este valor a ojo.
                */
                const baseElemento =
                    baseDe(order[posIndex]);

                const y =
                    ejePrincipal === "y"
                        ? (baseElemento + pos.y) +
                          dropMagnitude * (1 - e)
                        : (baseElemento + pos.y) -
                          dropMagnitude * (1 - e);

                /*
                    Un ligero rebote/asentamiento
                    de escala al llegar arriba.
                */

                const settle =
                    1 +
                    Math.sin(localT * Math.PI) *
                    config.reveal.settleBounce;

                cone.position.set(
                    corregirSecundario(pos.x, order[posIndex]),
                    y,
                    pos.z
                );

                cone.scale.setScalar(
                    localT >= 1 ? 1 : settle
                );

                /*
                    Campana: 0 al arrancar a subir, máximo
                    a mitad de camino, de vuelta a 0 al
                    asentarse. El id es el de
                    "cones"/"elementos" (no el posIndex de
                    la fila), que es el que espera
                    galeria-rotacion.js.

                    Escalada por rotationScale (config.reveal,
                    mismo mecanismo que rotationScale en
                    galeria-carrusel.js): el pico dura solo
                    "span" de scroll, así que a la velocidad
                    máxima compartida con el resto de la
                    galería el giro pasaría casi
                    desapercibido antes de asentarse.
                */

                rotationWeights[order[posIndex]] =
                    Math.sin(
                        Math.min(1, Math.max(0, localT)) *
                        Math.PI
                    ) * config.reveal.rotationScale;

                // "e", no "settle" ni la campana de arriba:
                // el foco tiene que subir monótono con el
                // asentamiento real del elemento, no rebotar
                // ni volver a bajar — ver el comentario junto
                // a la declaración de "focoWeights" más arriba.
                focoWeights[order[posIndex]] = e;

            }
        );

        return { rotationWeights, focoWeights };

    }


    /*
        Índice de "slot" (posición en la fila, no id
        de elemento) del cono visible desde el
        principio. Lo usa galeria-proyecto.js para
        saber a cuál cono rotar durante la fase
        "proyecto", y galeria.js para pasárselo.
    */

    function getHeroSlot() {

        return initialVisiblePosition;

    }


    return { update, getHeroSlot };

}


/*
    Fundido del hero de texto ("Cascarones de
    concreto...") y del indicador de scroll
    ("Desliza"), en función del progreso PROPIO de la
    fase "hero" (0..1) — independiente del progreso de
    la cascada de conos (ver el comentario grande más
    arriba). Función pura: no toca el DOM ni conos,
    devuelve los valores para que galeria.js los
    aplique.
*/

export function heroFadeEnvelope(t, config) {

    const heroFadeOpacity =
        1 -
        smoothstep(
            t / config.reveal.heroFadeOutAt
        );

    /*
        Mismo criterio que heroFadeOpacity: smoothstep
        sobre una banda alrededor de scrollHintFadeAt (no
        un corte binario exacto), para que el indicador
        "Desliza" se desvanezca en vez de desaparecer de
        un salto. "scrollHintFadeWidth" es esa banda, como
        fracción de "t" (mismas unidades que
        heroFadeOutAt/scrollHintFadeAt).

        Opcional en config (?? 0.02): un config viejo que
        no la defina usa una banda chica por defecto en
        vez de romper — mismo patrón que pitchMaxRad en
        galeria-interaccion-ficha.js.

        No hace falta histéresis acá (a diferencia del
        foco del carrusel, ver galeria-carrusel.js): es
        una función continua de "t" sola, sin estado
        previo que compita con el de este frame.
    */
    const scrollHintFadeWidth =
        config.reveal.scrollHintFadeWidth ?? 0.02;

    const scrollHintOpacity =
        1 -
        smoothstep(
            (t - config.reveal.scrollHintFadeAt) /
                scrollHintFadeWidth
        );

    return { heroFadeOpacity, scrollHintOpacity };

}
