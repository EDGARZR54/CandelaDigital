// silla-de-montar.js
//
// Superficie paramétrica basada en la definición de Grasshopper:
// Paraboloide Hiperbólico (Saddle Surface) evaluado por la fórmula z = k * (x² - y²).

import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';

/*
    Valores por defecto extraídos de los sliders de la definición de Grasshopper.
*/
export const PARAMETROS_DEFECTO = {
  xMin: -2.0,   // Dominio inicial X (Slider ID 8)
  xMax: 2.0,    // Dominio final X (Slider ID 9)
  yMin: -2.0,   // Dominio inicial Y (Slider ID 13)
  yMax: 2.0,    // Dominio final Y (Slider ID 14)
  k: -0.167     // Constante de curvatura k (Slider ID 6)
};

/**
 * Evalúa la superficie paramétrica (u, v) -> Point3D
 */
export function superficieSillaDeMontar(uNorm, vNorm, destino, parametros = {}) {
  const {
    xMin = PARAMETROS_DEFECTO.xMin,
    xMax = PARAMETROS_DEFECTO.xMax,
    yMin = PARAMETROS_DEFECTO.yMin,
    yMax = PARAMETROS_DEFECTO.yMax,
    k = PARAMETROS_DEFECTO.k
  } = parametros;

  // Interpolación lineal de [0, 1] a los dominios de X e Y
  const x = xMin + uNorm * (xMax - xMin);
  const y = yMin + vNorm * (yMax - yMin);

  // Expresión matemática: z = k * (x² - y²) (Maths.Expression ID 4)
  const z = k * (Math.pow(x, 2) - Math.pow(y, 2));

  destino.set(x, y, z);
}

/**
 * Construye la geometría lista para THREE.Mesh
 */
export function crearGeometriaSillaDeMontar(
  parametros = {},
  resolucion = { x: 50, y: 50 },
  escala = 1.0
) {
  const geometria = new ParametricGeometry(
    (u, v, destino) => superficieSillaDeMontar(u, v, destino, { ...PARAMETROS_DEFECTO, ...parametros }),
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