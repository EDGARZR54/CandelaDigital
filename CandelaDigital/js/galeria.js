/* ==================================================
   galeria.js

   Punto de entrada de la página. Carga los elementos
   desde el GeoJSON (galeria-datos.js + el adaptador
   de galeria-config.js), arma los botones del GUI a
   partir de CONFIG, conecta los controladores de cada
   fase (hero / proyecto / revelado / orden / fichas)
   y corre el loop de render.

   El recorrido de scroll tiene 5 tramos consecutivos
   (ver galeria-fases.js):

     hero      - Fundido del texto principal.
     proyecto  - "El proyecto" + cifras (mismo
                 contenido que la sección homónima de
                 index.html): la fila de conos queda
                 quieta, el único visible gira sobre
                 sí mismo por tiempo real (ver
                 galeria-proyecto.js) — el giro en
                 realidad arranca desde antes, en la
                 fase "hero", y se corta recién acá
                 al pasar a "revelado".
     revelado  - Cascada: el resto de los elementos
                 sube hasta su lugar. Arranca desde
                 cero recién acá (corte limpio: no
                 empieza a subir nada mientras se lee
                 "El proyecto").
     orden     - Pausa + GUI para reordenar.
     fichas    - Scroll horizontal / spotlight.

   El texto del hero (título/eyebrow/descripción) NO
   lo arma este archivo: vive fijo en galeria.html,
   mismo texto y mismas clases que el hero de
   index.html — así es seleccionable, está disponible
   sin JS, y no hace falta duplicarlo acá. Lo único que
   este archivo sigue haciendo con "hero" es mostrarlo/
   ocultarlo (opacity) según la fase de scroll.

   Además dimensiona #galeria-spacer (el bloque real
   que reserva, en el documento, el espacio de scroll
   de las 5 fases + liberación) y, al llegar a la
   fase D, "suelta" #galeria-escena-fija (ver
   galeria.css) para que el <footer> real quede visible
   sin taparlo.

   El fondo/niebla/mesa de la escena 3D siguen el tema
   claro/oscuro del sitio (ver colorFondoEscena() /
   colorMesaEscena() en galeria-escena.js) y se
   recalculan en vivo con un MutationObserver si el
   visitante cambia el tema sin recargar la página —
   el texto que va encima (hero, ficha, GUI) sigue el
   mismo tema a través de las variables CSS normales
   (ver css/pages/galeria.css), así que todo cambia en
   conjunto.
================================================== */

import { CONFIG } from "./three/galeria-config.js";
import { cargarElementos } from "./three/galeria-datos.js";
import { createScene } from "./three/galeria-escena.js";
import { createPhaseController } from "./three/galeria-fases.js";
/*
    Punto único de lectura de window.scrollY para toda
    la página (ver ese archivo) — a partir de acá,
    galeria.js tampoco lee "window.scrollY" por su
    cuenta, para quedar en sincro con galeria-fases.js y
    galeria-interaccion-ficha.js dentro del mismo frame.
*/
import { getScrollY } from "./three/galeria-scroll.js";
import {
    createRevealController,
    heroFadeEnvelope
} from "./three/galeria-revelado.js";
import { createProjectController } from "./three/galeria-proyecto.js";
import { createRotationController } from "./three/galeria-rotacion.js";
import { createReorderController } from "./three/galeria-reordenar.js";
import { createCarouselController } from "./three/galeria-carrusel.js";
import { createInteraccionFicha } from "./three/galeria-interaccion-ficha.js";
import { createParamPanel } from "./three/galeria-panel-parametros.js";
import { createMaterialPanel } from "./three/galeria-panel-material.js";
import {
    calcularDimensionesFicha,
    renderizarFicha,
    calcularDimensionesCampos,
    renderizarCampos
} from "./three/galeria-ficha.js";


async function initGaleria() {

    const galeriaFija =
        document.getElementById(
            "galeria-escena-fija"
        );

    const spacer =
        document.getElementById(
            "galeria-spacer"
        );

    const sceneContainer =
        document.getElementById("scene");

    const hero =
        document.getElementById("hero");

    /*
        ".hero__texto" es quien reactiva
        pointer-events:auto en galeria.css (para que el
        título/descripción sea seleccionable durante la
        fase "hero") — "#hero" mismo se queda en "none".
        Por eso apagar el pointer-events real cuando el
        hero se oculta hay que hacerlo ACÁ, no en "hero"
        (ver fijarOpacidadPanel más abajo): un
        pointer-events puesto en el contenedor no pisa
        la regla explícita del hijo.
    */
    const heroTexto =
        hero.querySelector(".hero__texto");

    const proyectoPanel =
        document.getElementById("proyecto");

    /*
        Mismo caso que "heroTexto": "#proyecto
        .contenedor" es quien reactiva pointer-events,
        no "#proyecto" mismo.
    */
    const proyectoContenedor =
        proyectoPanel.querySelector(".contenedor");

    /*
        hero/proyecto quedan "clavados" (position:
        absolute) sobre TODA la ventana, en un z-index
        (4) por encima de "#scene" — su opacidad llega a
        0 en cuanto se sale de su fase, pero
        opacity:0 NO apaga pointer-events: el bloque de
        texto reactivado (heroTexto/proyectoContenedor,
        ver arriba) seguía robándole el clic al canvas
        de más abajo en TODAS las demás fases, "fichas"
        incluida — el arrastre para rotar la geometría en
        foco (ver galeria-interaccion-ficha.js) nunca le
        llegaba al raycaster porque el pointerdown se
        quedaba en este bloque invisible antes de tocar
        el <canvas> (bug reportado: "no me deja rotar").

        Esta única función reemplaza toda asignación
        directa de "<panel>.style.opacity" de acá en
        adelante, así opacidad y pointer-events viajan
        siempre juntos y no puede repetirse el mismo bug
        en otro lado si se agrega una fase nueva.
    */
    function fijarOpacidadPanel(
        panel, elementoInteractivo, opacidad
    ) {

        panel.style.opacity = opacidad;

        elementoInteractivo.style.pointerEvents =
            opacidad > 0 ? "auto" : "none";

    }

    const proyectoCifraCascarones =
        document.getElementById(
            "proyecto-cifra-cascarones"
        );

    const gui =
        document.getElementById("gui");

    const carouselPanel =
        document.getElementById("carousel-panel");

    const panelIndex =
        document.getElementById("panel-index");

    const panelNombre =
        document.getElementById("panel-nombre");

    const panelSubtitulo =
        document.getElementById("panel-subtitulo");

    const panelFicha =
        document.getElementById("panel-ficha");

    /*
        Panel derecho de la ficha (coordenadas +
        ubicación desglosada, ver "#ficha-panel-marco" en
        galeria.css / "panelDerecho" en galeria-config.js).
        Mismo patrón de medición que "panelFicha" —ver
        "dimensionesPanelDerecho" más abajo— pero con las
        funciones GENÉRICAS de galeria-ficha.js
        (calcularDimensionesCampos/renderizarCampos), ya
        que este panel no tiene nombre/subtítulo propios,
        solo la lista de campos.
    */
    const panelDerechoSpecs =
        document.getElementById(
            "panel-derecho-specs"
        );

    const panelParametrosContainer =
        document.getElementById("panel-parametros");

    const panelMaterialContainer =
        document.getElementById("panel-material");

    const scrollHint =
        document.getElementById("scroll-hint");


    let elementos;

    try {

        elementos =
            await cargarElementos(
                CONFIG.dataUrl,
                CONFIG.normalizarElemento
            );

    } catch (err) {

        console.error(
            "galeria.js: no se pudieron cargar " +
            "los elementos:", err
        );

        sceneContainer.textContent =
            "No se pudieron cargar los datos " +
            "(" + CONFIG.dataUrl + ").";

        return;

    }


    if (elementos.length === 0) {

        sceneContainer.textContent =
            CONFIG.dataUrl +
            " no tiene elementos.";

        return;

    }


    const elementCount = elementos.length;

    /*
        El "6" de "Cascarones documentados" en la
        fase "proyecto" sale del GeoJSON real (mismo
        criterio que usa el resto de la galería, ver
        ficha/fichas): así nunca se desincroniza si el
        corpus crece. Los otros datos de esa sección
        (estados, técnicas de captura) no dependen del
        motor y se quedan fijos directo en el HTML.
    */

    if (proyectoCifraCascarones) {

        proyectoCifraCascarones.textContent =
            String(elementCount);

    }


    /*
        Se mide al cargar, con los elementos reales,
        cuál es el ancho/alto máximo que necesita cada
        campo de la ficha entre todos ellos. El panel
        todavía está con opacidad 0 (recién arrancamos
        en la fase A), así que esto no se alcanza a ver.

        "let", no "const": esta medida queda atada al
        tamaño de fuente vigente en ESE momento (el
        nombre usa clamp(...vw...), así que su ancho
        natural depende del viewport al medir). Si el
        visitante rota el celular después, el tamaño de
        fuente cambia pero el ancho fijo quedaba
        desactualizado — la ficha terminaba necesitando
        más líneas de las previstas y, por lo tanto, más
        alto del que en verdad hace falta (de ahí el
        scroll que apareció en horizontal). remedirFicha()
        (más abajo, se llama en cada resize) vuelve a
        calcular esto para el viewport ACTUAL, así el
        ancho fijo y el tamaño de fuente renderizado
        nunca quedan desalineados — la ficha entra sin
        necesitar scroll en cualquier orientación, igual
        que en la carga original.
    */

    /*
        Tope de ancho por campo de specs (superficie,
        altura, estado, etc.), pensado para el viewport
        ACTUAL — no el default fijo de 260px que usa
        galeria-ficha.js el resto del tiempo.

        En retrato (o cualquier pantalla con alto de
        sobra) no hace falta tocar nada: hay lugar de
        sobra para que las specs envuelvan en varias
        filas con su ancho natural, así que se devuelve
        "undefined" y calcularDimensionesFicha usa su
        propio default.

        En horizontal de celular el alto es el recurso
        escaso (ver el media query de #carousel-panel en
        galeria.css): ahí SÍ hace falta que las specs
        entren en una sola fila, así que el tope de cada
        columna se calcula para que TODAS quepan lado a
        lado en el ancho disponible — en vez de dejar que
        cada una pida el ancho que quiera y que el
        sobrante envuelva a una fila que después
        max-height recorta.

        GAP/MARGEN_LATERAL acá abajo replican los valores
        reales que usa el CSS en ese mismo breakpoint
        (gap de #carousel-panel .specs, y el padding
        inline aproximado de .contenedor) — si alguno de
        esos cambia en galeria.css, conviene actualizar
        acá también para que el cálculo siga siendo
        preciso.
    */

    const ESPACIO_LATERAL_FICHA = 48;
    const GAP_SPECS_HORIZONTAL = 16;
    const ANCHO_MINIMO_CAMPO = 64;

    function calcularAnchoMaximoCampo() {

        const esHorizontalBajo =
            window.matchMedia(
                "(max-height: 500px) " +
                "and (orientation: landscape)"
            ).matches;

        if (!esHorizontalBajo) return undefined;


        const numCampos =
            elementos[0]?.ficha?.length || 1;

        const anchoDisponible =
            window.innerWidth -
            ESPACIO_LATERAL_FICHA;

        const anchoPorCampo =
            (
                anchoDisponible -
                GAP_SPECS_HORIZONTAL * (numCampos - 1)
            ) / numCampos;

        return Math.max(
            ANCHO_MINIMO_CAMPO,
            Math.min(260, anchoPorCampo)
        );

    }


    let dimensionesFicha =
        calcularDimensionesFicha(
            elementos,
            { panelNombre, panelSubtitulo, panelFicha },
            { anchoMaximoCampo: calcularAnchoMaximoCampo() }
        );

    /*
        Mismo criterio que "dimensionesFicha" (ver el
        comentario grande de arriba), pero con la versión
        GENÉRICA: "panelDerecho" no tiene nombre/subtítulo
        propios, así que calcularDimensionesCampos() solo
        necesita el array de campos + UN contenedor de
        medición.

        Se mide contra "panelDerechoSpecs" mismo (no un
        contenedor descartable aparte): es el mismo truco
        que ya usa "panelFicha" arriba — funciona porque el
        panel entero está en opacidad 0 en este punto de la
        carga (todavía en la fase "hero"), así que pintar y
        borrar contenido "de paso" ahí no se alcanza a ver.

        Sin "anchoMaximoCampo" propio a propósito: el
        breakpoint donde esa función SÍ hace falta
        (horizontal de celular bajo, ver
        calcularAnchoMaximoCampo() arriba) es EXACTAMENTE
        el mismo breakpoint donde "#ficha-panel-marco" ya
        se oculta por completo (ver galeria.css) — no hay
        ancho que ajustar para un panel que no se ve ahí.
    */
    let dimensionesPanelDerecho =
        calcularDimensionesCampos(
            elementos,
            "panelDerecho",
            panelDerechoSpecs
        );

    /*
        calcularAnchoMaximoCampo() (arriba) sólo mira el
        ANCHO: angosta cada columna de specs para que
        entren todas en una fila. Pero angostar una
        columna puede hacer que un valor con texto largo
        (el JSON no garantiza cuántas líneas/párrafos
        tiene cada campo) necesite MÁS líneas para entrar
        en ese ancho — es decir, más alto.

        Esta función se apoya en algo que YA hace
        renderizarFicha() (galeria-ficha.js): aplica
        minHeight con el PEOR CASO —el contenido MÁS
        LARGO entre TODOS los elementos del GeoJSON, no
        solo el que está activo ahora— a cada campo. Eso
        significa que, apenas se pinta cualquier elemento,
        el panel YA está ocupando el alto máximo real que
        vaya a necesitar en toda la sesión, sin importar
        cuál esté a la vista.

        Por eso, en vez de sumar a mano paddings/márgenes
        estimados (frágil: cualquier ajuste de CSS futuro
        rompe la cuenta en silencio), se mide directo del
        DOM ya renderizado: carouselPanel.scrollHeight es
        el alto real total del contenido, ya con todos los
        márgenes/paddings tal cual el navegador los aplicó
        — scrollHeight además ignora cualquier recorte por
        overflow/max-height ya aplicado, así que da el
        mismo número exista o no un límite vigente.

        Se llama tanto desde remedirFicha() (cubre
        resize/rotación) como al final de updatePanel()
        (cubre entrar a la fase "fichas" por primera vez
        SIN pasar por un resize) — así siempre hay una
        medición real y actualizada antes de fijar
        max-height.
    */

    const ALTO_MAXIMO_FICHA_VH_BASE = 58;
    const ALTO_MAXIMO_FICHA_VH_TECHO = 82;

    function ajustarAltoFichaSegunContenido() {

        const esHorizontalBajo =
            window.matchMedia(
                "(max-height: 500px) " +
                "and (orientation: landscape)"
            ).matches;

        if (!esHorizontalBajo) {

            /*
                Fuera de ese breakpoint no hay que forzar
                nada: se limpia cualquier max-height
                inline que hubiera quedado de una rotación
                anterior, y manda de nuevo el CSS normal
                (sin tope, hay alto de sobra).
            */
            carouselPanel.style.maxHeight = "";
            return;

        }


        const altoContenido =
            carouselPanel.scrollHeight;

        const altoBasePx =
            window.innerHeight *
            (ALTO_MAXIMO_FICHA_VH_BASE / 100);

        const altoTechoPx =
            window.innerHeight *
            (ALTO_MAXIMO_FICHA_VH_TECHO / 100);

        const altoFinal =
            Math.min(
                altoTechoPx,
                Math.max(altoBasePx, altoContenido)
            );

        carouselPanel.style.maxHeight =
            altoFinal + "px";

    }

    ajustarAltoFichaSegunContenido();

    /*
        Elemento actualmente mostrado en la ficha (o
        null si todavía no se mostró ninguno): lo
        necesita remedirFicha() para poder re-pintar el
        contenido real después de recalcular
        dimensionesFicha en un resize — sin esto, tras
        rotar el celular la ficha quedaría con las
        medidas nuevas pero mostrando el contenido de
        measurement leftover, o directamente en blanco.
    */

    let elementoIdActual = null;
    let displayIndexActual = null;


    /*
        createScene ahora es async: cada elemento
        importa su propio módulo procedural (ver
        galeria-escena.js) antes de poder armar la
        escena completa.
    */

    const {
        scene,
        camera,
        renderer,
        cones,
        computeRowPositions,
        restY,
        bboxesPorIndice,
        resize,
        computeLookAtX,
        setLookAtX,
        setCameraLado,
        actualizarCajasDebug,
        actualizarColoresTema,
        getHiddenDrop,
        getRowBottomScreenY,
        actualizarHiddenDropParaOrden
    } = await createScene(
        sceneContainer, elementos, CONFIG
    );


    const phases =
        createPhaseController(
            CONFIG, elementCount
        );


    /*
        Aplica el presupuesto de scroll (las 5 fases) como
        alto real de #galeria-spacer — eso es lo que
        empuja al <footer> hasta el final del
        recorrido. Antes esto era
        "document.body.style.height = ...", puesto a
        mano; ahora surge solo del flujo normal del
        documento (espaciador + footer).

        Se le suma UN alto de ventana extra: cuando
        #galeria-escena-fija se libera (fase D, ver
        más abajo) queda "parada" en top = total de
        de las 5 fases, pero al ser position:absolute ya NO
        empuja al <footer> en el flujo — si el
        espaciador terminara justo ahí, el footer
        aparecería sobrepuesto al último cascarón en
        vez de dejarlo terminar de deslizarse fuera de
        vista. Este viewport extra es exactamente el
        tramo de scroll que le toma a la escena
        liberada (alta 100vh) desaparecer del todo
        antes de que el footer, que empieza justo
        después de este espaciador, entre en pantalla.
    */

    function ajustarAltoScroll() {

        phases.updateScrollHeight();

        const total =
            phases.getScrollBudget().total;

        spacer.style.height =
            (total + window.innerHeight) + "px";

    }

    ajustarAltoScroll();


    /*
        Si el visitante alterna el tema (botón del
        navbar, ver js/navbar.js) mientras está en
        esta página, el fondo/niebla/mesa de la
        escena 3D se recalculan en vivo — mismo
        patrón que usa js/fondo-3d.js en index.html
        para su fondo decorativo.
    */

    const observadorTema =
        new MutationObserver(
            actualizarColoresTema
        );

    observadorTema.observe(
        document.documentElement,
        { attributes: true, attributeFilter: ['data-tema'] }
    );


    const reorder =
        createReorderController(
            CONFIG,
            {
                cones, computeRowPositions, elementos, restY,
                computeLookAtX, setLookAtX,
                actualizarCajasDebug,
                /*
                    FIX: sin esto, hiddenDropActual/
                    filaBottomNdcYActual (galeria-escena.js)
                    quedaban calculados para el order CRUDO
                    para siempre, sin importar qué tan seguido
                    se reordenara — ver el comentario grande
                    junto a computePuntosSuperioresFila en
                    galeria-escena.js.
                */
                actualizarHiddenDrop: actualizarHiddenDropParaOrden
            }
        );

    const reveal =
        createRevealController(
            CONFIG,
            {
                cones,
                getPositions: reorder.getPositions,
                elementCount,
                restY,
                getOrder: reorder.getOrder,
                getHiddenDrop
            }
        );

    /*
        Id (índice en "cones"/"elementos") del cono
        visible desde el arranque — el que gira a peso
        pleno durante "hero"/"proyecto". Se recalcula
        en cada llamada, no se cachea, por la misma
        razón que antes vivía dentro de
        galeria-proyecto.js: no depender de que el
        reordenamiento siga corriendo después de estas
        fases.
    */
    function heroConeId() {

        return reorder.getOrder()[
            reveal.getHeroSlot()
        ];

    }


    /*
        Id del cono en el slot 0 del "order" vigente:
        es el PRIMERO que se destaca al entrar a
        "fichas" (activeIndex arranca en 0 — ver
        galeria-carrusel.js). Se usa para que, durante
        la pausa de "orden", este cono no llegue a
        detenerse del todo: como de cualquier forma
        retoma el mismo peso apenas arranca "fichas",
        cortarlo en la pausa sólo para volver a
        acelerarlo dos segundos después se veía como
        un tropiezo, no como un descanso.
    */
    function primerFichaConeId() {

        return reorder.getOrder()[0];

    }


    /*
        Id del cono en el ÚLTIMO slot: es el que queda
        destacado al terminar "fichas" (activeIndex
        llega a n-1 — ver galeria-carrusel.js) y el
        mismo que, por la razón de arriba, sigue
        girando un rato más durante la fase "final"
        mientras la escena termina de deslizarse fuera
        de vista.
    */
    function ultimoFichaConeId() {

        return reorder.getOrder()[elementCount - 1];

    }


    const proyecto =
        createProjectController(CONFIG);

    /*
        Controlador único de autorotación (ver
        galeria-rotacion.js): recibe, fase a fase, un
        mapa {id -> peso 0..1} de qué tanto debería
        estar girando cada cono ahora mismo, y se
        encarga de acelerar/desacelerar con inercia
        hacia ese objetivo — nunca corta en seco.
    */
    const rotation =
        createRotationController(
            CONFIG, { cones, elementCount }
        );

    /*
        Mismo criterio que reveal: "getPositions" en
        vez de "positions" crudo, para que el layout
        que usa el carrusel sea el mismo (recalculado
        por orden real) con el que reorder.js dejó
        parada la fila al salir de la fase "orden" — si
        no, se ve un salto horizontal al entrar acá
        (bug reportado y corregido en
        galeria-carrusel.js).

        Ya NO recibe "getHiddenDrop": la versión
        línea->círculo no esconde nada fuera de cuadro,
        todo queda siempre visible sobre el círculo a
        "restY" constante. En cambio necesita
        "bboxesPorIndice" para calcular, por elemento,
        el offset entre su punto de anclaje frontal/base
        y el centro real de su bbox (ver comentario de
        cabecera de galeria-carrusel.js).
    */
    /*
        Rotación manual (arrastre) del elemento en foco
        durante "fichas" — ver
        galeria-interaccion-ficha.js. Se crea ANTES que
        "carousel" porque este último necesita su
        getOffset (pasado como getManualOffset) para
        sumarlo a rotationY en el único lugar que escribe
        cone.rotation.y en esa fase.
    */
    const interaccionFicha =
        createInteraccionFicha(
            CONFIG, { renderer, camera, cones }
        );

    const carousel =
        createCarouselController(
            CONFIG,
            {
                cones,
                getPositions: reorder.getPositions,
                elementCount,
                restY,
                getOrder: reorder.getOrder,
                bboxesPorIndice,
                getManualOffset: interaccionFicha.getOffset
            }
        );

    const paramPanel =
        createParamPanel(
            panelParametrosContainer
        );

    /*
        Panel de material: se crea UNA sola vez, ya
        con "cones" completo, y queda visible desde
        el arranque (no depende de fase ni de foco —
        ver el CSS de #panel-material en galeria.css
        y galeria-panel-material.js).
    */
    createMaterialPanel(
        panelMaterialContainer, cones
    );


    /*
        Render "de medición": #panel-ficha necesita
        contenido real (con las medidas fijas de
        dimensionesFicha ya aplicadas) para que
        #carousel-panel tenga su alto DEFINITIVO — así
        posicionarGui() (ver más abajo) puede medirlo.
        Da igual qué elemento se use acá: el alto es el
        mismo sin importar cuál, esa es justamente la
        gracia de dimensionesFicha (ver
        galeria-ficha.js). La fase "fichas" más
        adelante vuelve a llamar a renderizarFicha()
        con el elemento real que corresponda —este
        primer render es descartable, solo sirve para
        poder medir.
    */

    renderizarFicha(
        elementos[0],
        dimensionesFicha,
        { panelNombre, panelSubtitulo, panelFicha }
    );


    /*
        Coloca #gui a la misma altura en la que
        arranca la ficha (fase C, ver #carousel-panel
        en galeria.css): así, al pasar de la pausa
        "orden" a "fichas", el nombre/subtítulo que
        aparece ocupa visualmente el mismo lugar en el
        que estaban las pestañas de orden, sin salto —
        una refuerza la posición de la otra en vez de
        competir por atención en dos alturas distintas
        de la pantalla.

        #carousel-panel está anclado por ABAJO
        (bottom:0), así que su borde superior no es un
        valor fijo: depende del alto del contenido, que
        a su vez depende de dimensionesFicha Y del
        ancho de la ventana (clamp() en la tipografía
        del nombre, wrap de los .spec). No hay forma de
        expresar "la altura en la que empieza la ficha"
        solo con CSS —se mide el DOM real.

        panelIndex (el contador "1 / 6") es el primer
        elemento visible de la ficha de arriba hacia
        abajo, así que su borde superior ES esa altura.
        Se descarta cualquier medición en 0 o negativa
        (p. ej. si esto llegara a correr antes de que
        el layout esté listo): más vale quedarse con el
        valor anterior (o el top:6rem de respaldo del
        CSS) que clavar el GUI en un lugar sin sentido.

        GUI_TOP_MINIMO: piso de seguridad por navbar.
        En celular horizontal el viewport es tan bajo
        que, aunque la ficha ya esté acotada por CSS
        (ver #carousel-panel en galeria.css), su borde
        superior puede caer igual muy cerca del techo
        de la pantalla. Mismo despeje que ya usa
        #panel-material (top: 5.5rem, ver galeria.css)
        para el navbar, convertido a píxeles según el
        tamaño de fuente real de la raíz (por si el
        visitante tiene el zoom del navegador o el
        tamaño de fuente del sistema cambiados).

        getRowBottomScreenY(): piso de seguridad por
        GEOMETRÍA (distinto del piso de arriba, que sólo
        cuida el navbar). Sin esto, en celular horizontal
        el "topFicha" de más abajo podía caer a mitad de
        la fila de conos —la ficha todavía no está
        pensada para eso, sólo evita que quede pegada al
        navbar— y las pestañas de reordenar quedaban
        superpuestas sobre la geometría 3D en vez de
        debajo. getRowBottomScreenY() (galeria-escena.js)
        devuelve, en vivo, el punto más bajo de la fila
        TAL CUAL se ve con la cámara/lookAt vigentes
        (proyección real, no un valor fijo), así que
        sigue siendo correcto sin importar el ángulo o
        encuadre de cámara en cada tamaño de pantalla.
    */

    function remAPx(rem) {

        const raiz =
            parseFloat(
                getComputedStyle(
                    document.documentElement
                ).fontSize
            ) || 16;

        return rem * raiz;

    }

    const GUI_TOP_MINIMO = remAPx(5.5);
    const GUI_MARGEN_SOBRE_GEOMETRIA = 16;


    function posicionarGui() {

        if (!panelNombre) return;

        /*
            Antes se usaba panelIndex.top (el numerito
            "01/06" arriba del nombre) — eso dejaba a #gui
            más alto de lo pedido. Se cambia a
            panelNombre.bottom: el borde INFERIOR del
            título de la ficha, para que las pestañas de
            reordenar coincidan con esa línea en vez de con
            el borde superior del índice.
        */
        const topFicha =
            panelNombre.getBoundingClientRect().bottom;

        if (topFicha <= 0) return;


        const topPorGeometria =
            getRowBottomScreenY
                ? getRowBottomScreenY() +
                  GUI_MARGEN_SOBRE_GEOMETRIA
                : 0;

        gui.style.top =
            Math.max(
                topFicha,
                topPorGeometria,
                GUI_TOP_MINIMO
            ) + "px";

    }

    posicionarGui();

    /*
        Las fuentes (Google Fonts, ver galeria.html)
        pueden terminar de cargar después de este
        primer cálculo y cambiar la métrica del texto
        (alto de línea, ancho) — se vuelve a medir una
        vez que estén listas, por si el salto de
        tipografía corrió el borde superior de la
        ficha.
    */

    if (document.fonts && document.fonts.ready) {

        document.fonts.ready.then(posicionarGui);

    }


    renderSortButtons();
    wireSortButtons();


    /*
        ==============================
        LOOP DE RENDER
        ==============================
    */

    function tick(now) {

        requestAnimationFrame(tick);


        const { phase, t } =
            phases.getPhase(now);


        /*
            Cualquier animación de reordenamiento
            en curso sigue avanzando sin importar
            la fase actual.
        */

        if (reorder.isAnimating()) {

            reorder.step(now);

        }


        if (phase === "final") {

            /*
                Ya pasamos el total de scroll de las
                5 fases: soltamos el contenedor
                clavado (si todavía no lo estaba). El
                <footer> real, debajo de
                #galeria-spacer, ya está entrando en
                pantalla — pero la escena liberada
                (position:absolute) todavía tarda
                exactamente UN alto de ventana más en
                terminar de deslizarse fuera de vista
                (ver el comentario de
                ajustarAltoScroll() más arriba, que es
                justo quien le agregó ese viewport
                extra al spacer). Mientras dure ese
                tramo, la escena SIGUE siendo visible
                —el footer no tapa toda la ventana de
                entrada— así que no tiene sentido
                congelarla a mitad de giro: se sigue
                renderizando y el último cono (el que
                quedó destacado al llegar acá, ver
                "fichas" más abajo) sigue rotando.
                Recién cuando ya no queda nada de la
                escena en pantalla se corta del todo.
            */

            if (
                !galeriaFija.classList.contains(
                    "liberada"
                )
            ) {

                galeriaFija.classList.add(
                    "liberada"
                );

                galeriaFija.style.top =
                    phases.getScrollBudget().total +
                    "px";

            }


            const distanciaLiberada =
                getScrollY(now) -
                phases.getScrollBudget().total;

            if (distanciaLiberada < window.innerHeight) {

                rotation.update(
                    {
                        [ultimoFichaConeId()]:
                            CONFIG.carousel
                                .rotationScale
                    },
                    now
                );

                renderer.render(scene, camera);

            }

            return;

        }


        if (
            galeriaFija.classList.contains(
                "liberada"
            )
        ) {

            /*
                El usuario volvió a subir el scroll
                por encima del total: reclavamos el
                contenedor a la ventana.
            */

            galeriaFija.classList.remove(
                "liberada"
            );

            galeriaFija.style.top = "";

        }


        if (phase === "hero") {

            /*
                Arranque del arco de cámara: fija en el
                extremo derecho (t=0) mientras dure esta
                fase — recién empieza a viajar hacia el
                extremo izquierdo en "revelado" (ver esa
                rama más abajo).
            */
            setCameraLado(0);

            /*
                progress = 0: deja al cono visible
                quieto en su lugar y al resto
                escondido debajo del cuadro — la
                cascada todavía NO arranca (eso es
                exclusivo de la fase "revelado").
            */
            reveal.update(0);

            /*
                La rotación arranca acá (fase "hero"),
                no recién en "proyecto": el cono hero
                gira a peso pleno (1) mientras dure
                cualquiera de estas dos fases — ver
                galeria-rotacion.js.
            */
            rotation.update(
                { [heroConeId()]: 1 }, now
            );

            const {
                heroFadeOpacity,
                scrollHintOpacity
            } = heroFadeEnvelope(t, CONFIG);

            fijarOpacidadPanel(
                hero, heroTexto, heroFadeOpacity
            );

            scrollHint.style.opacity =
                scrollHintOpacity;

            fijarOpacidadPanel(
                proyectoPanel, proyectoContenedor, 0
            );

            gui.classList.remove("visible");

            carouselPanel.classList.remove(
                "visible"
            );

            carousel.reset();
            interaccionFicha.reset();

            panelParametrosContainer.classList
                .remove("visible");

            paramPanel.limpiar();

        } else if (phase === "proyecto") {

            /*
                Misma razón que en "hero": el arco de
                cámara tampoco arranca todavía, se
                mantiene en el extremo derecho mientras
                se lee el panel de texto.
            */
            setCameraLado(0);

            /*
                Misma razón que en "hero": todavía no
                arranca la cascada, la fila se
                mantiene quieta mientras se lee el
                panel de texto.
            */
            reveal.update(0);

            fijarOpacidadPanel(hero, heroTexto, 0);
            scrollHint.style.opacity = 0;

            /*
                Sigue girando a peso pleno (mismo
                mecanismo que en "hero") mientras,
                además, calcula la opacidad del panel
                de texto a partir del progreso de
                ESTA fase.
            */
            rotation.update(
                { [heroConeId()]: 1 }, now
            );

            const { panelOpacity } =
                proyecto.update(t);

            fijarOpacidadPanel(
                proyectoPanel,
                proyectoContenedor,
                panelOpacity
            );

            gui.classList.remove("visible");

            carouselPanel.classList.remove(
                "visible"
            );

            carousel.reset();
            interaccionFicha.reset();

            panelParametrosContainer.classList
                .remove("visible");

            paramPanel.limpiar();

        } else if (phase === "revelado") {

            /*
                Recién acá arranca de verdad el viaje de
                la cámara por el arco (mismo "t" 0..1
                propio de este tramo que ya recibe
                reveal.update() abajo — corte limpio
                respecto de "proyecto", igual que la
                cascada): del extremo derecho (0) al
                izquierdo (1), en sincronía con que suben
                los elementos.
            */
            setCameraLado(t);

            /*
                Recién acá arranca de verdad la
                cascada (progreso 0..1 propio de este
                tramo — corte limpio respecto de
                "proyecto"). El cono hero no vuelve a
                aparecer en rotationWeights (no forma
                parte de la cascada) => su giro
                desacelera solo, sin pedirlo, ni bien
                arranca esta fase.
            */
            const { rotationWeights } =
                reveal.update(t);

            rotation.update(rotationWeights, now);

            fijarOpacidadPanel(
                proyectoPanel, proyectoContenedor, 0
            );

            fijarOpacidadPanel(hero, heroTexto, 0);
            scrollHint.style.opacity = 0;

            gui.classList.remove("visible");

            carouselPanel.classList.remove(
                "visible"
            );

            carousel.reset();
            interaccionFicha.reset();

            panelParametrosContainer.classList
                .remove("visible");

            paramPanel.limpiar();

        } else if (phase === "orden") {

            /*
                El arco de cámara ya terminó su viaje en
                "revelado": queda fijo en el extremo
                izquierdo (t=1) para el resto del
                recorrido (esta fase, "fichas" y
                "final").
            */
            setCameraLado(1);

            /*
                Pausa: todos quietos, salvo el que ya
                va a ser el primer destacado de
                "fichas" (mismo peso que tendrá ahí —
                ver primerFichaConeId()), así llega
                sin frenar y sin un arranque nuevo.
            */
            rotation.update(
                {
                    [primerFichaConeId()]:
                        CONFIG.carousel.rotationScale
                },
                now
            );

            fijarOpacidadPanel(
                proyectoPanel, proyectoContenedor, 0
            );

            fijarOpacidadPanel(hero, heroTexto, 0);
            scrollHint.style.opacity = 0;

            carouselPanel.classList.remove(
                "visible"
            );

            carousel.reset();
            interaccionFicha.reset();

            gui.classList.add("visible");

            panelParametrosContainer.classList
                .remove("visible");

            paramPanel.limpiar();


            /*
                Mientras no haya una animación de
                reordenamiento en curso, todos los
                elementos quedan quietos en su
                lugar (según el "order" vigente).
            */

            if (!reorder.isAnimating()) {

                reveal.update(1);

            }

        } else {

            /*
                phase === "fichas"
            */

            /*
                Mismo lado que ya dejó fijo "orden"
                (t=1): "fichas" no mueve la cámara, solo
                el foco entre elementos (ver
                galeria-carrusel.js).
            */
            setCameraLado(1);

            fijarOpacidadPanel(
                proyectoPanel, proyectoContenedor, 0
            );

            fijarOpacidadPanel(hero, heroTexto, 0);
            scrollHint.style.opacity = 0;

            gui.classList.remove("visible");

            carouselPanel.classList.add(
                "visible"
            );

            panelParametrosContainer.classList
                .add("visible");


            /*
                Va ANTES de carousel.update(): si hay un
                reset de rotación manual en curso (el
                scroll se volvió a mover, ver
                galeria-interaccion-ficha.js), este paso
                avanza un frame de suavizado exponencial
                — así el offset que carousel.update() lee
                más abajo (vía getManualOffset, pasado en
                su construcción) ya es el de ESTE frame,
                no el del anterior.
            */
            interaccionFicha.update(now);

            const result =
                carousel.update(t);

            /*
                Va DESPUÉS de carousel.update(): recién
                acá se sabe qué elemento está en foco
                este frame. Si cambió respecto del
                anterior, deja arrastrable al nuevo (sin
                heredar el offset del que se acaba de
                perder de foco — ver setElementoActivo en
                galeria-interaccion-ficha.js).
            */
            interaccionFicha.setElementoActivo(
                result.elementoId
            );

            /*
                Mismo "emphasis" que ya decide
                posición/escala/opacidad: el
                destacado gira a peso pleno, el resto
                desacelera a medida que el foco se
                aleja — ver galeria-carrusel.js.
            */
            rotation.update(
                result.rotationWeights, now
            );

            if (result.changed) {

                updatePanel(
                    result.elementoId,
                    result.displayIndex
                );

            }

        }


        renderer.render(scene, camera);

    }


    requestAnimationFrame(tick);


    /*
        ==============================
        RESIZE
        ==============================
    */

    window.addEventListener("resize", () => {

        resize();

        ajustarAltoScroll();

        /*
            Vuelve a medir dimensionesFicha para el
            viewport ACTUAL (ver comentario junto a su
            declaración, más arriba) y repinta el
            elemento que estuviera activo con las medidas
            nuevas. Se hace ANTES de posicionarGui(): el
            alto de la ficha (del que depende dónde cae
            panelIndex) tiene que estar ya actualizado
            cuando se lo mide ahí abajo.

            Nada de esto se llega a ver: calcularDimensionesFicha
            + renderizarFicha corren en el mismo tick de
            JS, de un tirón — el navegador recién pinta
            de nuevo cuando termina el handler completo,
            así que el contenido "de paso" que se usa
            para medir cada campo nunca queda pintado en
            pantalla, sea cual sea el estado (visible u
            oculto) de #carousel-panel en ese momento.
        */

        remedirFicha();

        posicionarGui();

    });


    /*
        ==============================
        HELPERS DE DOM
        (arman/actualizan el markup a
        partir de CONFIG)
        ==============================
    */

    function renderSortButtons() {

        gui.innerHTML = "";

        CONFIG.sortOptions.forEach(
            (option, i) => {

                const button =
                    document.createElement(
                        "button"
                    );

                button.textContent =
                    option.label;

                button.dataset.sort =
                    option.key;

                /*
                    Primer botón = primer criterio de
                    CONFIG.sortOptions ("anio"/
                    Cronológico) = mismo criterio con
                    el que arranca "order" en
                    galeria-reordenar.js. Si se
                    reordena sortOptions, este botón
                    activo por defecto y el "order"
                    inicial se mueven juntos, sin
                    tocar nada acá.
                */
                if (i === 0) {

                    button.classList.add(
                        "active"
                    );

                }

                gui.appendChild(button);

            }
        );

    }


    function wireSortButtons() {

        gui.querySelectorAll("button")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    () => {

                        if (
                            reorder.isBusy() ||
                            phases.getPhase()
                                .phase !== "orden"
                        ) return;


                        gui.querySelectorAll(
                            "button"
                        ).forEach(
                            b =>
                                b.classList
                                 .remove("active")
                        );

                        button.classList.add(
                            "active"
                        );


                        const newOrder =
                            reorder.getSortedOrder(
                                button.dataset.sort
                            );

                        reorder.animateTo(
                            newOrder
                        );

                    }
                );

            });

    }


    function remedirFicha() {

        dimensionesFicha =
            calcularDimensionesFicha(
                elementos,
                { panelNombre, panelSubtitulo, panelFicha },
                {
                    anchoMaximoCampo:
                        calcularAnchoMaximoCampo()
                }
            );

        /*
            Mismo motivo que en la medición inicial (ver
            su comentario, más arriba): sin
            "anchoMaximoCampo" propio, porque el
            breakpoint donde haría falta es el mismo en el
            que "#ficha-panel-marco" ya está oculto.
        */
        dimensionesPanelDerecho =
            calcularDimensionesCampos(
                elementos,
                "panelDerecho",
                panelDerechoSpecs
            );

        if (elementoIdActual !== null) {

            /*
                updatePanel() ya llama a
                ajustarAltoFichaSegunContenido() al final,
                DESPUÉS de re-renderizar con las medidas
                nuevas — no hace falta (ni conviene) medir
                acá antes: en este punto el DOM todavía
                tiene el contenido/anchos VIEJOS.
            */
            updatePanel(
                elementoIdActual,
                displayIndexActual
            );

        } else {

            /*
                Todavía no se mostró ningún elemento (p.
                ej. un resize durante la fase "hero"): no
                hay updatePanel() que dispare la medición,
                así que se limpia acá cualquier max-height
                que hubiera quedado de antes. Se va a medir
                bien la primera vez que updatePanel() sí
                corra.
            */
            ajustarAltoFichaSegunContenido();

        }

    }


    function updatePanel(elementoId, displayIndex) {

        const elemento =
            elementos[elementoId];

        if (!elemento) return;


        elementoIdActual = elementoId;
        displayIndexActual = displayIndex;


        panelIndex.textContent =
            (displayIndex + 1) +
            " / " +
            elementCount;

        renderizarFicha(
            elemento,
            dimensionesFicha,
            { panelNombre, panelSubtitulo, panelFicha }
        );

        /*
            Mismo elemento, mismo momento: el panel
            derecho cambia de contenido junto con la
            ficha, así que se renderiza acá al lado en vez
            de en un callback separado.
        */
        renderizarCampos(
            elemento,
            "panelDerecho",
            dimensionesPanelDerecho,
            panelDerechoSpecs
        );

        /*
            Recién ACÁ, después de renderizarFicha(), el
            DOM ya tiene aplicado el minHeight de peor
            caso en cada campo — es el momento correcto
            para medir (ver el comentario grande junto a
            ajustarAltoFichaSegunContenido()). Cubre el
            caso de entrar a la fase "fichas" por primera
            vez sin haber pasado por ningún resize.
        */

        ajustarAltoFichaSegunContenido();


        /*
            Panel de parámetros: apunta al Group del
            elemento recién enfocado (ver
            galeria-panel-parametros.js). Se llama
            siempre que cambia el foco, incluso si
            el elemento no expone parámetros (en ese
            caso simplemente no arma controles).
        */

        paramPanel.mostrar(
            elementoId,
            elemento,
            cones[elementoId]
        );


        /*
            Pequeño fundido al cambiar de
            elemento.
        */

        [
            panelNombre,
            panelSubtitulo,
            panelFicha,
            panelDerechoSpecs
        ].forEach(el => {

            el.classList.add("fade-swap");

            requestAnimationFrame(() => {

                el.classList.remove(
                    "fade-swap"
                );

            });

        });

    }

}


document.addEventListener(
    "DOMContentLoaded", initGaleria
);
