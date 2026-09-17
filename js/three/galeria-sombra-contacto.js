/* ==================================================
   galeria-sombra-contacto.js

   Un plano circular con degradado radial (textura de
   canvas, no una sombra real calculada por el motor) por
   elemento, pegado al piso justo debajo — complementa
   (no reemplaza) la sombra real que proyecta "keyLight"
   (galeria-escena.js/galeria-cono-luz.js): esa solo cubre
   al elemento en foco (es la única fuente de sombra real
   de toda la escena, y su cono solo envuelve lo que está
   siendo mirado ahora mismo); esto da a CUALQUIER
   elemento, esté o no en foco, una sensación de estar
   apoyado en el piso.

   No hace falta contemplar un desplazamiento en Y del
   pivote: acá el pivote de rotación solo corrige X/Z (ver
   posicionarPivote, galeria-escena.js), así que "está sobre
   el piso" se resuelve comparando directo la Y del cono
   contra la base PROPIA de ese elemento (ver
   "basePorIndice" más abajo).
================================================== */

import * as THREE from 'three';

function crearTexturaSombraContacto(size) {

    const c = document.createElement("canvas");
    c.width = c.height = size;

    const ctx = c.getContext("2d");

    const g =
        ctx.createRadialGradient(
            size / 2, size / 2, 0,
            size / 2, size / 2, size / 2
        );

    g.addColorStop(0.00, "rgba(0,0,0,0.85)");
    g.addColorStop(0.55, "rgba(0,0,0,0.70)");
    g.addColorStop(0.70, "rgba(0,0,0,0.30)");
    g.addColorStop(1.00, "rgba(0,0,0,0.00)");

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    return new THREE.CanvasTexture(c);

}


export function createSombraContacto(
    scene, config,
    { cones, bboxesPorIndice, elementCount }
) {

    const cfg = config.contactShadow;

    const textura =
        crearTexturaSombraContacto(cfg.texSize);

    const planos =
        Array.from({ length: elementCount }, (_, id) => {

            const bbox = bboxesPorIndice[id];

            const w = bbox.max.x - bbox.min.x;
            const d = bbox.max.z - bbox.min.z;

            const diag =
                Math.hypot(w, d) * cfg.escalaDiagonal;

            const plano =
                new THREE.Mesh(
                    new THREE.PlaneGeometry(diag, diag),
                    new THREE.MeshBasicMaterial({
                        map: textura,
                        transparent: true,
                        depthWrite: false,
                        opacity: cfg.opacityBase
                    })
                );

            plano.rotation.x = -Math.PI / 2;
            scene.add(plano);

            return plano;

        });


    /*
        Altura de PISO de cada elemento: su propia base
        (misma cuenta que "desplazamientoBase" en
        normalizarGeometriaElemento, galeria-escena.js:
        -bbox.min.y). Se precalcula una vez — los bboxes
        LOCALES no cambian en toda la vida de la escena.

        Es un valor POR ELEMENTO, no uno global: cada
        elemento se apoya en SU base, así que comparar contra
        un único umbral para toda la fila (el mayor
        desplazamientoBase) daría falsos negativos — un
        elemento perfectamente asentado en su propio piso
        quedaría por debajo de ese umbral y su plano de
        contacto no se dibujaría nunca.
    */
    const basePorIndice =
        Array.from(
            { length: elementCount },
            (_, id) => -bboxesPorIndice[id].min.y
        );

    /*
        "pisoY": la Y de mundo del piso en este frame
        (roomGroup.position.y, galeria-habitacion.js — 0 en
        horizontal, sigue al elemento más bajo en vertical),
        no un valor fijo. Es el mismo dato que persigue la
        habitación, y entra por parámetro en cada llamada en
        vez de leerse de un closure propio.
    */
    function actualizar(pisoY) {

        for (let id = 0; id < elementCount; id++) {

            const cono = cones[id];
            const plano = planos[id];

            plano.position.set(
                cono.position.x,
                pisoY + cfg.offsetY,
                cono.position.z
            );

            /*
                Único criterio: posición. El plano se dibuja
                cuando el elemento está efectivamente arriba
                de su propio piso. No se mira la opacidad del
                elemento porque ninguna fase la anima — vale
                1 siempre.
            */
            plano.visible =
                cono.position.y > basePorIndice[id] + 1e-3;

        }

    }


    /*
        Mitad "sombra de contacto" del sistema día/noche —
        mismo criterio que actualizarTema() en
        galeria-cono-luz.js: recalcula "d" (día) con la misma
        fórmula, leyendo config.tema directo, para no depender
        de un orden de llamada entre módulos.
    */
    const temaCfg = config.tema;

    function actualizarTema(k) {

        const d =
            temaCfg.dark.day +
            (temaCfg.bright.day - temaCfg.dark.day) * k;

        const opacidad =
            cfg.opacityBase * (1 - 0.55 * d);

        planos.forEach(plano => {

            plano.material.opacity = opacidad;

        });

    }


    return { planos, actualizar, actualizarTema };

}
