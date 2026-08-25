/* ==================================================
   galeria-corte-controles.js

   Cablea los 3 sliders + 3 botones de invertir de la
   sección "Visualización" (ex "Corte", ver
   "#ficha-controles" en galeria.html) contra
   galeria-corte.js — módulo aparte a propósito,
   mismo criterio de separación que ya usa esta página entre
   galeria-panel-derecho.js (gesto del bottom sheet, DOM) y
   galeria-rotacion.js (Three.js puro): este archivo no
   importa "three" ni sabe qué es un plano de corte, solo
   traduce eventos del DOM a "onCambioEje"/"onInvertirEje"
   (inyectados, no importados — mismo patrón de
   "getManualOffset"/"onCambio" que ya usan
   galeria-carrusel.js y galeria-panel-derecho-secciones.js).

   FUENTE DE VERDAD DEL ESTADO POR DEFECTO: el HTML mismo
   (value="100" en cada slider, aria-pressed="false" en cada
   botón de invertir — ver galeria.html) — mismo criterio que
   galeria-panel-derecho-secciones.js: este módulo LEE esos
   valores al construirse y los guarda para reset(), así el
   default no queda duplicado acá en JS y allá en HTML.

   RESET: lo llama galeria.js en dos momentos —

     - Los mismos 4 puntos donde sale de "fichas" del todo
       (junto a autorotar.reset()/panelDerechoSheet.reset()/
       etc.).

     - Cada vez que CAMBIA el elemento en foco DENTRO de
       "fichas" (scroll/drag entre fichas, sin salir de la
       fase) — vía "onElementoCambiado", el mismo callback
       que ya le inyecta galeria.js a
       createCorteController() en galeria-corte.js. Así los
       sliders vuelven a mostrar "100% / sin invertir" apenas
       el visitante pasa a una ficha nueva, en sincronía con
       que ese nuevo cono también arranca sin cortar del lado
       de Three.js (galeria-corte.js resetea el ESTADO real
       en el mismo momento, por su cuenta — este módulo solo
       necesita quedar visualmente consistente con eso, no
       hay coordinación fina que hacer entre los dos).
================================================== */


const EJES = ["x", "y", "z"];


export function createCorteControles(
    contenedor, { onCambioEje, onInvertirEje } = {}
) {

    /*
        Sin el contenedor (HTML desactualizado, o esta
        página todavía no lo tiene) el resto de galeria.js
        puede seguir llamando reset() sin chequear null cada
        vez — mismo criterio que el resto de los guards de
        esta página.
    */
    if (!contenedor) {

        return { reset() {} };

    }


    const sliders = {};
    const botonesInvertir = {};

    EJES.forEach(eje => {

        sliders[eje] =
            contenedor.querySelector(
                "#ficha-corte-" + eje
            );

        botonesInvertir[eje] =
            contenedor.querySelector(
                "#ficha-corte-" + eje + "-invertir"
            );

    });


    /*
        Snapshot tal cual lo dejó el HTML, ANTES de que
        ningún input/click lo toque — ver "FUENTE DE VERDAD
        DEL ESTADO POR DEFECTO" en la cabecera del archivo.
    */
    const valorInicial = {};
    const invertidoInicial = {};

    EJES.forEach(eje => {

        valorInicial[eje] =
            sliders[eje] ? sliders[eje].value : "100";

        invertidoInicial[eje] =
            botonesInvertir[eje]
                ? botonesInvertir[eje]
                      .getAttribute("aria-pressed") ===
                          "true"
                : false;

    });


    EJES.forEach(eje => {

        const slider = sliders[eje];

        if (slider) {

            slider.addEventListener("input", () => {

                if (!onCambioEje) return;

                const percent =
                    Number(slider.value) / 100;

                onCambioEje(eje, percent);

            });

        }


        const boton = botonesInvertir[eje];

        if (boton) {

            boton.addEventListener("click", () => {

                if (!onInvertirEje) return;

                /*
                    galeria-corte.js devuelve el nuevo
                    estado "invertido" ya decidido (o null
                    si no hay cono activo, p.ej. un click
                    tardío justo al cambiar de fase) — este
                    módulo solo lo refleja en el DOM, no
                    lleva su propia copia del estado.
                */
                const nuevoInvertido =
                    onInvertirEje(eje);

                if (nuevoInvertido === null) return;

                boton.setAttribute(
                    "aria-pressed",
                    String(nuevoInvertido)
                );

            });

        }

    });


    return {

        reset() {

            EJES.forEach(eje => {

                if (sliders[eje]) {

                    sliders[eje].value =
                        valorInicial[eje];

                }

                if (botonesInvertir[eje]) {

                    botonesInvertir[eje].setAttribute(
                        "aria-pressed",
                        String(invertidoInicial[eje])
                    );

                }

            });

        }

    };

}
