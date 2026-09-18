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

/* Exportada para que galeria-mapa.js pueda derivar el hex de la
   etiqueta de estado del popup a partir de ESTA MISMA tabla, en vez
   de mantener una segunda copia manual convertida a hex (ver
   colorEstadoHex() en galeria-mapa.js). */
export { ESTADO_COLOR };

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


/*
    Color de los pines del mapa embebido, leído en vivo de
    --color-rojo-terracota (variables.css) en vez de un hex propio —
    mismo criterio que ya se aplica en atlas.html y
    mapadinamico.html: usa el token FIJO (--color-rojo-terracota), no
    --color-primario (que en modo oscuro pasa por un color-mix()),
    para que el pin se vea igual en los dos temas. Si por algún
    motivo variables.css no llegó a cargar en la página que use
    este CONFIG, cae al mismo valor en hex ("#BF3B0B").
*/
function colorPinDesdeVariables() {

    const valor = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-rojo-terracota')
        .trim();

    return valor ? `rgb(${valor})` : "#BF3B0B";

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
        spacing: 1.5
    },


    /*
        SACADA (ver Maqueta.html, y el comentario grande en
        galeria-escena.js junto a la creación de
        "habitacion"): esta sección alimentaba la "mesa"
        (plano ShadowMaterial invisible), retirada porque
        "roomFloor" (galeria-habitacion.js) ya es el único
        receptor de la sombra real de "keyLight" — un
        ShadowMaterial solo puede oscurecer, nunca mostrar la
        "piscina de luz" que sí se ve sobre el
        MeshPhysicalMaterial real de roomFloor.
    */

    /*
        Habitación atmosférica ("cyclorama": piso + pared
        como una sola malla continua por pieza, perfil
        radial revolucionado con esquinas redondeadas —
        ver galeria-habitacion.js). Portado de Maqueta.html,
        valores sin cambios.

        "geometry": radio total de la sala, radio del
        fillet (curva que conecta piso plano con pared
        recta), altura de pared, "n" (cuántas esquinas
        redondeadas tiene el contorno — 4 da una silueta
        cuadrada suavizada, no un círculo) y segmentos
        angulares de la malla.

        "floorDropMargin": en layout vertical (ver
        actualizarPisoSegunGeometria), cuánto más abajo del
        elemento más bajo de la fila se deja caer el piso
        — evita que quede tangente/clipeando contra la
        base del elemento.
    */
    room: {
        geometry: {
            radius: 40,
            filletR: 30,
            wallHeight: 30,
            n: 4,
            angSegs: 10
        },
        floorDropMargin: 0.02,

        /*
            Margen de seguridad (unidades de mundo) que se le
            suma al radio real de la fila (el punto más lejano
            de cualquier elemento, medido desde el centro de la
            sala) antes de decidir cuánto agrandar la sala — ver
            "factor" en actualizarPisoSegunGeometria,
            galeria-habitacion.js. Mismo espíritu que
            table.padding (arriba): ninguno de los dos valores
            reemplaza al otro, cada uno protege una superficie
            distinta (mesa/sombra de contacto vs. piso/pared de
            la sala).
        */
        floorFlatMargin: 1.5
    },


    /*
        Sombra de contacto: un plano circular con degradado
        radial (canvas, no una sombra real) por elemento,
        pegado al piso justo debajo — ver
        galeria-sombra-contacto.js. Complementa (no
        reemplaza) la sombra real que proyecta "key": sirve
        para que CUALQUIER elemento se sienta "apoyado" en el
        piso aunque esté lejos del alcance real del cono de
        luz (que solo cubre al que está en foco).
    */
    contactShadow: {
        // Resolución de la textura de degradado radial
        // (canvas cuadrado, lado en px).
        texSize: 256,
        // El plano es cuadrado, de lado = diagonal del bbox
        // (X/Z) del elemento por este factor — 1.6 deja aire
        // alrededor del contacto real, mismo valor que la
        // maqueta.
        escalaDiagonal: 1.6,
        // Opacidad EN REPOSO (k=1, día/claro) — el sistema
        // día/noche (config.tema) la atenúa hacia la noche,
        // ver actualizarTema() en galeria-sombra-contacto.js.
        opacityBase: 0.9,
        // Se suma a roomGroup.position.y (galeria-habitacion.js)
        // para el plano — apenas por encima del piso, evita
        // z-fighting contra la propia geometría del piso.
        offsetY: 0.003
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
            Niebla exponencial (FogExp2, por density) en vez
            de niebla lineal (near/far): con el bounding box
            real de la fila (distancia cámara→elemento más
            lejano ≈29.4), una niebla lineal con near/far
            fijos deja el extremo de la fila devorado antes
            de tiempo, salvo que near/far se calculen en
            relación a esa distancia real. FogExp2 reproduce
            el comportamiento de Maqueta.html — ver el
            comentario junto a la construcción de scene.fog
            en galeria-escena.js.

            0.038 es el valor literal de la maqueta, calibrado
            contra SU escala de prueba (cajas chicas, fila
            angosta). Con contenido real más grande esto puede
            necesitar bajarse: con distancias reales más
            grandes que las de prueba, una niebla calibrada al
            tamaño chico "devora" el fondo de la fila antes de
            tiempo. Se deja igual a la maqueta por ahora, a
            revisar a ojo.
        */
        fog: {
            density: 0.038
        }
    },


    /*
        Cámara de "alineación" (lineup shot): fija,
        pegada al primer elemento, sin OrbitControls. El
        punto de mira en X se calcula solo (ver
        findCenteredLookAtX en galeria-utils.js) para que
        la fila quede centrada sin importar cuántos
        elementos haya — acá solo se configuran la
        posición y la altura/profundidad del punto de mira.

        "position.x/z" y "lookAtY" (más abajo) NO son los
        valores que usa la escena de verdad: son solo el
        respaldo para el caso límite de fila vacía. Los
        reales se calculan en vivo en galeria-escena.js a
        partir del bounding box REAL de la fila —necesario
        porque los parámetros de las fórmulas procedurales
        son placeholders y el
        ancho/alto de la fila varía bastante entre tandas
        de valores; un número fijo queda desactualizado
        apenas cambia la escala de las geometrías (llegó a
        dejar la cámara parada ADENTRO de la fila).

        "margenRasante"/"anguloVistaGrados" arman la
        posición real como un desplazamiento POLAR desde
        el extremo izquierdo de la fila:
            dx = margenRasante * anchoFila * cos(ángulo)
            dz = margenRasante * anchoFila * sin(ángulo)
        así el ÁNGULO de vista se mantiene sea cual sea el
        ancho de la fila (con un margen fijo solo en X, el
        ángulo se achata cuanto más ancha es la fila, y los
        elementos terminan ocluyéndose entre sí).

        "anguloVistaGrados": 70° (medido desde el eje X;
        0°=pasillo, 90°=perfil puro — se busca evitar el
        perfil puro). Valor de partida para ajustar a ojo,
        rango razonable 65°-80°.

        "margenRasante": 0.19 controla qué tan lejos queda
        la cámara del extremo de la fila (más alto = plano
        más general/alejado; más bajo = cámara más cerca, a
        costa de que el extremo lejano se achique más en
        relación al cercano). Primer número para ajustar si
        hace falta más o menos tamaño en pantalla.
    */
    camera: {
        fov: 56,
        near: 0.1,
        /*
            far=100 alcanzaba de sobra para la fila de
            elementos sola, pero desde que existe la
            habitación (config.room.geometry, ver
            galeria-habitacion.js) ya no: con radius=40,
            filletR=30, wallHeight=30, el punto más lejano de
            la sala (borde superior de la pared) está a
            sqrt(40² + 60²) ≈ 72 unidades del CENTRO de la
            sala — y la cámara no siempre está centrada, así
            que la distancia real cámara→pared lejana puede
            superar eso. Con far=100 esa distancia se cruzaba
            fácil, y Three.js recorta (culling por far plane)
            todo lo que quede más allá: la pared se veía
            "cortada".

            200 dejo margen de sobra para el tamaño DEFAULT de
            la sala. Ojo: galeria-habitacion.js además escala
            la sala en vivo (XZ) para que el piso plano siempre
            cubra el punto más lejano de la fila real (ver
            "factor" en actualizarPisoSegunGeometria) — con
            filas muy anchas ese factor puede crecer bastante,
            agrandando la sala más allá de lo que este valor
            fijo cubre. No se resuelve acá (mantener este ajuste
            acotado); si vuelve a verse "cortada" con contenido
            grande, hay que volver a este número o atarlo al
            mismo factor dinámico.
        */
        far: 200,
        position: { x: -8.0, y: 0.5, z: 2.0 },
        margenRasante: 0.19,
        anguloVistaGrados: 70,
        /*
            "lookAtY": mismo patrón que position.x/z de
            arriba (respaldo para fila vacía). El valor real
            es el centro vertical (Y) del bounding box de
            toda la fila (galeria-escena.js): con geometrías
            más altas que el cono original, un lookAtY fijo
            apunta casi al piso y deja buena parte de cada
            elemento fuera de cuadro por arriba.
        */
        lookAtY: 0.65,
        lookAtZ: 0
    },


    lights: {

        ambient: {
            // 0x11131c es el valor real de la maqueta (no
            // 0xffffff). En la práctica esto casi no se nota
            // porque actualizarTemaLuces() pisa ambient.color
            // en cada frame (lerp WARM.ambient/COLD.ambient) ya
            // desde el primer tick, pero el valor de
            // construcción debe coincidir de todos modos.
            //
            // La intensidad lleva el mismo reescalado ×π que
            // key/rim/calidoFrio/porCaja (compat r128 — ver
            // galeria-compat-r128.js): bajo el modo legacy de
            // r128 (el que calibró la maqueta, y el que
            // reproduce el shim), TODA luz puntual/spot/
            // ambient/hemisférica lleva el mismo
            // "irradiance *= PI" — no solo las
            // puntuales/spot. 0.55 × π ≈ 1.728.
            color: 0x11131c,
            intensity: 1.728
        },

        /*
            "key" pasa de DirectionalLight a SpotLight —
            único shadow caster de toda la escena, igual que
            antes, pero ahora su posición/target/ángulo/
            distancia se recalculan en vivo cada frame (ver
            galeria-cono-luz.js) para seguir al foco vigente,
            en vez de quedar fijos.

            "position" queda como RESPALDO (fila vacía,
            mismo patrón que camera.position.x/table.padding):
            createConoLuz() nunca lo toca si elementCount es
            0 — con contenido real, la posición real sale
            siempre del cálculo dinámico.

            El frustum de sombra YA NO necesita
            recalibrarse a mano (actualizarFrustumSombra()
            se retira): SpotLightShadow deriva su FOV
            automáticamente de "angle" en cada actualización
            del shadow map — a diferencia de
            DirectionalLight, que sí necesitaba left/right/
            top/bottom calculados a mano contra el ancho real
            de la fila.
        */
        key: {
            /*
                Estos valores reproducen el SpotLight real
                de la maqueta:

                  new THREE.SpotLight(
                      0xfff1de, 6.5,
                      LIGHT_CONE_CONFIG.distance,   // 30
                      LIGHT_CONE_CONFIG.angleMax,   // Math.PI/2.05
                      LIGHT_CONE_CONFIG.penumbra,   // 0.55
                      1
                  );
                  keyLight.position.set(3.2, 5.2, -2.4);
                  keyLight.shadow.bias = -0.0004;
                  keyLight.shadow.normalBias = 0.0015;
                  keyLight.shadow.camera.far = 25;

                "intensity" en la maqueta es 6.5 — no
                confundir con INTENSIDAD_FOCO_MAX de
                lucesPorCaja (config.lightsAdicionales.
                porCaja.intensidadMax), que es un valor
                distinto para otra luz.

                REESCALADO por unidades fotométricas — ver
                galeria-compat-r128.js. El factor real entre
                r128 (physicallyCorrectLights=false, con el
                que se calibró TODA Maqueta.html) y three
                0.169 SIN el shim de compat es ×4π; CON el
                shim (que reproduce el modo legacy de r128,
                que también trae su propio ×π implícito) el
                factor correcto es solo ×π: 6.5 (valor real
                de la maqueta) × π ≈ 20.42 — el valor que usa
                esta intensidad, y no 81.68 (×4π), que
                correspondería a la escena SIN el shim.

                La pérdida de brillo frente a la maqueta tiene
                dos causas distintas (ver
                galeria-compat-r128.js): la fórmula de
                atenuación por distancia (resuelta por el
                shim + keyLight.distance fijo, ver
                galeria-cono-luz.js) y el factor ×π (resuelto
                acá). SIN VERIFICAR visualmente todavía (no
                hay forma de renderizar WebGL acá) — punto de
                partida razonado, no un valor confirmado con
                los ojos.
            */
            color: 0xfff1de,
            intensity: 20.42,
            position: { x: 3.2, y: 5.2, z: -2.4 },
            target: { x: 0, y: 0, z: 0 },

            // "distance" es solo el valor inicial/de
            // respaldo — createConoLuz() lo recalcula cada
            // frame como (altura del cono + margenDistancia).
            distance: 30,
            angleMin: 0.25,
            angleMax: Math.PI / 2.05,
            penumbra: 0.55,
            decay: 1,

            shadowMapSize: 1024,
            shadowBias: -0.0004,
            shadowNormalBias: 0.0015,
            // Perspective shadow camera de SpotLight: solo
            // necesita near/far (el fov lo deriva "angle"
            // solo) — a diferencia del frustum ortográfico de
            // DirectionalLight (left/right/top/bottom), que
            // ya no aplica.
            shadowCameraNear: 1,
            // 25 es el valor real de la maqueta. OJO: ahí la
            // sala/fila eran chicas (mismo motivo por el que
            // hubo que subir config.camera.far de 100 a 200,
            // ver el comentario ahí) — si con contenido real
            // más grande el cono de luz llega a necesitar más
            // de 25 unidades de alcance (keyLight.distance =
            // altura del cono + margenDistancia, ver
            // galeria-cono-luz.js), la sombra se recorta por
            // este far plane. Se deja igual a la maqueta por
            // ahora, a revisar si se nota recorte.
            shadowCameraFar: 25
        },

        /*
            Parámetros del cono de luz en sí (dónde apunta,
            qué tan grande es) — ver galeria-cono-luz.js.
            Portado de Maqueta.html (LIGHT_CONE_CONFIG/
            alturaPuntoFinalLineaRosa/FACTOR_SUAVIZADO).

            "apex.y" (la altura del ápice del cono) se
            calcula con "alturaApexFactor" solo: multiplica
            la extensión real de los elementos en el eje
            secundario vigente (auditado contra Maqueta.html
            línea 1397/1400, donde no es un valor directo
            sino "extensionEjeSecundario * 1.5", recalculado
            por galeria-cono-luz.js contra "bboxesPorIndice",
            ver alturaApexMinimo() ahí). Un valor directo fijo
            no sirve: con geometría real más grande, la
            distancia horizontal apex→fila crece con el ancho
            de la fila mientras la altura del ápice quedaría
            fija, y la intersección del cono con el piso deja
            de ser una elipse cerrada (pasa a parábola/
            hipérbola, abierta hacia el horizonte).

            "alturaApexRatio"/"distanceMargenFactor"
            (declarados más abajo, SIN USO) representan un
            enfoque alternativo que ata "apex.y" a la posición
            real del ápice —el reflejo de la cámara a través
            del punto en foco, cuyo offset horizontal es la
            distancia 3D completa cámara→target y crece con
            el ANCHO de la fila, no con la altura de un
            elemento— en vez de a la altura del elemento más
            alto. Ese enfoque corrige mejor la forma de la
            piscina de luz en filas anchas, pero deja el
            ápice muy por encima de la escena en esos casos,
            así que "apex.y" usa solo "alturaApexFactor" por
            ahora; los dos campos quedan declarados por si se
            retoma este camino con otro enfoque (p. ej. un
            ratio más chico, o solo aplicado en algunas
            fases).
        */
        conoLuz: {
            // Multiplicador sobre la extensión real de los
            // elementos en el eje secundario vigente (altura
            // del elemento más alto, en horizontal) — no una
            // altura directa. 1.5 es el valor real de
            // Maqueta.html (alturaPuntoFinalLineaRosa =
            // extensionEjeSecundario * 1.5). Único término
            // que fija "apex.y" actualmente — ver el
            // comentario grande de arriba.
            alturaApexFactor: 1.5,
            // SIN USO (ver el comentario grande de arriba):
            // tan(elevación deseada del eje del cono sobre el
            // piso), aplicado sobre "distancia"
            // (cámara→target), no sobre el ancho de la fila
            // directamente — ese es justo el punto: no hace
            // falta saber el ancho real de la fila porque
            // "distancia" ya lo refleja (la cámara se aleja
            // en proporción al ancho para mantener todo en
            // cuadro). 1.0 ≈ elevación de 45°: valor de
            // partida razonado a partir de la escena real de
            // Maqueta.html (ratio implícito ~0.47, elevación
            // ~25°, apenas por encima del rango de
            // keyLight.angle observado en la escena real —
            // 21°..32°), con margen extra a propósito porque
            // el ratio de la maqueta ya andaba al límite
            // incluso en SU propia escala chica. Mismo tipo
            // de constante "ajustar a ojo" que el resto del
            // proyecto (radioFactor, levelSeparationFactor...)
            // — subir el número sube la luz (piscina más
            // redonda, sombras más cortas); bajarlo la acerca
            // al piso (piscina más alargada). SIN VERIFICAR
            // visualmente todavía.
            alturaApexRatio: 1.0,
            /*
                "distanceMargenFactor" (declarado más abajo,
                SIN USO junto con "alturaApexRatio") resuelve
                un problema derivado de ese enfoque
                alternativo: subir el ápice también alarga la
                distancia real ápice→elementos, y
                "config.lights.key.distance" (30, fijo,
                portado literal de Maqueta.html) dejaría de
                alcanzar — con números reales (ápice a y≈24,
                elementos a distApex 34-36), todos quedarían
                más allá del alcance de la luz bajo la fórmula
                LINEAL del shim (distance = donde la luz llega
                a cero), así que solo se vería la porción de
                la elipse más cercana al ápice, no la elipse
                completa.

                Multiplica el largo real del eje del cono
                (apex→target, "height" en galeria-cono-luz.js)
                para dar el keyLight.distance, tomando el
                MAYOR entre eso y el piso fijo de la maqueta
                (config.lights.key.distance — sigue sirviendo
                en escenas chicas/cámara cerca, donde "height"
                es menor a 30). 1.6 dejaría el corte ~60% más
                allá del punto en foco — no hay una talla
                única (la fila real se extiende a los costados
                del eje, así que el elemento MÁS lejano del
                ápice queda más allá de "height" solo): mismo
                tipo de constante "ajustar a ojo" que
                alturaApexRatio, subir el número extiende el
                alcance (más elementos bien iluminados, pool
                más completo); bajarlo lo acerca al corte que
                muestra la elipse parcial descripta arriba. Es
                seguro subirlo sin límite práctico bajo la
                fórmula LINEAL del shim (a diferencia de la
                ventana Frostbite sin el shim, donde un
                "distance" generoso apagaba todo por otro
                motivo — ver el comentario junto a
                "margenDistancia", más abajo).
            */
            // SIN USO (ver el comentario grande junto a
            // "alturaApexFactor", arriba). Con "apex.y"
            // fijado solo por "alturaApexFactor", "height"
            // (el largo del eje apex→target) vuelve a ser
            // chico y "config.lights.key.distance" (30)
            // alcanza de sobra sin necesitar este margen.
            distanceMargenFactor: 1.6,
            // SIN USO desde que compat r128 (ver
            // galeria-compat-r128.js) fija keyLight.distance
            // en config.lights.key.distance (30, igual que
            // Maqueta.html) en vez de derivarlo de la
            // geometría del cono — la fórmula de atenuación
            // LINEAL que reproduce el shim necesita esa
            // distancia fija como la rampa completa 0→1, no
            // como un margen sobre un corte físico. Se deja
            // declarado por si algún día se necesita un
            // margen real (p. ej. si se abandona el shim),
            // para no perder el valor de referencia de la
            // maqueta.
            margenDistancia: 4,
            // Suavizado exponencial del radio mientras NO
            // está congelado (ver FACTOR_SUAVIZADO en la
            // maqueta) — 0..1, más alto = sigue al objetivo
            // más rápido.
            suavizadoRadio: 0.35,

            /*
                Margen sobre la distancia real ápice→cámara
                que se le da a "keyLight.distance" (ver su
                uso en galeria-cono-luz.js). 1.0 =
                el corte esférico de la luz pasa exactamente
                por la cámara; 1.1 = 10% más allá, para
                cubrir cualquier punto visible que quede un
                poco por detrás de la cámara respecto del
                ápice. Valores más altos dan más cobertura
                pero aplanan más la rampa de atenuación
                (todo se ve más parejo, menos "spot") —
                1.05–1.15 es el rango sano; subir solo si
                con la cámara muy lejos todavía se ve
                recorte.
            */
            toleranciaDistancia: 1.10,


            /*
                Haz visible (la malla del cono en sí, no la
                luz) — ver galeria-cono-luz.js. "color"/
                "opacity" acá son la base WARM en reposo (k=1,
                día/claro) — el sistema día/noche
                (config.tema, ver más abajo) los recalcula en
                vivo a partir de warm/cold y de la intensidad
                del preset vigente; estos valores solo importan
                como respaldo antes del primer
                actualizarTemaSuave() (galeria.js).
            */
            beam: {
                color: 0xffeedd,
                opacity: 0.105
            },

            /*
                Polvo en suspensión dentro del haz — ver
                galeria-cono-luz.js (mismo módulo que el haz:
                comparten posición/eje/radio/largo del cono,
                no vale la pena separarlos en otro archivo).

                "count" gateado por dispositivo (mismo
                precedente que shadowMapSize en config.lights.key
                — 900/450, valores de la maqueta).

                "umbralFoco"/"limiteFreeze"/"limiteOcultar":
                cuantas más "cajas en foco" haya a la vez (ver
                pesoFoco, mismo umbral que
                lightsAdicionales.porCaja más abajo), más caro
                sale seguir animando el polvo sin que se note
                — con más de "limiteOcultar" en foco simultáneo
                se oculta directamente, y con más de
                "limiteFreeze" se deja de avanzar el tiempo del
                shader (queda quieto, pero visible).
            */
            dust: {
                // En 0: el visitante en mobile probablemente
                // ni lo nota (efecto sutil, se ve de cerca y
                // con foco), y elimina overdraw aditivo por
                // completo en vez de solo reducirlo. El resto
                // del pipeline de polvo (galeria-cono-luz.js)
                // ya tolera 0 partículas sin ninguna rama
                // especial: una BufferGeometry vacía
                // simplemente no dibuja nada.
                countMobile: 0,
                countDesktop: 900,
                umbralFoco: 0.05,
                limiteFreeze: 2,
                limiteOcultar: 3
            }
        }

    },


    /*
        Sistema día/noche — portado de Maqueta.html
        (DARK/BRIGHT/WARM/COLD/refresh(k)). Ahí era un
        <input type="range"> que el visitante arrastraba a
        mano (la suavidad la daba el propio gesto); acá lo
        dispara el botón de tema del navbar (oscuro/claro,
        discreto, dos estados) — así que la transición suave
        hay que armarla en código: "k" (0..1, 0=oscuro/DARK,
        1=claro/BRIGHT) se anima con suavizado exponencial
        hacia el objetivo en vez de saltar de golpe (ver
        actualizarTemaSuave en galeria.js, mismo criterio de
        suavizado que "constanteDeTiempo" en
        galeria-rotacion.js).

        NO toca scene.background/scene.fog: eso lo sigue
        manejando actualizarColoresTema() (galeria-escena.js),
        que ya lee las variables CSS reales del sitio — son
        dos sistemas separados que conviven porque atacan
        cosas distintas (paleta general de la página vs.
        luces/materiales específicos de la escena 3D). Si acá
        también se tocara fog/background, competirían por
        escribir el mismo valor cada frame y una de las dos
        fuentes quedaría de adorno.

        "dark"/"bright": mismos presets que la maqueta
        (warmth/intensity/day, 0..1 cada uno) — no son
        colores, son FACTORES que después "refresh"
        multiplica/mezcla contra las bases reales de cada luz
        (config.lights.key.intensity, etc.) y contra
        warm/cold.
    */
    tema: {

        dark: { warmth: 0.0, intensity: 0.75, day: 0.0 },
        bright: { warmth: 1.0, intensity: 0.90, day: 0.60 },

        warm: {
            keyColor: 0xfff1de,
            beamColor: 0xffeedd,
            ambientColor: 0x1a1410
        },
        cold: {
            keyColor: 0xbfd4ff,
            beamColor: 0xaec6ff,
            ambientColor: 0x0d1420
        },

        roomNight: 0x000000,
        roomDay: 0x3a3a42,

        // Mismos hex que floorMat.color/FLOOR_NIGHT en
        // galeria-habitacion.js — se duplica acá (en vez de
        // importar desde ahí) para no acoplar ese módulo a
        // este sistema; si alguno de los dos cambia, hay que
        // revisar el otro a mano.
        floorNight: 0x2a231b,
        floorDay: 0xF5E6D3,

        hemiMax: 1.15,
        wallLightMax: 1.55,

        // Constante de tiempo (ms) del suavizado exponencial
        // de "k" — más alto, transición más lenta/pareja.
        suavizadoMs: 500

    },


    /*
        Luces ADICIONALES portadas de Maqueta.html — no
        reemplazan nada de "lights" arriba (ambient/key/fill
        siguen intactas). Ninguna de estas proyecta sombra
        (solo "key", arriba, es shadow caster en toda la
        escena — ver galeria-escena.js).

        "rim"/"roomLight" iluminan TODO (elementos + sala,
        capa por defecto). "wallLight" está restringida a la
        capa 1 (layers.set(1)) — la misma que ya activan
        roomWall/roomFloor en galeria-habitacion.js — así que
        solo afecta a la sala, nunca a los elementos, aunque
        ambas capas convivan en el mismo grupo de luces.

        "calidoFrio": el par de PointLight cálido/frío cambia
        de comportamiento según ejePrincipal (ver
        actualizarLucesSegunCamara en galeria-luces.js): en
        horizontal quedan fijas en su posición/intensidad de
        siempre; en vertical se atenúan y seguido la altura de
        la cámara (siguen "subiendo" con la columna a medida
        que se recorre scroll).

        REESCALADO FOTOMÉTRICO (afecta "rim" y "calidoFrio"
        acá abajo, y config.lights.key más arriba — NO a
        "roomLight"/"wallLight", HemisphereLight, ni a
        config.lights.ambient, AmbientLight: ninguna de esas
        dos tiene esta reinterpretación fotométrica):

        La maqueta corre en three r128, donde "intensity" de
        PointLight/SpotLight era un multiplicador arbitrario
        sin unidad física fija. Este proyecto corre en
        three@0.169.0 (ver import map de galeria.html), donde
        esa propiedad "useLegacyLights"/"physicallyCorrectLights"
        que permitía volver al comportamiento viejo YA NO
        EXISTE (confirmado contra el código fuente real de
        0.169.0: PointLight/SpotLight.intensity se interpreta
        siempre en candela — ver "power = intensity × 4π" en
        PointLight.js) — no alcanza con cargar el mismo CDN
        que la maqueta para que esto coincida solo: aunque se
        pudiera (no es práctico: todo este proyecto ya está
        escrito contra la sintaxis de módulos ES y los chunks
        de shader de una versión moderna de three, r128 es un
        script global de otra era), la propiedad en sí fue
        removida, no solo deprecada.

        Se reescalan entonces los valores de intensidad
        portados literal de la maqueta por ×4π (≈12.566, la
        conversión que Three.js documentó al retirar el flag)
        — un punto de partida razonado, SIN VERIFICAR
        visualmente (no hay forma de renderizar WebGL en este
        entorno). El valor original de la maqueta queda en
        comentario al lado de cada uno, para ajustar a ojo sin
        tener que rehacer la cuenta.
    */
    lightsAdicionales: {

        // Compat r128 (ver galeria-compat-r128.js y su
        // comentario en config.lights.key): TODAS las
        // intensidades de este bloque quedan reescaladas
        // ×π (no ×4π, que sería el factor sin el shim de
        // compat) contra el valor real de Maqueta.html.
        rim: {
            color: 0x2b4a6b,
            // Maqueta (r128): 0.65. ×π ≈ 2.042.
            intensity: 2.042,
            distance: 15,
            position: { x: -3, y: 1.6, z: -3 }
        },

        roomLight: {
            skyColor: 0x8ba8c8,
            groundColor: 0x2a2418,
            // 0 en la maqueta — sin cambio, ×π de 0 sigue
            // siendo 0.
            intensity: 0.0
        },

        wallLight: {
            skyColor: 0xd4e0ee,
            groundColor: 0x8c7c64,
            // Reescalado ×π como el resto del bloque (ver
            // el comentario junto a "rim", arriba). Maqueta
            // (r128): 105.0. ×π ≈ 329.87.
            intensity: 329.87
        },

        calidoFrio: {
            calidoColor: 0xff8a3d,
            frioColor: 0x4fd8ff,
            distance: 14,
            decay: 2,
            calidoPos: { x: -3.5, xFactor: -0.44, y: 1.6, z: 1.5 },
            frioPos:   { x: 2.5,  xFactor:  0.31, y: 2.0, z: -3.0 },
            // Maqueta (r128): 2. ×π ≈ 6.283.
            intensidadHorizontal: 6.283,
            // Maqueta (r128): 0.35. ×π ≈ 1.0996.
            intensidadVertical: 1.0996
        },

        /*
            Un PointLight hijo de cada malla (ver
            createLucesPorCaja, galeria-luces.js). Colores
            alternados par/impar — decorativo, no ligado al
            estado de conservación ni a ningún otro dato real
            del elemento (mismo criterio que la maqueta).

            "alturaFraccion"/"zOffset" posicionan la luz
            relativa al CENTRO real del bbox local de cada
            elemento (ver bboxesPorIndice) — 0.65/0.7 son los
            valores de la maqueta, medidos ahí también desde
            el centro de la caja (createLucesPorCaja recompone
            ese centro y los aplica relativos a él, no al
            origen local de la malla — ver el comentario junto
            a "luz.position.set", galeria-luces.js: el origen
            local acá es la base/cara frontal, no el centro,
            a diferencia de la maqueta). Con geometría
            paramétrica real de otra escala pueden necesitar
            ajuste igual, pero al menos ahora parten del mismo
            punto de referencia que la maqueta.

            "umbral"/"ancho" arman la banda de pesoFoco()
            (smoothstep alrededor de w=umbral, ancho de
            transición "ancho") — no una rampa lineal: por
            debajo de umbral-ancho/2 la luz queda apagada,
            por encima de umbral+ancho/2 a full.
        */
        porCaja: {
            colorPar: 0xff8a3d,
            colorImpar: 0x4fd8ff,
            distance: 7,
            decay: 2,
            alturaFraccion: 0.65,
            zOffset: 0.7,
            // Reescalado fotométrico ×π (compat r128 — ver
            // galeria-compat-r128.js). Maqueta (r128):
            // 0.12/3.4. ×π ≈ 0.377 / 10.681.
            intensidadMin: 0.377,
            intensidadMax: 10.681,
            umbral: 0.35,
            ancho: 0.3
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
        indicador de scroll, con progreso propio (no
        comparte tiempo con la cascada de conos —
        "heroFadeOutAt"/"scrollHintFadeAt" son fracciones
        de ESTA fase, no de galeria-revelado.js).

        "hiddenDrop": respaldo para fila vacía (mismo
        patrón que camera.position.x/z). El valor real sale
        de findHiddenDrop() (galeria-utils.js) a partir del
        encuadre real de la cámara, así se ajusta solo en
        cualquier dispositivo en vez de depender de un
        número fijo calibrado para escritorio.
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
        seamOffset: 0.00,

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
        fino, no un salto (con 0.02, un solo click
        desplazaría 2 unidades: casi un cuarto del
        recorrido útil de golpe, demasiado zoom por click).
        Trackpads entregan
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
        "alturas de ventana" (vh). TODAS las paradas —las
        4 fases fijas y CADA ficha individual, no el
        bloque de fichas entero— duran lo mismo por
        defecto: "vhPorParada" vh cada una (ver
        getBudgetPorParada en galeria-fases.js, que
        multiplica esto por "pesos" antes de convertir a
        píxeles). Antes eran 5 números sueltos calibrados
        por separado, con un reparto bastante dispar entre
        fases (y entre fichas y fases fijas); ahora el
        único número a tocar para el largo total es este.

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

        // Color de los pines: ver colorPinDesdeVariables() arriba.
        colorPin: colorPinDesdeVariables()

    }

};