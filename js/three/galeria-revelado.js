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
        restY, getHiddenDrop
    }
) {

    const span =
        config.reveal.span;


    /*
        Se ve desde el principio la ÚLTIMA posición
        de la fila. El resto revela en cascada, de
        la penúltima hacia la primera (más cercana
        a la cámara, la más grande/dramática),
        quedando de cierre.
    */

    const initialVisiblePosition =
        Math.max(0, elementCount - 1);

    const revealOrder = [];

    for (let i = elementCount - 2; i >= 0; i--) {

        revealOrder.push(i);

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
        const hiddenY =
            restY - getHiddenDrop();

        const rotationWeights = {};


        if (elementCount === 0) return { rotationWeights };


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

        const heroPos =
            positions[initialVisiblePosition];

        heroCone.position.set(
            heroPos.x, restY, heroPos.z
        );

        heroCone.material.opacity = 1;


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

                const y =
                    hiddenY +
                    (restY - hiddenY) * e;

                /*
                    Un ligero rebote/asentamiento
                    de escala al llegar arriba.
                */

                const settle =
                    1 +
                    Math.sin(localT * Math.PI) *
                    config.reveal.settleBounce;

                cone.position.set(
                    pos.x, y, pos.z
                );

                cone.scale.setScalar(
                    localT >= 1 ? 1 : settle
                );

                cone.material.opacity = 1;


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

            }
        );

        return { rotationWeights };

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
    fase "hero" (0..1) — ya no comparte tiempo con la
    cascada de conos (ver el comentario grande más
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
