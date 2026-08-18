/* ==================================================
   galeria-panel-material.js

   Panel de controles (lil-gui) GLOBAL, no atado a
   ningún elemento en particular: tipo de material
   (sólido / estado / alambre / normales) y si se
   superpone el wireframe, aplicado a TODOS los
   elementos de la fila a la vez.

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
     elementos. Es el tipo por defecto, así que la
     escena arranca reaccionando a claro/oscuro igual
     que el resto del sitio.
   - "estado"  → color por estado de conservación de
     CADA edificio (ESTADO_COLOR en
     galeria-config.js), ya resuelto por elemento y
     guardado en group.userData.color por
     galeria-escena.js. No cambia con el tema — es la
     vista "analítica" opcional, antes era el "solido"
     de este mismo panel.

   Reutiliza color/matCfg/mallas que
   galeria-escena.js ya guardó en cada
   group.userData (ver construirElemento3D).
================================================== */

import * as THREE from 'three';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/dist/lil-gui.esm.min.js';


export function createMaterialPanel(container, cones) {

    const estado = {
        tipo: "normales", // por defecto: sólido con los colores del tema
        mostrarMalla: false
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
        - cualquier otro tipo ("estado" o "alambre"):
          el color por estado de conservación que ya
          trae el grupo (colorEstado), igual en ambas
          caras — mismo comportamiento que el "solido"
          original de este panel.
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
        ('solido' | 'estado' | 'alambre' | 'normales'),
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

            case "alambre":

                return new THREE.MeshBasicMaterial({
                    color,
                    wireframe: true,
                    side,
                    transparent: true,
                    opacity: 1
                });

            case "normales":

                return new THREE.MeshNormalMaterial({
                    side,
                    transparent: true,
                    opacity: 1
                });

            case "estado":
            case "solido":
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
    */
    function crearOverlayDeGrupo(group) {

        const [mallaFrontal] =
            group.userData.mallas;

        const overlay =
            new THREE.LineSegments(
                new THREE.WireframeGeometry(
                    mallaFrontal.geometry
                ),
                new THREE.LineBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.35
                })
            );

        group.add(overlay);

        group.userData.overlayMalla = overlay;

    }


    function actualizarMallaDeTodos(mostrar) {

        cones.forEach(group => {

            if (mostrar) {

                if (!group.userData.overlayMalla) {

                    crearOverlayDeGrupo(group);

                } else {

                    group.userData.overlayMalla
                        .visible = true;

                }

            } else if (group.userData.overlayMalla) {

                group.userData.overlayMalla
                    .visible = false;

            }

        });

    }


    const gui =
        new GUI({
            container,
            title: "Material"
        });

    gui.add(estado, "tipo", {
        "Sólido (tema)": "solido",
        "Estado de conservación": "estado",
        Alambre: "alambre",
        Normales: "normales"
    })
        .name("tipo")
        .onChange(actualizarTodosLosMateriales);

    gui.add(estado, "mostrarMalla")
        .name("mostrar malla")
        .onChange(mostrarValor => {

            actualizarMallaDeTodos(mostrarValor);

        });


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
        Como el tipo por defecto de este panel es
        "solido" (no "estado"), hay que aplicar ese tipo
        ahora mismo o la escena arrancaría mostrando
        colores de estado aunque el dropdown diga
        "Sólido (tema)".
    */
    actualizarTodosLosMateriales();


    return { gui };

}
