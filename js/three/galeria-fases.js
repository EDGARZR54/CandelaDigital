/* ==================================================
   galeria-fases.js

   El recorrido total de scroll se reparte en "paradas"
   consecutivas del mismo tamaño por defecto (ver
   config.phases.vhPorParada/pesos en galeria-config.js):
   4 paradas fijas + una parada POR CADA elemento del
   GeoJSON en la fase "fichas". Cada parada dura lo mismo
   salvo que se pese distinto a propósito (ver "pesos" en
   CONFIG).

   Las 4 paradas fijas, en orden real de aparición:

     hero      - Fundido del texto principal.
     proyecto  - "El proyecto" + cifras: la fila queda
                 quieta, el único cono visible gira
                 sobre sí mismo (ver
                 galeria-proyecto.js).
     revelado  - Cascada: el resto de los elementos
                 sube hasta su lugar.
     orden     - Pausa: la fila queda quieta y aparece
                 el GUI para reordenar.

   Después de esas 4 viene "fichas" ("scroll horizontal":
   un elemento a la vez se destaca, con su ficha de
   datos) — de cara a getPhase()/getScrollBudget() es UN
   solo tramo (galeria-carrusel.js y galeria.js ya saben
   partir su "t" entre los n elementos por su cuenta),
   sólo que su presupuesto en píxeles se arma como n
   paradas iguales a las fijas.

   Pasado ese total, getPhase() devuelve la fase "final",
   que galeria.js usa para soltar #galeria-escena-fija y
   dejar ver el <footer> real (ver galeria.css /
   galeria.html). Este módulo no toca
   document.body.style.height directamente: quien llama a
   updateScrollHeight() (galeria.js) aplica
   getScrollBudget().total al alto de #galeria-spacer.
================================================== */


/*
    getPhase() pide el scroll a galeria-scroll.js, el
    punto único de lectura para toda la página, para que
    dentro de un mismo frame todos los módulos que lo
    consultan (galeria.js, galeria-interaccion-ficha.js)
    vean el mismo valor.
*/
import { getScrollY } from "./galeria-scroll.js";


/*
    Orden real en el que ocurren las fases (debe
    coincidir con las claves de config.phases).
*/
const ORDEN_FASES = [
    "hero", "proyecto", "revelado", "orden", "fichas"
];

/*
    Las 4 paradas fijas. "fichas" no está en esta lista
    porque no es una parada individual sino el tramo que
    agrupa una por elemento (ver updateScrollHeight).
*/
const FASES_FIJAS = ["hero", "proyecto", "revelado", "orden"];


export function createPhaseController(
    config, elementCount
) {

    let budgetPx = { total: 0 };

    /*
        Tamaño en píxeles de UNA parada (fase fija, ficha
        individual, o "formar"), según su peso — ver
        "pesos" en config.phases. peso=1 (default) = mismo
        tamaño que cualquier otra parada.
    */
    function pxPorParada(nombrePeso, vh) {

        const pesos = config.phases.pesos || {};
        const peso = pesos[nombrePeso] ?? 1;

        return config.phases.vhPorParada * peso * vh;

    }


    function updateScrollHeight() {

        const vh = window.innerHeight;

        budgetPx = {};

        for (const nombre of FASES_FIJAS) {

            budgetPx[nombre] = pxPorParada(nombre, vh);

        }

        /*
            "fichas" es "elementCount" paradas del mismo
            tamaño que una fase fija. Con 0 elementos se
            usa Math.max(1, elementCount) para no quedar
            en 0.
        */
        budgetPx.fichas =
            pxPorParada("ficha", vh) *
            Math.max(1, elementCount);

        /*
            "config.carousel.formSpan" es la fracción
            GLOBAL (0..1) de "fichas" que ocupa la
            construcción línea->círculo — la leen tal cual
            galeria-carrusel.js y galeria-paginacion.js.
            Se fija acá para que "formar" dure, por
            default, exactamente UNA parada (mismo peso
            que las demás), sin importar "elementCount":
            se divide su ancho fijo por "budgetPx.fichas"
            (ya calculado arriba) para obtener la
            fracción correcta.
        */
        config.carousel.formSpan =
            pxPorParada("formar", vh) /
            budgetPx.fichas;

        budgetPx.total =
            ORDEN_FASES.reduce(
                (suma, nombre) =>
                    suma + budgetPx[nombre],
                0
            );

    }


    /*
        Presupuesto de scroll vigente, en píxeles. Lo usa
        galeria.js para dimensionar #galeria-spacer y para
        calcular el "top" con el que se "suelta"
        #galeria-escena-fija al entrar a la fase final.
    */
    function getScrollBudget() {

        return budgetPx;

    }


    /*
        "now" es el timestamp de requestAnimationFrame de
        tick() (galeria.js), para cachear la lectura de
        scroll dentro del frame en curso (ver
        galeria-scroll.js). Es opcional: sin "now" se cae
        a lectura fresca (p. ej. wireSortButtons).
    */
    function getPhase(now) {

        const y = getScrollY(now);

        let acumulado = 0;

        for (const nombre of ORDEN_FASES) {

            const ancho = budgetPx[nombre];

            if (y < acumulado + ancho) {

                return {
                    phase: nombre,
                    t:
                        ancho > 0
                            ? (y - acumulado) / ancho
                            : 1
                };

            }

            acumulado += ancho;

        }

        return { phase: "final", t: 1 };

    }


    updateScrollHeight();


    return {
        updateScrollHeight,
        getPhase,
        getScrollBudget
    };

}
