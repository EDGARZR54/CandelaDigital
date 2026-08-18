// hypar-transicion.js
//
// Superficie paramétrica: Transición de Plano a Paraboloide Hiperbólico (Hypar)
// Basada en dos líneas paralelas centradas en el origen (0,0) que se inclinan
// asimétricamente según el parámetro Z (Elevación/Progreso).

import * as THREE from 'three';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';

/*
    Valores por defecto de los parámetros exportados para el panel de controles.
*/
export const PARAMETROS_DEFECTO = {
  L: 12,              // Media dimensión base (Largo y Ancho = 2 * L)
  Z: 8,               // Progreso / Elevación del Hypar (0 = Plano horizontal, >0 = Hypar)
};

/**
 * Evalúa la superficie del Hypar en función de los parámetros normalizados uNorm y vNorm (0 a 1).
 *
 * Mapeo de esquinas (centrado en el origen):
 *   (u=0, v=0) -> (-L, -L, +Z)
 *   (u=1, v=0) -> (+L, -L, -Z)
 *   (u=0, v=1) -> (-L, +L, -Z)
 *   (u=1, v=1) -> (+L, +L, +Z)
 */
export function superficieHyparTransicion(uNorm, vNorm, destino, parametros = {}) {
  const {
    L = PARAMETROS_DEFECTO.L,
    Z = PARAMETROS_DEFECTO.Z
  } = parametros;

  // Coordenadas locales en Rhino
  const xRhino = (2 * uNorm - 1) * L;
  const yRhino = (2 * vNorm - 1) * L;

  // Ecuación de transición: con Z = 0 resulta en un plano horizontal Z_Rhino = 0.
  // Con Z > 0 genera la deformación continua a Paraboloide Hiperbólico.
  const zRhino = (1 - 2 * uNorm) * (1 - 2 * vNorm) * Z;

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