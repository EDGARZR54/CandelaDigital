// cono-sinusoidal.js
//
// Superficie paramétrica: cono sinusoidal — misma fórmula que
// sinusoidalconeSurface en tu parametricSurfaces.js original.
//
// THREE.ParametricGeometry siempre llama a la función de superficie con
// u, v en [0, 1]; aquí se remapean al rango real que usa la fórmula:
//
//   u  se remapea de [0,1] a [-10, uComponent]           (umin fijo en -10)
//   v  se remapea de [0,1] a [vmin, vComponent]           (vmin = -π si n es entero, -2π si no)
//
//   k            amplitud de la ondulación en z
//   n            número de lóbulos (frecuencia angular de la ondulación)
//   uComponent   límite superior del rango de u (radio/longitud del cono)
//   vComponent   límite superior del rango de v (barrido angular)

import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';

export function superficieConoSinusoidal(uNorm, vNorm, destino, parametros = {}) {
  const { k = 0.4, n = 5, uComponent = 10, vComponent = Math.PI } = parametros;

  const umin = -10;
  const vmin = Number.isInteger(n) ? -Math.PI : -2 * Math.PI;

  const u = umin + (uComponent - umin) * uNorm;
  const v = vmin + (vComponent - vmin) * vNorm;

  const x = u * Math.cos(v);
  const y = u * Math.sin(v);
  const z = k * u * Math.cos(n * v);

  destino.set(x, y, z);
}

/**
 * Construye (o reconstruye) la geometría lista para un THREE.Mesh.
 * Reproduce el mismo post-procesado que sinusoidalconeMain.js:
 * rotación en X para poner el eje del cono "de pie", y escala uniforme.
 *
 * @param {Object} parametros   - k, n, uComponent, vComponent
 * @param {{x:number,y:number}} resolucion - segmentos de la malla
 * @param {number} escala       - factor de escala uniforme aplicado al final
 */
export function crearGeometriaConoSinusoidal(parametros = {}, resolucion = { x: 150, y: 150 }, escala = 0.09) {
  const geometria = new ParametricGeometry(
    (u, v, destino) => superficieConoSinusoidal(u, v, destino, parametros),
    resolucion.x,
    resolucion.y
  );
  geometria.rotateX(-Math.PI / 2);
  geometria.scale(escala, escala, escala);
  geometria.computeVertexNormals();
  return geometria;
}

// Rango recomendado de vComponent según n (igual que en tu archivo original):
// con n entero, ±π es suficiente para ver el patrón completo; con n
// fraccionario hace falta ±2π para que la ondulación cierre visualmente.
export function rangoVComponent(n) {
  return Number.isInteger(n)
    ? { min: -Math.PI, max: Math.PI }
    : { min: -2 * Math.PI, max: 2 * Math.PI };
}
