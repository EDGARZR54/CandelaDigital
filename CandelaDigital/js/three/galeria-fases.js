/* ==================================================
   galeria-fases.js

   El recorrido total de scroll se reparte en 5 tramos
   consecutivos ("fases"), cada uno con su propio
   presupuesto en píxeles, calculado a partir de
   config.phases (en unidades de alto de ventana) y de
   la cantidad de elementos:

     hero      - Fundido del texto principal.
     proyecto  - "El proyecto" + cifras: la fila queda
                 quieta, el único cono visible gira
                 sobre sí mismo (ver
                 galeria-proyecto.js).
     revelado  - Cascada: el resto de los elementos
                 sube hasta su lugar. Arranca desde
                 cero recién acá (corte limpio: no se
                 mezcla con las fases anteriores).
     orden     - Pausa: la fila queda quieta y aparece
                 el GUI para reordenar.
     fichas    - "Scroll horizontal": un elemento a la
                 vez se destaca, con su ficha de datos.

   Pasado ese total ya no queda escena que animar:
   getPhase() devuelve la fase "final", que galeria.js
   usa para soltar #galeria-escena-fija y dejar ver el
   <footer> real (ver galeria.css / galeria.html). Este
   módulo ya NO toca document.body.style.height
   directamente: quien llama a updateScrollHeight()
   (galeria.js) es responsable de aplicar
   getScrollBudget().total al alto de #galeria-spacer,
   el elemento real que ahora ocupa ese espacio en el
   documento.
================================================== */


/*
    "getPhase()" ya no lee "window.scrollY"
    directamente: pide el valor a galeria-scroll.js, el
    punto único de lectura de scroll para toda la página
    (ver ese archivo). Así se garantiza que, dentro de un
    mismo frame, esta fase y cualquier otro módulo que
    también pida el scroll (galeria.js, galeria-
    interaccion-ficha.js) vean EXACTAMENTE el mismo
    valor.
*/
import { getScrollY } from "./galeria-scroll.js";


/*
    Orden real en el que ocurren las fases (debe
    coincidir con las claves de config.phases, salvo
    "perElementoFichas" que se usa para calcular
    "fichas" — ver updateScrollHeight más abajo).
*/
const ORDEN_FASES = [
    "hero", "proyecto", "revelado", "orden", "fichas"
];


export function createPhaseController(
    config, elementCount
) {

    let budgetPx = { total: 0 };


    function updateScrollHeight() {

        const vh = window.innerHeight;

        budgetPx = {
            hero: config.phases.hero * vh,
            proyecto: config.phases.proyecto * vh,
            revelado: config.phases.revelado * vh,
            orden: config.phases.orden * vh,
            fichas:
                config.phases.perElementoFichas *
                Math.max(1, elementCount) *
                vh
        };

        budgetPx.total =
            ORDEN_FASES.reduce(
                (suma, nombre) =>
                    suma + budgetPx[nombre],
                0
            );

    }


    /*
        Presupuesto de scroll vigente, en píxeles.
        Lo usa galeria.js para dimensionar
        #galeria-spacer y para calcular el "top" con
        el que se "suelta" #galeria-escena-fija al
        entrar a la fase final.
    */

    function getScrollBudget() {

        return budgetPx;

    }


    /*
        Recibe "now" (el mismo timestamp de
        requestAnimationFrame que ya trae tick() en
        galeria.js) para que la lectura de scroll quede
        cacheada dentro del frame en curso — ver
        galeria-scroll.js. Es opcional: si se llama sin
        "now" (p. ej. el chequeo de fase dentro de un
        click handler en wireSortButtons, galeria.js) se
        cae al modo de lectura fresca, sin romper nada.
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


        /*
            Fase final: ya pasamos el total de todos
            los tramos. No hay nada de la escena que
            actualizar; es el tramo en el que
            #galeria-escena-fija se "suelta" (ver
            galeria.js) y el pie de página, que vive
            justo debajo de #galeria-spacer, entra en
            pantalla.
        */

        return { phase: "final", t: 1 };

    }


    updateScrollHeight();


    return {
        updateScrollHeight,
        getPhase,
        getScrollBudget
    };

}
