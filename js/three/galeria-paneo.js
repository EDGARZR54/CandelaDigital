/* ==================================================
   galeria-paneo.js

   Paneo del modelo 3D EN FOCO durante "fichas", vía
   arrastre con el BOTÓN DERECHO del mouse — traslada
   camera.position sobre el plano perpendicular a su
   propio eje de vista (ejes LOCALES "right"/"up" de la
   cámara, tomados de camera.matrixWorld cada vez, no
   fijos de mundo), nunca el objeto en sí: mismo criterio
   que el dolly de galeria-zoom.js (ver ese archivo,
   §"Zoom del modelo 3D"), y por el mismo motivo — no
   romper las unidades reales que a futuro va a necesitar
   la medición sobre la nube Potree.

   POR QUÉ CAMERA-SPACE Y NO OBJECT-SPACE (a diferencia de
   galeria-interaccion-ficha.js, que compone yaw/pitch
   DENTRO del quaternion del objeto en foco): panear no es
   una propiedad del objeto que se esté mirando, es dónde
   se para/apunta la cámara — mismo argumento que ya usa
   galeria-zoom.js para el dolly. Por eso, como ese módulo,
   ESTE NO FILTRA POR cupID en ningún lado: el offset es un
   único vector compartido, sin importar qué elemento esté
   en foco — sigue vivo (y decayendo con el scroll, ver
   más abajo) aunque el visitante cambie de ficha en el
   medio, ni bien vuelve a moverse el scroll de página. NO
   hace falta ningún reset inmediato al cambiar de foco (a
   diferencia de interaccionFicha.setElementoActivo): ese
   reset inmediato existe ahí para no filtrar por error un
   offset VIEJO como si fuera del elemento NUEVO (getOffset
   filtra por cupID) — acá no hay ese riesgo, no hay ningún
   filtro por id que pueda mentir.

   AGNÓSTICO DEL OBJETO, mismo patrón que galeria-zoom.js:
   este módulo no sabe nada de "cones" en particular, sólo
   conoce las mallas que le pasen por setObjetoActivo()
   (hit-test propio, deliberadamente NO comparte código con
   el de interaccion-ficha.js ni con el de zoom — cada
   módulo se mantiene agnóstico e independiente, mismo
   argumento que ya da la cabecera de galeria-zoom.js para
   esa duplicación).

   BOTÓN DERECHO, NO IZQUIERDO: el izquierdo ya lo usa
   galeria-interaccion-ficha.js para rotar (yaw/pitch) — ver
   ese archivo, que ahora filtra ev.button === 0 en su
   propio pointerdown. Los dos módulos escuchan el mismo
   renderer.domElement, cada uno filtra su propio botón, así
   que conviven sin pisarse (salvo el caso raro de sostener
   ambos botones a la vez, sin tratamiento especial — cada
   uno simplemente reacciona al suyo).

   MENÚ CONTEXTUAL DEL NAVEGADOR: click derecho dispara,
   al soltar, el menú nativo ("Guardar imagen como…",
   "Copiar imagen", "Inspeccionar") — indeseable arriba de
   un gesto de paneo. Se suprime con preventDefault() en
   "contextmenu", pero el guard NO repite el hit-test del
   pointerdown que lo originó (a diferencia del guard del
   paneo en sí): para cuando el evento "contextmenu" llega,
   ya pasó tiempo y el estado pudo cambiar, así que
   depender de un hit-test viejo sería frágil. En cambio,
   alcanza con mirar la fase vigente en ESE instante:
   dentro de "fichas", el botón derecho ya está reapropiado
   para paneo en toda la superficie del canvas, así que
   mostrar el menú nativo ahí siempre sería sorpresivo,
   haya o no geometría exactamente bajo el cursor en ese
   pixel. Fuera de "fichas", el menú nativo se deja
   intacto.

   GUARD Y RESET GRADUAL — mismo mecanismo, en espejo, que
   galeria-zoom.js (ver ese archivo para el detalle
   completo de POR QUÉ alcanza con decaer sólo el estado
   propio y no tocar camera.position desde update()): el
   reset nunca se dispara al soltar el botón ni al perder
   el foco por sí solo — recién cuando VUELVE A MOVERSE EL
   SCROLL DE PÁGINA, y de forma gradual (suavizado
   exponencial, frame-rate independiente, mismo
   cfg.umbralScrollPx/cfg.resetSuavizadoMs por defecto que
   interaccion, sin inventar número mágico aparte). Un
   pointerdown nuevo (botón derecho, sobre el objeto)
   cancela un reset en curso, mismo criterio que ya usan
   zoom e interaccion-ficha.

   RESET INMEDIATO (reset(), sin animar): mismo momento que
   zoom.reset() — los 4 puntos donde galeria.js sale de
   "fichas" del todo, más el listener de resize (que
   reescribe camera.position de forma incondicional, ver
   ese archivo).
================================================== */

import * as THREE from "three";
import { getScrollDelta } from "./galeria-scroll.js";


export function createPaneoController(
    config, { renderer, camera, phases }
) {

    const cfg = config.paneo || {};

    const sensibilidad = cfg.sensibilidad ?? 0.01;
    const distanciaMax = cfg.max ?? 4;

    /*
        Mismo criterio que ya usa galeria-zoom.js para
        estos dos campos: si config.paneo no define su
        propio umbral/suavizado, cae al de
        config.interaccion — mismo gesto de página
        (scroll) disparando el mismo tipo de reset, no hay
        motivo para que este módulo necesite un número
        calibrado aparte.
    */
    const umbralScrollPx =
        cfg.umbralScrollPx ??
            config.interaccion.umbralScrollPx;
    const resetSuavizadoMs =
        cfg.resetSuavizadoMs ??
            config.interaccion.resetSuavizadoMs;

    /*
        "panHorizontal"/"panVertical": distancia de paneo
        deseada (clampeada en conjunto, ver
        onPointerMove), medida a lo largo de los ejes
        LOCALES "right"/"up" de la cámara — no de X/Y de
        mundo. Son la fuente de verdad de este módulo,
        mismo rol que "offset" en galeria-zoom.js.

        "horizontalAplicado"/"verticalAplicado"/
        "vectorAplicado": lo que YA está horneado en
        camera.position en este momento — mismo criterio
        que "offsetAplicado"/"vectorAplicado" en
        galeria-zoom.js (ver ese archivo para el porqué de
        guardar el vector REAL, no un escalar a
        recalcular con los ejes del frame actual).
    */
    let panHorizontal = 0;
    let panVertical = 0;
    let horizontalAplicado = 0;
    let verticalAplicado = 0;
    const vectorAplicado = new THREE.Vector3();

    let mallasActivas = null;

    /*
        Contabilidad del reset gradual — mismos tres
        nombres/roles que ya usan zoom e
        interaccion-ficha.
    */
    let resetPendiente = false;
    let lastNow = null;

    let arrastrando = false;
    let lastPointerX = 0;
    let lastPointerY = 0;

    const raycaster = new THREE.Raycaster();
    const puntero = new THREE.Vector2();

    /*
        Reusados frame a frame en aplicarOffset() (ver
        más abajo) — instanciados una sola vez acá, mismo
        criterio de performance que ya aplica
        galeria-carrusel.js/galeria-zoom.js: nada de
        allocations evitables en el camino caliente.
    */
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const nuevoVector = new THREE.Vector3();


    /*
        La llama galeria.js, cada frame de "fichas",
        mismo punto/criterio que zoom.setObjetoActivo()
        (de hecho, mismas mallas: geometría real + planos
        de corte visibles, ver galeria-plano-corte.js).
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


    function onPointerDown(ev) {

        if (ev.button !== 2) return;

        /*
            Mismo guard de dos condiciones que
            galeria-zoom.js usa para el wheel — acá
            también hace falta explícito (no alcanza con
            que mallasActivas sea null fuera de "fichas":
            un pointerdown nativo, como el wheel, puede
            llegar en la ventana de un frame donde la
            fase ya cambió pero reset() todavía no corrió).
        */
        if (phases.getPhase().phase !== "fichas") return;

        if (
            !hitTestObjetoActivo(ev.clientX, ev.clientY)
        ) return;

        arrastrando = true;
        resetPendiente = false;
        lastPointerX = ev.clientX;
        lastPointerY = ev.clientY;

        renderer.domElement.setPointerCapture(
            ev.pointerId
        );

        renderer.domElement.style.cursor =
            "grabbing";

    }


    function onPointerMove(ev) {

        if (!arrastrando) return;

        const deltaX = ev.clientX - lastPointerX;
        const deltaY = ev.clientY - lastPointerY;

        lastPointerX = ev.clientX;
        lastPointerY = ev.clientY;

        /*
            Convención "arrastrar = agarrar y correr el
            objeto con el cursor" (mismo criterio que la
            mayoría de visores 3D/mapas):

            - Arrastrar hacia la DERECHA (deltaX > 0)
              tiene que hacer que el objeto APAREZCA
              corrido hacia la derecha en pantalla — eso
              significa mover la CÁMARA hacia su propio
              "-right" (izquierda), de ahí el signo
              negativo.

            - Arrastrar hacia ABAJO (deltaY > 0, pantalla
              crece hacia abajo) tiene que hacer que el
              objeto APAREZCA corrido hacia abajo — eso
              significa mover la cámara hacia su propio
              "+up" (arriba: cámara más alta ve todo más
              abajo en el cuadro), de ahí el signo
              positivo. Es arbitraria, mismo caso que el
              signo de pitch en
              galeria-interaccion-ficha.js — se confirma
              mirando la escena real.
        */
        panHorizontal -= deltaX * sensibilidad;
        panVertical += deltaY * sensibilidad;

        /*
            Clamp EN CONJUNTO (distancia radial de las
            dos componentes juntas, no cada una por su
            lado): paneo es simétrico en las 4
            direcciones, un solo límite alcanza — ver
            "max" en galeria-config.js.
        */
        const largo =
            Math.hypot(panHorizontal, panVertical);

        if (largo > distanciaMax) {

            const factor = distanciaMax / largo;

            panHorizontal *= factor;
            panVertical *= factor;

        }

    }


    function onPointerUp(ev) {

        if (!arrastrando) return;

        arrastrando = false;

        renderer.domElement.releasePointerCapture(
            ev.pointerId
        );

        renderer.domElement.style.cursor = "";

    }


    /*
        Ver "MENÚ CONTEXTUAL DEL NAVEGADOR" en la cabecera
        del archivo para el porqué de no repetir acá el
        hit-test del pointerdown.
    */
    function onContextMenu(ev) {

        if (phases.getPhase().phase === "fichas") {

            ev.preventDefault();

        }

    }


    /*
        La llama galeria.js una vez por frame, siempre
        (mismo criterio que zoom.aplicarOffset(): idealmente
        el último paso antes de renderer.render()). Sin
        cambios desde el frame anterior es un no-op barato:
        la comparación de escalares alcanza.
    */
    function aplicarOffset() {

        if (
            panHorizontal === horizontalAplicado &&
            panVertical === verticalAplicado
        ) return;

        right.setFromMatrixColumn(
            camera.matrixWorld, 0
        );
        up.setFromMatrixColumn(
            camera.matrixWorld, 1
        );

        nuevoVector
            .copy(right)
            .multiplyScalar(panHorizontal)
            .addScaledVector(up, panVertical);

        camera.position
            .sub(vectorAplicado)
            .add(nuevoVector);

        vectorAplicado.copy(nuevoVector);
        horizontalAplicado = panHorizontal;
        verticalAplicado = panVertical;

    }


    /*
        La llama galeria.js una vez por frame, siempre —
        mismo criterio, mismo cálculo, que
        galeria-zoom.js/galeria-interaccion-ficha.js: ver
        cualquiera de los dos para el detalle completo del
        suavizado exponencial frame-rate independiente.
    */
    function update(now) {

        const deltaScroll = getScrollDelta(now);

        if (
            !arrastrando &&
            (panHorizontal !== 0 || panVertical !== 0) &&
            Math.abs(deltaScroll) > umbralScrollPx
        ) {

            resetPendiente = true;

        }


        if (!resetPendiente || arrastrando) {

            lastNow = now;
            return;

        }


        if (lastNow === null) {

            lastNow = now;
            return;

        }

        const dt =
            Math.min(100, Math.max(0, now - lastNow));

        lastNow = now;

        const factor =
            1 - Math.exp(-dt / resetSuavizadoMs);

        panHorizontal -= panHorizontal * factor;
        panVertical -= panVertical * factor;

        if (
            Math.abs(panHorizontal) < 0.0005 &&
            Math.abs(panVertical) < 0.0005
        ) {

            panHorizontal = 0;
            panVertical = 0;
            resetPendiente = false;

        }

    }


    /*
        Pone en cero la CONTABILIDAD del paneo — nunca
        toca camera.position por su cuenta, mismo motivo
        que reset() en galeria-zoom.js (para cuando se
        llama, camera.position ya fue reescrita a su base
        por quien corresponda).
    */
    function reset() {

        panHorizontal = 0;
        panVertical = 0;
        horizontalAplicado = 0;
        verticalAplicado = 0;
        vectorAplicado.set(0, 0, 0);
        mallasActivas = null;

        arrastrando = false;
        resetPendiente = false;
        lastNow = null;

    }


    renderer.domElement.addEventListener(
        "pointerdown", onPointerDown
    );
    renderer.domElement.addEventListener(
        "pointermove", onPointerMove
    );
    renderer.domElement.addEventListener(
        "pointerup", onPointerUp
    );
    renderer.domElement.addEventListener(
        "pointercancel", onPointerUp
    );
    renderer.domElement.addEventListener(
        "contextmenu", onContextMenu
    );


    return {
        setObjetoActivo,
        update,
        aplicarOffset,
        reset
    };

}
