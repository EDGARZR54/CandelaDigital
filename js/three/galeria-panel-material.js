/* ==================================================
   galeria-panel-material.js

   Panel de controles (droplist propio + switch + slider
   nativo, mismas clases ".ficha__droplist"/".ficha__switch"/
   ".ficha__slider" que el resto de la ficha) GLOBAL, no
   atado a ningún elemento en particular: tipo de material
   (sólido / estado / normales / ninguno) y si se
   superpone la malla, con su densidad, aplicado a TODOS
   los elementos de la fila a la vez.

   "ninguno": no es un material propio (no hay
   "MeshNinguno" en Three.js) — es la malla sólida
   OCULTA (malla.visible = false) + el overlay de malla,
   si "Mostrar malla" está prendido (si no, no se ve
   nada) — mismo criterio que visor-geometrias.html. Junto
   con el switch, permite pedir "sólo alambre/malla, sin
   material sólido debajo".

   OVERLAY DE MALLA: se apoya en
   galeria-malla-cuadricula.js, que detecta la cuadrícula
   UV paramétrica real de la geometría (si la hay) y arma
   sólo las isocurvas U/V que correspondan según la
   "densidad" elegida — mismo criterio, mismo código en
   espíritu, que visor-geometrias.html. No es un
   WireframeGeometry íntegro (una línea por cada arista de
   cada triángulo real, sin importar la resolución del
   generador), que resulta ruidoso en superficies con
   muchos triángulos. Si la geometría no tiene cuadrícula
   UV detectable (generador sin UVs), ese módulo cae solo
   de vuelta al wireframe íntegro como red de seguridad —
   nunca una opción elegible desde acá.

   El panel no es un widget lil-gui: el colapso/expandido
   de la sección "Opciones de visualización" lo resuelve el
   panel derecho por su cuenta (ver
   galeria-panel-derecho-secciones.js), así que un segundo
   panel-adentro-del-panel, con su propia tipografía en vez
   de la del sitio, sobra. Este archivo solo cablea
   listeners nativos sobre el HTML fijo de
   "#panel-material" (ver galeria.html); toda la lógica de
   materiales de Three.js de acá abajo (construirMaterial,
   actualizarMaterialDeGrupo) es independiente de ese
   cableado.

   A diferencia de galeria-panel-parametros.js (la
   carpeta "Forma", que sí depende de cuál elemento
   está enfocado en la fase C), este panel se crea una
   sola vez al arrancar la página y queda visible
   desde la fase A — porque la geometría ya se ve
   desde el principio, así que tiene sentido poder
   cambiar su material desde ahí también.

   Dos tipos de color en juego (no confundir):

   - "solido"  → colores del TEMA del sitio (mismo
     criterio que js/fondo-3d.js: --color-texto /
     --color-primario según data-tema, frontal y
     trasera invertidas), UNIFORMES para todos los
     elementos.
   - "estado"  → color por estado de conservación de
     CADA edificio (ESTADO_COLOR en
     galeria-config.js), ya resuelto por elemento y
     guardado en group.userData.color por
     galeria-escena.js. No cambia con el tema — es la
     vista "analítica" opcional.

   Reutiliza color/matCfg/mallas que
   galeria-escena.js ya guardó en cada
   group.userData (ver construirElemento3D).

   EXPONE "actualizarAristasDeGrupo(group)" en su valor de
   retorno: lo usa galeria-panel-parametros.js para
   mantener el overlay de malla sincronizado cuando
   reconstruye la geometría de un elemento (inyectado en su
   construcción, ver galeria.js — mismo patrón "inyectar,
   no importar" que onGeometriaReconstruida).
================================================== */

import * as THREE from 'three';
import {
    extraerCuadriculaUV,
    construirGeometriaAristas
} from "./galeria-malla-cuadricula.js";


/*
    Opacidad del overlay de malla según haya o no
    superficie sólida debajo — mismos dos valores/mismo
    criterio que visor-geometrias.html: sutil como
    referencia ENCIMA de un material sólido/normales, pero
    opaco cuando es lo ÚNICO visible (tipo "ninguno" +
    "Mostrar malla" prendido) — si no, con 0.22 de opacidad
    y nada debajo, la pieza se vería casi transparente en
    vez de funcionar como un alambre real.

    Son la opacidad FINAL del overlay, no una base a
    escalar: la fase de fichas no anima opacidad (ver
    galeria-carrusel.js/galeria-revelado.js), así que nadie
    los reescala cuadro a cuadro — ver
    actualizarAristasVisualDeGrupo.
*/
const OPACIDAD_ARISTAS_OVERLAY = 0.22;
const OPACIDAD_ARISTAS_SIN_SUPERFICIE = 0.9;


/*
    DROPLIST EDITORIAL — ocupa el lugar del <select> nativo
    de "Tipo de material" (ver ".ficha__droplist" en
    galeria.css para el porqué: tipografía inconsistente
    entre navegadores + parpadeo blanco al abrir en modo
    oscuro, ambos problemas de un popup que dibuja el
    navegador, no este CSS).

    Envuelve "#ficha-material-tipo" (el <ul role="listbox">)
    para que se comporte como un <select>: expone ".value"
    (string) y dispara un Event("change") real cada vez que
    cambia, así el resto de este archivo (estado.tipo, el
    addEventListener("change", ...) de más abajo) trabaja
    contra la misma interfaz que con un control nativo.

    Devuelve el mismo <ul> recibido (con ".value" ya
    agregado), o null si no existe — mismo criterio de guard
    que el resto del archivo.
*/
function crearDroplist(lista) {

    if (!lista) return null;

    const contenedor = lista.closest(".ficha__droplist");
    const boton = contenedor.querySelector(".ficha__droplist-boton");
    const valorSpan = boton.querySelector("[data-droplist-valor]");
    const opciones = Array.from(
        lista.querySelectorAll('[role="option"]')
    );

    opciones.forEach(li => { li.tabIndex = -1; });

    const inicial =
        opciones.find(li => li.getAttribute("aria-selected") === "true")
        || opciones[0];

    lista.value = inicial ? inicial.dataset.value : "";
    if (inicial) valorSpan.textContent = inicial.textContent.trim();

    /*
        La lista cuelga directo de <body>, fuera de
        "#panel-material": adentro quedaría atrapada por el
        "overflow:hidden" de ".ficha__seccion-contenido-inner"
        (necesario para la animación de colapso) y por el
        scroll de ".ficha__panel-cuerpo" — cualquiera de los
        dos la recorta apenas se acerca al borde. En <body>
        con "position:fixed" calculada a mano (ver
        posicionar()), nada la recorta y nada la mueve sola.

        Los ids/aria-* siguen funcionando igual sin importar
        dónde cuelgue en el DOM.
    */
    document.body.appendChild(lista);
    lista.style.position = "fixed";

    /*
        Ancla la lista al botón en coordenadas de viewport.
        Si no entra debajo (botón pegado al fondo de la
        ventana), la abre hacia arriba en su lugar — mismo
        criterio que cualquier <select> nativo.
    */
    function posicionar() {

        const rectBoton = boton.getBoundingClientRect();
        const margen = 6;

        lista.style.left = rectBoton.left + "px";
        lista.style.width = rectBoton.width + "px";

        const alturaLista = lista.offsetHeight;
        const espacioAbajo = window.innerHeight - rectBoton.bottom;
        const entraAbajo =
            espacioAbajo >= alturaLista + margen
            || rectBoton.top < alturaLista + margen;

        if (entraAbajo) {
            lista.style.bottom = "";
            lista.style.top = (rectBoton.bottom + margen) + "px";
        } else {
            lista.style.top = "";
            lista.style.bottom =
                (window.innerHeight - rectBoton.top + margen) + "px";
        }

    }

    function cerrar() {
        lista.hidden = true;
        boton.setAttribute("aria-expanded", "false");

        window.removeEventListener("scroll", posicionar, true);
        window.removeEventListener("resize", posicionar);
    }

    function abrir() {
        lista.hidden = false;
        posicionar();
        boton.setAttribute("aria-expanded", "true");

        /*
            "true" en el tercer argumento de scroll: captura
            el scroll de CUALQUIER ancestro (p. ej.
            ".ficha__panel-cuerpo"), no solo el de window —
            el scroll normal no burbujea.
        */
        window.addEventListener("scroll", posicionar, true);
        window.addEventListener("resize", posicionar);

        const activa =
            opciones.find(li => li.dataset.value === lista.value);

        /*
            "preventScroll": red de seguridad — enfocar una
            opción nunca debería mover la página ni ningún
            contenedor scrolleable por su cuenta.
        */
        (activa || opciones[0])?.focus({ preventScroll: true });
    }

    function elegir(li) {

        opciones.forEach(o =>
            o.setAttribute("aria-selected", String(o === li))
        );

        valorSpan.textContent = li.textContent.trim();

        if (lista.value !== li.dataset.value) {
            lista.value = li.dataset.value;
            lista.dispatchEvent(new Event("change"));
        }

        cerrar();
        boton.focus();

    }

    boton.addEventListener("click", () => {
        lista.hidden ? abrir() : cerrar();
    });

    opciones.forEach((li, indice) => {

        li.addEventListener("click", () => elegir(li));

        li.addEventListener("keydown", (evento) => {

            if (evento.key === "ArrowDown") {
                evento.preventDefault();
                (opciones[indice + 1] || opciones[0]).focus();
            } else if (evento.key === "ArrowUp") {
                evento.preventDefault();
                (opciones[indice - 1] || opciones[opciones.length - 1]).focus();
            } else if (evento.key === "Enter" || evento.key === " ") {
                evento.preventDefault();
                elegir(li);
            } else if (evento.key === "Escape") {
                evento.preventDefault();
                cerrar();
                boton.focus();
            } else if (evento.key === "Home") {
                evento.preventDefault();
                opciones[0].focus();
            } else if (evento.key === "End") {
                evento.preventDefault();
                opciones[opciones.length - 1].focus();
            }

        });

    });

    // Clic afuera del droplist: cierra, mismo criterio que un <select> nativo
    document.addEventListener("click", (evento) => {
        if (!lista.hidden && !contenedor.contains(evento.target)) cerrar();
    });

    return lista;

}


export function createMaterialPanel(container, cones) {

    /*
        Sin el contenedor (HTML desactualizado, o esta
        página todavía no lo tiene) no hay nada que
        cablear — mismo criterio de guard que el resto
        de los controladores de esta página. Igual se
        devuelve la misma forma de objeto que en el camino
        normal (ver "EXPONE" en la cabecera), con un
        actualizarAristasDeGrupo() no-op, para que
        galeria-panel-parametros.js pueda llamarlo sin
        chequear null cada vez — mismo criterio que el
        resto de los guards de esta página (p. ej.
        createCorteControles con contenedor ausente).
    */
    if (!container) return { actualizarAristasDeGrupo() {} };

    const selectTipo =
        crearDroplist(
            container.querySelector("#ficha-material-tipo")
        );

    const botonMostrarMalla =
        container.querySelector("#boton-mostrar-malla");

    const sliderDensidad =
        container.querySelector(
            "#ficha-material-densidad"
        );

    const spanDensidadValor =
        container.querySelector(
            "#ficha-material-densidad-valor"
        );

    /*
        FUENTE DE VERDAD DEL ESTADO POR DEFECTO: el HTML
        mismo (el "selected" del <option>, el
        "aria-checked" del switch, y el "value" del
        slider — ver "#panel-material" en galeria.html),
        mismo criterio que ya usan
        galeria-panel-derecho-secciones.js y
        galeria-corte-controles.js: este módulo LEE esos
        valores al construirse en vez de traer su propio
        default hardcodeado en JS, así el default no
        queda duplicado (y potencialmente desincronizado)
        en dos archivos distintos.
    */
    const estado = {

        tipo:
            selectTipo ? selectTipo.value : "normales",

        mostrarMalla:
            botonMostrarMalla
                ? botonMostrarMalla.getAttribute(
                      "aria-checked"
                  ) === "true"
                : false,

        densidad:
            sliderDensidad
                ? Number(sliderDensidad.value)
                : 10

    };


    /*
        Lectura de variables CSS + colores de tema,
        MISMO criterio que colorRellenoTemaFrontal() /
        colorRellenoTemaTrasera() / esModoOscuro() de
        js/fondo-3d.js — duplicado a propósito acá
        (mismo patrón que leerColorCSS() repetido en
        fondo-3d.js y galeria-escena.js): cada módulo
        three/ es autosuficiente y no depende de los
        demás.
    */
    function leerColorCSS(variable, alternativo) {

        const valor =
            getComputedStyle(document.documentElement)
                .getPropertyValue(variable)
                .trim();

        return new THREE.Color(valor || alternativo);

    }

    function esModoOscuro() {

        const atributo =
            document.documentElement
                .getAttribute('data-tema');

        if (atributo === 'oscuro') return true;
        if (atributo === 'claro') return false;

        return window.matchMedia(
            '(prefers-color-scheme: dark)'
        ).matches;

    }

    function colorRellenoTemaFrontal() {

        return esModoOscuro()
            ? leerColorCSS('--color-texto', '#EEF1F3')
            : leerColorCSS('--color-primario', '#964A3D');

    }

    function colorRellenoTemaTrasera() {

        // Invertido respecto a la frontal, para que
        // ambas caras se distingan igual que en
        // fondo-3d.js.
        return esModoOscuro()
            ? leerColorCSS('--color-primario', '#964A3D')
            : leerColorCSS('--color-texto', '#151515');

    }


    /*
        Resuelve qué color usa cada cara según el tipo
        de material elegido:

        - "solido": color de tema, uniforme, distinto
          en frontal/trasera. Con una sola malla
          DoubleSide no lo decide "qué material se le puso
          a qué mesh" (ver construirMaterialSolido más
          abajo): ambos colores se calculan siempre juntos
          y es el propio shader, en tiempo de render, el
          que elige uno u otro según gl_FrontFacing.
        - "estado"/"normales"/"ninguno": el color por
          estado de conservación que ya trae el grupo
          (colorEstado), igual en ambas caras. En
          "normales" y "ninguno" ese color se calcula igual
          pero construirMaterial() ni lo usa
          (MeshNormalMaterial no toma color, y en "ninguno"
          la malla queda oculta): no vale la pena un branch
          aparte sólo para evitar ese cálculo de más,
          barato.
    */
    function colorParaTipo(tipo, colorEstado) {

        if (tipo === "solido") return null; // ver construirMaterialSolido

        return colorEstado;

    }


    /*
        Material para el tipo "sólido": superficie
        MeshPhysicalMaterial (roughness/metalness/
        clearcoat) con un parche de shader (mismo mecanismo
        que floorMat en galeria-habitacion.js:
        onBeforeCompile sobre chunks de Three.js) que pisa
        el color base según gl_FrontFacing — así una ÚNICA
        malla DoubleSide muestra un color distinto en cada
        cara, que es lo único para lo que harían falta dos
        mallas (ver el comentario grande en armarGroup3D,
        galeria-escena.js). El resto del pipeline PBR
        (roughness map, clearcoat, luces, sombras) queda
        intacto: solo se pisa "diffuseColor.rgb".

        "color" del constructor queda en blanco (1,1,1):
        es solo el valor de arranque antes de compilar el
        shader la primera vez (un frame, a lo sumo, y sin
        contraste visible porque el override corre en el
        fragment shader de cada pixel) — el color real
        SIEMPRE sale de los uniforms.
    */
    function construirMaterialSolido(matCfg) {

        const colorFrontal = colorRellenoTemaFrontal();
        const colorTrasera = colorRellenoTemaTrasera();

        const material =
            new THREE.MeshPhysicalMaterial({
                color: 0xffffff,
                roughness: matCfg.roughness,
                metalness: matCfg.metalness,
                clearcoat: matCfg.clearcoat,
                clearcoatRoughness:
                    matCfg.clearcoatRoughness,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 1
            });

        material.onBeforeCompile = (shader) => {

            shader.uniforms.uColorFrontal =
                { value: colorFrontal };

            shader.uniforms.uColorTrasera =
                { value: colorTrasera };

            /*
                Referencia guardada para poder mutar estos
                uniforms más adelante (ver
                actualizarColoresTemaSolido() más abajo) sin
                tener que reconstruir el material entero —
                mismo objeto "shader" que three.js compila UNA
                vez por material; los uniforms viven ahí, no
                en la instancia de THREE.Material.
            */
            material.userData.shader = shader;

            shader.fragmentShader =
                shader.fragmentShader
                    .replace(
                        "#include <common>",
                        `#include <common>
                        uniform vec3 uColorFrontal;
                        uniform vec3 uColorTrasera;`
                    )
                    .replace(
                        "#include <color_fragment>",
                        `#include <color_fragment>
                        // gl_FrontFacing: true en la cara
                        // frontal según el winding de la
                        // geometría — mismo criterio de
                        // "cara" que distingue FrontSide
                        // de BackSide.
                        diffuseColor.rgb =
                            gl_FrontFacing
                                ? uColorFrontal
                                : uColorTrasera;`
                    );

        };

        return material;

    }


    /*
        Construye un material según "tipo"
        ('solido' | 'estado' | 'normales' | 'ninguno'),
        igual en espíritu a construirMaterial() de
        fondo-3d.js, reutilizando color/matCfg que
        galeria-escena.js ya guardó en
        group.userData (colorEstado = color por estado
        de conservación; se usa o no según el tipo,
        ver colorParaTipo). Siempre DoubleSide: cada
        elemento es una sola malla, no una frontal y otra
        trasera con "side" distinto (ver armarGroup3D,
        galeria-escena.js).
    */
    function construirMaterial(tipo, colorEstado, matCfg) {

        if (tipo === "solido") {

            return construirMaterialSolido(matCfg);

        }

        const color =
            colorParaTipo(tipo, colorEstado);

        switch (tipo) {

            case "normales":

                return new THREE.MeshNormalMaterial({
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 1
                });

            case "estado":
            case "ninguno":
                // "ninguno" no es un material propio: la
                // malla queda OCULTA (ver
                // actualizarMaterialDeGrupo), así que el
                // material en sí no importa — cae al mismo
                // que "estado" en vez de un branch aparte,
                // mismo criterio que visor-geometrias.html.
            default:

                return new THREE.MeshPhysicalMaterial({
                    color,
                    roughness: matCfg.roughness,
                    metalness: matCfg.metalness,
                    clearcoat: matCfg.clearcoat,
                    clearcoatRoughness:
                        matCfg.clearcoatRoughness,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 1
                });

        }

    }


    /*
        Reemplaza el material de la malla de UN grupo,
        conservando su opacidad actual (para no pegar un
        salto visual si el elemento está a mitad de un
        fundido de alguna fase cuando se cambia el tipo de
        material).
    */
    function actualizarMaterialDeGrupo(group) {

        const { color, matCfg } = group.userData;

        const [malla] =
            group.userData.mallas;

        const opacidadActual =
            malla.material.opacity;

        /*
            clippingPlanes también se preservan, mismo
            motivo que "opacidadActual" arriba — pero acá
            el costo de no hacerlo es más visible:
            galeria-corte.js asigna el corte activo directo
            sobre la instancia de material
            ("malla.material.clippingPlanes = planosArray",
            ver activar() en ese archivo), UNA sola vez al
            enfocar el elemento. Un material de reemplazo
            sin ese array nace sin ningún corte asignado, y
            el elemento en foco dejaría de cortarse hasta
            el próximo cambio de foco (el único otro
            momento en que algo reasigna clippingPlanes).

            Se copia el MISMO array (no un clone) a
            propósito: es el mismo objeto que
            sincronizarMundo() muta in-place cada frame en
            galeria-corte.js — si este grupo es el que
            "Corte" tiene activo ahora mismo, el corte
            sigue actualizándose solo cuadro a cuadro sin
            que este panel necesite saber nada de "Corte"
            (mismo desacople que ya vale para el resto del
            archivo).
        */
        const clipping =
            malla.material.clippingPlanes;

        malla.material.dispose();

        malla.material =
            construirMaterial(
                estado.tipo, color, matCfg
            );

        malla.material.opacity =
            opacidadActual;

        malla.material.clippingPlanes =
            clipping;

        /*
            "ninguno": la malla sólida queda OCULTA (no es
            un material transparente — directamente
            visible=false, más barato y sin los problemas
            de orden de dibujo de la transparencia real) —
            ver "ninguno" en la cabecera del archivo. Con
            cualquier otro tipo, visible de nuevo.
        */
        malla.visible = estado.tipo !== "ninguno";

        /*
            La opacidad/profundidad del overlay de malla
            dependen de si hay o no superficie sólida
            debajo (ver actualizarAristasVisualDeGrupo, más
            abajo) — si cambió el tipo, hay que refrescarlo
            acá también, no sólo cuando se toca el switch
            "Mostrar malla" o el slider de densidad.
        */
        actualizarAristasVisualDeGrupo(group);

    }


    function actualizarTodosLosMateriales() {

        cones.forEach(actualizarMaterialDeGrupo);

    }


    /*
        Alternativa liviana a actualizarTodosLosMateriales()
        para el ÚNICO caso en que un cambio de tema requiere
        tocar algo del tipo "sólido": los dos colores de
        relleno (frontal/trasera) son uniforms del shader ya
        compilado (ver "material.userData.shader" en
        construirMaterialSolido), así que alcanza con
        mutarlos in-place — ".copy()", no reasignar el
        Vector/Color, así el shader sigue usando la misma
        referencia — en vez de disponer y reconstruir un
        MeshPhysicalMaterial (+ volver a correr
        onBeforeCompile) para CADA elemento de la galería.
        Mismo resultado visual, sin ningún trabajo de shader.

        Si algún material todavía no compiló su shader por
        primera vez (userData.shader ausente — a lo sumo el
        primer frame de vida de ese material, ver el
        comentario en construirMaterialSolido), se lo salta:
        ya nace con los colores de tema correctos leídos en
        el momento de su construcción, no hay nada stale que
        corregir.
    */
    function actualizarColoresTemaSolido() {

        if (estado.tipo !== "solido") return;

        const colorFrontal = colorRellenoTemaFrontal();
        const colorTrasera = colorRellenoTemaTrasera();

        cones.forEach(group => {

            const [malla] =
                group.userData.mallas;

            const shader =
                malla.material.userData.shader;

            if (!shader) return;

            shader.uniforms.uColorFrontal.value
                .copy(colorFrontal);

            shader.uniforms.uColorTrasera.value
                .copy(colorTrasera);

        });

    }


    /*
        Overlay de aristas de UN grupo. Se guarda en
        group.userData.overlayMalla (no en una
        variable local de este módulo) para que
        galeria-panel-parametros.js pueda mantenerlo
        actualizado cuando reconstruye la geometría
        de ese mismo grupo por un cambio en la
        carpeta "Forma".

        CUELGA DE "pivote", NO DE "mallaFrontal": la
        jerarquía real es "group" (cono externo) →
        "pivote" (grupo intermedio, corrido a pivotX/pivotZ
        — ver posicionarPivote() en galeria-escena.js — y
        el que gira galeria-rotacion.js para el autorotado,
        vía pivote.rotation.y) →
        "mallaFrontal"/"mallaTrasera" (corridas de vuelta
        -pivotX/-pivotZ DENTRO de "pivote").

        El overlay tiene que ser HERMANO de las mallas, no
        hijo: con tipo de material "ninguno" este panel
        apaga "mallaFrontal.visible" para ocultar la
        superficie sólida (ver actualizarMaterialDeGrupo),
        y WebGLRenderer.projectObject() CORTA la recursión
        entera apenas encuentra "object.visible === false",
        SIN bajar a revisar a sus hijos. Colgado de la
        malla, apagar la superficie apagaría también el
        overlay sin que "overlay.visible" tuviera nada que
        ver, cuando "ninguno" debe ocultar sólo la
        superficie y "Mostrar malla" es el único que decide
        la malla.

        Colgado de "pivote", el overlay hereda igual la
        rotación del autorotado sin depender de
        "mallaFrontal.visible". El costo: como "pivote" no
        tiene el offset -pivotX/-pivotZ que SÍ tiene
        "mallaFrontal" (ver posicionarPivote()), esa
        position se sincroniza a mano —
        "overlay.position.copy(malla.position)" acá abajo,
        y de nuevo en reemplazarGeometriaAristas() cada vez
        que la geometría se reconstruye (que es cuando
        posicionarPivote() puede correr de nuevo con un
        pivotX/pivotZ distinto). Rotation/scale no hacen
        falta: "mallaFrontal" nunca tiene ninguna de las dos
        seteada (siempre identidad dentro de "pivote"), así
        que "overlay" tampoco las necesita.
    */
    function crearOverlayDeGrupo(group) {

        const [malla] =
            group.userData.mallas;

        const { pivote } = group.userData;

        const infoCuadricula =
            construirInfoCuadriculaDeGrupo(group);

        const overlay =
            new THREE.LineSegments(
                construirGeometriaAristas(
                    malla.geometry,
                    infoCuadricula,
                    estado.densidad
                ),
                new THREE.LineBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: OPACIDAD_ARISTAS_OVERLAY,
                    /*
                        Mismo par que visor-geometrias.html,
                        por el mismo motivo: sin esto, las
                        líneas del lado cercano a la cámara
                        escriben en el depth buffer y tapan
                        a las del lado lejano del mismo
                        objeto (se ve como si hubiera
                        backface culling en la malla, aunque
                        las líneas no tienen caras).
                        depthWrite:false hace que el overlay
                        no se oculte a sí mismo, mientras el
                        depthTest (que sí varía, ver
                        actualizarAristasVisualDeGrupo) sigue
                        activo para que con material sólido/
                        normales debajo el overlay se siga
                        ocultando correctamente detrás de esa
                        superficie cuando corresponde.
                    */
                    depthFunc: THREE.LessEqualDepth,
                    depthWrite: false
                })
            );

        overlay.position.copy(malla.position);

        /*
            Hereda el "clippingPlanes" VIGENTE de la malla
            sólida hermana — caso simétrico al fix de
            galeria-corte.js (activar()/desactivar() del
            corte, que a su vez propagan al overlay CUANDO
            YA EXISTE): acá cubrimos el orden inverso, el
            overlay recién nace DESPUÉS de que este elemento
            ya esté cortando (el visitante prende "Mostrar
            malla" con "Corte" ya activo). Sin esto, nacería
            sin cortar (clippingPlanes por defecto de
            THREE.Material) hasta el próximo cambio de foco.

            Se copia la REFERENCIA (no un clone): si en este
            momento el corte está activo para este elemento,
            es el mismo array con los mismos objetos Plane
            que corte.sincronizarMundo() muta in-place cada
            frame — el overlay queda sincronizado sin que
            este módulo necesite saber nada de "Corte". Si no
            hay corte activo, es simplemente el array vacío
            por defecto de la malla sólida.
        */
        overlay.material.clippingPlanes =
            malla.material.clippingPlanes;

        pivote.add(overlay);

        group.userData.overlayMalla = overlay;

    }



    /*
        Detecta (o vuelve a detectar) la cuadrícula UV de
        la geometría VIGENTE de "group" y la cachea en
        group.userData.infoCuadricula — evita repetir esta
        detección (más cara que construirGeometriaAristas:
        recorre todo uvAttr) en cada cambio de densidad,
        que no toca la geometría en sí, sólo cuántas
        isocurvas mostrar de la MISMA cuadrícula ya
        detectada. Se vuelve a llamar sólo cuando la
        geometría cambió de verdad (acá, al crear el
        overlay; y desde actualizarAristasDeGrupo, cuando
        galeria-panel-parametros.js reconstruye la pieza).
    */
    function construirInfoCuadriculaDeGrupo(group) {

        const [malla] =
            group.userData.mallas;

        const infoCuadricula =
            extraerCuadriculaUV(malla.geometry);

        group.userData.infoCuadricula = infoCuadricula;

        return infoCuadricula;

    }


    /*
        Reconstruye SÓLO la geometría de líneas del overlay
        ya existente de "group", reutilizando la
        infoCuadricula cacheada (ver arriba) — es lo que
        cambia cuando se mueve el slider de densidad (la
        cuadrícula detectada sigue siendo la misma, sólo
        cambia cuántas isocurvas de ella se muestran). No-op
        si el grupo todavía no tiene overlay (nunca se
        prendió "Mostrar malla" para él).

        TAMBIÉN resincroniza "overlay.position" contra
        "malla.position" (ver crearOverlayDeGrupo): un
        no-op barato si nada cambió (caso del slider de
        densidad, donde posicionarPivote() no corre), pero
        necesario cuando esto se llama desde
        actualizarAristasDeGrupo tras una reconstrucción de
        geometría real — posicionarPivote()
        (galeria-panel-parametros.js) puede haber movido
        mallaFrontal a un pivotX/pivotZ distinto, y
        "overlay" (colgado de "pivote", no de
        "mallaFrontal") no se entera solo.
    */
    function reemplazarGeometriaAristas(group) {

        const overlay = group.userData.overlayMalla;

        if (!overlay) return;

        const [malla] =
            group.userData.mallas;

        overlay.position.copy(malla.position);

        const geometriaVieja = overlay.geometry;

        overlay.geometry =
            construirGeometriaAristas(
                malla.geometry,
                group.userData.infoCuadricula,
                estado.densidad
            );

        geometriaVieja.dispose();

    }


    /*
        Aplica visibilidad/profundidad/opacidad del overlay
        de UN grupo según el estado GLOBAL vigente (tipo +
        mostrarMalla) — mismo criterio que
        actualizarAristasVisual() en visor-geometrias.html.

        "base" es directamente la opacidad final: la fase de
        fichas no anima opacidad (ver galeria-carrusel.js/
        galeria-revelado.js), así que no hace falta leer la
        opacidad de la malla ni guardar nada en userData
        para que otro código la reescale por frame.

        No-op si el grupo no tiene overlay todavía.
    */
    function actualizarAristasVisualDeGrupo(group) {

        const overlay = group.userData.overlayMalla;

        if (!overlay) return;

        const base =
            estado.tipo === "ninguno"
                ? OPACIDAD_ARISTAS_SIN_SUPERFICIE
                : OPACIDAD_ARISTAS_OVERLAY;

        overlay.material.opacity = base;

        overlay.visible = estado.mostrarMalla;

        overlay.material.depthTest =
            estado.tipo !== "ninguno";

    }


    /*
        PÚBLICA (ver el valor de retorno de
        createMaterialPanel, y "EXPONE" en la cabecera del
        archivo): la llama galeria-panel-parametros.js
        justo después de reconstruir la geometría de un
        elemento por un cambio en la carpeta "Forma" — sin
        esto, el overlay de malla seguiría mostrando la
        cuadrícula/wireframe de la forma ANTERIOR hasta el
        próximo toque de densidad o de "Mostrar malla".
        No-op si ese grupo no tiene overlay puesto (mismo
        guard que reemplazarGeometriaAristas).
    */
    function actualizarAristasDeGrupo(group) {

        if (!group.userData.overlayMalla) return;

        construirInfoCuadriculaDeGrupo(group);
        reemplazarGeometriaAristas(group);

    }


    function actualizarMallaDeTodos(mostrar) {

        cones.forEach(group => {

            if (mostrar && !group.userData.overlayMalla) {

                crearOverlayDeGrupo(group);

            }

            actualizarAristasVisualDeGrupo(group);

        });

    }


    /*
        Wiring nativo de los controles de
        "#panel-material". "change" (no "input") en el
        select: dispara recién cuando se confirma la opción
        elegida, no mientras se recorre la lista.
    */
    if (selectTipo) {

        selectTipo.addEventListener("change", () => {

            estado.tipo = selectTipo.value;
            actualizarTodosLosMateriales();

        });

    }

    if (botonMostrarMalla) {

        botonMostrarMalla.addEventListener("click", () => {

            estado.mostrarMalla = !estado.mostrarMalla;

            botonMostrarMalla.setAttribute(
                "aria-checked", String(estado.mostrarMalla)
            );

            actualizarMallaDeTodos(estado.mostrarMalla);

        });

    }

    if (sliderDensidad) {

        /*
            "input" (no "change"): mismo criterio que los
            sliders de "Corte"/"Geometría" — feedback en
            vivo mientras se arrastra, no sólo al soltar.
        */
        sliderDensidad.addEventListener("input", () => {

            estado.densidad = Number(sliderDensidad.value);

            if (spanDensidadValor) {

                spanDensidadValor.textContent =
                    String(estado.densidad);

            }

            /*
                Sólo reemplaza la geometría de líneas
                (reutiliza infoCuadricula cacheada) — no
                hace falta volver a detectar la cuadrícula,
                la densidad no cambia la geometría de la
                pieza, sólo cuántas isocurvas de ella se
                muestran.
            */
            cones.forEach(reemplazarGeometriaAristas);

        });

    }


    /*
        Reactividad al tema: solo interesa cuando el
        tipo activo es "solido" (colores del tema) — ese
        chequeo vive adentro de
        actualizarColoresTemaSolido(), que además de
        filtrar por tipo evita reconstruir materiales:
        muta los uniforms de color directo sobre el shader
        ya compilado de cada elemento (ver esa función más
        arriba). Mismo patrón que el MutationObserver de
        fondo-3d.js, pero acotado acá adentro — así este
        panel no depende de que galeria.js sepa que también
        tiene que avisarle a él (además de avisarle a
        actualizarColoresTema() de galeria-escena.js para
        fondo/mesa).
    */
    const observadorTema = new MutationObserver(() => {

        actualizarColoresTemaSolido();

    });

    observadorTema.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-tema']
    });


    /*
        Sincronización inicial: galeria-escena.js ya
        creó cada grupo con un material MeshPhysicalMaterial
        "placeholder" (color por estado de conservación,
        ver construirElemento3D) porque necesita *algo*
        que renderizar antes de que este panel exista.
        Como el tipo por defecto en el HTML es "normales"
        (ver el "selected" de "#ficha-material-tipo" en
        galeria.html), hay que aplicar ese tipo ahora
        mismo o la escena arrancaría mostrando colores de
        estado aunque el select diga "Normales".

        Mismo motivo aplica al overlay de malla: se crea/
        actualiza dentro de "actualizarMallaDeTodos" (uno
        por cono), así que además de llamarla desde el
        click del switch hay que llamarla una vez acá — si
        no, "estado.mostrarMalla" queda en true (leído del
        "aria-checked" del HTML, ver más arriba) pero sin
        ningún overlay real puesto en la escena.
    */
    actualizarTodosLosMateriales();
    actualizarMallaDeTodos(estado.mostrarMalla);

    return { actualizarAristasDeGrupo };

}
