/* ==================================================
   galeria-scroll.js

   Punto ÚNICO de lectura de window.scrollY para toda la
   página de galería. A partir de este archivo, ningún
   otro módulo (galeria.js, galeria-fases.js,
   galeria-interaccion-ficha.js) debería llamar a
   "window.scrollY" por su cuenta — todos piden acá.

   POR QUÉ: antes cada módulo leía window.scrollY por
   separado, hasta 3 veces en el mismo frame:

     - galeria.js, en tick() (distanciaLiberada)
     - galeria-fases.js, dentro de getPhase()
     - galeria-interaccion-ficha.js, dentro de su
       update(), para su propio umbralScrollPx

   Dos problemas con eso:

     1) Leer window.scrollY puede forzar al navegador a
        resolver layout pendiente (mismo costo que
        getBoundingClientRect) — 3 lecturas por frame es
        3 veces ese costo en vez de 1.

     2) Si el usuario scrollea muy rápido, el evento de
        scroll puede dispararse A MITAD del frame — cada
        módulo, leyendo en un instante distinto de su
        propia ejecución, podía llegar a ver un
        window.scrollY LIGERAMENTE distinto al de los
        otros dentro del mismo tick(). Normalmente
        inofensivo, pero es exactamente el tipo de
        desincronización de un pixel que puede acentuar
        problemas de umbral exacto en los módulos que
        consumen ese valor.

   Este archivo es deliberadamente "tonto": no decide
   fases, ni foco, ni umbral — solo expone el dato crudo
   (posición, delta, dirección), UNA sola vez por frame.
   Las decisiones de negocio se quedan donde ya estaban
   (galeria-fases.js decide fases, galeria-interaccion-
   ficha.js decide cuándo resetear su offset manual).
================================================== */


let scrollYActual = 0;
let scrollYAnterior = 0;

/*
    Identifica el frame en curso (el "now" que ya le pasa
    requestAnimationFrame a tick() en galeria.js). Sirve
    para que, si dos módulos piden el scroll DENTRO del
    mismo frame, la segunda lectura no vuelva a tocar
    window.scrollY: usan el valor ya cacheado de la
    primera. -1 = todavía no se leyó nada.
*/
let frameCacheado = -1;


function leerSiHaceFalta(now) {

    /*
        Sin "now" (llamada suelta fuera del loop de
        render — por ejemplo, un click handler que
        pregunta la fase vigente, ver wireSortButtons en
        galeria.js): no hay frame contra el cual
        cachear, así que se lee siempre fresco. Es un
        caso raro (no every-frame), así que no vale la
        pena optimizarlo.
    */
    if (now === undefined) {

        scrollYAnterior = scrollYActual;
        scrollYActual = Math.max(0, window.scrollY);
        return;

    }

    if (now === frameCacheado) return;

    frameCacheado = now;
    scrollYAnterior = scrollYActual;
    scrollYActual = Math.max(0, window.scrollY);

}


/*
    Posición de scroll vigente (siempre >= 0, mismo
    criterio que ya usaban por separado galeria-fases.js
    y galeria.js con Math.max(0, window.scrollY)).
*/
export function getScrollY(now) {

    leerSiHaceFalta(now);
    return scrollYActual;

}


/*
    Cuánto se movió el scroll desde la última lectura
    (positivo = bajando, negativo = subiendo). Reemplaza
    el patrón "let lastScrollY = ...; scrollY - lastScrollY"
    que antes vivía duplicado dentro de cada módulo que
    necesitaba detectar movimiento (ver
    galeria-interaccion-ficha.js).
*/
export function getScrollDelta(now) {

    leerSiHaceFalta(now);
    return scrollYActual - scrollYAnterior;

}


/*
    1 = bajando, -1 = subiendo, 0 = sin movimiento neto
    desde la última lectura.
*/
export function getScrollDireccion(now) {

    const delta = getScrollDelta(now);

    if (delta > 0) return 1;
    if (delta < 0) return -1;
    return 0;

}
