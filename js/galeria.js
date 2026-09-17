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

// DEBE ir primero: parchea THREE.ShaderChunk (atenuación
// de luces) y THREE.ColorManagement ANTES de que
// cualquier otro módulo importado más abajo construya un
// Renderer o compile un material — ver el comentario de
// cabecera de galeria-compat-r128.js. Si el parche ya
// está aplicado en otro punto del proyecto, este import
// es simplemente un no-op duplicado.
import "./three/galeria-compat-r128.js";

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
import { createConoLuz } from "./three/galeria-cono-luz.js";
import { createInteraccionFicha } from "./three/galeria-interaccion-ficha.js";
/*
    Dolly de cámara sobre el objeto 3D en foco (cono o,
    a futuro, nube Potree) activado por wheel cuando el
    cursor está sobre ese objeto, sin
    tocar window.scrollY en ningún momento — y, hermano
    directo, paneo de cámara por arrastre con el botón
    derecho sobre ese mismo objeto: no mueve el objeto,
    traslada camera.position, esta vez sobre el plano
    perpendicular al eje de vista en vez de a lo largo de
    él (ver ambos en galeria-controls.js, mismo patrón
    exacto, agrupados en un solo archivo).
*/
import {
    createZoomController,
    createPaneoController
} from "./three/galeria-controls.js";
import { createParamPanel } from "./three/galeria-panel-parametros.js";
import { createMaterialPanel } from "./three/galeria-panel-material.js";
import { createFotosPanel } from "./three/galeria-panel-fotos.js";
import {
    calcularDimensionesFicha,
    renderizarFicha,
    calcularDimensionesCampos,
    renderizarCampos,
    calcularAnchoMaximoCampo
} from "./three/galeria-ficha.js";
import { createMapaController } from "./three/galeria-mapa.js";
import { createPanelDerechoSheet } from "./three/galeria-panel-derecho.js";
import { createSeccionesColapsables } from "./three/galeria-panel-derecho-secciones.js";
import { createAutorotarToggle } from "./three/galeria-autorotar.js";
import { createCorteController } from "./three/galeria-corte.js";
import { createCorteControles } from "./three/galeria-corte-controles.js";
import { createCorteInterseccion } from "./three/galeria-corte-interseccion.js";
import { createPlanoCorte } from "./three/galeria-plano-corte.js";
import { createRejillaController } from "./three/galeria-rejilla.js";
import { createPaginationController } from "./three/galeria-paginacion.js";
// === CÁMARA DEBUG === (opcional — ver galeria-camara-debug.js
// para cómo sacar este módulo por completo: borrar este
// import + las 3 líneas más abajo marcadas igual + el archivo).
import { createCamaraDebug } from "./three/galeria-camara-debug.js";
import { capturarDOM } from "./galeria-dom.js";
import { createGuiController, GUI_TOP_MINIMO } from "./galeria-gui.js";
import { fijarOpacidadPanel } from "./three/galeria-utils.js";
import {
    crearMedidorMargenes,
    ajustarAltoScroll
} from "./galeria-margenes.js";


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
        botonMostrarRejilla,
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

    const {
        medirAltoNavbar,
        getMargenVerticalPx,
        getMargenHorizontalPx,
        ajustarAltoFichaSegunContenido
    } = crearMedidorMargenes({ gui, sceneContainer, carouselPanel });

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


    let dimensionesFicha =
        calcularDimensionesFicha(
            elementos,
            { panelNombre, panelSubtitulo, panelFicha },
            { anchoMaximoCampo: calcularAnchoMaximoCampo(panelFicha) }
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
        alto). ajustarAltoFichaSegunContenido() (ver
        galeria-margenes.js) se apoya en que renderizarFicha()
        ya aplica minHeight con el peor caso a cada campo (ver
        galeria-ficha.js), así que carouselPanel.scrollHeight
        —medido directo del DOM en vez de estimar paddings a
        mano— ya refleja el alto máximo real. Se llama desde
        remedirFicha() (resize) y al final de updatePanel()
        (primera entrada a "fichas" sin resize de por medio).
    */
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
        // A: snapshot al momento de crear la escena, no una
        // referencia viva — ver el "let ejePrincipal" justo
        // abajo, reasignado cada vez que
        // manejarPosibleCambioDeOrientacion() detecta un
        // cruce real.
        ejePrincipal: ejePrincipalInicial,
        resize,
        computeLookAtX,
        setLookAtX,
        setCameraLado,
        actualizarSetupCarrusel,
        actualizarCajasDebug,
        actualizarColoresTema,
        getHiddenDrop,
        getRowBottomScreenY,
        actualizarHiddenDropParaOrden,
        manejarPosibleCambioDeOrientacion,
        // Fase 0 (sombra dirty, ver galeria-escena.js):
        // marcarSombraDirty() se llama en cada punto de este
        // archivo donde una malla con sombra se mueve/rota/
        // escala; prepararRenderDeSombra() se llama justo
        // antes de cada renderer.render().
        marcarSombraDirty,
        prepararRenderDeSombra,
        // Fase 3 (habitación): se llama una vez por frame,
        // sin importar la fase — ver el call site junto al
        // render final del tick().
        actualizarPisoSegunGeometria,
        // Gating de castShadow por elemento (ver
        // actualizarCastShadow en galeria-escena.js): mismo
        // criterio y mismo call site que
        // actualizarPisoSegunGeometria — una vez por frame,
        // sin importar la fase. Va DESPUÉS de ella: usa el
        // piso que esa acaba de dejar (roomGroup.position.y).
        actualizarCastShadow,
        // Fase 4 (luces adicionales): mismo criterio, mismo
        // call site.
        actualizarLucesAdicionalesSegunCamara,
        // Fase 4 (lucesPorCaja): necesita el mapa de foco
        // vigente en cada llamada — ver los call sites por
        // fase, más abajo.
        actualizarLucesPorCaja,
        // Fase 5 (cono de luz, ver galeria-cono-luz.js):
        // "keyLight" es la instancia real (SpotLight) que ese
        // módulo reposiciona cada frame; "getLadoActual"/
        // "getEjePrincipal" son getters (no el valor
        // capturado en este momento) porque ambos cambian con
        // el tiempo.
        keyLight,
        getLadoActual,
        getEjePrincipal,
        // Fase 5 (sistema día/noche, ver el comentario grande
        // junto a su definición en galeria-escena.js). Mitad
        // "luces/materiales"; la otra mitad (haz visible) la
        // expone conoLuz.actualizarTema — ver
        // actualizarTemaSuave(), más abajo.
        actualizarTemaLuces,
        // Fase 5 (sombra de contacto, ver
        // galeria-sombra-contacto.js).
        actualizarSombrasDeContacto,
        actualizarTemaSombraContacto
    } = await createScene(
        sceneContainer, elementos, CONFIG,
        getMargenVerticalPx, getMargenHorizontalPx
    );

    // === CÁMARA DEBUG === (ver comentario junto al import)
    const camaraDebug =
        createCamaraDebug(CONFIG, { renderer, camera, cones });

    // A: mutable — reasignado por
    // recrearControllersPorOrientacion() (más abajo) cada vez
    // que se cruza el umbral horizontal↔vertical en caliente
    // (resize/orientationchange/fullscreenchange). Todo lo que
    // en este archivo necesite el eje VIGENTE debe leer esta
    // variable (nunca capturarla aparte en un const propio),
    // igual que ya hacen los 3 usos de más abajo (reorder/
    // reveal/carousel).
    let ejePrincipal = ejePrincipalInicial;


    const phases =
        createPhaseController(
            CONFIG, elementCount
        );

    /*
        Aplica el presupuesto de scroll (las 5 fases) como
        alto real de #galeria-spacer (ver ajustarAltoScroll()
        en galeria-margenes.js) — empuja al <footer> hasta el
        final del recorrido, con un alto de ventana extra: al
        llegar a la fase "final", #galeria-escena-fija pasa a
        position:absolute y deja de empujar el flujo — ese
        viewport extra es el tramo de scroll que tarda la
        escena liberada en desaparecer antes de que el footer
        entre en pantalla.
    */
    ajustarAltoScroll(phases, spacer);


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


    /*
        Sistema día/noche de la escena 3D (ver config.tema,
        galeria-config.js, y actualizarTemaLuces() en
        galeria-escena.js) — el mismo botón de tema del navbar
        que ya dispara "observadorTema" de arriba (fondo/
        niebla, instantáneo) ahora TAMBIÉN mueve las luces/
        materiales de la escena, pero con una transición
        suave en vez de saltar de golpe: "kTemaActual" (0..1)
        se anima con suavizado exponencial hacia
        "temaObjetivoK()" en cada frame de tick(), sin
        depender del observer (leer un atributo del DOM es
        barato, no hace falta cachear el objetivo — así
        tampoco hay que preocuparse de qué pasa si el
        MutationObserver no llegó a disparar todavía).

        Mismo fallback que alternarTema()/aplicarTemaGuardado()
        en navbar.js: si "data-tema" no está puesto (nunca se
        guardó una preferencia), se usa prefers-color-scheme
        en vez de asumir un valor fijo.
    */
    function temaObjetivoK() {

        const actual =
            document.documentElement.getAttribute('data-tema');

        const esOscuro =
            actual === 'oscuro'
                ? true
                : actual === 'claro'
                ? false
                : window.matchMedia(
                      '(prefers-color-scheme: dark)'
                  ).matches;

        return esOscuro ? 0 : 1;

    }

    // Arranca YA en el valor objetivo (no en 0 ni en 1 fijo):
    // si la página carga en modo claro, la primera aplicación
    // de tema no debe animarse desde "oscuro" — solo se anima
    // un cambio real, iniciado por el visitante.
    let kTemaActual = temaObjetivoK();

    let lastNowTema = null;

    function actualizarTemaSuave(now) {

        if (lastNowTema === null) {

            lastNowTema = now;

        }

        const dt =
            Math.min(100, Math.max(0, now - lastNowTema));

        lastNowTema = now;

        const objetivo = temaObjetivoK();

        const factor =
            1 - Math.exp(-dt / CONFIG.tema.suavizadoMs);

        kTemaActual += (objetivo - kTemaActual) * factor;

        actualizarTemaLuces(kTemaActual);
        conoLuz.actualizarTema(kTemaActual);
        actualizarTemaSombraContacto(kTemaActual);

    }


    let reorder =
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
                bboxesPorIndice,
                ejePrincipal
            }
        );

    /*
        "elementos" ya viene garantizado no-vacío. Se
        construye acá, después de "reorder", porque
        necesita "reorder.getOrder" para etiquetar cada
        dot de ficha con el elemento que ocupa ese slot
        REALMENTE (no el orden crudo del GeoJSON).

        Se pasa como ARROW FUNCTION, no como referencia
        cruda a "reorder.getOrder" — "reorder" es mutable
        (ver más arriba) y puede REASIGNARSE a una instancia
        nueva en un cruce de orientación
        (recrearControllersPorOrientacion, más abajo). Una
        referencia cruda capturaría el método de la instancia
        VIEJA para siempre; esta indirección relee "reorder"
        (la variable, no el objeto) en cada llamada, así que
        sigue apuntando a la instancia vigente sin que
        "paginacion" tenga que enterarse de que hubo un
        cruce.
    */
    const paginacion =
        createPaginationController(
            paginacionContainer, phases, elementos,
            () => reorder.getOrder(), CONFIG
        );

    let reveal =
        createRevealController(
            CONFIG,
            {
                cones,
                getPositions: () => reorder.getPositions(),
                elementCount,
                restY,
                getOrder: () => reorder.getOrder(),
                getHiddenDrop,
                bboxesPorIndice,
                ejePrincipal
            }
        );

    /*
        Último "focoWeights" conocido de la fase "orden",
        para que el cono de luz no salte "de golpe" al
        terminar un reordenamiento — ver el comentario
        grande junto a su uso, en el bloque
        "phase === 'orden'" de tick() más abajo. Arranca en
        {} (nadie en foco): antes de la primera vez que se
        entra a "orden" no importa, ese bloque todavía no
        corrió.
    */
    let focoWeightsOrdenActual = {};

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
            getOrder: () => reorder.getOrder(),
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
        Switch "Mostrar rejilla" (ver galeria-rejilla.js) —
        mismo criterio que corteInterseccion/planoCorte de
        acá abajo: se construye antes y se le pasa el estado
        ya resuelto (corte.obtenerEstadoActivo()) en cada
        callback de más abajo, porque la rejilla ahora cuelga
        del cono en foco, no de "scene" entera.
    */
    const rejilla3d =
        createRejillaController({ cones });

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

                /*
                    Mismo motivo que arriba: reengancha (o
                    esconde) la rejilla al cono recién
                    activado — no-op barato si "Mostrar
                    rejilla" está apagado (ver
                    galeria-rejilla.js). Sin esto, si el
                    visitante cambia de ficha con el switch
                    prendido, la rejilla quedaría colgada del
                    cono anterior hasta el próximo evento que
                    dispare este mismo callback.
                */
                rejilla3d.actualizar(
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
        Switch "Mostrar rejilla": mismo patrón que "Mostrar
        intersección"/"Mostrar plano de corte" de acá abajo —
        al prender, hay que enganchar la rejilla YA al cono
        en foco ahora mismo, sin esto se vería recién cuando
        el visitante cambie de ficha por primera vez. SÍ se
        limpia (el enganche visual, no el booleano) en los 4
        puntos donde galeria.js sale de "fichas" — ver
        rejilla3d.reset() y la cabecera de
        galeria-rejilla.js para el porqué de esa distinción.
    */
    if (botonMostrarRejilla) {

        botonMostrarRejilla.addEventListener(
            "click", () => {

                const nuevoActivo =
                    botonMostrarRejilla.getAttribute(
                        "aria-checked"
                    ) !== "true";

                botonMostrarRejilla.setAttribute(
                    "aria-checked", String(nuevoActivo)
                );

                rejilla3d.setActivo(nuevoActivo);

                if (nuevoActivo) {

                    rejilla3d.actualizar(
                        corte.obtenerEstadoActivo()
                    );

                }

            }
        );

    }

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

        return reorder.getConeIdEnSlot(
            reveal.getHeroSlot()
        );

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

        return reorder.getConeIdEnSlot(0);

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

        return reorder.getConeIdEnSlot(elementCount - 1);

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
            CONFIG,
            { cones, elementCount, marcarSombraDirty }
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
    let carousel =
        createCarouselController(
            CONFIG,
            {
                cones,
                getPositions: () => reorder.getPositions(),
                elementCount,
                restY,
                getOrder: () => reorder.getOrder(),
                bboxesPorIndice,
                getManualOffset: interaccionFicha.getOffset,
                ejePrincipal
            }
        );


    /*
        Cono de luz (Fase 5, ver galeria-cono-luz.js) —
        único shadow caster de toda la escena, así que no
        depende de la fase vigente para EXISTIR (a
        diferencia de "carousel", solo tiene sentido dentro
        de "fichas"): se llama en las 6 fases desde tick(),
        más abajo. NO se recrea en el cruce de orientación
        (no está en recrearControllersPorOrientacion): sus
        dependencias mutables (getPositions/getOrder/
        getHeroSlot) ya van envueltas en arrow functions,
        mismo criterio que el resto de este bloque — siguen
        apuntando a las instancias vigentes de "reorder"/
        "reveal" solas, sin que este controller necesite
        enterarse de nada.
    */
    const conoLuz =
        createConoLuz(
            CONFIG,
            {
                scene,
                keyLight, camera,
                getLadoActual, getEjePrincipal,
                getPositions: () => reorder.getPositions(),
                getOrder: () => reorder.getOrder(),
                getHeroSlot: () => reveal.getHeroSlot(),
                restY, elementCount, cones, bboxesPorIndice
            }
        );

    /*
        Recrea reorder/reveal/carousel con el "ejePrincipal"
        VIGENTE (ver "let ejePrincipal", más arriba) — llamada desde el handler de
        resize/orientationchange/fullscreenchange (más abajo,
        junto a "RESIZE") cuando
        manejarPosibleCambioDeOrientacion() (galeria-escena.js)
        detecta un cruce real horizontal↔vertical.

        Por qué RECREAR en vez de mutar las instancias viejas:
        cada uno de estos 3 controllers decide, en su propia
        construcción (no en cada update()), varias cosas que
        dependen del eje — el orden/dirección de la cascada de
        revelado (galeria-revelado.js), qué coordenada de
        from/to cuenta como "cambió de posición" para el arco
        anti-colisión (galeria-reordenar.js). No son un simple
        "número que se lee distinto cada frame": son decisiones
        de armado que ya quedaron fijas en clausuras privadas
        de cada instancia. Recrear es más simple y más
        confiable que agregarle a cada archivo un método propio
        de "actualizar eje en caliente".

        Mismas 3 construcciones que el arranque (arriba en
        este mismo archivo), con dos diferencias: "ejePrincipal"
        vigente (no el inicial) y "initialOrder" en reorder —
        para que el visitante no pierda un reordenamiento
        manual propio solo por rotar la pantalla.

        "reorder"/"reveal"/"carousel" son "let" (ver sus
        declaraciones, arriba): reasignarlos acá alcanza para
        que TODO el resto del archivo (el loop de render, los
        handlers de fase, etc. — que siempre los llaman como
        "reorder.step(...)"/"reveal.update(...)"/
        "carousel.update(...)", nunca destructurados aparte)
        empiece a usar la instancia nueva de inmediato, sin
        tocar ningún otro call site. "paginacion"/"mapa" NO se
        recrean: ya reciben "reorder.getOrder"/
        "reorder.getPositions" envueltos en una arrow function
        (ver sus construcciones, más arriba), así que siguen
        funcionando solos contra la instancia que sea que
        "reorder" tenga en cada momento.
    */
    function recrearControllersPorOrientacion() {

        const ordenPrevio =
            reorder.getOrder();

        reorder =
            createReorderController(
                CONFIG,
                {
                    cones, computeRowPositions, elementos, restY,
                    computeLookAtX, setLookAtX,
                    actualizarCajasDebug,
                    actualizarHiddenDrop: actualizarHiddenDropParaOrden,
                    bboxesPorIndice,
                    ejePrincipal,
                    initialOrder: ordenPrevio
                }
            );

        reveal =
            createRevealController(
                CONFIG,
                {
                    cones,
                    getPositions: () => reorder.getPositions(),
                    elementCount,
                    restY,
                    getOrder: () => reorder.getOrder(),
                    getHiddenDrop,
                    bboxesPorIndice,
                    ejePrincipal
                }
            );

        carousel =
            createCarouselController(
                CONFIG,
                {
                    cones,
                    getPositions: () => reorder.getPositions(),
                    elementCount,
                    restY,
                    getOrder: () => reorder.getOrder(),
                    bboxesPorIndice,
                    getManualOffset: interaccionFicha.getOffset,
                    ejePrincipal
                }
            );

    }


    /*
        Dolly de cámara sobre el objeto 3D en foco (ver
        createZoomController en galeria-controls.js) —
        agnóstico de si ese objeto es un cono o, a futuro,
        una nube Potree: quien arma cada frame de "fichas"
        es responsable de avisarle con setObjetoActivo()
        cuáles son las mallas vigentes contra las que
        testear el wheel (ver más abajo, dentro de tick()).
    */
    const zoom =
        createZoomController(
            CONFIG, { renderer, camera, phases }
        );

    /*
        Paneo de cámara por arrastre con botón derecho
        sobre el objeto 3D en foco (ver createPaneoController,
        mismo archivo que zoom, galeria-controls.js) — mismo
        criterio que "zoom" acá arriba: agnóstico del objeto,
        recibe sus mallas vigentes vía setObjetoActivo() (ver
        más abajo, dentro de tick(), mismo call site que zoom).
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

        "reorder" es mutable y puede REASIGNARSE a una
        instancia nueva en un cruce de orientación (ver
        recrearControllersPorOrientacion, más arriba). Pasarlo
        tal cual (el objeto crudo) dejaría a "guiController"
        con una referencia congelada a la instancia VIEJA: el
        render loop (tick(), que sí lee "reorder" fresca en
        cada frame) pasaría a stepear la instancia NUEVA,
        mientras los botones de orden seguirían llamando
        animateTo() a la vieja — el reordenamiento quedaría
        roto en silencio, sin ningún error en consola.

        "reorderEstable" expone la MISMA API que
        createReorderController (getOrder/getPositions/
        getSortedOrder/animateTo/step/isBusy/isAnimating), pero
        cada método relee la variable "reorder" (no el objeto)
        en el momento en que se llama — así sigue funcionando
        sin importar cuántas veces se recree "reorder" después,
        y sin importar si galeria-gui.js guarda estos métodos
        sueltos o los llama siempre vía "reorder.metodo(...)".
    */
    const reorderEstable = {
        getOrder: (...args) => reorder.getOrder(...args),
        getPositions: (...args) => reorder.getPositions(...args),
        getSortedOrder: (...args) => reorder.getSortedOrder(...args),
        animateTo: (...args) => reorder.animateTo(...args),
        step: (...args) => reorder.step(...args),
        isBusy: (...args) => reorder.isBusy(...args),
        isAnimating: (...args) => reorder.isAnimating(...args)
    };

    const guiController = createGuiController({
        gui,
        panelNombre,
        reorder: reorderEstable,
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


    /*
        MISMO problema que el del GUI de arriba, pero para
        el navbar: navbar.js (confirmado leyendo ese
        archivo) inyecta el navbar real por fetch() dentro
        de un handler de DOMContentLoaded — un round-trip de
        red, así que casi seguro no está listo todavía en
        este punto de la carga. A diferencia del GUI (que
        esta misma página controla y puede forzar a
        renderizar antes de seguir), acá no hay forma de
        "esperar" de forma síncrona ni un evento propio que
        avise cuándo termina — así que se observa el propio
        DOM: en cuanto "#navbar-placeholder" reciba hijos
        (el innerHTML que arma inyectarParcial), se dispara
        un resize() más, con el alto real del navbar ya
        medible, y se desconecta (esto pasa una sola vez en
        la vida de la página).

        Mientras tanto (los milisegundos entre este punto y
        que la fetch resuelva), el encuadre usa el respaldo
        de medirAltoNavbar() — puede verse por un instante
        con menos despeje del que corresponde, hasta que
        este observer corrija.
    */
    const navbarPlaceholder =
        document.getElementById("navbar-placeholder");

    if (navbarPlaceholder) {

        const navbarObserver =
            new MutationObserver(() => {

                navbarObserver.disconnect();
                resize();

            });

        navbarObserver.observe(
            navbarPlaceholder, { childList: true }
        );

    }


    renderSortButtons();
    wireSortButtons();

    /*
        getMargenVerticalPx() (más arriba) daba "bottom: 0"
        durante el armado inicial de la escena porque el
        GUI todavía no tenía botones (medía 0 de alto).
        Ahora que ya existen, se fuerza un resize() para
        que el encuadre vertical (modo columna) se
        recalcule con el alto real del GUI — mismo
        mecanismo que ya dispara un resize de verdad
        (redimensionar la ventana), solo que activado a
        mano acá una vez.
    */
    resize();

    /*
        Si "#gui" arranca oculto/colapsado por CSS hasta que
        la fase "orden" lo activa (mismo patrón que el navbar,
        que arranca vacío hasta que el fetch lo llena — ver
        navbarObserver más arriba), "getMargenVerticalPx()"
        mide 0 en el resize() forzado de arriba, aunque los
        botones ya existan en el DOM. Un scroll normal (llegar
        a "orden") no dispara un evento "resize" de por sí, así
        que nada corregiría el encuadre sin este observer.

        Mismo mecanismo que "navbarObserver" (arriba), pero con
        ResizeObserver en vez de MutationObserver: "#gui" no
        cambia de HIJOS al activarse (ya los tiene desde
        renderSortButtons()), cambia de TAMAÑO (de colapsado a
        real). Se desconecta apenas el tamaño deja de ser 0×0
        (primer disparo real, "one-shot" como el navbar): de
        ahí en más, cualquier cambio de tamaño legítimo llega
        acompañado de un resize real de ventana o de un cruce
        de orientación (ver manejarCruceDeOrientacion, más
        abajo), que ya disparan un resize completo por su
        cuenta.
    */
    const guiResizeObserver =
        new ResizeObserver((entries) => {

            const { width, height } =
                entries[0].contentRect;

            if (width === 0 && height === 0) return;

            guiResizeObserver.disconnect();
            resize();

        });

    guiResizeObserver.observe(gui);


    /*
        ==============================
        LOOP DE RENDER
        ==============================
    */

    /*
        INVERSIÓN DE CÁMARA EN VERTICAL — DESACTIVADA: el
        arco vertical recorre de "anguloDerecha" (arriba)
        hasta la altura NEUTRA calibrada
        (config.camera.position.y, alcanzada en t=0.5), y de
        ahí en más (0.5->1) la altura queda FIJA en ese piso
        mientras la cámara gira sobre el círculo verde (ver
        cameraPosFromMagnitud en galeria-escena.js): nunca
        baja más allá de esa altura neutra, así que no hay
        ningún tramo que necesite invertirse.

        Se deja el helper (identidad, en vez de borrarlo de
        los 5 call sites) por si en algún momento hiciera
        falta un ajuste de dirección puntual sin tocar cada
        uno por separado.
    */
    function ladoInvertido(lado) {

        return lado;

    }


    /*
        Resetea TODOS los controles propios de "fichas" —
        se llama en cada uno de los 4 puntos de tick() donde
        se sale de esa fase hacia otra (hero/proyecto/
        revelado/orden), en un solo lugar para no tener que
        mantener la lista sincronizada en los 4 puntos.

        No incluye el reset de zoom/paneo del listener de
        "resize" (ver ese bloque más abajo): ese es un caso
        aparte, sin autorotar ni el resto — ver el comentario
        junto a "A propósito no se llama acá a
        autorotar.reset()".
    */
    function resetControlesFicha() {

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

    }


    /*
        "Mostrar intersección" arranca ACTIVADO por defecto
        (a diferencia de "Mostrar plano de corte") — mismo
        criterio que "Autorotado": un reset la vuelve a
        prender en vez de apagarla. corte.reset() (ver
        resetControlesFicha(), arriba) ya dejó
        "activo=false" puertas adentro de corteInterseccion
        (limpia cualquier curva vieja); acá se vuelve a
        prender. No hace falta llamar actualizar() en este
        punto porque corte.reset() tampoco dejó ningún cono
        activo — las curvas recién se dibujan cuando el
        visitante entra a "fichas" y hay un elemento en
        foco.

        rejilla3d.reset(), a diferencia de corteInterseccion/
        planoCorte de acá arriba, NO fuerza "activo" a ningún
        valor — ver "BOOLEANO GLOBAL" en la cabecera de
        galeria-rejilla.js: si el visitante la dejó prendida,
        sigue prendida (y "aria-checked" no se toca acá),
        solo se limpia el enganche visual para no dejarla
        colgada del cono que tenía foco en "fichas".

        Se llama, igual que resetControlesFicha(), en los 4
        puntos de tick() donde se sale de "fichas".
    */
    function resetCorteYPlanos() {

        corteInterseccion.setActivo(true);

        planoCorte.reset();

        rejilla3d.reset();

        if (botonMostrarInterseccion) {

            botonMostrarInterseccion.setAttribute(
                "aria-checked", "true"
            );

        }

        if (botonMostrarPlanoCorte) {

            botonMostrarPlanoCorte.setAttribute(
                "aria-checked", "false"
            );

        }

    }


    /*
        Limpia el panel de parámetros y el de fotografías —
        mismo criterio de deduplicación que las dos de
        arriba, llamada en los mismos 4 puntos (en "orden"
        se llama en un punto ligeramente distinto respecto
        de mapa.cargar()/gui.classList, pero el efecto final
        de estas 3 líneas es el mismo así que no hace falta
        más de un helper).
    */
    function limpiarPanelesParametrosYFotos() {

        panelParametrosContainer.classList
            .remove("visible");

        paramPanel.limpiar();
        fotosPanel.limpiar();

    }


    function tick(now) {

        requestAnimationFrame(tick);

        /*
            Pestaña/app en segundo plano: no hay nada que
            mostrar, así que no vale la pena actualizar
            física de fases, sombras, tema, ni renderizar.
            El navegador de escritorio YA throttlea rAF en
            tabs ocultas, pero en WebViews/navegadores
            móviles ese throttling es menos confiable — este
            corte es explícito y no depende de eso. Se sigue
            pidiendo el próximo frame (arriba) para que el
            loop retome solo apenas la pestaña vuelve a
            primer plano, sin necesidad de un listener de
            visibilitychange aparte: todo lo que sigue de
            acá (fases, reorder, tema) ya lee tiempo real
            ("now"/scroll), así que saltarse frames no deja
            ningún estado a medio camino.
        */
        if (document.hidden) return;


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
            marcarSombraDirty();

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
                const resultFinal = carousel.update(1);
                actualizarLucesPorCaja(resultFinal.focoWeights);
                conoLuz.update(resultFinal.focoWeights, true, now);
                marcarSombraDirty();

                actualizarPisoSegunGeometria();
                actualizarCastShadow();
                actualizarLucesAdicionalesSegunCamara();
                actualizarSombrasDeContacto();
                actualizarTemaSuave(now);

                prepararRenderDeSombra();
                camaraDebug.update(); // === CÁMARA DEBUG ===
                renderer.render(
                    scene,
                    camaraDebug.getCamaraActiva(camera) // === CÁMARA DEBUG ===
                );

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
            setCameraLado(ladoInvertido(0));

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

            actualizarLucesPorCaja({ [heroConeId()]: 1 });
            conoLuz.update({ [heroConeId()]: 1 }, false, now);

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

            resetControlesFicha();

            resetCorteYPlanos();

            limpiarPanelesParametrosYFotos();

        } else if (phase === "proyecto") {

            /*
                Misma razón que en "hero": el arco de
                cámara tampoco arranca todavía, se
                mantiene en el extremo derecho mientras
                se lee el panel de texto.
            */
            setCameraLado(ladoInvertido(0));

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

            actualizarLucesPorCaja({ [heroConeId()]: 1 });
            conoLuz.update({ [heroConeId()]: 1 }, false, now);

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

            resetControlesFicha();

            resetCorteYPlanos();

            limpiarPanelesParametrosYFotos();

        } else if (phase === "revelado") {

            /*
                Recién acá arranca de verdad el viaje de
                la cámara por el arco (mismo "t" 0..1
                propio de este tramo que ya recibe
                reveal.update() abajo — corte limpio
                respecto de "proyecto", igual que la
                cascada): del extremo derecho (0) hasta
                la vista de FRENTE (0.5, "ladoActual"=0.5
                — group shot sin escorzo, ver
                cameraPosFromMagnitud en galeria-escena.js),
                en sincronía con que suben los elementos.

                El tramo se detiene en la mitad del arco: el
                resto (0.5 -> 1, el giro que termina alineado
                con el ancla) ocurre en la fase "fichas", EN
                PARALELO con el doblez línea->círculo, no acá
                (ver esa fase, más abajo).
            */
            setCameraLado(ladoInvertido(0.5 * t));

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
            const { rotationWeights, focoWeights } =
                reveal.update(t);

            rotation.update(rotationWeights, now);
            actualizarLucesPorCaja(focoWeights);
            conoLuz.update(focoWeights, false, now);
            marcarSombraDirty();

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

            resetControlesFicha();

            resetCorteYPlanos();

            limpiarPanelesParametrosYFotos();

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
                El arco de cámara ya llegó a la vista de
                FRENTE en "revelado" (ladoActual=0.5, sin
                escorzo, todas las cajas visibles sin
                oclusión — ver esa fase): queda fijo ahí
                para todo el ordenamiento. El resto del
                arco (0.5 -> 1) recién avanza al entrar a
                "fichas", en paralelo con el doblez (ver
                esa fase, más abajo).
            */
            setCameraLado(ladoInvertido(0.5));

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

            resetControlesFicha();

            resetCorteYPlanos();

            /*
                mapa.cargar() ya arrancó en "revelado"; se
                sigue llamando acá (idempotente) por si se
                entra con el scroll restaurado a mitad de
                "orden" sin haber pasado por esa fase.
            */
            mapa.cargar();

            gui.classList.add("visible");

            limpiarPanelesParametrosYFotos();


            /*
                Mientras no haya una animación de
                reordenamiento en curso, todos los
                elementos quedan quietos en su
                lugar (según el "order" vigente).
            */

            /*
                "conoLuz.update()" y "actualizarLucesPorCaja()"
                se llaman siempre, dentro y fuera de
                "reorder.isAnimating()", en vez de vivir los
                dos adentro de este mismo "if" — si vivieran
                ahí, mientras una animación de animateTo()
                está en curso nunca se llamarían: el keyLight
                y el cono visible quedarían completamente
                congelados en la posición de antes del
                reordenamiento, mientras los propios conos
                (elementos) sí se mueven de a poco cada frame
                vía reorder.step() (ver más arriba en tick()).
                Recién en el primer frame en que
                reorder.isAnimating() pasa a false, ese "if"
                se cumpliría y conoLuz.update() correría con
                el layout ya terminado, generando un salto
                de golpe. Interpolar "positions" en
                galeria-reordenar.js no alcanza por sí solo:
                de nada sirve un getPositions() que interpola
                en vivo si quien lo consume no se llega a
                llamar mientras dura la interpolación.

                La separación real que hace falta es otra:
                "reveal.update(1)" SÍ debe seguir gateada
                detrás de "!isAnimating()" —llamarla durante
                el reordenamiento pelearía por
                cone.position cada frame contra
                reorder.step(), que ya está moviendo los
                conos con su propio arco anti-colisión (dos
                dueños del mismo cone.position en el mismo
                frame, orden de ejecución indefinido)—, pero
                "conoLuz.update()"/"actualizarLucesPorCaja()"
                NO tocan cone.position en absoluto: solo LEEN
                getPositions()/getOrder()/getHeroSlot() (ya
                interpolados en vivo, ver galeria-reordenar.js)
                para orientar keyLight/lucesPorCaja. No hay
                ningún conflicto en llamarlas TAMBIÉN mientras
                reorder.isAnimating() es true.

                "focoWeightsOrdenActual" (declarada arriba,
                junto a "reveal") cachea el último mapa que
                reveal.update(1) calculó, para seguir
                alimentando a las dos mientras dura la
                animación y reveal.update() no se está
                llamando — no tiene sentido recalcular el foco
                a mitad de un reordenamiento (la cámara no se
                mueve, solo se redistribuyen elementos), así
                que sostener el último valor conocido hasta
                que reveal.update() vuelva a correr al
                terminar es exactamente lo que hacía la
                maqueta (que no tenía este problema porque no
                reordenaba en vivo).
            */

            if (!reorder.isAnimating()) {

                const { focoWeights } = reveal.update(1);
                focoWeightsOrdenActual = focoWeights;
                actualizarLucesPorCaja(focoWeights);

            } else {

                actualizarLucesPorCaja(focoWeightsOrdenActual);

            }

            conoLuz.update(focoWeightsOrdenActual, false, now);
            marcarSombraDirty();

        } else {

            /*
                phase === "fichas"
            */

            /*
                Acá no se fija la cámara — ver más abajo,
                después de carousel.update(), que es quien la
                mueve en lockstep con el doblez.
            */

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

            actualizarLucesPorCaja(result.focoWeights);
            conoLuz.update(result.focoWeights, true, now);
            marcarSombraDirty();

            /*
                El resto del arco de cámara (0.5 -> 1, ver
                "ladoActual" en galeria-escena.js) no tiene un
                tramo de scroll propio: avanza EN PARALELO con
                el doblez línea->círculo, usando el mismo
                "blend" (0..1, theta/2π) que ya gobierna esa
                geometría. Se le pasa primero a la escena la
                geometría fresca del círculo cerrado/ancla que
                "calcularArcoCamara" necesita para el tramo
                extra (ver actualizarSetupCarrusel en
                galeria-escena.js) — recién calculada este
                mismo frame por carousel.update(), así que
                nunca queda un frame atrás.
            */
            actualizarSetupCarrusel({
                circuloCerrado: result.circuloCerrado,
                anclaPrincipalMundo: result.anclaPrincipalMundo,
                anclaMundoX: result.anclaMundoX
            });

            setCameraLado(
                ladoInvertido(0.5 + 0.5 * result.blend)
            );

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
                Mismas mallas para el hit-test de wheel-zoom y
                paneo: el objeto en foco + los planos de corte
                visibles (planoCorte.obtenerMallasHitTest() al
                vuelo). Se arma una sola vez acá y se reusa
                para los dos, en vez de repetir el mismo
                .concat() por módulo.
            */
            const mallasFoco =
                cones[result.elementoId]
                    .userData.mallas
                    .concat(
                        planoCorte.obtenerMallasHitTest()
                    );

            zoom.setObjetoActivo(mallasFoco);
            paneo.setObjetoActivo(mallasFoco);

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
            galeria-controls.js).
        */
        zoom.update(now);
        zoom.aplicarOffset();

        /* Mismo par, mismo motivo, para el paneo (ver galeria-controls.js). */
        paneo.update(now);
        paneo.aplicarOffset();

        /*
            Mismo criterio: rejilla3d.update() tiene que
            correr siempre, no solo dentro de "fichas", para
            que un fundido en curso (entrada o salida, ver
            galeria-rejilla.js) termine de resolverse aunque
            el visitante cambie de fase a mitad de camino —
            reset() limpia todo de forma instantánea al salir
            de "fichas", así que en la práctica esto rara vez
            tiene algo que animar fuera de esa fase, pero
            sigue siendo un no-op barato (dos colecciones
            casi siempre vacías) si no hay nada puesto.
        */
        rejilla3d.update(now);

        /*
            Fase 3 (habitación): una vez por frame, sin
            importar la fase (mismo criterio que la maqueta,
            que la llama incondicionalmente en animate()) —
            en horizontal es un no-op (early return a y=0
            dentro de la función), en vertical sigue al
            elemento más bajo de la columna. Tiene que correr
            DESPUÉS de que el resto del tick() ya haya
            posicionado los conos de este frame (reveal/
            reorder/carousel, más arriba) — lee sus posiciones
            de mundo tal cual quedaron.
        */
        actualizarPisoSegunGeometria();
        actualizarCastShadow();
        actualizarLucesAdicionalesSegunCamara();
        actualizarSombrasDeContacto();
        actualizarTemaSuave(now);

        prepararRenderDeSombra();
        camaraDebug.update(); // === CÁMARA DEBUG ===
        renderer.render(
            scene,
            camaraDebug.getCamaraActiva(camera) // === CÁMARA DEBUG ===
        );

    }


    requestAnimationFrame(tick);


    /*
        ==============================
        RESIZE
        ==============================
    */

    /*
        Factorizada aparte para poder reusarla también
        después de un cruce real de orientación (ver
        manejarCruceDeOrientacion, más abajo), que necesita
        la MISMA cadena de reencuadre/remedición, no una
        aparte.
    */
    function refrescarTrasResize() {

        resize();

        // === CÁMARA DEBUG === (mismo aspect que usa
        // calcularLayoutDeFila en galeria-escena.js: el del
        // contenedor, no el de window, por si algún día
        // sceneContainer no ocupa el viewport completo).
        camaraDebug.resize(
            sceneContainer.clientWidth /
                sceneContainer.clientHeight
        );

        /*
            LineMaterial (los ejes de "Mostrar rejilla", ver
            galeria-rejilla.js) calcula el grosor en píxeles
            a partir de esta resolución — sin actualizarla
            acá, quedarían con el grosor calculado para el
            viewport viejo.
        */
        rejilla3d.actualizarResolucion();

        /*
            resize() reescribe camera.position sin el
            guard que sí tiene setCameraLado, así que
            cualquier offset de wheel-zoom/paneo quedaría
            corrupto si no se resetea acá.
        */
        zoom.reset();
        paneo.reset();

        ajustarAltoScroll(phases, spacer);

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

    }

    window.addEventListener("resize", refrescarTrasResize);


    /*
        Recalcula cambios de orientación de layout ante
        resize/pantalla completa/giro de celular, SIN
        recargar la página.

        Separado del listener de "resize" de arriba (que
        sigue corriendo en CADA evento, sin debounce —
        comportamiento de siempre, solo reencuadra la cámara
        dentro de la MISMA orientación) porque esto hace algo
        bastante más caro: recalcular todo el layout de la
        fila (mesa, frustum de sombra — ver
        manejarPosibleCambioDeOrientacion en
        galeria-escena.js) y recrear reorder/reveal/carousel
        desde cero. Se dispara con DEBOUNCE (200ms desde el
        último evento) para no repetir ese trabajo caro en
        cada tick de un arrastre de ventana o durante la
        animación de una rotación de celular.

        Escucha "resize" (redimensionar ventana de
        escritorio), "orientationchange" (girar el celular —
        en algunos navegadores el "resize" que lo acompaña
        llega con timing distinto, o con dimensiones todavía
        viejas, así que hace falta escuchar los dos por las
        dudas) y "fullscreenchange" (entrar/salir de pantalla
        completa) — los tres pueden cruzar el umbral
        horizontal↔vertical sin que la página se recargue.
    */
    let debounceOrientacion = null;

    function manejarCruceDeOrientacion() {

        clearTimeout(debounceOrientacion);

        debounceOrientacion =
            setTimeout(() => {

                const resultado =
                    manejarPosibleCambioDeOrientacion();

                if (!resultado.cambio) return;

                ejePrincipal = resultado.ejePrincipal;

                recrearControllersPorOrientacion();

                // Misma cadena de reencuadre/remedición que
                // ya corre en cada "resize" — el layout
                // recién cambió de verdad, así que hace
                // falta igual (o más) que en un resize común.
                refrescarTrasResize();

            }, 200);

    }

    window.addEventListener(
        "orientationchange", manejarCruceDeOrientacion
    );
    window.addEventListener(
        "resize", manejarCruceDeOrientacion
    );
    document.addEventListener(
        "fullscreenchange", manejarCruceDeOrientacion
    );


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
                        calcularAnchoMaximoCampo(panelFicha)
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
