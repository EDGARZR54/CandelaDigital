/* ==================================================
   galeria-dispositivo.js

   Heurística de "tier" de dispositivo — único punto de
   verdad para que galeria-escena.js (y cualquier otro
   módulo que lo necesite más adelante: densidad de
   geometría paramétrica, cantidad de partículas de
   polvo, etc.) decida qué features gráficas bajar en
   hardware de gama media/baja.

   Mismo criterio que ya usaba Maqueta.html
   (IS_MOBILE_TIER): puntero "coarse" (touch, no mouse
   de precisión) O pocos núcleos de CPU reportados. Ninguna
   de las dos señales es perfecta por sí sola (una tablet
   cara tiene puntero coarse pero hardware potente; un
   laptop viejo con mouse puede tener pocos núcleos), pero
   combinadas dan una heurística barata y sin permisos
   especiales — no hay forma confiable de leer la GPU real
   desde el navegador sin WEBGL_debug_renderer_info, que
   muchos navegadores ya limitan/deprecian.

   Se calcula UNA sola vez al cargar el módulo (no cambia
   en caliente): si el dispositivo cambia de touch a mouse
   a mitad de sesión (un 2-en-1 desacoplando el teclado,
   por ejemplo) no vale la pena reevaluar/reconstruir el
   renderer por eso.
================================================== */

export const IS_MOBILE_TIER =
    (
        window.matchMedia &&
        window.matchMedia('(pointer: coarse)').matches
    ) ||
    (
        navigator.hardwareConcurrency !== undefined &&
        navigator.hardwareConcurrency <= 4
    );
