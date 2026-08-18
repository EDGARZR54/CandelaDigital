/* ==================================================
   galeria-interaccion-ficha.js

   Rotación MANUAL del elemento EN FOCO durante la fase
   "fichas": arrastre (mouse o touch) sobre su mesh lo
   gira alrededor de su propio centroide — arrastre
   HORIZONTAL gira sobre el eje vertical (yaw, como
   antes), arrastre VERTICAL gira sobre el eje horizontal
   "de frente" del objeto (pitch, nuevo) — sin tocar la
   escena ni al resto de los elementos del círculo.

   CAPA ADITIVA, no reemplazo: galeria-carrusel.js ya
   reescribe cone.quaternion ENTERO cada frame (grupo
   EXTERNO, orientación "outward" hacia cámara — ver ese
   archivo) y galeria-rotacion.js escribe por su cuenta
   pivote.rotation.y (grupo INTERNO, giro propio
   ambiental). Este módulo no toca ningún quaternion ni
   rotation por su cuenta: sólo expone getOffset(cupID),
   y es galeria-carrusel.js quien compone yaw+pitch con su
   propio ángulo base (rotationY + offset) en el ÚNICO
   lugar que ya escribe la orientación de ese objeto — así
   no hay dos escritores compitiendo por el mismo frame.

   POR QUÉ DOS EJES POR SEPARADO Y NO UN "OFFSET" ÚNICO:
   yaw y pitch necesitan su propio valor porque cada uno
   viene de una componente distinta del arrastre (deltaX
   vs deltaY) y cada uno se resetea/interpola de forma
   independiente — un giro horizontal en curso no debería
   verse afectado por el reset de uno vertical que terminó
   antes, ni viceversa. getOffset(cupID) devuelve ambos
   juntos ({ yaw, pitch }) porque quien los consume
   (galeria-carrusel.js) siempre necesita los dos a la vez
   para componer el quaternion total en un único lugar.

   SÓLO el elemento en foco es arrastrable: el hit-test
   de pointerdown se hace nada más contra sus mallas
   (cones[elementoActivoId].userData.mallas), nunca
   contra el resto del círculo — "elementoActivoId" lo
   actualiza galeria.js, cuadro a cuadro, con el
   "elementoId" que ya devuelve carousel.update().

   PITCH CLAMPEADO: a diferencia del yaw (que puede dar
   vueltas completas sin problema, es una rotación
   "libre" alrededor de un eje que siempre mira hacia
   arriba), el pitch se clampea a
   ±cfg.pitchMaxRad —pasado ese punto el objeto queda de
   canto o invertido respecto a la cámara, y se ve como
   si "se rompiera" el círculo en vez de como una
   inclinación natural. El yaw no tiene este problema así
   que no se clampea.

   RESET: nunca al soltar el mouse ni al perder el foco
   por sí solo (el spotlight avanza solo con el scroll,
   sin que nadie suelte nada) — recién cuando VUELVE A
   MOVERSE EL SCROLL (pedido explícito), y de forma
   gradual: se interpola de vuelta a 0 —yaw y pitch cada
   uno por su cuenta, mismo factor de suavizado en el
   mismo frame— con el mismo suavizado exponencial,
   frame-rate independiente, que ya usa
   galeria-rotacion.js para la inercia del giro propio —
   no de golpe, o se vería un salto.

   Aparte de ese reset animado, existe reset() —sin
   animar, inmediato— para cuando galeria.js sale de
   "fichas" del todo (mismos puntos donde ya se llama a
   carousel.reset(), ver ese archivo): sin este segundo
   reset, un offset viejo (yaw o pitch) quedaría pegado
   al volver a entrar más adelante sobre el mismo
   elemento (p. ej. el ancla, que es siempre el primero
   en foco).
================================================== */

import * as THREE from "three";
/*
    "update()" ya no lleva su propio "lastScrollY" ni
    lee "window.scrollY" por su cuenta: pide el delta
    directo a galeria-scroll.js, el punto único de
    lectura de scroll para toda la página (ver ese
    archivo) — así este módulo, galeria-fases.js y
    galeria.js ven siempre el mismo scroll dentro del
    mismo frame, y acá además se elimina el trackeo
    manual de "lastScrollY" que antes vivía duplicado.
*/
import { getScrollDelta } from "./galeria-scroll.js";


export function createInteraccionFicha(
    config, { renderer, camera, cones }
) {

    const cfg = config.interaccion;

    /*
        Sensibilidad y límite del pitch son opcionales en
        config: si el proyecto todavía no los define (por
        ejemplo, config viejo de antes de este cambio),
        caen a valores por defecto razonables en vez de
        romper — mismo criterio que ya usa
        getManualOffset = () => 0 en galeria-carrusel.js
        para el caso "nadie pasó nada".
    */
    const sensibilidadYaw = cfg.sensibilidad;
    const sensibilidadPitch =
        cfg.sensibilidadVertical ?? cfg.sensibilidad;
    const pitchMaxRad =
        cfg.pitchMaxRad ?? Math.PI / 2 * 0.85;

    const raycaster = new THREE.Raycaster();
    const puntero = new THREE.Vector2();

    let elementoActivoId = null;

    let offsetYaw = 0;
    let offsetPitch = 0;

    let arrastrando = false;
    let resetPendiente = false;

    let lastPointerX = 0;
    let lastPointerY = 0;
    let lastNow = null;


    /*
        Se llama todos los frames de "fichas" con el
        elemento en foco vigente. Si es el mismo de
        antes, no hace nada; si cambió —nuevo foco, o
        se venía de otra fase vía reset()— descarta
        cualquier offset viejo (yaw y pitch) SIN
        animarlo: no tendría sentido "restablecer
        suavemente" la rotación de un elemento que ya no
        se está mirando.
    */
    function setElementoActivo(id) {

        if (id === elementoActivoId) return;

        elementoActivoId = id;
        offsetYaw = 0;
        offsetPitch = 0;
        arrastrando = false;
        resetPendiente = false;

    }


    /*
        Reset INMEDIATO (sin animar): lo llama
        galeria.js junto a cada carousel.reset(), es
        decir, en toda fase que no sea "fichas" — ver
        cabecera.
    */
    function reset() {

        elementoActivoId = null;
        offsetYaw = 0;
        offsetPitch = 0;
        arrastrando = false;
        resetPendiente = false;

    }


    function hitTestElementoActivo(clientX, clientY) {

        if (elementoActivoId === null) return false;

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

        const mallas =
            cones[elementoActivoId].userData.mallas;

        return (
            raycaster
                .intersectObjects(mallas, false)
                .length > 0
        );

    }


    function onPointerDown(ev) {

        if (
            !hitTestElementoActivo(
                ev.clientX, ev.clientY
            )
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

        offsetYaw += deltaX * sensibilidadYaw;

        /*
            Signo positivo: arrastrar hacia ARRIBA
            (deltaY negativo, coordenadas de pantalla
            crecen hacia abajo) inclina el borde
            superior del objeto HACIA la cámara —
            convención confirmada mirando la escena real
            (la primera versión tenía el signo opuesto,
            invertido respecto de lo esperado). Es
            arbitraria, mismo caso que el signo de
            rotationY en galeria-carrusel.js.
        */
        const pitchSinClamp =
            offsetPitch + deltaY * sensibilidadPitch;

        offsetPitch = Math.max(
            -pitchMaxRad,
            Math.min(pitchMaxRad, pitchSinClamp)
        );

    }


    function onPointerUp(ev) {

        if (!arrastrando) return;

        arrastrando = false;

        renderer.domElement.releasePointerCapture(
            ev.pointerId
        );

        renderer.domElement.style.cursor = "";

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


    /*
        Un frame de vida propia: detecta si hay que
        arrancar el reset (scroll movido, sin arrastre
        en curso, con algo que resetear en CUALQUIERA de
        los dos ejes) y, si ya está en curso, avanza el
        suavizado exponencial de yaw y pitch hacia 0 —
        cada uno con su propio valor, mismo factor
        (calculado una sola vez por frame, no depende del
        eje). No hace falta devolver nada — quien
        necesita el valor vigente llama a getOffset()
        aparte, después de este update() (ver
        galeria.js).
    */
    function update(now) {

        const deltaScroll = getScrollDelta(now);

        if (
            !arrastrando &&
            (offsetYaw !== 0 || offsetPitch !== 0) &&
            Math.abs(deltaScroll) >
                cfg.umbralScrollPx
        ) {

            resetPendiente = true;

        }


        if (!resetPendiente || arrastrando) {

            lastNow = now;
            return;

        }


        /*
            Primer frame del reset: sin un "now"
            anterior con qué calcular un delta
            razonable, no se integra nada todavía
            (mismo criterio que el primer frame de
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
            1 - Math.exp(-dt / cfg.resetSuavizadoMs);

        offsetYaw -= offsetYaw * factor;
        offsetPitch -= offsetPitch * factor;

        if (
            Math.abs(offsetYaw) < 0.0005 &&
            Math.abs(offsetPitch) < 0.0005
        ) {

            offsetYaw = 0;
            offsetPitch = 0;
            resetPendiente = false;

        }

    }


    /*
        Offset vigente para un cupID dado: sólo el
        elemento en foco tiene un offset propio no-nulo
        — galeria-carrusel.js igual llama a esto por
        cada elemento del círculo (recorre "order"
        entero todos los frames), así que el filtro por
        id vive acá, no del lado del que llama. Devuelve
        los DOS ejes juntos porque quien consume esto
        siempre los necesita a la vez para componer un
        único quaternion (ver cabecera).
    */
    function getOffset(cupID) {

        if (cupID !== elementoActivoId) {

            return { yaw: 0, pitch: 0 };

        }

        return { yaw: offsetYaw, pitch: offsetPitch };

    }


    return {
        setElementoActivo,
        reset,
        update,
        getOffset
    };

}
