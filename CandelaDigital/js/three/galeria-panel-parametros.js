/* ==================================================
   galeria-panel-parametros.js

   Panel de controles (lil-gui) para la fase C: deja
   ajustar en vivo los parámetros de la fórmula
   procedural del elemento actualmente enfocado en el
   carrusel (carpeta "Forma").

   El tipo de material (sólido/alambre/normales) y el
   wireframe YA NO viven acá: son una configuración
   global de toda la escena, visible desde la fase A
   (ver galeria-panel-material.js). Este módulo solo
   se preocupa de reconstruir la GEOMETRÍA del
   elemento enfocado — y, si ese elemento ya tiene un
   overlay de wireframe activado por el panel global,
   de mantenerlo sincronizado con la nueva geometría.

   IMPORTANTE — este panel no conoce de antemano los
   parámetros de NINGÚN generador: arma sus controles
   dinámicamente a partir de las claves de
   PARAMETROS_DEFECTO que exporte el módulo del
   elemento enfocado. Así sigue funcionando sin
   tocarse aunque los generadores cambien sus
   parámetros más adelante.

   No sabe nada de "edificios": solo recibe el Group
   ya construido (con su modulo/mallas en
   group.userData, ver galeria-escena.js) y un nombre
   para el título.
================================================== */

import * as THREE from 'three';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/dist/lil-gui.esm.min.js';
import { obtenerFuncionConstructora } from "./galeria-generadores.js";


export function createParamPanel(container) {

    let gui = null;
    let elementoActualId = null;


    function limpiar() {

        if (gui) {

            gui.destroy();
            gui = null;

        }

        elementoActualId = null;

    }


    /*
        Reconstruye la geometría del Group con los
        parámetros actuales, reutilizando las dos
        mallas (frontal/trasera) que ya existen —
        no hace falta tocar galeria-escena.js ni el
        resto del motor de fases para esto.

        Si este elemento ya tiene un overlay de
        wireframe (group.userData.overlayMalla,
        activado desde el panel global de material),
        también se le refresca la geometría — si no,
        se quedaría mostrando la malla vieja después
        de mover un slider de "Forma".
    */
    function reconstruirGeometria(
        group, modulo, parametros
    ) {

        const construirGeometria =
            obtenerFuncionConstructora(modulo);

        const nuevaGeometria =
            construirGeometria(parametros);

        const [mallaFrontal, mallaTrasera] =
            group.userData.mallas;

        const geometriaVieja =
            mallaFrontal.geometry;

        mallaFrontal.geometry = nuevaGeometria;
        mallaTrasera.geometry = nuevaGeometria;

        geometriaVieja.dispose();


        const overlay =
            group.userData.overlayMalla;

        if (overlay) {

            const wireframeVieja =
                overlay.geometry;

            overlay.geometry =
                new THREE.WireframeGeometry(
                    nuevaGeometria
                );

            wireframeVieja.dispose();

        }

    }


    /*
        Muestra (o actualiza) el panel para el
        elemento enfocado. Si ya es el mismo
        elemento, no hace nada (evita reconstruir el
        GUI en cada frame).
    */
    function mostrar(elementoId, elemento, group) {

        if (elementoId === elementoActualId) return;

        limpiar();

        elementoActualId = elementoId;


        const modulo = group.userData.modulo;

        const defaults =
            modulo && modulo.PARAMETROS_DEFECTO;

        /*
            Si el módulo no expone parámetros (caso
            raro, generador sin export de defaults),
            simplemente no se arma panel para este
            elemento.
        */
        if (!defaults) return;


        const parametros = { ...defaults };

        gui =
            new GUI({
                container,
                title: elemento.nombre
            });

        Object.keys(parametros).forEach(key => {

            gui.add(parametros, key)
                .onChange(() => {

                    reconstruirGeometria(
                        group, modulo, parametros
                    );

                });

        });

    }


    return { mostrar, limpiar };

}
