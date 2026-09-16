/* ==================================================
   galeria-carrusel.js

   Fase "fichas": la fila deja de ser una línea recta y
   se transforma en un círculo (línea -> arco -> círculo),
   que después rota sobre su propio centro para ir
   mostrando un elemento distinto en el punto de "foco"
   (el ángulo -π/2, el mismo en el que arranca el ancla) —
   ver linea_isometrica.html, la referencia matemática de
   esta fase.

   "t" (0..1 de toda la fase) se reparte en dos tramos que
   convergen solos en el punto de empalme, sin blend
   adicional entre ellos:

     1) "formar": theta va de 0 a 2π. Con theta=0 la
        fórmula colapsa exactamente a la fila recta
        ("positions" tal cual), así el primer frame de esta
        fase no salta respecto al último de "orden". phi se
        mantiene en 0 todo el tramo, así que el foco
        (displayIndex) se mantiene en el ancla (order[0]).

     2) "rotar": theta queda fijo en 2π y es phi el que
        avanza, continuo — el foco se calcula en cada
        frame como el slot con menor distancia angular a
        -π/2, así que el spotlight se mueve suave de un
        elemento al siguiente en vez de saltar.

   ANCLA: el elemento en order[0] (extremo IZQUIERDO de la
   fila, mismo lado al que queda mirando la cámara fija en
   esta fase, ver setCameraLado(1) en galeria.js). Queda
   fijo por el CENTRO real de su bounding box, no por su
   punto de anclaje frontal/base (cada geometría está
   alineada al frente de su bbox, no a su centro — ver
   prepararGeometria en galeria-escena.js): "anchorWorld"
   se calcula sumándole a positions[0] el offset (pivotX,
   pivotZ) del ancla, el mismo par que usa armarGroup3D
   para su propio pivote de spin.

   RADIO: "s" (la fracción a lo largo de la curva de cada
   slot) se calcula siempre sobre "longitudCurva", nunca
   escalada por radioFactor. Lo único que escala con
   config.carousel.radioFactor es "longitudEfectiva", una
   longitud aparte que solo gobierna el RADIO (radius =
   longitudEfectiva / theta): arranca igual a
   "longitudCurva" en theta=0 y llega a
   longitudCurva·radioFactor en theta=2π. Mismo "s" en
   ambos usos => mismo orden relativo de los elementos a lo
   largo de la curva, pase lo que pase con el radio.

   HUECO VACÍO: "longitudCurva" reparte la distancia física
   entre ancla y extremo libre sobre UN hueco más de los
   que hay elementos-1 (n huecos en vez de n-1). Sin ese
   hueco fantasma, el último elemento y el ancla terminan
   en el mismo ángulo al cerrar el círculo
   (-π/2 + 2π ≡ -π/2 mod 2π) y se pisan, igual que al doblar
   una varilla hasta que sus dos puntas se tocan — ver el
   cálculo de "longitudCurva" en update(). Por eso "phi" (en
   el tramo "rotar") no barre los 2π completos: el círculo
   de fichas reales solo ocupa 2π·(n-1)/n; "rangoPhi" barre
   exactamente ese rango y se detiene ahí, sin traer de
   vuelta al ancla al foco al final.

   ORIENTACIÓN: cada elemento gira sobre group.quaternion
   (el grupo EXTERNO que ya posicionan reordenar/revelado
   vía cone.position — nunca el "pivote" interno de
   galeria-rotacion.js, exclusivo del spin propio) para
   quedar mirando hacia afuera del círculo: el vector
   radial divergente (centro -> punto sobre el círculo), no
   la tangente de la curva. Ese mismo vector ("outward")
   también resuelve, rotado, el offset de centrado: como el
   objeto puede estar girado en dos ejes (yaw y pitch, si
   hay arrastre manual — ver galeria-interaccion-ficha.js),
   el offset (pivotX, pivotY, pivotZ) —fijo en el espacio
   LOCAL del objeto— hay que rotarlo por el mismo quaternion
   que el objeto va a tener en pantalla, no proyectarlo solo
   sobre los ejes fijos de mundo. En theta=0, "outward"
   colapsa a (0,0,1) — mismo eje que la fila recta sin
   rotar — así el offset coincide con el caso sin curva. Se
   usa quaternion (no un Euler rotation.y) porque con dos
   ejes combinados un Euler abre ambigüedad de orden, y el
   quaternion es lo que hace falta para rotar (pivotX,
   pivotY, pivotZ) sin conversiones de ida y vuelta.

   PENDIENTE DE CALIBRAR A OJO: el signo de "rotationY =
   atan2(outward.x, outward.z)" puede necesitar el signo
   opuesto, o un +π, según cómo esté orientada la cara
   "frontal" real de cada geometría — solo se confirma
   mirando la escena real.

   BLEND GRADUAL DEL CENTRADO: el offset que centra cada
   elemento en su bbox real no se aplica de golpe desde el
   primer frame — en theta=0 tiene que dar exactamente
   "positions[slot]", el mismo lugar plano donde
   "orden"/"revelado" dejaron a cada elemento, o se ve un
   salto al entrar a esta fase. Se interpola desde esa
   posición plana hacia la posición centrada-sobre-la-curva
   con un blend atado a "theta" mismo (0 en theta=0, 1 con
   el círculo ya cerrado). La rotación no necesita este
   blend: "outward" ya tiende a (0,0,1) cuando theta -> 0,
   así que "rotationY" ya sale continuo, sin blend adicional.

   Ninguna otra fase (reordenar/revelado) toca la
   orientación del objeto (solo position/scale/opacity; el
   quaternion queda siempre en identidad). Como acá sí se
   escribe —en dos ejes, yaw y pitch— reset() (llamado por
   galeria.js cada vez que otra fase pasa a estar vigente)
   también tiene que devolver el quaternion a identidad, o
   un cono que quedó girado/inclinado en "fichas" seguiría
   así al volver a "orden"/"revelado".

   Ya NO se usa getHiddenDrop(): nada sale del cuadro en
   esta fase — todos los elementos quedan siempre sobre el
   círculo, cada uno apoyado en su propia base (ver
   "baseElemento" en el loop de update, el FIX del piso al
   100%).

   HISTÉRESIS DEL FOCO (displayIndex): "mejorSlot" (el
   vecino angular más cercano al punto de foco) es un
   cálculo continuo y sin margen, correcto para todo lo que
   se anima en base a él (opacidad del panel/luces,
   rotationWeights, que sí deben reaccionar de forma
   continua) pero es el punto ciego para decidir qué
   elemento es "el foco" de cara afuera: justo en el ángulo
   medio entre dos elementos, un scroll de un pixel puede
   hacer oscilar el foco reportado de un lado a otro — y
   como cada cambio de foco dispara updatePanel() en
   galeria.js, esa oscilación se siente como parpadeo. La
   solución es una zona muerta angular alrededor del punto
   de cruce, solo para esta decisión puntual: el foco previo
   se queda fijo hasta que el candidato nuevo gana por más
   que MARGEN_HISTERESIS — ver el cálculo de "displayIndex"
   en update(), después del forEach principal.

   MESETA DE DESCANSO (phi): la histéresis de arriba evita
   que la FICHA de texto cambie de lado cerca del cruce,
   pero no toca la posición/orientación real de la
   geometría — "phi" seguía siendo un ease continuo parejo
   sobre todo el tramo "rotar", así que el cono en foco
   nunca dejaba de moverse un poco con cualquier scroll, por
   chico que fuera. La solución completa
   (indiceContinuo/targetU/pasoConDescanso — tres funciones
   puras que reemplazan el ease parejo por una curva con
   paradas reales) se movió a galeria-carrusel-descanso.js,
   para no engordar este archivo con matemática que no
   depende de THREE ni del resto del estado del carrusel —
   ver ese archivo para el detalle, incluida
   "sFracUniformePorSlot" vs. "sFracBasePorSlot".
================================================== */

import * as THREE from "three";
import { ease, smoothstep } from "./galeria-utils.js";
import {
    indiceContinuo, targetU, pasoConDescanso
} from "./galeria-carrusel-descanso.js";


const EPS = 0.00001;

// Reusados frame a frame para el cálculo de yaw+pitch
// (dentro de order.forEach): instanciarlos una sola vez
// acá, fuera del loop, evita crear objetos nuevos (2
// quaternions + 1 vector) por cada elemento en cada
// frame. Se pisan y reusan en cada iteración.
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
        // Rotación manual del elemento en foco, en dos ejes
        // (ver galeria-interaccion-ficha.js) — capa ADITIVA
        // sobre "rotationY" (más abajo), no un reemplazo.
        // Devuelve { yaw, pitch }: los dos ejes se necesitan
        // juntos para componer un único quaternion. Opcional:
        // si nadie la pasa, se comporta como si nadie
        // estuviera arrastrando nunca.
        getManualOffset = () => ({ yaw: 0, pitch: 0 }),
        // Eje principal vigente del layout (ver
        // galeria-escena.js) — usado SOLO para leer el
        // espaciado real de la fila de ENTRADA
        // (sFracBasePorSlot/longitudFisica, más abajo): la
        // fila puede crecer en X o en Y según el modo, pero
        // el círculo en sí que arma este archivo siempre
        // vive en el plano XZ (ver "uHat"/"vHat" más abajo)
        // — no cambia con el modo. Default "x" por
        // compatibilidad hacia atrás.
        //
        // No recibe "camera": con "anguloBase" fijo en -π/2
        // (ver puntoYOutward más abajo) el ancla queda fija
        // en anchorWorld por identidad algebraica, sin
        // necesitar la cámara real. Apuntar la cámara AL
        // ancla es responsabilidad de quien orquesta
        // cámara+carrusel (galeria.js / galeria-escena.js).
        ejePrincipal = "x"
    }
) {

    const cfg = config.carousel;

    let panelDisplayIndex = -1;


    function update(t) {

        /*
            En vertical el ancla del carrusel (order[0], más
            abajo) tiene que ser el elemento de ARRIBA: se
            lee de arriba hacia abajo, así que el círculo
            arranca a formarse desde ahí. Se invierten
            "order" y "positions" juntos, una sola vez, en
            vez de tocar cada uso por separado: como
            "positions[i]" siempre corresponde al cupID en
            "order[i]" (misma fila, leída en paralelo),
            invertir ambos preserva esa correspondencia — el
            resto del archivo sigue igual, solo que "slot 0"
            pasa a ser el elemento de arriba. En horizontal,
            sin cambios.
        */
        const order =
            ejePrincipal === "y"
                ? [...getOrder()].reverse()
                : getOrder();

        const positions =
            ejePrincipal === "y"
                ? [...getPositions()].reverse()
                : getPositions();

        const n = elementCount;

        if (n === 0) {

            return {
                changed: false,
                rotationWeights: {},
                panelOpacity: 0,
                focoContinuo: 0,
                blend: 0,
                circuloCerrado: null,
                anclaPrincipalMundo: 0,
                anclaMundoX: 0
            };

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
        /*
            Es una MAGNITUD (cuánto mide la fila entre sus
            dos extremos): Math.abs() la hace robusta a cuál
            extremo tiene la coordenada mayor, sea cual sea
            el modo (en vertical el ancla queda arriba, con
            la coordenada más alta; en horizontal es al
            revés). Sin el abs(), un signo negativo acá
            desplazaría en π toda la parametrización angular
            del círculo (longitudCurva/radioCerrado).
        */
        const longitudFisica =
            Math.abs(
                extremoPos[ejePrincipal] - anclaPos[ejePrincipal]
            );

        /*
            Hueco fantasma (n huecos, no n-1) — ver "HUECO
            VACÍO" en la cabecera. De paso, hace que
            "anguloVecino" (más abajo, 2π/n) describa el
            espaciado angular real entre vecinos con
            exactitud — con n-1 huecos reales sobre el
            círculo completo, ese espaciado hubiera sido
            2π/(n-1), más apretado de lo que asume el cálculo.
        */
        const huecosReales =
            Math.max(1, n - 1);

        const longitudCurva =
            n > 1
                ? longitudFisica * n / huecosReales
                : (longitudFisica || 1);


        // Adelantado desde más abajo (donde vivía antes,
        // junto al forEach de diff/emphasis): "phi" también
        // lo necesita ahora para sFracBasePorSlot, más abajo.
        const sFracDenom =
            longitudCurva || 1;

        /*
            sFrac de CADA slot, SIN seam (seamAnimado se suma
            aparte más abajo, en el forEach real, y también
            en targetU()/pasoConDescanso() para la meseta) —
            medido directo de "positions", no asumido con una
            fórmula tipo "slot/n": el layout real puede no
            ser perfectamente uniforme (anchos de cono
            distintos, ajustes de spacing), así que asumir
            centros espaciados parejo dejaría a la meseta
            apuntando a un ángulo que no coincide con el
            diff=0 real. Midiendo directo de "positions" —la
            misma fuente que ya usa el diff real, más abajo—
            la meseta queda garantizada consistente con el
            diff real, sea cual sea el layout.
        */
        /*
            "longitudFisica" es Math.abs() (siempre positiva),
            pero sFracBasePorSlot necesita saber si el sentido
            real ancla->extremo es creciente o decreciente en
            "ejePrincipal", o el resultado da negativo (el
            elemento arranca curvándose para el lado
            equivocado). "signoFila" se calcula ANTES del
            abs() para restaurar ese signo — no con
            Math.sign(longitudFisica), que ya sería siempre
            +1. Con esto, sFracBasePorSlot va de 0 (ancla) a
            positivo creciente (extremo), sea cual sea qué
            extremo tiene la coordenada más alta.
        */
        const signoFila =
            extremoPos[ejePrincipal] - anclaPos[ejePrincipal] >= 0
                ? 1
                : -1;

        const sFracBasePorSlot =
            positions.map(
                pos =>
                    signoFila *
                    (pos[ejePrincipal] - anclaPos[ejePrincipal]) /
                    sFracDenom
            );

        /*
            DISTRIBUCIÓN UNIFORME (pedido: "en el
            círculo tendrían que distribuirse
            uniformemente, pero no de golpe, sino suave y
            animado"): a diferencia de sFracBasePorSlot
            (medido del ancho REAL de cada elemento en la
            fila), acá sí se asume reparto parejo —
            slot/n—, mismo criterio que anguloVecino ya
            asume más abajo (2π/n) para emphasis/opacidad.

            Se define con el mismo rango que
            sFracBasePorSlot para que el blend de más
            abajo (junto a "longitudEfectiva") no salte en
            los extremos: en slot=0 ambas dan 0, y en el
            último slot real (n-1) ambas dan
            huecosReales/n — el hueco fantasma (ver
            comentario grande de "huecosReales" más
            arriba) queda respetado igual en las dos
            versiones, sólo cambia el reparto de los
            intermedios.
        */
        const sFracUniformePorSlot =
            positions.map((_, k) => k / n);


        /*
            uHat/vHat: misma convención que
            linea_isometrica.html. El plano del círculo es
            SIEMPRE XZ, sea cual sea "ejePrincipal" —a
            diferencia de "sFracBasePorSlot"/"longitudFisica",
            que sí necesitan saber sobre qué eje crece la
            fila de entrada— para que en vertical el círculo
            se siga viendo "hacia el costado" y no "hacia
            atrás" (un círculo en YZ, visto de frente, se lee
            como profundidad pura, sin componente lateral en
            pantalla).

            vHat=(0,0,-1): el círculo se abomba hacia -Z
            (lejos de la cámara, que mira desde +Z), así el
            punto de foco (-π/2) queda del lado de adelante.

            NO invertir este signo sin más: con las
            proporciones reales de este proyecto (radioCerrado
            ~17.4, bastante más grande que la distancia
            cámara-ancla, ~6-16 según la fase) invertir vHat
            pone a la cámara DENTRO del círculo y rompe el
            framing. En linea_isometrica.html el mismo truco
            sí funciona porque ahí el radio es diminuto
            (~1.6) frente a la distancia de esa cámara (~14)
            — proporción muy distinta, no es transportable
            sin más.
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

        /*
            B (galeria.js/galeria-escena.js): geometría del
            círculo YA CERRADO del carrusel + coordenada del
            ancla sobre "ejePrincipal" — se exponen en el
            resultado de update() (más abajo, "circuloCerrado"/
            "anclaPrincipalMundo") para que
            calcularArcoCamara() (galeria-escena.js) pueda
            calcular el radio "mismos radios" y el ángulo de
            alineación del giro extra del arco de cámara
            (t>0.5). Mismas fórmulas que antes vivían en el
            escaneo de "anguloFoco" (radioCerrado =
            longitudGrande/2π, centro = ancla + radio·vHat —
            ver el comentario grande, más abajo), reusadas
            acá con otro fin.

            "anclaPrincipalMundo" NO sale de "anchorWorld"
            (que solo tiene x/z, siempre en el plano del
            círculo): se recalcula sobre "ejePrincipal" —
            mismo criterio que anclaCentroX/Z, pero con la
            componente que corresponda según el modo
            horizontal/vertical.
        */
        const radioCerrado =
            longitudGrande / (Math.PI * 2);

        const circuloCerrado = {
            x: anchorWorld.x + vHat.x * radioCerrado,
            z: anchorWorld.z + vHat.z * radioCerrado,
            radio: radioCerrado
        };

        const anclaPivotPrincipal =
            (anclaBbox.min[ejePrincipal] + anclaBbox.max[ejePrincipal]) / 2;

        const anclaPrincipalMundo =
            anclaPos[ejePrincipal] + anclaPivotPrincipal;

        /*
            D (galeria-escena.js, círculo verde en vertical):
            "anchorWorld.x" YA ES la coordenada X real del
            ancla en mundo — el círculo del carrusel vive
            SIEMPRE en XZ (ver "uHat"/"vHat" más arriba), así
            que "anchorWorld" ya resuelve solo la corrección
            de eje secundario (corregirSecundario, aplicada
            más abajo al armar "positions") sin que
            galeria-escena.js tenga que repetir esa cuenta.
            Se expone con nombre propio para que quede claro
            que es la X REAL de la ancla, no la del centro del
            círculo cerrado.
        */
        const anclaMundoX = anchorWorld.x;

        /*
            El ángulo de referencia del círculo ("anguloBase"
            en puntoYOutward, más abajo) está FIJO en -π/2:
            con sFrac=0 (el ancla) y phi=0 (arranque de
            "rotar"), eso da angulo=-π/2 para cualquier
            theta/blend, y con uHat=(1,0)/vHat=(0,-1) cancela
            EXACTAMENTE el término de centro, dejando
            "anchorWorld" sin importar cuán grande sea el
            radio — identidad algebraica, no aproximación: el
            ancla queda fija SIEMPRE, sin buscar ni cachear
            nada. Con el punto a centrar en pantalla ya fijo y
            conocido ("anchorWorld"), apuntar la cámara ahí es
            responsabilidad de quien orquesta cámara+carrusel
            (ver "setCameraLado"/el lookAt en
            galeria-escena.js y su uso en galeria.js), no de
            este archivo.
        */


        let theta, phi;

        // Valor por defecto para el tramo "formar" — recién
        // se recalcula en el tramo "rotar", más abajo.
        let rotateT = 0;

        /*
            "focoContinuo": índice 0..(huecosReales)
            continuo, EXACTAMENTE 0 en el elemento del
            slot 0 y EXACTAMENTE huecosReales (=n-1) en el
            último — con la MISMA meseta/transición que ya
            gobierna phi (ver indiceContinuo() más arriba;
            mismo criterio que "panelOpacity": atar al
            número que ya existe en vez de recalcular uno
            aparte). Lo consume
            galeria-mapa.js (ver "focoContinuo" en el
            return de más abajo) para saber en qué punto
            de su propio recorrido A->B->C debe estar la
            cámara del mapa — así llega a cada punto en el
            MISMO instante en que ese elemento realmente
            se centra acá, sin importar cuánto dure el
            tramo "formar" (ver más abajo: por default
            queda en 0 durante todo "formar", porque phi=0
            en ese tramo YA deja al slot 0 centrado desde
            el arranque de "fichas" — no hay que esperar a
            que termine de armarse el círculo para que el
            mapa empiece a "salir" del primer punto).
        */
        let focoContinuo = 0;

        /*
            Rango real que "phi" tiene que barrer en el
            tramo "rotar": NO son los 2π completos —eso
            volvería a traer al ancla al foco justo al
            final, repitiendo la primera ficha—, sino sólo
            el arco ocupado por los huecos REALES (n-1 de
            los n huecos totales, ver "longitudCurva" más
            arriba). Al
            llegar a rotateT=1, phi queda exactamente en
            el valor que trae al ÚLTIMO elemento real al
            foco, sin seguir de largo hacia el hueco
            vacío.
        */
        const rangoPhi =
            n > 1
                ? Math.PI * 2 * huecosReales / n
                : 0;

        // cfg.seamOffset es opcional (fallback 0). Se
        // adelanta acá (antes del bloque theta/phi) porque
        // el cálculo de "phi" mismo ya lo necesita para
        // targetU()/pasoConDescanso() — a diferencia de
        // "seamAnimado", que depende de "blend" y se queda
        // declarado más abajo, junto a donde ya vivía.
        const seamOffset = cfg.seamOffset ?? 0;

        // El seam sobrevive intacto en TODOS los slots
        // (ancla, último e intermedios por igual), así que
        // usa un único valor parejo (ver targetU() más
        // abajo). Se arma igual como array por slot, no
        // como escalar suelto, para que el forEach de más
        // abajo siga leyendo "seamPorSlot[slot]".
        const seamPorSlot =
            sFracBasePorSlot.map(() => seamOffset);

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

            // cfg.dwellFraction es opcional (fallback 0.5,
            // ver pasoConDescanso arriba) — mismo patrón que
            // pitchMaxRad (galeria-interaccion-ficha.js) y
            // scrollHintFadeWidth (galeria-revelado.js).
            //
            // pasoConDescanso recibe sFracUniformePorSlot,
            // no sFracBasePorSlot: durante TODO el tramo
            // "rotar" theta ya está fijo en 2π (blend=1
            // siempre, ver blend más abajo), así que el
            // sFrac real de cada slot (forEach, más abajo) ya
            // está fijo en sFracUniformePorSlot[slot]. La
            // meseta tiene que apuntar a ese mismo valor —no
            // al centro físico— para seguir centrando
            // exactamente en diff=0 (mismo criterio que
            // targetU(), más arriba).
            phi =
                -rangoPhi *
                pasoConDescanso(
                    rotateT,
                    huecosReales,
                    cfg.dwellFraction ?? 0.5,
                    rangoPhi,
                    sFracUniformePorSlot
                );

            focoContinuo =
                indiceContinuo(
                    rotateT,
                    huecosReales,
                    cfg.dwellFraction ?? 0.5
                );

        }


        /*
            Interpola desde longitudCurva (theta=0, sin
            aporte de radioFactor todavía) hacia
            longitudGrande (theta=2π, círculo ya cerrado).
            Con la fórmula ya unificada (ver puntoYOutward
            más abajo — ya no hay una rama theta<EPS
            aparte), la continuidad en theta=0 la garantiza
            "blend" multiplicando a "(curvaX - xBase)" en
            finalX/finalY/finalZ (más abajo): con blend=0,
            esos "final*" dan exactamente "xBase"/"yBase"/
            "positions[slot].z" sea cual sea el valor de
            longitudCurva acá.
        */
        const blend = theta / (Math.PI * 2);

        const longitudEfectiva =
            longitudCurva +
            (longitudGrande - longitudCurva) * blend;


        /*
            SEAM ANIMADO: corre el parámetro de la curva
            (sFrac, más abajo) "seamOffset" hacia el extremo
            libre, la misma fracción para todos los elementos
            (ver "seamPorSlot" más arriba). Es un ajuste
            residual OPCIONAL para un nudge fino si hiciera
            falta (default 0, sin efecto si no se toca) — el
            centrado del ancla ya no depende de él, es una
            identidad algebraica (ver "anguloBase" más abajo).
            Como "diff" se calcula sobre este mismo "sFrac" ya
            desplazado, cualquier residuo queda automáticamente
            consistente con la detección de foco.

            Se anima con el mismo "blend" que ya gobierna
            posición/escala/opacidad: en theta=0 no suma nada
            (sin salto respecto de "orden") y llega a su valor
            completo recién al cerrarse el círculo.
        */
        const seamAnimadoPorSlot =
            seamPorSlot.map(s => s * blend);


        /*
            Punto sobre la curva para la fracción "sFrac"
            (0 = ancla, crece hacia el extremo libre), más
            el vector "outward" (centro del círculo ->
            este punto) que resuelve tanto la orientación
            como el offset de centrado — ver cabecera.
        */
        /*
            "anguloBase" fijo en -π/2 (ver justificación más
            arriba, junto a "longitudGrande"): cos(-π/2)=0,
            1+sin(-π/2)=0, así que cancela el término de
            centro exacto para cualquier "radius". Sin rama
            especial "theta < EPS": la fórmula general ya
            converge sola al mismo resultado (ancla fija,
            resto en línea recta); solo hace falta acotar el
            DENOMINADOR del radio (Math.max(theta, EPS)) para
            evitar la división por 0 en el primer frame.
        */
        function puntoYOutward(sFrac) {

            const anguloBase = -Math.PI / 2;

            const radius =
                longitudEfectiva / Math.max(theta, EPS);

            const centerX =
                anchorWorld.x + vHat.x * radius;
            const centerZ =
                anchorWorld.z + vHat.z * radius;

            const angle =
                anguloBase + theta * sFrac + phi;

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

        // sFracDenom ya se calculó más arriba (antes del
        // bloque de theta/phi, junto a sFracBasePorSlot) —
        // se sigue usando acá abajo, en el forEach, tal cual.

        const rotationWeights = {};

        // Se guarda el diffAbs de CADA slot (no solo el
        // mínimo) porque la histéresis de más abajo necesita
        // comparar contra el diff del foco PREVIO
        // específicamente, que puede no ser el slot con
        // menor diff en este frame — ver "displayIndex"
        // después del forEach.
        const diffPorSlot = {};

        // Se guarda "opacityFinal" de CADA slot — el mismo
        // número que gobierna "cone.material.opacity" más
        // abajo, y que por construcción llega a 1 exactamente
        // cuando ese elemento está centrado con su seam
        // (diffAbs=0, ver "emphasis" más abajo). Después del
        // forEach se toma el valor del slot en foco
        // (displayIndex) y se expone como "panelOpacity" en
        // el resultado de update() — así galeria.js fija la
        // opacidad del panel de texto con este mismo número,
        // en vez de una transición CSS de duración fija
        // independiente del scroll.
        const opacityPorSlot = {};

        // Mismo número que "opacityPorSlot", pero indexado
        // por ID DE ELEMENTO (cupID) en vez de slot — mismo
        // criterio que "rotationWeights" (que también indexa
        // por cupID, no por slot). Alimenta lucesPorCaja
        // (galeria-luces.js): la maqueta reusa literalmente
        // "opacityFinal" como "focoWeight" (ver
        // aplicarColorFoco(slot, opacityFinal) en
        // Maqueta.html) — mismo valor, dos usos.
        const focoWeights = {};

        let mejorSlot = 0;
        let mejorDiffAbs = Infinity;


        order.forEach((cupID, slot) => {

            /*
                "sFrac" no es fijo — viaja de
                sFracBasePorSlot (el layout físico real,
                obligatorio en blend=0 para no romper la
                continuidad con la fila recta) hacia
                sFracUniformePorSlot (reparto parejo,
                slot/n) a medida que "blend" avanza de 0 a
                1 — el mismo "blend" que interpola
                "longitudEfectiva" (radio) más arriba, así
                que ambos efectos (radio agrandándose +
                reparto emparejándose) quedan sincronizados
                en una sola animación.

                En blend=1 (círculo ya cerrado, todo el
                tramo "rotar") sFrac queda exactamente en
                sFracUniformePorSlot[slot] — por eso
                targetU()/pasoConDescanso() también se
                miden desde sFracUniformePorSlot en vez de
                sFracBasePorSlot: si no, la meseta apuntaría
                al centro físico viejo mientras el elemento
                ya descansa en el ángulo parejo nuevo.
            */
            const sFrac =
                sFracBasePorSlot[slot] +
                (
                    sFracUniformePorSlot[slot] -
                    sFracBasePorSlot[slot]
                ) * blend +
                seamAnimadoPorSlot[slot];

            const punto =
                puntoYOutward(sFrac);

            const x = punto.x;
            const z = punto.z;
            const outward = punto.outward;


            /*
                "diff"/"emphasis"/"opacityObjetivo" solo
                necesitan "sFrac" y "phi" (ya definidos
                arriba) más "blend" y "anguloVecino" (ya
                definidos antes del forEach) — no dependen de
                "outward", del quaternion ni del pivot. Se
                calculan acá (antes de rotar "pivotLocal" más
                abajo) por prolijidad, junto al resto del
                cálculo de foco.

                Distancia angular al foco (-π/2), envuelta a
                [-π, π] — el foco es siempre el MISMO ángulo
                fijo, sea cual sea "phi": por construcción,
                sFrac=0 (el ancla) cae justo ahí cuando
                phi=0.

                OJO: se usa 2π·sFrac (el ángulo que cada
                elemento va a ocupar una vez el círculo ya
                esté formado), no "theta·sFrac" (el ángulo
                instantáneo de la curva, todavía a medio
                doblar).

                "sFrac" ya trae sumado
                "seamAnimadoPorSlot[slot]" — el corrimiento
                angular fijo que recentra la geometría
                respecto de su ancla (ver seamOffset en
                CONFIG). Ese corrimiento es deliberado para
                la POSICIÓN/orientación renderizada (por eso
                "sFrac" se usa tal cual en puntoYOutward(),
                arriba), pero acá mediríamos distancia al
                ángulo crudo -π/2 — que ya no es el punto de
                reposo real desde targetU()/pasoConDescanso():
                ahí "phi" en reposo solo cancela la parte de
                "sFrac" SIN seam, dejando a propósito un resto
                de exactamente 2π·seamAnimadoPorSlot[slot] en
                el ángulo final. Sin restar ese mismo resto
                acá, "diffAbs" nunca llegaría a 0 en el punto
                en el que el elemento realmente está quieto y
                centrado en pantalla: el pico de
                "emphasis"/opacidad y el cambio de
                "mejorSlot"/displayIndex quedarían corridos
                "rangoPhi" de scroll respecto de la meseta
                real. Al restar el mismo
                "seamAnimadoPorSlot[slot]" que ya sumó
                "sFrac", queda una cuenta relativa al punto de
                reposo real —0 exactamente ahí—, sin afectar
                en nada la posición/orientación renderizada.
            */
            let diff =
                (
                    Math.PI * 2 *
                        (sFrac - seamAnimadoPorSlot[slot]) +
                    phi
                ) % (Math.PI * 2);

            if (diff > Math.PI) diff -= Math.PI * 2;
            if (diff < -Math.PI) diff += Math.PI * 2;

            const diffAbs = Math.abs(diff);

            diffPorSlot[slot] = diffAbs;

            if (diffAbs < mejorDiffAbs) {

                mejorDiffAbs = diffAbs;
                mejorSlot = slot;

            }

            /*
                "emphasis" describe el estado YA CURVADO
                (círculo completo) — cuánto bump de opacidad
                (panel de texto/luces, ver "focoWeights" más
                abajo) le toca a este elemento si el círculo
                estuviera totalmente formado. Igual que la
                posición, no se aplica de golpe: crece de 0 a
                1 recién con el círculo ya cerrado (blend),
                así el ajuste queda disimulado dentro del
                propio tramo "formar" en vez de saltar de una
                vez.
            */
            const emphasis =
                smoothstep(
                    Math.max(
                        0,
                        1 - diffAbs / anguloVecino
                    )
                );

            const opacityObjetivo =
                cfg.minOpacity +
                emphasis * (1 - cfg.minOpacity);

            const opacityFinal =
                1 + (opacityObjetivo - 1) * blend;

            opacityPorSlot[slot] = opacityFinal;
            focoWeights[cupID] = opacityFinal;


            /*
                Orientación: apunta hacia afuera del
                círculo (radial divergente), no a la
                tangente — así el elemento en foco
                termina mirando de frente a cámara.
            */
            const rotationY =
                Math.atan2(outward.x, outward.z);

            // Offset manual de arrastre sobre el elemento en
            // foco (ver galeria-interaccion-ficha.js): yaw
            // (horizontal, se compone con "rotationY") y
            // pitch (vertical). Para cualquier cupID que no
            // sea el elemento en foco, getManualOffset
            // devuelve { yaw: 0, pitch: 0 }.
            const manual = getManualOffset(cupID);

            /*
                Quaternion TOTAL que se le aplica al objeto
                más abajo: yaw (base "outward" + arrastre
                horizontal) primero, pitch (arrastre
                vertical) después, compuestos como rotaciones
                INTRÍNSECAS —cada una relativa al marco ya
                rotado por la anterior— que es la convención
                estándar para combinar yaw+pitch (qTotal =
                qYaw · qPitch). Con pitch=0 esto colapsa a
                una rotación pura sobre Y, idéntica a la que
                ya había.

                Hace falta acá, no solo al escribir la
                orientación final: el offset de centrado
                (pivotX, pivotY, pivotZ) tiene que rotarse por
                el MISMO quaternion que el objeto va a tener
                en pantalla, o el punto que queda fijo sobre
                la curva deja de ser el centroide real y pasa
                a ser el ancla frontal/base del bbox, con el
                centroide describiendo un arco propio
                alrededor de ese ancla al arrastrar.
            */
            /*
                El círculo siempre vive en el plano XZ, sea
                cual sea "ejePrincipal" (ver "uHat"/"vHat"
                más arriba) — así que el eje de yaw también
                es siempre EJE_Y, la normal de ese plano; no
                depende del modo horizontal/vertical.
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
                FIX (piso al 100%): la altura de piso de ESTE
                elemento es su propia base (misma cuenta que
                "desplazamientoBase" en
                normalizarGeometriaElemento: -bbox.min.y), no
                el "restY" GLOBAL que se usaba antes — ese es
                el mayor desplazamientoBase de TODA la fila
                (ver galeria-escena.js), así que dejaba
                flotando a cualquier elemento cuya geometría
                no fuera tan "profunda" como ese peor caso.
            */
            const baseElemento = -bbox.min.y;

            /*
                pivotLocal: vector del origen del mesh
                (ancla frontal/base) al centroide real, en
                espacio LOCAL del objeto — fijo, no depende
                de la rotación. offsetWorld es ese mismo
                vector llevado a espacio de mundo aplicándole
                qTotal: cuánto hay que correr el origen del
                mesh, respecto del centroide, para que el
                centroide termine exactamente donde tiene que
                estar. Esto es lo que hace falta para X/Z
                (donde el objetivo es el CENTROIDE sobre la
                curva — ver "ANCLA" en la cabecera), pero NO
                para Y — ver el FIX junto a "curvaY", más
                abajo: ahí el objetivo es la BASE apoyada en
                el piso, no el centroide, así que no se resta
                "offsetWorld.y".
            */
            pivotLocal.set(pivotX, pivotY, pivotZ);
            offsetWorld
                .copy(pivotLocal)
                .applyQuaternion(qTotal);

            const cone = cones[cupID];

            // Mismo blend gradual del centrado que la cabecera
            // (ver "BLEND GRADUAL DEL CENTRADO"). El eje Y
            // entra al mismo blend por la misma razón: el arrastre vertical
            // solo es posible sobre el elemento en foco
            // durante "rotar" (blend ya en 1 para entonces),
            // pero blendearlo igual que X/Z mantiene el
            // cálculo consistente sin tener que asumir en qué
            // tramo está la fase.
            //
            // La rotación no necesita este mismo blend
            // aparte: "outward" ya tiende naturalmente a
            // (0,0,1) cuando theta -> 0, así que "rotationY"
            // ya sale continuo, sin blend adicional.
            //
            // Este mismo "blend" (ya calculado una vez
            // arriba, junto a "longitudEfectiva" — misma
            // cuenta, theta/(2π)) se reusa más abajo para
            // escala/opacidad/rotationWeights — ver el
            // comentario junto a "emphasis": sin él, esas
            // tres pasarían por el mismo problema que la
            // posición (saltarían al valor final de golpe en
            // theta≈0).
            const curvaX = x - offsetWorld.x;
            const curvaZ = z - offsetWorld.z;

            /*
                curvaY: la BASE del objeto (no el centroide)
                tiene que quedar apoyada en el piso —
                "baseElemento", la altura propia de este
                elemento (ver el FIX del piso al 100%, más
                arriba). Sin escala animada, alcanza con eso
                directo: el origen del mesh ya nace a
                "-bbox.min.y" de su propia base, así que
                fijar "cone.position.y = baseElemento" deja
                la base exactamente en "y=0 world" bajo
                cualquier rotación sobre Y (nunca toca la
                componente Y de un vector).

                NO se suma "positions[slot].y" acá (a
                diferencia de "yBase", más abajo): el círculo
                vive siempre en el plano XZ a una única altura
                de piso compartida (ver cabecera, "el círculo
                del carrusel vive SIEMPRE en el plano XZ, sea
                cual sea ejePrincipal") — en vertical, "curvaY"
                es justo el objetivo hacia el que cada elemento
                tiene que ABANDONAR su altura de columna
                (positions[slot].y) a medida que "blend" avanza
                y el círculo se cierra; sumar esa altura acá
                habría dejado a cada uno flotando en su vieja
                altura de columna en vez de converger al piso
                real.
            */
            const curvaY =
                baseElemento;

            /*
                "xBase" es el valor del que blend=0 tiene
                que partir. En horizontal, X es el eje
                principal: "positions[slot].x" ya es el
                valor real. En vertical, X es el eje
                SECUNDARIO, y "positions[slot].x" vale 0 sin
                el centrado por centroide que sí aplica
                galeria-reordenar.js (ver
                "corregirSecundario" ahí) — se resta "pivotX"
                (ya calculado arriba) para que blend=0
                coincida exactamente con donde
                "orden"/"revelado" dejaron al elemento; así
                no salta al entrar a "fichas". En horizontal
                no cambia nada.

                "yBase" es el mismo criterio para el eje Y:
                el punto real donde la fila (ver
                verticesMundoDeFila, galeria-escena.js) deja
                a este elemento — "baseElemento +
                positions[slot].y" —, no una altura fija. En
                vertical, Y es el eje principal y
                "positions[slot].y" es la altura real donde
                quedó parado en la columna; sin sumarla, cada
                elemento saltaría a "casi la misma altura" al
                entrar a "fichas" en vez de curvarse desde su
                propio lugar. En horizontal,
                positions[slot].y siempre es 0, así que da
                exactamente la base propia del elemento (ver
                "baseElemento" más arriba: el FIX del piso al
                100% — antes acá iba "restY", el peor caso
                global, que dejaba flotando a los elementos
                menos "profundos").
            */
            const xBase =
                ejePrincipal === "y"
                    ? positions[slot].x - pivotX
                    : positions[slot].x;

            const yBase =
                baseElemento + positions[slot].y;

            const finalX =
                xBase +
                (curvaX - xBase) *
                blend;

            const finalZ =
                positions[slot].z +
                (curvaZ - positions[slot].z) *
                blend;

            const finalY =
                yBase +
                (curvaY - yBase) *
                blend;

            cone.position.set(
                finalX, finalY, finalZ
            );

            // Orientación final: el quaternion TOTAL
            // (yaw+pitch, ya calculado arriba para poder
            // recalcular el offset de centrado). Se reusa
            // acá tal cual, para que position y orientación
            // queden siempre calculadas con la misma
            // rotación. cone.quaternion reemplaza a
            // cone.rotation.y como único lugar que escribe
            // la orientación de esta fase.
            cone.quaternion.copy(qTotal);


            // "diff"/"diffAbs"/"emphasis"/"opacityFinal" y
            // el update de
            // "mejorSlot"/"mejorDiffAbs"/"diffPorSlot" ya se
            // calcularon arriba (antes del bloque de
            // pivot/offsetWorld). Acá solo queda aplicar
            // posición/orientación al objeto (arriba) — la
            // escala ya no se anima en esta fase (ver
            // galeria-dolly-foco.js: el "acercamiento" del
            // elemento en foco ahora lo hace la cámara, no
            // el objeto), así que "cone.scale" ni se toca,
            // queda en su valor de construcción (1).

            // Efecto de opacidad DESACTIVADO: las geometrías
            // quedan siempre a opacidad plena. Ya no se
            // escribe "cone.material.opacity" en absoluto
            // (el proxy que lo resolvía se sacó de
            // galeria-escena.js, ver ese archivo): el material
            // nace en opacity 1 y nadie más la toca, así que
            // no hace falta reafirmarla acá. "opacityFinal" no
            // se borra más arriba porque panelOpacity (el
            // fundido del panel de texto) y focoWeights (las
            // luces, ver galeria-luces.js) siguen atados a
            // ese mismo número.

            rotationWeights[cupID] =
                emphasis * cfg.rotationScale * blend;

        });


        /*
            Histéresis del foco reportado — ver "HISTÉRESIS
            DEL FOCO" en la cabecera. No toca nada de lo ya
            calculado arriba (posición/escala/opacidad/
            rotationWeights siguen con el diffAbs crudo, que
            sí debe ser continuo cuadro a cuadro): solo decide
            qué slot se reporta como foco hacia afuera.

            MARGEN_HISTERESIS es una fracción de "anguloVecino"
            (no un radián fijo) para que la tolerancia se
            ajuste sola con la cantidad de elementos. 0.18
            (~18% del espaciado) es un valor de partida para
            ajustar a ojo: más alto, foco más "pegajoso".
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

            // El candidato ganador de este frame
            // (mejorDiffAbs) tiene que superar al foco actual
            // por más que el margen para desplazarlo — si no,
            // gana el foco previo, aunque en rigor ya no sea
            // el más cercano.
            if (
                mejorDiffAbs >=
                diffFocoActual - MARGEN_HISTERESIS
            ) {

                displayIndex = panelDisplayIndex;

            }

        }

        const elementoId = order[displayIndex];

        // El mismo "opacityFinal" que ya tiene, este mismo
        // frame, el elemento en foco (displayIndex) — no
        // "mejorSlot", que es el candidato puro sin
        // histéresis y puede no coincidir con lo que el
        // panel de texto está mostrando ahora. Con esto el
        // fade del panel queda atado al mismo número que
        // anima la opacidad de la geometría: llega a 1
        // exactamente cuando está centrada con su seam, y a
        // cfg.minOpacity en el punto medio entre dos
        // elementos — sin duración propia, sin
        // desincronización posible.
        const panelOpacity = opacityPorSlot[displayIndex];

        if (displayIndex !== panelDisplayIndex) {

            panelDisplayIndex = displayIndex;

            return {
                changed: true,
                displayIndex,
                elementoId,
                rotationWeights,
                focoWeights,
                panelOpacity,
                focoContinuo,
                blend,
                circuloCerrado,
                anclaPrincipalMundo,
                anclaMundoX
            };

        }

        return {
            changed: false,
            displayIndex,
            elementoId,
            rotationWeights,
            focoWeights,
            panelOpacity,
            focoContinuo,
            blend,
            circuloCerrado,
            anclaPrincipalMundo,
            anclaMundoX
        };

    }


    function reset() {

        panelDisplayIndex = -1;

        // La orientación (quaternion, yaw+pitch) es estado
        // que solo esta fase escribe — hay que devolverla a
        // identidad explícitamente al salir, o un cono queda
        // torcido/inclinado si el visitante vuelve a subir
        // el scroll hacia una fase que nunca la toca.
        // cone.quaternion.identity() limpia los dos ejes de
        // una.
        for (let id = 0; id < elementCount; id++) {

            cones[id].quaternion.identity();

        }

    }


    return { update, reset };

}
