// cubierta-hypar.js
//
// Superficie paramétrica: Paraguas / Cubierta de Paraboloide Hiperbólico (Hypar)
// Construida como UN solo pétalo (patch hypar limpio, sin lógica de sector
// embebida) que se clona y rota N veces con geometry.rotateY(). Esto evita
// las caras "puente" incorrectas que aparecían al intentar parametrizar los
// N pétalos como una sola superficie continua en v.

import * as THREE from 'three';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';

/*
    Valores por defecto de los parámetros exportados para el panel de controles.
*/
export const PARAMETROS_DEFECTO = {
  R: 12,              // Half Size (Radio/Dimensión base)
  Z1: 20,             // Altura esquinas altas (P1 y P3)
  Z2: 20,             // Altura esquina exterior baja (P2)
  Z_P4: 15,           // Altura del centro del paraguas (P4)
  numSectores: 4,     // Número de sectores/pétalos en arreglo polar
  anchoColumna: 0.8   // Media dimensión de la columna central (Domain -0.8 a 0.8)
};

/**
 * Evalúa la superficie de UN ÚNICO pétalo del Hypar, en su orientación
 * local (sector 0, sin rotación). uNorm y vNorm van de 0 a 1.
 *
 * Límites del parche (coinciden con el loft entre las dos líneas rectas
 * P1-P2 y P4-P3):
 *   S(u=1, v=0) = P1     S(u=1, v=1) = P2
 *   S(u=0, v=0) = P4     S(u=0, v=1) = P3
 *
 * IMPORTANTE: esta función ya NO recibe numSectores ni hace rotación
 * interna. La rotación se aplica después, sobre la geometría ya
 * construida, con THREE.BufferGeometry.rotateY().
 */
export function superficieHyparPetalo(uNorm, vNorm, destino, parametros = {}) {
  const {
    R = PARAMETROS_DEFECTO.R,
    Z1 = PARAMETROS_DEFECTO.Z1,
    Z2 = PARAMETROS_DEFECTO.Z2,
    Z_P4 = PARAMETROS_DEFECTO.Z_P4
  } = parametros;

  // Radio diagonal (R * sqrt(2)) para la orientación a 45°
  const R_diag = R * Math.SQRT2;
  const t = vNorm;

  // Puntos clave del pétalo (Rhino local, sector 0)
  const P1 = { x: 0, y: R_diag, z: Z1 };
  const P2 = { x: -R_diag, y: R_diag, z: Z2 };
  const P3 = { x: -R_diag, y: 0, z: Z1 };
  const P4 = { x: 0, y: 0, z: Z_P4 };

  // Regla de Loft entre Línea 1 (P1 -> P2) y Línea 2 (P4 -> P3)
  const L1_x = (1 - t) * P1.x + t * P2.x;
  const L1_y = (1 - t) * P1.y + t * P2.y;
  const L1_z = (1 - t) * P1.z + t * P2.z;

  const L2_x = (1 - t) * P4.x + t * P3.x;
  const L2_y = (1 - t) * P4.y + t * P3.y;
  const L2_z = (1 - t) * P4.z + t * P3.z;

  // Punto local en la superficie loft
  const xLocal = (1 - uNorm) * L2_x + uNorm * L1_x;
  const yLocal = (1 - uNorm) * L2_y + uNorm * L1_y;
  const zLocal = (1 - uNorm) * L2_z + uNorm * L1_z;

  // Mapeo a Three.js (Y-up vertical). La rotación del arreglo polar
  // se aplica después con rotateY(), no aquí.
  destino.set(xLocal, zLocal, yLocal);
}

/**
 * Calcula analíticamente la altura exacta de proyección del Hypar
 * en la esquina de la columna (x = anchoColumna, y = anchoColumna).
 * Replica los nodos Project Point + Distance de Grasshopper.
 * (Usa el pétalo sector 0, sin rotación — la columna es simétrica
 * respecto al centro, así que esto sigue siendo válido.)
 */
export function calcularAlturaColumna(parametros = {}) {
  const {
    R = PARAMETROS_DEFECTO.R,
    Z1 = PARAMETROS_DEFECTO.Z1,
    Z2 = PARAMETROS_DEFECTO.Z2,
    Z_P4 = PARAMETROS_DEFECTO.Z_P4,
    anchoColumna = PARAMETROS_DEFECTO.anchoColumna
  } = parametros;

  const R_diag = R * Math.SQRT2;

  // Parámetros u, v locales en la superficie que corresponden a (w, w)
  const u = anchoColumna / R_diag;
  const v = anchoColumna / R_diag;

  // Evaluación Z en las líneas frontera del loft
  const L1_z = (1 - v) * Z1 + v * Z2;
  const L2_z = (1 - v) * Z_P4 + v * Z1;

  // Altura Z proyectada en la superficie de la cubierta
  const hProyectada = (1 - u) * L2_z + u * L1_z;

  return hProyectada;
}

/**
 * Genera la columna central extruida desde Z=0 hasta la superficie del Hypar.
 */
function crearGeometriaColumna(parametros = {}) {
  const { anchoColumna = PARAMETROS_DEFECTO.anchoColumna } = parametros;

  // Altura calculada mediante la proyección exacta sobre el hypar
  const hColumna = calcularAlturaColumna(parametros);
  const tamano = anchoColumna * 2;

  const geoColumna = new THREE.BoxGeometry(tamano, hColumna, tamano);
  // Posicionar la base de la columna en Y = 0 (suelo)
  geoColumna.translate(0, hColumna / 2, 0);

  return geoColumna;
}

/**
 * Construye la cubierta completa arreglando `numSectores` copias rotadas
 * de un único pétalo. Cada pétalo es una geometría independiente: se
 * evita así el error de coser sectores dentro de un mismo grid UV
 * continuo (que producía caras "puente" torcidas entre pétalos).
 */
function crearGeometriaCubierta(parametros, resolucion) {
  const { numSectores = PARAMETROS_DEFECTO.numSectores } = parametros;

  // Resolución angular repartida entre pétalos (mínimo 1 subdivisión c/u)
  const resVPorPetalo = Math.max(1, Math.round(resolucion.y / numSectores));

  // 1. Geometría base de UN pétalo, en su orientación local (sector 0)
  const petaloBase = new ParametricGeometry(
    (u, v, dest) => superficieHyparPetalo(u, v, dest, parametros),
    resolucion.x,
    resVPorPetalo
  );

  // 2. Clonar y rotar el pétalo `numSectores` veces alrededor del eje Y
  //    (eje vertical en Three.js), reproduciendo el arreglo polar.
  //    El signo negativo mantiene el mismo sentido de giro que la
  //    versión original (rotación en el plano x,y local antes del
  //    mapeo a coordenadas Three).
  const petalos = [];
  for (let i = 0; i < numSectores; i++) {
    const angulo = i * ((2 * Math.PI) / numSectores);
    const geo = petaloBase.clone();
    geo.rotateY(-angulo);
    petalos.push(geo);
  }

  return mergeBufferGeometries(petalos);
}

/**
 * Construye la geometría completa (Cubierta + Columna) lista para Three.Mesh.
 */
export function crearGeometriaCubiertaHypar(
  parametros = {},
  resolucion = { x: 40, y: 120 },
  escala = 0.09
) {
  const paramsCompletos = { ...PARAMETROS_DEFECTO, ...parametros };

  // 1. Geometría de la cubierta: numSectores pétalos, cada uno correcto
  //    y unido a sus vecinos solo por las aristas que realmente coinciden.
  const cubiertaGeo = crearGeometriaCubierta(paramsCompletos, resolucion);

  // 2. Columna proyectada exactamente a la cubierta
  const columnaGeo = crearGeometriaColumna(paramsCompletos);

  // 3. Fusionar cubierta y columna
  const geometriaFinal = mergeBufferGeometries([cubiertaGeo, columnaGeo]);

  // Escala uniforme y cálculo de normales
  geometriaFinal.scale(escala, escala, escala);
  geometriaFinal.computeVertexNormals();

  return geometriaFinal;
}

/**
 * Función auxiliar para fusionar geometrías en Three.js.
 */
function mergeBufferGeometries(geometrias) {
  if (geometrias.length === 1) return geometrias[0];

  let totalVertices = 0;
  let totalIndices = 0;

  geometrias.forEach(g => {
    totalVertices += g.attributes.position.count;
    if (g.index) totalIndices += g.index.count;
  });

  const mergedPos = new Float32Array(totalVertices * 3);
  const mergedNorm = new Float32Array(totalVertices * 3);
  const mergedUv = new Float32Array(totalVertices * 2);
  const mergedIndex = totalIndices > 0 ? new Uint32Array(totalIndices) : null;

  let posOffset = 0;
  let uvOffset = 0;
  let indexOffset = 0;
  let vertexOffset = 0;

  geometrias.forEach(g => {
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    const uv = g.attributes.uv;
    const idx = g.index;

    mergedPos.set(pos.array, posOffset * 3);
    if (norm) mergedNorm.set(norm.array, posOffset * 3);
    if (uv) mergedUv.set(uv.array, uvOffset * 2);

    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        mergedIndex[indexOffset + i] = idx.array[i] + vertexOffset;
      }
      indexOffset += idx.count;
    }

    posOffset += pos.count;
    uvOffset += uv ? uv.count : 0;
    vertexOffset += pos.count;
  });

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
  if (mergedNorm.length > 0) result.setAttribute('normal', new THREE.BufferAttribute(mergedNorm, 3));
  if (mergedUv.length > 0) result.setAttribute('uv', new THREE.BufferAttribute(mergedUv, 2));
  if (mergedIndex) result.setIndex(new THREE.BufferAttribute(mergedIndex, 1));

  return result;
}

export function rangoVComponent(n) {
  return Number.isInteger(n)
    ? { min: -Math.PI, max: Math.PI }
    : { min: -2 * Math.PI, max: 2 * Math.PI };
}