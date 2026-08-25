// fondo-3d.js
//
// Motor genérico de la escena de fondo: cámara, luces, renderer,
// posicionamiento de objetos por fracción de viewport (UV), animación y
// panel de control (lil-gui). NO conoce los detalles de ninguna geometría
// en particular — la importa desde su propio módulo (por ahora,
// geometrias/cono-sinusoidal.js) para poder cambiar de superficie sin
// tocar este archivo.
//
// Three.js y lil-gui se cargan como módulos ES directo desde CDN — sin
// npm, sin bundler, mismo patrón de siempre.

import * as THREE from 'three';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/dist/lil-gui.esm.min.js';
import { crearGeometriaConoSinusoidal, rangoVComponent } from './geometrias/cono-sinusoidal.js';

/**
 * @param {Object} opciones
 * @param {HTMLCanvasElement} opciones.canvas   - canvas donde renderizar
 * @param {HTMLElement} opciones.contenedor     - elemento cuyo tamaño define el viewport 3D
 * @param {{escritorio: {u:number,v:number}, movil: {u:number,v:number}}} opciones.anclaje
 * @param {number} [opciones.breakpoint=860]
 * @param {boolean} [opciones.mostrarGUI=true]  - panel de controles visible
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

  function esModoOscuro() {
    const atributo = document.documentElement.getAttribute('data-tema');
    if (atributo === 'oscuro') return true;
    if (atributo === 'claro') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function colorRellenoTemaFrontal() {
    return esModoOscuro()
      ? leerColorCSS('--color-texto', '#EEF1F3')
      : leerColorCSS('--color-primario', '#964A3D');
  }

  function colorRellenoTemaTrasera() {
    // Invertimos el par de variables respecto a la frontal, para que
    // ambas caras se distingan incluso en modo "colores del sitio".
    return esModoOscuro()
      ? leerColorCSS('--color-primario', '#964A3D')
      : leerColorCSS('--color-texto', '#151515');
  }

  function colorBordeTema() {
    return leerColorCSS('--color-texto', '#151515');
  }

  // ---- Estado / opciones controlables desde la GUI -------------------------
  const opciones = {
    // Forma
    k: 0.4,
    n: 5,
    uComponent: 10,
    vComponent: Math.PI,
    // Material
    material: 'solido', // 'solido' | 'alambre' | 'normales'
    mostrarMalla: false, // superpone las aristas sobre el sólido
    colorAutomatico: true, // true = sigue la paleta/tema del sitio
    colorRellenoFrontal: '#964a3d', // caras frontales (normal hacia la cámara)
    colorRellenoTrasera: '#151515', // caras traseras (normal alejándose de la cámara)
    colorBorde: '#151515',
    // Animación
    autoRotateX: true,
    autoRotateY: true,
    autoRotateZ: false,
  };

  // ---- Geometría y malla -----------------------------------------------------
  let geometria = crearGeometriaConoSinusoidal(opciones);

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

  // Reconstruye geometría cuando cambian los parámetros de forma (k, n, u, v)
  function reconstruirGeometria() {
    geometria.dispose();
    geometria = crearGeometriaConoSinusoidal(opciones);
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
  if (mostrarGUI) {
    const gui = new GUI({ title: 'Cono sinusoidal' });

    const carpetaForma = gui.addFolder('Forma');
    carpetaForma.add(opciones, 'k', -0.8, 0.8, 0.01).name('amplitud (k)').onChange(reconstruirGeometria);

    const controlN = carpetaForma.add(opciones, 'n', 0, 5, 0.5).name('lóbulos (n)').onChange(() => {
      const { min, max } = rangoVComponent(opciones.n);
      controlV.min(min).max(max);
      if (opciones.vComponent < min) opciones.vComponent = min;
      if (opciones.vComponent > max) opciones.vComponent = max;
      controlV.updateDisplay();
      reconstruirGeometria();
    });

    carpetaForma.add(opciones, 'uComponent', -10, 10, 0.01).name('altura (u)').onChange(reconstruirGeometria);

    const rangoInicial = rangoVComponent(opciones.n);
    const controlV = carpetaForma
      .add(opciones, 'vComponent', rangoInicial.min, rangoInicial.max, 0.01)
      .name('barrido angular (v)')
      .onChange(reconstruirGeometria);

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
