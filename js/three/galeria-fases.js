/* ==================================================
   galeria-fases.js

   El recorrido total de scroll se reparte en "paradas"
   consecutivas, TODAS del mismo tamaño por defecto (ver
   config.phases.vhPorParada/pesos en galeria-config.js):
   4 paradas fijas + una parada POR CADA elemento del
   GeoJSON en la fase "fichas" (no una fase "fichas"
   completa del mismo tamaño que cualquiera de las
   fijas — eso era justo el reparto disparejo reportado:
   con 5 elementos, las 4 fijas se llevaban ~47% del
   scroll total entre las 4 y las 5 fichas el ~53%
   restante entre las 5, sin que ninguna parada individual
   durara lo mismo que otra). Ahora cada parada, sea fija
   o ficha, dura lo mismo salvo que se pese distinto a
   propósito (ver "pesos" en CONFIG) — así el usuario
   puede aprender el ritmo del scroll con las primeras
   paradas y anticipar cuánto falta para la próxima,
   tanto en las fases fijas como dentro de las fichas.

   Las 4 paradas fijas, en orden real de aparición:

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

   Después de esas 4 viene "fichas" ("scroll horizontal":
   un elemento a la vez se destaca, con su ficha de
   datos) — de cara a getPhase()/getScrollBudget() sigue
   siendo UN solo tramo (mismo contrato que antes, para
   no tener que tocar galeria-carrusel.js ni galeria.js:
   ambos ya saben partir el "t" de "fichas" entre los n
   elementos por su cuenta), sólo que ahora su presupuesto
   en píxeles se arma como n paradas iguales a las fijas,
   no como un número aparte calibrado a mano.

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

/*
    Las 4 paradas fijas (todo lo que NO es "fichas" —
    ver cabecera). "fichas" se calcula aparte, como
    "elementCount" paradas del mismo tamaño (ver más
    abajo), no está en esta lista porque no es una
    parada individual sino el tramo que las agrupa a
    todas.
*/
const FASES_FIJAS = ["hero", "proyecto", "revelado", "orden"];


export function createPhaseController(
    config, elementCount
) {

    let budgetPx = { total: 0 };


    /*
        Tamaño en píxeles de UNA parada (sea una fase
        fija o una ficha individual), según su peso —
        ver "pesos" en config.phases. peso=1 (default)
        = mismo tamaño que cualquier otra parada; sólo
        se desvía si alguien pesa algo distinto a
        propósito en CONFIG.
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
            "fichas" sigue siendo UN solo tramo de cara a
            getPhase() (ver cabecera), pero su presupuesto
            es "elementCount" paradas del mismo tamaño que
            cualquier fase fija — no un número aparte. Con
            0 elementos (caso límite) no debería quedar en
            0: se usa Math.max(1, elementCount), mismo
            criterio que ya tenía el cálculo viejo.
        */
        budgetPx.fichas =
            pxPorParada("ficha", vh) *
            Math.max(1, elementCount);

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
