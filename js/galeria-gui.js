/* ==================================================
   galeria-gui.js

   El GUI de reordenar (fase "orden"): arma los botones
   a partir de CONFIG.sortOptions, los conecta a
   galeria-reordenar.js, y calcula en qué "top" (px)
   debe quedar pegado en cada frame/resize.

   Se separó de galeria.js porque es, en sí mismo, un
   mini-componente de UI con su propio ciclo de vida
   (armar markup, conectar eventos, reposicionar) sin
   relación con el resto de las fases de scroll — mismo
   criterio "createXController()" que ya usan el resto
   de los módulos de js/three/.
================================================== */

function remAPx(rem) {

    const raiz =
        parseFloat(
            getComputedStyle(
                document.documentElement
            ).fontSize
        ) || 16;

    return rem * raiz;

}

/*
    GUI_TOP_MINIMO: piso de seguridad por navbar. En
    celular horizontal el viewport es tan bajo que,
    aunque la ficha ya esté acotada por CSS (ver
    #carousel-panel en galeria.css), su borde superior
    puede caer igual muy cerca del techo de la pantalla.
    Mismo despeje que ya usa #panel-material (top:
    5.5rem, ver galeria.css) para el navbar, convertido a
    píxeles según el tamaño de fuente real de la raíz
    (por si el visitante tiene el zoom del navegador o el
    tamaño de fuente del sistema cambiados).
*/
const GUI_TOP_MINIMO = remAPx(5.5);
const GUI_MARGEN_SOBRE_GEOMETRIA = 16;


/*
    "getRowBottomScreenY" es la función que expone
    galeria-escena.js (createScene) para saber, en vivo,
    dónde cae en pantalla el borde inferior de la fila de
    conos — piso de seguridad por GEOMETRÍA (distinto del
    piso de arriba, que solo cuida el navbar). Sin esto,
    en celular horizontal el "topFicha" de más abajo
    podía caer a mitad de la fila de conos, y las
    pestañas de reordenar quedaban superpuestas sobre la
    geometría 3D en vez de debajo.

    Puede llegar undefined según el orden de
    inicialización de quien llame a createGuiController,
    de ahí el chequeo antes de invocarla.
*/

export function createGuiController({
    gui,
    panelNombre,
    reorder,
    phases,
    sortOptions,
    getRowBottomScreenY
}) {

    /*
        Coloca #gui a la misma altura en la que arranca
        la ficha (fase C, ver #carousel-panel en
        galeria.css): así, al pasar de la pausa "orden" a
        "fichas", el nombre/subtítulo que aparece ocupa
        visualmente el mismo lugar en el que estaban las
        pestañas de orden, sin salto.

        #carousel-panel está anclado por ABAJO (bottom:0),
        así que su borde superior no es un valor fijo: no
        hay forma de expresar "la altura en la que empieza
        la ficha" solo con CSS — se mide el DOM real.
        panelNombre.bottom (el borde inferior del título de
        la ficha) es esa altura.

        Se descarta cualquier medición en 0 o negativa (p.
        ej. si esto llegara a correr antes de que el
        layout esté listo): más vale quedarse con el valor
        anterior (o el top:6rem de respaldo del CSS) que
        clavar el GUI en un lugar sin sentido.
    */
    function posicionarGui() {

        if (!panelNombre) return;

        const topFicha =
            panelNombre.getBoundingClientRect().bottom;

        if (topFicha <= 0) return;


        const topPorGeometria =
            getRowBottomScreenY
                ? getRowBottomScreenY() +
                  GUI_MARGEN_SOBRE_GEOMETRIA
                : 0;

        gui.style.top =
            Math.max(
                topFicha,
                topPorGeometria,
                GUI_TOP_MINIMO
            ) + "px";

    }


    function renderSortButtons() {

        gui.innerHTML = "";

        sortOptions.forEach(
            (option, i) => {

                const button =
                    document.createElement(
                        "button"
                    );

                button.textContent =
                    option.label;

                button.dataset.sort =
                    option.key;

                /*
                    Primer botón = primer criterio de
                    sortOptions ("anio"/Cronológico) =
                    mismo criterio con el que arranca
                    "order" en galeria-reordenar.js. Si
                    se reordena sortOptions, este botón
                    activo por defecto y el "order"
                    inicial se mueven juntos, sin tocar
                    nada acá.
                */
                if (i === 0) {

                    button.classList.add(
                        "active"
                    );

                }

                gui.appendChild(button);

            }
        );

    }


    function wireSortButtons() {

        gui.querySelectorAll("button")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    () => {

                        if (
                            reorder.isBusy() ||
                            phases.getPhase()
                                .phase !== "orden"
                        ) return;


                        gui.querySelectorAll(
                            "button"
                        ).forEach(
                            b =>
                                b.classList
                                 .remove("active")
                        );

                        button.classList.add(
                            "active"
                        );


                        const newOrder =
                            reorder.getSortedOrder(
                                button.dataset.sort
                            );

                        reorder.animateTo(
                            newOrder
                        );

                    }
                );

            });

    }


    return {
        posicionarGui,
        renderSortButtons,
        wireSortButtons
    };

}
