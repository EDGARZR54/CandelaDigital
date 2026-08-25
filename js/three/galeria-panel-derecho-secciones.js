/* ==================================================
   galeria-panel-derecho-secciones.js

   Toggle de las secciones colapsables del panel derecho
   ("Ubicación", "Opciones de visualización", "Geometría",
   "Simulación", "Levantamiento 3D", "Fotografías" — ver el
   bloque ".ficha__panel-seccion--colapsable" en
   galeria.html). "Opciones de visualización" y "Geometría"
   son, entre otras cosas, los paneles lil-gui de debug (ver
   galeria-panel-material.js / galeria-panel-parametros.js),
   mudados acá adentro — este módulo no las conoce por
   nombre ni por tipo de contenido: lee TODO
   ".ficha__seccion-header" que haya dentro del panel al
   construirse, así que sumar/renombrar/reordenar una
   sección en galeria.html (sea cual sea su contenido) no
   requiere tocar este archivo.
   Módulo APARTE de galeria-panel-derecho.js a propósito:
   ese archivo es específico del GESTO del bottom sheet
   completo (arrastre + snap, solo mobile) — esto es un
   simple par header/panel (clic para expandir/colapsar,
   activo en cualquier viewport), sin nada en común salvo
   vivir en la misma región del DOM. Mismo criterio de
   "un módulo, una responsabilidad" que ya separa
   galeria-zoom.js de galeria-interaccion-ficha.js pese a
   compartir el mismo elemento en foco.

   INDEPENDIENTES, NO ACORDEÓN: cada sección se abre/
   cierra sin afectar a las demás (pedido explícito) — a
   diferencia de un acordeón clásico de "una sola abierta
   a la vez", acá no hay coordinación entre cabeceras.

   FUENTE DE VERDAD DEL ESTADO POR DEFECTO: el HTML mismo
   (el "aria-expanded" con el que arranca cada
   ".ficha__seccion-header" — ver galeria.html: solo
   "Ubicación" en "true"; el resto —"Opciones de
   visualización", "Geometría", "Simulación",
   "Levantamiento 3D", "Fotografías"— en "false", todas
   colapsadas de entrada). Este módulo
   LEE esos valores al construirse y los guarda para
   reset() — así el default vive en un solo lugar (el
   marcado), no duplicado acá en JS y allá en HTML con
   riesgo de que se desincronicen.

   RESET AL VOLVER A "fichas": galeria.js llama a
   reset() en los mismos 4 puntos donde ya llama a
   panelDerechoSheet.reset()/carousel.reset()/etc. (toda
   transición que sale de "fichas") — así la próxima vez
   que el visitante vuelva a esta fase, el panel arranca
   siempre en el mismo estado (solo "Ubicación" expandida,
   el resto colapsado), no en el que haya quedado de la
   visita anterior.

   POR QUÉ EL COLAPSO EN SÍ ES CSS PURO (grid-template-
   rows 0fr/1fr, ver ".ficha__seccion-contenido" en
   galeria.css) Y NO ALGO QUE ESTE MÓDULO ANIME A MANO:
   a diferencia del drag del bottom sheet (que necesita
   seguir el dedo en tiempo real, frame a frame) acá solo
   hace falta togglear un estado — "expandido" o no — y
   dejar que la transición CSS se encargue de la
   animación sola, sin rAF ni requestAnimationFrame
   propios (mismo motivo, a menor escala, que ya explica
   la cabecera de galeria-panel-derecho.js sobre por qué
   ESE módulo tampoco usa rAF para el drag).

   POR QUÉ AVISA A "onCambio" (parámetro opcional): en
   mobile, el panel entero es un bottom sheet cuya
   posición de reposo (colapsado/expandido, ver
   galeria-panel-derecho.js) depende del alto REAL del
   panel — si una sección colapsa o expande, ese alto
   cambia, y el offset de reposo del sheet completo puede
   quedar desalineado si nadie lo vuelve a calcular. En
   vez de que este módulo conozca panelDerechoSheet
   directamente (acoplaría dos módulos que hoy no se
   conocen entre sí), galeria.js le pasa
   panelDerechoSheet.actualizarPosicion como "onCambio" —
   mismo patrón de inyectar la función en vez de importar
   el módulo entero que ya usa galeria-carrusel.js con
   "getManualOffset" (ver ese archivo).
================================================== */


export function createSeccionesColapsables(
    panel, { onCambio } = {}
) {

    /*
        Sin el panel (HTML desactualizado, o esta página
        todavía no lo tiene) el resto de galeria.js puede
        seguir llamando reset() sin chequear null cada vez
        — mismo criterio que el guard de
        createPanelDerechoSheet en galeria-panel-derecho.js.
    */
    if (!panel) {

        return { reset() {} };

    }

    const cabeceras =
        Array.from(
            panel.querySelectorAll(
                ".ficha__seccion-header"
            )
        );

    if (cabeceras.length === 0) {

        return { reset() {} };

    }

    /*
        Snapshot del estado tal cual lo dejó el HTML, ANTES
        de que ningún clic lo toque — es lo que reset()
        restaura más adelante (ver cabecera del archivo).
    */
    const estadoInicial =
        cabeceras.map(
            cabecera =>
                cabecera.getAttribute("aria-expanded") ===
                    "true"
        );


    function contenidoDe(cabecera) {

        const id =
            cabecera.getAttribute("aria-controls");

        return id
            ? document.getElementById(id)
            : null;

    }


    function aplicar(cabecera, expandido) {

        cabecera.setAttribute(
            "aria-expanded", String(expandido)
        );

        const contenido = contenidoDe(cabecera);

        if (contenido) {

            contenido.dataset.colapsado =
                String(!expandido);

        }

    }


    cabeceras.forEach(cabecera => {

        cabecera.addEventListener("click", () => {

            const expandidoActual =
                cabecera.getAttribute(
                    "aria-expanded"
                ) === "true";

            aplicar(cabecera, !expandidoActual);

            /*
                Recién al TERMINAR la transición CSS del
                colapso (no al hacer clic): "onCambio" hoy
                es panelDerechoSheet.actualizarPosicion,
                que mide getBoundingClientRect() del panel
                — medir a mitad de una animación de alto en
                curso daría un número intermedio, no el
                final. "once:true" porque cada clic dispara
                su propia transición nueva; sin esto, los
                listeners se irían acumulando en cada
                toggle sin que nada los saque.
            */
            if (onCambio) {

                const contenido = contenidoDe(cabecera);

                if (contenido) {

                    contenido.addEventListener(
                        "transitionend",
                        ev => {

                            if (
                                ev.propertyName !==
                                    "grid-template-rows"
                            ) return;

                            onCambio();

                        },
                        { once: true }
                    );

                }

            }

        });

    });


    /*
        Reset INMEDIATO (sin esperar transición, ni falta
        que hace): vuelve cada sección al estado que ya
        tenía en el HTML al cargar la página — ver
        "estadoInicial" más arriba. Se llama junto a
        panelDerechoSheet.reset() en galeria.js, así que
        "onCambio" (si lo hay) ya corre aparte, disparado
        por esa otra llamada — no hace falta duplicarlo
        acá.
    */
    function reset() {

        cabeceras.forEach((cabecera, i) => {

            aplicar(cabecera, estadoInicial[i]);

        });

    }


    return { reset };

}
