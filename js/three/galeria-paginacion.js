/* ==================================================
   galeria-paginacion.js

   Rail de "pagination dots" del lado derecho de la
   ventana: un punto por cada parada real del scroll
   (las 4 fases fijas + una por cada ficha del GeoJSON —
   mismo desglose que ya usa galeria-fases.js para
   repartir el presupuesto de scroll, ver ese archivo).
   Objetivo: que el usuario vea de un vistazo cuántas
   paradas hay en total y en cuál está, sin depender del
   "Desliza" de #scroll-hint (que solo dice que hay MÁS,
   no cuánto falta).

   Este módulo no decide fases ni calcula presupuesto:
   recibe la fase/t vigente ya resuelta por tick() en
   galeria.js — ver update(phase, t) más abajo — y un
   "phaseController" ya armado (el que devuelve
   createPhaseController() en galeria-fases.js) del que
   pide getScrollBudget() para calcular a qué scrollY
   saltar al clickear un punto. Mismo patrón de
   responsabilidad única que ya separa galeria-scroll.js
   (lectura cruda) de galeria-fases.js (decisión de fase):
   acá solo se traduce esa fase a "qué punto se prende" y,
   al revés, "qué punto clickeado corresponde a qué
   scrollY".

   Ya no alcanza con "phaseController" solo, sin embargo:
   este módulo además recibe "getOrder" (para etiquetar
   cada dot de ficha según el elemento que REALMENTE ocupa
   ese slot tras un reordenamiento — mismo contrato que ya
   usa galeria-revelado.js) y "config" (para leer
   config.carousel.formSpan y así traducir índice de ficha
   a scrollY exacto con la MISMA cuenta que usa
   galeria-carrusel.js, en vez de asumir una división
   pareja que no coincide con el foco real — ver
   tParaFicha() más abajo).

   No escribe su propio HTML de layout: espera un
   contenedor vacío ya presente en el documento (ver
   "#galeria-paginacion" en galeria.html, junto a
   "#scroll-hint" dentro de "#galeria-escena-fija") y arma
   los <li> adentro, igual que galeria.js ya hace con
   "#gui" / "#scene" / "#carousel-panel" para contenido
   que depende de datos en runtime (acá, la cantidad real
   de elementos del GeoJSON).

   Además del punto que se prende, hay un "blob" (círculo
   de vidrio) que viaja sobre el rail — ver moverBlob() y
   ".paginacion__blob" en galeria.css.

   IMPORTANTE (fix de un bug reportado: "no debería verse
   'en su lugar' hasta que esté en el punto exacto" — la
   página no tiene scroll-snap real, así que quedarse
   quieto en cualquier punto DENTRO del rango de una fase
   no es lo mismo que estar en el scrollY exacto al que
   saltaría un click en ese dot): el blob YA NO salta entre
   "punto activo A" y "punto activo B" de forma discreta.
   En cambio, cada frame calcula el scrollY real (pxActual,
   más abajo) y lo ubica en el continuo entre los DOS dots
   vecinos que lo enmarcan, usando exactamente las mismas
   fórmulas de aterrizaje que ya usan irAFase()/irAFicha()
   para saltar al clickear (pxAterrizajeFase/
   pxAterrizajeFicha) — el código YA sabía el punto exacto
   para el click; ahora la misma cuenta también decide qué
   tan "asentado" se ve el blob en todo momento. Solo se ve
   como círculo perfecto, centrado, cuando el scroll real
   coincide con ese punto exacto; en cualquier otro punto
   del medio se ve como una pastilla estirada hacia el
   vecino más cercano, en tránsito — ver moverBlob().

   Las posiciones Y de cada dot y sus scrollY de aterrizaje
   se leen/calculan UNA vez (medirAnclas(), más abajo) y se
   cachean en cada "punto" — no en cada frame: mismo cuidado
   por no forzar layout de más que ya documenta
   galeria-scroll.js para window.scrollY. Se vuelven a medir
   solo en resize (ver el listener al final de este
   archivo), porque ahí sí puede cambiar tanto el layout del
   rail como el presupuesto de scroll (ver
   updateScrollHeight() en galeria-fases.js, atado a
   window.innerHeight).
================================================== */


/*
    Mismo orden y mismas claves que FASES_FIJAS en
    galeria-fases.js — se repite acá (en vez de
    importarla) porque son dos cosas distintas: allá es
    el orden en que se SUMAN presupuestos, acá además
    hace falta la ETIQUETA visible de cada una. Si el
    día de mañana se agrega o renombra una fase fija, hay
    que tocar los dos archivos — ambos ya dependen del
    mismo contrato de nombres ("hero", "proyecto",
    "revelado", "orden", "fichas") que expone
    getPhase()/getScrollBudget().
*/


const FASES_FIJAS = ["hero", "proyecto", "revelado", "orden"];

const ETIQUETAS_FASES_FIJAS = {
    hero: "Hero",
    proyecto: "El proyecto",
    revelado: "Revelado",
    orden: "Orden"
};

/*
    Subconjunto de FASES_FIJAS que efectivamente recibe un
    dot navegable en el rail. "revelado" queda AFUERA a
    propósito: es una cascada continua (ver la cabecera de
    galeria-revelado.js), sin contenido propio que mostrar
    de forma estable — no es una "parada" en el sentido que
    sí lo son "hero", "proyecto" y "orden". Se mantiene,
    en cambio, en FASES_FIJAS: inicioDeFase() todavía
    necesita sumar su ancho de presupuesto para calcular
    correctamente dónde arranca "orden" (ver más abajo).
*/
const FASES_CON_DOT = ["hero", "proyecto", "orden"];

/*
    "t" LOCAL (0..1 de esa fase, no del scroll total) al
    que salta irAFase() al clickear cada dot — NO siempre
    conviene que sea t=0 (el borde matemático de inicio de
    la fase). Bug reportado: "clickeo 'El proyecto' y no
    veo el texto, se ve como antes" — causa: a diferencia
    de "hero" (que ya arranca visible en t=0 y sólo se
    desvanece más adelante, ver heroFadeEnvelope en
    galeria-revelado.js), el panel de texto de "proyecto"
    entra con SU PROPIO fundido de aparición (liftEnvelope
    sobre config.proyecto.panelRamp, ver galeria-proyecto.js
    y galeria-utils.js): en t=0 exacto, panelOpacity todavía
    es 0 — recién termina de entrar en t=panelRamp y se
    sostiene hasta 1-panelRamp. 0.5 (mitad de la meseta) es
    un punto seguro dentro de esa meseta para CUALQUIER
    valor de panelRamp, sin acoplarse al número exacto
    configurado en galeria-config.js. "orden" no necesita
    ajuste: su panel entra por una transición CSS disparada
    por la clase "visible" (con su propia duración en tiempo
    real, no atada a "t"), así que ya se ve bien saltando a
    t=0 — mismo motivo por el que "hero" tampoco lo
    necesita.
*/
const T_ATERRIZAJE_FASE = {
    proyecto: 0.5
};

/*
    "Liquid dot": el blob NO salta como un círculo fijo de
    un dot a otro — se interpola continuamente, frame a
    frame, entre las dos "anclas" (dots vecinos) que
    enmarcan el scrollY real (ver moverBlob()/update() más
    abajo). Solo se ve como círculo perfecto, centrado,
    cuando ese scrollY coincide EXACTO con el punto de
    aterrizaje de un dot — en el medio, se estira como una
    pastilla hacia el vecino más cercano, en tránsito.

    ANCHO_BLOB tiene que coincidir con el "width" fijo de
    ".paginacion__blob" en galeria.css — de ahí sale el
    alto de reposo (círculo: alto = ANCHO_BLOB). Ver el
    comentario junto a "border-radius" en esa regla: el
    radio fijo (no "%") es lo que hace que la MISMA forma
    sea círculo o pastilla según el alto que le pase esta
    función, sin animar border-radius aparte.

    DURACION_SEGUIMIENTO_MS es deliberadamente corta: no es
    una animación "de viaje" (eso ya lo da la interpolación
    en sí, recalculada cada frame a partir del scroll real)
    sino solo un suavizado fino entre un frame y el
    siguiente, para que no se sienta robótico si el scroll
    llega con jitter.
*/
const ANCHO_BLOB = 18;
const DURACION_SEGUIMIENTO_MS = 90;


export function createPaginationController(
    contenedor, phaseController, elementos, getOrder,
    config
) {

    /*
        Lista plana de TODOS los puntos, fases fijas +
        fichas, en el mismo orden en que aparecen en el
        scroll. Cada entrada guarda su <button> real para
        no tener que volver a buscarlo en el DOM en cada
        frame (update() corre dentro de tick(), no
        conviene un querySelector ahí adentro).
    */
    const puntos = [];

    /*
        Referencias que necesita moverBlob(): "listaEl" para
        medir su propio borde (origen de coordenadas del
        blob) y "blobEl" para moverlo. Se completan recién
        en construir(), pero se declaran acá arriba para que
        moverBlob() e irAFase()/irAFicha() (definidas antes
        de construir() en el archivo) puedan cerrarlas por
        referencia sin importar el orden de declaración.
    */
    let listaEl = null;
    let blobEl = null;

    /*
        La primera vez que se ubica el blob (recién nacido,
        sin animación previa) no debe "viajar" visiblemente
        desde su posición por defecto en CSS — se posiciona
        con la transición apagada esa única vez.
    */
    let primerMovimientoBlob = true;

    /*
        Firma del último "order" con el que se etiquetaron
        los dots de ficha (ver refrescarEtiquetasFichas()
        más abajo), para no reescribir aria-label/textContent
        en cada frame — sólo cuando el reordenamiento (GUI de
        la fase "orden") realmente cambió el arreglo. join(",")
        alcanza: "order" es un arreglo chico de índices
        enteros, comparar su representación en texto es más
        barato que un diff elemento a elemento a mano.
    */
    let firmaOrdenEtiquetada = null;


    function crearItem(etiquetaTexto) {

        const li = document.createElement("li");
        li.className = "paginacion__item";

        const boton = document.createElement("button");
        boton.type = "button";
        boton.className = "paginacion__dot";
        boton.setAttribute("aria-label", etiquetaTexto);

        const etiqueta = document.createElement("span");
        etiqueta.className = "paginacion__etiqueta";
        etiqueta.textContent = etiquetaTexto;
        /*
            El texto visible es decorativo (aparece recién
            al hacer hover/focus, ver galeria.css): el
            nombre accesible real ya lo lleva el <button>
            vía aria-label, así que este <span> no debe
            volver a anunciarse.
        */
        etiqueta.setAttribute("aria-hidden", "true");

        li.append(boton, etiqueta);

        return { li, boton, etiqueta };

    }


    /*
        Nombre a mostrar para el dot del slot "indice" del
        bloque de fichas, según el order VIGENTE — no el
        índice crudo del GeoJSON. "getOrder()[indice]" es el
        id real (índice en "elementos") del elemento que hoy
        ocupa ese slot en el carrusel; mismo contrato que ya
        usa galeria-revelado.js ("cones[order[posIndex]]") y
        que arma galeria-reordenar.js. Sin "getOrder" (nadie
        lo pasó al construir el controller) se cae al orden
        crudo, para no romper si algún consumidor viejo no
        lo provee todavía.
    */
    function etiquetaParaSlot(indice) {

        const id =
            getOrder ? getOrder()[indice] : indice;

        const elemento = elementos[id];

        return (
            elemento && elemento.nombre
        ) || `Ficha ${indice + 1}`;

    }


    /*
        Vuelve a escribir aria-label + texto visible de
        TODOS los dots de ficha según el order vigente. Se
        llama desde update() (ver más abajo) sólo cuando la
        firma del order cambió de verdad respecto de la
        última vez — no reconstruye el DOM (los <li>/<button>
        siguen siendo los mismos, sólo cambia su rótulo), así
        que es seguro llamarla con la frecuencia que haga
        falta sin costo de layout.
    */
    function refrescarEtiquetasFichas() {

        for (const punto of puntos) {

            if (punto.tipo !== "ficha") continue;

            const texto =
                etiquetaParaSlot(punto.indice);

            punto.boton.setAttribute("aria-label", texto);
            punto.etiqueta.textContent = texto;

        }

    }


    /*
        Arma el rail completo UNA vez, al iniciar. La
        cantidad de fichas es fija durante toda la vida de
        la página (viene del GeoJSON cargado al arrancar,
        no cambia con el reordenamiento de #gui — ordenar
        solo cambia el ORDEN en el que aparecen las fichas
        en el carrusel, no cuántas hay), así que no hace
        falta reconstruir el rail en cada updateScrollHeight().
    */
    function construir() {

        contenedor.innerHTML = "";

        const lista = document.createElement("ol");
        lista.className = "paginacion__lista";
        listaEl = lista;

        /*
            El blob se arma acá pero se PREPENDE recién al
            final, después de que los <li> ya estén todos
            adentro (ver más abajo) — así queda como primer
            hijo en el DOM sin depender del orden en que se
            llama a "lista.appendChild" adentro de este
            mismo bucle.
        */
        blobEl = document.createElement("div");
        blobEl.className = "paginacion__blob";
        blobEl.setAttribute("aria-hidden", "true");

        const blobNucleo = document.createElement("div");
        blobNucleo.className = "paginacion__blob-nucleo";
        blobEl.appendChild(blobNucleo);

        FASES_CON_DOT.forEach(nombre => {

            const { li, boton } = crearItem(
                ETIQUETAS_FASES_FIJAS[nombre]
            );

            li.dataset.fase = nombre;
            boton.addEventListener("click", () => irAFase(nombre));

            lista.appendChild(li);
            puntos.push({ tipo: "fase", nombre, boton });

        });

        elementos.forEach((_elemento, indice) => {

            /*
                Etiqueta inicial: el elemento que ocupa ESTE
                slot en el order vigente al construir el rail
                (normalmente el orden crudo del GeoJSON,
                todavía sin reordenar). Se recalcula de
                verdad en refrescarEtiquetasFichas() cada vez
                que el order cambia — ver esa función.
            */
            const { li, boton, etiqueta } = crearItem(
                etiquetaParaSlot(indice)
            );

            li.className += " paginacion__item--ficha";
            /*
                Marca solo la primera ficha: sirve en CSS
                para separar visualmente el bloque de
                fichas del de las 4 fases fijas (una
                rayita/gap extra), sin tener que contar
                hijos con :nth-child a mano.
            */
            if (indice === 0) {
                li.classList.add("paginacion__item--primera-ficha");
            }

            boton.addEventListener("click", () => irAFicha(indice));

            lista.appendChild(li);
            puntos.push({ tipo: "ficha", indice, boton, etiqueta });

        });

        /*
            Prepend, no append: así pinta DEBAJO de todos
            los puntos por simple orden en el DOM (ver el
            comentario de ".paginacion__blob" en
            galeria.css), sin tener que tocar z-index.
        */
        lista.prepend(blobEl);

        contenedor.appendChild(lista);

    }


    /*
        scrollY en el que ARRANCA la fase fija "nombre"
        (t=0 de esa fase): suma el ancho de todas las
        fases fijas anteriores en ORDEN. Si "nombre" no
        está en FASES_FIJAS (o sea, se la llama con
        "fichas"), el loop nunca hace match y devuelve la
        suma de las 4 fijas completas — que es exactamente
        el arranque del bloque de fichas. No hace falta un
        caso aparte para eso.
    */
    function inicioDeFase(budget, nombre) {

        let acumulado = 0;

        for (const fase of FASES_FIJAS) {

            if (fase === nombre) return acumulado;
            acumulado += budget[fase];

        }

        return acumulado;

    }


    /*
        scrollY EXACTO al que aterriza la fase fija
        "nombre" — misma cuenta que ya usaba irAFase()
        directo, ahora extraída porque medirAnclas() (más
        abajo) también la necesita: es la MISMA fórmula la
        que decide a dónde saltar al clickear el dot Y qué
        scrollY cuenta como "asentado" para el blob (ver el
        comentario de cabecera del archivo).
    */
    function pxAterrizajeFase(budget, nombre) {

        const tAterrizaje = T_ATERRIZAJE_FASE[nombre] ?? 0;

        return (
            inicioDeFase(budget, nombre) +
            tAterrizaje * budget[nombre]
        );

    }


    function prefiereMenosMovimiento() {

        return window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches;

    }


    function irA(px) {

        window.scrollTo({
            top: px,
            behavior: prefiereMenosMovimiento() ? "auto" : "smooth"
        });

    }


    function irAFase(nombre) {

        irA(
            pxAterrizajeFase(
                phaseController.getScrollBudget(),
                nombre
            )
        );

    }


    /*
        "huecosReales": mismo nombre y mismo cálculo que ya
        usa galeria-carrusel.js — cantidad de TRAMOS de
        rotación, uno por cada hueco real entre dos
        elementos consecutivos (n-1, nunca 0 aunque haya un
        solo elemento). tParaFicha() lo necesita para
        repartir "rotateT" en la misma cantidad de pasos que
        usa el carrusel real — usar "elementos.length" en su
        lugar (el bug original) los corre a todos un paso.
    */
    const huecosReales =
        Math.max(1, elementos.length - 1);

    const cfgCarousel =
        config.carousel;


    /*
        scrollY EXACTO al que aterriza la ficha "indice" —
        misma cuenta que ya usaba irAFicha() directo, ahora
        extraída porque medirAnclas() también la necesita
        (mismo motivo que pxAterrizajeFase() más arriba).
        "indice / huecosReales" es el límite EXACTO de tramo
        que ya usa pasoConDescanso() como frontera entre dos
        pasos (ver galeria-carrusel-descanso.js): en ese
        punto preciso, la meseta final del tramo anterior y
        la meseta inicial del tramo siguiente coinciden en
        el MISMO valor objetivo (el propio slot "indice"
        centrado) — cae en pleno centro de la ventana de
        descanso de ese slot, no en su borde.
    */
    function tParaFicha(indice) {

        const indiceClamp =
            Math.min(huecosReales, Math.max(0, indice));

        const rotateT =
            indiceClamp / huecosReales;

        return (
            cfgCarousel.formSpan +
            rotateT * (1 - cfgCarousel.formSpan)
        );

    }


    /*
        FIX (bug reportado: "clickeo el último dot y el mapa
        ve en otro lado... ya ocurrió el pin que debía ver"):
        "tParaFicha(huecosReales)" (el último índice) da
        rotateT=1 EXACTO — el único caso entre todos los
        dots donde el aterrizaje coincide con el límite
        absoluto del recorrido ("budget.total"), no solo el
        límite de un tramo interno. getPhase() (ver
        galeria-fases.js) usa "y < acumulado + ancho"
        estricto: en CUALQUIER frontera interna, aterrizar
        justo en el límite ya devuelve la fase SIGUIENTE en
        t=0 (consistente, documentado ahí) — pero acá no hay
        fase siguiente dentro del presupuesto: cae al
        sentinel "final", la escena se LIBERA (ver
        ".liberada" en galeria.css) apenas se termina el
        scroll, así que el mapa/carrusel ya no están
        recibiendo "fichas" con el último elemento
        centrado — quedan en cualquier otro estado, de ahí
        "ya ocurrió, se pasó de largo".

        Se recorta 1px por debajo del final absoluto — un
        margen imperceptible dentro de la meseta de descanso
        del último elemento (que sigue teniendo largo real en
        píxeles de scroll, ver pxMesetaFicha() más abajo),
        pero suficiente para que "y" siga siendo
        ESTRICTAMENTE menor que el total y getPhase() la seta
        adentro de "fichas" en vez de "final".
    */
    function pxAterrizajeFicha(budget, indice) {

        const px =
            inicioDeFase(budget, "fichas") +
            tParaFicha(indice) * budget.fichas;

        return Math.min(px, budget.total - 1);

    }


    /*
        Ancho de "rotateT" que ocupa CADA tramo entre dos
        elementos consecutivos y fracción de ESE ancho que
        es meseta quieta — mismas dos cantidades, mismos
        nombres, que ya usa indiceContinuo()/pasoConDescanso()
        en galeria-carrusel-descanso.js (mitadDescanso =
        descansoClamp/2, con el mismo clamp a [0, 0.9] que
        esas dos funciones) para decidir cuándo el CONO real
        deja de moverse y descansa en foco. Se reusan acá,
        literalmente los mismos números, para que el blob se
        vea "asentado" en la MISMA ventana en la que el cono
        real ya está quieto — ni un frame antes ni después,
        en vez de una ventana propia inventada.
    */
    const anchoTramoRotate = 1 / huecosReales;

    const mitadDescanso =
        Math.min(0.9, Math.max(0, cfgCarousel.dwellFraction ?? 0.5)) / 2;


    /*
        Ventana [tDesde, tHasta] (en "t" GLOBAL de la fase
        "fichas", 0..1 — mismo valor que ya recibe update()
        acá abajo) dentro de la cual la ficha "indice" cuenta
        como "asentada": ni el punto es un instante único, ni
        se inventa un ancho — se DEDUCE de mitadDescanso/
        anchoTramoRotate de arriba, invirtiendo la misma
        partición paso/localU que ya usa indiceContinuo() (la
        meseta de un slot son las DOS mitades finales de los
        tramos que lo tocan a cada lado — ver "MESETA DE
        DESCANSO" en galeria-carrusel-descanso.js).

        Caso especial índice 0: la meseta real empieza en
        t=0, NO en tParaFicha(0) — durante todo el tramo
        "formar" (t GLOBAL < cfgCarousel.formSpan, antes de
        que "rotateT" siquiera arranque) el círculo se está
        cerrando y "phi" ya vale 0 fijo, o sea el slot 0 YA
        está en foco desde el instante mismo en que arranca
        la fase "fichas" (ver el mismo comentario de cabecera
        en ese archivo) — no hace falta esperar a que
        "rotateT" llegue a su propia media meseta para que
        cuente como asentado.
    */
    function bordesMesetaFicha(indice) {

        const indiceClamp =
            Math.min(huecosReales, Math.max(0, indice));

        const centroRotate =
            indiceClamp * anchoTramoRotate;

        const rotateHasta =
            indiceClamp >= huecosReales
                ? 1
                : centroRotate + mitadDescanso * anchoTramoRotate;

        const tHasta =
            cfgCarousel.formSpan +
            rotateHasta * (1 - cfgCarousel.formSpan);

        if (indiceClamp === 0) {

            return [0, tHasta];

        }

        const rotateDesde =
            centroRotate - mitadDescanso * anchoTramoRotate;

        const tDesde =
            cfgCarousel.formSpan +
            rotateDesde * (1 - cfgCarousel.formSpan);

        return [tDesde, tHasta];

    }


    function pxMesetaFicha(budget, indice) {

        const inicioFichas = inicioDeFase(budget, "fichas");
        const [tDesde, tHasta] = bordesMesetaFicha(indice);

        return [
            inicioFichas + tDesde * budget.fichas,
            inicioFichas + tHasta * budget.fichas
        ];

    }


    function irAFicha(indice) {

        irA(
            pxAterrizajeFicha(
                phaseController.getScrollBudget(),
                indice
            )
        );

    }


    /*
        Único lugar que lee layout (getBoundingClientRect)
        de todo el módulo, y solo corre cuando update()
        detecta que el punto activo cambió — nunca en cada
        frame. Coordenadas relativas al propio borde de
        "listaEl" (no al viewport), restando su propio
        getBoundingClientRect().top: así el blob se ubica
        con transforms en píxeles LOCALES al rail, sin
        importar dónde esté la lista en la ventana.

    /*
        Único lugar del módulo que lee layout
        (getBoundingClientRect) — y solo corre acá, UNA vez
        (al construir el rail) y de nuevo en cada resize
        (ver el listener al final del archivo), nunca en
        cada frame: mismo cuidado por no forzar layout de
        más que ya documenta galeria-scroll.js para
        window.scrollY.

        Para cada punto del rail cachea lo que
        update()/moverBlob() van a necesitar en cada frame
        sin volver a tocar el DOM ni el layout:

          - "y": su centro vertical en píxeles LOCALES al
            rail (relativo al borde de "listaEl", no al
            viewport) — de dónde sale la posición del blob.

          - "px": el scrollY EXACTO al que ATERRIZA ese
            punto — la MISMA cuenta que ya usan irAFase()/
            irAFicha() para saltar al clickear (ver
            pxAterrizajeFase()/pxAterrizajeFicha() más
            arriba). Es lo que permite comparar "dónde estoy
            en scroll real" contra "dónde aterriza cada dot"
            sin adivinar.

          - "mesetaDesdePx"/"mesetaHastaPx": el RANGO dentro
            del cual el punto cuenta como "asentado" — no
            solo su "px" exacto (pedido: "no tendría que
            verse en su lugar hasta que esté en el punto
            exacto... había una lógica de descanso"). Para
            fases fijas (sin lógica de descanso propia)
            queda de ancho CERO, igual a "px": se comportan
            igual que antes. Para fichas, se mide con
            pxMesetaFicha() — la MISMA fórmula de meseta que
            ya usa el carrusel real (ver el comentario junto
            a "anchoTramoRotate" más arriba).
    */
    function medirAnclas() {

        if (!listaEl) return;

        const budget = phaseController.getScrollBudget();
        const listaRect = listaEl.getBoundingClientRect();

        for (const punto of puntos) {

            const dotRect = punto.boton.getBoundingClientRect();

            punto.y =
                dotRect.top + dotRect.height / 2 - listaRect.top;

            if (punto.tipo === "fase") {

                punto.px = pxAterrizajeFase(budget, punto.nombre);
                punto.mesetaDesdePx = punto.px;
                punto.mesetaHastaPx = punto.px;

            } else {

                punto.px = pxAterrizajeFicha(budget, punto.indice);

                const [desde, hasta] =
                    pxMesetaFicha(budget, punto.indice);

                punto.mesetaDesdePx = desde;
                punto.mesetaHastaPx = hasta;

            }

        }

    }


    /*
        scrollY real correspondiente al "phase"/"t" que ya
        resolvió tick() este frame — mismo criterio que
        inicioDeFase() (suma presupuesto de fases previas)
        más el avance "t" DENTRO de la fase vigente. Para
        "final" no hay budget[fase] propio (es lo que queda
        DESPUÉS de agotar "fichas", ver getPhase() en
        galeria-fases.js): equivale al total del recorrido.
    */
    function pxActual(budget, phase, t) {

        if (phase === "final") return budget.total;

        return (
            inicioDeFase(budget, phase) +
            t * (budget[phase] ?? 0)
        );

    }


    /*
        Efecto "liquid dot" (ver el comentario junto a
        ANCHO_BLOB más arriba): el blob se ubica por
        INTERPOLACIÓN entre las dos anclas vecinas "A" y "B"
        que enmarcan el scrollY real ("frac" 0..1: 0 = exacto
        sobre A, 1 = exacto sobre B). No hay más un "punto
        activo" discreto que dispare el movimiento — esta
        función corre todos los frames (ya no hace falta
        cuidar de llamarla solo cuando algo "cambió": es
        pura aritmética sobre valores ya cacheados por
        medirAnclas(), sin tocar el DOM salvo para escribir
        el propio estilo del blob).

        Redondo cuando frac es 0 o 1 (exacto sobre una
        ancla), estirado como pastilla en el medio — máximo
        en frac=0.5, el punto más lejos posible de CUALQUIER
        aterrizaje exacto. sin(frac * PI) da justo esa forma
        (0 en los extremos, 1 en el medio) sin un if/else
        por tramo.
    */
    function moverBlob(A, B, frac) {

        if (!blobEl) return;

        if (!A) {

            blobEl.style.opacity = "0";
            return;

        }

        const y = A.y + (B.y - A.y) * frac;

        const distanciaAnclas = Math.abs(B.y - A.y);
        const estiramiento =
            Math.sin(frac * Math.PI) * distanciaAnclas;
        const altura = ANCHO_BLOB + estiramiento;

        if (primerMovimientoBlob) {

            /*
                Sin transición esta única vez: si no, el
                blob "viajaría" visiblemente desde su
                posición por defecto en CSS (top:0) hasta
                acá apenas carga la página.
            */
            blobEl.style.transition = "none";
            blobEl.style.opacity = "1";
            blobEl.style.height = `${altura}px`;
            blobEl.style.transform =
                `translate(-50%, ${y}px) translateY(-50%)`;

            /*
                Fuerza el layout con la transición todavía
                apagada antes de reactivarla (leyendo
                offsetHeight): sin este paso, el navegador
                podría coalescer el cambio de "transition" y
                el de "transform"/"height" en el mismo frame
                y animar igual el primer posicionamiento.
            */
            void blobEl.offsetHeight;
            blobEl.style.transition = "";

            primerMovimientoBlob = false;
            return;

        }

        /*
            Sin suavizado si el visitante prefiere menos
            movimiento: el blob sigue el scroll 1:1, sin el
            "arrastre" elástico de la transición corta (ver
            DURACION_SEGUIMIENTO_MS más arriba).
        */
        blobEl.style.transition = prefiereMenosMovimiento()
            ? "none"
            : `transform ${DURACION_SEGUIMIENTO_MS}ms ease-out, ` +
              `height ${DURACION_SEGUIMIENTO_MS}ms ease-out`;

        blobEl.style.opacity = "1";
        blobEl.style.height = `${altura}px`;
        blobEl.style.transform =
            `translate(-50%, ${y}px) translateY(-50%)`;

    }


    /*
        Recibe "phase"/"t" ya calculados por tick() en
        galeria.js (que llama a phases.getPhase(now) UNA
        vez al arrancar el frame y reusa el resultado para
        todas las ramas de la escena — ver ese archivo).
        No se vuelve a llamar getPhase() acá adentro: sería
        repetir el mismo loop sobre ORDEN_FASES que tick()
        ya resolvió para este frame, sin ganar nada (la
        lectura de scroll ya está cacheada por
        galeria-scroll.js de cualquier forma, pero no hace
        falta ni ese costo mínimo dos veces).
    */
    function update(phase, t) {

        if (getOrder) {

            const firmaActual =
                getOrder().join(",");

            if (firmaActual !== firmaOrdenEtiquetada) {

                refrescarEtiquetasFichas();
                firmaOrdenEtiquetada = firmaActual;

            }

        }

        if (!listaEl || puntos.length === 0) return;

        const budget = phaseController.getScrollBudget();
        const px = pxActual(budget, phase, t);

        /*
            "puntos" ya está en orden real de scroll (fases
            fijas con dot, en orden, seguidas de las fichas
            en orden — ver construir()), y cada "px" cacheado
            por medirAnclas() crece monótonamente en ese
            mismo orden: alcanza con un findIndex lineal (la
            cantidad de dots es chica, no hace falta buscar
            binario) para encontrar el primer punto cuyo
            aterrizaje ya pasamos.
        */
        const indiceSiguiente =
            puntos.findIndex(p => p.px >= px);

        let A;
        let B;
        let frac;

        if (indiceSiguiente === -1) {

            // Pasamos el último aterrizaje: queda asentado ahí (ver el pedido de que no desaparezca).
            A = B = puntos[puntos.length - 1];
            frac = 0;

        } else if (indiceSiguiente === 0) {

            // Todavía no llegamos ni al primer aterrizaje (scrollY = 0 debería caer justo acá, frac 0).
            A = B = puntos[0];
            frac = 0;

        } else {

            B = puntos[indiceSiguiente];
            A = puntos[indiceSiguiente - 1];

            /*
                Antes de comparar contra el punto medio,
                primero se chequea si "px" ya cayó DENTRO de
                la meseta de alguno de los dos vecinos (ver
                medirAnclas() para de dónde sale ese rango) —
                en ese caso el blob queda asentado del todo
                en ese vecino (frac 0 o 1, colapsando A/B al
                mismo punto, mismo camino que ya usa
                moverBlob() para el estado "en reposo"), en
                vez de seguir interpolando hacia el otro.
                Para fases fijas la meseta es de ancho cero
                (mesetaDesdePx === mesetaHastaPx === px): se
                comportan exactamente igual que antes, un
                único instante exacto.
            */
            if (px <= A.mesetaHastaPx) {

                B = A;
                frac = 0;

            } else if (px >= B.mesetaDesdePx) {

                A = B;
                frac = 0;

            } else {

                const rango = B.mesetaDesdePx - A.mesetaHastaPx;
                frac =
                    rango > 0
                        ? (px - A.mesetaHastaPx) / rango
                        : 0;

            }

        }

        moverBlob(A, B, frac);

        /*
            El dot que se marca "activo" (anillo + escala,
            ver ".paginacion__dot--activo" en galeria.css) es
            el ancla más cercana — no necesariamente aquel en
            el que el blob está asentado del todo, pero sí el
            que tiene sentido resaltar como "referencia más
            próxima" mientras el blob viaja entre los dos.
        */
        const activo = frac < 0.5 ? A : B;

        for (const punto of puntos) {

            punto.boton.classList.toggle(
                "paginacion__dot--activo",
                punto === activo
            );

        }

    }


    construir();
    medirAnclas();

    window.addEventListener("resize", medirAnclas);

    return { update, refrescarEtiquetasFichas };

}
