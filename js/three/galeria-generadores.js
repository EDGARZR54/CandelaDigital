/* ==================================================
   galeria-generadores.js

   Los módulos de ./geometrias/ no comparten un
   nombre fijo para su función constructora de
   geometría: cono-sinusoidal.js / la-muela.js /
   los-manantiales.js exportan
   "crearGeometriaConoSinusoidal", pero
   protomartir.js exporta "crearGeometriaBovedaEstrellada"
   y paraguas.js exporta "crearGeometriaCubiertaHypar"
   — cada uno con el nombre que mejor describe su
   propia fórmula.

   Esta función resuelve, para cualquier módulo, cuál
   es esa función: primero busca un export genérico
   "crearGeometria" (por si algún módulo futuro
   decide usar ese nombre neutro), y si no lo
   encuentra, busca el primer export cuyo nombre
   empiece con "crearGeometria". Así, agregar una
   geometría nueva no obliga a tocar galeria-escena.js
   ni galeria-panel-parametros.js, siempre que su
   función principal siga esa convención de nombre.
================================================== */

import { IS_MOBILE_TIER } from "./galeria-dispositivo.js";


export function obtenerFuncionConstructora(modulo) {

    if (typeof modulo.crearGeometria === "function") {

        return modulo.crearGeometria;

    }


    const nombreEncontrado =
        Object.keys(modulo).find(
            key =>
                key.startsWith("crearGeometria") &&
                typeof modulo[key] === "function"
        );

    if (nombreEncontrado) {

        return modulo[nombreEncontrado];

    }


    throw new Error(
        "El módulo no expone ninguna función " +
        "\"crearGeometria*\" (se esperaba, por " +
        "ejemplo, \"crearGeometria\" o " +
        "\"crearGeometriaAlgo\")."
    );

}


/*
    Resolución de tesselado (segmentos x/y de
    ParametricGeometry) a pasarle al constructor de cada
    generador, gateada por IS_MOBILE_TIER — mismo
    precedente que shadowMapSize/dust.count/clearcoat en
    galeria-escena.js.

    Los generadores hoy varían mucho en cuántos triángulos
    piden por defecto (desde ~9.600 en paraguas.js hasta
    ~45.000 en protomartir.js/los-manantiales.js) sin que
    esa diferencia responda necesariamente a cuán curva es
    cada superficie — así que en vez de imponer un número
    fijo desde acá (que le quedaría bien a unos generadores
    y mal a otros), se ESCALA la resolución propia de cada
    uno: cada módulo de ./geometrias/ exporta opcionalmente
    "RESOLUCION_DEFECTO" (mismo espíritu que
    PARAMETROS_DEFECTO), y acá solo se multiplica por un
    factor fijo en mobile.

    Devuelve "undefined" cuando no corresponde escalar nada
    (desktop, o un módulo que no exporta
    RESOLUCION_DEFECTO — p. ej. un generador nuevo que
    todavía no lo sumó) — quien llama simplemente pasa ese
    "undefined" como argumento "resolucion" del
    constructor, y JS lo trata como "no se pasó nada": el
    generador cae solo en SU propio default interno, sin
    ninguna rama especial acá.
*/
const FACTOR_RESOLUCION_MOBILE = 0.6;

export function obtenerResolucionGateada(modulo) {

    if (!IS_MOBILE_TIER) return undefined;

    const base = modulo.RESOLUCION_DEFECTO;

    if (!base) return undefined;

    return {
        x: Math.max(
            8,
            Math.round(base.x * FACTOR_RESOLUCION_MOBILE)
        ),
        y: Math.max(
            8,
            Math.round(base.y * FACTOR_RESOLUCION_MOBILE)
        )
    };

}
