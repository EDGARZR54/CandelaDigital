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
import { capturarDOM } from "./galeria-dom.js";
import { createGuiController } from "./galeria-gui.js";
import { fijarOpacidadPanel } from "./three/galeria-utils.js";


async function initGaleria() {

    /*
        Todas las referencias a elementos fijos del
        markup se capturan en un solo lugar (ver
        galeria-dom.js) — acá solo se desestructuran con
        los mismos nombres de siempre, así el resto de
        este archivo no cambia.
    */
    const {
        galeriaFija,
        spacer,
        sceneContainer,
        hero,
        heroTexto,
        proyectoPanel,
        proyectoContenedor,
        proyectoCifraCascarones,
        gui,
        carouselPanel,
        panelIndex,
        panelNombre,
        panelSubtitulo,
        panelFicha,
        panelDerechoSpecs,
        panelDerechoCuadro,
        panelDerecho,
        fichaSheetTirador,
        botonAutorotar,
        botonMostrarInterseccion,
        botonMostrarPlanoCorte,
        fichaControlesContainer,
        panelParametrosContainer,
        panelMaterialContainer,
        panelFotosContainer,
        formulaGeometriaContainer,
        scrollHint,
        paginacionContainer
    } = capturarDOM();

    /*
        La transición CSS de opacidad de "#carousel-panel.visible"
        (galeria.css) es por tiempo fijo, sin relación con
        cuánto tarda la geometría en asentarse (ver
        "opacityFinal" en galeria-carrusel.js). Por eso el
        fade de esta ficha se maneja por SCROLL: cada frame
        de "fichas" fija "carouselPanel.style.opacity"
        directo, al mismo "panelOpacity" que ya rige la
        opacidad del cono en foco (ver tick(), más abajo).
        Se anula acá la transición para que esa asignación
        cuadro a cuadro no quede amortiguada por el CSS.
    */
    carouselPanel.style.transitionProperty = "opacity";
    carouselPanel.style.transitionDuration = "0s";


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
        Se mide al cargar, con los elementos reales, el
        ancho/alto máximo que necesita cada campo de la
        ficha entre todos ellos (panel en opacidad 0
        todavía, no se alcanza a ver).

        "let", no "const": el nombre usa clamp(...vw...),
        así que esta medida depende del viewport al
        momento de medir. remedirFicha() (más abajo, en
        cada resize) la recalcula para el viewport actual,
        así ancho fijo y tipografía renderizada nunca
        quedan desalineados.
    */


    const GAP_SPECS_HORIZONTAL = 22;
    const ANCHO_MINIMO_CAMPO = 64;
    const ANCHO_MAXIMO_CAMPO_DEFAULT = 260;

    /*
        Tope de ancho por campo de specs (superficie,
        altura, estado, etc.), medido contra el ancho
        REAL disponible en vez de un default fijo de
        260px (el que usa galeria-ficha.js el resto del
        tiempo).

        En retrato hay alto de sobra, así que no hace
        falta forzar nada: se devuelve "undefined" y
        calcularDimensionesFicha cae a su propio default.

        En horizontal de celular (ver el media query de
        #carousel-panel en galeria.css) el alto es el
        recurso escaso: ahí sí hace falta que las specs
        entren en una sola fila, así que se calcula el
        ancho por columna para que todas quepan lado a
        lado.

        Se mide el ancho real de ".ficha__fila" (padre de
        "#panel-ficha") con getBoundingClientRect() — ya
        viene con el espacio del panel derecho descontado,
        sin necesidad de aproximarlo a mano. GAP_SPECS_HORIZONTAL
        replica el gap real de "#carousel-panel .specs" en
        ese breakpoint; si cambia en galeria.css, actualizar
        acá también.
    */
    function calcularAnchoMaximoCampo() {

        const fila = panelFicha.parentElement;

        if (!fila) return undefined;

        const anchoDisponible =
            fila.getBoundingClientRect().width;

        /*
            La grilla real es 4 columnas fijas
            ("grid-template-columns: repeat(4, auto)",
            ver "#carousel-panel .specs" en galeria.css) —
            se lee del CSS computado en vez de escribir
            "4" a mano, para que este cálculo siga
            automático si ese valor cambia algún día.
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
        Versión GENÉRICA de "dimensionesFicha": panelDerecho
        no tiene nombre/subtítulo propios, solo campos. Se
        mide contra "panelDerechoSpecs" (opacidad 0 en este
        punto de la carga, no se ve). Sin "anchoMaximoCampo"
        propio a propósito: ese ancho es el de ".ficha__fila"
        (panelFicha) — "#ficha-panel-marco" (donde vive este
        panel) tiene su propio ancho fijo vía
        "--ficha-panel-ancho" en galeria.css.
    */
    let dimensionesPanelDerecho =
        calcularDimensionesCampos(
            elementos,
            "panelDerecho",
            panelDerechoSpecs
        );

    /*
        calcularAnchoMaximoCampo() solo mira el ancho; una
        columna angosta puede necesitar más líneas (más
        alto). Se apoya en que renderizarFicha() ya aplica
        minHeight con el peor caso a cada campo (ver
        galeria-ficha.js), así que carouselPanel.scrollHeight
        —medido directo del DOM en vez de estimar paddings a
        mano— ya refleja el alto máximo real. Se llama desde
        remedirFicha() (resize) y al final de updatePanel()
        (primera entrada a "fichas" sin resize de por medio).
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
        Elemento actualmente mostrado en la ficha (o null
        si todavía no se mostró ninguno) — remedirFicha()
        lo necesita para re-pintar el contenido real tras
        recalcular dimensionesFicha en un resize.
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
        alto real de #galeria-spacer, que empuja al
        <footer> hasta el final del recorrido. Se le suma
        un alto de ventana extra: al llegar a la fase
        "final", #galeria-escena-fija pasa a
        position:absolute y deja de empujar el flujo — ese
        viewport extra es el tramo de scroll que tarda la
        escena liberada en desaparecer antes de que el
        footer entre en pantalla.
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
        Si el visitante alterna el tema (navbar, ver
        js/navbar.js), el fondo/niebla/mesa de la escena
        3D se recalculan en vivo — mismo patrón que
        js/fondo-3d.js en index.html. También dispara
        mapa.actualizarTema() (alterna el basemap claro/
        oscuro): "mapa" se crea más abajo, pero el
        callback solo corre ante un cambio real de
        atributo, cuando la inicialización síncrona ya
        terminó, así que para entonces ya existe.
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
                    Sin esto, hiddenDropActual/
                    filaBottomNdcYActual (galeria-escena.js)
                    quedarían calculados para el order
                    crudo sin actualizarse al reordenar —
                    ver computePuntosSuperioresFila ahí.
                */
                actualizarHiddenDrop: actualizarHiddenDropParaOrden,
                /*
                    Mismo bbox real en mundo por elemento
                    que ya recibe createCarouselController
                    (ver más abajo) — acá lo usa
                    levelSeparation para calcular la
                    separación de niveles del arco de
                    reordenamiento a partir de la
                    profundidad Z real de cada geometría,
                    en vez de una constante fija (ver
                    comentario de levelSeparation en
                    galeria-reordenar.js).
                */
                bboxesPorIndice
            }
        );

    /*
        "elementos" ya viene garantizado no-vacío. Se
        construye acá, después de "reorder", porque
        necesita "reorder.getOrder" para etiquetar cada
        dot de ficha con el elemento que ocupa ese slot
        REALMENTE (no el orden crudo del GeoJSON).
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
        Sincronización inicial: mismo motivo que
        "Sincronización inicial" en
        galeria-panel-material.js (mostrarMalla) —
        "corteInterseccion" nace con su "activo" interno en
        false (ver createCorteInterseccion), sin leer el
        HTML por su cuenta, así que si "#boton-mostrar-
        interseccion" arranca en aria-checked="true" hay que
        empujar ese estado a mano ACÁ, una sola vez, o el
        switch queda visualmente prendido sin que las curvas
        se hayan dibujado nunca.
    */
    if (
        botonMostrarInterseccion &&
        botonMostrarInterseccion.getAttribute(
            "aria-checked"
        ) === "true"
    ) {

        corteInterseccion.setActivo(true);

        corteInterseccion.actualizar(
            corte.obtenerEstadoActivo()
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
        Rotación manual (arrastre) del elemento en foco
        durante "fichas" (ver galeria-interaccion-ficha.js).
        Se crea antes que "carousel" porque este último
        necesita su getOffset (getManualOffset) para sumarlo
        a rotationY. "obtenerMallasExtra" reusa
        planoCorte.obtenerMallasHitTest tal cual: los planos
        de corte visibles también quedan agarrables para
        rotar.
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

    /*
        "getPositions" (no "positions" crudo) para que el
        layout coincida con el que reorder.js dejó parado
        al salir de "orden", sin salto horizontal. No
        recibe "getHiddenDrop" (la versión línea->círculo
        no esconde nada, todo queda visible sobre el
        círculo); en cambio necesita "bboxesPorIndice" para
        el offset entre el anclaje de cada elemento y el
        centro real de su bbox (ver cabecera de
        galeria-carrusel.js).
    */
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
        Panel de material: se crea una sola vez, ya con
        "cones" completo, y queda visible desde el
        arranque (no depende de fase ni de foco — ver el
        CSS de #panel-material en galeria.css). Se
        construye antes que "paramPanel" porque este
        necesita materialPanel.actualizarAristasDeGrupo
        para mantener sincronizado el overlay de malla al
        reconstruir geometría.
    */
    const materialPanel =
        createMaterialPanel(
            panelMaterialContainer, cones
        );

    /*
        "bboxesPorIndice" (misma referencia que ya reciben
        carousel/corte): sin pasarla, el bbox cacheado de
        un elemento reconstruido quedaría viejo, y
        galeria-carrusel.js seguiría centrando su offset
        contra el tamaño anterior.

        "onGeometriaReconstruida" avisa a los dos overlays
        visuales de corte (intersección, plano) que se
        redibujen contra el bbox nuevo — corte.js ya
        invalidó su propio bbox cacheado por su cuenta.
        Cubre tanto un slider individual como "Restaurar
        predeterminados".

        "actualizarAristasDeGrupo" (de materialPanel, ya
        creado arriba) hace que el overlay de malla de un
        elemento con "Mostrar malla" activo siga cualquier
        reconstrucción de su geometría, no solo el slider
        de densidad.
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
        Miniaturas de "Fotografías": se crea una sola vez
        y se repuebla en cada cambio de foco vía
        fotosPanel.mostrar() (más abajo).
    */
    const fotosPanel =
        createFotosPanel(panelFotosContainer);


    /*
        Fórmula de "Geometría" (#formula-geometria): se
        renderiza una sola vez, fija (no cambia según el
        elemento enfocado — ver galeria.html).
        "renderMathInElement" la expone auto-render.min.js
        como global; el guard cubre HTML viejo sin el
        contenedor, o KaTeX sin cargar (CDN caído).
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
        contenido real para que #carousel-panel tenga su
        alto definitivo, así posicionarGui() puede medirlo.
        Cualquier elemento sirve (el alto es el mismo para
        todos, ver dimensionesFicha) — este primer render
        es descartable, la fase "fichas" lo repinta con el
        elemento real.
    */

    renderizarFicha(
        elementos[0],
        dimensionesFicha,
        { panelNombre, panelSubtitulo, panelFicha }
    );


    /*
        GUI de reordenar (botones + posicionamiento del
        "top" de #gui) — ver galeria-gui.js para el porqué
        de cada pieza (panelNombre.bottom, GUI_TOP_MINIMO,
        getRowBottomScreenY). Se instancia acá porque recién
        acá están disponibles reorder, phases y
        getRowBottomScreenY (de la escena).
    */
    const guiController = createGuiController({
        gui,
        panelNombre,
        reorder,
        phases,
        sortOptions: CONFIG.sortOptions,
        getRowBottomScreenY
    });

    const {
        posicionarGui,
        renderSortButtons,
        wireSortButtons
    } = guiController;

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
                Ya pasamos el total de scroll de las 5
                fases: soltamos el contenedor clavado (si
                todavía no lo estaba). La escena liberada
                (position:absolute) tarda un alto de
                ventana más en salir de vista del todo (ver
                ajustarAltoScroll más arriba) — mientras
                dure ese tramo sigue siendo visible, así que
                se sigue renderizando y el último cono
                sigue rotando.
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
                    El <canvas> sigue recibiendo el
                    arrastre manual acá (los listeners de
                    galeria-interaccion-ficha.js no se
                    condicionan por fase), así que hay que
                    seguir componiendo ese offset en el
                    render: se llama carousel.update(1) con
                    t fijo (mismo estado final de "fichas":
                    círculo cerrado, foco en el último
                    elemento) para que el offset de rotación
                    manual se vea reflejado.
                    interaccionFicha.update(now) mantiene el
                    reset gradual si el visitante retoma el
                    scroll.
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

            /* Limpia el override inline que deja "fichas" (ver carouselPanel arriba). */
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

            /* Limpia el override inline que deja "fichas" (ver carouselPanel arriba). */
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

            /* Limpia el override inline que deja "fichas" (ver carouselPanel arriba). */
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
                Arranca acá (una fase antes de que el
                cuadrado del mapa sea visible) para darle
                margen a la carga de MapLibre + Turf +
                estilo (ver update() en galeria-mapa.js): si
                el visitante scrollea rápido y cruza toda
                "orden" antes de que resuelva, el mapa
                "reengancha" con el focoContinuo vigente en
                vez de asentarse sobre el primer pin.
                cargar() es idempotente, así que llamarla en
                cada frame es seguro.
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

            /* Limpia el override inline que deja "fichas" (ver carouselPanel arriba). */
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
                mapa.cargar() ya arrancó en "revelado"; se
                sigue llamando acá (idempotente) por si se
                entra con el scroll restaurado a mitad de
                "orden" sin haber pasado por esa fase.
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
                "visible" sigue gobernando el resto del CSS
                del panel (pointer-events, layout), pero la
                opacidad en sí se fija más abajo, cuadro a
                cuadro, con "panelOpacity" (ver carouselPanel
                arriba).
            */
            carouselPanel.classList.add(
                "visible"
            );

            panelParametrosContainer.classList
                .add("visible");


            /*
                Antes de carousel.update(): si hay un reset
                de rotación manual en curso, avanza un frame
                de suavizado para que carousel.update() lea
                el offset de ESTE frame, no el anterior.
            */
            interaccionFicha.update(now);

            const result =
                carousel.update(t);

            /*
                Opacidad atada a "panelOpacity" (mismo
                número que anima la geometría del elemento
                en foco, ver galeria-carrusel.js), fijada
                después de tener "result" para que t=0 ya
                entre con el valor real (típicamente
                cfg.minOpacity, no 1).
            */
            carouselPanel.style.opacity =
                result.panelOpacity;

            /*
                mapa.mostrar() remide el contenedor (no-op
                si no cambió de tamaño). mapa.update() recibe
                "result.focoContinuo" (no "t" crudo): llega a
                cada entero exactamente cuando el elemento se
                centra en la geometría 3D — "t" crudo incluía
                el tramo "formar" del arranque de "fichas" y
                adelantaba el vuelo del mapa antes de tiempo.
            */
            mapa.mostrar();
            mapa.update(result.focoContinuo, now);

            /*
                Va primero de las 3 llamadas de
                setElementoActivo/setObjetoActivo de acá
                abajo: si el foco cambió, dispara
                planoCorte.actualizar() (reparenta los 3
                planos al cono nuevo) — interaccionFicha y
                zoom leen esas mallas hit-testables este
                mismo frame, así que necesitan que ya estén
                al día. sincronizarMundo() (siempre, cambie o
                no el foco) sigue llamándose por separado más
                abajo, después de rotation.update(): recalcula
                los 3 planos de mundo contra la transform de
                ESTE frame (ver cabecera de galeria-corte.js).
            */
            corte.setElementoActivo(result.elementoId);

            /*
                Si cambió el foco, deja arrastrable al nuevo
                elemento sin heredar el offset del anterior.
                "obtenerMallasExtra" ya lee
                planoCorte.obtenerMallasHitTest() al vuelo en
                cada hit-test.
            */
            interaccionFicha.setElementoActivo(
                result.elementoId
            );

            /*
                Mismas mallas que usa el hit-test del drag
                manual, más planoCorte.obtenerMallasHitTest():
                el wheel-zoom testea contra el mismo objeto
                en foco, planos de corte incluidos.
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
                Emphasis de posición/escala/opacidad de
                galeria-carrusel.js: el destacado gira a
                peso pleno, el resto desacelera con la
                distancia al foco. Con "Autorotado" apagado
                se pisa a 0 solo el peso del elemento en
                foco (los vecinos siguen desacelerando
                normal, ver galeria-autorotar.js). Copia
                nueva del objeto: "result.rotationWeights"
                se reusa más abajo en este mismo frame.
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
                sincronizarMundo() tiene que leer
                mallaFrontal.matrixWorld después de
                rotation.update() (que recién escribió
                pivote.rotation.y para el autorotado de este
                frame) — si corriera antes, los planos de
                corte quedarían sincronizados contra el
                ángulo del frame anterior, visible como el
                plano temblando/desalineado con "Autorotado"
                prendido.
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
            Se llaman siempre, no solo dentro de "fichas":
            si el visitante hizo zoom y retoma el scroll
            (incluso ya en otra fase), zoom.update() sigue
            el reset gradual del offset, y
            zoom.aplicarOffset() lo aplica si todavía no
            terminó de resetearse. Sin offset acumulado
            ambas son no-ops baratos (guards internos en
            galeria-zoom.js).
        */
        zoom.update(now);
        zoom.aplicarOffset();

        /* Mismo par, mismo motivo, para el paneo (ver galeria-paneo.js). */
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
            resize() reescribe camera.position sin el
            guard que sí tiene setCameraLado, así que
            cualquier offset de wheel-zoom/paneo quedaría
            corrupto si no se resetea acá.
        */
        zoom.reset();
        paneo.reset();

        ajustarAltoScroll();

        /*
            Remide dimensionesFicha para el viewport actual
            y repinta el elemento activo. Antes de
            posicionarGui(): el alto de la ficha tiene que
            estar actualizado cuando se mide ahí abajo.
        */

        remedirFicha();

        posicionarGui();

        /*
            Se remide siempre (barato si no cambió nada):
            el breakpoint de 780px puede cruzarse en
            cualquier dirección con la rotación de pantalla.
        */
        panelDerechoSheet.actualizarPosicion();

    });


    /*
        ==============================
        HELPERS DE DOM
        (renderSortButtons/wireSortButtons quedaron en
        galeria-gui.js — acá arriba, en "guiController")
        ==============================
    */


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
            "panelDerechoSpecs" vive en un contenedor
            distinto ("#ficha-panel-marco", ancho fijo
            propio), no en ".ficha__fila" — el ancho de
            calcularAnchoMaximoCampo() no aplica acá.
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
                después de re-renderizar con las medidas
                nuevas — medir acá antes sería contra el
                contenido/anchos viejos.
            */
            updatePanel(
                elementoIdActual,
                displayIndexActual
            );

        } else {

            /*
                Todavía no se mostró ningún elemento (p.
                ej. resize durante "hero"): se limpia el
                max-height que hubiera quedado, se mide
                bien la primera vez que updatePanel() corra.
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
            A propósito no se llama acá a autorotar.reset():
            el switch "Autorotado" es global dentro de
            "fichas", no por ficha — si el visitante lo
            apaga mirando una geometría, sigue apagado al
            pasar a la siguiente. El reset sí vive en los 4
            puntos donde galeria.js sale de "fichas" del
            todo, porque ahí sí es una sesión nueva.
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
            Después de renderizarFicha(), el DOM ya tiene
            aplicado el minHeight de peor caso en cada campo
            — es el momento correcto para medir. Cubre
            entrar a "fichas" la primera vez sin resize.
        */
        ajustarAltoFichaSegunContenido();


        /*
            Apunta al Group del elemento recién enfocado.
            Se llama siempre, incluso si el elemento no
            expone parámetros (no arma controles en ese caso).
        */
        paramPanel.mostrar(
            elementoId,
            cones[elementoId]
        );


        /*
            Mismo momento que paramPanel: "elemento.fotos"
            ya viene armado por normalizarElemento() en
            galeria-config.js.
        */
        fotosPanel.mostrar(elemento.fotos);


        /* Pequeño fundido al cambiar de elemento. */
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
