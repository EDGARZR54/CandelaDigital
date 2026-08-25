// concha-vault.js
//
// Superficie paramétrica exacta basada en "Concha_6Raven.gh":
// - NINGÚN punto pertenece a Z < 0 (todos pertenecen al plano WorldXY con Z >= 0).
// - TODOS los 7 arcos nacen exactamente en el mismo punto inicial (0, 0, 0) [Z = 0].
// - Difieren únicamente en el signo de su curvatura al arrancar (cóncava vs convexa).
//
// HISTORIAL DE CORRECCIONES:
// 1) Extensión vectorial: para uNorm > 0.5 (s > 1, con s = 2*uNorm), ambos arcos
//    extienden el MISMO vector director (0,0,0) -> (P.x, P.y, H) escalado por (1+t),
//    garantizando magnitud, dirección y Z idénticos entre cresta y valle.
// 2) Continuidad de tangente (C1) en s=1: la extensión lineal tiene pendiente
//    constante dz/ds = H. Las curvas originales (H*s*(2-s) y H*s^2) llegaban a
//    s=1 con pendientes 0 y 2H respectivamente -> NO coincidían con H -> pliegue
//    visible ("torcimiento") justo donde la curva se une con el tramo recto.
//    Se sustituyeron por un blend de Hermite cúbico que impone f(0)=0, f(1)=H,
//    f'(1)=H (tangente igual a la extensión), preservando la pendiente original
//    en el origen (arranque empinado en cresta, arranque plano en valle) para
//    conservar el carácter cóncavo/convexo de cada arco:
//      Cresta: f(s) = H*s*(s^2 - 2s + 2)   [f'(0)=2H, f'(1)=H]
//      Valle:  f(s) = H*s^2*(2 - s)         [f'(0)=0,  f'(1)=H]
//    Con esto, curva y extensión quedan tangentes en P: ya no hay pliegue.

import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';

export const PARAMETROS_DEFECTO = {
  N: 12,              // Polígono base de 12 lados (Slider ID 251)
  R: 28.656,          // Radio del polígono base (Slider ID 241)
  H: 11.0,            // Factor de altura (Slider ID 247)
  numModulos: 3       // 3 módulos seleccionados del Panel ID 295 -> 7 arcos en serie
};

/**
 * Arco 1: Cresta (V_k). Curvatura cóncava al arrancar (dome), C1-continua
 * con la extensión lineal en s=1.
 * f(s) = H*s*(s^2 - 2s + 2)  ->  f(0)=0, f'(0)=2H, f(1)=H, f'(1)=H
 * Para s > 1 (uNorm > 0.5): extiende el vector (0,0,0)->(P.x,P.y,H) por (1+t),
 * cuya pendiente constante H empalma sin quiebre con f'(1)=H.
 */
function evaluarArcoConcavoAbajo(uNorm, P, H) {
  let x = 0, y = 0, z = 0;

  if (uNorm <= 0.5) {
    const s = uNorm * 2.0; // s de 0 a 1
    x = s * P.x;
    y = s * P.y;
    z = H * s * (s * s - 2.0 * s + 2.0); // Hermite: f(0)=0, f'(0)=2H, f(1)=H, f'(1)=H
  } else {
    const t = (uNorm - 0.5) * 2.0; // t de 0 a 1
    x = (1.0 + t) * P.x;
    y = (1.0 + t) * P.y;
    z = (1.0 + t) * H; // pendiente constante H, tangente a la curva en s=1
  }

  return { x, y, z };
}

/**
 * Arco 2: Valle (M_k). Curvatura convexa al arrancar, C1-continua con la
 * extensión lineal en s=1.
 * f(s) = H*s^2*(2 - s)  ->  f(0)=0, f'(0)=0, f(1)=H, f'(1)=H
 * Comparte el mismo vector de extensión (0,0,0)->(P.x,P.y,H) para s > 1.
 */
function evaluarArcoConvexoArriba(uNorm, P, H) {
  let x = 0, y = 0, z = 0;

  if (uNorm <= 0.5) {
    const s = uNorm * 2.0; // s de 0 a 1
    x = s * P.x;
    y = s * P.y;
    z = H * s * s * (2.0 - s); // Hermite: f(0)=0, f'(0)=0, f(1)=H, f'(1)=H
  } else {
    const t = (uNorm - 0.5) * 2.0; // t de 0 a 1
    x = (1.0 + t) * P.x;
    y = (1.0 + t) * P.y;
    z = (1.0 + t) * H; // misma pendiente constante H, tangente a la curva en s=1
  }

  return { x, y, z };
}

/**
 * Evalúa la superficie paramétrica para los 3 módulos (7 arcos en serie).
 * TODOS los arcos nacen en (0, 0, 0) y pertenecen completamente a Z >= 0.
 */
export function superficieConcha(uNorm, vNorm, destino, parametros = {}) {
  const {
    N = PARAMETROS_DEFECTO.N,
    R = PARAMETROS_DEFECTO.R,
    H = PARAMETROS_DEFECTO.H,
    numModulos = PARAMETROS_DEFECTO.numModulos
  } = parametros;

  const dTheta = (2.0 * Math.PI) / N;
  const R_mid = R * Math.cos(Math.PI / N);

  // Serie exacta de los 7 arcos para 3 módulos:
  // [Cresta_0, Valle_0, Cresta_1, Valle_1, Cresta_2, Valle_2, Cresta_3]
  const arcos = [];

  for (let m = 0; m < numModulos; m++) {
    // Primer arco de cresta
    if (m === 0) {
      const theta_v0 = 0.0;
      const V_0 = { x: R * Math.cos(theta_v0), y: R * Math.sin(theta_v0) };
      arcos.push(evaluarArcoConcavoAbajo(uNorm, V_0, H));
    }

    // Arco de valle en punto medio M_m
    const theta_mid = (m + 0.5) * dTheta;
    const M_m = { x: R_mid * Math.cos(theta_mid), y: R_mid * Math.sin(theta_mid) };
    arcos.push(evaluarArcoConvexoArriba(uNorm, M_m, H));

    // Arco de cresta en vértice V_{m+1}
    const theta_v1 = (m + 1.0) * dTheta;
    const V_1 = { x: R * Math.cos(theta_v1), y: R * Math.sin(theta_v1) };
    arcos.push(evaluarArcoConcavoAbajo(uNorm, V_1, H));
  }

  // 7 arcos en total (6 sub-intervalos / 6 superficies)
  const totalSubIntervalos = arcos.length - 1;
  const pos = vNorm * totalSubIntervalos;
  const idx = Math.min(Math.floor(pos), totalSubIntervalos - 1);
  const tLocal = pos - idx;

  const C_a = arcos[idx];
  const C_b = arcos[idx + 1];

  // Interpolación entre arcos adyacentes
  const x = (1.0 - tLocal) * C_a.x + tLocal * C_b.x;
  const y = (1.0 - tLocal) * C_a.y + tLocal * C_b.y;
  const z = (1.0 - tLocal) * C_a.z + tLocal * C_b.z;

  destino.set(x, y, z);
}

/**
 * Construye la geometría lista para THREE.Mesh
 */
export function crearGeometriaConcha(
  parametros = {},
  resolucion = { x: 120, y: 120 },
  escala = 0.054 // 60% del tamaño original (0.09 * 0.6)
) {
  const geometria = new ParametricGeometry(
    (u, v, destino) => superficieConcha(u, v, destino, { ...PARAMETROS_DEFECTO, ...parametros }),
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