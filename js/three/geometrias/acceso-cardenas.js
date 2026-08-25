// hypar-transicion.js (soportes más juntos, esquinas al aire sin cambios)
//
// Superficie paramétrica: Transición de Plano a Paraboloide Hiperbólico (Hypar)
//
// CAMBIO respecto al original: antes había un solo parámetro L que definía
// las 4 esquinas de un cuadrado, así que al reducirlo se movían TODAS las
// esquinas por igual (las diagonales de un rectángulo siempre miden lo mismo
// entre sí, por eso no se podía separar un par del otro con un único L).
//
// Ahora cada esquina tiene su propia posición y se interpola con bilinear:
//   - L_SOPORTE controla la distancia entre las 2 esquinas bajas,
//     que son las que se apoyan / soportes -> ahora más juntas.
//   - L_AIRE controla la distancia entre las 2 esquinas altas,
//     las que quedan "al aire" / en voladizo -> se mantiene como el L original.
//
// Además, la altura ya NO está centrada en el origen: se desplazó toda la
// superficie hacia arriba en +Z para que las esquinas de soporte queden
// exactamente en altura 0 (apoyadas en el plano del mundo) y no haya nada
// por debajo. Las esquinas "al aire" ahora quedan a 2*Z de altura en vez
// de a +Z.

import * as THREE from 'three';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';

/*
    Valores por defecto de los parámetros exportados para el panel de controles.
*/
export const PARAMETROS_DEFECTO = {
  L_AIRE: 12,          // Media dimensión de las esquinas ALTAS (u=0,v=0) y (u=1,v=1) -> igual que el L original
  L_SOPORTE: 6,         // Media dimensión de las esquinas BAJAS / soportes (u=1,v=0) y (u=0,v=1) -> reducida
  Z: 8,                 // Progreso / Elevación del Hypar (0 = Plano horizontal, >0 = Hypar)
};

/**
 * Evalúa la superficie del Hypar en función de los parámetros normalizados uNorm y vNorm (0 a 1).
 *
 * Mapeo de esquinas (centrado en X/Y, pero YA NO centrado en altura: los
 * soportes quedan en Z=0, apoyados en el plano del mundo, y todo lo demás
 * queda por encima):
 *   (u=0, v=0) -> (-L_AIRE,    -L_AIRE,    2*Z)  // al aire (el punto más alto)
 *   (u=1, v=0) -> (+L_SOPORTE, -L_SOPORTE, 0)    // soporte, apoyado en el suelo
 *   (u=0, v=1) -> (-L_SOPORTE, +L_SOPORTE, 0)    // soporte, apoyado en el suelo
 *   (u=1, v=1) -> (+L_AIRE,    +L_AIRE,    2*Z)  // al aire (el punto más alto)
 */
export function superficieHyparTransicion(uNorm, vNorm, destino, parametros = {}) {
  const {
    L_AIRE = PARAMETROS_DEFECTO.L_AIRE,
    L_SOPORTE = PARAMETROS_DEFECTO.L_SOPORTE,
    Z = PARAMETROS_DEFECTO.Z
  } = parametros;

  // Posiciones XY de cada esquina, en Rhino (centradas en el origen)
  const x00 = -L_AIRE,     y00 = -L_AIRE;     // u=0,v=0 (aire, +Z)
  const x10 =  L_SOPORTE,  y10 = -L_SOPORTE;  // u=1,v=0 (soporte, -Z)
  const x01 = -L_SOPORTE,  y01 =  L_SOPORTE;  // u=0,v=1 (soporte, -Z)
  const x11 =  L_AIRE,     y11 =  L_AIRE;     // u=1,v=1 (aire, +Z)

  // Interpolación bilineal de cada esquina según (uNorm, vNorm)
  const w00 = (1 - uNorm) * (1 - vNorm);
  const w10 = uNorm * (1 - vNorm);
  const w01 = (1 - uNorm) * vNorm;
  const w11 = uNorm * vNorm;

  const xRhino = w00 * x00 + w10 * x10 + w01 * x01 + w11 * x11;
  const yRhino = w00 * y00 + w10 * y10 + w01 * y01 + w11 * y11;

  // Ecuación de transición: con Z = 0 resulta en un plano horizontal Z_Rhino = 0.
  // Con Z > 0 genera la deformación continua a Paraboloide Hiperbólico.
  //
  // El término (1-2u)(1-2v) es el producto de dos factores que van de -1 a 1,
  // así que su valor siempre queda acotado entre -1 y 1, y ese mínimo (-1) se
  // alcanza exactamente en las esquinas de soporte (u=1,v=0) y (u=0,v=1).
  // Al sumarle +Z a toda la expresión, desplazamos la superficie hacia
  // arriba: los soportes (que antes daban -Z) ahora dan exactamente 0, y
  // como -1 es el mínimo posible del producto, NINGÚN punto de la superficie
  // queda por debajo de Z=0.
  const zRhino = (1 - 2 * uNorm) * (1 - 2 * vNorm) * Z + Z;

  // Mapeo a Three.js (Y-up vertical)
  const xThree = xRhino;
  const yThree = zRhino; // Z de Rhino (altura) -> Y de Three.js
  const zThree = yRhino; // Y de Rhino (profundidad) -> Z de Three.js

  destino.set(xThree, yThree, zThree);
}

/**
 * Crea la geometría paramétrica del Hypar en Three.js.
 */
export function crearGeometriaHyparTransicion(
  parametros = {},
  resolucion = { x: 40, y: 40 },
  escala = 0.09
) {
  const paramsCompletos = { ...PARAMETROS_DEFECTO, ...parametros };

  const geometria = new ParametricGeometry(
    (u, v, dest) => superficieHyparTransicion(u, v, dest, paramsCompletos),
    resolucion.x,
    resolucion.y
  );

  geometria.scale(escala, escala, escala);
  geometria.computeVertexNormals();

  return geometria;
}

export function rangoVComponent(n) {
  return Number.isInteger(n)
    ? { min: -Math.PI, max: Math.PI }
    : { min: -2 * Math.PI, max: 2 * Math.PI };
}