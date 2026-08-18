/* ==================================================
   galeria-rotacion.js

   Controlador ÚNICO de la autorotación de conos —
   antes vivía sólo en galeria-proyecto.js, atada a
   esa fase; ahora la rotación tiene que sobrevivir a
   través de "hero → proyecto → revelado → fichas",
   con una razón distinta para estar girando en cada
   tramo, y sin cortes ni arranques en seco entre uno
   y otro.

   MODELO: cada cono tiene una velocidad angular
   propia (rotationVelocities[id], rad/ms), que en
   cada frame se acerca (nunca salta) hacia una
   velocidad objetivo. Esa velocidad objetivo sale de
   un "peso" 0..1 que le pasa quien llama a update()
   —"qué tanto debería estar girando este cono ahora
   mismo"— multiplicado por la velocidad máxima
   compartida (config.rotation.segundosPorVuelta).

   Quien decide esos pesos por frame es galeria.js,
   consultando a cada controlador de fase (reveal,
   carousel) o construyéndolos a mano (hero/proyecto).
   Este módulo no sabe nada de fases ni de scroll: sólo
   integra velocidad -> ángulo con inercia, cono por
   cono, id por id (mismo id que usa el resto de la
   app: la posición en el array "cones"/"elementos").

   Por qué velocidad con inercia y no "peso ->
   rotation.y directo": un peso que pasa de 1 a 0 de
   un frame a otro (p. ej. al cruzar de fase) daría un
   frenado en seco si se aplicara directo. Con la
   velocidad como estado propio, que se acerca de a
   poco al objetivo (suavizado exponencial,
   frame-rate independiente), un cambio brusco de peso
   se traduce en una desaceleración/aceleración
   pareja, no en un salto.
================================================== */


export function createRotationController(
    config, { cones, elementCount }
) {

    /*
        Radianes por milisegundo que le corresponde a
        un peso de 1 (misma cuenta que antes hacía
        galeria-proyecto.js, ahora la usan todos los
        tramos por igual — así la velocidad de giro se
        siente consistente sin importar qué fase la
        esté pidiendo).
    */
    const velocidadMaxima =
        (Math.PI * 2) /
        (config.rotation.segundosPorVuelta * 1000);


    /*
        Qué tan rápido la velocidad ACTUAL alcanza a
        la velocidad OBJETIVO. Es una constante de
        tiempo (ms): a mayor valor, más "inercia"
        (tarda más en acelerar/frenar). Suavizado
        exponencial => frame-rate independiente.
    */
    const constanteDeTiempo =
        config.rotation.suavizadoMs;


    const velocidadActual =
        new Array(elementCount).fill(0);

    let lastNow = null;


    /*
        weightsById: objeto o Map {id -> peso 0..1}.
        Cualquier id de "cones" que no aparezca ahí se
        toma como peso 0 (frena hasta detenerse, no
        deja de existir: sigue integrando su
        desaceleración en los próximos frames).
    */

    function pesoDe(weightsById, id) {

        if (!weightsById) return 0;

        const valor =
            typeof weightsById.get === "function"
                ? weightsById.get(id)
                : weightsById[id];

        return valor || 0;

    }


    function update(weightsById, now) {

        /*
            Primer frame: no hay "now" anterior con
            qué calcular un delta razonable — se
            arranca sin integrar nada este frame.
        */

        if (lastNow === null) {

            lastNow = now;
            return;

        }


        /*
            Clamp del delta: si la pestaña estuvo en
            segundo plano (rAF pausado), evita que un
            dt gigante haga girar un cono varias
            vueltas de golpe al volver.
        */

        const dt =
            Math.min(100, Math.max(0, now - lastNow));

        lastNow = now;


        const factor =
            1 - Math.exp(-dt / constanteDeTiempo);


        for (let id = 0; id < elementCount; id++) {

            const objetivo =
                pesoDe(weightsById, id) *
                velocidadMaxima;

            velocidadActual[id] +=
                (objetivo - velocidadActual[id]) *
                factor;


            /*
                Nada que integrar: se deja el ángulo
                actual tal cual (evita tocar
                rotation.y innecesariamente en los
                ~90% de conos quietos en cualquier
                momento dado).
            */

            if (
                velocidadActual[id] === 0 &&
                objetivo === 0
            ) continue;


            /*
                Se rota "pivote" (grupo interno centrado
                en el bbox real, ver armarGroup3D en
                galeria-escena.js), no el grupo "cono"
                en sí — ese último es el que
                galeria-reordenar.js/galeria-revelado.js
                posicionan por su punto de anclaje
                (base/cara frontal), que no coincide
                necesariamente con el centro del objeto.
                Girar el anclaje directamente hacía que
                el objeto "orbitara" en vez de girar en
                el lugar.
            */
            const cono = cones[id];

            const pivote =
                cono.userData.pivote || cono;

            pivote.rotation.y =
                (
                    pivote.rotation.y +
                    velocidadActual[id] * dt
                ) % (Math.PI * 2);

        }

    }


    return { update };

}
