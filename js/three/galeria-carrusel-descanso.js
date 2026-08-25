/* ==================================================
   galeria-carrusel-descanso.js

   Extraído de galeria-carrusel.js (archivo original ya
   muy grande) — contiene ÚNICAMENTE las tres funciones
   puras que resuelven la "meseta de descanso" del
   scroll dentro de la fase "fichas": indiceContinuo(),
   targetU() y pasoConDescanso().

   Por qué estas tres viven separadas del resto del
   carrusel: no dependen de THREE, no tocan geometría,
   material ni cámara, y no capturan ningún estado del
   closure de createCarouselController() — son funciones
   puras (mismo input siempre da mismo output). Su único
   trabajo es traducir "rotateT" (0..1, progreso crudo del
   tramo "rotar") en el número/ángulo real que corresponde
   una vez que se le aplica la meseta — ver el comentario
   grande más abajo para el detalle completo del porqué.

   galeria-carrusel.js las importa y las usa tal cual
   (misma firma, mismo comportamiento) — este split no
   cambia ningún comportamiento visible, solo la
   organización del código. Nadie más necesita importar
   este archivo directamente.
================================================== */

import { ease } from "./galeria-utils.js";


/*
   MESETA DE DESCANSO (phi): la histéresis de arriba
   evita que la FICHA de texto cambie de un lado a otro
   cerca del cruce, pero nunca tocó la posición/
   orientación real de la geometría — "phi" (el ángulo
   que hace rotar el círculo entero, ver más abajo)
   seguía siendo un ease continuo parejo sobre todo el
   tramo "rotar", así que el cono en foco nunca dejaba
   de moverse un poco con cualquier scroll, por chico
   que fuera (bug reportado: "no hay un estado seguro
   en el que sepa que la geometría está en su punto").

   pasoConDescanso() (ver más abajo)
   reemplaza ese ease parejo por una curva con paradas
   reales: cada uno de los "huecosReales" tramos entre
   dos elementos consecutivos reparte su ancho de
   rotateT en descanso/quieto - transición rápida -
   descanso/quieto, en vez de moverse todo el tramo por
   igual. Como el descanso final de un tramo y el
   descanso inicial del siguiente apuntan al MISMO valor
   objetivo (el elemento que en ese punto está en foco),
   quedan pegados entre sí sin salto — el resultado es
   una meseta ancha y perceptible alrededor de cada
   elemento (el "estado seguro" pedido), separada por
   una transición rápida pero igual de continua hacia el
   siguiente. cfg.dwellFraction (0..1, default 0.5)
   controla qué proporción de cada tramo es descanso
   contra transición — más alto, mesetas más largas y
   transiciones más bruscas; más bajo, se acerca al
   comportamiento de ease parejo de antes.
*/

/*
    Misma partición interna (paso entero + fracción local
    "descansada") que ya usa pasoConDescanso() más abajo
    para calcular la meseta de phi — pero devuelta en
    UNIDADES DE ÍNDICE DE SLOT (0..pasos), no en unidades
    de "u"/phi. A propósito NO se reescribió
    pasoConDescanso() para reusar esta función por dentro
    (mismo criterio conservador que ya aplica el resto del
    archivo con código de trigonometría ya probado: tocar
    su interior sin poder volver a pisar el mismo terreno
    de pruebas es más riesgo del que vale — ver
    calcularDimensionesCampos en galeria-ficha.js para el
    mismo razonamiento). Se duplican unas pocas líneas de
    la partición paso/localEase a propósito, NO la fórmula
    de targetU/rangoPhi/sFracBasePorSlot (esa sí es
    exclusiva de phi, no aplica acá).

    POR QUÉ EXISTE (bug reportado: "el mapa ya se está
    alejando hacia el segundo punto apenas la primera
    geometría termina de centrarse"): igual que pasaba con
    "panelOpacity" (ver ese fix, en galeria-carrusel.js)
    antes de conectarse a "opacityFinal", el mapa dentro del
    cuadrado (galeria-mapa.js) necesita un número 0..(n-1)
    que llegue a cada entero EXACTAMENTE cuando ese
    elemento está centrado (diffAbs=0) — no una fracción
    lineal de "t" completo (ese "t" además incluye el
    tramo "formar" al principio, donde la geometría
    todavía se está armando y NINGÚN elemento avanzó su
    rotación — ver el uso de esta función en update(),
    en galeria-carrusel.js, junto a "focoContinuo").
    "paso + localEase" es EXACTAMENTE ese número: en
    localEase=0, u = targetInicio = targetU(paso) = el
    punto donde el slot "paso" está centrado; en
    localEase=1, u = targetFin = targetU(paso+1) = el
    punto donde "paso+1" está centrado (ver
    pasoConDescanso más abajo). Como esta función no
    necesita "rangoPhi" ni "sFracBasePorSlot" (esos sólo
    entran para interpolar el ÁNGULO phi entre dos
    targets, no para decidir EN QUÉ paso/fracción está
    el scroll), queda desacoplada del resto de la
    trigonometría — un cálculo puro sobre "rotateT", igual
    de liviano para llamar una vez más por frame.
*/
function indiceContinuo(rotateT, pasos, descanso) {

    if (pasos <= 0) return 0;

    const rotateTClamp =
        Math.min(1, Math.max(0, rotateT));

    const descansoClamp =
        Math.min(0.9, Math.max(0, descanso));

    const anchoTramo = 1 / pasos;

    const paso =
        Math.min(
            pasos - 1,
            Math.floor(rotateTClamp / anchoTramo)
        );

    const localU =
        (rotateTClamp - paso * anchoTramo) /
        anchoTramo;

    const mitadDescanso = descansoClamp / 2;

    let localEase;

    if (localU <= mitadDescanso) {

        localEase = 0;

    } else if (localU >= 1 - mitadDescanso) {

        localEase = 1;

    } else {

        const transicionU =
            (localU - mitadDescanso) /
            (1 - descansoClamp);

        localEase =
            ease(
                Math.min(1, Math.max(0, transicionU))
            );

    }

    return paso + localEase;

}


/*
    Reparametriza "rotateT" (0..1, progreso del tramo
    "rotar") reemplazando el ease parejo de antes por
    una curva con paradas reales — ver "MESETA DE
    DESCANSO" en la cabecera del archivo para el porqué.

    "pasos" = huecosReales (un tramo de rotateT por cada
    hueco real entre dos elementos consecutivos).
    "descanso" = fracción (0..1, exclusivo de 1) de CADA
    tramo que es meseta quieta — se reparte mitad al
    principio del tramo (el elemento ANTERIOR se queda
    fijo en foco) y mitad al final (el SIGUIENTE ya llegó
    y también quieto); el resto, en el medio, es una
    transición ease() normal entre ambos.

    Devuelve un valor 0..1, mismo rango y mismo rol que
    ya tenía "ease(rotateT)" en el lugar donde se llama
    — sigue multiplicándose por "-rangoPhi" ahí. Función
    pura, sin estado: no hace falta memoria de frames
    anteriores porque no compara contra nada previo, así
    que no hay riesgo de parpadeo/histéresis acá (a
    diferencia de displayIndex) — es sólo una
    reparametrización del tiempo, siempre continua.
*/
/*
    Punto objetivo (en unidades de "u", el mismo 0..1
    que ya devolvía "ease(rotateT)") donde el slot "k"
    (0=ancla, pasos=último real) queda EXACTAMENTE
    centrado (diff=0), MEDIDO de "sFracBasePorSlot"
    real —no asumido con una fórmula tipo "k/pasos"—.

    FIX: la primera versión de esto asumía centros
    espaciados parejo (sFrac_slot = slot/n) para poder
    calcular el target con una cuenta cerrada. Esa
    asunción resultó ser falsa en el layout real (bug
    confirmado con __galeriaCarrusel.debug(): a "phi"
    exactamente en el target calculado, el diff real
    daba ~10°, no 0°) — así que ahora se mide directo
    de "sFracBasePorSlot[k]" (la MISMA fuente que ya
    usa el diff real más abajo, en el forEach), en vez
    de asumir cómo está repartido el layout.

    Despejando de la fórmula real de diff (ver el
    forEach, más abajo en update()):

        diff = (2π·sFrac + phi) mod 2π,
        sFrac = sFracBasePorSlot[slot] (SIN seam acá)

    diff=0 ⟺ phi = -2π·sFracBasePorSlot[k]
    y como phi = -rangoPhi·u:

        u = 2π·sFracBasePorSlot[k] / rangoPhi

    FIX (bug de auto-cancelación del seam): la versión
    anterior de esta función sumaba "+ seamPorSlot[k]"
    adentro del cálculo de "u" —replicando la MISMA
    cantidad que el forEach ya suma a "sFrac" para
    posicionar/orientar el elemento (ver "seamAnimadoPorSlot"
    en update())—. Eso hacía que, en el punto de reposo,
    el seam se cancelara solo: el phi objetivo quedaba
    calculado en función del sFrac YA desplazado por el
    seam, así que diff volvía a dar exactamente 0 sin
    importar cuánto valiera seamOffset (confirmado con
    __galeriaCarrusel.debug(): duplicar seamOffset en los
    slots intermedios no cambiaba nada en pantalla, sólo
    en el ancla/último —los únicos dos casos de abajo que
    NO pasan por esta cuenta— el seam sobrevivía intacto).

    Ahora "u" se calcula SOLO con sFracBasePorSlot (el
    centrado geométrico puro, que sigue siendo necesario
    para corregir el espaciado angular irregular real —
    ver el comentario grande más arriba sobre por qué no
    alcanza con asumir "slot/pasos"). El seam ya NO entra
    acá: como el forEach sigue sumándolo a "sFrac" al
    margen de este cálculo, en el punto de reposo queda un
    diff residual de exactamente 2π·seamPorSlot[k] —el
    mismo tipo de desplazamiento angular que ya funciona
    en el ancla y en el último elemento (ahí es 2π·seamOffset
    porque su target está fijo en 0/1 y nunca "ve" el seam).
    Ese residuo es A PROPÓSITO para la posición renderizada,
    pero el cálculo de "diff" que sí usan mejorSlot/
    displayIndex/emphasis (ver el forEach, más abajo en
    update()) lo resta de nuevo antes de medir distancia al
    foco — si no, "emphasis"/opacidad/scaleBump pegaban su
    pico "rangoPhi" de scroll antes o después del punto real
    de reposo, en vez de coincidir con él.

    Salvo en los dos extremos: k=0 y k=pasos quedan
    FIJOS en 0 y 1 respectivamente, pase lo que pase
    con la cuenta de arriba — no es una simplificación,
    es un requisito real (ver "MESETA DE DESCANSO..."
    en la cabecera): phi tiene que valer exactamente 0
    en rotateT=0 (continuidad con la fase "formar", que
    deja phi en 0 todo su tramo) y exactamente -rangoPhi
    en rotateT=1 (para que el ÚLTIMO elemento real quede
    en foco sin colarse hacia el hueco fantasma — ver
    "RANGO REAL DE phi" en galeria-carrusel.js). Correr
    esos dos puntos causaría un salto visible de TODA la
    fila justo en el límite de fase, mucho peor que el
    pequeño desvío de centrado que queda como
    contrapartida en el ancla y en el último elemento —
    ese desvío YA existía antes de este archivo tener
    meseta (con el ease parejo de antes, era el mismo
    desvío, sólo que imperceptible por ser momentáneo;
    acá es exactamente igual de chico, sólo que ahora se
    sostiene un rato y se nota más).

    ACTUALIZACIÓN (distribución uniforme animada): el
    parámetro sigue llamándose "sFracBasePorSlot" (nombre
    genérico de la función, no cambia), pero quien LLAMA a
    esta función ahora le pasa "sFracUniformePorSlot" (ver
    update(), en galeria-carrusel.js, bloque de "phi"), no
    el array medido del layout físico real. Motivo: durante
    todo el tramo "rotar" (el único que usa esta función)
    el círculo ya está cerrado —blend=1 fijo—, así que el
    sFrac real de cada slot (ver forEach en update()) ya
    viajó por completo hacia el reparto parejo. Todo lo que
    sigue del comentario de arriba (por qué medir de un
    array real en vez de asumir "slot/n") sigue aplicando
    igual, sólo que el array real a medir cambió de fuente.
*/
function targetU(
    k, pasos, rangoPhi, sFracBasePorSlot
) {

    if (k <= 0) return 0;
    if (k >= pasos) return 1;

    if (rangoPhi === 0) return k / pasos;

    const u =
        (Math.PI * 2 * sFracBasePorSlot[k]) /
        rangoPhi;

    return Math.min(1, Math.max(0, u));

}


/*
    Reparametriza "rotateT" (0..1, progreso del tramo
    "rotar") reemplazando el ease parejo de antes por
    una curva con paradas reales — ver "MESETA DE
    DESCANSO" en la cabecera del archivo para el porqué.

    "pasos" = huecosReales (un tramo de rotateT por cada
    hueco real entre dos elementos consecutivos).
    "descanso" = fracción (0..1, exclusivo de 1) de CADA
    tramo que es meseta quieta — se reparte mitad al
    principio del tramo (el elemento ANTERIOR se queda
    fijo en foco) y mitad al final (el SIGUIENTE ya llegó
    y también quieto); el resto, en el medio, es una
    transición ease() normal entre ambos.

    "rangoPhi" y "sFracBasePorSlot" se pasan tal cual a
    targetU() (ver ahí la deducción completa) para que
    cada meseta caiga en el punto REAL donde ese slot
    centra geométricamente, medido del layout real, no
    en un punto asumido. YA NO se le pasa "seamPorSlot"
    (ver el FIX en targetU()): el seam sigue vivo, sólo
    que ahora entra únicamente por el lado del "sFrac"
    real que arma el forEach en update(), no acá.

    Devuelve un valor 0..1, mismo rango y mismo rol que
    ya tenía "ease(rotateT)" en el lugar donde se llama
    — sigue multiplicándose por "-rangoPhi" ahí. Función
    pura, sin estado: no hace falta memoria de frames
    anteriores porque no compara contra nada previo, así
    que no hay riesgo de parpadeo/histéresis acá (a
    diferencia de displayIndex) — es sólo una
    reparametrización del tiempo, siempre continua.
*/
function pasoConDescanso(
    rotateT, pasos, descanso,
    rangoPhi, sFracBasePorSlot
) {

    if (pasos <= 0) return rotateT;

    const rotateTClamp =
        Math.min(1, Math.max(0, rotateT));

    const descansoClamp =
        Math.min(0.9, Math.max(0, descanso));

    const anchoTramo = 1 / pasos;

    const paso =
        Math.min(
            pasos - 1,
            Math.floor(rotateTClamp / anchoTramo)
        );

    const localU =
        (rotateTClamp - paso * anchoTramo) /
        anchoTramo;

    /*
        Los dos targets de ESTE tramo puntual — los
        puntos reales de centrado GEOMÉTRICO (medidos,
        sin seam — ver FIX en targetU()) de los
        elementos que arrancan y terminan este tramo. Al
        ser la MISMA llamada a targetU() la que arma el
        final de un tramo y el principio del siguiente,
        quedan pegados sin salto entre tramos
        consecutivos — igual que antes.
    */
    const targetInicio =
        targetU(
            paso, pasos, rangoPhi, sFracBasePorSlot
        );

    const targetFin =
        targetU(
            paso + 1, pasos, rangoPhi, sFracBasePorSlot
        );

    const mitadDescanso = descansoClamp / 2;

    let localEase;

    if (localU <= mitadDescanso) {

        localEase = 0;

    } else if (localU >= 1 - mitadDescanso) {

        localEase = 1;

    } else {

        const transicionU =
            (localU - mitadDescanso) /
            (1 - descansoClamp);

        localEase =
            ease(
                Math.min(1, Math.max(0, transicionU))
            );

    }

    return (
        targetInicio +
        (targetFin - targetInicio) * localEase
    );

}


export { indiceContinuo, targetU, pasoConDescanso };
