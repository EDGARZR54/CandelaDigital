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
const ANCHO_MAXIMO_TITULO = 1280;


function medirCampoAncho(panelFicha, campo) {

    panelFicha.innerHTML = "";

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

    panelFicha.innerHTML = "";

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
    { anchoMaximoCampo = ANCHO_MAXIMO_CAMPO } = {}
) {

    if (elementos.length === 0) return null;

    const numCampos =
        elementos[0].ficha.length;


    /*
        Paso 1: ancho NATURAL máximo (sin ningún
        ancho fijo todavía) por campo, y por
        nombre/subtítulo.
    */

    panelNombre.style.width = "";
    panelSubtitulo.style.width = "";

    let anchoNombre = 0;
    let anchoSubtitulo = 0;

    const anchoCampos =
        new Array(numCampos).fill(0);


    elementos.forEach(elemento => {

        panelNombre.textContent =
            elemento.nombre;

        anchoNombre =
            Math.max(
                anchoNombre,
                panelNombre.scrollWidth
            );


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


    anchoNombre =
        Math.min(anchoNombre, ANCHO_MAXIMO_TITULO);

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
        máximo (el ancho fijo puede hacer que un
        campo con muchos autores envuelva en más
        líneas que antes, así que el alto se mide
        recién ahora, a ese ancho final).
    */

    panelNombre.style.width =
        anchoNombre + "px";

    panelSubtitulo.style.width =
        anchoSubtitulo + "px";

    let altoNombre = 0;
    let altoSubtitulo = 0;

    const altoCampos =
        new Array(numCampos).fill(0);


    elementos.forEach(elemento => {

        panelNombre.textContent =
            elemento.nombre;

        altoNombre =
            Math.max(
                altoNombre,
                panelNombre.scrollHeight
            );


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


    panelFicha.innerHTML = "";


    return {

        nombre: {
            width: anchoNombre,
            height: altoNombre
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

        panelSubtitulo.style.width =
            dimensiones.subtitulo.width + "px";
        panelSubtitulo.style.minHeight =
            dimensiones.subtitulo.height + "px";

    }


    panelFicha.innerHTML = "";

    elemento.ficha.forEach((campo, i) => {

        const wrap =
            document.createElement("div");

        wrap.className = "spec";

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


    contenedorMedicion.innerHTML = "";


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

    contenedor.innerHTML = "";

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
