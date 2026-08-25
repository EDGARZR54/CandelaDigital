// navbar.js
// Inyecta el navbar y el footer compartidos (partials/navbar.html,
// partials/footer.html) dentro de #navbar-placeholder y
// #footer-placeholder, y luego arranca el comportamiento de siempre: menú
// móvil, estado al hacer scroll y modo oscuro/claro persistente.

(function () {
  const CLAVE_TEMA = 'cascarones:tema';

  // Se calcula AQUÍ, en la parte síncrona del script (document.currentScript
  // solo es válido mientras el script se está ejecutando por primera vez,
  // no dentro de callbacks async más abajo). A partir de la ruta con la que
  // se cargó este mismo <script> deducimos el prefijo hacia la raíz del
  // sitio: "js/navbar.js" -> "" (páginas en la raíz), "../js/navbar.js" ->
  // "../" (una carpeta abajo), "../../js/navbar.js" -> "../../", etc. Así
  // un mismo navbar.js sirve para cualquier página sin importar su
  // profundidad, sin tener que tocar rutas a mano en cada carpeta nueva.
  const BASE = (function calcularBase() {
    const propio = document.currentScript
      || document.querySelector('script[src$="navbar.js"]');
    const src = propio ? propio.getAttribute('src') : 'js/navbar.js';
    return src.replace(/js\/navbar\.js(\?.*)?$/, '');
  })();

  function aplicarTemaGuardado() {
    const guardado = localStorage.getItem(CLAVE_TEMA);
    if (guardado === 'oscuro' || guardado === 'claro') {
      document.documentElement.setAttribute('data-tema', guardado);
    }
  }

  function alternarTema() {
    const actual = document.documentElement.getAttribute('data-tema');
    const prefiereOscuro = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const esOscuroAhora = actual ? actual === 'oscuro' : prefiereOscuro;
    const nuevo = esOscuroAhora ? 'claro' : 'oscuro';
    document.documentElement.setAttribute('data-tema', nuevo);
    localStorage.setItem(CLAVE_TEMA, nuevo);
  }

  // Descarga un parcial (navbar.html o footer.html), sustituye el
  // marcador __BASE__ por el prefijo real de la página actual, y lo
  // inserta dentro del contenedor indicado.
  async function inyectarParcial(selector, archivo) {
    const contenedor = document.querySelector(selector);
    if (!contenedor) return;
    try {
      const respuesta = await fetch(BASE + 'partials/' + archivo);
      if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
      const html = (await respuesta.text()).split('__BASE__').join(BASE);
      contenedor.innerHTML = html;
    } catch (err) {
      console.error('No se pudo cargar el parcial "' + archivo + '":', err);
    }
  }

  // Compara cada link del navbar contra la URL actual y marca el vigente
  // con aria-current="page" (antes esto se escribía a mano en cada HTML;
  // al compartir el mismo navbar.html en todas las páginas, tiene que
  // resolverse en JS comparando contra location.pathname).
  function marcarPaginaActual() {
    const enlacesNav = document.querySelectorAll('.nav__enlaces a[href]');
    enlacesNav.forEach((enlace) => {
      if (enlace.pathname === window.location.pathname) {
        enlace.setAttribute('aria-current', 'page');
      }
    });
  }

  function iniciar() {
    aplicarTemaGuardado();

    const nav = document.querySelector('.nav');
    if (!nav) return;

    const disparador = nav.querySelector('.nav__disparador');
    const enlaces = nav.querySelectorAll('.nav__enlaces a');
    const botonTema = nav.querySelector('.nav__tema');

    // Menú móvil
    if (disparador) {
      disparador.addEventListener('click', () => {
        const abierto = nav.getAttribute('data-abierto') === 'true';
        nav.setAttribute('data-abierto', String(!abierto));
        disparador.setAttribute('aria-expanded', String(!abierto));
        document.body.style.overflow = abierto ? '' : 'hidden';
      });

      enlaces.forEach((enlace) => {
        enlace.addEventListener('click', () => {
          nav.setAttribute('data-abierto', 'false');
          disparador.setAttribute('aria-expanded', 'false');
          document.body.style.overflow = '';
        });
      });
    }

    // Navbar sólida al hacer scroll
    const actualizarEstadoScroll = () => {
      nav.classList.toggle('nav--fija', window.scrollY > 24);
    };
    actualizarEstadoScroll();
    window.addEventListener('scroll', actualizarEstadoScroll, { passive: true });

    // Modo oscuro
    if (botonTema) {
      botonTema.addEventListener('click', alternarTema);
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([
      inyectarParcial('#navbar-placeholder', 'navbar.html'),
      inyectarParcial('#footer-placeholder', 'footer.html'),
    ]);
    marcarPaginaActual();
    iniciar();
  });
})();
