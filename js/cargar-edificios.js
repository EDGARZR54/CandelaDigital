// cargar-edificios.js
// Carga data/edificios.geojson y resuelve rutas relativas (fotos, modelo_3d,
// nube_de_puntos) sin importar desde qué profundidad de carpeta se llame:
// index.html (raíz), edificios/los-manantiales.html (1 nivel), etc.
//
// Uso:
//   import { cargarEdificios, resolverRuta } from '../js/data/cargar-edificios.js';
//   const edificios = await cargarEdificios();
//   const src = resolverRuta(edificio.properties.medios.fotografias[0].url);

// RAIZ_RELATIVA: cuántos "../" hacen falta para llegar a la raíz del repo
// desde la página actual. Ajusta esta constante en cada página, o bien
// calcúlala automáticamente contando la profundidad de la URL:
function calcularRaizRelativa() {
  // cuenta carpetas después del dominio, ignorando el archivo .html final
  const partes = window.location.pathname.replace(/\/[^/]*$/, '').split('/').filter(Boolean);
  // en GitHub Pages de proyecto, la primera parte es el nombre del repo:
  // no cuenta como "profundidad" real si el archivo vive justo bajo esa carpeta.
  // Ajuste simple y explícito: cuenta cuántas subcarpetas hay DESPUÉS del root
  // de tu sitio. Si tu estructura es fija (páginas en raíz o en /edificios,
  // /mapa), esto basta:
  const profundidadesConocidas = { edificios: 1, mapa: 1 };
  const ultima = partes[partes.length - 1];
  const nivel = profundidadesConocidas[ultima] ?? 0;
  return '../'.repeat(nivel);
}

const RAIZ = calcularRaizRelativa();
const RUTA_GEOJSON = `${RAIZ}data/edificios.geojson`;

let _cache = null;

export async function cargarEdificios() {
  if (_cache) return _cache;
  const res = await fetch(RUTA_GEOJSON);
  if (!res.ok) throw new Error(`No se pudo cargar ${RUTA_GEOJSON}: ${res.status}`);
  const geojson = await res.json();
  _cache = geojson.features;
  return _cache;
}

export function resolverRuta(rutaRelativaAlRoot) {
  if (!rutaRelativaAlRoot) return null;
  return RAIZ + rutaRelativaAlRoot;
}

export async function obtenerEdificioPorSlug(slug) {
  const edificios = await cargarEdificios();
  return edificios.find((f) => f.id === slug) ?? null;
}
