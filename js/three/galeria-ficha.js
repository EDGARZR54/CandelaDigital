/* ==================================================
   galeria-ficha.js

   La ficha (fase C) muestra texto de largo variable
   (un autor o cuatro, "1951" o "1948 (no
   confirmado)", etc.). Si cada campo se dimensiona
   solo por su propio contenido, el ancho/alto de esa
   columna cambia cada vez que se pasa a otro
   elemento — se ve como si todo se corriera y
   "respirara".

   Este módulo mide, una sola vez al cargar (con los
   elementos reales, en el DOM real, aunque el panel
   esté con opacidad 0 en ese momento), cuál es el
   ancho y el alto que necesita cada campo con su
   contenido MÁS LARGO entre todos los elementos. Esa
   medida se usa después como tamaño fijo para todas
   las versiones del campo, sin importar cuál esté
   activa.

   No sabe nada del dominio: solo necesita que cada
   elemento tenga { nombre, subtitulo, ficha: [{label,
   value}, ...] } con la MISMA cantidad de campos de
   ficha en el mismo orden (eso ya lo garantiza
   normalizarElemento en *-config.js).

   Exporta DOS pares de funciones:

   - calcularDimensionesFicha / renderizarFicha: las de
     siempre, atadas a nombre + subtítulo + "ficha" (el
     texto de la izquierda, #panel-ficha).

   - calcularDimensionesCampos / renderizarCampos:
     versión genérica de la misma técnica, para
     cualquier otro array de {label, value} del
     elemento — hoy la usa "panelDerecho" (coordenadas +
     ubicación desglosada, en #panel-derecho-specs), pero
     sirve para cualquier lista nueva sin tener que
     copiar esta lógica de medición otra vez.
================================================== */


/*
    Tope de ancho por campo/título, para que en
    pantallas angostas no se fuerce un ancho enorme
    por un solo elemento con texto muy largo. El CSS
    además tiene max-width:100% como red de
    seguridad.

    Son los valores de SIEMPRE (retrato, o cualquier
    pantalla con alto de sobra): calcularDimensionesFicha
    ahora acepta un "anchoMaximoCampo" opcional para
    pisar este default — lo usa galeria.js en horizontal
    de celular, donde el alto es el recurso escaso y hay
    que garantizar que TODAS las columnas de specs entren
    en una sola fila (ver calcularAnchoMaximoCampo() ahí)
    en vez de dejar que envuelvan y el exceso se recorte
    contra max-height.
*/

const ANCHO_MAXIMO_CAMPO = 260;

/*
    Nombre del área de CSS Grid para cada campo de
    "ficha", EN EL MISMO ORDEN que el array "ficha" de
    normalizarElemento() (galeria-config.js: Autor(es),
    Espesor, Claro máximo, Tipología, Superficie, Altura,
    Estado) — si ese orden cambia ahí, hay que actualizar
    este array acá también (no hay forma de derivarlo
    automáticamente del label, a propósito: el nombre del
    área es un detalle de layout, no debería depender de
    un texto pensado para lectura humana).

    El layout resultante (ver "grid-template-areas" en
    galeria.css) es una grilla de 2 filas x 4 columnas
    para estos 7 campos (3+4 por fila) — "#ficha-controles"
    (autorotar + sliders de corte, ver galeria.html) NO es
    una columna de este grid: es un overlay
    "position:absolute" flotando en el espacio libre a la
    derecha, así que ni ocupa un nombre de área acá ni
    afecta el ancho/alto que este módulo calcula (ver
    ".ficha__controles" en galeria.css para el porqué de
    esa decisión — una columna con rowspan, probada antes,
    inflaba el alto de las filas de más abajo).
*/
const AREAS_FICHA = [
    "autores", "espesor", "claro",
    "tipologia", "superficie", "altura", "estado"
];

/*
    Saca del contenedor SOLO los ".spec" generados por
    este módulo — NUNCA "contenedor.innerHTML = ''".

    Por qué importa la diferencia: desde que "#panel-ficha"
    pasó a ser una grilla con una celda fija de controles
    del visor 3D (autorotar + sliders de corte, ver
    "#ficha-controles" en galeria.html), ese contenedor ya
    no contiene SOLO ".spec" — un innerHTML="" a secas
    borraría también esa celda (y, con ella, los
    listeners que galeria.js le hubiera enganchado). Esta
    función se usa en los 4 lugares de más abajo que antes
    hacían ese borrado completo (los dos "medirCampo*", el
    cierre de calcularDimensionesFicha, y el propio
    renderizarFicha) — así ninguno de los cuatro corre
    riesgo de llevarse puesta esa celda por accidente.

    Es seguro usarla también para contenedores que NUNCA
    tuvieron una celda fija (p. ej. "#panel-derecho-specs",
    ver calcularDimensionesCampos/renderizarCampos más
    abajo): ahí simplemente no hay ningún ".spec" para
    filtrar de otra cosa, así que el resultado es idéntico
    a un innerHTML="" — de ahí que se comparta la misma
    función en vez de mantener dos versiones.
*/
function limpiarSpecs(contenedor) {

    contenedor
        .querySelectorAll(".spec")
        .forEach(el => el.remove());

}

/*
    Tope de RESPALDO para el título, usado solo si no se
    puede medir el ancho real del contenedor (ver
    "anchoDisponible" en ajustarFuenteUnaLinea). En uso
    normal, el ancho disponible se mide en vivo del propio
    DOM — este valor no debería entrar en juego salvo que
    panelNombre no tenga padre en el momento de medir.
*/
const ANCHO_MAXIMO_TITULO = 1280;


/*
    clientWidth del padre incluye su padding — y el
    padding-right de "#carousel-panel .contenedor" es
    justamente el mecanismo que reserva el espacio del
    panel lateral del mapa (ver esa regla en galeria.css:
    padding-right = separación + ancho del panel). Usar
    clientWidth tal cual sobrestimaría el ancho
    disponible por exactamente ese padding reservado —
    hay que restarlo para saber cuánto le queda de
    verdad al título.
*/
function anchoContenidoDisponible(el) {

    const padre = el.parentElement;

    if (!padre) return null;

    const estilo = getComputedStyle(padre);

    return (
        padre.clientWidth -
        parseFloat(estilo.paddingLeft) -
        parseFloat(estilo.paddingRight)
    );

}


/*
    Mide el título (".nombre") más largo entre TODOS los
    elementos y calcula el font-size más grande que hace
    que ese título entre en una sola línea dentro del
    ancho disponible. Ese mismo font-size (y el ancho que
    ocupa a ese tamaño) se devuelve para usarlo en TODOS
    los elementos — así el título no cambia de tamaño de
    letra al pasar de uno a otro, y ninguno envuelve.

    "anchoDisponible": si no se pasa, se mide en vivo el
    ancho de CONTENIDO real del contenedor de panelNombre
    (ver anchoContenidoDisponible más arriba — clientWidth
    del padre menos su padding, para descontar el espacio
    que "#carousel-panel .contenedor" reserva vía
    padding-right para el panel del mapa) — el mismo truco
    de "medir con los elementos reales en el DOM real" que
    ya usa el resto del archivo. Esto hace que el cálculo
    se adapte solo a cualquier viewport, sin que este
    módulo necesite saber nada del layout (paddings,
    reserva de espacio del panel de la derecha, etc.): ya
    está reflejado en el ancho de contenido real del
    contenedor en ese momento.
*/
function ajustarFuenteUnaLinea(
    panelNombre, elementos, anchoDisponible
) {

    // Font-size "natural": el que ya definiría el CSS
    // (el clamp() de ".nombre") en este viewport, antes
    // de que este módulo lo pise.
    panelNombre.style.fontSize = "";

    const fontSizeBase =
        parseFloat(
            getComputedStyle(panelNombre).fontSize
        );

    /*
        nowrap A PROPÓSITO durante toda la medición: sin
        esto, un título largo envolvería solo, y
        scrollWidth reportaría el ancho de la línea más
        larga ya partida — no el ancho real del texto
        completo, que es justo lo que hace falta para
        decidir cuánto achicar la letra.
    */
    panelNombre.style.whiteSpace = "nowrap";
    panelNombre.style.width = "";

    let anchoNatural = 0;

    elementos.forEach(elemento => {

        panelNombre.textContent = elemento.nombre;

        anchoNatural =
            Math.max(
                anchoNatural, panelNombre.scrollWidth
            );

    });


    let fontSize = fontSizeBase;
    let anchoFinal = anchoNatural;

    if (anchoNatural > anchoDisponible) {

        /*
            El ancho de un texto escala ~linealmente con
            el font-size, así que una sola división ya da
            una muy buena primera estimación...
        */
        fontSize =
            fontSizeBase *
            (anchoDisponible / anchoNatural);

        /*
            ...pero no es exacta (redondeo de subpíxeles,
            kerning), así que se confirma volviendo a medir
            al tamaño estimado — y si todavía se pasa, se
            achica un poco más y se repite, hasta unas
            pocas vueltas. 0.98 en vez de recalcular la
            proporción exacta cada vez: converge sin
            pasarse para el otro lado.
        */
        for (let intento = 0; intento < 6; intento++) {

            panelNombre.style.fontSize =
                fontSize + "px";

            let anchoProbado = 0;

            elementos.forEach(elemento => {

                panelNombre.textContent =
                    elemento.nombre;

                anchoProbado =
                    Math.max(
                        anchoProbado,
                        panelNombre.scrollWidth
                    );

            });

            anchoFinal = anchoProbado;

            if (anchoProbado <= anchoDisponible) break;

            fontSize *= 0.98;

        }

    }


    // Alto de una sola línea a ese tamaño final (cualquier
    // texto sirve: nowrap ya garantiza una sola línea).
    panelNombre.style.fontSize = fontSize + "px";
    panelNombre.textContent = "Ag";

    const altura = panelNombre.scrollHeight;

    panelNombre.style.whiteSpace = "";


    return { fontSize, width: anchoFinal, height: altura };

}


function medirCampoAncho(panelFicha, campo) {

    limpiarSpecs(panelFicha);

    const wrap =
        document.createElement("div");

    wrap.className = "spec";

    wrap.innerHTML =
        '<span class="label">' +
        campo.label +
        "</span>" +
        '<span class="value">' +
        campo.value +
        "</span>";

    panelFicha.appendChild(wrap);

    return wrap.scrollWidth;

}


function medirCampoAlto(panelFicha, campo, anchoPx) {

    limpiarSpecs(panelFicha);

    const wrap =
        document.createElement("div");

    wrap.className = "spec";
    wrap.style.width = anchoPx + "px";

    wrap.innerHTML =
        '<span class="label">' +
        campo.label +
        "</span>" +
        '<span class="value">' +
        campo.value +
        "</span>";

    panelFicha.appendChild(wrap);

    return wrap.scrollHeight;

}


export function calcularDimensionesFicha(
    elementos,
    { panelNombre, panelSubtitulo, panelFicha },
    {
        anchoMaximoCampo = ANCHO_MAXIMO_CAMPO,
        anchoDisponibleTitulo = null
    } = {}
) {

    if (elementos.length === 0) return null;

    const numCampos =
        elementos[0].ficha.length;


    /*
        Título: se resuelve aparte con
        ajustarFuenteUnaLinea (ver esa función más
        arriba) — a diferencia del resto de los campos,
        acá lo que se fija entre todos los elementos no
        es solo el ancho, sino el font-size, para
        garantizar una sola línea sin importar qué tan
        largo sea el nombre más largo del set.

        anchoDisponibleTitulo: si no lo pasa quien llama
        (galeria.js podría, igual que ya hace con
        anchoMaximoCampo), se mide en vivo el ancho real
        del contenedor de panelNombre; ANCHO_MAXIMO_TITULO
        queda solo como último respaldo si ni eso se puede
        medir (por ejemplo, panelNombre sin padre todavía).
    */

    const anchoParaTitulo =
        anchoDisponibleTitulo ??
        anchoContenidoDisponible(panelNombre) ??
        ANCHO_MAXIMO_TITULO;

    const {
        fontSize: fontSizeNombre,
        width: anchoNombre,
        height: altoNombreUnaLinea
    } = ajustarFuenteUnaLinea(
        panelNombre, elementos, anchoParaTitulo
    );


    /*
        Paso 1: ancho NATURAL máximo (sin ningún
        ancho fijo todavía) por campo, y por
        subtítulo (el nombre ya quedó resuelto arriba).
    */

    panelSubtitulo.style.width = "";

    let anchoSubtitulo = 0;

    const anchoCampos =
        new Array(numCampos).fill(0);


    elementos.forEach(elemento => {

        panelSubtitulo.textContent =
            elemento.subtitulo;

        anchoSubtitulo =
            Math.max(
                anchoSubtitulo,
                panelSubtitulo.scrollWidth
            );


        elemento.ficha.forEach((campo, i) => {

            anchoCampos[i] =
                Math.max(
                    anchoCampos[i],
                    medirCampoAncho(
                        panelFicha, campo
                    )
                );

        });

    });


    anchoSubtitulo =
        Math.min(
            anchoSubtitulo, ANCHO_MAXIMO_TITULO
        );

    const anchoCampoFinal =
        anchoCampos.map(
            w => Math.min(w, anchoMaximoCampo)
        );


    /*
        Paso 2: con el ancho YA fijo, medir el alto
        máximo del subtítulo y los campos (el ancho fijo
        puede hacer que un campo con muchos autores
        envuelva en más líneas que antes, así que el alto
        se mide recién ahora, a ese ancho final). El
        nombre queda afuera de este paso: ya se resolvió
        arriba, siempre a una sola línea.
    */

    panelSubtitulo.style.width =
        anchoSubtitulo + "px";

    let altoSubtitulo = 0;

    const altoCampos =
        new Array(numCampos).fill(0);


    elementos.forEach(elemento => {

        panelSubtitulo.textContent =
            elemento.subtitulo;

        altoSubtitulo =
            Math.max(
                altoSubtitulo,
                panelSubtitulo.scrollHeight
            );


        elemento.ficha.forEach((campo, i) => {

            altoCampos[i] =
                Math.max(
                    altoCampos[i],
                    medirCampoAlto(
                        panelFicha,
                        campo,
                        anchoCampoFinal[i]
                    )
                );

        });

    });


    limpiarSpecs(panelFicha);


    return {

        nombre: {
            width: anchoNombre,
            height: altoNombreUnaLinea,
            fontSize: fontSizeNombre
        },

        subtitulo: {
            width: anchoSubtitulo,
            height: altoSubtitulo
        },

        campos:
            anchoCampoFinal.map((width, i) => ({
                width,
                height: altoCampos[i]
            }))

    };

}


/*
    Pinta el contenido real de un elemento en la
    ficha, aplicando las medidas fijas calculadas por
    calcularDimensionesFicha().
*/

export function renderizarFicha(
    elemento,
    dimensiones,
    { panelNombre, panelSubtitulo, panelFicha }
) {

    panelNombre.textContent = elemento.nombre;
    panelSubtitulo.textContent = elemento.subtitulo;


    if (dimensiones) {

        panelNombre.style.width =
            dimensiones.nombre.width + "px";
        panelNombre.style.minHeight =
            dimensiones.nombre.height + "px";

        /*
            fontSize fijo (el mismo para TODOS los
            elementos, calculado una sola vez por
            ajustarFuenteUnaLinea a partir del título más
            largo) + whiteSpace:nowrap: entre los dos
            garantizan que el nombre ocupe siempre una
            sola línea, sin importar cuál elemento esté
            activo.
        */
        panelNombre.style.fontSize =
            dimensiones.nombre.fontSize + "px";
        panelNombre.style.whiteSpace = "nowrap";

        panelSubtitulo.style.width =
            dimensiones.subtitulo.width + "px";
        panelSubtitulo.style.minHeight =
            dimensiones.subtitulo.height + "px";

    }


    limpiarSpecs(panelFicha);

    elemento.ficha.forEach((campo, i) => {

        const wrap =
            document.createElement("div");

        wrap.className = "spec";

        /*
            Ubicación en la grilla de 2x5 de "#panel-ficha"
            (ver "grid-template-areas" en galeria.css) — el
            ancho/alto fijo de más abajo sigue siendo el
            mismo mecanismo de siempre (evita que el campo
            "respire" al cambiar de elemento), esto solo
            agrega EN QUÉ CELDA cae.
        */
        wrap.style.gridArea = AREAS_FICHA[i];

        if (dimensiones) {

            const medida =
                dimensiones.campos[i];

            wrap.style.width =
                medida.width + "px";
            wrap.style.minHeight =
                medida.height + "px";

        }

        wrap.innerHTML =
            '<span class="label">' +
            campo.label +
            "</span>" +
            '<span class="value">' +
            campo.value +
            "</span>";

        panelFicha.appendChild(wrap);

    });

}


/*
    Versión genérica de calcularDimensionesFicha, sin
    nombre/subtítulo — solo el array de campos. Reusa
    medirCampoAncho/medirCampoAlto de arriba (ya eran
    genéricas: no sabían nada de "ficha" en particular,
    solo de {label, value} + un contenedor de medición).

    "clave" es el nombre del array dentro de cada
    elemento (por ejemplo "panelDerecho") — así una sola
    función sirve para cualquier lista de {label, value}
    del elemento, no solo para "ficha".

    A propósito NO se reescribió calcularDimensionesFicha
    para llamar a esta función por dentro: son casos ya
    en uso (galeria.js las llama tal cual hoy) y tocar su
    implementación interna, sin poder probar el resultado
    contra ese archivo, es más riesgo del que vale — un
    poco de lógica repetida es preferible a arriesgar una
    regresión ahí. calcularDimensionesFicha queda intacta;
    esta es una función nueva, aparte.
*/

export function calcularDimensionesCampos(
    elementos,
    clave,
    contenedorMedicion,
    { anchoMaximoCampo = ANCHO_MAXIMO_CAMPO } = {}
) {

    if (elementos.length === 0) return null;

    const numCampos =
        elementos[0][clave].length;


    const anchoCampos =
        new Array(numCampos).fill(0);

    elementos.forEach(elemento => {

        elemento[clave].forEach((campo, i) => {

            anchoCampos[i] =
                Math.max(
                    anchoCampos[i],
                    medirCampoAncho(
                        contenedorMedicion, campo
                    )
                );

        });

    });

    const anchoCampoFinal =
        anchoCampos.map(
            w => Math.min(w, anchoMaximoCampo)
        );


    const altoCampos =
        new Array(numCampos).fill(0);

    elementos.forEach(elemento => {

        elemento[clave].forEach((campo, i) => {

            altoCampos[i] =
                Math.max(
                    altoCampos[i],
                    medirCampoAlto(
                        contenedorMedicion,
                        campo,
                        anchoCampoFinal[i]
                    )
                );

        });

    });


    limpiarSpecs(contenedorMedicion);


    return anchoCampoFinal.map((width, i) => ({
        width,
        height: altoCampos[i]
    }));

}


/*
    Versión genérica de renderizarFicha, para el mismo
    "clave" que se le haya pasado a
    calcularDimensionesCampos(). "dimensiones" es
    justamente lo que esa función devuelve (un array
    paralelo a elemento[clave], no el objeto
    {nombre, subtitulo, campos} de renderizarFicha).
*/

export function renderizarCampos(
    elemento,
    clave,
    dimensiones,
    contenedor
) {

    limpiarSpecs(contenedor);

    elemento[clave].forEach((campo, i) => {

        const wrap =
            document.createElement("div");

        wrap.className = "spec";

        if (dimensiones) {

            const medida =
                dimensiones[i];

            wrap.style.width =
                medida.width + "px";
            wrap.style.minHeight =
                medida.height + "px";

        }

        wrap.innerHTML =
            '<span class="label">' +
            campo.label +
            "</span>" +
            '<span class="value">' +
            campo.value +
            "</span>";

        contenedor.appendChild(wrap);

    });

}
