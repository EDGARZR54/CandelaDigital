// la-muela.js
//
// Superficie paramétrica: Paraboloide Hiperbólico (Hypar)
// con normales orientadas hacia ARRIBA (+Y) y Linear Array de 2 piezas.

import * as THREE from 'three';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';


/*
    Valores por defecto de los parámetros de la fórmula, incluido
    arrayCount (que no participa en superficieConoSinusoidal pero sí en
    crearGeometriaConoSinusoidal). Se exportan como objeto plano para que
    el panel de controles genérico (ver galeria-panel-parametros.js)
    pueda armar sus sliders/inputs a partir de sus claves.
*/
export const PARAMETROS_DEFECTO = {
  R: 12,            // Half Size (Radio/Dimensión base)
  Z1: 24,           // Esquinas elevadas P1(+R, 0, Z1) y P3(-R, 0, Z1)
  Z2: -12,          // Esquinas bajas P2(0, +R, Z2) y P4(0, -R, Z2)
  numDivisiones: 3, // Número de divisiones para los planos de corte
  arrayCount: 2      // Piezas del Linear Array
};


/**
 * Evalúa la superficie del Hypar recortado garantizando normales hacia ARRIBA (+Y).
 */
export function superficieConoSinusoidal(uNorm, vNorm, destino, parametros = {}) {
  const {
    R = PARAMETROS_DEFECTO.R,
    Z1 = PARAMETROS_DEFECTO.Z1,
    Z2 = PARAMETROS_DEFECTO.Z2,
    numDivisiones = PARAMETROS_DEFECTO.numDivisiones
  } = parametros;

  // 1. Asignación de parámetros para Normales orientadas hacia ARRIBA (+Y):
  // vNorm recorre X (ancho) y uNorm recorre Y_rhino (profundidad Z en Three.js)
  const pasoX = (2 * R) / numDivisiones; // Paso = 8
  const xMin = -pasoX / 2;               // -4
  const xMax = pasoX / 2;                // +4

  // Coordenada X local (recorrida por vNorm)
  const xRhino = xMin + vNorm * (xMax - xMin);

  // Límite Y en Rhino recortado por el plano XY (z >= 0)
  const ratioZ = (Z1 + Z2) / (Z1 - Z2); // (24 - 12) / (24 + 12) = 1/3
  const yMaxSq = Math.max(0, Math.pow(xRhino, 2) + Math.pow(R, 2) * ratioZ);
  const yMax = Math.sqrt(yMaxSq); // yMax = 8 cuando x = 4

  // Coordenada Y local en Rhino (recorrida por uNorm)
  const yRhino = (2 * uNorm - 1) * yMax;

  // 2. Ecuación exacta del Hypar para la coordenada Z en Rhino
  const zRhino = (Z1 + Z2) / 2 + ((Z1 - Z2) / 2) * ((Math.pow(xRhino, 2) - Math.pow(yRhino, 2)) / Math.pow(R, 2));

  // 3. Mapeo a Three.js (Y-up vertical)
  // u (profundidad) x v (ancho) => Normal hacia ARRIBA (+Y)
  const xThree = xRhino;
  const yThree = zRhino; // Z de Rhino (altura) -> Y de Three.js
  const zThree = yRhino; // Y de Rhino (profundidad) -> Z de Three.js

  destino.set(xThree, yThree, zThree);
}

/**
 * Genera la geometría completa con normales hacia arriba y N piezas en el arreglo.
 */
export function crearGeometriaConoSinusoidal(
  parametros = {},
  resolucion = { x: 80, y: 80 },
  escala = 0.09
) {
  const paramsCompletos = { ...PARAMETROS_DEFECTO, ...parametros };
  const { R, numDivisiones, arrayCount } = paramsCompletos;

  const pasoX = (2 * R) / numDivisiones;

  // 1. Geometría paramétrica con normales orientadas hacia ARRIBA
  const geometriaFragmento = new ParametricGeometry(
    (u, v, dest) => superficieConoSinusoidal(u, v, dest, paramsCompletos),
    resolucion.x,
    resolucion.y
  );

  // 2. Linear Array en X, centrado en el origen.
  //
  // El fragmento base ya está centrado (va de -pasoX/2 a +pasoX/2), así que
  // en vez de trasladar todas las copias en la misma dirección (lo que
  // descentraba la pieza completa hacia +X), cada copia crece desde el
  // centro (x = 0) hacia un lado distinto:
  //   - i par  -> se traslada hacia +X (mitad derecha)
  //   - i impar-> se espeja en X y se traslada hacia -X (mitad izquierda)
  // Espejar en X invierte el orden (winding) de los triángulos, así que
  // hay que corregirlo o las normales recalculadas al final apuntarían
  // hacia abajo en esas piezas.
  const instancias = [];
  for (let i = 0; i < arrayCount; i++) {
    const geo = geometriaFragmento.clone();
    const lado = i % 2 === 0 ? 1 : -1;
    const offset = (Math.floor(i / 2) + 0.5) * pasoX * lado;

    if (lado === -1) {
      geo.scale(-1, 1, 1);
      invertirWinding(geo);
    }

    geo.translate(offset, 0, 0);
    instancias.push(geo);
  }

  // Fusionar las instancias
  const geometriaFinal = mergeBufferGeometries(instancias);

  // Escala y cálculo explícito de normales hacia arriba
  geometriaFinal.scale(escala, escala, escala);
  geometriaFinal.computeVertexNormals();

  return geometriaFinal;
}

/**
 * Invierte el orden (winding) de los triángulos de una geometría indexada.
 * Necesario después de espejar (scale(-1, ...)) una geometría, ya que el
 * espejo invierte la orientación de las caras: sin esto, computeVertexNormals()
 * calcularía las normales apuntando hacia el lado contrario (-Y en vez de +Y).
 */
function invertirWinding(geometria) {
  const index = geometria.index;
  if (!index) return geometria;

  const arr = index.array;
  for (let i = 0; i < arr.length; i += 3) {
    const tmp = arr[i + 1];
    arr[i + 1] = arr[i + 2];
    arr[i + 2] = tmp;
  }
  index.needsUpdate = true;

  return geometria;
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
