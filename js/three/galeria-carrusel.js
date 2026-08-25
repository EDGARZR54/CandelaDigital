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

   La solución completa (indiceContinuo/targetU/
   pasoConDescanso — las tres funciones puras que
   reemplazan el ease parejo por una curva con paradas
   reales) se movió a galeria-carrusel-descanso.js, para
   no seguir engordando este archivo con matemática que
   no depende de THREE ni del resto del estado del
   carrusel — ver ese archivo para el detalle completo,
   incluida la explicación de "sFracUniformePorSlot" vs.
   "sFracBasePorSlot" que targetU() necesita.
================================================== */

import * as THREE from "three";
import { ease, smoothstep } from "./galeria-utils.js";
import {
    indiceContinuo, targetU, pasoConDescanso
} from "./galeria-carrusel-descanso.js";


const EPS = 0.00001;

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

        /*
            "seamOffset" ya no necesita ningún factor
            extra para los slots intermedios: eso era un
            parche para compensar que, antes del FIX en
            targetU()/pasoConDescanso() (ver ahí), el
            seam se autocancelaba en el punto de reposo
            de esos slots y no tenía efecto visual
            ninguno — duplicarlo era la única forma de
            notar "algo". Ahora que el seam sobrevive
            intacto en TODOS los slots (ancla, último e
            intermedios por igual), se vuelve a un único
            valor parejo — mismo criterio simple con el
            que ya funcionaban ancla/último. Se arma
            igual (un array por slot, no un escalar
            suelto) sólo para no tocar el resto del
            archivo, que ya espera "seamPorSlot[slot]" en
            el forEach de más abajo.
        */
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
            /*
                FIX (distribución uniforme, animada):
                pasoConDescanso ahora recibe
                sFracUniformePorSlot, no sFracBasePorSlot
                — durante TODO el tramo "rotar" theta ya
                está fijo en 2π, es decir blend=1 siempre
                (ver blend más abajo), así que el sFrac
                real de cada slot (forEach, más abajo) YA
                está fijo en sFracUniformePorSlot[slot].
                La meseta tiene que apuntar a ESE mismo
                valor —no al viejo centro físico— para
                seguir centrando exactamente en diff=0,
                mismo criterio que ya explica el comentario
                grande de targetU() más arriba (ahí
                reescrito para la fuente nueva).
            */
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

        /*
            FIX (panel de texto desincronizado de la
            geometría, bug reportado): se guarda también
            "opacityFinal" de CADA slot — el mismo número
            que ya gobierna "cone.material.opacity" más
            abajo, y que por construcción llega a 1
            exactamente cuando ese elemento está centrado
            con su seam (diffAbs=0, ver "emphasis" más
            abajo). Después del forEach se toma el valor
            del slot que termina en foco (displayIndex) y
            se lo expone en el resultado de update() como
            "panelOpacity" — así galeria.js puede fijar la
            opacidad del panel de texto con ESTE mismo
            número, en vez de una transición CSS de
            duración fija e independiente del scroll (ver
            ese fix en galeria.js).
        */
        const opacityPorSlot = {};

        let mejorSlot = 0;
        let mejorDiffAbs = Infinity;


        order.forEach((cupID, slot) => {

            /*
                FIX (distribución uniforme, animada):
                sFrac ya no es fijo — viaja de
                sFracBasePorSlot (el layout físico real,
                obligatorio en blend=0 para no romper la
                continuidad con la fila recta) hacia
                sFracUniformePorSlot (reparto parejo,
                slot/n) a medida que "blend" avanza de 0 a
                1 — el MISMO "blend" que ya interpola
                "longitudEfectiva" (radio) más arriba, así
                que ambos efectos (radio agrandándose +
                reparto emparejándose) quedan sincronizados
                en una sola animación, sin blend aparte.

                En blend=1 (círculo ya cerrado, todo el
                tramo "rotar") sFrac queda EXACTAMENTE en
                sFracUniformePorSlot[slot] — por eso
                targetU()/pasoConDescanso() más abajo
                también pasaron a medirse de
                sFracUniformePorSlot en vez de
                sFracBasePorSlot (ver ese cambio): si no,
                la meseta apuntaría al centro físico viejo
                mientras el elemento ya descansa en el
                ángulo parejo nuevo — mismo tipo de
                desalineación que el bug ya documentado
                más abajo, sólo que con las fuentes
                invertidas.
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
                FIX (adelantado desde donde vivía antes,
                justo después del forEach de
                posición/orientación): "diff"/"emphasis"/
                "scaleObjetivo"/"opacityObjetivo" sólo
                necesitan "sFrac" y "phi" (ya definidos
                arriba) más "blend" y "anguloVecino" (ya
                definidos ANTES del forEach) — no dependen
                de "outward", del quaternion ni del pivot,
                así que no hacía falta calcularlos después
                de esos. Se adelantan acá porque el fix de
                "offsetWorld" (más abajo) necesita conocer
                el factor de escala REAL del frame ANTES
                de rotar "pivotLocal" — ver ese comentario
                para el motivo completo.

                Distancia angular al foco (-π/2), envuelta
                a [-π, π] — el foco es siempre el MISMO
                ángulo fijo, sea cual sea "phi": por
                construcción, sFrac=0 (el ancla) cae justo
                ahí cuando phi=0, así que no hace falta
                ninguna vuelta previa antes de que el ancla
                sea la primera ficha en foco.

                OJO: se usa 2π·sFrac (el ángulo que cada
                elemento va a ocupar una vez el círculo YA
                esté formado), no "theta·sFrac" (el ángulo
                instantáneo de la curva, todavía a medio
                doblar) — ver el comentario original de
                este cálculo (más abajo, donde vivía antes)
                para la explicación completa de por qué.

                FIX (seam vs. foco real): "sFrac" ya trae
                sumado "seamAnimadoPorSlot[slot]" (ver
                arriba) — el corrimiento angular fijo que
                recentra la geometría respecto de su ancla
                (ver seamOffset en CONFIG). Ese corrimiento
                es deliberado para la POSICIÓN/orientación
                renderizada (por eso "sFrac" se usa tal
                cual en puntoYOutward(), arriba), pero acá
                mediríamos distancia al ángulo crudo -π/2
                — que YA NO es el punto de reposo real
                desde el fix de targetU()/pasoConDescanso()
                (ver esas funciones): ahora "phi" en reposo
                sólo cancela la parte de "sFrac" SIN seam,
                dejando a propósito un resto de exactamente
                2π·seamAnimadoPorSlot[slot] en el ángulo
                final. Sin restar ese mismo resto acá,
                "diffAbs" nunca llegaba a 0 en el punto en
                el que el elemento realmente está quieto y
                centrado en pantalla —el pico de
                "emphasis"/opacidad/scaleBump (más abajo)
                y el cambio de "mejorSlot"/displayIndex
                quedaban corridos "rangoPhi" de scroll
                respecto de la meseta real, en vez de
                coincidir con ella (reportado: "la opacidad
                al 100% no está sincronizada con el
                descanso"). Al restar el mismo
                "seamAnimadoPorSlot[slot]" que ya sumó
                "sFrac", queda una cuenta relativa al punto
                de reposo real —0 exactamente ahí—, sin
                afectar en nada la posición/orientación
                renderizada (esa sigue usando "sFrac" tal
                cual, sin este ajuste).
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

            /*
                FIX ("geometría anclada en el extremo
                izquierdo" en elementos intermedios, bug
                reportado): factor de escala REAL que
                "cone.scale.setScalar" va a aplicar este
                frame — se calcula ACÁ (no más abajo, junto
                a esa línea) porque "offsetWorld" lo
                necesita ANTES de rotar "pivotLocal" — ver
                ese comentario para el porqué completo. Se
                reusa tal cual más abajo, en vez de
                recalcularlo, para que no puedan
                desincronizarse.
            */
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

                FIX ("geometría anclada en el extremo
                izquierdo" en elementos intermedios, bug
                reportado): antes, este vector se rotaba
                SIN escalar — pero Three.js compone el
                centroide en mundo como "position +
                quaternion·(scale ⊙ pivotLocal)", no
                "position + quaternion·pivotLocal". Como
                "cone.position" se fija asumiendo scale=1
                (más abajo, vía "curvaX/Y/Z"), y
                "cone.scale" después pasa a valer
                "scaleFinal" (≠1 en cualquier elemento con
                algo de "emphasis"), el centroide real
                terminaba en:

                  centroReal = centroObjetivo +
                               offsetWorld·(scaleFinal-1)

                — un corrimiento hacia el origen del mesh
                (el ancla frontal/base) proporcional a
                cuánto creciera el objeto. Como "emphasis"
                (y por lo tanto "scaleFinal") llega a su
                pico exactamente en diffAbs≈0 —el foco
                perfecto—, el corrimiento era MÁS visible
                justo en el elemento mejor centrado
                angularmente, no menos: por eso se veía en
                los intermedios (que sí llegan a
                diffAbs≈0 con el seamOffset actual) y no
                en ancla/último real (que se quedan con un
                diffAbs residual — ver targetU() más
                arriba— y por lo tanto con "emphasis" algo
                por debajo del máximo).

                Escalar "pivotLocal" acá por "scaleFinal"
                ANTES de rotarlo hace que "offsetWorld"
                describa el vector centro->origen del mesh
                YA CONSIDERANDO cuánto va a crecer el
                objeto este frame, así "curvaX/Y/Z" (más
                abajo) calculan la posición de origen que
                realmente deja al centroide YA ESCALADO
                exactamente sobre el punto de la curva —
                sea cual sea "scaleFinal". Con
                scaleFinal=1 (elemento sin ningún
                "emphasis") da exactamente lo mismo que
                antes: no rompe el caso ya andaba bien.
            */
            pivotLocal.set(pivotX, pivotY, pivotZ);
            pivotLocal.multiplyScalar(scaleFinal);
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
                "diff"/"diffAbs"/"emphasis"/"scaleFinal"/
                "opacityFinal" y el update de
                "mejorSlot"/"mejorDiffAbs"/"diffPorSlot"
                ya se calcularon arriba (antes del bloque
                de pivot/offsetWorld) — ver ese comentario
                para el porqué del reordenamiento. Acá
                sólo queda APLICARLOS al objeto:
            */
            cone.scale.setScalar(scaleFinal);

            cone.material.opacity = opacityFinal;

            rotationWeights[cupID] =
                emphasis * cfg.rotationScale * blend;

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
            "panelOpacity": el mismo "opacityFinal" que ya
            tiene, este mismo frame, el elemento que quedó
            en foco (displayIndex) — no "mejorSlot", que es
            el candidato puro sin histéresis y puede no
            coincidir con lo que el panel de texto está
            mostrando ahora mismo. Con esto el fade del
            panel queda matemáticamente atado al mismo
            número que ya anima la opacidad de la
            geometría: llega a 1 exactamente cuando la
            geometría está centrada con su seam, y a
            cfg.minOpacity en el punto medio entre dos
            elementos — sin duración propia, sin
            desincronización posible.
        */
        const panelOpacity = opacityPorSlot[displayIndex];

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
