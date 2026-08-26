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

   PENDIENTE DE CALIBRAR A OJO (no es un bug, es una
   convención que solo se confirma mirando la escena real):
   el signo de "rotationY = atan2(outward.x, outward.z)"
   puede necesitar el signo opuesto, o un +π, según cómo
   esté orientada la cara "frontal" real de cada geometría.

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
   círculo, a restY constante.

   HISTÉRESIS DEL FOCO (displayIndex): "mejorSlot" (el
   vecino angular más cercano al punto de foco) es un
   cálculo continuo y sin margen, correcto para todo lo que
   se anima en base a él (escala/opacidad/rotationWeights,
   que sí deben reaccionar de forma continua) pero es el
   punto ciego para decidir qué elemento es "el foco" de
   cara afuera: justo en el ángulo medio entre dos
   elementos, un scroll de un pixel puede hacer oscilar el
   foco reportado de un lado a otro — y como cada cambio de
   foco dispara updatePanel() en galeria.js, esa oscilación
   se siente como parpadeo. La solución es una zona muerta
   angular alrededor del punto de cruce, solo para esta
   decisión puntual: el foco previo se queda fijo hasta que
   el candidato nuevo gana por más que MARGEN_HISTERESIS —
   ver el cálculo de "displayIndex" en update(), después del
   forEach principal.

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
        getManualOffset = () => ({ yaw: 0, pitch: 0 })
    }
) {

    const cfg = config.carousel;

    let panelDisplayIndex = -1;

    // Última foto de update(), para inspeccionar desde la
    // consola sin loguear cada frame ("rotar" corre 60
    // veces por segundo). Se pisa en cada llamada; debug()
    // al final del archivo solo imprime lo último que haya.
    let ultimoDebug = null;


    function update(t) {

        const order = getOrder();
        const positions = getPositions();
        const n = elementCount;

        if (n === 0) {

            return {
                changed: false,
                rotationWeights: {},
                panelOpacity: 0,
                focoContinuo: 0
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
        const sFracBasePorSlot =
            positions.map(
                pos =>
                    (pos.x - anclaPos.x) / sFracDenom
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
            "focoContinuo": índice 0..(huecosReales)
            continuo, EXACTAMENTE 0 en el elemento del
            slot 0 y EXACTAMENTE huecosReales (=n-1) en el
            último — con la MISMA meseta/transición que ya
            gobierna phi (ver indiceContinuo() más arriba
            y el fix junto a "panelOpacity": mismo
            criterio, "atar al número que ya existe" en
            vez de recalcular uno aparte). Lo consume
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
            (sFrac, ver más abajo) "seamOffset" hacia el
            extremo libre, la MISMA fracción para todos
            los elementos por igual (ver "seamPorSlot"
            más arriba, junto a theta/phi — se sigue
            armando como array por slot para no tocar el
            resto del archivo, pero todos sus valores son
            iguales a "seamOffset"). Sirve para recentrar
            la geometría destacada respecto del punto de
            foco fijo (-π/2), sin tener que tocar ese
            punto de foco ni la lógica de "quién está en
            foco" (diff, más abajo) por separado — como
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

            "seamPorSlot" ya se armó más arriba (antes del
            bloque de theta/phi, junto a "seamOffset") —
            acá solo falta blendearlo por slot, que sí
            depende de "blend" y por eso no podía
            adelantarse con el resto.
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

            const { x, z, outward } =
                puntoYOutward(sFrac);


            /*
                "diff"/"emphasis"/"scaleObjetivo"/
                "opacityObjetivo" solo necesitan "sFrac" y
                "phi" (ya definidos arriba) más "blend" y
                "anguloVecino" (ya definidos antes del
                forEach) — no dependen de "outward", del
                quaternion ni del pivot. Se calculan acá
                (antes de rotar "pivotLocal" más abajo)
                porque ese paso necesita conocer el factor
                de escala real del frame primero.

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
                "emphasis"/opacidad/scaleBump y el cambio de
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
                (círculo completo) — cuánto bump de
                escala/opacidad/rotación le toca a este
                elemento si el círculo estuviera totalmente
                formado. Igual que la posición, no se
                aplica de golpe: crece de 0 a 1 recién con
                el círculo ya cerrado (blend), así el ajuste
                queda disimulado dentro del propio tramo
                "formar" en vez de saltar de una vez.
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

            // Factor de escala REAL que
            // "cone.scale.setScalar" va a aplicar este frame
            // — se calcula acá (no junto a esa línea, más
            // abajo) porque "offsetWorld" lo necesita antes
            // de rotar "pivotLocal" (ver ese comentario). Se
            // reusa tal cual más abajo, sin recalcularlo.
            const scaleFinal =
                1 + (scaleObjetivo - 1) * blend;

            const opacityFinal =
                1 + (opacityObjetivo - 1) * blend;

            opacityPorSlot[slot] = opacityFinal;


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
                (ancla frontal/base) al centroide real, en
                espacio LOCAL del objeto — fijo, no depende
                de la rotación. offsetWorld es ese mismo
                vector llevado a espacio de mundo aplicándole
                qTotal: cuánto hay que correr el origen del
                mesh, respecto del centroide, para que el
                centroide termine exactamente donde tiene que
                estar. Con pitch=0 esto da lo mismo que antes
                en X/Z, y en Y da 0 (una rotación pura sobre Y
                nunca cambia la componente Y de un vector), así
                que "restY" sigue siendo la altura correcta del
                origen del mesh.

                Se escala "pivotLocal" por "scaleFinal" ANTES
                de rotarlo: Three.js compone el centroide en
                mundo como "position + quaternion·(scale ⊙
                pivotLocal)", no "position + quaternion·
                pivotLocal". Como "cone.position" se fija
                asumiendo scale=1 (más abajo, vía
                "curvaX/Y/Z") y "cone.scale" pasa a valer
                "scaleFinal" (≠1 en cualquier elemento con
                algo de "emphasis"), sin este escalado previo
                el centroide real terminaría en:

                  centroReal = centroObjetivo +
                               offsetWorld·(scaleFinal-1)

                — un corrimiento hacia el origen del mesh
                proporcional a cuánto creciera el objeto, más
                visible justo en el elemento mejor centrado
                angularmente (donde "emphasis"/"scaleFinal"
                llegan a su pico). Escalar "pivotLocal" acá
                por "scaleFinal" antes de rotarlo hace que
                "offsetWorld" ya considere cuánto va a crecer
                el objeto este frame, así "curvaX/Y/Z" calculan
                la posición de origen que deja al centroide ya
                escalado exactamente sobre el punto de la
                curva, sea cual sea "scaleFinal". Con
                scaleFinal=1 da exactamente lo mismo que sin
                este ajuste.
            */
            pivotLocal.set(pivotX, pivotY, pivotZ);
            pivotLocal.multiplyScalar(scaleFinal);
            offsetWorld
                .copy(pivotLocal)
                .applyQuaternion(qTotal);

            const cone = cones[cupID];

            // El offset de centrado (arriba) no se aplica de
            // golpe: en theta=0 tiene que dar exactamente
            // "positions[slot]" —el mismo lugar plano donde
            // "orden"/"revelado" dejaron a cada elemento— o
            // se ve un salto al entrar a "fichas". Se
            // interpola desde esa posición plana hacia la
            // posición centrada-sobre-la-curva con un blend
            // atado a "theta" mismo (0 en theta=0, 1 con el
            // círculo ya cerrado). El eje Y entra al mismo
            // blend por la misma razón: el arrastre vertical
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

            // Orientación final: el quaternion TOTAL
            // (yaw+pitch, ya calculado arriba para poder
            // recalcular el offset de centrado). Se reusa
            // acá tal cual, para que position y orientación
            // queden siempre calculadas con la misma
            // rotación. cone.quaternion reemplaza a
            // cone.rotation.y como único lugar que escribe
            // la orientación de esta fase.
            cone.quaternion.copy(qTotal);


            // "diff"/"diffAbs"/"emphasis"/"scaleFinal"/
            // "opacityFinal" y el update de
            // "mejorSlot"/"mejorDiffAbs"/"diffPorSlot" ya se
            // calcularon arriba (antes del bloque de
            // pivot/offsetWorld). Acá solo queda aplicarlos
            // al objeto:
            cone.scale.setScalar(scaleFinal);

            cone.material.opacity = opacityFinal;

            rotationWeights[cupID] =
                emphasis * cfg.rotationScale * blend;

        });


        /*
            "mejorSlot" (arriba) es el vecino más cercano
            PURO — sin margen, cambia apenas otro slot queda
            una fracción de radián más cerca. Justo en el
            ángulo medio entre dos elementos, cualquier
            microscroll (inercia de trackpad, rueda con
            redondeo) puede hacer que "mejorSlot" oscile de
            un lado a otro del umbral, y como
            panelDisplayIndex dispara updatePanel() en
            galeria.js (swap de ficha, re-medición de
            paneles, fundido), esa oscilación se siente como
            un parpadeo.

            La HISTÉRESIS de acá abajo no toca "mejorSlot" ni
            nada de lo ya calculado arriba (posición, escala,
            opacidad, rotationWeights siguen usando el
            diffAbs crudo de cada elemento: esas sí tienen
            que ser continuas cuadro a cuadro) — solo decide,
            aparte, cuál es el slot que se reporta como
            "foco" hacia afuera (displayIndex/changed), con
            una zona muerta alrededor del punto de cruce: el
            foco previo (panelDisplayIndex) se queda quieto
            hasta que el candidato nuevo gana por más que
            MARGEN_HISTERESIS, no por cualquier epsilon.

            MARGEN_HISTERESIS se expresa como fracción de
            "anguloVecino" (el espaciado angular real entre
            elementos vecinos) en vez de un radián fijo, para
            que la tolerancia se ajuste sola sea cual sea la
            cantidad de elementos.

            0.18 (~18% del espaciado a cada elemento) es un
            valor de partida para ajustar a ojo: más alto,
            más "pegajoso" el foco (tarda más en soltar); más
            bajo, más parecido al comportamiento sin
            histéresis.
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

        // Snapshot de este frame, para debug() al final del
        // archivo. "targets" es un array de {slot, u,
        // phiDeg} — el punto exacto (en grados) donde cada
        // slot queda centrado según la corrección de seam
        // vigente.
        ultimoDebug = {
            t, rotateT, phi,
            phiDeg: phi * 180 / Math.PI,
            n, huecosReales,
            seamOffset,
            mejorSlot, mejorDiffAbs,
            mejorDiffAbsDeg: mejorDiffAbs * 180 / Math.PI,
            panelDisplayIndex, displayIndex,
            panelOpacity,
            focoContinuo,
            targets: Array.from(
                { length: huecosReales + 1 },
                (_, k) => {

                    const u =
                        targetU(
                            k, huecosReales,
                            rangoPhi, sFracUniformePorSlot
                        );

                    return {
                        slot: k,
                        sFracBase: sFracBasePorSlot[k],
                        sFracUniforme: sFracUniformePorSlot[k],
                        seamAplicado: seamPorSlot[k],
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
                rotationWeights,
                panelOpacity,
                focoContinuo
            };

        }

        return {
            changed: false,
            displayIndex,
            elementoId,
            rotationWeights,
            panelOpacity,
            focoContinuo
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
