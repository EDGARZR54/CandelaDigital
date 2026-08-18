/* ==================================================
   galeria-carrusel.js

   Fase "fichas": la fila deja de ser una línea recta y
   se transforma en un círculo (línea -> arco ->
   círculo), que después rota sobre su propio centro
   para ir mostrando un elemento distinto en el punto de
   "foco" (el ángulo -π/2, el mismo en el que arranca el
   ancla) — ver linea_isometrica.html, la referencia
   matemática de esta fase.

   "t" (0..1 de toda la fase) se reparte en dos tramos
   sin blend adicional entre ellos, porque ambos ya
   convergen solos en el punto de empalme:

     1) "formar": theta va de 0 a 2π. Con theta=0 la
        fórmula colapsa exactamente a la fila recta
        ("positions" tal cual, sin ningún factor) — así
        el primer frame de esta fase no salta respecto
        al último frame de "orden". phi se mantiene en 0
        todo este tramo, así que el foco (displayIndex)
        se mantiene en el ancla (order[0]) sin que haga
        falta forzarlo aparte.

     2) "rotar": theta queda fijo en 2π (círculo ya
        cerrado) y es phi el que avanza, continuo — sin
        "paradas" discretas: el foco se calcula en cada
        frame como el slot con menor distancia angular a
        -π/2, así que el spotlight se mueve suave de un
        elemento al siguiente en vez de saltar.

   ANCLA: el elemento en order[0] (extremo IZQUIERDO de
   la fila, el primero del ordenamiento vigente — mismo
   lado al que ya queda mirando la cámara fija en esta
   fase, ver setCameraLado(1) en galeria.js). No es su
   punto de anclaje frontal/base (bbox.min.z/bbox.min.y)
   el que queda fijo: es el CENTRO real de su bounding
   box, porque cada geometría está alineada al frente de
   su bbox, no a su centro (ver prepararGeometria en
   galeria-escena.js) — por eso "anchorWorld" se calcula
   sumándole a positions[0] el offset (pivotX, pivotZ)
   del ancla, el mismo par de valores que ya usa
   armarGroup3D para su propio pivote de spin.

   Por qué el radio puede ser grande SIN romper la
   continuidad en theta=0: "s" (la fracción a lo largo de
   la curva de cada slot) se calcula siempre sobre
   "longitudCurva" (ver más abajo), nunca escalada por
   radioFactor. Lo único que escala con
   config.carousel.radioFactor es "longitudEfectiva", una
   longitud aparte que sólo gobierna el RADIO (radius =
   longitudEfectiva / theta) y que arranca igual a
   "longitudCurva" en theta=0 (radioFactor no pesa nada
   todavía) y llega a longitudCurva·radioFactor recién en
   theta=2π (círculo ya cerrado). Mismo "s" en ambos usos
   => mismo orden relativo de los elementos a lo largo de
   la curva, pase lo que pase con el radio.

   HUECO VACÍO: "longitudCurva" no es la distancia física
   real entre el ancla y el extremo libre ("longitudFisica"
   tal cual) — es esa misma distancia repartida sobre UN
   hueco más de los que hay elementos-1. Con "n" elementos
   hay n-1 huecos reales entre ellos; barrer los 2π
   completos sobre esos n-1 huecos hacía que el último
   elemento (sFrac=1) y el ancla (sFrac=0) terminaran en el
   MISMO ángulo al cerrar el círculo (-π/2 + 2π ≡ -π/2 mod
   2π) — se pisaban, igual que pasa al doblar una varilla
   recta hasta que sus dos puntas se tocan. Agregar un
   hueco fantasma más (n huecos en vez de n-1) deja
   ese hueco extra entre el último elemento y el ancla,
   del mismo ancho angular que el resto, cerrando el
   círculo sin coincidencia — ver el cálculo de
   "longitudCurva" en update().

   ORIENTACIÓN: cada elemento gira sobre group.quaternion
   (el grupo EXTERNO, el que ya posicionan
   reordenar/revelado vía cone.position — nunca el
   "pivote" interno de galeria-rotacion.js, que sigue
   siendo exclusivo del spin propio) para quedar mirando
   hacia afuera del círculo: no la tangente de la curva,
   sino el vector radial divergente (centro del círculo
   -> punto sobre el círculo), que es el que hace que el
   elemento en foco quede mirando de frente a la cámara.
   Ese mismo vector ("outward") también resuelve, rotado,
   el offset de centrado: como el objeto ahora puede estar
   girado —incluso en DOS ejes, yaw y pitch, si hay
   arrastre manual sobre el elemento en foco, ver
   galeria-interaccion-ficha.js— el offset (pivotX,
   pivotY, pivotZ) —fijo en el espacio LOCAL del objeto—
   hay que rotarlo por el mismo quaternion que el objeto
   va a tener en pantalla, no proyectarlo sólo sobre los
   ejes fijos de mundo (mismo argumento de la normal
   rotando con la curva que ya señalaba el plan original,
   extendido acá tanto al eje a lo largo de la fila como,
   ahora, al eje vertical). En theta=0, "outward" colapsa
   a (0,0,1) — mismo eje que ya usa la fila recta sin
   rotar — así el offset también coincide exactamente con
   el caso sin curva. Se usa quaternion en vez de un
   escalar rotation.y porque con dos ejes combinados
   (yaw+pitch) un Euler abre ambigüedad de orden; el
   quaternion es además exactamente lo que hace falta para
   rotar (pivotX, pivotY, pivotZ) sin pasar por
   conversiones de ida y vuelta.

   PENDIENTE DE CALIBRAR A OJO (no es un bug, es una
   convención que sólo se confirma mirando la escena
   real): el signo de "rotationY = atan2(outward.x,
   outward.z)" puede necesitar el signo opuesto, o un
   +π, según cómo esté orientada la cara "frontal" real
   de cada geometría.

   RANGO REAL DE "phi": el tramo "rotar" NO barre los 2π
   completos — eso volvería a traer al ancla al foco
   justo al final (repetía la primera ficha, bug
   reportado), porque con el hueco fantasma el círculo
   de fichas reales sólo ocupa 2π·(n-1)/n. "phi" barre
   exactamente ese rango ("rangoPhi" en update()) y se
   detiene ahí: al llegar a rotateT=1 el último elemento
   real queda en foco, sin seguir de largo hacia el
   hueco vacío.

   BLEND GRADUAL DEL CENTRADO: el offset que centra cada
   elemento en su bbox real (en vez de su punto de
   anclaje frontal/base) no se aplica de golpe desde el
   primer frame — en theta=0 tiene que dar EXACTAMENTE
   "positions[slot]", el mismo lugar plano donde
   "orden"/"revelado" ya dejaron a cada elemento, o se ve
   un salto justo al entrar a esta fase (bug reportado).
   Se interpola desde esa posición plana hacia la
   posición centrada-sobre-la-curva con un blend atado a
   "theta" mismo (0 en theta=0, 1 con el círculo ya
   cerrado) — el ajuste queda disimulado dentro del
   propio tramo "formar", en vez de saltar de una vez.
   La rotación no necesita este mismo blend: "outward"
   ya tiende naturalmente a (0,0,1) cuando theta -> 0,
   así que "rotationY" ya sale continuo, en 0, sin blend
   adicional.

   IMPORTANTE — estado nuevo que no existía antes:
   ninguna otra fase (reordenar/revelado) toca la
   orientación del objeto (solo mueven
   position/scale/opacity; el quaternion quedaba siempre
   en su valor de construcción, identidad). Como acá SÍ se
   escribe —ahora en dos ejes, yaw y pitch, ver
   ORIENTACIÓN más arriba— reset() —llamado por galeria.js
   cada vez que otra fase pasa a estar vigente— también
   tiene que devolver el quaternion a identidad, o un cono
   que quedó girado y/o inclinado en "fichas" seguiría así,
   sin que nada lo corrija, si el visitante vuelve a subir
   el scroll hacia "orden" o "revelado".

   Ya NO se usa getHiddenDrop(): nada sale del cuadro en
   esta fase — todos los elementos quedan siempre sobre
   el círculo, a restY constante — así que esa
   dependencia se saca del todo (ver galeria.js).

   HISTÉRESIS DEL FOCO (displayIndex): "mejorSlot" (el
   vecino angular más cercano al punto de foco) es un
   cálculo continuo y SIN margen — apenas otro elemento
   queda una fracción de radián más cerca, gana. Eso es
   correcto para todo lo que se anima en base a él
   (escala/opacidad/rotationWeights de CADA elemento, que
   sí tienen que reaccionar de forma continua, cuadro a
   cuadro) pero es exactamente el punto ciego para decidir
   qué elemento es "el foco" de cara afuera (la ficha que
   se muestra): justo en el ángulo medio entre dos
   elementos, un scroll de un solo pixel de diferencia
   puede hacer que el foco reportado oscile de un lado a
   otro (bug reportado: "el foco cambia justo en el punto
   medio, sensible a scroll de un pixel"). Como cada
   cambio de foco dispara updatePanel() en galeria.js
   (swap de ficha, remedición de paneles, fundido), esa
   oscilación se sentía como parpadeo. La solución no es
   agregar snap/magnetic al scroll en sí (eso rompe la
   interpolación continua del resto de la fase) sino una
   zona muerta angular alrededor del punto de cruce, sólo
   para esta decisión puntual: el foco previo se queda
   fijo hasta que el candidato nuevo gana por más que
   MARGEN_HISTERESIS, no por cualquier epsilon — ver el
   cálculo de "displayIndex" en update(), después del
   forEach principal.

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

   pasoConDescanso() (ver más abajo, junto a EPS)
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
================================================== */

import * as THREE from "three";
import { ease, smoothstep } from "./galeria-utils.js";


const EPS = 0.00001;

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
        sFrac = sFracBasePorSlot[slot] + seamOffset
        (seamAnimado = seamOffset durante "rotar", ver
        más abajo)

    diff=0 ⟺ phi = -2π·(sFracBasePorSlot[k] + seamOffset)
    y como phi = -rangoPhi·u:

        u = 2π·(sFracBasePorSlot[k]+seamOffset) / rangoPhi

    Salvo en los dos extremos: k=0 y k=pasos quedan
    FIJOS en 0 y 1 respectivamente, pase lo que pase
    con la cuenta de arriba — no es una simplificación,
    es un requisito real (ver "MESETA DE DESCANSO..."
    en la cabecera): phi tiene que valer exactamente 0
    en rotateT=0 (continuidad con la fase "formar", que
    deja phi en 0 todo su tramo) y exactamente -rangoPhi
    en rotateT=1 (para que el ÚLTIMO elemento real quede
    en foco sin colarse hacia el hueco fantasma — ver
    "RANGO REAL DE phi" más arriba). Correr esos dos
    puntos causaría un salto visible de TODA la fila
    justo en el límite de fase, mucho peor que el
    pequeño desvío de centrado que queda como
    contrapartida en el ancla y en el último elemento —
    ese desvío YA existía antes de este archivo tener
    meseta (con el ease parejo de antes, era el mismo
    desvío, sólo que imperceptible por ser momentáneo;
    acá es exactamente igual de chico, sólo que ahora se
    sostiene un rato y se nota más).
*/
function targetU(
    k, pasos, seamOffset, rangoPhi, sFracBasePorSlot
) {

    if (k <= 0) return 0;
    if (k >= pasos) return 1;

    if (rangoPhi === 0) return k / pasos;

    const u =
        (Math.PI * 2 *
            (sFracBasePorSlot[k] + seamOffset)) /
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

    "seamOffset", "rangoPhi" y "sFracBasePorSlot" se
    pasan tal cual a targetU() (ver ahí la deducción
    completa) para que cada meseta caiga en el punto
    REAL donde ese slot centra, medido del layout real,
    no en un punto asumido.

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
    seamOffset, rangoPhi, sFracBasePorSlot
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
        puntos reales de centrado (medidos, con seam) de
        los elementos que arrancan y terminan este
        tramo. Al ser la MISMA llamada a targetU() la
        que arma el final de un tramo y el principio
        del siguiente, quedan pegados sin salto entre
        tramos consecutivos — igual que antes.
    */
    const targetInicio =
        targetU(
            paso, pasos, seamOffset,
            rangoPhi, sFracBasePorSlot
        );

    const targetFin =
        targetU(
            paso + 1, pasos, seamOffset,
            rangoPhi, sFracBasePorSlot
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

/*
    Reusados frame a frame para el cálculo de
    yaw+pitch (ver más abajo, dentro de order.forEach):
    instanciarlos una sola vez ACÁ, fuera del loop y
    fuera de update(), evita crear objetos nuevos (2
    quaternions + 1 vector) por cada elemento del
    círculo en cada frame — mismo criterio de
    performance que ya aplica el resto del archivo
    (nada de allocations evitables dentro de
    order.forEach). Se pisan y reusan en cada
    iteración, así que nunca hay que leerlos ANTES de
    escribirlos en la misma vuelta del loop.
*/
const EJE_Y = new THREE.Vector3(0, 1, 0);
const EJE_X = new THREE.Vector3(1, 0, 0);
const qYaw = new THREE.Quaternion();
const qPitch = new THREE.Quaternion();
const pivotLocal = new THREE.Vector3();
const offsetWorld = new THREE.Vector3();


export function createCarouselController(
    config,
    {
        cones, getPositions, getOrder, elementCount,
        restY, bboxesPorIndice,
        /*
            Rotación manual del elemento en foco, en dos
            ejes (ver galeria-interaccion-ficha.js) —
            capa ADITIVA sobre "rotationY" (más abajo),
            no un reemplazo. Devuelve { yaw, pitch }, no
            un número suelto: desde que existe el pitch,
            los dos ejes siempre se necesitan juntos para
            componer un único quaternion (ver más abajo).
            Opcional: si nadie la pasa (por ejemplo, en
            algún test que arme este controlador
            standalone), se comporta como si nadie
            estuviera arrastrando nunca.
        */
        getManualOffset = () => ({ yaw: 0, pitch: 0 })
    }
) {

    const cfg = config.carousel;

    let panelDisplayIndex = -1;

    /*
        DEBUG: última foto de update(), para poder
        inspeccionar desde la consola del navegador sin
        tener que loguear cada frame (eso inundaría la
        consola — "rotar" corre 60 veces por segundo).
        Se pisa en cada llamada a update(); debug() de
        más abajo solo imprime lo último que haya. Ver
        debug() al final del archivo para el comando.
    */
    let ultimoDebug = null;


    function update(t) {

        const order = getOrder();
        const positions = getPositions();
        const n = elementCount;

        if (n === 0) {

            return { changed: false, rotationWeights: {} };

        }


        const anclaPos = positions[0];
        const extremoPos = positions[n - 1];

        /*
            Longitud física real de la fila, ancla ->
            extremo libre. Es la que define "s" (nunca
            escalada) y también el punto de partida de
            "longitudEfectiva" en theta=0 — ver comentario
            de cabecera.
        */
        const longitudFisica =
            extremoPos.x - anclaPos.x;

        /*
            Un hueco "vacío" extra: con "n" elementos hay
            n-1 huecos REALES entre ellos, pero barrer los
            2π completos sobre esos n-1 huecos hace que el
            último elemento (sFrac=1) y el ancla (sFrac=0)
            terminen en el MISMO ángulo al cerrar el
            círculo (-π/2 + 2π ≡ -π/2 mod 2π) — se pisan,
            igual que pasa al doblar una varilla recta
            hasta que sus dos puntas se tocan.

            Se agrega un hueco fantasma más (n huecos en
            vez de n-1), del mismo ancho angular que el
            resto, repartiendo el mismo largo físico real
            sobre una circunferencia conceptualmente más
            "larga" — el hueco extra queda entre el último
            elemento y el ancla, cerrando el círculo sin
            coincidencia. Esto también hace que
            "anguloVecino" (más abajo, ya calculado como
            2π/n) pase a describir el espaciado angular
            REAL entre vecinos con exactitud — antes,
            con n-1 huecos reales sobre el círculo
            completo, el espaciado real era 2π/(n-1), un
            poco más apretado de lo que ese cálculo
            asumía.
        */
        const huecosReales =
            Math.max(1, n - 1);

        const longitudCurva =
            n > 1
                ? longitudFisica * n / huecosReales
                : (longitudFisica || 1);


        /*
            Adelantado desde más abajo (donde vivía
            antes, junto al forEach de diff/emphasis):
            "phi" también lo necesita ahora para el
            cálculo de sFracBasePorSlot, más abajo.
        */
        const sFracDenom =
            longitudCurva || 1;

        /*
            sFrac de CADA slot, SIN seam (seamAnimado se
            suma aparte más abajo, en el forEach real, y
            también en targetU()/pasoConDescanso() para
            la meseta) — medido directo de "positions",
            no asumido con una fórmula tipo "slot/n".

            POR QUÉ: la primera versión de la meseta con
            corrección de seam asumía centros espaciados
            parejo (sFrac_slot = slot/n), pero eso sólo
            vale si "positions" realmente reparte los
            slots así — en la práctica el layout real
            puede no ser perfectamente uniforme (anchos
            de cono distintos, ajustes de spacing, etc.),
            así que la meseta terminaba apuntando a un
            ángulo que no coincidía con el diff=0 real
            (bug reportado: "el intermedio descansa
            10° corrido de donde debería"). Midiendo
            directo de "positions" —la MISMA fuente
            que ya usa el diff real, más abajo— la
            meseta queda garantizada consistente con el
            diff real, sea cual sea el layout.
        */
        const sFracBasePorSlot =
            positions.map(
                pos =>
                    (pos.x - anclaPos.x) / sFracDenom
            );


        /*
            uHat/vHat: misma convención que
            linea_isometrica.html. La fila real siempre
            crece en +X con z=0 fijo por slot (ver
            calculatePositions en galeria-escena.js), así
            que estos dos vectores son constantes, no
            hace falta derivarlos de datos en vivo.
            vHat=(0,0,-1): el círculo se abomba hacia -Z
            (lejos de la cámara, que mira desde +Z), así
            el punto de foco (-π/2) queda del lado de
            adelante, hacia cámara.
        */
        const uHat = { x: 1, z: 0 };
        const vHat = { x: 0, z: -1 };


        const anclaId = order[0];
        const anclaBbox = bboxesPorIndice[anclaId];

        const anclaCentroX =
            (anclaBbox.min.x + anclaBbox.max.x) / 2;
        const anclaCentroZ =
            (anclaBbox.min.z + anclaBbox.max.z) / 2;

        /*
            Punto FIJO de la curva (equivalente al
            "anchor" del demo): el centro real del bbox
            del ancla, no su punto de anclaje frontal/base
            — ver comentario de cabecera.
        */
        const anchorWorld = {
            x: anclaPos.x + anclaCentroX,
            z: anclaPos.z + anclaCentroZ
        };


        const longitudGrande =
            longitudCurva * cfg.radioFactor;


        let theta, phi;

        /*
            DEBUG: se declaran acá (scope de update(),
            no del bloque "else" donde se calculan) para
            que el snapshot de debug() —al final de
            update()— los pueda leer aunque el tramo
            vigente sea "formar" (ahí quedan en su valor
            por default, ver más abajo). No cambia nada
            de la lógica existente, sólo dónde vive la
            declaración.
        */
        let rotateT = 0;

        /*
            Rango real que "phi" tiene que barrer en el
            tramo "rotar": NO son los 2π completos —eso
            volvería a traer al ancla al foco justo al
            final, repitiendo la primera ficha (bug
            reportado)—, sino sólo el arco ocupado por
            los huecos REALES (n-1 de los n huecos
            totales, ver "longitudCurva" más arriba). Al
            llegar a rotateT=1, phi queda exactamente en
            el valor que trae al ÚLTIMO elemento real al
            foco, sin seguir de largo hacia el hueco
            vacío.
        */
        const rangoPhi =
            n > 1
                ? Math.PI * 2 * huecosReales / n
                : 0;

        /*
            cfg.seamOffset es opcional (fallback 0): un
            config viejo que no lo defina se comporta
            exactamente igual que antes de este cambio.
            Se adelanta acá (antes del bloque de
            theta/phi) porque el cálculo de "phi" mismo
            ya lo necesita para targetU()/
            pasoConDescanso() — a diferencia de
            "seamAnimado", que sí depende de "blend" y
            por eso se queda declarado más abajo, junto
            a donde ya vivía.
        */
        const seamOffset = cfg.seamOffset ?? 0;

        if (t < cfg.formSpan) {

            theta =
                Math.PI * 2 *
                ease(
                    cfg.formSpan > 0
                        ? t / cfg.formSpan
                        : 1
                );

            phi = 0;

        } else {

            theta = Math.PI * 2;

            rotateT =
                cfg.formSpan < 1
                    ? (t - cfg.formSpan) /
                      (1 - cfg.formSpan)
                    : 1;

            /*
                cfg.dwellFraction es opcional (fallback
                0.5, ver pasoConDescanso arriba): un
                config viejo que no lo defina sigue
                andando, con una meseta pareja por
                defecto en vez de romper — mismo patrón
                que ya usan pitchMaxRad
                (galeria-interaccion-ficha.js) y
                scrollHintFadeWidth
                (galeria-revelado.js).
            */
            phi =
                -rangoPhi *
                pasoConDescanso(
                    rotateT,
                    huecosReales,
                    cfg.dwellFraction ?? 0.5,
                    seamOffset,
                    rangoPhi,
                    sFracBasePorSlot
                );

        }


        /*
            Interpola desde longitudCurva (theta=0, sin
            aporte de radioFactor todavía) hacia
            longitudGrande (theta=2π, círculo ya cerrado)
            — ver comentario de cabecera sobre por qué
            esto no rompe la continuidad en theta=0. Usa
            "longitudCurva" (con el hueco fantasma), no
            "longitudFisica" cruda — mismo motivo que en
            "sFracDenom" más abajo: son la misma variable
            usada en el numerador (el multiplicador del
            branch theta<EPS) y en el denominador de
            "sFrac", así que se cancelan entre sí y el
            layout recto en theta=0 sigue dando
            exactamente "positions[slot].x", sea cual sea
            el valor de longitudCurva.
        */
        const blend = theta / (Math.PI * 2);

        const longitudEfectiva =
            longitudCurva +
            (longitudGrande - longitudCurva) * blend;


        /*
            SEAM ANIMADO: corre el parámetro de la curva
            (sFrac, ver más abajo) una fracción fija hacia
            el extremo libre — mismo desplazamiento para
            TODOS los elementos, así que en la práctica
            rota el círculo entero un ángulo extra
            (theta · seamOffset) respecto de dónde caería
            el ancla sin este offset. Sirve para recentrar
            un poco la geometría destacada respecto del
            punto de foco fijo (-π/2), sin tener que tocar
            ese punto de foco ni la lógica de "quién está
            en foco" (diff, más abajo) por separado — como
            "diff" también se calcula a partir de este
            mismo "sFrac" ya desplazado (reusa la misma
            variable), la detección de foco queda
            automáticamente consistente con lo que se ve.

            Se anima con el MISMO "blend" que ya gobierna
            posición/escala/opacidad (0 en theta=0, 1 con
            el círculo ya cerrado) — mismo criterio que el
            resto del archivo: en theta=0 no suma nada
            (layout recto exacto, sin salto respecto de
            "orden") y llega a su valor completo recién al
            cerrarse el círculo, nunca de golpe.

            cfg.seamOffset ya se leyó más arriba (antes
            del bloque de theta/phi, ver esa
            declaración) — acá solo falta "seamAnimado",
            que sí depende de "blend" y por eso no podía
            adelantarse con el resto.
        */
        const seamAnimado = seamOffset * blend;


        /*
            Punto sobre la curva para la fracción "sFrac"
            (0 = ancla, crece hacia el extremo libre), más
            el vector "outward" (centro del círculo ->
            este punto) que resuelve tanto la orientación
            como el offset de centrado — ver cabecera.
        */
        function puntoYOutward(sFrac) {

            if (theta < EPS) {

                return {
                    x:
                        anchorWorld.x +
                        uHat.x * longitudCurva * sFrac,
                    z:
                        anchorWorld.z +
                        uHat.z * longitudCurva * sFrac,
                    outward: { x: 0, z: 1 }
                };

            }

            const radius =
                longitudEfectiva / theta;

            const centerX =
                anchorWorld.x + vHat.x * radius;
            const centerZ =
                anchorWorld.z + vHat.z * radius;

            const angle =
                -Math.PI / 2 + theta * sFrac + phi;

            const x =
                centerX +
                radius * (
                    uHat.x * Math.cos(angle) +
                    vHat.x * Math.sin(angle)
                );

            const z =
                centerZ +
                radius * (
                    uHat.z * Math.cos(angle) +
                    vHat.z * Math.sin(angle)
                );

            const dx = x - centerX;
            const dz = z - centerZ;
            const len = Math.hypot(dx, dz) || 1;

            return {
                x, z,
                outward: { x: dx / len, z: dz / len }
            };

        }


        const anguloVecino =
            (Math.PI * 2 / n) * cfg.emphasisSpread;

        /*
            sFracDenom ya se calculó más arriba (antes
            del bloque de theta/phi, junto a
            sFracBasePorSlot) — se sigue usando acá
            abajo, en el forEach, tal cual.
        */

        const rotationWeights = {};

        /*
            Se guarda el diffAbs de CADA slot (no sólo el
            mínimo) porque la histéresis de más abajo
            necesita comparar contra el diff del foco
            PREVIO específicamente, que puede no ser el
            slot con menor diff en este frame — ver el
            comentario junto a "displayIndex" después del
            forEach.
        */
        const diffPorSlot = {};

        let mejorSlot = 0;
        let mejorDiffAbs = Infinity;


        order.forEach((cupID, slot) => {

            const sFrac =
                (positions[slot].x - anclaPos.x) /
                sFracDenom +
                seamAnimado;

            const { x, z, outward } =
                puntoYOutward(sFrac);


            /*
                Orientación: apunta hacia afuera del
                círculo (radial divergente), no a la
                tangente — así el elemento en foco
                termina mirando de frente a cámara.
            */
            const rotationY =
                Math.atan2(outward.x, outward.z);

            /*
                Offset manual de arrastre sobre el
                elemento en foco (ver
                galeria-interaccion-ficha.js): yaw
                (horizontal, gira sobre el eje vertical,
                se compone con "rotationY") y pitch
                (vertical, gira sobre el eje horizontal
                "de frente" del objeto, nuevo). Para
                cualquier cupID que no sea el elemento en
                foco, getManualOffset devuelve { yaw: 0,
                pitch: 0 }, así que todo lo que sigue da
                exactamente lo mismo que antes de este
                offset existir.
            */
            const manual = getManualOffset(cupID);

            /*
                Quaternion TOTAL que realmente se le va a
                aplicar al objeto más abajo: yaw (base
                "outward" + arrastre horizontal) primero,
                pitch (arrastre vertical) después,
                compuestos como rotaciones INTRÍNSECAS
                —cada una relativa al marco ya rotado por
                la anterior, no a los ejes fijos de
                mundo— que es la convención estándar para
                combinar yaw+pitch (misma idea que un
                Euler "yaw luego pitch": qTotal = qYaw ·
                qPitch). Con pitch=0 (caso de siempre,
                salvo arrastre vertical activo) esto
                colapsa exactamente a una rotación pura
                sobre Y, idéntica a la que ya había.

                Hace falta ACÁ, no sólo al escribir la
                orientación final del objeto: el offset
                de centrado (pivotX, pivotY, pivotZ)
                tiene que rotarse por el MISMO quaternion
                que el objeto va a tener en pantalla, o
                el punto que queda fijo sobre la curva
                deja de ser el centroide real y pasa a
                ser el ancla frontal/base del bbox —el
                origen local del mesh, ver cabecera— con
                el centroide describiendo un arco propio
                alrededor de ese ancla a medida que se
                arrastra (mismo bug que ya se corrigió
                para el yaw solo; el pitch necesita
                exactamente el mismo tratamiento, y en un
                eje más: Y).
            */
            qYaw.setFromAxisAngle(
                EJE_Y, rotationY + manual.yaw
            );
            qPitch.setFromAxisAngle(
                EJE_X, manual.pitch
            );

            const qTotal = qYaw.multiply(qPitch);

            const bbox = bboxesPorIndice[cupID];

            const pivotX =
                (bbox.min.x + bbox.max.x) / 2;
            const pivotY =
                (bbox.min.y + bbox.max.y) / 2;
            const pivotZ =
                (bbox.min.z + bbox.max.z) / 2;

            /*
                pivotLocal: vector del origen del mesh
                (ancla frontal/base) al centroide real,
                en espacio LOCAL del objeto — fijo,
                no depende de la rotación. offsetWorld es
                ese mismo vector llevado a espacio de
                mundo aplicándole qTotal: es cuánto hay
                que correr el origen del mesh, respecto
                del centroide, para que el centroide
                termine exactamente donde tiene que
                estar. Con pitch=0 esto da lo mismo que
                antes en X/Z, y en Y da 0 —una rotación
                pura sobre el eje Y nunca cambia la
                componente Y de ningún vector— así que
                "restY" seguía siendo, sin que hiciera
                falta decirlo explícitamente, la altura
                correcta del origen del mesh todo este
                tiempo.
            */
            pivotLocal.set(pivotX, pivotY, pivotZ);
            offsetWorld
                .copy(pivotLocal)
                .applyQuaternion(qTotal);

            const cone = cones[cupID];

            /*
                El offset de centrado (arriba) no se
                aplica de golpe: en theta=0 tiene que dar
                EXACTAMENTE "positions[slot]" —el mismo
                lugar plano, sin ningún offset, donde
                "orden"/"revelado" ya dejaron a cada
                elemento— o se ve un salto justo al
                entrar a "fichas" (bug reportado). Se
                interpola desde esa posición plana hacia
                la posición centrada-sobre-la-curva con
                un blend atado a "theta" mismo: crece de
                0 a 1 a la vez que el arco se va doblando
                (0 en theta=0, 1 recién con el círculo ya
                cerrado), así el ajuste queda disimulado
                dentro del propio tramo "formar" en vez
                de saltar de una vez. El eje Y entra al
                mismo blend por la misma razón: el
                arrastre vertical sólo es posible sobre
                el elemento en foco durante "rotar"
                (blend ya en 1 para entonces), pero
                blendearlo igual que X/Z mantiene el
                cálculo consistente sin tener que asumir
                en qué tramo está la fase.

                La rotación (más abajo) no necesita este
                mismo blend aparte: "outward" ya tiende
                naturalmente a (0,0,1) cuando theta -> 0
                (radio creciendo sin límite), así que
                "rotationY" ya sale continuo, en 0, sin
                blend adicional.

                Este mismo "blend" (ya calculado una
                vez arriba, junto a "longitudEfectiva" —
                misma cuenta, theta/(2π), no hace falta
                repetirla) se reusa más abajo para
                escala/opacidad/rotationWeights — ver el
                comentario junto a "emphasis": sin él,
                esas tres pasaban exactamente por el
                mismo problema que la posición (saltaban
                al valor final de golpe en theta≈0).
            */
            const curvaX = x - offsetWorld.x;
            const curvaZ = z - offsetWorld.z;
            const curvaY = restY + pivotY - offsetWorld.y;

            const finalX =
                positions[slot].x +
                (curvaX - positions[slot].x) *
                blend;

            const finalZ =
                positions[slot].z +
                (curvaZ - positions[slot].z) *
                blend;

            const finalY =
                restY +
                (curvaY - restY) *
                blend;

            cone.position.set(
                finalX, finalY, finalZ
            );

            /*
                Orientación final: el quaternion TOTAL
                (yaw+pitch, ya calculado arriba para
                poder recalcular el offset de centrado —
                ver ese comentario). Se reusa acá tal
                cual, en vez de recomponerlo de nuevo,
                para que position y orientación queden
                siempre calculadas con la misma rotación.
                cone.quaternion reemplaza a
                cone.rotation.y como el único lugar que
                escribe la orientación de esta fase —
                antes alcanzaba con un escalar porque
                sólo había yaw; con dos ejes, un Euler
                también podría, pero el quaternion evita
                cualquier ambigüedad de orden de ejes y
                es exactamente lo que ya se usó para
                calcular offsetWorld arriba, sin
                reconversiones de por medio.
            */
            cone.quaternion.copy(qTotal);


            /*
                Distancia angular al foco (-π/2),
                envuelta a [-π, π] — el foco es siempre
                el MISMO ángulo fijo, sea cual sea "phi":
                por construcción, sFrac=0 (el ancla) cae
                justo ahí cuando phi=0, así que no hace
                falta ninguna vuelta previa antes de que
                el ancla sea la primera ficha en foco.

                OJO: se usa 2π·sFrac (el ángulo que cada
                elemento va a ocupar una vez el círculo
                YA esté formado), no "theta·sFrac" (el
                ángulo instantáneo de la curva, todavía a
                medio doblar). Si se usara "theta" acá,
                en el primer frame de la fase (theta≈0)
                "theta·sFrac" da ≈0 para CUALQUIER sFrac
                — todos los elementos, no sólo el ancla,
                quedarían con diff≈0 y saltarían a
                emphasis=1 (escala/opacidad máximas) a la
                vez, apenas se mueve un pixel de scroll
                (bug reportado: "todas las geometrías
                cambian de centro inmediatamente" — en
                realidad todas saltaban a escala máxima
                de golpe, alrededor de su punto de
                anclaje frontal, lo que se ve como un
                salto de centro). "Quién está en foco" es
                una pregunta sobre el layout FINAL del
                círculo, no sobre cuánto lleva doblado
                la curva en este frame — así que usa
                siempre el ángulo final, modulado sólo
                por "phi" (que de todos modos se mantiene
                en 0 durante todo el tramo "formar").
            */
            let diff =
                (Math.PI * 2 * sFrac + phi) %
                (Math.PI * 2);

            if (diff > Math.PI) diff -= Math.PI * 2;
            if (diff < -Math.PI) diff += Math.PI * 2;

            const diffAbs = Math.abs(diff);

            diffPorSlot[slot] = diffAbs;

            /*
                "emphasis" describe el estado YA
                CURVADO (círculo completo) — cuánto
                bump de escala/opacidad/rotación le
                toca a este elemento si el círculo
                estuviera totalmente formado. Igual
                que la posición (arriba), no se aplica
                de golpe: "orden" deja a TODOS los
                elementos en su estado de reposo plano
                (scale=1, opacity=1, ver
                revealOrder.forEach en
                galeria-revelado.js) — si acá se
                escribiera 1+emphasis*scaleBump y
                minOpacity+emphasis*(1-minOpacity)
                directo desde theta≈0, el ancla (única
                con emphasis=1 en ese instante) saltaría
                de scale=1/opacity=1 a
                scale=1+scaleBump/opacity=1 de golpe —
                el salto de escala en particular corre
                el centro visual del objeto hacia
                afuera de su punto de anclaje frontal,
                que es exactamente el síntoma
                reportado ("cambia el centro") aunque
                la posición en sí ya esté bien
                interpolada. Mismo "blend" que ya usa la
                posición: en theta=0 da el estado plano
                exacto (sin bump para nadie, ni
                siquiera el ancla), y recién con el
                círculo ya cerrado (blend=1) se ve el
                "emphasis" completo.
            */
            const emphasis =
                smoothstep(
                    Math.max(
                        0,
                        1 - diffAbs / anguloVecino
                    )
                );

            const scaleObjetivo =
                1 + emphasis * cfg.scaleBump;

            const opacityObjetivo =
                cfg.minOpacity +
                emphasis * (1 - cfg.minOpacity);

            cone.scale.setScalar(
                1 + (scaleObjetivo - 1) * blend
            );

            cone.material.opacity =
                1 + (opacityObjetivo - 1) * blend;

            rotationWeights[cupID] =
                emphasis * cfg.rotationScale * blend;


            if (diffAbs < mejorDiffAbs) {

                mejorDiffAbs = diffAbs;
                mejorSlot = slot;

            }

        });


        /*
            "mejorSlot" (arriba) es el vecino más cercano
            PURO — sin margen, cambia apenas otro slot
            queda una fracción de radián más cerca. Eso
            es exactamente el punto de "salto en 0.5"
            reportado: justo en el ángulo medio entre dos
            elementos, cualquier microscroll (inercia de
            trackpad, rueda con redondeo) puede hacer que
            "mejorSlot" oscile de un lado a otro del
            umbral, y como panelDisplayIndex dispara
            updatePanel() en galeria.js (swap de ficha,
            re-medición de paneles, fundido), esa
            oscilación se ve/siente como un parpadeo.

            La HISTÉRESIS de acá abajo no toca "mejorSlot"
            ni nada de lo ya calculado arriba (posición,
            escala, opacidad, rotationWeights siguen
            usando el diffAbs crudo de cada elemento, sin
            esto: esas SÍ tienen que ser continuas cuadro
            a cuadro) — sólo decide, aparte, cuál es el
            slot que se reporta como "foco" hacia afuera
            (displayIndex/changed), con una zona muerta
            alrededor del punto de cruce: el foco previo
            (panelDisplayIndex) se queda quieto hasta que
            el candidato nuevo gana por más que
            MARGEN_HISTERESIS, no por cualquier epsilon.

            MARGEN_HISTERESIS se expresa como fracción de
            "anguloVecino" (el espaciado angular real
            entre elementos vecinos, ya calculado arriba)
            en vez de un radián fijo, para que la
            tolerancia se ajuste sola sea cual sea la
            cantidad de elementos — con muchos elementos
            el espaciado es más chico, y una tolerancia
            fija podría terminar siendo más ancha que el
            espaciado mismo.

            0.18 (~18% del espaciado a cada elemento) es
            un valor de partida para ajustar a ojo: más
            alto, más "pegajoso" el foco (tarda más en
            soltar); más bajo, más parecido al
            comportamiento sin histéresis de antes.
        */
        const MARGEN_HISTERESIS =
            anguloVecino * 0.18;

        let displayIndex = mejorSlot;

        if (
            panelDisplayIndex !== -1 &&
            panelDisplayIndex !== mejorSlot
        ) {

            const diffFocoActual =
                diffPorSlot[panelDisplayIndex];

            /*
                El candidato ganador de este frame
                (mejorDiffAbs) tiene que superar al foco
                actual por más que el margen para
                desplazarlo — si no, gana el foco previo,
                aunque en rigor ya no sea el más cercano.
            */
            if (
                mejorDiffAbs >=
                diffFocoActual - MARGEN_HISTERESIS
            ) {

                displayIndex = panelDisplayIndex;

            }

        }

        const elementoId = order[displayIndex];

        /*
            DEBUG: snapshot de este frame — ver debug()
            más abajo (fuera de update()) para cómo se
            imprime. "targets" es un array de {slot,
            u, phiDeg} — el punto EXACTO (en grados)
            donde cada slot queda centrado según la
            corrección de seam vigente.
        */
        ultimoDebug = {
            t, rotateT, phi,
            phiDeg: phi * 180 / Math.PI,
            n, huecosReales,
            seamOffset,
            mejorSlot, mejorDiffAbs,
            mejorDiffAbsDeg: mejorDiffAbs * 180 / Math.PI,
            panelDisplayIndex, displayIndex,
            targets: Array.from(
                { length: huecosReales + 1 },
                (_, k) => {

                    const u =
                        targetU(
                            k, huecosReales, seamOffset,
                            rangoPhi, sFracBasePorSlot
                        );

                    return {
                        slot: k,
                        sFracBase: sFracBasePorSlot[k],
                        u,
                        phiDeg: (-rangoPhi * u) * 180 / Math.PI,
                        diffAbsAhoraDeg:
                            diffPorSlot[k] !== undefined
                                ? diffPorSlot[k] * 180 / Math.PI
                                : null
                    };

                }
            )
        };

        if (displayIndex !== panelDisplayIndex) {

            panelDisplayIndex = displayIndex;

            return {
                changed: true,
                displayIndex,
                elementoId,
                rotationWeights
            };

        }

        return {
            changed: false,
            displayIndex,
            elementoId,
            rotationWeights
        };

    }


    function reset() {

        panelDisplayIndex = -1;

        /*
            La orientación (quaternion, yaw+pitch) es
            estado NUEVO que sólo esta fase escribe (ver
            cabecera) — hay que devolverla a identidad
            explícitamente al salir, o un cono queda
            "torcido" —o inclinado, con el pitch— si el
            visitante vuelve a subir el scroll hacia una
            fase que nunca toca esta orientación.
            cone.quaternion.identity() limpia los dos
            ejes de una: alcanzaba con
            "cone.rotation.y = 0" cuando sólo existía
            yaw, pero ya no cubre el pitch que puede
            haber quedado de un arrastre vertical en
            curso justo antes de salir de "fichas".
        */
        for (let id = 0; id < elementCount; id++) {

            cones[id].quaternion.identity();

        }

    }


    /*
        DEBUG — COMANDO PARA LA CONSOLA:

            __galeriaCarrusel.debug()

        Imprime el último frame calculado por update():
        en qué "paso" (tramo entre dos elementos) está
        parado el scroll ahora mismo, el phi vigente, y
        —en una tabla— el punto EXACTO donde cada
        elemento (slot) queda centrado según la
        corrección de seam actual, junto con su diffAbs
        REAL de este mismo frame (columna
        "diffAbsAhoraDeg" — si el elemento realmente
        está en su punto, esa columna da ~0° para el
        slot que corresponda al "paso" vigente).

        Para comparar "dato actual" vs. "dónde debería
        ocurrir": mirá la fila de "targets" cuyo "slot"
        coincide con el elemento que estás mirando en
        pantalla, columna "phiDeg" — ESE es el ángulo en
        el que debería estar centrado. Compará contra
        "phiDeg" de arriba (el phi vigente AHORA) cuando
        el scroll está, a ojo, en el punto donde debería
        estar la meseta.

        Se puede dejar pegado en el código: no hace
        nada solo (no loguea nada por su cuenta, no usa
        recursos) hasta que alguien lo llama a mano
        desde la consola.
    */
    function debug() {

        if (!ultimoDebug) {

            console.log(
                "[galeria-carrusel] todavía no corrió " +
                "ningún update() — hacé scroll un poco " +
                "y volvé a llamar a __galeriaCarrusel.debug()."
            );

            return null;

        }

        const d = ultimoDebug;

        console.log(
            "[galeria-carrusel] t=" + d.t.toFixed(4) +
            "  rotateT=" + d.rotateT.toFixed(4) +
            "  phi=" + d.phiDeg.toFixed(2) + "°" +
            "  n=" + d.n +
            "  huecosReales=" + d.huecosReales +
            "  seamOffset=" + d.seamOffset
        );

        console.log(
            "[galeria-carrusel] mejorSlot=" + d.mejorSlot +
            "  mejorDiffAbs=" + d.mejorDiffAbsDeg.toFixed(2) + "°" +
            "  panelDisplayIndex=" + d.panelDisplayIndex +
            "  displayIndex=" + d.displayIndex
        );

        console.table(d.targets);

        return d;

    }


    if (typeof window !== "undefined") {

        window.__galeriaCarrusel = { debug };

    }


    return { update, reset, debug };

}
