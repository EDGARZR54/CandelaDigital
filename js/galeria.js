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
/*
    Dolly de cámara sobre el objeto 3D en foco (cono o,
    a futuro, nube Potree — ver zoom3dScroll.md) activado
    por wheel cuando el cursor está sobre ese objeto, sin
    tocar window.scrollY en ningún momento (ver ese
    archivo para el diseño completo).
*/
import { createZoomController } from "./three/galeria-zoom.js";
/*
    Paneo de cámara por arrastre con el botón derecho
    sobre el objeto 3D en foco (ver galeria-paneo.js) —
    mismo criterio que el dolly de arriba, hermano
    directo: no mueve el objeto, traslada camera.position,
    esta vez sobre el plano perpendicular al eje de vista
    en vez de a lo largo de él.
*/
import { createPaneoController } from "./three/galeria-paneo.js";
import { createParamPanel } from "./three/galeria-panel-parametros.js";
import { createMaterialPanel } from "./three/galeria-panel-material.js";
import { createFotosPanel } from "./three/galeria-panel-fotos.js";
import {
    calcularDimensionesFicha,
    renderizarFicha,
    calcularDimensionesCampos,
    renderizarCampos
} from "./three/galeria-ficha.js";
import { createMapaController } from "./three/galeria-mapa.js";
import { createPanelDerechoSheet } from "./three/galeria-panel-derecho.js";
import { createSeccionesColapsables } from "./three/galeria-panel-derecho-secciones.js";
import { createAutorotarToggle } from "./three/galeria-autorotar.js";
import { createCorteController } from "./three/galeria-corte.js";
import { createCorteControles } from "./three/galeria-corte-controles.js";
import { createCorteInterseccion } from "./three/galeria-corte-interseccion.js";
import { createPlanoCorte } from "./three/galeria-plano-corte.js";
import { createPaginationController } from "./three/galeria-paginacion.js";


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

    /*
        FIX ("la primer ficha se ve a opacidad plena
        mucho antes de que la geometría termine de
        centrarse", bug reportado): la clase "visible"
        en galeria.css dispara una transición CSS de
        opacidad de duración fija, en tiempo real, sin
        relación ninguna con cuánto tarda la geometría en
        cerrar el círculo y asentarse en su meseta (ver
        galeria-carrusel.js, "opacityFinal"). Se
        reemplaza ese fade por tiempo por un fade por
        SCROLL: cada frame de la fase "fichas" fija
        "carouselPanel.style.opacity" directamente, al
        mismo "panelOpacity" que devuelve
        carousel.update() — el mismo número que ya rige
        "cone.material.opacity" del elemento en foco, así
        que ambos llegan a 1 en el EXACTO mismo instante,
        sin posibilidad de desincronizarse.

        Para que esa asignación cuadro a cuadro no quede
        ella misma amortiguada por la transición CSS
        existente (que seguiría aplicando incluso a
        cambios de "style.opacity" hechos por JS, sólo
        que ahora produciría un lag en vez de un salto —
        mismo problema, disfrazado), se anula acá esa
        transición para este elemento en particular, sin
        tocar transition en el resto del CSS de
        "#carousel-panel.visible" (por si esa regla sigue
        gobernando algo más que opacidad, p.ej. transform
        o visibility).
    */
    carouselPanel.style.transitionProperty = "opacity";
    carouselPanel.style.transitionDuration = "0s";

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

    /*
        El cuadrado vacío arriba de "panelDerechoSpecs"
        (ver "#panel-derecho-cuadro" en galeria.html,
        placeholder hasta ahora) — acá adentro se monta el
        mapa, ver "mapa" más abajo y galeria-mapa.js.
    */
    const panelDerechoCuadro =
        document.getElementById(
            "panel-derecho-cuadro"
        );

    /*
        Panel derecho completo (mapa + specs + controles +
        fotos) y su tirador — solo hacen algo en mobile,
        donde este panel pasa a ser un bottom sheet en vez
        de la columna fija de siempre (ver el media query de
        780px en galeria.css y galeria-panel-derecho.js). En
        escritorio createPanelDerechoSheet() igual se llama
        sin condicional: el tirador está oculto ahí (display:
        none), así que sus listeners nunca disparan.
    */
    const panelDerecho =
        document.getElementById("panel-derecho");

    const fichaSheetTirador =
        document.getElementById(
            "ficha-sheet-tirador"
        );

    /*
        Switch "Autorotado" — ver galeria-autorotar.js.
        Vive dentro de "#ficha-controles" (sección
        "Opciones de visualización", ex "Corte", del panel
        derecho), no de "panelDerecho" en sí, pero se busca
        acá junto a los otros elementos DOM fijos de la
        ficha por el mismo criterio de siempre: reunir
        todas las referencias en un solo lugar.
    */
    const botonAutorotar =
        document.getElementById("boton-autorotar");

    /*
        Switch "Mostrar intersección" — ver
        galeria-corte-interseccion.js. Mismo criterio que
        "botonAutorotar" de acá arriba: se busca junto al
        resto de los elementos DOM fijos de la ficha.
    */
    const botonMostrarInterseccion =
        document.getElementById("boton-mostrar-interseccion");

    /*
        Switch "Mostrar plano de corte" — ver
        galeria-plano-corte.js. Mismo criterio que los dos de
        acá arriba.
    */
    const botonMostrarPlanoCorte =
        document.getElementById("boton-mostrar-plano-corte");

    /*
        Contenedor de los sliders/botones de invertir de
        "Opciones de visualización" (ex "Corte") — ver
        galeria-corte-controles.js, que busca sus propios
        elementos ADENTRO de este (mismo patrón que
        createSeccionesColapsables con "panelDerecho").
    */
    const fichaControlesContainer =
        document.getElementById("ficha-controles");

    const panelParametrosContainer =
        document.getElementById("panel-parametros");

    const panelMaterialContainer =
        document.getElementById("panel-material");

    /*
        Contenedor de las miniaturas de "Fotografías" —
        ver galeria-panel-fotos.js, mismo patrón que
        panelParametrosContainer: arranca vacío en el
        HTML, este módulo lo arma en runtime.
    */
    const panelFotosContainer =
        document.getElementById("ficha-fotos-miniaturas");

    /*
        Fórmula fija de la sección "Geometría" — ver el
        comentario junto a "renderMathInElement" más abajo
        para el porqué de que se renderice acá y no en un
        módulo aparte.
    */
    const formulaGeometriaContainer =
        document.getElementById("formula-geometria");

    const scrollHint =
        document.getElementById("scroll-hint");

    const paginacionContainer =
        document.getElementById("galeria-paginacion");


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

    const GAP_SPECS_HORIZONTAL = 22;
    const ANCHO_MINIMO_CAMPO = 64;
    const ANCHO_MAXIMO_CAMPO_DEFAULT = 260;

    /*
        Tope de ancho por campo de specs (superficie,
        altura, estado, etc.), basado en el ancho REAL
        disponible — no en un default fijo de 260px.

        ANTES esto solo se activaba en el breakpoint de
        horizontal bajo (celular acostado), usando
        "window.innerWidth - ESPACIO_LATERAL_FICHA" como
        aproximación del ancho disponible — un número que
        SOLO era razonable ahí porque en ese breakpoint
        "#ficha-panel-marco" (el panel derecho) está oculto
        (ver ese "display:none" en galeria.css) y
        "#carousel-panel .contenedor" vuelve su padding-right
        al valor normal, chico, de siempre.

        Fuera de ese breakpoint (o sea: la MAYORÍA del
        tiempo), la función devolvía "undefined" sin más, y
        "calcularDimensionesFicha" (galeria-ficha.js) caía a
        su propio default fijo de 260px por campo — un
        número que NUNCA tuvo en cuenta cuánto ancho le
        queda de verdad a "#panel-ficha" después de que
        "#carousel-panel .contenedor" le resta espacio a la
        derecha para "#ficha-panel-marco" (ver ese
        "padding-right" en galeria.css). Con contenido largo
        (autores con varios nombres, tipologías largas), la
        grilla de datos podía terminar más ancha que el
        espacio real disponible e invadir visualmente el
        panel derecho.

        Ahora se mide el ancho REAL de ".ficha__fila"
        (padre directo de "#panel-ficha") con
        "getBoundingClientRect()" — ESE número ya viene con
        la reserva del panel derecho descontada (porque
        ".ficha__fila" es un hijo normal, sin ancho propio
        fijo, dentro de ".contenedor": su ancho disponible
        YA es "ancho de .contenedor menos su padding", sin
        que haga falta repetir esa resta acá a mano) — mismo
        criterio de "medir el DOM real en vez de aproximar
        con un número fijo" que ya usa "anchoContenidoDisponible()"
        en galeria-ficha.js para el título. Al medir en vivo,
        esto además sigue funcionando bien SIN cambios en el
        breakpoint de horizontal bajo: ahí ".ficha__fila" ya
        mide más ancho automáticamente, porque a esa altura
        "#ficha-panel-marco" está oculto y el padding-right
        vuelve a ser chico — se refleja solo en la medición,
        sin necesitar una rama de código aparte para eso.
    */
    function calcularAnchoMaximoCampo() {

        const fila = panelFicha.parentElement;

        if (!fila) return undefined;

        const anchoDisponible =
            fila.getBoundingClientRect().width;

        /*
            NO se divide por "numCampos" (7): la grilla
            real es "grid-template-columns: repeat(4, auto)"
            (2 filas x 4 columnas, ver "#carousel-panel
            .specs" en galeria.css, sin ninguna excepción en
            ningún breakpoint) — nunca hay 7 campos uno al
            lado del otro en la misma fila, siempre 4 como
            mucho. Dividir por 7 angostaba cada campo mucho
            más de lo necesario.

            Se LEE la cantidad real de columnas desde el CSS
            computado (en vez de escribir "4" a mano acá) —
            mismo criterio de "medir el DOM/CSS real" que ya
            usa el resto de este módulo: si el
            "grid-template-columns" de ".specs" cambia
            alguna vez, este cálculo lo sigue automático sin
            que haga falta acordarse de actualizar un
            segundo lugar.
        */
        const columnasGrid =
            getComputedStyle(panelFicha)
                .gridTemplateColumns
                .split(" ")
                .length || 1;

        const anchoPorCampo =
            (
                anchoDisponible -
                GAP_SPECS_HORIZONTAL * (columnasGrid - 1)
            ) / columnasGrid;

        return Math.max(
            ANCHO_MINIMO_CAMPO,
            Math.min(ANCHO_MAXIMO_CAMPO_DEFAULT, anchoPorCampo)
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

        Sin "anchoMaximoCampo" propio a propósito:
        calcularAnchoMaximoCampo() (arriba) mide el ancho
        de ".ficha__fila" — el contenedor de "panelFicha",
        no el de este panel. "#ficha-panel-marco" (donde
        vive "panelDerechoSpecs") tiene su propio ancho fijo
        via "--ficha-panel-ancho" (ver galeria.css); pasarle
        acá el ancho medido para OTRO contenedor daría un
        tope sin relación real con el espacio que este panel
        en verdad tiene disponible.
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

        El mismo cambio de "data-tema" también dispara
        "mapa.actualizarTema()" (ver galeria-mapa.js), que
        alterna el basemap MapStyle.json/MapStyleDark.json
        — "mapa" todavía no está declarado en este punto
        del archivo (se crea más abajo, después de
        "reorder"), pero como este callback recién corre
        ante un cambio real de atributo -es decir, después
        de que toda esta inicialización síncrona ya
        terminó-, para cuando se ejecuta "mapa" ya existe.
        actualizarTema() además es un no-op mientras el
        mapa no esté cargado, así que tampoco hay problema
        si el visitante cambia de tema antes de llegar a
        la fase "orden".
    */

    const observadorTema =
        new MutationObserver(() => {

            actualizarColoresTema();
            mapa.actualizarTema();

        });

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

    /*
        "elementos" ya viene garantizado no-vacío acá
        arriba (el early return de "elementos.length === 0"
        pasó hace rato) — así que no hace falta que
        galeria-paginacion.js contemple el caso de 0
        fichas al dividir budget.fichas / elementos.length
        en irAFicha().

        Se construye ACÁ, después de "reorder" (y no más
        arriba, junto al resto de los controladores "de
        entrada"), justo por lo mismo que ya justifica por
        qué "mapa" se crea en este mismo punto del archivo:
        necesita "reorder.getOrder" para poder etiquetar
        cada dot de ficha con el elemento que REALMENTE
        ocupa ese slot, no con el orden crudo del GeoJSON
        (bug reportado: "los nombres de los dots de fichas
        no consideran el ordenamiento").
    */
    const paginacion =
        createPaginationController(
            paginacionContainer, phases, elementos,
            reorder.getOrder, CONFIG
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
        Mapa dentro del cuadrado del panel derecho (ver
        galeria-mapa.js) — depende de "reorder.getOrder"
        (misma secuencia que ya usa el carrusel 3D para
        decidir qué elemento va en cada slot), así que se
        crea recién acá, después de "reorder". Todavía no
        carga nada pesado (MapLibre/Turf): eso arranca
        recién al llegar a la fase "orden" (ver esa rama
        más abajo, mapa.cargar()).
    */
    const mapa =
        createMapaController({
            container: panelDerechoCuadro,
            elementos,
            getOrder: reorder.getOrder,
            config: CONFIG
        });

    /*
        Independiente de "mapa": no necesita esperar a
        "reorder" ni a nada de la escena, pero se crea acá
        nomás, junto al resto de los controladores del panel
        derecho, para que sea fácil encontrarlos juntos.
    */
    const panelDerechoSheet =
        createPanelDerechoSheet(
            panelDerecho, fichaSheetTirador
        );

    /*
        Toggle independiente de las 3 secciones colapsables
        del panel derecho (Ubicación/Vista/Fotografías, ver
        galeria-panel-derecho-secciones.js) — módulo aparte
        de panelDerechoSheet a propósito, ver la cabecera de
        ese archivo para el porqué. "onCambio" le pasa
        panelDerechoSheet.actualizarPosicion (inyectada, no
        importada: los dos módulos no se conocen entre sí)
        para que el bottom sheet mobile vuelva a medir su
        alto real cada vez que una sección colapsa/expande —
        mismo motivo que ya dispara esa función en resize y
        en document.fonts.ready, ver más abajo.
    */
    const seccionesPanelDerecho =
        createSeccionesColapsables(
            panelDerecho,
            { onCambio: panelDerechoSheet.actualizarPosicion }
        );

    /*
        Switch de autorotado (ver galeria-autorotar.js) —
        módulo aparte de "rotation" (galeria-rotacion.js) a
        propósito: este solo sabe si el switch está prendido
        o apagado, nunca toca Three.js ni pesos de rotación
        directamente. Es el tick() de "fichas", más abajo,
        quien decide qué hacer con "autorotar.activo()".
    */
    const autorotar =
        createAutorotarToggle(botonAutorotar);


    /*
        corte / corteControles se necesitan mutuamente por
        callback (corte le avisa a corteControles cuando
        cambia el elemento activo para que resetee los
        sliders; corteControles llama a corte.actualizarEje/
        invertirEje al mover un slider o apretar invertir) —
        ninguno de los dos IMPORTA al otro (mismo criterio de
        "inyectar, no importar" que el resto de esta página),
        así que no pueden construirse en un único paso: se
        arma "corte" primero, con una referencia diferida
        ("corteControlesRef", un simple "let" asignado recién
        abajo) en vez de "corteControles" directo, porque
        todavía no existe en este punto — para cuando
        "onElementoCambiado" DISPARE de verdad (en el próximo
        cambio de foco), "corteControlesRef" ya va a estar
        asignado.
    */
    let corteControlesRef = null;

    /*
        Switch "Mostrar intersección" (ver
        galeria-corte-interseccion.js) — no se necesita
        ninguna referencia diferida como con corteControles:
        este módulo no le avisa nada a "corte" (es
        estrictamente corte -> interseccion, nunca al revés),
        así que alcanza con construirlo ANTES y pasarle el
        estado ya resuelto en cada callback de más abajo.
    */
    const corteInterseccion =
        createCorteInterseccion({ cones });

    /*
        Switch "Mostrar plano de corte" (ver
        galeria-plano-corte.js) — mismo criterio que
        corteInterseccion: se construye antes y se le pasa el
        estado ya resuelto en cada callback de más abajo.
    */
    const planoCorte =
        createPlanoCorte({ scene });

    const corte =
        createCorteController({
            cones,
            bboxesPorIndice,
            onElementoCambiado() {

                if (corteControlesRef) {

                    corteControlesRef.reset();

                }

                /*
                    Recalcula las curvas para el cono
                    RECIÉN activado (no-op si el switch está
                    apagado — ver actualizar() en
                    galeria-corte-interseccion.js). Sin esto,
                    si el visitante cambia de ficha con el
                    switch prendido, las curvas del cono
                    anterior quedarían colgadas de un objeto
                    que ya no está en foco hasta el próximo
                    slider que se toque.
                */
                corteInterseccion.actualizar(
                    corte.obtenerEstadoActivo()
                );

                /*
                    Mismo motivo que arriba: reapunta (o
                    esconde) los helpers de plano al cono
                    recién activado.
                */
                planoCorte.actualizar(
                    corte.obtenerEstadoActivo()
                );

            }
        });

    const corteControles =
        createCorteControles(
            fichaControlesContainer,
            {
                onCambioEje: (eje, percent) => {

                    corte.actualizarEje(eje, percent);

                    corteInterseccion.actualizar(
                        corte.obtenerEstadoActivo()
                    );

                    planoCorte.actualizar(
                        corte.obtenerEstadoActivo()
                    );

                },
                onInvertirEje: eje => {

                    const nuevoInvertido =
                        corte.invertirEje(eje);

                    corteInterseccion.actualizar(
                        corte.obtenerEstadoActivo()
                    );

                    planoCorte.actualizar(
                        corte.obtenerEstadoActivo()
                    );

                    return nuevoInvertido;

                }
            }
        );

    corteControlesRef = corteControles;

    /*
        Switch "Mostrar intersección": mismo patrón simple
        que el resto de los switches de "role=switch" +
        "aria-checked" de esta página (ver botonAutorotar más
        abajo) — a diferencia de "Autorotado", acá no hace
        falta un módulo tipo galeria-autorotar.js porque el
        propio galeria-corte-interseccion.js ya guarda su
        estado "activo" puertas adentro; este listener solo
        traduce el click en DOM + llama a setActivo().
    */
    if (botonMostrarInterseccion) {

        botonMostrarInterseccion.addEventListener(
            "click", () => {

                const nuevoActivo =
                    botonMostrarInterseccion.getAttribute(
                        "aria-checked"
                    ) !== "true";

                botonMostrarInterseccion.setAttribute(
                    "aria-checked", String(nuevoActivo)
                );

                corteInterseccion.setActivo(nuevoActivo);

                /*
                    Al prender, hay que construir las curvas
                    YA para el cono en foco ahora mismo — sin
                    esto, se verían recién cuando el
                    visitante toque un slider por primera vez.
                */
                if (nuevoActivo) {

                    corteInterseccion.actualizar(
                        corte.obtenerEstadoActivo()
                    );

                }

            }
        );

    }

    /*
        Switch "Mostrar plano de corte": mismo patrón que el
        de "Mostrar intersección" de acá arriba.
    */
    if (botonMostrarPlanoCorte) {

        botonMostrarPlanoCorte.addEventListener(
            "click", () => {

                const nuevoActivo =
                    botonMostrarPlanoCorte.getAttribute(
                        "aria-checked"
                    ) !== "true";

                botonMostrarPlanoCorte.setAttribute(
                    "aria-checked", String(nuevoActivo)
                );

                planoCorte.setActivo(nuevoActivo);

                if (nuevoActivo) {

                    planoCorte.actualizar(
                        corte.obtenerEstadoActivo()
                    );

                }

            }
        );

    }


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

        "obtenerMallasExtra": planoCorte YA existe acá
        arriba (se construye antes, junto a
        corteInterseccion) — se le pasa su
        obtenerMallasHitTest tal cual, sin envolverlo: los
        planos de corte visibles pasan a ser también
        agarrables para rotar, misma subescena que la
        geometría real (ver la cabecera de
        galeria-plano-corte.js y el comentario junto a
        "obtenerMallasExtra" en galeria-interaccion-ficha.js).
    */
    const interaccionFicha =
        createInteraccionFicha(
            CONFIG,
            {
                renderer, camera, cones,
                obtenerMallasExtra:
                    planoCorte.obtenerMallasHitTest
            }
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

    /*
        Dolly de cámara sobre el objeto 3D en foco (ver
        galeria-zoom.js) — agnóstico de si ese objeto es
        un cono o, a futuro, una nube Potree: quien arma
        cada frame de "fichas" es responsable de avisarle
        con setObjetoActivo() cuáles son las mallas
        vigentes contra las que testear el wheel (ver más
        abajo, dentro de tick()).
    */
    const zoom =
        createZoomController(
            CONFIG, { renderer, camera, phases }
        );

    /*
        Paneo de cámara por arrastre con botón derecho
        sobre el objeto 3D en foco (ver galeria-paneo.js)
        — mismo criterio que "zoom" acá arriba: agnóstico
        del objeto, recibe sus mallas vigentes vía
        setObjetoActivo() (ver más abajo, dentro de
        tick(), mismo call site que zoom).
    */
    const paneo =
        createPaneoController(
            CONFIG, { renderer, camera, phases }
        );

    /*
        Panel de material: se crea UNA sola vez, ya
        con "cones" completo, y queda visible desde
        el arranque (no depende de fase ni de foco —
        ver el CSS de #panel-material en galeria.css
        y galeria-panel-material.js). Se construye ANTES
        que "paramPanel" (más abajo), a diferencia de
        antes: ahora paramPanel necesita
        materialPanel.actualizarAristasDeGrupo para
        mantener sincronizado el overlay de malla cuando
        reconstruye la geometría de un elemento (ver
        "callbacks.actualizarAristasDeGrupo" en
        galeria-panel-parametros.js) — no puede recibir
        algo que todavía no existe.
    */
    const materialPanel =
        createMaterialPanel(
            panelMaterialContainer, cones
        );

    /*
        "bboxesPorIndice" (misma referencia que ya reciben
        carousel/corte, arriba): sin pasarla acá, el panel
        seguía reconstruyendo bien la geometría y el
        pivote de rotación (ver galeria-panel-parametros.js
        y galeria-escena.js), pero la entrada
        correspondiente en bboxesPorIndice quedaba con el
        bbox VIEJO — así, aunque el objeto ya rotara bien
        sobre su propio centro, galeria-carrusel.js seguía
        centrando su offset (pivotX/Y/Z, ver ese archivo)
        contra el tamaño ANTERIOR.

        "onGeometriaReconstruida": mismo par de llamadas que
        ya se hace tras onCambioEje/onInvertirEje/
        onElementoCambiado más arriba — corte.js ya invalidó
        su bbox cacheado por su cuenta (invalidarBboxCono(),
        llamado desde adentro del panel), así que el corte
        REAL (clippingPlanes) ya está al día; falta avisarle
        a los dos overlays visuales (curva de intersección,
        cuadrado del plano) para que se redibujen contra el
        bbox nuevo — si no, quedarían mostrando el corte
        VIEJO hasta el próximo evento de "Corte" genuino.
        Cubre tanto un slider individual como "Restaurar
        predeterminados" (los dos casos pasan por la misma
        reconstruirGeometria(), ver ese archivo).

        "actualizarAristasDeGrupo": materialPanel ya existe
        acá arriba (ver el comentario de su construcción) —
        se le pasa su propio actualizarAristasDeGrupo tal
        cual, sin envolverlo: el overlay de malla (cuadrícula
        UV + densidad, ver galeria-malla-cuadricula.js) de
        un elemento con "Mostrar malla" ya activado pasa a
        seguir cualquier reconstrucción de su geometría
        desde la carpeta "Forma", no sólo desde el slider de
        densidad o el switch global.
    */
    const paramPanel =
        createParamPanel(
            panelParametrosContainer,
            bboxesPorIndice,
            {
                onGeometriaReconstruida() {

                    corteInterseccion.actualizar(
                        corte.obtenerEstadoActivo()
                    );

                    planoCorte.actualizar(
                        corte.obtenerEstadoActivo()
                    );

                },

                actualizarAristasDeGrupo:
                    materialPanel.actualizarAristasDeGrupo

            }
        );


    /*
        Miniaturas de "Fotografías": se crea UNA sola
        vez (igual que paramPanel arriba), y se repuebla
        en cada cambio de foco vía fotosPanel.mostrar()
        más abajo, con elemento.fotos del elemento recién
        enfocado.
    */
    const fotosPanel =
        createFotosPanel(panelFotosContainer);


    /*
        Fórmula de "Geometría" (#formula-geometria, ver
        galeria.html/galeria.css): se renderiza UNA sola
        vez acá, igual que createMaterialPanel arriba —
        de momento es fija, no cambia según el elemento
        enfocado (ver el comentario de esa sección en
        galeria.html). Si el día de mañana pasa a variar
        por generador, este llamado se movería adentro de
        paramPanel.mostrar() (más abajo), la única otra
        cosa en esta página que ya sabe qué elemento está
        enfocado — no hace falta tocar nada más de acá.

        "renderMathInElement" la expone auto-render.min.js
        (cargado "defer" en el <head>, antes que este mismo
        módulo — ver el comentario ahí sobre el orden de
        ejecución) como global; el guard cubre el caso de
        que el HTML no tenga el contenedor todavía (página
        vieja) o que el script de KaTeX no haya llegado a
        cargar (CDN caído): sin el guard, cualquiera de los
        dos casos tiraría abajo TODO initGaleria() antes de
        llegar al resto de la escena.
    */
    if (
        formulaGeometriaContainer &&
        window.renderMathInElement
    ) {

        renderMathInElement(formulaGeometriaContainer, {
            delimiters: [
                { left: "\\(", right: "\\)", display: false }
            ]
        });

    }


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

        /*
            Mismo motivo que "posicionarGui" arriba: el
            tirador del bottom sheet mide su propio alto real
            (ver galeria-panel-derecho.js) para saber cuánto
            offset hace falta en el estado colapsado — si la
            fuente todavía no había cargado, esa medida
            inicial pudo haber quedado corta o larga de más.
        */
        document.fonts.ready.then(
            panelDerechoSheet.actualizarPosicion
        );

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

        paginacion.update(phase, t);


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

                /*
                    FIX ("no me deja rotar la ficha si me
                    paso un poco de scroll y ya se ve el
                    footer"): el <canvas> sigue recibiendo
                    pointerdown/pointermove acá sin
                    problema (los listeners de
                    galeria-interaccion-ficha.js están
                    puestos una sola vez, sin condicionar
                    por fase) y "elementoActivoId" ahí
                    adentro sigue apuntando al último cono
                    (nunca se llama a reset() al entrar a
                    "final" — ver más arriba), así que el
                    arrastre en sí SÍ se registra y
                    offsetYaw/offsetPitch SÍ cambian. Lo
                    que faltaba es quien los use: sólo
                    carousel.update() compone ese offset
                    (vía getManualOffset) dentro del
                    quaternion que se ve en pantalla (ver
                    ORIENTACIÓN en galeria-carrusel.js), y
                    esa llamada se cortaba en seco al
                    entrar acá — el offset quedaba
                    acumulado puertas adentro, sin efecto
                    visual ninguno.

                    Se llama con t=1 fijo (no con el "t" de
                    arriba de tick(), que en esta rama no
                    corresponde a la fase "fichas") porque
                    la fase "fichas" ya terminó del todo:
                    el círculo quedó cerrado (theta=2π) y
                    el foco en el último elemento
                    (rotateT=1) — es exactamente el mismo
                    estado con el que se llega acá, así
                    que recalcularlo no mueve nada más que
                    la orientación con el offset nuevo (no
                    hace falta revisar "changed": el foco
                    no puede cambiar con t constante).

                    interaccionFicha.update(now) mantiene
                    vivo, también acá, el reset gradual del
                    offset si el visitante retoma el
                    scroll (mismo criterio que ya corre
                    durante "fichas", ver ese archivo).
                */
                interaccionFicha.update(now);
                carousel.update(1);

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

            /*
                Ver el fix junto a la definición de
                "carouselPanel": limpia el override inline
                de opacidad que deja "fichas".
            */
            carouselPanel.style.opacity = "";

            carousel.reset();
            interaccionFicha.reset();
            zoom.reset();
            paneo.reset();
            mapa.reset();
            panelDerechoSheet.reset();
            seccionesPanelDerecho.reset();
            autorotar.reset();
            corte.reset();
            corteControles.reset();
            corteInterseccion.reset();
            planoCorte.reset();

            if (botonMostrarInterseccion) {

                botonMostrarInterseccion.setAttribute(
                    "aria-checked", "false"
                );

            }

            if (botonMostrarPlanoCorte) {

                botonMostrarPlanoCorte.setAttribute(
                    "aria-checked", "false"
                );

            }

            panelParametrosContainer.classList
                .remove("visible");

            paramPanel.limpiar();
            fotosPanel.limpiar();

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

            /*
                Limpia el override inline que "fichas" deja
                en style.opacity (ver el fix junto a la
                definición de "carouselPanel") — si no, ese
                inline pisa para siempre cualquier opacidad
                que el CSS de esta fase quiera aplicar,
                porque un estilo inline gana por
                especificidad sobre una regla de clase.
            */
            carouselPanel.style.opacity = "";

            carousel.reset();
            interaccionFicha.reset();
            zoom.reset();
            paneo.reset();
            mapa.reset();
            panelDerechoSheet.reset();
            seccionesPanelDerecho.reset();
            autorotar.reset();
            corte.reset();
            corteControles.reset();
            corteInterseccion.reset();
            planoCorte.reset();

            if (botonMostrarInterseccion) {

                botonMostrarInterseccion.setAttribute(
                    "aria-checked", "false"
                );

            }

            if (botonMostrarPlanoCorte) {

                botonMostrarPlanoCorte.setAttribute(
                    "aria-checked", "false"
                );

            }

            panelParametrosContainer.classList
                .remove("visible");

            paramPanel.limpiar();
            fotosPanel.limpiar();

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

            /*
                Ver el fix junto a la definición de
                "carouselPanel": limpia el override inline
                de opacidad que deja "fichas".
            */
            carouselPanel.style.opacity = "";

            carousel.reset();
            interaccionFicha.reset();
            zoom.reset();
            paneo.reset();
            mapa.reset();
            panelDerechoSheet.reset();
            seccionesPanelDerecho.reset();
            autorotar.reset();
            corte.reset();
            corteControles.reset();
            corteInterseccion.reset();
            planoCorte.reset();

            if (botonMostrarInterseccion) {

                botonMostrarInterseccion.setAttribute(
                    "aria-checked", "false"
                );

            }

            if (botonMostrarPlanoCorte) {

                botonMostrarPlanoCorte.setAttribute(
                    "aria-checked", "false"
                );

            }

            panelParametrosContainer.classList
                .remove("visible");

            paramPanel.limpiar();
            fotosPanel.limpiar();

            /*
                FIX (bug reportado: "el mapa de la primera
                ficha a veces no aparece centrado en su
                posición"): antes esto arrancaba recién en
                "orden" (ver esa rama, más abajo) — "una
                fase antes de que el cuadrado sea visible",
                que en teoría alcanza, pero si el visitante
                scrollea rápido puede cruzar TODA "orden" y
                llegar a "fichas" antes de que la promesa de
                cargar() (MapLibre ~200kb + Turf + fetch del
                estilo) termine de resolver — ver el
                comentario grande junto a update() en
                galeria-mapa.js para el detalle completo de
                qué pasa en ese caso ("reengancha" ya con el
                focoContinuo vigente, que puede estar bien
                lejos de 0: el mapa nunca llega a mostrarse
                asentado sobre el primer pin).

                Arrancar acá, una fase entera antes, le da
                ese margen extra sin cambiar nada del
                comportamiento normal — cargar() sigue
                siendo idempotente (no hace nada si ya está
                en curso o lista, ver esa función), así que
                llamarla en cada frame de "revelado" es
                igual de seguro que ya lo era en "orden".
            */
            mapa.cargar();

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

            /*
                Ver el fix junto a la definición de
                "carouselPanel": limpia el override inline
                de opacidad que deja "fichas".
            */
            carouselPanel.style.opacity = "";

            carousel.reset();
            interaccionFicha.reset();
            zoom.reset();
            paneo.reset();
            mapa.reset();
            panelDerechoSheet.reset();
            seccionesPanelDerecho.reset();
            autorotar.reset();
            corte.reset();
            corteControles.reset();
            corteInterseccion.reset();
            planoCorte.reset();

            if (botonMostrarInterseccion) {

                botonMostrarInterseccion.setAttribute(
                    "aria-checked", "false"
                );

            }

            if (botonMostrarPlanoCorte) {

                botonMostrarPlanoCorte.setAttribute(
                    "aria-checked", "false"
                );

            }

            /*
                Red de seguridad: la carga diferida del
                mapa ya arrancó una fase antes, en
                "revelado" (ver el fix ahí, y la cabecera
                de galeria-mapa.js) — así llega con más
                margen a "fichas" incluso si el visitante
                scrollea rápido. Se sigue llamando también
                acá por si se entrara a esta página con el
                scroll ya restaurado a mitad de "orden"
                (recarga, #hash, back/forward del
                navegador) sin haber pasado frame a frame
                por "revelado". Llamarla en cada frame de
                esta fase sigue siendo seguro: cargar() es
                idempotente (no hace nada mientras ya está
                cargando o lista).
            */
            mapa.cargar();

            gui.classList.add("visible");

            panelParametrosContainer.classList
                .remove("visible");

            paramPanel.limpiar();
            fotosPanel.limpiar();


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

            /*
                "visible" queda como marca de estado para
                el resto del CSS de este panel (si "visible"
                gobierna algo más que opacidad, p.ej.
                pointer-events o layout) — pero la OPACIDAD
                en sí ya no sale de esta clase: se fija más
                abajo, cuadro a cuadro, con "panelOpacity"
                (ver el fix junto a la definición de
                "carouselPanel" más arriba).
            */
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
                FIX: opacidad del panel atada al mismo
                número que ya anima la geometría del
                elemento en foco (ver "panelOpacity" en
                galeria-carrusel.js) — no un fade por
                tiempo fijo vía CSS. Se fija ACÁ, recién
                después de tener "result" (así "t=0" de
                esta fase ya entra con el "panelOpacity"
                real de ese instante, típicamente
                cfg.minOpacity, no 1 de entrada como pasaba
                con la transición de la clase "visible" —
                ver el fix junto a la definición de
                "carouselPanel").
            */
            carouselPanel.style.opacity =
                result.panelOpacity;

            /*
                Mapa dentro del cuadrado (ver
                galeria-mapa.js): "mostrar()" remide el
                contenedor (por si el cuadrado recién se
                volvió visible este frame — barato, no
                hace nada si no cambió de tamaño).

                FIX (bug reportado: el mapa se adelantaba
                al segundo punto apenas la primera
                geometría terminaba de centrarse):
                "update()" ya NO recibe "t" crudo — recibe
                "result.focoContinuo", el mismo número que
                "result" ya trae de carousel.update(t) de
                arriba y que llega a cada entero
                EXACTAMENTE cuando ese elemento se centra
                en la geometría 3D (misma meseta/
                transición que ya gobierna phi ahí — ver
                "focoContinuo" en galeria-carrusel.js).
                "t" crudo incluía el tramo "formar" del
                arranque de "fichas", durante el cual la
                geometría ya está con el primer elemento
                centrado y quieto pero "t" seguía avanzando
                parejo — eso adelantaba el vuelo del mapa
                antes de tiempo.
            */
            mapa.mostrar();
            mapa.update(result.focoContinuo, now);

            /*
                Recién acá se sabe el foco vigente de este
                frame. VA PRIMERO de las 3 llamadas de
                "setElementoActivo/setObjetoActivo" de
                acá abajo (antes vivía última, sin ninguna
                razón técnica para ese orden — ver más
                abajo): "setElementoActivo" es un no-op
                barato si el foco no cambió (ver
                galeria-corte.js), pero si SÍ cambió,
                dispara —vía su callback interno
                onElementoCambiado— planoCorte.actualizar(),
                que reparenta los 3 planos al mallaFrontal
                del cono NUEVO. interaccionFicha y zoom (
                debajo) leen planoCorte.obtenerMallasHitTest()
                este mismo frame para armar su lista de
                mallas hit-testables — si corte.
                setElementoActivo() corriera después, esa
                lectura llegaría un frame tarde, apuntando
                todavía al mallaFrontal del cono ANTERIOR
                (mismo tipo de desfase de un frame que ya
                se corrigió para "sincronizarMundo()" más
                abajo, sólo que ahí la corrección fue mover
                esa llamada DESPUÉS de rotation.update();
                acá es mover ÉSTA antes de las otras dos).

                "sincronizarMundo()" (SIEMPRE, haya
                cambiado el foco o no) recalcula los 3
                planos de MUNDO del cono activo contra su
                transform de ESTE frame (ver la cabecera de
                galeria-corte.js, "por qué hay dos
                representaciones") — sigue llamándose por
                separado, más abajo, después de
                rotation.update(), sin cambios: ese es el
                otro desfase ya documentado, distinto de
                éste.
            */
            corte.setElementoActivo(result.elementoId);

            /*
                Si cambió el foco respecto del anterior,
                deja arrastrable al nuevo elemento (sin
                heredar el offset del que se acaba de
                perder de foco — ver setElementoActivo en
                galeria-interaccion-ficha.js).

                "obtenerMallasExtra" (inyectado en la
                construcción, más arriba) ya lee
                planoCorte.obtenerMallasHitTest() al vuelo
                en cada hit-test (pointerdown) — no hace
                falta pasarle nada extra acá, sólo el id.
            */
            interaccionFicha.setElementoActivo(
                result.elementoId
            );

            /*
                Mismas mallas que ya usa el hit-test del
                drag manual (ver
                galeria-interaccion-ficha.js) — el wheel-
                zoom testea contra el MISMO objeto en
                foco, no contra uno propio. El día que
                exista la nube Potree, quien decida "se
                está mostrando la nube, no el cono" pasa
                acá sus mallas en vez de las de
                cones[...] — galeria-zoom.js no cambia.

                + planoCorte.obtenerMallasHitTest(): mismo
                agregado que ya recibió el drag manual —
                los planos de corte visibles también valen
                para hacer zoom, no sólo para rotar. Ya
                refleja el cono NUEVO en este mismo frame
                gracias al reorden de arriba (corte.
                setElementoActivo antes que esta llamada).
            */
            zoom.setObjetoActivo(
                cones[result.elementoId]
                    .userData.mallas
                    .concat(
                        planoCorte.obtenerMallasHitTest()
                    )
            );

            /*
                Mismas mallas exactas que acaba de recibir
                "zoom" (misma línea de arriba) — el paneo
                testea contra el mismo objeto en foco, ver
                galeria-paneo.js.
            */
            paneo.setObjetoActivo(
                cones[result.elementoId]
                    .userData.mallas
                    .concat(
                        planoCorte.obtenerMallasHitTest()
                    )
            );

            /*
                Mismo "emphasis" que ya decide
                posición/escala/opacidad: el
                destacado gira a peso pleno, el resto
                desacelera a medida que el foco se
                aleja — ver galeria-carrusel.js.

                Switch "Autorotado" (ver
                galeria-autorotar.js): apagado, se pisa a 0
                SOLO el peso del elemento en foco — los
                vecinos que recién perdieron el foco siguen
                su desaceleración normal, sin cortarse en
                seco (ver la cabecera de galeria-autorotar.js
                para el porqué). Copia nueva del objeto, no
                se muta "result.rotationWeights": ese mismo
                objeto podría tener otro uso más abajo en
                este mismo frame.
            */
            const pesosRotacion =
                autorotar.activo()
                    ? result.rotationWeights
                    : {
                          ...result.rotationWeights,
                          [result.elementoId]: 0
                      };

            rotation.update(pesosRotacion, now);

            /*
                FIX (plano de corte desalineado de la
                geometría con "Autorotado" prendido, bug
                reportado): "sincronizarMundo()" (ver la
                cabecera de galeria-corte.js) tiene que
                leer "mallaFrontal.matrixWorld" DESPUÉS de
                que TODO lo que puede tocar la transform
                del cono este frame ya corrió — y
                "rotation.update()" (arriba) es exactamente
                eso: escribe "pivote.rotation.y" cada
                frame para el autorotado. Antes esta línea
                vivía junto a "corte.setElementoActivo()",
                ANTES de "rotation.update()" — sincronizaba
                los planos de MUNDO contra el ángulo de
                rotación del frame ANTERIOR, un frame
                desfasado del que finalmente usa
                "renderer.render()" más abajo. Con el
                pivote centrado en el bbox real (no en el
                anclaje), ese desfase de un frame no es una
                traslación pura — deja un residuo
                proporcional a cuánto giró el cono ese
                frame, chico en términos angulares pero muy
                amplificado en el PlaneHelper (que mide
                ~1.4x la diagonal del bbox, ver
                galeria-plano-corte.js) — de ahí que se
                viera como el plano completo corrido hacia
                un costado, mientras el recorte real
                (ceñido a la superficie) apenas temblaba.
            */
            corte.sincronizarMundo();

            if (result.changed) {

                updatePanel(
                    result.elementoId,
                    result.displayIndex
                );

            }

        }


        /*
            Se llaman SIEMPRE (no sólo dentro del bloque
            "fichas" de arriba), mismo motivo para las
            dos:

              - zoom.update(now): si el visitante hizo
                zoom y ahora vuelve a mover el scroll de
                página (incluso ya fuera de "fichas", p.
                ej. mientras la fase todavía está
                terminando de salir), tiene que poder
                arrancar/seguir el reset gradual del
                offset — ver el mecanismo completo,
                mismo que ya usa
                galeria-interaccion-ficha.js para
                yaw/pitch, en galeria-zoom.js.

              - zoom.aplicarOffset(): si el visitante hace
                zoom y el scroll avanza a otra fase sin
                que el offset llegara a resetearse todavía
                (no debería pasar — zoom.reset() se llama
                en los mismos 4 puntos donde ya se
                resetean carousel/interaccionFicha, ver
                más arriba—, pero dejarlo acá es más
                robusto que asumirlo).

            Sin offset acumulado (caso normal, fuera de
            "fichas"), ambas son no-ops baratos (guards
            internos en galeria-zoom.js: update() sale
            apenas "resetPendiente" es false, y
            aplicarOffset() sale apenas offset ===
            offsetAplicado).
        */
        zoom.update(now);
        zoom.aplicarOffset();

        /*
            Mismo par, mismo motivo, para el paneo (ver
            galeria-paneo.js) — hermano directo del dolly
            de arriba, ambas llamadas son no-ops baratos
            sin offset acumulado.
        */
        paneo.update(now);
        paneo.aplicarOffset();

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

        /*
            resize() (galeria-escena.js) reescribe
            camera.position de forma incondicional, sin
            el guard "sinCambios" que sí tiene
            setCameraLado — así que cualquier offset
            acumulado por wheel-zoom o por paneo con botón
            derecho quedaría corrupto (ver galeria-zoom.js
            / galeria-paneo.js) si no se limpia acá. Se
            opta por la opción "simple" que quedaba
            abierta en zoom3dScroll.md para el zoom, y se
            aplica igual acá para el paneo: los dos se
            resetean a 0 en cada resize, en vez de
            reaplicarse sobre la nueva posición base.
        */
        zoom.reset();
        paneo.reset();

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

        /*
            Rotación de pantalla incluida: el breakpoint de
            780px puede cruzarse en cualquier dirección acá
            (por ejemplo, un celular pasando de vertical a
            horizontal deja de calificar como "mobile" a
            mitad de sesión), y el alto real del tirador
            puede cambiar con el ancho disponible — se
            remide siempre, es barato si no cambió nada.
        */
        panelDerechoSheet.actualizarPosicion();

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
            Mismo motivo que en la medición inicial (ver su
            comentario, más arriba): "panelDerechoSpecs" vive
            en un contenedor distinto ("#ficha-panel-marco",
            ancho fijo propio), no en ".ficha__fila" — el
            ancho que calcularAnchoMaximoCampo() mide no
            aplica acá.
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

        /*
            A PROPÓSITO no se llama acá a "autorotar.reset()":
            el switch "Autorotado" es GLOBAL dentro de
            "fichas", no por ficha — si el visitante lo apaga
            mirando una geometría, tiene que seguir apagado al
            scrollear/arrastrar a la siguiente (result.changed,
            que es lo que dispara este updatePanel()). Antes
            había un reset() acá que lo volvía a prender en
            cada cambio de foco; se sacó para que "apagado"
            sea una preferencia que persiste mientras el
            visitante siga recorriendo fichas.

            El reset SÍ sigue viviendo en los 4 puntos donde
            galeria.js sale de "fichas" del todo (ver
            autorotar.reset() en esas 4 ramas de fase) — ahí
            corresponde arrancar de nuevo encendido, porque es
            una sesión nueva de "fichas", no un cambio de foco
            dentro de la misma. Ver también la cabecera de
            galeria-autorotar.js, que documenta este mismo
            criterio (nunca decía que había que resetear acá;
            este FIX lo contradecía).
        */


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
            cones[elementoId]
        );


        /*
            Miniaturas de "Fotografías": mismo momento
            que paramPanel arriba (cambia junto con el
            resto del panel derecho al cambiar de foco).
            "elemento.fotos" ya viene armado por
            normalizarElemento() en galeria-config.js —
            este módulo no necesita saber nada del
            GeoJSON.
        */

        fotosPanel.mostrar(elemento.fotos);


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
