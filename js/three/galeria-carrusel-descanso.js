/* ==================================================
   galeria-carrusel-descanso.js

   Contiene, separadas del resto de galeria-carrusel.js,
   las tres funciones puras que resuelven la "meseta de
   descanso" del scroll dentro de la fase "fichas":
   indiceContinuo(), targetU() y pasoConDescanso().

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
   (misma firma, mismo comportamiento). Nadie más necesita
   importar este archivo directamente.
================================================== */

import { ease } from "./galeria-utils.js";


/*
   MESETA DE DESCANSO (phi): la histéresis de arriba
   evita que la FICHA de texto cambie de un lado a otro
   cerca del cruce, pero no toca la posición/orientación
   real de la geometría — si "phi" (el ángulo que hace
   rotar el círculo entero, ver más abajo) fuera un ease
   continuo parejo sobre todo el tramo "rotar", el cono
   en foco nunca dejaría de moverse un poco con cualquier
   scroll, por chico que fuera: no habría un estado en el
   que la geometría quede quieta y centrada de forma
   confiable.

   pasoConDescanso() (ver más abajo) reparte, en vez de
   un ease parejo, cada uno de los "huecosReales" tramos
   entre dos elementos consecutivos en descanso/quieto -
   transición rápida - descanso/quieto, en vez de moverse
   todo el tramo por igual. Como el descanso final de un
   tramo y el descanso inicial del siguiente apuntan al
   MISMO valor objetivo (el elemento que en ese punto está
   en foco), quedan pegados entre sí sin salto — el
   resultado es una meseta ancha y perceptible alrededor
   de cada elemento, separada por una transición rápida
   pero igual de continua hacia el siguiente.
   cfg.dwellFraction (0..1, default 0.5) controla qué
   proporción de cada tramo es descanso contra transición
   — más alto, mesetas más largas y transiciones más
   bruscas; más bajo, se acerca a un avance uniforme sin
   paradas marcadas.
*/

/*
    Misma partición interna (paso entero + fracción local
    "descansada") que ya usa pasoConDescanso() más abajo
    para calcular la meseta de phi — pero devuelta en
    UNIDADES DE ÍNDICE DE SLOT (0..pasos), no en unidades
    de "u"/phi. pasoConDescanso() no reutiliza esta función
    por dentro: cada una queda aislada y probada por su
    cuenta sobre su propia trigonometría, en vez de
    compartir código entre las dos — ver
    calcularDimensionesCampos en galeria-ficha.js para el
    mismo criterio. Se duplican unas pocas líneas de la
    partición paso/localEase a propósito, NO la fórmula
    de targetU/rangoPhi/sFracBasePorSlot (esa sí es
    exclusiva de phi, no aplica acá).

    POR QUÉ EXISTE: el mapa dentro del cuadrado
    (galeria-mapa.js) necesita un número 0..(n-1) que
    llegue a cada entero EXACTAMENTE cuando ese elemento
    está centrado (diffAbs=0) — no una fracción lineal de
    "t" completo (ese "t" además incluye el tramo "formar"
    al principio, donde la geometría todavía se está
    armando y NINGÚN elemento avanzó su rotación — ver el
    uso de esta función en update(), en galeria-carrusel.js,
    junto a "focoContinuo"). Mismo criterio que
    "panelOpacity" (ver galeria-carrusel.js), atado a
    "opacityFinal" en vez de a una fracción lineal de "t".
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
    "rotar") en una curva con paradas reales, en vez de un
    ease continuo parejo — ver "MESETA DE DESCANSO" en la
    cabecera del archivo para el porqué.

    "pasos" = huecosReales (un tramo de rotateT por cada
    hueco real entre dos elementos consecutivos).
    "descanso" = fracción (0..1, exclusivo de 1) de CADA
    tramo que es meseta quieta — se reparte mitad al
    principio del tramo (el elemento ANTERIOR se queda
    fijo en foco) y mitad al final (el SIGUIENTE ya llegó
    y también quieto); el resto, en el medio, es una
    transición ease() normal entre ambos.

    Devuelve un valor 0..1, mismo rango y mismo rol que
    "ease(rotateT)" en el lugar donde se llama — sigue
    multiplicándose por "-rangoPhi" ahí. Función pura, sin
    estado: no hace falta memoria de frames anteriores
    porque no compara contra nada previo, así que no hay
    riesgo de parpadeo/histéresis acá (a diferencia de
    displayIndex) — es sólo una reparametrización del
    tiempo, siempre continua.
*/
/*
    Punto objetivo (en unidades de "u", el mismo 0..1
    que devuelve "ease(rotateT)") donde el slot "k"
    (0=ancla, pasos=último real) queda EXACTAMENTE
    centrado (diff=0), MEDIDO de "sFracBasePorSlot"
    real —no asumido con una fórmula tipo "k/pasos"—:
    el layout real puede no estar espaciado parejo, así
    que asumir "slot/n" dejaría el target desalineado del
    punto donde el diff real da 0 (ver el forEach en
    update(), en galeria-carrusel.js, la misma fuente que
    mide el diff real).

    Despejando de la fórmula real de diff (ver el
    forEach, más abajo en update()):

        diff = (2π·sFrac + phi) mod 2π,
        sFrac = sFracBasePorSlot[slot] (SIN seam acá)

    diff=0 ⟺ phi = -2π·sFracBasePorSlot[k]
    y como phi = -rangoPhi·u:

        u = 2π·sFracBasePorSlot[k] / rangoPhi

    "u" se calcula SOLO con sFracBasePorSlot (el centrado
    geométrico puro, que corrige el espaciado angular
    irregular real — ver el comentario grande más arriba
    sobre por qué no alcanza con asumir "slot/pasos").
    "seamPorSlot" no entra en esta cuenta: sumar
    "seamPorSlot[k]" acá replicaría la MISMA cantidad que
    el forEach ya suma a "sFrac" para posicionar/orientar
    el elemento (ver "seamAnimadoPorSlot" en update()), lo
    que haría que en el punto de reposo el seam se
    cancelara solo — el phi objetivo quedaría calculado en
    función del sFrac YA desplazado por el seam, así que
    diff volvería a dar exactamente 0 sin importar cuánto
    valiera seamOffset, y el seam quedaría sin efecto
    visible en los slots intermedios (a diferencia del
    ancla y el último, los únicos dos casos de abajo que NO
    pasan por esta cuenta, donde el seam sí se nota).

    Como el forEach sigue sumando el seam a "sFrac" al
    margen de este cálculo, en el punto de reposo queda un
    diff residual de exactamente 2π·seamPorSlot[k] —el
    mismo tipo de desplazamiento angular que ya aplica en
    el ancla y en el último elemento (ahí es 2π·seamOffset
    porque su target está fijo en 0/1 y nunca "ve" el seam).
    Ese residuo es A PROPÓSITO para la posición renderizada,
    pero el cálculo de "diff" que sí usan mejorSlot/
    displayIndex/emphasis (ver el forEach, más abajo en
    update()) lo resta de nuevo antes de medir distancia al
    foco — si no, "emphasis"/opacidad/scaleBump pegarían su
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
    ese desvío es del mismo orden que el que produce un
    ease parejo sin meseta, sólo que acá se sostiene un
    rato (mientras dura la meseta) y por eso se nota más.

    DISTRIBUCIÓN UNIFORME ANIMADA: el parámetro se llama
    "sFracBasePorSlot" (nombre genérico de la función),
    pero quien LLAMA a esta función durante el tramo
    "rotar" (ver update(), en galeria-carrusel.js, bloque
    de "phi") le pasa "sFracUniformePorSlot", no el array
    medido del layout físico real. Motivo: durante todo ese
    tramo (el único que usa esta función) el círculo ya
    está cerrado —blend=1 fijo—, así que el sFrac real de
    cada slot (ver forEach en update()) ya viajó por
    completo hacia el reparto parejo. Todo lo de arriba
    (por qué medir de un array real en vez de asumir
    "slot/n") sigue aplicando igual, sólo que la fuente de
    ese array cambia según el tramo.
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
    "rotar") en una curva con paradas reales, en vez de un
    ease continuo parejo — ver "MESETA DE DESCANSO" en la
    cabecera del archivo para el porqué.

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
    en un punto asumido. No se le pasa "seamPorSlot" (ver
    targetU()): el seam entra únicamente por el lado del
    "sFrac" real que arma el forEach en update(), no acá.

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
        sin seam — ver targetU()) de los elementos que
        arrancan y terminan este tramo. Al ser la MISMA
        llamada a targetU() la que arma el final de un
        tramo y el principio del siguiente, quedan
        pegados sin salto entre tramos consecutivos.
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
