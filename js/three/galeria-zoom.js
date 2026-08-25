/* ==================================================
   galeria-zoom.js

   Zoom del modelo 3D EN FOCO durante "fichas", vía la
   rueda del mouse — sin escalar el objeto (rompería las
   unidades reales que a futuro va a necesitar la
   herramienta de medición sobre la nube Potree, ver
   zoom3dScroll.md §4.1): es un DOLLY de cámara, mueve
   camera.position a lo largo de su propio eje de vista.

   AGNÓSTICO DEL OBJETO: este módulo no sabe nada de
   "cones" ni de mallas de un generador procedural en
   particular — solo conoce las mallas que le pasen por
   setObjetoActivo(mallas). Así, cuando a futuro exista
   la nube de puntos Potree en la escena (ver plan en
   zoom3dScroll.md, sección 2: potree-core inserta su
   octree como un THREE.Object3D más), el mismo dolly le
   sirve sin tocar una línea acá — quien decide qué se
   está mostrando (cono ideal o nube) simplemente le pasa
   otras mallas.

   GUARD DEL WHEEL, dos condiciones, ambas baratas:
     1) getPhase().phase === "fichas" — fuera de esa fase,
        jamás se intercepta nada; el wheel cae directo al
        scroll nativo de página (ver galeria-scroll.js,
        que este módulo JAMÁS toca).
     2) El cursor, en el instante del propio wheel, cae
        sobre las mallas del objeto activo (raycaster,
        mismo patrón que ya usa el hit-test de
        galeria-interaccion-ficha.js para el drag —
        deliberadamente NO se reutiliza esa función: este
        módulo no depende de ese archivo, que es
        específico del drag del cono, para mantenerse
        agnóstico del objeto en foco, ver arriba).

   Sin (1) y (2) a la vez, ni preventDefault() ni
   stopPropagation(): el wheel nunca interfiere con el
   cambio de fase/sección por scroll de página.

   CÁMARA FIJA DURANTE "fichas" (confirmado en
   zoom3dScroll.md §3.10: galeria-carrusel.js no toca
   "camera", y setCameraLado(1) es un no-op cuadro a
   cuadro una vez asentado) — por eso el dolly puede
   sumarse como un offset simple sobre una base quieta,
   sin competir con nada más que escriba camera.position
   en el mismo frame... EXCEPTO por dos casos, ambos ya
   cubiertos por reset() (ver más abajo):

     - Cambio de fase (setCameraLado escribe una posición
       NUEVA, completamente ajena al offset viejo).
     - resize() en galeria-escena.js, que reescribe
       camera.position de forma incondicional (sin el
       guard "sinCambios" que sí tiene setCameraLado).

   Por eso reset() NUNCA intenta "deshacer" el offset
   restándolo de camera.position: para cuando se llama
   (los 4 puntos donde ya se resetea carousel/
   interaccionFicha en galeria.js, más el listener de
   resize), camera.position YA fue reescrita a su base
   correcta por quien llamó antes (setCameraLado o
   resize) — reset() sólo tiene que poner en cero la
   CONTABILIDAD interna de este módulo (offset,
   offsetAplicado, vectorAplicado), para que la próxima
   vez que se entre a "fichas" el dolly vuelva a partir
   de 0 sobre la base que sea.

   RESET GRADUAL CON EL SCROLL — mismo mecanismo que ya
   usa galeria-interaccion-ficha.js para yaw/pitch, ver
   ese archivo para la explicación completa del porqué:
   el dolly manual NO se deshace solo ni al soltar la
   rueda ni por perder el foco — se queda como lo dejó
   el visitante hasta que vuelve a mover el scroll de
   PÁGINA (pedido explícito), y ahí recién se interpola
   de vuelta a 0 con el mismo suavizado exponencial,
   frame-rate independiente (mismos cfg.umbralScrollPx/
   cfg.resetSuavizadoMs por defecto que interaccion, ver
   más abajo — sin inventar número mágico aparte).

   Por qué alcanza con decaer "offset" nada más: a
   diferencia de yaw/pitch (que un tercero, el carrusel,
   lee vía getOffset() y compone él mismo en el
   quaternion), acá quien YA sabe traducir un cambio de
   "offset" en un cambio real de camera.position es este
   propio módulo, aplicarOffset() — así que update() no
   toca camera.position ni vectorAplicado por su cuenta:
   sólo mueve la fuente de verdad ("offset") un paso
   hacia 0 cada frame, y el aplicarOffset() que
   galeria.js ya llama SIEMPRE, cuadro a cuadro (ver ese
   archivo), se encarga solo de hornearlo en la cámara —
   ningún escritor nuevo, mismo único lugar de siempre.

   Por qué NO hace falta un análogo a "arrastrando": el
   drag de yaw/pitch es continuo (el mouse se mantiene
   apretado varios frames seguidos), así que ese reset
   necesita saber no pisarlo mientras sigue en curso. El
   wheel del dolly es discreto (un evento por "click" de
   rueda) y, apenas pasa el guard de fase+hit-test, hace
   preventDefault/stopPropagation — el scroll de PÁGINA
   (lo único que getScrollDelta mide) directamente no se
   mueve mientras se está haciendo zoom, así que no hay
   ventana en la que compitan por el mismo frame. Lo
   único que sí puede pasar es que el usuario dispare un
   wheel nuevo MIENTRAS el reset ya está en curso (tocó
   la rueda justo después de scrollear la página) — por
   eso onWheel apaga "resetPendiente" ante cualquier
   input nuevo: el usuario recupera el control total del
   offset, mismo criterio que onPointerDown ya aplica
   sobre resetPendiente en galeria-interaccion-ficha.js.
================================================== */

import * as THREE from "three";
import { getScrollDelta } from "./galeria-scroll.js";


export function createZoomController(
    config, { renderer, camera, phases }
) {

    /*
        Igual criterio que ya usa
        galeria-interaccion-ficha.js con
        cfg.sensibilidadVertical ?? cfg.sensibilidad:
        config.zoom es opcional, cae a valores por
        defecto razonables si el proyecto todavía no lo
        define en galeria-config.js. Mismos números que
        ahí (no elegidos aparte) — ver el comentario
        junto a "zoom" en ese archivo para de dónde
        salen (calibrados contra la distancia real
        cámara-mira de config.camera).
    */
    const cfg = config.zoom || {};

    const sensibilidad = cfg.sensibilidad ?? 0.0025;
    const distanciaMin = cfg.min ?? -6;
    const distanciaMax = cfg.max ?? 5;

    /*
        Mismo criterio que sensibilidadVertical en
        galeria-interaccion-ficha.js: si config.zoom no
        define sus propios umbral/suavizado de reset,
        cae a los que ya usa config.interaccion — mismo
        gesto de página (scroll) disparando el mismo tipo
        de reset, no hay motivo para que este módulo
        necesite su propio número calibrado aparte salvo
        que el proyecto lo pida explícitamente.
    */
    const umbralScrollPx =
        cfg.umbralScrollPx ??
            config.interaccion.umbralScrollPx;
    const resetSuavizadoMs =
        cfg.resetSuavizadoMs ??
            config.interaccion.resetSuavizadoMs;

    /*
        "offset": distancia de dolly deseada (clampeada),
        la fuente de verdad de este módulo.

        "offsetAplicado"/"vectorAplicado": lo que YA está
        horneado en camera.position en este momento —
        "vectorAplicado" guarda el vector REAL sumado la
        última vez (no un escalar a recalcular con la
        dirección del frame actual), para poder deshacerlo
        con exactitud sin importar si la dirección de la
        cámara cambió mientras tanto (no debería, ver
        cabecera, pero es la forma robusta de escribirlo).
    */
    let offset = 0;
    let offsetAplicado = 0;
    const vectorAplicado = new THREE.Vector3();

    let mallasActivas = null;

    /*
        Contabilidad del reset gradual — mismos tres
        nombres/roles que ya usa
        galeria-interaccion-ficha.js para yaw/pitch (ver
        cabecera): "resetPendiente" arranca en false y
        pasa a true recién cuando update() detecta scroll
        de página por encima de "umbralScrollPx" con un
        offset distinto de 0; "lastNow" es el timestamp
        del frame anterior, para poder integrar un dt real
        en el suavizado exponencial (null = todavía no
        corrió ningún frame, mismo caso "primer frame" que
        ya contempla ese otro módulo).
    */
    let resetPendiente = false;
    let lastNow = null;

    const raycaster = new THREE.Raycaster();
    const puntero = new THREE.Vector2();
    const direccionVista = new THREE.Vector3();


    /*
        La llama galeria.js, cada frame de "fichas",
        después de que carousel.update(t) ya resolvió qué
        elemento está en foco (ver el punto de enganche
        exacto documentado en zoom3dScroll.md §3.10) — con
        las mallas de ESE elemento (cones[id].userData.
        mallas hoy; las de la nube activa el día que
        exista, ver cabecera).
    */
    function setObjetoActivo(mallas) {

        mallasActivas = mallas;

    }


    function hitTestObjetoActivo(clientX, clientY) {

        if (!mallasActivas) return false;

        const rect =
            renderer.domElement
                .getBoundingClientRect();

        puntero.x =
            ((clientX - rect.left) / rect.width) *
                2 - 1;
        puntero.y =
            -((clientY - rect.top) / rect.height) *
                2 + 1;

        raycaster.setFromCamera(puntero, camera);

        return (
            raycaster
                .intersectObjects(mallasActivas, false)
                .length > 0
        );

    }


    function onWheel(ev) {

        /*
            Sin "now": este listener corre fuera del loop
            de render (evento nativo del navegador, no un
            frame de tick()), así que no hay un timestamp
            de requestAnimationFrame con el que cachear —
            mismo caso ya documentado en
            galeria-scroll.js para wireSortButtons(). No
            se lee window.scrollY ni getPhase() escribe
            nada, así que no hay riesgo de
            desincronización de fase con esta llamada.
        */
        if (phases.getPhase().phase !== "fichas") return;

        if (
            !hitTestObjetoActivo(ev.clientX, ev.clientY)
        ) return;

        /*
            Recién ACÁ, con las dos condiciones
            confirmadas, se le quita el wheel al scroll
            de página — nunca antes de este punto.
        */
        ev.preventDefault();
        ev.stopPropagation();

        /*
            Nuevo input del usuario: si había un reset en
            curso (scroll de página movido mientras el
            offset todavía no llegaba a 0), se cancela acá
            mismo — el visitante recupera control total
            del dolly de inmediato, mismo criterio que
            onPointerDown en galeria-interaccion-ficha.js.
        */
        resetPendiente = false;

        offset = THREE.MathUtils.clamp(
            offset - ev.deltaY * sensibilidad,
            distanciaMin, distanciaMax
        );

    }


    /*
        La llama galeria.js una vez por frame, siempre
        (no sólo dentro del bloque "fichas" — ver el
        comentario junto a su llamada en tick()),
        idealmente el último paso antes de
        renderer.render(). Sin cambios de "offset" desde
        el frame anterior es un no-op barato: la
        comparación de escalares alcanza, no hace falta
        reconstruir el vector para descartarlo.
    */
    function aplicarOffset() {

        if (offset === offsetAplicado) return;

        camera.getWorldDirection(direccionVista);

        const nuevoVector =
            direccionVista
                .clone()
                .multiplyScalar(offset);

        camera.position
            .sub(vectorAplicado)
            .add(nuevoVector);

        vectorAplicado.copy(nuevoVector);
        offsetAplicado = offset;

    }


    /*
        La llama galeria.js una vez por frame, siempre
        (mismo lugar/criterio que ya vale para
        aplicarOffset(), justo antes de esa llamada — ver
        el comentario junto a zoom.update(now) en
        galeria.js): detecta si hay que arrancar el reset
        (scroll de página movido, con un offset no-nulo
        que deshacer) y, si ya está en curso, avanza el
        suavizado exponencial de "offset" hacia 0 — mismo
        factor, mismo cálculo que ya usa
        galeria-interaccion-ficha.js para yaw/pitch (ver
        cabecera de este archivo para el porqué de por qué
        alcanza con tocar sólo "offset" acá, sin escribir
        camera.position por su cuenta).
    */
    function update(now) {

        const deltaScroll = getScrollDelta(now);

        if (
            offset !== 0 &&
            Math.abs(deltaScroll) > umbralScrollPx
        ) {

            resetPendiente = true;

        }


        if (!resetPendiente) {

            lastNow = now;
            return;

        }


        /*
            Primer frame del reset: sin un "now" anterior
            con qué calcular un delta razonable, no se
            integra nada todavía (mismo criterio que
            galeria-interaccion-ficha.js y, antes que ese,
            galeria-rotacion.js).
        */
        if (lastNow === null) {

            lastNow = now;
            return;

        }

        const dt =
            Math.min(100, Math.max(0, now - lastNow));

        lastNow = now;

        const factor =
            1 - Math.exp(-dt / resetSuavizadoMs);

        offset -= offset * factor;

        if (Math.abs(offset) < 0.0005) {

            offset = 0;
            resetPendiente = false;

        }

    }


    /*
        Pone en cero la CONTABILIDAD del dolly — nunca
        toca camera.position (ver por qué en la cabecera).
        Se llama desde galeria.js en:
          - los mismos 4 puntos donde ya se resetean
            carousel/interaccionFicha (toda transición
            que sale de "fichas"),
          - el listener de "resize" (después de que
            resize() ya reescribió camera.position a su
            base para el nuevo aspecto).
    */
    function reset() {

        offset = 0;
        offsetAplicado = 0;
        vectorAplicado.set(0, 0, 0);
        mallasActivas = null;

        /*
            Mismo agregado que ya hacía falta en
            galeria-interaccion-ficha.js: sin esto, un
            resetPendiente que quedó a mitad de camino al
            salir de "fichas" seguiría "en curso" —aunque
            ya no tenga nada que decaer, offset ya está en
            0 arriba— y lastNow quedaría con un timestamp
            viejo, referencia inútil para la próxima vez
            que se re-entre a "fichas" y arranque un reset
            de verdad.
        */
        resetPendiente = false;
        lastNow = null;

    }


    renderer.domElement.addEventListener(
        "wheel", onWheel, { passive: false }
    );


    return {
        setObjetoActivo,
        update,
        aplicarOffset,
        reset,
        getOffset: () => offset
    };

}
