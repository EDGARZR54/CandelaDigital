/* ==================================================
   galeria-controls.js

   Control manual de cámara sobre el objeto 3D EN FOCO
   durante "fichas" — los dos gestos son HERMANOS
   DIRECTOS, mismo patrón exacto (offset/vectorAplicado,
   setObjetoActivo, hitTestObjetoActivo, update,
   aplicarOffset, reset, mismo reset gradual atado al
   scroll de página vía galeria-scroll.js), aplicados a
   dos ejes de movimiento de cámara distintos:

     - createZoomController: rueda del mouse -> DOLLY,
       mueve camera.position a lo largo de su propio eje
       de vista.

     - createPaneoController: arrastre con botón DERECHO
       -> paneo, traslada camera.position sobre el plano
       perpendicular a ese eje (ejes locales "right"/"up"
       de la cámara).

   Se juntaron en un solo archivo por ser, literalmente,
   la misma idea aplicada dos veces —no por compartir
   código interno: cada factory sigue con su propio
   raycaster, su propio estado y su propia contabilidad
   de reset, deliberadamente sin compartir nada entre sí
   (mismo argumento que ya daba cada cabecera por
   separado: agnósticos del objeto, sin depender uno del
   otro, para que el día de mañana cualquiera de los dos
   pueda cambiar de mecanismo sin arrastrar al otro).

   NO incluye galeria-interaccion-ficha.js (rotación
   manual con botón IZQUIERDO): es el mismo patrón en
   espíritu, pero object-space en vez de camera-space, y
   sumarlo acá empujaría este archivo al rango de "35 KB
   o más" que este mismo agrupamiento busca evitar. Queda
   aparte a propósito.

   BOTÓN DERECHO/IZQUIERDO: zoom no usa botón (rueda del
   mouse), paneo usa el derecho, interaccion-ficha (aparte)
   usa el izquierdo — los tres escuchan el mismo
   renderer.domElement, cada uno filtra el suyo, así que
   conviven sin pisarse.
================================================== */

import * as THREE from "three";
import { getScrollDelta } from "./galeria-scroll.js";


/* ==================================================
   ZOOM — dolly de cámara vía rueda del mouse.
================================================== */

/*
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
*/
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


/* ==================================================
   PANEO — traslado de cámara vía arrastre con el botón
   derecho del mouse.
================================================== */

/*
   Traslada camera.position sobre el plano perpendicular
   a su propio eje de vista (ejes LOCALES "right"/"up" de
   la cámara, tomados de camera.matrixWorld cada vez, no
   fijos de mundo), nunca el objeto en sí: mismo criterio
   que el dolly de createZoomController de arriba (ver esa
   sección, "Zoom del modelo 3D"), y por el mismo motivo —
   no romper las unidades reales que a futuro va a
   necesitar la medición sobre la nube Potree.

   POR QUÉ CAMERA-SPACE Y NO OBJECT-SPACE (a diferencia de
   galeria-interaccion-ficha.js, que compone yaw/pitch
   DENTRO del quaternion del objeto en foco): panear no es
   una propiedad del objeto que se esté mirando, es dónde
   se para/apunta la cámara — mismo argumento que ya usa
   createZoomController para el dolly. Por eso, como ese
   módulo, ESTE NO FILTRA POR cupID en ningún lado: el
   offset es un único vector compartido, sin importar qué
   elemento esté en foco — sigue vivo (y decayendo con el
   scroll, ver más abajo) aunque el visitante cambie de
   ficha en el medio, ni bien vuelve a moverse el scroll de
   página. NO hace falta ningún reset inmediato al cambiar
   de foco (a diferencia de interaccionFicha.
   setElementoActivo): ese reset inmediato existe ahí para
   no filtrar por error un offset VIEJO como si fuera del
   elemento NUEVO (getOffset filtra por cupID) — acá no hay
   ese riesgo, no hay ningún filtro por id que pueda
   mentir.

   AGNÓSTICO DEL OBJETO, mismo patrón que
   createZoomController: este módulo no sabe nada de
   "cones" en particular, sólo conoce las mallas que le
   pasen por setObjetoActivo() (hit-test propio,
   deliberadamente NO comparte código con el de
   interaccion-ficha.js ni con el de zoom de arriba — cada
   función se mantiene agnóstica e independiente, mismo
   argumento que ya daba cada cabecera por separado para
   esa duplicación, incluso ahora que ambas viven en el
   mismo archivo).

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
   createZoomController de arriba (ver esa sección para el
   detalle completo de POR QUÉ alcanza con decaer sólo el
   estado propio y no tocar camera.position desde
   update()): el reset nunca se dispara al soltar el botón
   ni al perder el foco por sí solo — recién cuando VUELVE
   A MOVERSE EL SCROLL DE PÁGINA, y de forma gradual
   (suavizado exponencial, frame-rate independiente, mismo
   cfg.umbralScrollPx/cfg.resetSuavizadoMs por defecto que
   interaccion, sin inventar número mágico aparte). Un
   pointerdown nuevo (botón derecho, sobre el objeto)
   cancela un reset en curso, mismo criterio que ya usan
   zoom e interaccion-ficha.

   RESET INMEDIATO (reset(), sin animar): mismo momento que
   zoom.reset() (arriba) — los 4 puntos donde galeria.js
   sale de "fichas" del todo, más el listener de resize
   (que reescribe camera.position de forma incondicional,
   ver ese archivo).
*/
export function createPaneoController(
    config, { renderer, camera, phases }
) {

    const cfg = config.paneo || {};

    const sensibilidad = cfg.sensibilidad ?? 0.01;
    const distanciaMax = cfg.max ?? 4;

    /*
        Mismo criterio que ya usa createZoomController
        para estos dos campos: si config.paneo no define
        su propio umbral/suavizado, cae al de
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
        mismo rol que "offset" en createZoomController.

        "horizontalAplicado"/"verticalAplicado"/
        "vectorAplicado": lo que YA está horneado en
        camera.position en este momento — mismo criterio
        que "offsetAplicado"/"vectorAplicado" en
        createZoomController (ver esa sección para el
        porqué de guardar el vector REAL, no un escalar a
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
        galeria-carrusel.js/createZoomController: nada de
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
            createZoomController usa para el wheel — acá
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
        de esta sección para el porqué de no repetir acá el
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
        createZoomController/galeria-interaccion-ficha.js:
        ver cualquiera de los dos para el detalle completo
        del suavizado exponencial frame-rate independiente.
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
        que reset() en createZoomController (para cuando
        se llama, camera.position ya fue reescrita a su
        base por quien corresponda).
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
