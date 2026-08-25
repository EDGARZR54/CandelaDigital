/* ==================================================
   galeria-config.js

   ÚNICO archivo con conocimiento del dominio
   ("edificios"/cascarones de concreto). El resto de
   los módulos (escena, fases, revelado, reordenar,
   carrusel) no saben nada de GeoJSON ni de
   arquitectura: solo trabajan con la forma genérica
   que devuelve normalizarElemento() más abajo.

   Para reutilizar esta galeria con otro GeoJSON (otra
   colección, otro dominio), en principio alcanza con
   reescribir "dataUrl" y "normalizarElemento" —el
   resto del motor no debería necesitar tocarse.
================================================== */


/*
    Color por estado de conservación (vocabulario
    cerrado, ver "_notas_de_uso" del GeoJSON: 'bueno'
    | 'regular' | 'riesgo' | 'perdido'). Si en algún
    momento aparece una categoría fuera de ese
    vocabulario, se usa FALLBACK_COLOR.

    Estos colores son de los EDIFICIOS (por estado de
    conservación) y NO cambian con el tema claro/oscuro
    del sitio — a diferencia del fondo/niebla/mesa de
    la escena, que sí lo hacen (ver colorFondoEscena()
    y colorMesaEscena() en galeria-escena.js).
*/

const ESTADO_COLOR = {
    bueno:   { r: 108, g: 191, b: 135 },
    regular: { r: 232, g: 184, b: 74 },
    riesgo:  { r: 227, g: 129, b: 73 },
    perdido: { r: 196, g: 76, b: 76 }
};

const ESTADO_RANGO = {
    bueno: 0,
    regular: 1,
    riesgo: 2,
    perdido: 3
};

const FALLBACK_COLOR = { r: 150, g: 150, b: 150 };


/*
    Generador procedural de respaldo: se usa para
    cualquier edificio cuyo medios.modelo_3d.procedural
    venga vacío en el GeoJSON (todavía no tiene un
    módulo dedicado en js/three/geometrias/). Debe
    coincidir con el nombre de archivo real en esa
    carpeta (ver también GENERADOR_RESPALDO en
    galeria-escena.js).
*/

const GENERADOR_RESPALDO = "cono-sinusoidal";


function normalizarTexto(texto) {

    return String(texto || "")
        .trim()
        .toLowerCase();

}


function colorPorEstado(categoria) {

    return (
        ESTADO_COLOR[normalizarTexto(categoria)] ||
        FALLBACK_COLOR
    );

}


function rangoPorEstado(categoria) {

    const rango =
        ESTADO_RANGO[normalizarTexto(categoria)];

    return rango === undefined ? 99 : rango;

}


/*
    "1957-1958" -> 1957. "Noc" o vacío -> null.
    Si properties.identificacion.año_incierto es
    true, también se trata como desconocido para
    fines de orden.
*/

function parsearAnio(texto, incierto) {

    if (incierto) return null;

    const match =
        String(texto || "").match(/\d{4}/);

    return match ? parseInt(match[0], 10) : null;

}


function textoAnio(texto, incierto) {

    if (!texto) return "Año no confirmado";

    return incierto
        ? texto + " (no confirmado)"
        : texto;

}


function textoAutores(autores) {

    if (!autores || autores.length === 0) {

        return "Autoría no registrada";

    }

    return autores
        .map(a => a.nombre)
        .filter(Boolean)
        .join(", ");

}


/*
    GeoJSON guarda las coordenadas como [longitud,
    latitud] (¡al revés del orden "lat, lon" con el que
    la gente normalmente las lee/copia a un buscador!) —
    por eso esta función existe: además de formatear,
    hace explícito ese reordenamiento en un solo lugar,
    en vez de que quien arme "panelDerecho" tenga que
    acordarse del orden invertido cada vez.
*/

function textoCoordenadas(geometry) {

    const esPunto =
        geometry &&
        geometry.type === "Point" &&
        Array.isArray(geometry.coordinates) &&
        geometry.coordinates.length === 2;

    if (!esPunto) return "Coordenadas no registradas";

    const [longitud, latitud] = geometry.coordinates;

    return latitud.toFixed(5) + ", " + longitud.toFixed(5);

}


/*
    "la-muela" -> "la-muela" (ya es válido, se usa
    tal cual como nombre de módulo). Vacío/null/
    "" -> GENERADOR_RESPALDO.

    No se intenta derivar el generador a partir del
    "id"/slug del Feature: son dos cosas distintas
    (el slug identifica carpetas de assets —fotos,
    nube de puntos—, el generador identifica un
    archivo .js con una fórmula). Mantenerlos
    separados evita romper si el slug tiene mayúsculas
    o acentos que el nombre de archivo no tiene, como
    pasa hoy con "Concha-acustica".
*/

function generadorProcedural(medios) {

    const valor =
        medios &&
        medios.modelo_3d &&
        medios.modelo_3d.procedural;

    return valor || GENERADOR_RESPALDO;

}


/*
    Adaptador: recibe un Feature del GeoJSON y
    devuelve la forma genérica que consume el motor
    (escena, fases, revelado, reordenar, carrusel).

    "indice" es la posición dentro del array
    (0..n-1): es lo que usa el motor internamente
    como identificador. "slug" es el id real del
    GeoJSON (por ejemplo "los-manantiales"), se
    conserva por si en el futuro se quiere enlazar a
    la ficha de cada edificio.
*/

function normalizarElemento(feature, indice) {

    const props = feature.properties || {};

    const identificacion =
        props.identificacion || {};

    const ubicacion =
        props.ubicacion || {};

    const geometria =
        props.geometria || {};

    const estadoActual =
        props.estado_actual || {};

    const medios =
        props.medios || {};


    const anioTexto =
        textoAnio(
            identificacion.año_construccion,
            identificacion.año_incierto
        );

    const anioNumerico =
        parsearAnio(
            identificacion.año_construccion,
            identificacion.año_incierto
        );


    return {

        indice,
        slug: feature.id || String(indice),

        /*
            [longitud, latitud] crudo del Feature, tal
            cual lo entrega el GeoJSON — a diferencia de
            "textoCoordenadas" (más abajo, dentro de
            "panelDerecho"), que ya lo formatea como
            texto para mostrar. Este par crudo no se
            muestra en ningún lado: es para que
            galeria-mapa.js pueda posicionar el mapa
            sobre CADA elemento sin tener que volver a
            leer/parsear el GeoJSON por su cuenta —
            mismo criterio que el resto del motor (acá es
            el único lugar que sabe leer "feature.geometry",
            el mapa solo consume el número ya extraído).
            null si el Feature no es un Point válido
            (mismo chequeo que ya hace textoCoordenadas).
        */
        coordenadas:
            feature.geometry &&
            feature.geometry.type === "Point" &&
            Array.isArray(feature.geometry.coordinates) &&
            feature.geometry.coordinates.length === 2
                ? feature.geometry.coordinates
                : null,

        nombre:
            identificacion.nombre ||
            identificacion.nombre_alternativo ||
            "Sin nombre",

        subtitulo:
            [identificacion.tipologia, anioTexto]
                .filter(Boolean)
                .join(" · "),

        color:
            colorPorEstado(
                estadoActual.categoria
            ),

        /*
            Qué módulo de js/three/geometrias/ usar
            para construir la geometría 3D de este
            elemento (ver construirElemento3D en
            galeria-escena.js). No es un campo de
            texto para mostrar, por eso vive fuera
            de "ficha" — es hermano de "color".
        */
        generadorId:
            generadorProcedural(medios),


        /*
            Fotos del elemento (properties.medios.fotografias
            en el GeoJSON — ver "_notas_de_uso" del archivo).
            Consumidas por galeria-panel-fotos.js (sección
            "Fotografías" del panel derecho). Se filtra
            cualquier entrada sin "url" (defensivo: un
            GeoJSON a mano puede traer un objeto vacío o a
            medio llenar) y "alt" cae al nombre del elemento
            si la entrada no trae su propio texto alternativo.

            Las URLs de hoy son placeholders (apuntan a
            assets/img/<slug>/... que todavía no existen en
            el repo) — eso NO se resuelve acá: este adaptador
            solo traduce el GeoJSON tal cual, sea cual sea su
            contenido; el fallback a fotos de stock cuando una
            URL real 404ea vive en galeria-panel-fotos.js, no
            acá (mismo criterio de separación que ya usa el
            resto de normalizarElemento: este archivo no sabe
            de rutas de assets ni de qué pasa si una falla,
            solo de la forma de los datos).
        */
        fotos:
            (medios.fotografias || [])
                .filter(foto => foto && foto.url)
                .map(foto => ({
                    url: foto.url,
                    alt:
                        foto.alt ||
                        identificacion.nombre ||
                        "Fotografía"
                })),


        /*
            Campos que se muestran en la ficha de
            la fase C (scroll horizontal). Para
            agregar/quitar/reordenar campos, alcanza
            con editar este array.

            El año NO va acá: ya se muestra en
            "subtitulo" (ver arriba, "tipología ·
            año"), justo debajo del nombre — repetirlo
            acá era redundante. La ubicación TAMPOCO
            va acá: se mudó, desglosada, al panel
            derecho (ver "panelDerecho" más abajo) —
            acá quedan solo datos técnicos de la
            geometría.
        */
        ficha: [
            {
                label: "Autor(es)",
                value: textoAutores(
                    identificacion.autores
                )
            },
            {
                label: "Espesor",
                value:
                    geometria.espesor_cascaron_cm != null
                        ? geometria.espesor_cascaron_cm + " cm"
                        : "—"
            },
            {
                label: "Claro máximo",
                value:
                    geometria.claro_maximo_m != null
                        ? geometria.claro_maximo_m + " m"
                        : "—"
            },
            {
                label: "Tipología estructural",
                value:
                    geometria.tipologia_estructural ||
                    "—"
            },
            {
                label: "Superficie",
                value:
                    geometria.superficie_m2
                        ? geometria.superficie_m2 + " m²"
                        : "—"
            },
            {
                label: "Altura",
                value:
                    geometria.altura_m
                        ? geometria.altura_m + " m"
                        : "—"
            },
            {
                label: "Conservación",
                value: estadoActual.categoria || "—"
            }
        ],


        /*
            Contenido del panel derecho de la ficha (ver
            "#ficha-panel-marco" en galeria.css /
            "#panel-derecho-specs" en galeria.html):
            coordenadas + dirección. MISMA forma
            {label, value} que "ficha" (mismo estilo
            visual, ver ".spec"/".label"/".value"
            compartidas en galeria.css) — a propósito no
            se reusa "ficha" para esto: son dos columnas
            de texto separadas en pantalla, con su propio
            layout.

            Estado/Municipio/Código postal se sacaron de
            acá (queda solo coordenadas + dirección,
            pedido explícito) — sus valores de origen
            (ubicacion.estado, ubicacion.municipio,
            ubicacion.CodigoPostal) siguen disponibles en
            "ubicacion" más arriba por si hace falta
            reincorporarlos más adelante; no se tocó nada
            más de normalizarElemento.

            "referencia" (ubicacion.referencia en el
            GeoJSON) sigue afuera a propósito — es una
            nota de acceso ("cómo llegar"), no un dato de
            ubicación en sí.
        */
        panelDerecho: [
            {
                label: "Coordenadas",
                value: textoCoordenadas(feature.geometry)
            },
            {
                label: "Dirección",
                value: ubicacion.direccion || "—"
            }
        ],


        /*
            Valores usados solo para ordenar (fase
            B). No se muestran directamente.
        */
        orden: {
            nombre: identificacion.nombre || "",
            anio: anioNumerico,
            superficie:
                geometria.superficie_m2 ?? null,
            estadoRango:
                rangoPorEstado(
                    estadoActual.categoria
                )
        }

    };

}


export const CONFIG = {

    /*
        De dónde se cargan los elementos. Ruta
        relativa a la raíz del sitio, igual que el
        resto de las rutas del proyecto.
    */
    dataUrl: "data/edificios.geojson",

    normalizarElemento,


    /*
        El texto del hero (sección A) YA NO vive acá:
        está fijo directo en galeria.html, con el mismo
        contenido y las mismas clases que el hero de
        index.html (.eyebrow, .hero__texto, .subrayado
        — ver css/pages/galeria.css). Se sacó de CONFIG
        porque es texto de PÁGINA, no de dominio (no
        depende del GeoJSON ni de "normalizarElemento"),
        y así queda seleccionable/visible sin JS, igual
        que en index.html.
    */

    /*
        Criterios de orden disponibles en el GUI de
        la fase B. "getValue" recibe un elemento
        normalizado (no el Feature crudo) y debe
        devolver el valor a comparar. "type"
        determina si se compara como texto o como
        número (los números nulos van al final).

        Sin criterio "original": no aporta nada al
        visitante (es el orden crudo del GeoJSON, sin
        significado propio) y complicaba el "por
        defecto" — ahora el criterio inicial es
        "anio" (ver el "order" inicial en
        galeria-reordenar.js y el botón activo por
        defecto en renderSortButtons() de galeria.js,
        ambos atados al primer elemento de este
        array), que es la forma más habitual de
        ordenar este tipo de datos.
    */
    sortOptions: [
        {
            key: "anio",
            label: "Cronológico",
            type: "number",
            getValue: el => el.orden.anio
        },
        {
            key: "nombre",
            label: "Alfabético",
            type: "string",
            getValue: el => el.orden.nombre
        },
        {
            key: "superficie",
            label: "Métrico",
            type: "number",
            getValue: el => el.orden.superficie
        },
        {
            key: "estado",
            label: "Condición",
            type: "number",
            getValue: el => el.orden.estadoRango
        }
    ],


    /*
        Holgura mínima entre elementos en la fila.

        YA NO es distancia centro-a-centro: es el
        espacio libre mínimo que debe quedar entre el
        borde derecho del bounding box de un elemento
        y el borde izquierdo del bounding box del
        siguiente (ver calculatePositions() en
        galeria-escena.js) — el resto de la separación
        real entre dos elementos depende de cuán
        "anchas" sean sus geometrías procedurales, no
        de este valor.

        La posición inicial visible y el orden de
        revelado se calculan solos según cuántos
        elementos haya (ver galeria-revelado.js). Se
        sigue usando también como referencia de escala
        para el arco de reordenamiento (ver
        galeria-reordenar.js) — ahí sigue funcionando
        igual que antes, sólo como magnitud de
        referencia, sin depender de que sea una
        distancia centro-a-centro.
    */
    row: {
        spacing: 2.2
    },


    /*
        Piso/mesa: YA NO es una superficie visible (era
        un disco de color fijo, ver historial más abajo)
        sino un plano INVISIBLE que solo existe para
        recibir sombra (THREE.ShadowMaterial — ver
        galeria-escena.js). Como es invisible, no hace
        falta que su tamaño sea generoso "a ojo": se
        calcula en vivo a partir del bounding box REAL
        de la fila (ancho en X, profundidad en Z — ver
        "loFila/hiFila"/"zsFila" en galeria-escena.js),
        no de un radio fijo — así cubre exactamente a
        todos los elementos sin importar cuántos sean ni
        qué tan ancha/profunda termine la fila, en vez
        de quedar recortado para filas más anchas que el
        radio fijo de antes (7.4) o desfasado en Z
        (el disco viejo estaba centrado en z=0, pero la
        fila NO es simétrica en Z: la cara frontal de
        cada elemento está en z=0, ver
        "desplazamientoFrente" en prepararGeometria(), y
        se extiende hacia atrás en Z negativo — un disco
        centrado en 0 dejaba buena parte de su área
        "de más" hacia +Z, del lado de la cámara, donde
        no hay nada que cubrir, y de menos hacia -Z).

        "padding": margen extra más allá del bbox real,
        para que la sombra no quede recortada justo en
        el borde del plano (mismo criterio que
        lights.key.shadowCameraPadding, más abajo).

        "shadowOpacity": qué tan oscura se ve la sombra
        proyectada (0 = invisible del todo, 1 = negro
        sólido). No es "color de mesa": ShadowMaterial
        no tiene una superficie visible propia, sólo
        tiñe de este tono la zona donde cae sombra —
        por eso ya no sigue el tema claro/oscuro del
        sitio (no hay superficie de fondo que "matchear")
        y queda fijo.

        Historial: antes era un CylinderGeometry visible
        (radius/thickness/roughness/metalness), con su
        color calculado en vivo a partir de
        --color-fondo-alt (colorMesaEscena(), ya
        eliminada de galeria-escena.js) para seguir el
        tema del sitio. Se lo reemplaza por completo (no
        sólo se ajusta el tamaño) porque además de
        quedar mal dimensionado, no se quería una
        superficie visible bajo los elementos.
    */
    table: {
        padding: 1.5,
        shadowOpacity: 0.35
    },


    scene: {

        /*
            El color de fondo (y el de la niebla, que
            usa el mismo tono para que los elementos
            lejanos se "pierdan" contra el fondo) YA
            NO se fija acá: se calculan en vivo a
            partir de la variable CSS --color-fondo
            (ver colorFondoEscena() en
            galeria-escena.js) — así el <canvas> de
            Three.js sigue el mismo tema claro/oscuro
            que el resto del sitio, y se recalcula
            solo mediante un MutationObserver si el
            visitante cambia el tema sin recargar
            (ver galeria.js).
        */
        /*
            "nearFactor"/"farFactor": igual que
            camera.position o shadowCameraBounds (ver
            comentarios más abajo), near/far fijos
            (12/26) estaban calibrados para cuando la
            cámara quedaba cerca de la fila. Con el
            bounding box real, la distancia
            cámara→elemento más lejano creció a ≈29.4 —
            más allá de "far: 26" — así que el extremo
            de la fila quedaba directamente devorado
            por la niebla.

            Se reemplaza por dos factores relativos a
            "distMax" (la distancia real de la cámara
            al punto más lejano del bounding box de la
            fila, calculada en galeria-escena.js):
            fog.near = nearFactor * distMax, fog.far =
            farFactor * distMax. Los valores 0.879/1.905
            replican la MISMA proporción que tenía el
            ajuste original a mano (near=12, far=26,
            sobre una distMax original de ≈13.65).
        */
        fog: {
            nearFactor: 0.879,
            farFactor: 1.905
        }
    },


    /*
        Cámara de "alineación" (lineup shot): fija,
        pegada al primer elemento, sin
        OrbitControls. El punto de mira en X se
        calcula solo (ver findCenteredLookAtX en
        galeria-utils.js) para que la fila quede
        centrada sin importar cuántos elementos haya
        — acá solo se configuran la posición y la
        altura/profundidad del punto de mira.

        "position.x" YA NO es la posición real que usa
        la escena: es sólo un valor de respaldo para el
        caso límite de una fila vacía (0 elementos). La
        posición X real de la cámara se calcula en
        galeria-escena.js (verticesMundoDeFila +
        cameraXDesdeAnchoFila) a partir del bounding box
        REAL de la fila — necesario porque los
        parámetros de las fórmulas procedurales todavía
        son placeholders (ver encuadre-camara.md) y
        pueden dar bounding boxes bastante más anchos o
        angostos de una tanda de valores a otra. Un
        "position.x" fijo (como éste, calibrado a mano
        para el cono simple original) queda desactualizado
        apenas cambia la escala de las geometrías, y en
        el peor caso deja a la cámara PARADA ADENTRO de
        la fila en vez de más allá de su extremo —
        rompiendo por completo el "lineup shot" (fue
        justo el bug reportado y confirmado con
        diagnóstico en vivo: fila real de ancho ≈24.66,
        cámara fija en x=-8, bien adentro del rango
        [-12.33, 12.33]).

        "margenRasante" y "anguloVistaGrados"
        reemplazan juntos a lo que hubiera sido un
        "margenEscorzo" de un solo componente (sólo en
        X): la posición real de la cámara (calculada en
        galeria-escena.js, ver cameraXZDesdeAnchoFila)
        se arma como un desplazamiento POLAR desde el
        extremo izquierdo de la fila —
            dx = margenRasante * anchoFila * cos(ángulo)
            dz = margenRasante * anchoFila * sin(ángulo)
        — así, al cambiar el ancho de la fila (los
        parámetros de las fórmulas son placeholders,
        van a seguir cambiando), el ÁNGULO de vista se
        mantiene, en vez de aplanarse. Aplanarse fue
        justo el bug reportado en la segunda ronda:
        escalar sólo el margen en X (y dejar
        position.z fijo, como esta cámara tenía
        calibrado a mano) reduce el ángulo cuanto más
        ancha es la fila — con fila ancha, casi
        cualquier z fijo queda demasiado rasante y los
        elementos se ocluyen por completo entre sí.

        "anguloVistaGrados": 70 (medido desde el eje X
        de la fila; 0° = rasante total/perfil por el
        pasillo, 90° = vista de perfil pura — fuera de
        alcance, el .md pide explícitamente que NO sea
        una vista de perfil).

        Historial: el diseño original (camera.position =
        (-8, 0.5, 2), extremo en -5.5) equivalía a
        ≈38.7°; se subió a 55° porque a ese ángulo la
        fila real (más elementos, más ancha) seguía
        ocluyéndose por completo. Con 55° confirmado en
        vivo, la oclusión bajó pero seguía siendo alta:
        a ese ángulo la línea de vista todavía es más
        parecida al "pasillo" (0°) que al perfil (90°),
        así que muchas geometrías seguían tapándose entre
        sí y no se llegaba a ver la cara LARGA del
        bounding box de la fila (el lado con el ancho
        total, no el frente de cada elemento) — se sube a
        70° para correr la vista bastante más hacia el
        perfil, sin llegar a él. Sigue siendo un valor de
        partida para ajustar a ojo (rango razonable para
        seguir moviéndolo: 65°-80°), no un cálculo
        derivado de nada.

        "margenRasante": 0.291 replicaría la MAGNITUD
        diagonal EXACTA del margen original (√(2.5² +
        2²) ≈ 3.20, sobre un ancho total de 11 ≈ 29.1%)
        — con el ángulo ya fijado por
        anguloVistaGrados, esto controla qué tan LEJOS
        queda la cámara del extremo de la fila (más
        magnitud = plano más general/alejado, todo se
        ve más chico; menos = cámara más cerca, todo se
        ve más grande, a costa de que el extremo lejano
        de la fila se achique todavía MÁS en relación
        al cercano — la razón distFar/distNear NO
        depende del ancho de la fila, sólo de este
        factor y del ángulo).

        Se deja en 0.19 (no en el 0.291 "fiel al
        original") porque, con el ancho real de la fila
        (~24.66), el valor fiel dejaba todo el conjunto
        muy chico en pantalla — bajarlo agranda sobre
        todo la mitad cercana a la cámara, que es la
        que más peso visual tiene en el encuadre. Es el
        primer número para seguir ajustando a ojo si
        hace falta más o menos tamaño.
    */
    camera: {
        fov: 56,
        near: 0.1,
        far: 100,
        position: { x: -8.0, y: 0.5, z: 2.0 },
        margenRasante: 0.19,
        anguloVistaGrados: 70,
        /*
            "lookAtY" YA NO es el valor real que usa la
            escena (mismo patrón que position.x/z, ver
            arriba): es sólo el respaldo para el caso
            límite de fila vacía. El valor real se
            calcula en galeria-escena.js como el centro
            vertical (Y) real del bounding box de TODA
            la fila — 0.65 estaba calibrado para el
            ConeGeometry simple original (bajito) y
            quedaba muy por debajo del centro real de
            estas geometrías paramétricas (bastante más
            altas): la cámara apuntaba casi al piso, así
            que la mayor parte de cada elemento quedaba
            por ENCIMA del borde superior de pantalla —
            cortada, invisible — y sólo se veía una
            franja angosta cerca del centro/abajo del
            cuadro. Confirmado con datos reales: con
            0.65 fijo, el NDC Y de la fila daba
            [-0.01, 2.71] (pantalla visible es [-1, 1]);
            con el centro real (~2.75 para esta fila)
            pasa a [-0.67, 1.36] — mucho más aprovechado,
            aunque el tope siga levemente recortado (ver
            "cameraX y cameraZ" en galeria-escena.js
            para el próximo ajuste fino si hace falta).
        */
        lookAtY: 0.65,
        lookAtZ: 0
    },


    lights: {

        ambient: {
            color: 0xffffff,
            intensity: 0.55
        },

        key: {
            color: 0xffffff,
            intensity: 1.0,
            position: { x: -6, y: 9, z: 3 },
            shadowMapSize: 1024,
            /*
                Igual que camera.position.x (ver
                comentario más arriba): valor de
                respaldo para el caso límite de fila
                vacía. El frustum real de la sombra se
                calcula en galeria-escena.js como
                semiancho real de la fila +
                shadowCameraPadding, para que la sombra
                no quede recortada si la fila resulta
                más ancha de lo que este número fijo
                asumía (9, calibrado para un semiancho
                de ≈5.5 — padding implícito de 3.5).
            */
            shadowCameraBounds: 9,
            shadowCameraPadding: 3.5,
            shadowBias: -0.0015
        },

        fill: {
            color: 0x88aaff,
            intensity: 0.25,
            position: { x: 6, y: 4, z: -4 }
        }

    },


    material: {
        roughness: 0.35,
        metalness: 0.08,
        clearcoat: 0.55,
        clearcoatRoughness: 0.25
    },


    /*
        Fase "hero": fundido del texto principal +
        indicador de scroll. Ya NO comparte tiempo con
        la cascada de conos (antes, "heroFadeOutAt" y
        "scrollHintFadeAt" eran fracciones del mismo
        progreso que también movía los conos — ver
        galeria-revelado.js). Ahora son fracciones del
        progreso PROPIO de esta fase, que solo dura lo
        que dura el fundido del hero.

        "hiddenDrop" YA NO es el valor real (mismo
        patrón que camera.position.x/z o lookAtY más
        arriba): es solo el respaldo para el caso
        límite de fila vacía. El valor real se calcula
        en galeria-escena.js (findHiddenDrop(), ver
        galeria-utils.js) a partir del encuadre real de
        la cámara —FOV, distancia, aspecto de
        ventana—, así que se ajusta solo en cualquier
        dispositivo en vez de depender de un número
        fijo calibrado a mano para escritorio (ver el
        comentario grande junto a su cálculo).
    */
    reveal: {
        hiddenDrop: 7,
        span: 0.42,
        settleBounce: 0.06,
        heroFadeOutAt: 0.22,
        scrollHintFadeAt: 0.03,

        /*
            Margen de seguridad multiplicativo sobre el
            hiddenDrop calculado (ver getHiddenDrop() en
            galeria-escena.js). El cálculo "exacto" por
            bisección (findHiddenDrop) da el mínimo drop
            necesario para el "order" vigente, pero es
            aproximado: cada elemento tiene su propia
            geometría, y no es 100% preciso para
            cualquier combinación de elemento+slot tras
            reordenar. En vez de perseguir el cálculo
            exacto para cada caso, se aplica este factor
            parejo sobre el resultado — 1 = sin margen
            extra (el valor calculado tal cual); 1.5 =
            50% más lejos de lo que el cálculo dice que
            hace falta. Barato de ajustar si algún
            elemento puntual sigue asomando: subir este
            número.
        */
        hiddenDropFactor: 1.5,

        /*
            Factor sobre el peso de rotación de cada
            cono en plena subida (ver rotationWeights
            en galeria-revelado.js) — mismo mecanismo
            que carousel.rotationScale más abajo, pero
            en sentido inverso: acá el pico de la
            campana es breve (dura "span" de scroll, no
            un tramo largo como el foco de "fichas"), así
            que a la misma velocidad máxima compartida
            (ver rotation.segundosPorVuelta) el giro se
            sentía poco, casi no se notaba antes de que
            el cono se asentara. 1 = misma velocidad que
            las demás fases; valores mayores, más vueltas
            visibles durante la subida.
        */
        rotationScale: 2
    },


    /*
        Fase "proyecto": tramo intermedio entre el
        hero y el revelado en cascada — la fila de
        conos queda completamente quieta (todavía NO
        arrancó la cascada, eso es exclusivo de la
        fase "revelado") mientras se lee el panel de
        texto "El proyecto" + cifras (mismo contenido
        que la sección homónima de index.html).
    */
    proyecto: {
        // Fracción de la fase "proyecto" dedicada a
        // subir/bajar la opacidad del panel de texto
        // (entrada y salida), igual criterio que
        // liftEnvelope() en galeria-utils.js — el
        // resto del tiempo el panel queda a opacidad
        // plena.
        panelRamp: 0.22
    },


    /*
        Autorotación (ver galeria-rotacion.js):
        compartida por TODAS las fases donde algún
        cono gira (hero/proyecto sobre el cono hero,
        revelado sobre el que va subiendo, fichas
        sobre el destacado) — una sola velocidad para
        que el giro se sienta igual de rápido sin
        importar quién lo esté pidiendo.

        "segundosPorVuelta": cuánto tarda un cono en
        dar una vuelta completa girando a peso 1 (más
        legible en CONFIG que una velocidad angular
        cruda).

        "suavizadoMs": constante de tiempo de la
        aceleración/desaceleración — cuánto tarda la
        velocidad ACTUAL de un cono en alcanzar a la
        velocidad OBJETIVO cuando cambia el peso (p.
        ej. al arrancar a subir, al asentarse, al
        ganar o perder el foco en fichas). Más alto =
        arranca/frena más gradual; más bajo = más
        inmediato.
    */
    rotation: {
        segundosPorVuelta: 9,
        suavizadoMs: 700
    },


    /*
        Fase "orden": animación de reordenamiento por
        click en el GUI.
    */
    reorder: {
        levelSeparationFactor: 1.35,
        duration: 1100
    },


    /*
        Fase "fichas": línea -> arco -> círculo, que
        después rota sobre su propio centro para ir
        mostrando un elemento distinto en foco (ver
        galeria-carrusel.js). Ya no hay sube/baja
        ("liftAmount" queda eliminado): todo el
        movimiento vive en la curva.
    */
    carousel: {

        /*
            Fracción de "t" (0..1 de toda la fase)
            dedicada a cerrar la línea en círculo
            (theta: 0 -> 2π) antes de que arranque la
            rotación por foco. En theta=0 la fórmula
            colapsa exactamente a la fila recta —mismo
            layout con el que "orden" deja parada la
            fila—, así que no hace falta ningún blend
            aparte con un estado de reposo (a diferencia
            del viejo "intro").
        */
        formSpan: 0.15,

        /*
            Factor sobre la longitud física real de la
            fila (ancla -> extremo libre) que fija el
            radio FINAL del círculo ya cerrado. El radio
            en cualquier instante intermedio interpola
            desde la longitud física real (theta=0, sin
            aporte de este factor todavía) hacia
            longitudFisica·radioFactor (theta=2π) — así
            el primer frame de esta fase nunca salta
            respecto al último de "orden", sea cual sea
            este valor. 1 = mismo radio que daría la fila
            tal cual (círculo chico, elementos pegados);
            valores mayores agrandan el círculo por
            parejo, alejando (y angostando el foco sobre)
            los vecinos del elemento destacado — pedido:
            "grande, para que solo destaque la geometría
            que tiene su ficha". Valor de partida para
            ajustar a ojo.
        */
        radioFactor: 3.5,

        /*
            Ancho angular del "foco", en unidades de
            separación PROMEDIO entre vecinos
            (2π / elementCount) — mismo rol que la
            distancia en slots de la vieja versión
            sube/baja. 1 = foco angosto (un solo
            elemento destacado por vez); valores
            mayores reparten el énfasis entre más
            vecinos.
        */
        emphasisSpread: 1,

        scaleBump: 0.20,
        minOpacity: 0.10,

        /*
            SEAM ANIMADO (ver galeria-carrusel.js): corre
            el parámetro de la curva (sFrac) esta fracción
            fija hacia el extremo libre, para TODOS los
            elementos por igual — en la práctica, rota el
            círculo entero un ángulo extra una vez cerrado.
            Se anima con el mismo "blend" que ya gobierna
            posición/escala/opacidad de esta fase (0 en
            theta=0, valor completo con el círculo ya
            cerrado), así que es seguro subirlo sin
            provocar saltos.

            OJO con la magnitud: "sFrac" recorre la
            circunferencia COMPLETA (2π), así que este
            valor es una fracción de 360°, no un ajuste de
            un par de grados — 0.1 ya son 36°. Con pocos
            elementos (separación angular = 2π/elementCount)
            un valor alto puede correr el foco hacia el
            vecino antes de lo esperado, porque "diff" (la
            detección de foco, más abajo en
            galeria-carrusel.js) usa este mismo sFrac ya
            desplazado. Arrancar chico (0.02–0.04) y subir
            a ojo hasta que se vea recentrado sin saltar de
            elemento antes de tiempo. 0 = sin efecto,
            comportamiento idéntico al de antes de este
            campo existir.
        */
        seamOffset: 0.03,

        /*
            Factor sobre el peso de rotación del cono
            destacado (ver rotationWeights en
            galeria-carrusel.js) — acá el foco se
            sostiene por un buen tramo de scroll, no
            es un pico breve como en "revelado", así
            que a la misma velocidad máxima se sentía
            más rápido que en el resto de la galería.
            1 = misma velocidad que las demás fases;
            valores menores, más lento.
        */
        rotationScale: 0.35
    },


    /*
        Rotación MANUAL del elemento en foco durante
        "fichas" (arrastre con click/touch sobre su
        mesh — ver galeria-interaccion-ficha.js). Capa
        aparte, aditiva, sobre la orientación "outward"
        que ya escribe galeria-carrusel.js: no reemplaza
        nada de rotation/carousel de arriba.

        "sensibilidad": radianes de giro por cada pixel
        arrastrado horizontalmente. Valor de partida
        para ajustar a ojo.

        "resetSuavizadoMs": constante de tiempo del
        suavizado exponencial con el que el offset
        manual vuelve a 0 cuando se retoma el scroll
        (mismo mecanismo que rotation.suavizadoMs más
        arriba) — más alto, retorno más gradual; más
        bajo, más inmediato.

        "umbralScrollPx": cuánto tiene que moverse
        window.scrollY entre frames para considerar que
        "se volvió a mover el scroll" y disparar ese
        reset — filtra jitter de subpíxel, no cualquier
        movimiento real de scroll.
    */
    interaccion: {
        sensibilidad: 0.012,
        resetSuavizadoMs: 400,
        umbralScrollPx: 1
    },


    /*
        Dolly de cámara por wheel sobre el modelo 3D en
        foco durante "fichas" (ver galeria-zoom.js) — NO
        escala el objeto, mueve camera.position a lo
        largo de su propio eje de vista. Valores
        calibrados contra la distancia real cámara-mira
        de config.camera (~8.25, a partir de
        camera.position y lookAtY de más arriba), no
        elegidos en abstracto:

        "sensibilidad": unidades de mundo por cada unidad
        de "deltaY" del WheelEvent. Un "click" de rueda
        típico entrega un deltaY de ~100 — con 0.0025 eso
        es ~0.25 unidades de dolly por click, un ajuste
        fino, no un salto (antes, en 0.02, un solo click
        ya desplazaba 2 unidades: casi un cuarto del
        recorrido útil de golpe — de ahí la sensación de
        "demasiado zoom" reportada). Trackpads entregan
        deltaY más chico y continuo, así que ahí el
        resultado es aún más gradual.

        "min"/"max": límites del offset acumulado.
        "max" (acercar) se deja bastante por debajo de la
        distancia real (~8.25) a propósito — pasado ese
        punto la cámara empezaría a atravesar el objeto o
        a acercarse demasiado al near plane (0.1, ver
        config.camera). "min" (alejar) es más generoso: el
        far plane (100) deja mucho margen y alejarse de
        más es visualmente menos grave que acercarse de
        más.
    */
    zoom: {
        sensibilidad: 0.0025,
        min: -6,
        max: 5
    },


    /*
        Paneo de cámara por arrastre con el BOTÓN DERECHO
        sobre el modelo 3D en foco durante "fichas" (ver
        galeria-paneo.js) — mismo criterio que "zoom" acá
        arriba: NO mueve el objeto, traslada
        camera.position, esta vez sobre el plano
        perpendicular a su eje de vista (ejes LOCALES
        "right"/"up" de la cámara, no X/Y de mundo).

        "sensibilidad": unidades de mundo por cada pixel
        arrastrado — mismo rol que "sensibilidad" en
        "interaccion", pero en unidades de mundo en vez de
        radianes (acá no hay ángulo, es una traslación
        lineal). Valor de partida para ajustar a ojo.

        "max": límite del offset acumulado, medido como
        distancia radial (Math.hypot de sus dos
        componentes) desde el centro — a diferencia del
        dolly, acá no hace falta distinguir "acercar" de
        "alejar" (min/max separados): paneo es simétrico
        en las 4 direcciones, un solo límite alcanza. Se
        deja generoso a propósito (a diferencia del "max"
        de zoom, que sí es conservador): pasarse de este
        límite no arriesga atravesar geometría ni el near
        plane, como sí pasa acercando la cámara — sólo
        corre el objeto fuera de cuadro, y ahí ya no tiene
        sentido dejar seguir acumulando.

        Sin "umbralScrollPx"/"resetSuavizadoMs" propios:
        caen a los mismos valores de "interaccion" (ver
        galeria-paneo.js) — mismo criterio que ya usa
        "zoom" para esos dos campos, no hay motivo para
        que el paneo necesite su propio número calibrado
        aparte.
    */
    paneo: {
        sensibilidad: 0.01,
        max: 4
    },


    /*
        Presupuesto de scroll de cada "parada", en
        "alturas de ventana" (vh). YA NO son 5 números
        sueltos calibrados en momentos distintos (hero/
        proyecto/revelado/orden por un lado, fichas por
        otro, multiplicado recién al final por la
        cantidad de elementos) — eso hacía que el scroll
        se sintiera repartido de forma dispareja: con el
        GeoJSON real (5 elementos), las 4 fases fijas se
        llevaban ~47% del total y las 5 fichas el ~53%
        restante, y ADENTRO de las fijas tampoco era
        parejo (proyecto duraba el doble que orden) — para
        alguien scrolleando sin ver estos números, no hay
        forma de anticipar cuánto falta para la próxima
        parada.

        Ahora TODAS las paradas —las 4 fases fijas y
        CADA ficha individual, no el bloque de fichas
        entero— duran lo mismo por defecto:
        "vhPorParada" vh cada una (ver getBudgetPorParada
        en galeria-fases.js, que multiplica esto por
        "pesos" antes de convertir a píxeles). 1.2 replica
        aproximadamente la escala total que ya tenía la
        galería con el GeoJSON real (10.8vh con 9 paradas —
        4 fijas + 5 fichas— contra los ~10.95vh que daban
        los 5 valores viejos), así que el largo total del
        scroll no pega un salto grande de golpe; es sólo
        el reparto ADENTRO de ese total el que pasa a ser
        parejo.

        "pesos": multiplicador opcional por parada, todos
        en 1 = perfectamente equidistante (comportamiento
        por defecto, lo que se pidió). Se deja como
        escape hatch, no como valor a tocar de entrada: si
        más adelante hace falta que alguna fase puntual
        dure más/menos (por ejemplo, "proyecto" necesita
        tiempo extra para leer cifras, o "orden" es sólo
        una pausa corta), se ajusta ACÁ con el resto del
        recorrido intacto, en vez de volver a números
        sueltos sin relación entre sí. "ficha" aplica a
        CADA ficha individual (mismo peso para las n,
        salvo que en el futuro se quiera un array por
        índice — no hace falta hoy).
    */
    phases: {
        vhPorParada: 1.2,
        pesos: {
            hero: 1,
            proyecto: 1,
            revelado: 1,
            orden: 1,
            ficha: 1
        }
    },


    /*
        Mapa dentro del cuadrado del panel derecho de la
        ficha (ver ".ficha__panel-cuadro" en galeria.html
        / galeria-mapa.js). Mismos valores que ya estaban
        calibrados a mano en el prototipo standalone
        (mapadinamico.html) — se trasladan tal cual acá,
        no se recalibraron, para no perder ese ajuste ya
        probado.

        "styleUrl" es un archivo aparte de "dataUrl" (el
        GeoJSON de los edificios): describe el estilo
        visual del mapa base (calles, edificios, etc.),
        no los datos de los cascarones.

        "styleUrlOscuro" es la misma idea pero para
        cuando el sitio está en modo oscuro (ver
        "data-tema" en navbar.js/galeria.js): mismo mapa,
        paleta invertida. Si no está definido, el mapa
        usa "styleUrl" siempre, sin importar el tema (ver
        estiloSegunTema() en galeria-mapa.js).
    */
    mapa: {

        styleUrl: "data/MapStyle.json",
        styleUrlOscuro: "data/MapStyleDark.json",

        // Zoom al llegar/estar en un punto vs. al alejarse entre puntos.
        zoomCerca: 16,
        zoomLejos: 11,

        /*
            Fracción del recorrido entre dos puntos (0 a
            1) en la que ocurre cada fase del vuelo:
            fase 1 [0 -> panEnd fase zoom-out] cámara casi
            fija en el punto A alejándose; fase 2 (pan)
            zoom casi fijo en zoomLejos; fase 3 zoom-in
            cámara casi fija en el punto B.
        */
        faseZoomOutFin: 0.3,
        fasePanFin: 0.7,

        // Cuánto se solapan zoom y pan en los bordes de cada fase (0-1).
        solape: 0.06,

        /*
            Suavizado de cámara: fracción de la distancia
            al estado ideal que se recorre en cada frame
            (0-1, menor = más inercia).
        */
        suavizadoCamara: 0.06,

        // Píxeles de scroll real para reanudar el recorrido automático
        // después de que el visitante soltó un arrastre/zoom manual.
        umbralReanudarPx: 4,

        // Margen (km) del bounding box que limita el centro de cámara.
        bboxOffsetKm: 1,

        // Color de los pines (mismo tono que ya se calibró a ojo).
        colorPin: "#db6a40"

    }

};