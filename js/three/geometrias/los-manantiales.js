// los-manantiales.js
//
// Superficie paramétrica del Restaurante Los Manantiales (Félix Candela):
// paraboloide modulado radialmente para generar N picos (crestas) y N
// valles a lo largo del perímetro, con perfiles parabólicos entre el
// centro (u=0) y el borde (u=1).
//
// NOTA: por ahora sigue la misma plantilla que geometrias/cono-sinusoidal.js
// (exploración geométrica inicial); a futuro estos parámetros se ajustarán
// a las proporciones reales del edificio (8 pétalos, planta circular de
// ~966 m², ver data/edificios.geojson).
//
// THREE.ParametricGeometry siempre llama a la función de superficie con
// u, v en [0, 1]:
//
//   u  recorre el radio, de 0 (centro) a 1 (borde)
//   v  recorre el ángulo, de 0 a 1 (se remapea internamente a [0, 2π])
//
//   N        número de sectores/lados (picos y valles)
//   R_base   radio base del polígono
//   d        desplazamiento de extensión (offset) que agranda R_ridge
//   H_low    altura de apoyos/valles
//   H_apex   altura de los picos/crestas

import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';


/*
    Valores por defecto de los parámetros de la fórmula. Se exportan
    como objeto plano para que el panel de controles genérico (ver
    galeria-panel-parametros.js) pueda armar sus sliders/inputs a partir
    de sus claves, sin conocer de antemano el nombre de cada parámetro.
*/
export const PARAMETROS_DEFECTO = {
  N: 8,           // Número de sectores/lados (los 8 pétalos del edificio real)
  R_base: 16,     // Radio base del polígono
  d: 7.8,         // Desplazamiento de extensión (offset)
  H_low: 6.92,    // Altura de apoyos/valles
  H_apex: 11.791  // Altura de los picos/crestas
};


export function superficieConoSinusoidal(uNorm, vNorm, destino, parametros = {}) {
  const {
    N = PARAMETROS_DEFECTO.N,
    R_base = PARAMETROS_DEFECTO.R_base,
    d = PARAMETROS_DEFECTO.d,
    H_low = PARAMETROS_DEFECTO.H_low,
    H_apex = PARAMETROS_DEFECTO.H_apex
  } = parametros;

  const u = uNorm;
  const v = vNorm;

  // Radios derivados para valles y crestas
  const R_valley = R_base;
  const R_ridge = R_base * Math.cos(Math.PI / N) + d;

  // Ángulo polar
  const theta = v * 2 * Math.PI;

  // Factor de modulación w en [0, 1]: 0 en valles, 1 en crestas
  const w = 0.5 * (1 - Math.cos(N * theta));

  // Radio de la perimetral modulado
  const R_theta = R_valley + w * (R_ridge - R_valley);

  // Coordenadas X e Y
  const x = u * R_theta * Math.cos(theta);
  const y = u * R_theta * Math.sin(theta);

  // Coordenada Z basada en los perfiles parabólicos h*x² y -h*x²
  const z = H_low * (1 - u * u) + w * u * u * H_apex;

  destino.set(x, y, z);
}

/**
 * Construye (o reconstruye) la geometría lista para un THREE.Mesh.
 *
 * @param {Object} parametros   - N, R_base, d, H_low, H_apex
 * @param {{x:number,y:number}} resolucion - segmentos de la malla
 * @param {number} escala       - factor de escala uniforme aplicado al final
 */
export function crearGeometriaConoSinusoidal(parametros = {}, resolucion = { x: 150, y: 150 }, escala = 0.09) {
  const geometria = new ParametricGeometry(
    (u, v, destino) => superficieConoSinusoidal(u, v, destino, { ...PARAMETROS_DEFECTO, ...parametros }),
    resolucion.x,
    resolucion.y
  );
  geometria.rotateX(-Math.PI / 2);
  geometria.scale(escala, escala, escala);
  geometria.computeVertexNormals();
  return geometria;
}

export function rangoVComponent(n) {
  return Number.isInteger(n)
    ? { min: -Math.PI, max: Math.PI }
    : { min: -2 * Math.PI, max: 2 * Math.PI };
}
