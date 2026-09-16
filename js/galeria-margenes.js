/* ==================================================
   galeria-margenes.js

   Mediciones de layout/viewport para el encuadre de la
   escena 3D y para el alto real de la página:

   - medirAltoNavbar / getMargenVerticalPx /
     getMargenHorizontalPx: margen real que reservan
     navbar y GUI alrededor de la escena, usado por
     createScene (galeria-escena.js) para el encuadre
     de cámara en modo columna/fila.

   - ajustarAltoFichaSegunContenido: tope de alto de
     "#carousel-panel" en horizontal de celular, medido
     contra el contenido real ya renderizado.

   - ajustarAltoScroll: alto real de "#galeria-spacer"
     según el presupuesto de scroll de las 5 fases (ver
     galeria-fases.js).

   Se separó de galeria.js porque ninguna de estas
   funciones es del dominio de otro módulo existente: no
   son DOM fijo puro (galeria-dom.js es deliberadamente
   "tonto", sin lógica) ni son de la ficha (galeria-ficha.js
   no sabe nada de navbar/GUI/scroll) — son puramente
   medición de viewport/layout en vivo.
================================================== */

import { GUI_TOP_MINIMO } from "./galeria-gui.js";

const ALTO_MAXIMO_FICHA_VH_BASE = 58;
const ALTO_MAXIMO_FICHA_VH_TECHO = 82;


/*
    Alto real del scroll-spacer (el bloque real que reserva,
    en el documento, el espacio de scroll de las 5 fases +
    liberación): aplica el presupuesto de "phases" como alto
    real de "spacer", con un alto de ventana extra (al llegar
    a la fase "final", #galeria-escena-fija pasa a
    position:absolute y deja de empujar el flujo — ese
    viewport extra es el tramo de scroll que tarda la escena
    liberada en desaparecer antes de que el footer entre en
    pantalla).
*/
export function ajustarAltoScroll(phases, spacer) {

    phases.updateScrollHeight();

    const total =
        phases.getScrollBudget().total;

    spacer.style.height =
        (total + window.innerHeight) + "px";

}


/*
    Factory: recibe el DOM fijo que ya capturó
    capturarDOM() (gui/sceneContainer/carouselPanel, todos
    disponibles desde el arranque, sin esperar a que exista
    "phases" ni la escena 3D) y devuelve las 4 funciones de
    medición que dependen de ese DOM.
*/
export function crearMedidorMargenes({
    gui,
    sceneContainer,
    carouselPanel
}) {

    /*
        Margen vertical real para el encuadre de cámara en
        modo columna (ejePrincipal="y" — ver
        calcularTargetVertical en galeria-escena.js): navbar
        arriba, botones de orden abajo.

        "top": se mide el navbar real en el DOM
        ("#navbar-placeholder", ver galeria.html), en vez de
        un número fijo — así queda correcto sea cual sea su
        alto en cualquier momento (tema, idioma, rediseño).
        No hay certeza de si navbar.js inyecta un <nav> real
        adentro del placeholder o reemplaza el placeholder
        entero, así que se prueban ambos casos y se cae a
        GUI_TOP_MINIMO solo si ninguno da un alto medible.

        "bottom": mide el "gui" real en vivo. La primera vez
        que createScene llama a esto (durante el armado
        inicial de la escena), los botones de orden todavía
        no se renderizaron (renderSortButtons() corre
        después, ver galeria.js), así que esa primera
        medición da 0 — se autocorrige en el primer
        resize()/recentrado posterior, una vez que el GUI ya
        existe.
    */
    function medirAltoNavbar() {

        const contenedor =
            document.getElementById("navbar-placeholder");

        if (!contenedor) return GUI_TOP_MINIMO;

        // navbar.js (confirmado): inyecta el navbar real
        // como ".nav" adentro del placeholder — se usa ese
        // selector exacto en vez de la etiqueta genérica
        // "nav".
        const navbarReal =
            contenedor.querySelector(".nav") ||
            contenedor;

        const bottom =
            navbarReal.getBoundingClientRect().bottom;

        /*
            Umbral > 30 (no > 0): navbar.js inyecta el
            navbar por fetch() dentro de DOMContentLoaded —
            un round-trip de red, no algo instantáneo (ver
            navbar.js). Antes de que resuelva, el placeholder
            está vacío: un div de 0 de alto en y≈0 puede dar
            igual un ".bottom" chico pero POSITIVO (no
            necesariamente 0 exacto, según qué haya arriba en
            el layout) — pasaba el chequeo ">0" igual, y
            terminaba usándose como si fuera el alto real del
            navbar. Un navbar real mide bastante más que 30px
            de alto siempre, así que este umbral filtra ese
            caso sin arriesgar rechazar un navbar genuino pero
            bajo.

            Esto es un colchón, no LA solución: la solución de
            fondo es recalcular en cuanto el navbar realmente
            aparezca — ver el MutationObserver en galeria.js,
            tras el destructuring de createScene.
        */
        return bottom > 30 ? bottom : GUI_TOP_MINIMO;

    }


    function getMargenVerticalPx() {

        const guiRect =
            gui.getBoundingClientRect();

        /*
            "guiRect.height" (no una resta contra
            "guiRect.top") porque "guiRect.top" depende del
            fit de cámara, que a su vez depende de esta misma
            función —usar "top" sería un circuito
            realimentado, no una medición real. La ALTURA
            PROPIA del GUI es una propiedad de su contenido
            (cuántos botones, su CSS), independiente de dónde
            esté parado, y es una medición en vivo: si cambia
            la fuente del sistema o las opciones de orden, el
            alto real cambia solo.

            "+32": número puesto a ojo — no vive en el CSS
            como margin-bottom, es la diferencia entre dos
            mediciones propias del código 3D que no coinciden
            exactamente: findFittedMagnitude() ajusta el
            encuadre usando la silueta COMPLETA de bounding
            boxes, mientras que getRowBottomScreenY() (que
            decide dónde se planta el GUI) usa solo las
            esquinas inferiores-frente
            (computePuntosInferioresFila, en
            galeria-escena.js).

            "MARGEN_EXTRA_ROTACION": el ajuste de cámara mide
            el bbox de cada elemento en su posición de
            DESCANSO (sin rotar). Un elemento GIRANDO (settle
            bounce, foco del carrusel, arrastre manual) puede
            proyectar una silueta más ancha/alta que su bbox
            en reposo — este colchón la absorbe de forma
            pareja. Ajustar contra un radio (esfera
            envolvente, invariante a rotación) en vez del bbox
            alineado a ejes sería más preciso, al menos para
            la fase de carrusel, pero queda pendiente.
        */
        const MARGEN_EXTRA_ROTACION = 40;

        const bottom =
            guiRect.height > 0
                ? guiRect.height + 32 + MARGEN_EXTRA_ROTACION
                : 0;

        const top =
            medirAltoNavbar() + MARGEN_EXTRA_ROTACION;

        return { top, bottom };

    }


    /*
        Margen horizontal real para el encuadre de cámara en
        modo fila (ejePrincipal="x" — ver
        calcularTargetPrincipal en galeria-escena.js): el
        margen que el navbar reserva a los COSTADOS para que
        su propio contenido (texto/logo a la izquierda, botón
        a la derecha) no toque el borde de la ventana — pedido
        original: "que la geometría no sobrepase el mismo
        ancho que tiene el navbar".

        A diferencia de medirAltoNavbar() (arriba), que mide
        ".nav" (el <header> completo, correcto para el alto:
        el navbar ocupa todo el ancho, así que su alto real es
        el alto de ".nav"), acá hace falta ".nav__contenido"
        adentro de "#navbar-placeholder": es el wrapper interno
        que de verdad tiene el padding/max-width que reserva
        espacio para el logo a la izquierda y el botón a la
        derecha (ver navbar.html). Medir ".nav" para esto daba
        left/right ~0 siempre, porque ".nav" sí llega de punta
        a punta de la ventana. Mismo colchón ">30" que
        medirAltoNavbar() para no confundir el placeholder
        vacío con un navbar real — ver ese comentario para el
        porqué del umbral.

        A diferencia de getMargenVerticalPx(), acá NO hace
        falta ningún colchón a mano tipo MARGEN_EXTRA_ROTACION:
        ese colchón existe ahí porque un elemento girando en el
        carrusel puede proyectar una silueta más ANCHA que su
        bbox en reposo, hacia ABAJO/ARRIBA. Ese razonamiento no
        aplica acá: getMargenHorizontalPx() no mide la
        geometría, mide el navbar en sí (que no gira ni cambia
        de forma con las fases de la escena) — su propio
        getBoundingClientRect() ya es el margen real, sin nada
        que compensar.

        "sceneContainer" puede no arrancar en x=0 de la ventana
        (si el layout le agrega algún margen/padding propio) —
        se resta su ".left"/se compara contra su ".right" para
        que el resultado quede en coordenadas RELATIVAS AL
        CONTENEDOR, que es el sistema que usa
        calcularTargetPrincipal (container.clientWidth) en
        galeria-escena.js — mismo criterio que
        getMargenVerticalPx ya aplica para "top"/"bottom" contra
        ese mismo contenedor.
    */
    function getMargenHorizontalPx() {

        const contenedorNavbar =
            document.getElementById("navbar-placeholder");

        const containerRect =
            sceneContainer.getBoundingClientRect();

        if (!contenedorNavbar) return { left: 0, right: 0 };

        // No se puede usar ".nav" (el <header> completo): llega
        // de punta a punta de la ventana y no tiene padding
        // lateral propio, así que left/right darían ~0 siempre.
        // El margen real para texto/logo (izquierda) y botón
        // (derecha) lo da ".nav__contenido", el wrapper interno
        // que centra el contenido (ver navbar.html: class=
        // "contenedor nav__contenido"). Se cae a ".nav" y
        // después al contenedor del placeholder solo como
        // respaldo si cambia el marcado del navbar.
        const navbarReal =
            contenedorNavbar.querySelector(".nav__contenido") ||
            contenedorNavbar.querySelector(".nav") ||
            contenedorNavbar;

        const navRect =
            navbarReal.getBoundingClientRect();

        // Mismo colchón "todavía no inyectado" que
        // medirAltoNavbar(): un navbar real mide bastante más
        // que 30px de alto siempre, el placeholder vacío no.
        if (!(navRect.height > 30)) return { left: 0, right: 0 };

        const left =
            Math.max(0, navRect.left - containerRect.left);

        const right =
            Math.max(0, containerRect.right - navRect.right);

        return { left, right };

    }


    /*
        Tope de alto de "#carousel-panel" en horizontal de
        celular (alto el recurso escaso, ver el media query
        de "#carousel-panel" en galeria.css): se apoya en que
        renderizarFicha() ya aplica minHeight con el peor caso
        a cada campo (ver galeria-ficha.js), así que
        carouselPanel.scrollHeight —medido directo del DOM en
        vez de estimar paddings a mano— ya refleja el alto
        máximo real. Se llama desde remedirFicha() (resize) y
        al final de updatePanel() (primera entrada a "fichas"
        sin resize de por medio) en galeria.js.
    */
    function ajustarAltoFichaSegunContenido() {

        const esHorizontalBajo =
            window.matchMedia(
                "(max-height: 500px) " +
                "and (orientation: landscape)"
            ).matches;

        if (!esHorizontalBajo) {

            /*
                Fuera de ese breakpoint no hay que forzar
                nada: se limpia cualquier max-height inline
                que hubiera quedado de una rotación anterior,
                y manda de nuevo el CSS normal (sin tope, hay
                alto de sobra).
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


    return {
        medirAltoNavbar,
        getMargenVerticalPx,
        getMargenHorizontalPx,
        ajustarAltoFichaSegunContenido
    };

}
