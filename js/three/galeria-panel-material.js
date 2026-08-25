/* ==================================================
   galeria-panel-material.js

   Panel de controles NATIVO (select + switch + slider,
   mismas clases ".ficha__select"/".ficha__switch"/
   ".ficha__slider" que el resto de la ficha) GLOBAL, no
   atado a ningún elemento en particular: tipo de material
   (sólido / estado / normales / ninguno) y si se
   superpone la malla, con su densidad, aplicado a TODOS
   los elementos de la fila a la vez.

   "ninguno": no es un material propio (no hay
   "MeshNinguno" en Three.js) — es la malla sólida
   OCULTA (mallaFrontal/mallaTrasera.visible = false) +
   el overlay de malla, si "Mostrar malla" está prendido
   (si no, no se ve nada) — mismo criterio que
   visor-geometrias.html. Con esto, más el switch que ya
   existía, ahora se puede pedir "sólo alambre/malla, sin
   material sólido debajo".

   OVERLAY DE MALLA — YA NO ES WireframeGeometry ÍNTEGRO
   (una línea por cada arista de cada triángulo real, sin
   importar la resolución del generador — ruidoso en
   superficies con muchos triángulos): ahora se apoya en
   galeria-malla-cuadricula.js, que detecta la cuadrícula
   UV paramétrica real de la geometría (si la hay) y arma
   sólo las isocurvas U/V que correspondan según la
   "densidad" elegida — mismo criterio, mismo código en
   espíritu, que visor-geometrias.html. Si la geometría no
   tiene cuadrícula UV detectable (generador sin UVs), ese
   módulo cae solo de vuelta al wireframe íntegro como red
   de seguridad — nunca una opción elegible desde acá.

   YA NO ES lil-gui: vivía montado como un widget lil-
   gui completo (con su propia tipografía/bordes/
   sombra) adentro de la sección colapsable "Opciones
   de visualización" — pero el colapso/expandido de esa
   sección ya lo resuelve el panel derecho por su
   cuenta (ver galeria-panel-derecho-secciones.js), así
   que un segundo panel-adentro-del-panel, con su
   propia tipografía en vez de la del sitio, sobraba.
   Este archivo ahora solo cablea listeners nativos
   sobre el HTML fijo de "#panel-material" (ver
   galeria.html) — toda la lógica de materiales de
   Three.js de acá abajo (construirMaterial,
   actualizarMaterialDeGrupo) es la misma que cuando esto
   era lil-gui; el overlay de malla sí cambió de técnica,
   ver arriba.

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
   retorno — a diferencia de antes (no devolvía nada): lo
   usa galeria-panel-parametros.js para mantener el
   overlay de malla sincronizado cuando reconstruye la
   geometría de un elemento (inyectado en su construcción,
   ver galeria.js — mismo patrón "inyectar, no importar"
   que onGeometriaReconstruida).
================================================== */

import * as THREE from 'three';
import {
    extraerCuadriculaUV,
    construirGeometriaAristas
} from "./galeria-malla-cuadricula.js";


/*
    Opacidad BASE del overlay de malla según haya o no
    superficie sólida debajo — mismos dos valores/mismo
    criterio que visor-geometrias.html: sutil como
    referencia ENCIMA de un material sólido/normales, pero
    opaco cuando es lo ÚNICO visible (tipo "ninguno" +
    "Mostrar malla" prendido) — si no, con 0.22 de opacidad
    y nada debajo, la pieza se vería casi transparente en
    vez de funcionar como un alambre real.

    "BASE": la opacidad final que termina en pantalla no es
    ninguno de estos dos números tal cual — es éste,
    multiplicado cada frame por el fundido por distancia al
    foco (ver el proxy "group.material.opacity" en
    galeria-escena.js), igual que ya le pasa a la superficie
    sólida. Estos valores viven en overlay.userData.
    opacidadBase (ver actualizarAristasVisualDeGrupo), no
    escritos nunca directo en overlay.material.opacity salvo
    para evitar un parpadeo de un frame.
*/
const OPACIDAD_ARISTAS_OVERLAY = 0.22;
const OPACIDAD_ARISTAS_SIN_SUPERFICIE = 0.9;


export function createMaterialPanel(container, cones) {

    /*
        Sin el contenedor (HTML desactualizado, o esta
        página todavía no lo tiene) no hay nada que
        cablear — mismo criterio de guard que el resto
        de los controladores de esta página. A
        diferencia de antes, ahora SÍ hace falta devolver
        algo (ver "EXPONE" en la cabecera): un
        actualizarAristasDeGrupo() no-op, para que
        galeria-panel-parametros.js pueda seguir llamándolo
        sin chequear null cada vez — mismo criterio que el
        resto de los guards de esta página (p. ej.
        createCorteControles con contenedor ausente).
    */
    if (!container) return { actualizarAristasDeGrupo() {} };

    const selectTipo =
        container.querySelector("#ficha-material-tipo");

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
          en frontal/trasera.
        - "estado"/"normales"/"ninguno": el color por
          estado de conservación que ya trae el grupo
          (colorEstado), igual en ambas caras — mismo
          comportamiento que el "solido" original de este
          panel. En "normales" y "ninguno" ese color se
          calcula igual pero construirMaterial() ni lo usa
          (MeshNormalMaterial no toma color, y en "ninguno"
          la malla queda oculta): no vale la pena un branch
          aparte sólo para evitar ese cálculo de más,
          barato.
    */
    function colorParaTipo(tipo, colorEstado, side) {

        if (tipo === "solido") {

            return side === THREE.BackSide
                ? colorRellenoTemaTrasera()
                : colorRellenoTemaFrontal();

        }

        return colorEstado;

    }


    /*
        Construye un material según "tipo"
        ('solido' | 'estado' | 'normales' | 'ninguno'),
        igual en espíritu a construirMaterial() de
        fondo-3d.js, reutilizando color/matCfg que
        galeria-escena.js ya guardó en
        group.userData (colorEstado = color por estado
        de conservación; se usa o no según el tipo,
        ver colorParaTipo).
    */
    function construirMaterial(tipo, colorEstado, matCfg, side) {

        const color =
            colorParaTipo(tipo, colorEstado, side);

        switch (tipo) {

            case "normales":

                return new THREE.MeshNormalMaterial({
                    side,
                    transparent: true,
                    opacity: 1
                });

            case "estado":
            case "solido":
            case "ninguno":
                // "ninguno" no es un material propio: la
                // malla queda OCULTA (ver
                // actualizarMaterialDeGrupo), así que el
                // material en sí no importa — cae al mismo
                // que "estado"/"solido" en vez de un branch
                // aparte, mismo criterio que
                // visor-geometrias.html.
            default:

                return new THREE.MeshPhysicalMaterial({
                    color,
                    roughness: matCfg.roughness,
                    metalness: matCfg.metalness,
                    clearcoat: matCfg.clearcoat,
                    clearcoatRoughness:
                        matCfg.clearcoatRoughness,
                    side,
                    transparent: true,
                    opacity: 1
                });

        }

    }


    /*
        Reemplaza el material de las dos mallas de UN
        grupo, conservando su opacidad actual (para no
        pegar un salto visual si el elemento está a
        mitad de un fundido de alguna fase cuando se
        cambia el tipo de material).
    */
    function actualizarMaterialDeGrupo(group) {

        const { color, matCfg } = group.userData;

        const [mallaFrontal, mallaTrasera] =
            group.userData.mallas;

        const opacidadActual =
            mallaFrontal.material.opacity;

        /*
            clippingPlanes también hay que preservarlos,
            mismo motivo que "opacidadActual" arriba —
            pero acá el costo de no hacerlo es más
            visible: galeria-corte.js asigna el corte
            activo directo sobre la instancia de material
            ("mallaFrontal.material.clippingPlanes =
            planosArray", ver activar() en ese archivo),
            UNA sola vez al enfocar el elemento. Si acá
            se reemplaza el material sin copiar ese array,
            el material nuevo nace sin ningún corte
            asignado — el elemento en foco dejaba de
            cortarse en cuanto se cambiaba el tipo de
            material, hasta el próximo cambio de foco
            (el único otro momento en que algo reasigna
            clippingPlanes).

            Se copian los MISMOS arrays (no un clone) a
            propósito: son los mismos objetos THREE.Plane
            que sincronizarMundo() muta in-place cada
            frame en galeria-corte.js — si este grupo es
            el que "Corte" tiene activo ahora mismo, el
            corte sigue actualizándose solo cuadro a
            cuadro sin que este panel necesite saber nada
            de "Corte" (mismo desacople que ya vale para
            el resto del archivo).
        */
        const clippingFrontal =
            mallaFrontal.material.clippingPlanes;
        const clippingTrasera =
            mallaTrasera.material.clippingPlanes;

        mallaFrontal.material.dispose();
        mallaTrasera.material.dispose();

        mallaFrontal.material =
            construirMaterial(
                estado.tipo, color, matCfg,
                THREE.FrontSide
            );

        mallaTrasera.material =
            construirMaterial(
                estado.tipo, color, matCfg,
                THREE.BackSide
            );

        mallaFrontal.material.opacity =
            opacidadActual;

        mallaTrasera.material.opacity =
            opacidadActual;

        mallaFrontal.material.clippingPlanes =
            clippingFrontal;

        mallaTrasera.material.clippingPlanes =
            clippingTrasera;

        /*
            "ninguno": la malla sólida queda OCULTA (no es
            un material transparente — directamente
            visible=false, más barato y sin los problemas
            de orden de dibujo de la transparencia real) —
            ver "ninguno" en la cabecera del archivo. Con
            cualquier otro tipo, visible de nuevo.
        */
        mallaFrontal.visible = estado.tipo !== "ninguno";
        mallaTrasera.visible = estado.tipo !== "ninguno";

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
        Overlay de aristas de UN grupo. Se guarda en
        group.userData.overlayMalla (no en una
        variable local de este módulo) para que
        galeria-panel-parametros.js pueda mantenerlo
        actualizado cuando reconstruye la geometría
        de ese mismo grupo por un cambio en la
        carpeta "Forma".

        CUELGA DE "pivote", NO DE "mallaFrontal" (fix Nº2
        de este mismo overlay — el primero fue colgarlo de
        "group.add()" original a "mallaFrontal.add()" para
        seguir el autorotado, ver el historial de este
        archivo; ESTE fix deshace ESE, por un motivo
        distinto, ver abajo): la jerarquía real es "group"
        (cono externo) → "pivote" (grupo intermedio,
        corrido a pivotX/pivotZ — ver posicionarPivote() en
        galeria-escena.js — y el que gira
        galeria-rotacion.js para el autorotado, vía
        pivote.rotation.y) → "mallaFrontal"/"mallaTrasera"
        (corridas de vuelta -pivotX/-pivotZ DENTRO de
        "pivote").

        BUG ENCONTRADO colgando de "mallaFrontal": con tipo
        de material "ninguno", este panel apaga
        "mallaFrontal.visible" para ocultar la superficie
        sólida (ver actualizarMaterialDeGrupo) — pero
        WebGLRenderer.projectObject() CORTA la recursión
        entera apenas encuentra "object.visible === false",
        SIN bajar a revisar a sus hijos. Con el overlay
        colgado de "mallaFrontal", apagar la superficie
        apagaba TAMBIÉN el overlay sin que
        "overlay.visible" tuviera nada que ver — exactamente
        lo contrario de lo pedido ("ninguno" tiene que
        ocultar sólo la superficie, "Mostrar malla" sigue
        siendo el único que decide la malla).

        LA SOLUCIÓN: colgar el overlay de "pivote" en cambio
        (hermano de "mallaFrontal"/"mallaTrasera", no hijo
        de ninguna de las dos) — así sigue heredando la
        rotación de "pivote" (autorotado) sin depender de
        "mallaFrontal.visible" para nada. El único costo:
        como "pivote" no tiene el offset -pivotX/-pivotZ que
        SÍ tiene "mallaFrontal" (ver posicionarPivote()), acá
        SÍ hace falta sincronizar esa position a mano —
        "overlay.position.copy(mallaFrontal.position)" acá
        abajo, y de nuevo en reemplazarGeometriaAristas()
        cada vez que la geometría se reconstruye (que es
        cuando posicionarPivote() puede correr de nuevo con
        un pivotX/pivotZ distinto). Rotation/scale no hacen
        falta: "mallaFrontal" nunca tiene ninguna de las dos
        seteada (siempre identidad dentro de "pivote"), así
        que "overlay" tampoco las necesita.
    */
    function crearOverlayDeGrupo(group) {

        const [mallaFrontal] =
            group.userData.mallas;

        const { pivote } = group.userData;

        const infoCuadricula =
            construirInfoCuadriculaDeGrupo(group);

        const overlay =
            new THREE.LineSegments(
                construirGeometriaAristas(
                    mallaFrontal.geometry,
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

        overlay.position.copy(mallaFrontal.position);

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

        const [mallaFrontal] =
            group.userData.mallas;

        const infoCuadricula =
            extraerCuadriculaUV(mallaFrontal.geometry);

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
        "mallaFrontal.position" (ver crearOverlayDeGrupo,
        "LA SOLUCIÓN"): un no-op barato si nada cambió
        (mismo caso del slider de densidad, donde
        posicionarPivote() no corrió), pero necesario
        cuando esto se llama desde actualizarAristasDeGrupo
        tras una reconstrucción de geometría real —
        posicionarPivote() (galeria-panel-parametros.js)
        pudo haber movido mallaFrontal a un pivotX/pivotZ
        distinto, y "overlay" (colgado de "pivote", no de
        "mallaFrontal") no se entera solo.
    */
    function reemplazarGeometriaAristas(group) {

        const overlay = group.userData.overlayMalla;

        if (!overlay) return;

        const [mallaFrontal] =
            group.userData.mallas;

        overlay.position.copy(mallaFrontal.position);

        const geometriaVieja = overlay.geometry;

        overlay.geometry =
            construirGeometriaAristas(
                mallaFrontal.geometry,
                group.userData.infoCuadricula,
                estado.densidad
            );

        geometriaVieja.dispose();

    }


    /*
        Aplica visibilidad/profundidad/opacidad BASE del
        overlay de UN grupo según el estado GLOBAL vigente
        (tipo + mostrarMalla) — mismo criterio que
        actualizarAristasVisual() en visor-geometrias.html,
        con un agregado propio: NO escribe la opacidad
        final directamente. Guarda la opacidad BASE en
        "overlay.userData.opacidadBase" (0.22 normal, 0.9
        con "ninguno") y es el proxy "group.material.opacity"
        de galeria-escena.js quien la multiplica, CADA
        FRAME, por el fundido por distancia al foco que ya
        aplica a la superficie sólida — pedido explícito: el
        overlay tiene que atenuarse igual que la superficie
        con la distancia, no quedar siempre a opacidad fija.

        La escritura directa de acá (mallaFrontal.material.
        opacity, el fundido YA vigente en este instante) es
        sólo para evitar un parpadeo de un frame con la
        opacidad vieja mientras se espera al próximo tick
        del proxy — el valor de fondo sigue siendo
        "opacidadBase", no éste.

        No-op si el grupo no tiene overlay todavía.
    */
    function actualizarAristasVisualDeGrupo(group) {

        const overlay = group.userData.overlayMalla;

        if (!overlay) return;

        const [mallaFrontal] =
            group.userData.mallas;

        const base =
            estado.tipo === "ninguno"
                ? OPACIDAD_ARISTAS_SIN_SUPERFICIE
                : OPACIDAD_ARISTAS_OVERLAY;

        overlay.userData.opacidadBase = base;

        overlay.material.opacity =
            base * mallaFrontal.material.opacity;

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
        Wiring nativo — reemplaza los "gui.add(...)" de la
        versión lil-gui de este archivo. "change" (no
        "input") en el select: recién dispara cuando se
        confirma la opción elegida, mismo comportamiento
        que ya tenía el dropdown de lil-gui.
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
        tipo activo es "solido" (colores del tema).
        Mismo patrón que el MutationObserver de
        fondo-3d.js, pero acotado acá adentro — así
        este panel no depende de que galeria.js sepa
        que también tiene que avisarle a él (además de
        avisarle a actualizarColoresTema() de
        galeria-escena.js para fondo/mesa).
    */
    const observadorTema = new MutationObserver(() => {

        if (estado.tipo === "solido") {

            actualizarTodosLosMateriales();

        }

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
    */
    actualizarTodosLosMateriales();

    return { actualizarAristasDeGrupo };

}
