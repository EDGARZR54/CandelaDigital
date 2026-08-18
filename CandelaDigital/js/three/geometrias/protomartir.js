// boveda-estrellada.js
//
// Superficie paramétrica basada en la definición de Grasshopper:
// Bóveda radial modulada de N sectores con anillo superior elevado,
// nervaduras parabólicas de valle y picos/crestas de borde extendidos.

import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';

/*
    Valores por defecto extraídos de los sliders de la definición de Grasshopper.
*/
export const PARAMETROS_DEFECTO = {
  N: 8,           // Número de sectores / valles (Slider ID 2)
  R_base: 18,     // Radio base del polígono (Slider ID 5)
  d: 6,           // Offset de extensión radial de crestas (Slider ID 25)
  r_top: 2,       // Radio del círculo superior (Slider ID 121)
  H_top: 39,      // Altura del anillo central superior (Slider ID 16 - Slider ID 191)
  H_apex: 17.735  // Altura del pico de la cresta (Slider ID 8)
};

/**
 * Evalúa la superficie paramétrica (u, v) -> Point3D
 */
export function superficieBovedaEstrellada(uNorm, vNorm, destino, parametros = {}) {
  const {
    N = PARAMETROS_DEFECTO.N,
    R_base = PARAMETROS_DEFECTO.R_base,
    d = PARAMETROS_DEFECTO.d,
    r_top = PARAMETROS_DEFECTO.r_top,
    H_top = PARAMETROS_DEFECTO.H_top,
    H_apex = PARAMETROS_DEFECTO.H_apex
  } = parametros;

  const u = uNorm; // Recorrido radial: 0 (anillo central superior) a 1 (perímetro exterior)
  const v = vNorm; // Recorrido angular normalizado [0, 1]

  const theta = v * 2 * Math.PI;

  // Factor de modulación armónica para N sectores: 0 en valles, 1 en crestas
  const w = 0.5 * (1 - Math.cos(N * theta));

  // Radio de la cresta extendida desde el punto medio del polígono
  const R_ridge = R_base * Math.cos(Math.PI / N) + d;

  // Radio en el borde exterior (u = 1) modulado entre valles (R_base) y crestas (R_ridge)
  const R_outer = R_base + w * (R_ridge - R_base);

  // Radio interpolado radialmente entre r_top (u = 0) y R_outer (u = 1)
  const R_theta = r_top + u * (R_outer - r_top);

  // Coordenadas X e Y en el plano base
  const x = R_theta * Math.cos(theta);
  const y = R_theta * Math.sin(theta);

  // Altura Z combinada:
  // - Perfil de valle parabólico: H_top * (1 - u)^2
  // - Elevación de crestas modulada: w * u^2 * H_apex
  const z = H_top * Math.pow(1 - u, 2) + w * Math.pow(u, 2) * H_apex;

  destino.set(x, y, z);
}

/**
 * Construye la geometría lista para THREE.Mesh
 */
export function crearGeometriaBovedaEstrellada(
  parametros = {},
  resolucion = { x: 150, y: 150 },
  escala = 0.09
) {
  const geometria = new ParametricGeometry(
    (u, v, destino) => superficieBovedaEstrellada(u, v, destino, { ...PARAMETROS_DEFECTO, ...parametros }),
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