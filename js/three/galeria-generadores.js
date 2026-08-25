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
