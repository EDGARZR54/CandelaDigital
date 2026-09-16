/* ==================================================
   galeria-rejilla.js

   Switch "Mostrar rejilla" (ver "#boton-mostrar-rejilla",
   panel derecho, "Opciones de visualización"). Dibuja una
   rejilla de referencia + ejes X/Y/Z LOCALES apoyados en la
   base del elemento en foco durante "fichas".

   ====================================================
   HISTORIA — por qué esto YA NO es un GridHelper + ejes
   únicos agregados a "scene" (versión anterior):

   La primera versión agregaba UN solo GridHelper y UN solo
   set de ejes a la escena, apoyados en "restY" (la altura de
   TODA la fila, ver galeria-escena.js) — pensados como
   referencia de escala/orientación de la fila completa, no
   de un elemento puntual. Pedido explícito: la rejilla tiene
   que verse SOLO sobre la geometría en foco durante "fichas"
   — nunca de la escena entera, y nunca de todas las
   geometrías a la vez.

   La solución es la misma que ya usan galeria-plano-corte.js
   y galeria-corte-interseccion.js: dejar de colgar nada de
   "scene" y colgar el helper como HIJO de "mallaFrontal" del
   cono en foco, en su espacio LOCAL — así hereda automático
   toda la cadena de transforms (carrusel, autorotado, arrastre
   manual, énfasis) sin que este módulo tenga que sincronizar
   nada a mano frame a frame. Esto además resuelve solo, como
   efecto colateral, el pedido de "que no se vea en todas las
   geometrías a la vez": al colgar de UN único mallaFrontal por
   vez (el del cono activo), nunca hay más de una rejilla
   puesta en la escena al mismo tiempo — no hace falta ningún
   chequeo aparte para eso.

   TAMAÑO: ya NO es un tamaño fijo (10 unidades / 20
   divisiones, pensado para toda la fila) — se calcula
   proporcional al footprint (X/Z) del bbox LOCAL del cono
   activo (mismo bbox que ya usan galeria-corte.js/
   galeria-plano-corte.js), así se ve bien apoyada bajo la
   geometría sea cual sea su tamaño real, en vez de sobrar o
   quedarse corta. Las divisiones (20) siguen fijas: solo
   cambian la densidad visual de la rejilla, no su alcance.

   POSICIÓN: ya no en "restY" (la altura de TODA la fila) —
   en "bbox.min.y" del propio cono, el punto donde ESE
   elemento apoya (mismo criterio que "desplazamientoBase" en
   galeria-escena.js, pero leído del bbox ya calculado en vez
   de recalcularlo acá), centrada en X/Z sobre el centro del
   bbox — igual que "centroParaCorte" en
   galeria-plano-corte.js.

   NO conoce el DOM (mismo criterio que el resto de los
   switches de "Opciones de visualización"): el switch en sí
   vive cableado desde galeria.js, acá solo entra un booleano
   vía "setActivo". "actualizar()" sigue llamándose solo en
   los momentos en que el foco pudo haber cambiado (mismo
   patrón que corteInterseccion/planoCorte) — lo que sí corre
   en cada frame ahora es "update(now)", pero solo avanza una
   animación de opacidad, no recalcula geometría ni bbox (ver
   "TRANSICIÓN CON FUNDIDO" más abajo).

   CONSTRUCCIÓN: a diferencia de planoCorte (que arma los 3
   cuadrados una sola vez y los reutiliza para siempre,
   reposicionándolos) este módulo RECONSTRUYE el grupo entero
   (rejilla + ejes) en cada "actualizar()" — mismo criterio que
   corteInterseccion con sus curvas: THREE.GridHelper hornea
   el tamaño en su propia geometría al construirse, no tiene
   forma de "reescalarlo" después sin tocar geometría, así que
   no hay nada que ganar cacheando un tamaño que en la
   práctica solo cambia al cambiar de foco (o si
   galeria-panel-parametros.js reconstruye la geometría del
   cono activo en caliente) — reconstruir en esos mismos
   momentos es más simple que cachear+comparar tamaños y de
   paso queda siempre al día sin necesitar ningún canal de
   invalidación aparte (a diferencia de "invalidarBboxCono" en
   galeria-corte.js: acá no hace falta nada así porque el bbox
   se relee fresco de "corte.obtenerEstadoActivo()" en cada
   actualizar()).

   BOOLEANO GLOBAL, NO POR FICHA (pedido explícito, igual que
   antes): "activo" no se resetea a ningún valor por defecto
   al cambiar de ficha NI al salir de "fichas" del todo — a
   diferencia de "Mostrar intersección"/"Mostrar plano de
   corte" (que sí fuerzan su booleano a un valor fijo en los 4
   puntos donde galeria.js sale de "fichas", ver esos
   módulos), acá reset() SOLO limpia lo que hubiera puesto o
   fundiéndose en ese momento (instantáneo, sin animar — ver
   "TRANSICIÓN CON FUNDIDO" más abajo) sin tocar "activo": si
   el visitante la dejó prendida, sigue prendida la próxima
   vez que entre a "fichas", enganchándose sola (con su propio
   fundido de entrada) al primer elemento que quede en foco
   (vía el mismo callback "onElementoCambiado" de corte.js que
   ya usan corteInterseccion/planoCorte). Sin este reset() de
   todos modos haría falta: sin él, la rejilla quedaría
   colgada y VISIBLE del último cono enfocado incluso en fases
   donde no hay "ficha" activa (p.ej. "hero"), porque nada más
   la saca de ahí.

   ====================================================
   TRANSICIÓN CON FUNDIDO (cross-fade) AL CAMBIAR DE FICHA:

   Pedido explícito: al cambiar de foco, la rejilla del cono
   anterior no debe desaparecer de golpe ni la del nuevo cono
   aparecer de golpe — tiene que desvanecerse una mientras la
   otra aparece gradualmente. Por eso este módulo YA NO puede
   limitarse a reaccionar a eventos puntuales (cambio de foco,
   slider, switch): necesita un "update(now)" propio, llamado
   UNA VEZ POR FRAME desde el tick() de galeria.js (ver ese
   archivo, junto a zoom.update()/paneo.update()), que avanza
   la animación de opacidad de lo que esté fundiéndose en ese
   momento — a diferencia de "actualizar()", que sigue
   llamándose solo en los momentos en que el foco pudo haber
   cambiado.

   Dos listas separadas en el cierre del módulo (ya NO
   "cono.userData.rejilla" — ver más abajo por qué):

   - "actual": la rejilla del cono HOY en foco, fundiéndose de
     opacidad 0 a 1 desde que se creó (o ya en opacidad 1 si
     el fundido terminó hace rato — update() sigue
     recalculando la misma fórmula cada frame, es barato).

   - "saliendo": un array (normalmente 0 o 1 elementos, pero
     sin asumirlo — ver más abajo) de rejillas que ya NO
     pertenecen a ningún cono en foco y se están fundiendo de
     su opacidad actual a 0, para recién ahí destruirse
     (dispose + sacarlas de mallaFrontal). "opacidadInicial"
     de cada entrada se lee de sus propios materiales en el
     momento en que se la mueve a "saliendo" (no siempre 1):
     si el visitante cambia de foco MUY rápido, un fundido de
     entrada puede interrumpirse a mitad de camino, y el
     fundido de salida tiene que arrancar desde ESA opacidad
     intermedia, no saltar de golpe a 1, o se vería un
     parpadeo. Por la misma razón "saliendo" es un array (no
     un único slot): dos cambios de foco casi seguidos pueden
     dejar más de una rejilla saliendo a la vez, cada una con
     su propio reloj.

   YA NO se cachea nada en "cono.userData.rejilla" (a
   diferencia de la versión anterior de este archivo, y a
   diferencia de "cono.userData.corte"/"cono.userData.
   interseccion" en corte.js/corte-interseccion.js): con el
   fundido cruzado, en cualquier momento puede haber DOS
   rejillas puestas en la escena a la vez (la que entra y la
   que sale), colgadas de DOS conos distintos — guardar "la"
   rejilla de un cono en su propio userData ya no alcanza para
   describir ese estado, así que este módulo pasa a llevar la
   cuenta enteramente en su propio cierre ("actual"/
   "saliendo"), no en los conos.

   DURACION_FADE_MS: cuánto tarda cada fundido (entrada o
   salida) en completarse — ver la constante más abajo.
   "suavizar()" aplica un smoothstep simple (t²(3-2t)) en vez
   de una interpolación lineal, para que el fundido acelere y
   desacelere en vez de verse mecánico.

   NO se anima el swap "mismo cono, bbox invalidado por
   galeria-panel-parametros.js" con ningún caso especial: pasa
   por el mismo camino que un cambio de foco real (la rejilla
   vieja de ESE cono se manda a "saliendo", se arma una nueva
   desde 0) — más simple que distinguir el caso, y en la
   práctica no genera un cross-fade visible porque
   corte.setElementoActivo() ya filtra llamadas redundantes
   (si el id no cambió, "onElementoCambiado" ni se dispara)
   así que actualizar() con el mismo id nunca llega a pasar en
   el flujo normal — este camino queda ahí solo como fallback
   defensivo, no como comportamiento buscado.
   ====================================================

   NO conoce a "corte.js" ni a ningún otro switch — recibe el
   estado ya resuelto de galeria-corte.js vía
   "obtenerEstadoActivo()", inyectado por galeria.js (mismo
   criterio de "inyectar la decisión, no importar el módulo
   ajeno" que ya usa el resto de esta página). Que el foco se
   lea de ahí es un detalle de implementación: "corte"
   simplemente ya es, en este código, el oráculo compartido de
   "qué cono está en foco ahora mismo y cuál es su bbox local"
   — lo mismo que ya consumen corteInterseccion/planoCorte —
   sin que este módulo necesite saber nada de recorte por
   planos.

   Line2 (no THREE.Line para los ejes: LineBasicMaterial casi
   nunca respeta "linewidth" en WebGL) — mismo motivo y mismo
   EPSILON_COPLANAR que ya usaba la versión anterior de este
   archivo (y visor-geometrias.html/rejilla.html) para separar
   los ejes X/Z del plano de la rejilla: es un tema de depth
   buffer, no de grosor aparente, así que hace falta incluso
   con líneas finas.
================================================== */


import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";


const DIVISIONES_REJILLA = 20;
const COLOR_REJILLA_CENTRO = 0x3a3f47;
const COLOR_REJILLA_LINEAS = 0x24272c;

/*
    Multiplica el footprint (X/Z) del bbox para que la
    rejilla quede un poco más grande que la base real de la
    geometría — mismo espíritu que FACTOR_TAMANO en
    galeria-plano-corte.js.
*/
const FACTOR_TAMANO_REJILLA = 1.6;

/*
    Los ejes son más cortos que la rejilla — mismo look que
    la versión anterior (LONGITUD_EJES=2 contra
    TAMANO_REJILLA=10, misma proporción 0.2), ahora expresado
    como fracción del tamaño ya calculado por elemento en vez
    de dos constantes fijas independientes.
*/
const FACTOR_LONGITUD_EJES = 0.2;

const GROSOR_EJES_PX = 2.5;

/*
    Mismo valor y mismo motivo que la versión anterior de
    este archivo: los ejes X y Z son coplanares con la
    rejilla (ambos en y=0 local del grupo) y sin este
    desplazamiento mínimo parpadean por z-fighting, sin
    importar cuán delgadas se vean en pantalla — el conflicto
    pasa en el depth buffer, no en el ancho de línea. El eje Y
    no lo necesita: es perpendicular a la rejilla y solo la
    toca en un punto. Fijo (no proporcional al tamaño del
    elemento) a propósito: es un colchón de precisión de
    punto flotante, no un rasgo visual que deba escalar con la
    geometría.
*/
const EPSILON_COPLANAR = 0.004;

/*
    Cuánto tarda cada fundido (entrada o salida) en
    completarse — ver "TRANSICIÓN CON FUNDIDO" en la cabecera
    del archivo. Ni tan rápido que se sienta un parpadeo ni
    tan lento que se sienta pegajoso al hojear fichas rápido.
*/
const DURACION_FADE_MS = 400;


/*
    Smoothstep (t²(3-2t)): acelera y desacelera el fundido en
    vez de una interpolación lineal, que se ve mecánica. "t"
    ya viene clampeado a [0, 1] por quien llama.
*/
function suavizar(t) {

    return t * t * (3 - 2 * t);

}


/*
    Footprint (X/Z) del bbox LOCAL — más grande de los dos
    anchos horizontales, con un piso mínimo para no colapsar
    en 0 ante un bbox degenerado (geometría plana en algún
    eje).
*/
function tamanoParaBbox(bbox) {

    const anchoX = bbox.max.x - bbox.min.x;
    const anchoZ = bbox.max.z - bbox.min.z;

    const footprint = Math.max(anchoX, anchoZ, 0.001);

    return footprint * FACTOR_TAMANO_REJILLA;

}


function crearEjes(longitud) {

    const grupo = new THREE.Group();

    const definiciones = [
        { color: 0xff3653,
          puntos: [0, EPSILON_COPLANAR, 0,
                   longitud, EPSILON_COPLANAR, 0] },
        { color: 0x4caf3a,
          puntos: [0, 0, 0,
                   0, longitud, 0] },
        { color: 0x3a8bff,
          puntos: [0, EPSILON_COPLANAR, 0,
                   0, EPSILON_COPLANAR, longitud] }
    ];

    const materiales = [];

    definiciones.forEach(({ color, puntos }) => {

        const geometry = new LineGeometry();
        geometry.setPositions(puntos);

        const material = new LineMaterial({
            color,
            linewidth: GROSOR_EJES_PX,
            worldUnits: false,
            transparent: true,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4
        });

        material.resolution.set(
            window.innerWidth, window.innerHeight
        );

        const linea = new Line2(geometry, material);
        linea.computeLineDistances();

        // Ver EPSILON_COPLANAR: dibujar los ejes DESPUÉS de
        // la rejilla es un segundo colchón (depthFunc
        // LEQUAL, gana el que se dibuja último ante un
        // empate exacto de profundidad).
        linea.renderOrder = 1;

        grupo.add(linea);
        materiales.push(material);

    });

    return { grupo, materiales };

}


/*
    Arma, para un bbox LOCAL dado, el grupo completo
    (rejilla + ejes) ya posicionado — todo en un solo paso,
    a diferencia de crearPlano()/reposicionar() en
    galeria-plano-corte.js, porque acá no hay nada que
    reutilizar entre llamadas (ver "CONSTRUCCIÓN" en la
    cabecera del archivo).

    Devuelve también "materiales" (rejilla + ejes juntos, para
    animar opacidad parejo) y "materialesEjes" por separado
    (solo los Line2, para actualizarResolucion() — el
    LineBasicMaterial de GridHelper no tiene noción de
    "resolution", eso es cosa de LineMaterial).
*/
function crearGrupoRejilla(bbox) {

    const tamano = tamanoParaBbox(bbox);
    const longitudEjes = tamano * FACTOR_LONGITUD_EJES;

    const centroX = (bbox.min.x + bbox.max.x) / 2;
    const centroZ = (bbox.min.z + bbox.max.z) / 2;

    const grupo = new THREE.Group();

    const rejilla = new THREE.GridHelper(
        tamano, DIVISIONES_REJILLA,
        COLOR_REJILLA_CENTRO, COLOR_REJILLA_LINEAS
    );

    // "transparent" a propósito desde acá: este material va
    // a tener su "opacity" animado cada frame por update()
    // mientras dure el fundido (ver más abajo).
    rejilla.material.transparent = true;

    grupo.add(rejilla);

    const { grupo: grupoEjes, materiales: materialesEjes } =
        crearEjes(longitudEjes);

    grupo.add(grupoEjes);

    // GridHelper/ejes nacen centrados en el origen LOCAL de
    // este grupo (y=0) — se posiciona el grupo entero en el
    // punto real donde el elemento apoya (mismo criterio que
    // "centroParaCorte" en galeria-plano-corte.js, pero en
    // Y se usa directamente bbox.min.y en vez de un límite
    // de corte).
    grupo.position.set(centroX, bbox.min.y, centroZ);

    const materiales = [rejilla.material, ...materialesEjes];

    return { grupo, materiales, materialesEjes };

}


/*
    Aplica la misma opacidad a toda una tanda de materiales
    (rejilla + ejes) de un tirón — ambos tipos (LineBasicMaterial
    de GridHelper, LineMaterial de los ejes) exponen "opacity"
    igual, así que no hace falta distinguirlos acá.
*/
function aplicarOpacidad(materiales, valor) {

    materiales.forEach(material => {

        material.opacity = valor;

    });

}


function disposeGrupo(grupo) {

    grupo.traverse(objeto => {

        if (objeto.geometry) objeto.geometry.dispose();

        if (objeto.material) {

            if (Array.isArray(objeto.material)) {

                objeto.material.forEach(
                    material => material.dispose()
                );

            } else {

                objeto.material.dispose();

            }

        }

    });

}


/*
    Saca "grupo" de su padre y libera su geometría/materiales
    — paso final tanto de un fundido de salida terminado como
    de una limpieza instantánea (reset()/setActivo(false)).
*/
function destruirGrupo(grupo) {

    disposeGrupo(grupo);

    if (grupo.parent) grupo.parent.remove(grupo);

}


export function createRejillaController({ cones } = {}) {

    if (!cones) {

        return {
            setActivo() {},
            actualizar() {},
            update() {},
            actualizarResolucion() {},
            reset() {}
        };

    }


    let activo = false;

    /*
        La rejilla del cono HOY en foco — { id, cono, grupo,
        materiales, materialesEjes, t0 } o null si no hay
        ninguna puesta. Ya NO vive en "cono.userData.rejilla"
        (ver "TRANSICIÓN CON FUNDIDO" en la cabecera del
        archivo): con el cross-fade puede convivir con una o
        más entradas de "saliendo" colgadas de OTROS conos al
        mismo tiempo, así que el controller lleva la cuenta
        acá, no en los conos.
    */
    let actual = null;

    /*
        Rejillas que ya dejaron de ser "actual" y se están
        fundiendo hacia opacidad 0 antes de destruirse — ver
        "TRANSICIÓN CON FUNDIDO" en la cabecera. Cada entrada:
        { grupo, materiales, t0, opacidadInicial }.
    */
    let saliendo = [];

    /*
        Materiales Line2 de los ejes de "actual" (o array
        vacío si no hay ninguna) — así "actualizarResolucion()"
        no necesita recorrer "cones" enteros ni depender de
        qué cono esté enfocado en ese momento, alcanza con la
        última tanda construida. Las de "saliendo" no se
        actualizan en resize (se están yendo, no vale la pena
        el detalle — ver la cabecera del archivo).
    */
    let materialesEjesActuales = [];


    /*
        Mueve "entrada" (la "actual" de hasta ahora) a la
        lista de "saliendo", arrancando su fundido desde la
        opacidad que YA tuviera en este momento (no siempre 1
        — ver "TRANSICIÓN CON FUNDIDO" en la cabecera: un
        cambio de foco muy rápido puede interrumpir un fundido
        de entrada a mitad de camino).
    */
    function moverASaliendo(entrada, ahora) {

        const opacidadInicial =
            entrada.materiales.length
                ? entrada.materiales[0].opacity
                : 1;

        saliendo.push({
            grupo: entrada.grupo,
            materiales: entrada.materiales,
            t0: ahora,
            opacidadInicial
        });

    }


    /*
        Arma una entrada nueva (grupo colgado de "mallaFrontal"
        del cono, opacidad en 0) lista para que update() la
        vaya fundiendo hacia 1 a partir de "t0".
    */
    function construirEntrada(id, cono, bbox, t0) {

        const [mallaFrontal] = cono.userData.mallas;

        const { grupo, materiales, materialesEjes } =
            crearGrupoRejilla(bbox);

        aplicarOpacidad(materiales, 0);

        mallaFrontal.add(grupo);

        return {
            id, cono, grupo, materiales, materialesEjes, t0
        };

    }


    /*
        Limpieza INSTANTÁNEA, sin animar — usada por reset()
        y por setActivo(false) al apagar el switch del todo,
        a diferencia de un cambio de foco normal (que sí
        cruza-funde vía moverASaliendo()). Deja el controller
        en el mismo estado que si nunca se hubiera construido
        nada.
    */
    function limpiarTodoInstantaneo() {

        if (actual) {

            destruirGrupo(actual.grupo);
            actual = null;

        }

        saliendo.forEach(
            entrada => destruirGrupo(entrada.grupo)
        );

        saliendo = [];
        materialesEjesActuales = [];

    }


    return {

        /*
            Prende/apaga el switch. GLOBAL, no por ficha —
            mismo criterio que "Autorotado" (ver
            galeria-autorotar.js): si el visitante lo prende
            mirando una geometría, sigue prendido al pasar a
            la siguiente, y sigue prendido incluso después de
            salir y volver a entrar a "fichas" (ver "BOOLEANO
            GLOBAL" en la cabecera del archivo — a propósito
            NO se resetea en ningún punto de este módulo).
            Apagar SÍ es instantáneo (no cruza-funde hacia
            "nada"): un swap entre dos rejillas se ve bien
            fundido, pero "el visitante decidió apagar el
            switch" es una acción explícita que conviene
            confirmar al toque, no 400ms después.
        */
        setActivo(nuevoActivo) {

            activo = nuevoActivo;

            if (!activo) limpiarTodoInstantaneo();

        },

        /*
            "estadoActivo": lo que devuelve
            corte.obtenerEstadoActivo() — null, o { id, cono,
            bbox, ... } (acá solo hacen falta "id"/"cono"/
            "bbox"; "planosLocales"/"estado" son cosa de
            corte/corteInterseccion/planoCorte, no de esta
            rejilla). No-op barato si el switch está apagado.

            Ya NO reposiciona/reconstruye "in-place": manda lo
            que hubiera en "actual" a "saliendo" (fundiéndose
            hacia 0 desde donde esté) y arranca una entrada
            nueva desde opacidad 0 — el cruce entre ambas lo
            resuelve update() cuadro a cuadro (ver "TRANSICIÓN
            CON FUNDIDO" en la cabecera).
        */
        actualizar(estadoActivo) {

            if (!activo) return;

            const ahora = performance.now();

            if (!estadoActivo) {

                if (actual) moverASaliendo(actual, ahora);

                actual = null;
                materialesEjesActuales = [];

                return;

            }

            const { id, cono, bbox } = estadoActivo;

            if (actual) moverASaliendo(actual, ahora);

            actual = construirEntrada(id, cono, bbox, ahora);
            materialesEjesActuales = actual.materialesEjes;

        },

        /*
            Único método llamado en CADA frame (ver
            galeria.js, junto a zoom.update()/paneo.update()):
            avanza el fundido de "actual" (0 -> 1 desde su
            "t0") y el de cada entrada de "saliendo"
            (opacidadInicial -> 0 desde la suya), destruyendo
            las que ya llegaron a 0. No-op barato (recorre dos
            colecciones casi siempre vacías) si nadie tocó el
            switch/cambió de ficha recientemente.
        */
        update(now) {

            if (actual) {

                const progreso = suavizar(
                    Math.min(
                        1,
                        (now - actual.t0) / DURACION_FADE_MS
                    )
                );

                aplicarOpacidad(actual.materiales, progreso);

            }

            if (saliendo.length === 0) return;

            saliendo = saliendo.filter(entrada => {

                const progreso = suavizar(
                    Math.min(
                        1,
                        (now - entrada.t0) / DURACION_FADE_MS
                    )
                );

                aplicarOpacidad(
                    entrada.materiales,
                    entrada.opacidadInicial * (1 - progreso)
                );

                if (progreso < 1) return true;

                destruirGrupo(entrada.grupo);

                return false;

            });

        },

        /*
            Ver "grupo.userData.materialesLinea" en la
            versión original de este archivo: sin este
            llamado en cada resize, los ejes quedan con el
            grosor calculado para el viewport viejo —
            LineMaterial necesita saber el tamaño del
            viewport en píxeles para convertir "linewidth" a
            espacio de clip. No-op barato (array vacío) si no
            hay rejilla puesta en este momento — igual hay
            que llamarlo siempre, no solo con el switch
            prendido, para que el grosor esté al día apenas
            el visitante la prenda.
        */
        actualizarResolucion() {

            materialesEjesActuales.forEach(material => {

                material.resolution.set(
                    window.innerWidth,
                    window.innerHeight
                );

            });

        },

        /*
            Mismo momento que
            autorotar.reset()/corte.reset()/corteInterseccion.
            reset()/etc. — los 4 puntos donde galeria.js sale
            de "fichas". A diferencia de esos otros módulos,
            este reset() NO toca "activo" (ver "BOOLEANO
            GLOBAL" en la cabecera): solo limpia, de forma
            INSTANTÁNEA (sin fundido — ver
            "limpiarTodoInstantaneo()") lo que hubiera puesto
            o fundiéndose en ese momento, para no dejar nada
            colgado y visible en una fase donde no hay ninguna
            "ficha" en foco. Si el switch seguía prendido, se
            vuelve a enganchar sola (con su propio fundido de
            entrada) al primer elemento que entre en foco la
            próxima vez que se entre a "fichas" (vía el mismo
            callback "onElementoCambiado" de corte.js que ya
            disparan corteInterseccion/planoCorte).
        */
        reset() {

            limpiarTodoInstantaneo();

        }

    };

}

