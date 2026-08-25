/* ==================================================
   galeria-panel-fotos.js

   Miniaturas de la sección "Fotografías" del panel
   derecho (ver "#ficha-fotos-miniaturas" en
   galeria.html) — reemplaza al carrusel de flechas +
   contador que había antes ("◀ / Foto N / ▶", pedido
   explícito): ahora se ven TODAS las fotos del
   elemento enfocado como una fila de miniaturas.
   Mismo criterio que galeria-panel-parametros.js: arma
   su contenido en runtime a partir de datos del
   elemento, el HTML arranca vacío, así que sumar/
   quitar fotos de un elemento en el GeoJSON no
   requiere tocar este archivo.

   FUENTE DE DATOS: elemento.fotos (ver
   normalizarElemento() en galeria-config.js), que a su
   vez sale de properties.medios.fotografias en el
   GeoJSON — cada entrada trae {url, alt}. Este módulo
   no conoce el GeoJSON ni "elemento" más allá de ese
   array ya armado — mismo desacople que ya usa
   galeria-panel-parametros.js con PARAMETROS_DEFECTO.

   PLACEHOLDERS (pedido explícito, TEMPORAL): las URLs
   reales de "elemento.fotos" hoy apuntan a archivos
   que todavía no existen en el repo (assets/img/<slug>/
   ..., ver "_notas_de_uso" del GeoJSON) — así que cada
   <img> intenta cargar la URL real PRIMERO, y solo si
   falla (evento "error", el 404 del navegador) cae a
   una foto de stock de FOTOS_RESPALDO más abajo.

   Esto es a propósito "self-healing" en vez de un flag
   manual de "ya hay fotos reales, dejen de usar el
   placeholder": el día que se suban los assets
   verdaderos a assets/img/<slug>/, las miniaturas van a
   mostrarlos solas en el próximo load, sin tocar este
   archivo ni ningún otro — el propio 404 (o su
   ausencia) decide, no una condición que alguien tenga
   que acordarse de apagar.

   Si el elemento no tiene NINGUNA entrada en
   elemento.fotos (array vacío, p. ej. un GeoJSON viejo
   sin "medios.fotografias" todavía): se arma igual un
   set completo de FOTOS_RESPALDO — mismo criterio de
   "más vale mostrar algo" que ya usa calcularRango() en
   galeria-panel-parametros.js para generadores sin
   PARAMETROS_RANGO propio.
================================================== */


/*
    Pool de fotos de stock — relleno GENÉRICO, no son
    "las fotos de tal edificio": se reparten cíclicamente
    (ver "% FOTOS_RESPALDO.length" en mostrar() más
    abajo) tanto para completar un elemento sin fotos
    como para reemplazar, una por una, cualquier URL real
    que 404ee.

    Mezcla dos fuentes A PROPÓSITO:

      - Las primeras 6 son las mismas URLs de Unsplash
        del mockup de referencia (ya confirmadas
        funcionando).

      - El resto son picsum.photos con proporciones
        ORIGINALES bien distintas entre sí (cuadrada,
        panorámica 1200x400, vertical 500x900...) —
        Picsum sirve la imagen tal cual el tamaño pedido
        en la URL, así que estas SÍ fuerzan casos de
        recorte distintos al hacer object-fit:cover
        contra el aspect-ratio fijo de ".ficha__foto-
        miniatura" (ver la nota sobre el CSS pendiente en
        la cabecera del archivo) — la idea es poder
        probar con la vista real cómo se comporta el
        recorte cuando la fuente no viene ya en 16:10
        como las de Unsplash.
*/
const FOTOS_RESPALDO = [
    {
        url: "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=800&q=80",
        alt: "Fotografía de referencia 1 (placeholder)"
    },
    {
        url: "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=800&q=80",
        alt: "Fotografía de referencia 2 (placeholder)"
    },
    {
        url: "https://images.unsplash.com/photo-1487958449943-2429e8be8625?auto=format&fit=crop&w=800&q=80",
        alt: "Fotografía de referencia 3 (placeholder)"
    },
    {
        url: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=80",
        alt: "Fotografía de referencia 4 (placeholder)"
    },
    {
        url: "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=800&q=80",
        alt: "Fotografía de referencia 5 (placeholder)"
    },
    {
        url: "https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=800&q=80",
        alt: "Fotografía de referencia 6 (placeholder)"
    },
    {
        url: "https://picsum.photos/id/1015/900/900",
        alt: "Fotografía de referencia 7 (placeholder, fuente cuadrada)"
    },
    {
        url: "https://picsum.photos/id/1041/1200/400",
        alt: "Fotografía de referencia 8 (placeholder, fuente panorámica)"
    },
    {
        url: "https://picsum.photos/id/1016/500/900",
        alt: "Fotografía de referencia 9 (placeholder, fuente vertical)"
    },
    {
        url: "https://picsum.photos/id/1039/1000/650",
        alt: "Fotografía de referencia 10 (placeholder, fuente horizontal)"
    },
    {
        url: "https://picsum.photos/id/1043/700/700",
        alt: "Fotografía de referencia 11 (placeholder, fuente cuadrada)"
    },
    {
        url: "https://picsum.photos/id/1048/1400/450",
        alt: "Fotografía de referencia 12 (placeholder, fuente panorámica)"
    }
];


export function createFotosPanel(contenedor) {

    /*
        Sin el contenedor (HTML desactualizado, o esta
        página todavía no lo tiene) el resto de
        galeria.js puede seguir llamando mostrar()/
        limpiar()/reset() sin chequear null cada vez —
        mismo criterio que el resto de los guards de
        esta página (ver galeria-panel-parametros.js,
        galeria-corte-controles.js...).
    */
    if (!contenedor) {

        return {
            mostrar() {},
            limpiar() {},
            reset() {}
        };

    }


    let miniaturas = [];


    function limpiar() {

        contenedor.innerHTML = "";
        miniaturas = [];

    }


    /*
        "Activa" es puramente visual por ahora (qué
        miniatura queda resaltada al hacer click) — este
        módulo no conoce Three.js ni el slider de
        "Opacidad" de al lado (ese slider TODAVÍA no
        tiene lógica propia, ver galeria.html), así que
        clickear una miniatura no mueve nada más
        todavía. El día que "Opacidad" pase a controlar
        una foto superpuesta sobre el modelo 3D, este es
        el lugar natural para avisar con un "onCambio"
        inyectado (mismo patrón que "onCambio" en
        galeria-panel-derecho-secciones.js) — no se
        agrega ese gancho todavía porque no hay nada del
        otro lado que lo consuma.
    */
    function marcarActiva(indice) {

        miniaturas.forEach((boton, i) => {

            boton.setAttribute(
                "aria-current", String(i === indice)
            );

        });

    }


    /*
        Arma UNA miniatura. "urlRespaldo" es la foto de
        FOTOS_RESPALDO que le toca a este índice (cíclico
        si hay más fotos que entradas en el pool) — se
        usa SOLO si "foto.url" (la real, del GeoJSON)
        falla al cargar.
    */
    function crearMiniatura(foto, indice, urlRespaldo) {

        const boton = document.createElement("button");
        boton.type = "button";
        boton.className = "ficha__foto-miniatura";
        boton.setAttribute("role", "listitem");
        boton.setAttribute("aria-current", "false");

        const img = document.createElement("img");
        img.loading = "lazy";
        img.alt = foto.alt || "Fotografía";
        img.src = foto.url;

        /*
            "once:true": si la URL de respaldo TAMBIÉN
            llegara a fallar (sin conexión, el CDN de
            Unsplash caído), no hay a dónde más caer —
            no vale la pena reintentar en loop contra la
            misma URL rota.
        */
        img.addEventListener(
            "error",
            () => { img.src = urlRespaldo; },
            { once: true }
        );

        boton.appendChild(img);

        boton.addEventListener(
            "click", () => marcarActiva(indice)
        );

        return boton;

    }


    /*
        Reconstruye las miniaturas para el elemento
        recién enfocado. "fotos" es elemento.fotos (ver
        normalizarElemento() en galeria-config.js) — si
        viene vacío/undefined, se completa igual con
        FOTOS_RESPALDO entero (ver cabecera del archivo).
    */
    function mostrar(fotos) {

        limpiar();

        const lista =
            fotos && fotos.length
                ? fotos
                : FOTOS_RESPALDO;

        lista.forEach((foto, indice) => {

            const urlRespaldo =
                FOTOS_RESPALDO[
                    indice % FOTOS_RESPALDO.length
                ].url;

            const miniatura =
                crearMiniatura(
                    foto, indice, urlRespaldo
                );

            miniaturas.push(miniatura);
            contenedor.appendChild(miniatura);

        });

        if (miniaturas.length) {
            marcarActiva(0);
        }

    }


    return {

        mostrar,
        limpiar,

        /*
            Vuelve la selección visual a la primera foto
            — mismo momento en el que galeria.js resetea
            paramPanel/carousel/etc. al salir de la fase
            "fichas" (ver galeria.js). No reconstruye el
            DOM (eso ya lo hace mostrar() en el próximo
            foco): mismo motivo por el que
            galeria-panel-derecho-secciones.js separa su
            reset() (instantáneo, sin reconstruir nada)
            de su construcción inicial.
        */
        reset() {

            if (miniaturas.length) {
                marcarActiva(0);
            }

        }

    };

}
