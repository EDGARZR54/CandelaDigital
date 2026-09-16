// fondo-3d.js
//
// Motor genérico de la escena de fondo: cámara, luces, renderer,
// posicionamiento de objetos por fracción de viewport (UV), animación y
// panel de control (lil-gui).
//
// ANTES: este archivo importaba a mano una función `crearGeometriaConoSinusoidal`
// desde protomartir.js — pero protomartir.js nunca exportó esa función (exporta
// `crearGeometriaBovedaEstrellada`), así que en realidad nada se estaba
// cargando desde tu carpeta real.
//
// AHORA: igual que hace VISORSSS.html con los archivos que arrastrás, este
// módulo detecta de forma genérica cuál es la función "crearGeometria*()" de
// cada archivo (por convención de nombre, con una expresión regular), en vez
// de asumir un nombre fijo. Así podés agregar nuevas superficies a la carpeta
// geometrias/ sumando una línea al CATALOGO_GEOMETRIAS de abajo, sin tocar el
// resto del archivo.
//
// Three.js y lil-gui se cargan como módulos ES directo desde CDN — sin
// npm, sin bundler, mismo patrón de siempre.

import * as THREE from 'three';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/dist/lil-gui.esm.min.js';

import * as ModProtomartir from './geometrias/protomartir.js';
import * as ModLaMuela from './geometrias/la-muela.js';
import * as ModLosManantiales from './geometrias/los-manantiales.js';
import * as ModAccesoCardenas from './geometrias/acceso-cardenas.js';
import * as ModConchaAcustica from './geometrias/concha-acustica.js';
import * as ModParaguas0 from './geometrias/paraguas_0.js';
import * as ModParaguas from './geometrias/paraguas.js';

// ---------------------------------------------------------------------------
// Catálogo de geometrías reales disponibles.
//
// Cada módulo debe exportar:
//   - una función cuyo nombre empiece con "crearGeometria" y que reciba
//     (parametros, resolucion, escala) y devuelva un THREE.BufferGeometry
//     ya orientado y escalado (cada módulo se encarga de su propio
//     rotateX/scale internamente — este archivo NO debe volver a rotar).
//   - opcionalmente, PARAMETROS_DEFECTO: un objeto plano { clave: numero }
//     usado para armar los sliders de la GUI automáticamente.
//
// Para sumar una nueva superficie: importarla arriba y agregar una entrada
// acá abajo. No hace falta tocar nada más de este archivo.
// ---------------------------------------------------------------------------
const CATALOGO_GEOMETRIAS = {
  'Protomartir (bóveda estrellada)': ModProtomartir,
  'La Muela (hypar)': ModLaMuela,
  'Los Manantiales': ModLosManantiales,
  'Acceso Cárdenas': ModAccesoCardenas,
  'Concha Acústica': ModConchaAcustica,
  'Paraguas 0': ModParaguas0,
  'Paraguas': ModParaguas,
};

const NOMBRE_GEOMETRIA_INICIAL = 'Protomartir (bóveda estrellada)';

/**
 * Busca dentro de un módulo la función "crearGeometria*()" por convención de
 * nombre, en vez de asumir un nombre fijo (que es justo lo que rompía el
 * import anterior).
 */
function obtenerConstructorGeometria(modulo, nombreModulo) {
  const entrada = Object.entries(modulo).find(
    ([nombre, valor]) => typeof valor === 'function' && /^crearGeometria/i.test(nombre)
  );
  if (!entrada) {
    throw new Error(
      `El módulo "${nombreModulo}" no exporta ninguna función crearGeometria*().`
    );
  }
  return entrada[1];
}

/**
 * Heurística genérica para el rango de un slider a partir del valor por
 * defecto del parámetro. No conoce el significado de cada parámetro (eso
 * variará según la superficie), así que usa una regla simple:
 *   - contadores típicos (N, numDivisiones, arrayCount) -> enteros, paso 1
 *   - el resto -> rango proporcional a la magnitud del valor por defecto
 * Si algún parámetro necesita un rango más fino, ajustalo a mano en el
 * objeto que devuelve esta función.
 */
function rangoParaParametro(nombre, valorDefecto) {
  if (typeof valorDefecto !== 'number' || !isFinite(valorDefecto)) return null;

  if (/^(N|numDivisiones|arrayCount)$/i.test(nombre)) {
    return { min: 1, max: Math.max(20, Math.round(valorDefecto * 3)), step: 1 };
  }

  const magnitud = Math.max(Math.abs(valorDefecto), 1);
  return {
    min: -magnitud * 2,
    max: magnitud * 3,
    step: Math.max(magnitud / 200, 0.001),
  };
}

/**
 * @param {Object} opcionesInit
 * @param {HTMLCanvasElement} opcionesInit.canvas   - canvas donde renderizar
 * @param {HTMLElement} opcionesInit.contenedor     - elemento cuyo tamaño define el viewport 3D
 * @param {{escritorio: {u:number,v:number}, movil: {u:number,v:number}}} opcionesInit.anclaje
 * @param {number} [opcionesInit.breakpoint=860]
 * @param {boolean} [opcionesInit.mostrarGUI=true]  - panel de controles visible
 */
export function crearFondo3D({ canvas, contenedor, anclaje, breakpoint = 860, mostrarGUI = true }) {
  const escena = new THREE.Scene();

  const camara = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camara.position.set(0, 0, 8);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // ---- Luces -------------------------------------------------------------
  escena.add(new THREE.AmbientLight(0xffffff, 0.65));
  const luzDireccional = new THREE.DirectionalLight(0xffffff, 0.85);
  luzDireccional.position.set(3, 4, 5);
  escena.add(luzDireccional);

  // ---- Colores desde las variables CSS del sitio ---------------------------
  function leerColorCSS(variable, alternativo) {
    const valor = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    return new THREE.Color(valor || alternativo);
  }

  // --color-naranja-oxido y --color-rojo-terracota se definen en
  // variables.css como triplete "R, G, B" (p. ej. "255, 87, 51"), pensado
  // para usarse como rgb(var(--color-naranja-oxido)) dentro de otra regla
  // CSS — no es un color válido tal cual para THREE.Color. Por eso acá se
  // envuelve en rgb(...) antes de parsearlo.
  function leerColorCSSTriplete(variable, alternativoHex) {
    const valor = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    return new THREE.Color(valor ? `rgb(${valor})` : alternativoHex);
  }

  // Colores de marca fijos (no dependen del tema claro/oscuro): la cara
  // frontal usa el naranja óxido y la trasera el rojo terracota.
  function colorRellenoTemaFrontal() {
    return leerColorCSSTriplete('--color-naranja-oxido', '#FF5733');
  }

  function colorRellenoTemaTrasera() {
    return leerColorCSSTriplete('--color-rojo-terracota', '#BF3B0B');
  }

  function colorBordeTema() {
    return leerColorCSS('--color-texto', '#151515');
  }

  // ---- Selección de geometría real + sus parámetros de forma ---------------
  let nombreGeometriaActual = NOMBRE_GEOMETRIA_INICIAL;
  let moduloActual = CATALOGO_GEOMETRIAS[nombreGeometriaActual];
  let constructorActual = obtenerConstructorGeometria(moduloActual, nombreGeometriaActual);
  let parametrosForma = { ...(moduloActual.PARAMETROS_DEFECTO || {}) };

  // ---- Estado / opciones controlables desde la GUI -------------------------
  const opciones = {
    // Geometría activa (una de las claves de CATALOGO_GEOMETRIAS)
    geometria: nombreGeometriaActual,
    // Material
    material: 'solido', // 'solido' | 'alambre' | 'normales'
    mostrarMalla: false, // superpone las aristas sobre el sólido
    colorAutomatico: true, // true = sigue la paleta/tema del sitio
    colorRellenoFrontal: '#FF5733', // caras frontales — naranja óxido
    colorRellenoTrasera: '#BF3B0B', // caras traseras — rojo terracota
    colorBorde: '#151515',
    // Animación
    autoRotateX: false,
    autoRotateY: true,
    autoRotateZ: false,
  };

  // Cada módulo orienta y escala su geometría a su manera, pero ninguno
  // garantiza que quede centrada en su propio origen local (protomartir
  // deja el anillo superior en r_top con la superficie colgando hacia
  // abajo; la-muela apoya su punto más bajo en y=0; los-manantiales
  // tampoco recentra tras su rotateX). Como `posicionarSegunViewport()`
  // ancla justo el ORIGEN LOCAL del objeto al punto (u,v) de la pantalla,
  // una geometría descentrada hace que el anclaje visual quede corrido.
  // Por eso se recentra acá, una sola vez, sin importar de qué módulo
  // venga la geometría.
  function centrarGeometria(geometria) {
    geometria.computeBoundingBox();
    const caja = geometria.boundingBox;
    if (caja) {
      const cx = (caja.max.x + caja.min.x) / 2;
      const cy = (caja.max.y + caja.min.y) / 2;
      const cz = (caja.max.z + caja.min.z) / 2;
      if (isFinite(cx) && isFinite(cy) && isFinite(cz)) {
        geometria.translate(-cx, -cy, -cz);
        geometria.computeBoundingBox();
      }
    }
    return geometria;
  }

  function construirGeometriaActual() {
    // Cada módulo se encarga de su propio rotateX/scale/traslación interna;
    // acá solo se le pasan los parámetros de forma vigentes y se recentra
    // el resultado (ver centrarGeometria más arriba).
    return centrarGeometria(constructorActual({ ...parametrosForma }));
  }

  // ---- Geometría y malla -----------------------------------------------------
  let geometria = construirGeometriaActual();

  // Sin backface culling: en vez de un único material de doble cara (que
  // pintaría ambas caras igual), usamos dos mallas superpuestas sobre la
  // misma geometría — una restringida a THREE.FrontSide y otra a
  // THREE.BackSide — cada una con su propio color.
  function construirMaterial(color, side) {
    switch (opciones.material) {
      case 'alambre':
        return new THREE.MeshBasicMaterial({ color, wireframe: true, side });
      case 'normales':
        return new THREE.MeshNormalMaterial({ side });
      case 'solido':
      default:
        return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05, side });
    }
  }

  function crearMaterialFrontal() {
    const color = opciones.colorAutomatico
      ? colorRellenoTemaFrontal()
      : new THREE.Color(opciones.colorRellenoFrontal);
    return construirMaterial(color, THREE.FrontSide);
  }

  function crearMaterialTrasera() {
    const color = opciones.colorAutomatico
      ? colorRellenoTemaTrasera()
      : new THREE.Color(opciones.colorRellenoTrasera);
    return construirMaterial(color, THREE.BackSide);
  }

  // "objeto" pasa a ser un Group que contiene ambas mallas (frontal y
  // trasera) más el overlay de aristas; el resto del archivo (posición,
  // rotación, animación) sigue tratándolo igual que antes.
  const objeto = new THREE.Group();
  escena.add(objeto);

  const mallaFrontal = new THREE.Mesh(geometria, crearMaterialFrontal());
  const mallaTrasera = new THREE.Mesh(geometria, crearMaterialTrasera());
  objeto.add(mallaTrasera);
  objeto.add(mallaFrontal);

  function colorBordeActual() {
    return opciones.colorAutomatico ? colorBordeTema() : new THREE.Color(opciones.colorBorde);
  }

  let malla = new THREE.LineSegments(
    new THREE.WireframeGeometry(geometria),
    new THREE.LineBasicMaterial({ color: colorBordeActual(), transparent: true, opacity: 0.35 })
  );
  malla.visible = opciones.mostrarMalla;
  objeto.add(malla);

  // Reconstruye geometría cuando cambian los parámetros de forma o la
  // geometría activa
  function reconstruirGeometria() {
    geometria.dispose();
    geometria = construirGeometriaActual();
    mallaFrontal.geometry = geometria;
    mallaTrasera.geometry = geometria;
    malla.geometry.dispose();
    malla.geometry = new THREE.WireframeGeometry(geometria);
  }

  // Reconstruye solo los materiales (cambio de tipo o de color)
  function actualizarMaterial() {
    mallaFrontal.material.dispose();
    mallaFrontal.material = crearMaterialFrontal();
    mallaTrasera.material.dispose();
    mallaTrasera.material = crearMaterialTrasera();
    malla.material.color.copy(colorBordeActual());
  }

  // ---- Tamaño del viewport 3D: el del contenedor, no siempre window -------
  function medidasContenedor() {
    return {
      ancho: contenedor ? contenedor.clientWidth : window.innerWidth,
      alto: contenedor ? contenedor.clientHeight : window.innerHeight,
    };
  }

  function anclaActual() {
    return window.innerWidth <= breakpoint ? anclaje.movil : anclaje.escritorio;
  }

  // (u, v) de pantalla, en [0,1] con origen arriba-izquierda -> posición 3D real
  function posicionDesdeUV(u, v, z = 0) {
    const ndcX = u * 2 - 1;
    const ndcY = -(v * 2 - 1);
    const puntoEnFrustum = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camara);
    const direccion = puntoEnFrustum.sub(camara.position).normalize();
    const distancia = (z - camara.position.z) / direccion.z;
    return camara.position.clone().add(direccion.multiplyScalar(distancia));
  }

  function posicionarSegunViewport() {
    const { u, v } = anclaActual();
    objeto.position.copy(posicionDesdeUV(u, v, 0));
  }

  function ajustarTamano() {
    const { ancho: w, alto: h } = medidasContenedor();
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
    renderer.setSize(w, h);
    posicionarSegunViewport();
  }

  ajustarTamano();

  if ('ResizeObserver' in window && contenedor) {
    new ResizeObserver(() => ajustarTamano()).observe(contenedor);
  } else {
    window.addEventListener('resize', ajustarTamano);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(ajustarTamano);
  }
  window.matchMedia(`(max-width: ${breakpoint}px)`).addEventListener('change', ajustarTamano);

  const observadorTema = new MutationObserver(() => {
    if (opciones.colorAutomatico) actualizarMaterial();
  });
  observadorTema.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });

  // ---- Panel de control (lil-gui) --------------------------------------------
  let gui = null;
  let carpetaForma = null;

  // Construye (o reconstruye) la carpeta "Forma" a partir de las claves de
  // PARAMETROS_DEFECTO del módulo actualmente seleccionado. Como cada
  // geometría tiene parámetros distintos (N/R_base/d/... vs R/Z1/Z2/...),
  // esta carpeta se destruye y se vuelve a armar cada vez que se cambia de
  // geometría en el desplegable.
  function reconstruirCarpetaForma() {
    if (carpetaForma) carpetaForma.destroy();
    carpetaForma = gui.addFolder('Forma');

    Object.entries(parametrosForma).forEach(([clave, valor]) => {
      const rango = rangoParaParametro(clave, valor);
      if (!rango) return; // parámetros no numéricos (si los hubiera) se ignoran
      carpetaForma
        .add(parametrosForma, clave, rango.min, rango.max, rango.step)
        .name(clave)
        .onChange(reconstruirGeometria);
    });

    carpetaForma.open();
  }

  function cambiarGeometria(nombre) {
    nombreGeometriaActual = nombre;
    moduloActual = CATALOGO_GEOMETRIAS[nombre];
    constructorActual = obtenerConstructorGeometria(moduloActual, nombre);
    parametrosForma = { ...(moduloActual.PARAMETROS_DEFECTO || {}) };
    reconstruirGeometria();
    if (mostrarGUI) reconstruirCarpetaForma();
  }

  if (mostrarGUI) {
    gui = new GUI({ title: 'Fondo 3D' });

    gui
      .add(opciones, 'geometria', Object.keys(CATALOGO_GEOMETRIAS))
      .name('geometría')
      .onChange(cambiarGeometria);

    reconstruirCarpetaForma();

    const carpetaMaterial = gui.addFolder('Material');
    carpetaMaterial
      .add(opciones, 'material', { Sólido: 'solido', Alambre: 'alambre', Normales: 'normales' })
      .name('tipo')
      .onChange(actualizarMaterial);
    carpetaMaterial.add(opciones, 'mostrarMalla').name('mostrar malla').onChange((v) => { malla.visible = v; });
    carpetaMaterial.add(opciones, 'colorAutomatico').name('colores del sitio').onChange(actualizarMaterial);
    carpetaMaterial.addColor(opciones, 'colorRellenoFrontal').name('color frontal').onChange(actualizarMaterial);
    carpetaMaterial.addColor(opciones, 'colorRellenoTrasera').name('color trasera').onChange(actualizarMaterial);
    carpetaMaterial.addColor(opciones, 'colorBorde').name('color borde').onChange(actualizarMaterial);

    const carpetaAnimacion = gui.addFolder('Rotación automática');
    carpetaAnimacion.add(opciones, 'autoRotateX').name('eje X');
    carpetaAnimacion.add(opciones, 'autoRotateY').name('eje Y');
    carpetaAnimacion.add(opciones, 'autoRotateZ').name('eje Z');
  }

  // ---- Animación ------------------------------------------------------------
  const prefiereMenosMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const velocidad = { x: 0.0025, y: 0.004, z: 0.003 };

  function animar() {
    if (opciones.autoRotateX) objeto.rotation.x += velocidad.x;
    if (opciones.autoRotateY) objeto.rotation.y += velocidad.y;
    if (opciones.autoRotateZ) objeto.rotation.z += velocidad.z;
    renderer.render(escena, camara);
    if (!prefiereMenosMovimiento) requestAnimationFrame(animar);
  }

  renderer.render(escena, camara);
  if (!prefiereMenosMovimiento) requestAnimationFrame(animar);

  return { escena, camara, renderer, objeto, mallaFrontal, mallaTrasera, posicionDesdeUV, ajustarTamano };
}
