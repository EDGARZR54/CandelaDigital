/* ==================================================
   galeria-dom.js

   Punto único de lectura del markup de galeria.html:
   captura acá TODAS las referencias a elementos fijos
   de la página que necesita galeria.js, agrupadas en
   un solo objeto.

   No contiene lógica propia (más allá de un par de
   ".querySelector" sobre hijos directos) — es
   deliberadamente "tonto": si el día de mañana cambia
   un id en galeria.html, este es el único archivo que
   hay que tocar. El resto de galeria.js recibe el
   objeto ya armado y no vuelve a leer el DOM por su
   cuenta para estos elementos.
================================================== */

export function capturarDOM() {

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
        hero se oculta hay que hacerlo en galeria.js, vía
        fijarOpacidadPanel() (ver galeria-utils.js), no
        acá: un pointer-events puesto en el contenedor no
        pisa la regla explícita del hijo.
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
        "dimensionesPanelDerecho" en galeria.js— pero con
        las funciones GENÉRICAS de galeria-ficha.js
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
        mapa, ver galeria-mapa.js.
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
        780px en galeria.css y galeria-panel-derecho.js).
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
        "botonAutorotar" de acá arriba.
    */
    const botonMostrarInterseccion =
        document.getElementById("boton-mostrar-interseccion");

    /*
        Switch "Mostrar plano de corte" — ver
        galeria-plano-corte.js. Mismo criterio que los dos
        de acá arriba.
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
        HTML, ese módulo lo arma en runtime.
    */
    const panelFotosContainer =
        document.getElementById("ficha-fotos-miniaturas");

    /*
        Fórmula fija de la sección "Geometría" — ver el
        comentario junto a "renderMathInElement" en
        galeria.js para el porqué de que se renderice ahí
        y no en un módulo aparte.
    */
    const formulaGeometriaContainer =
        document.getElementById("formula-geometria");

    const scrollHint =
        document.getElementById("scroll-hint");

    const paginacionContainer =
        document.getElementById("galeria-paginacion");


    return {
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
    };

}
