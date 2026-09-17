/* ==================================================
   galeria-mapa.js

   Mapa dentro del cuadrado del panel derecho de la
   ficha (".ficha__panel-cuadro"/"#panel-derecho-cuadro"
   en galeria.html).

   CÓMO SE CONECTA CON EL RESTO DE LA PÁGINA:

     - El "progreso" del recorrido no sale de un listener
       de scroll propio: es "focoContinuo", un número que
       calcula carousel.update() en galeria-carrusel.js a
       partir del "t" de la fase "fichas". No es el "t"
       crudo: "t * (elementCount - 1)" desincroniza el
       vuelo del mapa del centrado real de la geometría,
       sobre todo en el primer elemento (ver el comentario
       junto a "focoContinuo" en galeria-carrusel.js, y
       junto a update() más abajo, para el porqué exacto).
       Cuando hace falta leer scroll crudo (para la
       histéresis de "¿el visitante siguió scrolleando
       después de soltar el mapa?", ver update()), se pide
       a galeria-scroll.js, el punto único de lectura para
       toda la página — nunca window.scrollY directo.
     - El GeoJSON no se pide por red acá: "elementos" ya
       viene cargado por galeria.js (mismo array que usa
       "panelDerecho" para coordenadas/dirección, ver
       galeria-config.js) y se recibe tal cual. Cada
       elemento trae su propio "coordenadas" ([lng, lat]
       crudo — ver ese campo en galeria-config.js).
     - Los pines siempre muestran TODOS los edificios,
       en su posición geográfica real, sin importar el
       "order" vigente — el "order" (ver getOrder más
       abajo, viene de galeria-reordenar.js) solo decide
       la SECUENCIA en la que la cámara los visita a
       medida que avanza "fichas", exactamente la misma
       secuencia en la que el carrusel 3D los muestra.
     - El mapa ocupa solo el cuadrado (contenedor real
       que le pasa galeria.js), no la ventana completa —
       por eso no hay ningún manejo especial del wheel: es
       un widget más chico que la ventana, así que el
       wheel arriba del mapa hace zoom del mapa
       (comportamiento estándar de cualquier mapa
       incrustado) y el wheel afuera scrollea la página.

   CARGA DIFERIDA: MapLibre GL (~200kb) + Turf no se
   cargan al abrir la página — recién cuando el scroll
   entra a la fase "orden" (una fase ANTES de "fichas")
   se inyectan sus <script>/<link> y se
   arma el mapa, así ya está listo para cuando el
   visitante llega al cuadrado, sin haber pagado ese peso
   si nunca llega tan lejos. Ver cargar() más abajo.
================================================== */


import {
    getScrollY,
    getScrollDelta
} from "./galeria-scroll.js";

import { ESTADO_COLOR } from "./galeria-config.js";


const MAPLIBRE_JS_URL =
    "https://unpkg.com/maplibre-gl@5.1.0/dist/maplibre-gl.js";
const MAPLIBRE_CSS_URL =
    "https://unpkg.com/maplibre-gl@5.1.0/dist/maplibre-gl.css";
const TURF_JS_URL =
    "https://unpkg.com/@turf/turf@6/turf.min.js";

/*
    Mismo umbral que "@media (max-width: 780px)" en
    galeria.css, donde "#ficha-panel-marco { display:
    none }" — por debajo de ese ancho el cuadrado nunca es
    visible, así que no tiene sentido bajar MapLibre/Turf
    (~200kb+) para nada. Si el archivo CSS cambia ese
    número, hay que actualizar acá también (mismo trade-off
    que ya asume galeria.css: el comentario ahí dice
    explícitamente "mismo umbral que navbar.css, 780px" —
    un número duplicado y documentado, no una fuente única
    compartida).
*/
const ANCHO_MINIMO_MAPA_PX = 780;


/*
    Inyecta un <script> clásico (no ES module): MapLibre y
    Turf se consumen como globals "maplibregl"/"turf", no
    por import map. Idempotente: si el mismo <script src>
    ya está en el documento (por ejemplo, reset() +
    cargar() llamados de nuevo), no lo duplica — espera a
    que termine de cargar si todavía está en vuelo.
*/
function cargarScript(src) {

    return new Promise((resolve, reject) => {

        const existente =
            document.querySelector(
                'script[src="' + src + '"]'
            );

        if (existente) {

            if (existente.dataset.cargado === "1") {

                resolve();
                return;

            }

            existente.addEventListener(
                "load", () => resolve(), { once: true }
            );
            existente.addEventListener(
                "error", reject, { once: true }
            );
            return;

        }

        const script = document.createElement("script");
        script.src = src;

        script.addEventListener(
            "load",
            () => {

                script.dataset.cargado = "1";
                resolve();

            },
            { once: true }
        );

        script.addEventListener(
            "error", reject, { once: true }
        );

        document.head.appendChild(script);

    });

}


function cargarCSS(href) {

    if (
        document.querySelector(
            'link[href="' + href + '"]'
        )
    ) {

        return;

    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;

    document.head.appendChild(link);

}


function easeInOutQuad(t) {

    return t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;

}


/*
    Plantilla del SVG del pin (assets/pin.svg, editable a mano: forma,
    trazo, radio del hueco). Se pide UNA sola vez y se cachea acá —
    "colorPin" no cambia con el tema (ver "cfg.colorPin" en
    galeria-config.js), así que no hace falta volver a pedir el archivo
    ni reconstruir la imagen más que la primera vez.
*/
let plantillaPinPromesa = null;

function obtenerPlantillaPin() {

    if (!plantillaPinPromesa) {

        plantillaPinPromesa =
            fetch("assets/pin.svg").then(respuesta => {

                if (!respuesta.ok) {

                    throw new Error("HTTP " + respuesta.status);

                }

                return respuesta.text();

            });

    }

    return plantillaPinPromesa;

}

/*
    Pisa el fill del path "pin-fill" de la plantilla con el color
    vigente, sin importar qué color de vista previa traiga el archivo
    — así assets/pin.svg puede abrirse y editarse (forma, trazo,
    radio) sin que ese valor de fill le importe a esta función.
*/
function coloreaPlantillaPin(svgTexto, color) {

    return svgTexto.replace(
        /(<path id="pin-fill" fill=")[^"]*(")/,
        "$1" + color + "$2"
    );

}


/*
    Hex de la etiqueta de estado en el popup, derivado en vivo de
    ESTADO_COLOR (galeria-config.js), que es la ÚNICA fuente de
    verdad de esos tonos (vive en {r,g,b} para los conos 3D en
    THREE): acá solo se convierte a "#rrggbb" para poder usarlo en
    el CSS inline del popup, sin una segunda copia manual que pueda
    quedar desincronizada. Las categorías fuera del vocabulario
    cerrado caen al gris "#666666".
*/
function rgbObjAHex({ r, g, b }) {

    return '#' + [r, g, b]
        .map(c => c.toString(16).padStart(2, '0'))
        .join('');

}

function colorEstadoHex(categoria) {

    const clave =
        (categoria || "").toLowerCase();

    const rgb = ESTADO_COLOR[clave];

    return rgb ? rgbObjAHex(rgb) : "#666666";

}


/*
    Elige el archivo de estilo del mapa (claro/oscuro)
    según "data-tema" en <html> — mismo atributo que ya
    gobierna el resto del sitio (ver navbar.js /
    actualizarColoresTema() en galeria-escena.js). Si
    "cfg.styleUrlOscuro" no está definido en
    galeria-config.js, cae siempre a "cfg.styleUrl", así
    que agregar el modo oscuro es opcional por proyecto.
*/
function estiloSegunTema(cfg) {

    const esOscuro =
        document.documentElement
            .getAttribute("data-tema") === "oscuro";

    return (esOscuro && cfg.styleUrlOscuro)
        ? cfg.styleUrlOscuro
        : cfg.styleUrl;

}


export function createMapaController({
    container,
    elementos,
    getOrder,
    config
}) {

    const cfg = config.mapa;

    let map = null;
    let contenedorMapa = null;

    /*
        "claro" | "oscuro" | null (todavía sin mapa) — el
        tema con el que se armó el estilo ACTUALMENTE
        aplicado. Lo usa actualizarTema() para no llamar a
        map.setStyle() de más si el atributo "data-tema"
        cambia pero, por lo que sea (falta
        "styleUrlOscuro" en config), el archivo de estilo
        resultante es el mismo de todos modos.
    */
    let temaActual = null;

    let cargando = false;
    let listo = false;

    /*
        Bbox (con offset) de TODOS los edificios, para que
        map.getCenter() nunca caiga afuera de esa caja,
        sea cual sea el origen del movimiento (recorrido
        automático, drag, zoom).
    */
    let cameraBounds = null;
    let clampingCenter = false;

    /*
        "targetFloatIndex" lo fija update(), llamado por
        galeria.js en la fase "fichas" con el
        "focoContinuo" que expone carousel.update() (ver
        cabecera y update() más abajo).
    */
    let targetFloatIndex = 0;

    let legOrigin = null;
    let legOriginIndex0 = -1;
    let legOriginDirty = true;

    /*
        REANUDACIÓN: mientras el visitante arrastra/hace
        zoom a mano, el mapa no escribe sobre la cámara —
        el recorrido automático se retoma recién cuando el
        scroll real (no el "t" suavizado) se movió más que
        "umbralReanudarPx" desde que empezó la interacción
        manual. "scrollY" sale de galeria-scroll.js (punto
        único de lectura), no de window.scrollY directo.
    */
    let userInteracting = false;
    let scrollYAlEmpezarInteraccion = 0;


    function onUserInteractionStart(e) {

        if (e && !e.originalEvent) return;

        if (!userInteracting) {

            /*
                Sin "now": esto corre desde un evento de
                MapLibre disparado por un gesto real del
                usuario (dragstart/zoomstart), fuera del
                loop de render de galeria.js — exactamente
                el caso "llamada suelta" que
                getScrollY()/ getScrollDelta() ya
                contemplan sin necesitar "now" (ver
                galeria-scroll.js).
            */
            scrollYAlEmpezarInteraccion = getScrollY();

        }

        userInteracting = true;

    }

    function markInteractionStartRaw() {

        if (!userInteracting) {

            scrollYAlEmpezarInteraccion = getScrollY();

        }

        userInteracting = true;

    }


    function clampCenterToBounds() {

        if (!cameraBounds || !map || clampingCenter) return;

        const center = map.getCenter();
        const [minLng, minLat, maxLng, maxLat] =
            cameraBounds;

        const clampedLng =
            Math.min(Math.max(center.lng, minLng), maxLng);
        const clampedLat =
            Math.min(Math.max(center.lat, minLat), maxLat);

        if (
            clampedLng !== center.lng ||
            clampedLat !== center.lat
        ) {

            clampingCenter = true;
            map.setCenter([clampedLng, clampedLat]);
            clampingCenter = false;

        }

    }


    function addBoundingBoxLayer(geojsonData) {

        const rawBbox = window.turf.bbox(geojsonData);
        const rawBboxPolygon =
            window.turf.bboxPolygon(rawBbox);
        const buffered =
            window.turf.buffer(
                rawBboxPolygon,
                cfg.bboxOffsetKm,
                { units: "kilometers" }
            );

        return window.turf.bbox(buffered);

    }


    /*
        Carga (si hace falta) la imagen "pin-marker" en el
        ImageManager del mapa. Separada de "addLayer" (ver
        pinLayerSpec()/addPinLayer() más abajo) por dos
        motivos:

          1. La usa "styleimagemissing" (ver ese listener en
             cargar(), más abajo) como red de seguridad: si
             por lo que sea la imagen no está registrada
             cuando una capa la pide (p. ej. porque
             MapLibre tuvo que reconstruir el estilo entero
             en vez de "diffear" — ver el comentario grande
             junto a actualizarTema() sobre por qué puede
             pasar), ese evento dispara y basta con
             llamarla de vuelta.
          2. Al cambiar de tema (actualizarTema()) no hace
             falta invocarla: si el diff de setStyle()
             tiene éxito, el ImageManager es el MISMO
             objeto (no se recrea), así que "pin-marker"
             sigue registrado — solo la capa/fuente
             necesitan ir incluidas en el JSON fusionado
             que se le pasa a setStyle() (ver más abajo).
    */
    function asegurarImagenPin() {

        if (map.hasImage("pin-marker")) {

            return Promise.resolve();

        }

        return obtenerPlantillaPin().then(plantilla => {

            return new Promise((resolve, reject) => {

                const svg =
                    coloreaPlantillaPin(plantilla, cfg.colorPin);

                const img = new Image(96, 96);

                img.onload = () => {

                    if (!map.hasImage("pin-marker")) {

                        map.addImage("pin-marker", img);

                    }

                    resolve();

                };

                img.onerror = reject;
                img.src =
                    "data:image/svg+xml;charset=utf-8," +
                    encodeURIComponent(svg);

            });

        });

    }


    /*
        Definición de la capa de pines — objeto plano, sin
        efectos secundarios, para poder reusarla tal cual
        tanto en addPinLayer() (carga inicial, vía
        map.addLayer()) como al inyectarla en el JSON de un
        estilo nuevo antes de pasárselo a setStyle() (ver
        actualizarTema() más abajo) — mismo layout en los
        dos casos, un solo lugar para editarlo.
    */
    function pinLayerSpec() {

        return {
            id: "edificios-pines",
            type: "symbol",
            source: "edificios",
            layout: {
                "icon-image": "pin-marker",
                "icon-anchor": "bottom",
                "icon-size": [
                    "interpolate", ["linear"], ["zoom"],
                    10, 0.35,
                    15, 0.6,
                    18, 0.9
                ],
                "icon-allow-overlap": true,
                "icon-ignore-placement": true
            }
        };

    }


    async function addPinLayer() {

        await asegurarImagenPin();
        map.addLayer(pinLayerSpec());

    }


    /*
        Construye el FeatureCollection que consume
        MapLibre/Turf a partir de "elementos" (ya cargado
        por galeria.js), sin pedir el GeoJSON por red.
        Autor(es)/Estado de conservación se leen del mismo
        array "ficha" que arma normalizarElemento() en
        galeria-config.js (buscando por label), en vez de
        duplicar esos datos en un campo aparte solo para el
        popup del mapa.

        Elementos sin "coordenadas" (ver ese campo en
        galeria-config.js — null si el Feature no era un
        Point válido) se excluyen: no hay dónde ponerles
        un pin.
    */
    function construirGeoJSON() {

        const features = [];

        elementos.forEach(el => {

            if (!el.coordenadas) return;

            const autores =
                (
                    el.ficha.find(
                        c => c.label === "Autor(es)"
                    ) || {}
                ).value || "";

            const categoria =
                (
                    el.ficha.find(
                        c =>
                            c.label ===
                            "Estado de conservación"
                    ) || {}
                ).value || "";

            features.push({
                type: "Feature",
                geometry: {
                    type: "Point",
                    coordinates: el.coordenadas
                },
                properties: {
                    elementoId: el.indice,
                    nombre: el.nombre,
                    subtitulo: el.subtitulo,
                    autores,
                    categoria
                }
            });

        });

        return { type: "FeatureCollection", features };

    }


    /*
        A partir de UN índice flotante, calcula lng/lat/zoom
        interpolando entre el punto A (índice entero hacia
        abajo) y el punto B (el siguiente), con dos rampas
        independientes (zoom / pan) que se solapan un poco
        en los bordes.

        "coordsEnOrden" no es el orden crudo del GeoJSON:
        se arma en update() a partir de getOrder(), la
        MISMA secuencia que usa el carrusel 3D (ver
        galeria-carrusel.js) para decidir qué elemento va
        en cada "slot". Así el mapa visita los edificios en
        el mismo orden en que el visitante los ve pasar en
        la geometría, incluso después de reordenar (fase
        "orden").
    */
    function computeCameraState(floatIndex, coordsEnOrden) {

        const n = coordsEnOrden.length;

        const clamped =
            Math.max(0, Math.min(n - 1, floatIndex));
        const index0 =
            Math.min(Math.floor(clamped), n - 1);
        const index1 =
            Math.min(index0 + 1, n - 1);

        /*
            BORDE FINAL: "index0 === index1" SOLO pasa
            cuando index0 === n - 1, es decir, cuando no
            queda ningún tramo siguiente al que volar (ver
            "index1" arriba). El resto de esta función
            (legOrigin + interpolación por "frac") asume que
            SIEMPRE hay un tramo real entre dos coordenadas
            distintas, y en el borde final esa asunción no
            vale.

            Por eso acá se devuelve la coordenada REAL del
            último pin directo, sin pasar por legOrigin/frac
            en absoluto: es el mismo target al que llegaría
            la fórmula de abajo en frac=1 (zoom
            cfg.zoomCerca, lng/lat = coord1), servido en
            TODOS los frames de esta meseta. Así el
            suavizado exponencial de update() converge
            asintóticamente sobre el pin.

            Pasar por la fórmula general acá dejaría la
            cámara congelada: "legOrigin" se capturaría de
            map.getCenter() (la posición REAL, ya suavizada
            por update(), que nunca coincide exacto con el
            target mientras dura la interpolación
            exponencial) y, como "frac" queda fijo en 0 en
            este caso, ese mismo valor volvería como ideal
            en todos los frames siguientes, con el rezago
            residual del suavizado del instante exacto en
            que "index0" cruzó a n-1 y sin margen para
            seguir acercándose. En cualquier índice
            intermedio ese rezago se corrige solo, porque el
            tramo siguiente vuelve a apuntar a una
            coordenada real; en el borde final no hay tramo
            siguiente que lo corrija.

            "legOriginDirty = true" deja el estado listo
            para que, si el visitante scrollea hacia atrás,
            el próximo tramo real capture un "legOrigin"
            fresco.
        */
        if (index0 === index1) {

            legOriginDirty = true;

            const coord0 = coordsEnOrden[index0];

            return {
                lng: coord0[0],
                lat: coord0[1],
                zoom: cfg.zoomCerca
            };

        }

        const frac = clamped - index0;

        if (legOriginDirty || legOriginIndex0 !== index0) {

            if (legOriginDirty && map) {

                const c = map.getCenter();
                legOrigin = {
                    lng: c.lng,
                    lat: c.lat,
                    zoom: map.getZoom()
                };

            } else {

                const c0 = coordsEnOrden[index0];
                legOrigin = {
                    lng: c0[0],
                    lat: c0[1],
                    zoom: cfg.zoomCerca
                };

            }

            legOriginIndex0 = index0;
            legOriginDirty = false;

        }

        const coord1 = coordsEnOrden[index1];

        let zoom;
        const zoomOutEnd =
            cfg.faseZoomOutFin + cfg.solape;
        const zoomInStart =
            cfg.fasePanFin - cfg.solape;

        if (frac <= zoomOutEnd) {

            const t =
                easeInOutQuad(
                    Math.min(1, frac / zoomOutEnd)
                );
            zoom =
                legOrigin.zoom +
                (cfg.zoomLejos - legOrigin.zoom) * t;

        } else if (frac >= zoomInStart) {

            const t =
                easeInOutQuad(
                    Math.min(
                        1,
                        (frac - zoomInStart) /
                            (1 - zoomInStart)
                    )
                );
            zoom =
                cfg.zoomLejos +
                (cfg.zoomCerca - cfg.zoomLejos) * t;

        } else {

            zoom = cfg.zoomLejos;

        }

        const panStart =
            cfg.faseZoomOutFin - cfg.solape;
        const panEnd =
            cfg.fasePanFin + cfg.solape;

        let lng, lat;

        if (frac <= panStart) {

            lng = legOrigin.lng;
            lat = legOrigin.lat;

        } else if (frac >= panEnd) {

            lng = coord1[0];
            lat = coord1[1];

        } else {

            const t =
                easeInOutQuad(
                    (frac - panStart) / (panEnd - panStart)
                );
            lng =
                legOrigin.lng +
                (coord1[0] - legOrigin.lng) * t;
            lat =
                legOrigin.lat +
                (coord1[1] - legOrigin.lat) * t;

        }

        return { lng, lat, zoom };

    }


    /*
        Arranca la carga diferida de MapLibre/Turf + arma
        el mapa. Idempotente: llamarla de nuevo mientras ya
        está cargando/lista no hace nada — así galeria.js
        puede llamarla en cada frame de la fase "orden" sin
        preocuparse de "solo la primera vez" (mismo
        criterio que el resto del motor: recalcular/
        reintentar cada frame es más simple que sostener un
        flag afuera, ver fijarOpacidadPanel).
    */
    async function cargar() {

        if (cargando || listo) return;

        /*
            Ver ANCHO_MINIMO_MAPA_PX arriba: por debajo de
            este ancho el cuadrado está en "display:none"
            (galeria.css), así que ni "cargando" ni "listo"
            se tocan acá — se revisa de nuevo, barato, en
            cada frame de "orden" (mismo criterio "sin
            flags" que el resto del módulo), por si el
            visitante gira el celular o agranda la ventana
            a mitad de sesión.
        */
        if (window.innerWidth < ANCHO_MINIMO_MAPA_PX) return;

        cargando = true;

        try {

            cargarCSS(MAPLIBRE_CSS_URL);

            await Promise.all([
                cargarScript(MAPLIBRE_JS_URL),
                cargarScript(TURF_JS_URL)
            ]);

            crearContenedor();

            /*
                Tema vigente AL MOMENTO de armar el mapa
                (la fase "orden" puede alcanzarse con
                cualquiera de los dos temas activos) — se
                guarda en "temaActual" para que
                actualizarTema() sepa, más adelante, si
                el tema cambió de verdad respecto de este
                estilo inicial.
            */
            temaActual =
                document.documentElement
                    .getAttribute("data-tema") === "oscuro"
                    ? "oscuro" : "claro";

            const geojsonData = construirGeoJSON();

            const coordsIniciales =
                getOrder()
                    .map(id => elementos[id].coordenadas)
                    .filter(Boolean);

            const estadoInicial =
                coordsIniciales.length > 0
                    ? computeCameraState(0, coordsIniciales)
                    : { lng: -99.13, lat: 19.43, zoom: cfg.zoomCerca };

            map = new window.maplibregl.Map({
                container: contenedorMapa,
                style: estiloSegunTema(cfg) + "?v=" + Date.now(),
                center: [estadoInicial.lng, estadoInicial.lat],
                zoom: estadoInicial.zoom,
                bearing: 0,
                antialias: true,
                maplibreLogo: false,
                /*
                    "compact": el mapa es un widget chico
                    (el cuadrado), y el control de
                    atribución completo no entra cómodo a
                    ese tamaño.
                */
                attributionControl: { compact: true }
            });

            window.__galeriaMapa = map;

            map.scrollZoom.enable();
            map.dragPan.enable();
            map.doubleClickZoom.enable();
            map.touchZoomRotate.enable();
            map.boxZoom.disable();
            map.keyboard.disable();
            map.dragRotate.disable();

            map.addControl(
                new window.maplibregl.NavigationControl(
                    { showCompass: false }
                ),
                "top-right"
            );

            map.on("dragstart", onUserInteractionStart);
            map.on("zoomstart", onUserInteractionStart);

            /*
                Red de seguridad para "pin-marker" (ver el
                comentario grande junto a asegurarImagenPin()):
                si CUALQUIER capa pide esta imagen y no está
                registrada en el ImageManager vigente en ese
                momento, MapLibre dispara este evento antes de
                darla por "faltante" — alcanza con cargarla
                de vuelta. Cubre el caso límite en que
                actualizarTema() (más abajo) cae a una
                reconstrucción completa del estilo porque el
                diff sincrónico falló.
            */
            map.on("styleimagemissing", e => {

                if (e.id !== "pin-marker") return;

                asegurarImagenPin().catch(err => {

                    console.error(
                        "galeria-mapa.js: no se pudo " +
                        "reponer la imagen del pin tras " +
                        "\"styleimagemissing\":", err
                    );

                });

            });

            const elMapa = map.getContainer();
            elMapa.addEventListener(
                "mousedown", markInteractionStartRaw,
                { passive: true }
            );
            elMapa.addEventListener(
                "touchstart", markInteractionStartRaw,
                { passive: true }
            );
            elMapa.addEventListener(
                "wheel", markInteractionStartRaw,
                { passive: true }
            );

            await new Promise((resolve, reject) => {

                map.on("load", async () => {

                    try {

                        map.addSource("edificios", {
                            type: "geojson",
                            data: geojsonData
                        });

                        cameraBounds =
                            addBoundingBoxLayer(geojsonData);

                        map.on("move", clampCenterToBounds);

                        await addPinLayer();

                        const popup =
                            new window.maplibregl.Popup({
                                closeButton: true,
                                closeOnClick: true
                            });

                        map.on(
                            "click", "edificios-pines",
                            e => {

                                const feature =
                                    e.features[0];

                                if (!feature) return;

                                const p =
                                    feature.properties;

                                const html =
                                    '<div style="font-weight:700;">' +
                                    p.nombre +
                                    "</div>" +
                                    '<div style="font-size:0.85rem;color:#555;">' +
                                    p.autores +
                                    "</div>" +
                                    "<div>" + p.subtitulo + "</div>" +
                                    (
                                        p.categoria
                                            ? '<div style="display:inline-block;padding:2px 10px;border-radius:12px;margin-top:4px;color:#fff;background:' +
                                              colorEstadoHex(p.categoria) +
                                              ';">' +
                                              p.categoria +
                                              "</div>"
                                            : ""
                                    );

                                popup
                                    .setLngLat(
                                        feature.geometry.coordinates
                                    )
                                    .setHTML(html)
                                    .addTo(map);

                            }
                        );

                        map.on(
                            "mouseenter", "edificios-pines",
                            () => {

                                map.getCanvas().style.cursor =
                                    "pointer";

                            }
                        );

                        map.on(
                            "mouseleave", "edificios-pines",
                            () => {

                                map.getCanvas().style.cursor =
                                    "";

                            }
                        );

                        resolve();

                    } catch (err) {

                        reject(err);

                    }

                });

            });

            listo = true;
            contenedorMapa.classList.add("lista");

        } catch (err) {

            console.error(
                "galeria-mapa.js: no se pudo cargar el " +
                "mapa:", err
            );

        } finally {

            cargando = false;

        }

    }


    /*
        Crea el <div> real del mapa DENTRO del contenedor
        que pasó galeria.js (#panel-derecho-cuadro) —
        posicionamiento/tamaño/fundido de entrada viven en
        galeria.css ("#galeria-mapa-mini" /
        ".ficha__panel-cuadro { position: relative }"), no
        acá: este módulo solo pone el id y deja que el CSS
        gobierne su geometría, igual que cualquier otro
        elemento del DOM de esta página.
    */
    function crearContenedor() {

        if (contenedorMapa) return;

        contenedorMapa = document.createElement("div");
        contenedorMapa.id = "galeria-mapa-mini";

        container.appendChild(contenedorMapa);

    }


    /*
        Un frame de vuelo de cámara.

        El primer argumento es "focoContinuo", el número
        que expone carousel.update() (ver ese campo en
        galeria-carrusel.js), NO el "t" 0..1 de toda la
        fase "fichas": "focoContinuo" llega a cada entero
        EXACTAMENTE en el mismo instante en que ese
        elemento se centra en la geometría 3D — mismo
        criterio que "panelOpacity": atarse al número que
        gobierna la geometría, no recalcular una
        aproximación aparte.

        Una aproximación del estilo "t * (n - 1)" no sirve:
        "t" incluye el tramo "formar" al arranque de
        "fichas" (la geometría todavía armándose en
        círculo, ANTES de empezar a rotar entre elementos),
        y durante todo ese tramo avanzaría linealmente
        hacia el elemento 1 mientras la geometría real
        sigue con el elemento 0 centrado y quieto (phi=0
        durante todo "formar"). El mapa saldría a volar
        antes de tiempo, ya lejos del primer punto para
        cuando la ficha del primer elemento recién termina
        de asentarse. "focoContinuo" vale exactamente 0
        durante todo "formar" (ver galeria-carrusel.js) y
        solo se mueve cuando la geometría rota de verdad,
        con la MISMA meseta/transición (pasoConDescanso)
        que gobierna phi.

        "now" es el mismo timestamp de requestAnimationFrame
        que ya circula por todo tick(), para que la lectura
        de scroll (solo necesaria para la histéresis de
        reanudación, más abajo) quede cacheada dentro del
        mismo frame que el resto del motor (ver
        galeria-scroll.js).

        No hace nada mientras el mapa todavía está
        cargando/no listo (la fase "fichas" puede
        alcanzarse antes de que termine de cargar si el
        visitante scrollea muy rápido por "orden" — se
        pierde silenciosamente esos frames intermedios, sin
        cola de reintentos: en cuanto "listo" pasa a true,
        el siguiente frame ya reengancha solo, porque
        "targetFloatIndex" se recalcula de cero cada vez a
        partir de "focoContinuo", no de un delta acumulado).
    */
    function update(focoContinuo, now) {

        if (!listo) return;

        targetFloatIndex = focoContinuo;

        if (userInteracting) {

            const delta =
                Math.abs(
                    getScrollY(now) -
                        scrollYAlEmpezarInteraccion
                );

            if (delta > cfg.umbralReanudarPx) {

                userInteracting = false;
                legOriginDirty = true;

            }

        }

        if (userInteracting) return;

        const coordsEnOrden =
            getOrder()
                .map(id => elementos[id].coordenadas)
                .filter(Boolean);

        if (coordsEnOrden.length === 0) return;

        const ideal =
            computeCameraState(
                targetFloatIndex, coordsEnOrden
            );

        const actual = map.getCenter();
        const zoomActual = map.getZoom();

        const lng =
            actual.lng +
            (ideal.lng - actual.lng) * cfg.suavizadoCamara;
        const lat =
            actual.lat +
            (ideal.lat - actual.lat) * cfg.suavizadoCamara;
        const zoom =
            zoomActual +
            (ideal.zoom - zoomActual) * cfg.suavizadoCamara;

        map.jumpTo({ center: [lng, lat], zoom });

    }


    /*
        Último tamaño conocido del contenedor del mapa —
        usado por mostrar() para no llamar a map.resize()
        de más (ver ahí).
    */
    let anchoMapaAnterior = 0;
    let altoMapaAnterior = 0;

    /*
        Llamarla en cada frame en que el cuadrado pasa a
        ser visible (fase "fichas") — no-op mientras el
        mapa no esté listo.

        map.resize() SOLO se llama cuando el tamaño real
        del contenedor CAMBIÓ (redimensión de ventana /
        cambio de layout), comparando contra el último
        tamaño conocido, y nunca mientras el visitante está
        interactuando a mano ("userInteracting", mismo
        criterio que usa update() para no pisarle la cámara
        mientras arrastra/hace zoom).

        El motivo es un efecto colateral de resize():
        MapLibre resetea el estado interno de sus handlers
        de interacción (dragPan incluido) cada vez que
        recibe uno, justamente para no seguir arrastrando
        matemática de posición atada a un tamaño de
        contenedor que ya cambió. Llamarlo sin condición en
        todos los frames de "fichas" (~60 veces por
        segundo) corta cualquier arrastre en curso un frame
        después de empezar, antes de que el primer
        pointermove llegue a mover algo: el cursor cambia a
        "grabbing" pero el mapa no se mueve. El trabajo que
        hace resize() puertas adentro sí es barato; el
        reseteo de handlers no.
    */
    function mostrar() {

        if (!listo) return;
        if (userInteracting) return;

        const rect =
            contenedorMapa.getBoundingClientRect();

        if (
            rect.width === anchoMapaAnterior &&
            rect.height === altoMapaAnterior
        ) return;

        anchoMapaAnterior = rect.width;
        altoMapaAnterior = rect.height;

        map.resize();

    }


    /*
        Se llama en cada frame de cualquier fase que NO sea
        "fichas" (mismo lugar donde ya se llama
        carousel.reset()/interaccionFicha.reset() en
        galeria.js) — limpia el estado de interacción
        manual y hace que, al volver a "fichas", el próximo
        tramo capture su "legOrigin" desde la posición real
        de la cámara, en vez de arrastrar el estado de un
        visitante que ya se fue de la fase.
        No-op si el mapa todavía no cargó.
    */
    function reset() {

        userInteracting = false;
        legOriginDirty = true;

    }


    /*
        Cambia el basemap (MapStyle.json / MapStyleDark.json,
        ver "cfg.styleUrl"/"cfg.styleUrlOscuro" en
        galeria-config.js) cuando el visitante alterna el
        tema del sitio desde el navbar — llamada por
        galeria.js desde el MISMO MutationObserver que ya
        dispara actualizarColoresTema() para la escena 3D
        (ver galeria.js, "observadorTema").

        El JSON del estilo se baja ACÁ (fetch propio) y se
        le inyectan la fuente "edificios" y la capa
        "edificios-pines" ANTES de pasárselo a setStyle(),
        ya como objeto, no como URL. Con un objeto,
        MapLibre puede "diffear" el estilo actual contra el
        nuevo de forma SINCRÓNICA (setState(), sin red de
        por medio): no hay ningún tick intermedio en el que
        algo pueda colarse. Como la fuente/capa vienen
        incluidas en el JSON, el diff no genera ninguna
        operación de "quitar" para ellas. La imagen
        "pin-marker" (registrada en runtime con addImage(),
        no vive en el JSON del estilo) tampoco se pierde:
        mientras el diff tenga éxito es el MISMO objeto
        Style, así que su ImageManager no se recrea.

        POR QUÉ NO "map.setStyle(url)" a secas: pasarle una
        URL dispara un fetch async por dentro, y hay una
        ventana de tiempo — documentada como bug abierto en
        el propio repo de MapLibre/Mapbox, "setStyle(URL)
        is a race condition" — donde el swap real del
        estilo puede aplicarse DESPUÉS de que un
        addSource()/addLayer() propio ya corrió, así que el
        swap se los lleva puestos y los pines desaparecen.
        Ningún evento sirve para esperarlo: "style.load" no
        dispara siempre en esta versión, y un sondeo de
        "styledata"/isStyleLoaded() cae en la misma ventana
        (el primer chequeo síncrono puede dar "true" contra
        el estilo VIEJO, todavía no reemplazado).

        Único borde suelto: si el diff llegara a fallar (el
        propio motor de MapLibre puede lanzar una excepción
        interna si dos estilos difieren demasiado como para
        expresarlo en operaciones soportadas) MapLibre cae
        solo a una reconstrucción completa desde ese mismo
        JSON — ahí SÍ se pierde el ImageManager, pero la
        capa "edificios-pines" (que ya viene en el JSON)
        pide "pin-marker" al pintarse, dispara
        "styleimagemissing", y el listener registrado en
        cargar() la repone sola (ver ese handler más arriba).
        Cubierto en cualquiera de los dos caminos.

        No-op mientras el mapa no esté listo (si el
        visitante cambia de tema antes de llegar a la fase
        "orden", no hay nada que recolorear todavía —
        cargar() ya lee el tema vigente por su cuenta cuando
        por fin arranca) y también si el tema "nuevo"
        resuelve al MISMO archivo de estilo que el actual
        (p.ej. si no hay "styleUrlOscuro" configurado).
    */
    async function actualizarTema() {

        if (!map || !listo) return;

        const nuevoTema =
            document.documentElement
                .getAttribute("data-tema") === "oscuro"
                ? "oscuro" : "claro";

        if (nuevoTema === temaActual) return;

        const nuevoEstiloUrl = estiloSegunTema(cfg);

        temaActual = nuevoTema;

        try {

            const respuesta =
                await fetch(
                    nuevoEstiloUrl + "?v=" + Date.now()
                );

            if (!respuesta.ok) {

                throw new Error(
                    "HTTP " + respuesta.status
                );

            }

            const styleJson = await respuesta.json();

            styleJson.sources =
                Object.assign(
                    {}, styleJson.sources,
                    {
                        edificios: {
                            type: "geojson",
                            data: construirGeoJSON()
                        }
                    }
                );

            /*
                Por si el JSON bajado no trajera "layers"
                (no debería pasar con un estilo válido) y,
                sobre todo, por si por algún motivo YA
                trajera una capa con este mismo id: se
                descarta esa duplicada antes de agregar la
                nuestra, así "pinLayerSpec()" es siempre la
                única fuente de verdad para su definición.
            */
            styleJson.layers =
                (styleJson.layers || []).filter(
                    layer => layer.id !== "edificios-pines"
                );

            styleJson.layers.push(pinLayerSpec());

            map.setStyle(styleJson);

        } catch (err) {

            console.error(
                "galeria-mapa.js: no se pudo cambiar " +
                "el estilo del mapa según el tema:", err
            );

        }

    }


    return {
        cargar,
        update,
        mostrar,
        reset,
        actualizarTema
    };

}
