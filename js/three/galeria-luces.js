/* ==================================================
   galeria-luces.js

   Luces ADICIONALES portadas de Maqueta.html — se suman
   a las que ya arma galeria-escena.js (ambient/key/fill,
   config.lights), no las reemplazan. Ninguna de las de
   este módulo proyecta sombra: el único shadow caster de
   toda la escena sigue siendo "key" (galeria-escena.js).

   "lucesPorCaja": un PointLight por elemento, hijo de su
   propia malla (mismo "mesh.add(luz)" que la maqueta,
   salvo que acá el "mesh" es la única malla DoubleSide de
   armarGroup3D — ver galeria-escena.js), cuya intensidad
   sube con "pesoFoco(w)" — mismo shaping que la maqueta:
   una banda alrededor de w=0.35..0.65, no una rampa lineal
   0..1, para que sólo el/los elemento(s) realmente en
   foco se iluminen, no cualquiera con algo de peso.

   "w" (foco CRUDO 0..1 por elemento, antes de pesoFoco) no
   lo calcula este módulo — lo arman, cada uno para su
   fase, galeria-revelado.js (hero fijo en 1, cascada según
   "e") y galeria-carrusel.js (reusa "opacityFinal" tal
   cual, igual que hace la maqueta) — este archivo sólo
   recibe el mapa {id -> w} ya armado (ver
   actualizarLucesPorCaja) y aplica pesoFoco()/la
   intensidad, sin saber en qué fase está la galería.

   "createLucesPorCaja" se separa de "createLucesAdicionales"
   (mismo archivo, dos funciones) porque necesita "cones"/
   "bboxesPorIndice"/"elementCount", que en
   galeria-escena.js recién existen bastante después de
   armar el renderer/las luces de cámara — se instancia en
   otro punto de ese archivo, más tarde.
================================================== */

import * as THREE from 'three';
import { smoothstep } from "./galeria-utils.js";

export function createLucesAdicionales(scene, config) {

    const cfg = config.lightsAdicionales;


    const rim =
        new THREE.PointLight(
            cfg.rim.color, cfg.rim.intensity, cfg.rim.distance
        );

    rim.position.set(
        cfg.rim.position.x,
        cfg.rim.position.y,
        cfg.rim.position.z
    );

    scene.add(rim);


    const roomLight =
        new THREE.HemisphereLight(
            cfg.roomLight.skyColor,
            cfg.roomLight.groundColor,
            cfg.roomLight.intensity
        );

    scene.add(roomLight);


    /*
        Restringida a la capa 1 (misma capa que
        roomWall/roomFloor habilitan en galeria-habitacion.js)
        — así solo ilumina la sala, nunca los elementos, sin
        importar qué tan cerca estén.
    */
    const wallLight =
        new THREE.HemisphereLight(
            cfg.wallLight.skyColor,
            cfg.wallLight.groundColor,
            cfg.wallLight.intensity
        );

    wallLight.layers.set(1);
    scene.add(wallLight);


    const luzCalida =
        new THREE.PointLight(
            cfg.calidoFrio.calidoColor,
            cfg.calidoFrio.intensidadHorizontal,
            cfg.calidoFrio.distance,
            cfg.calidoFrio.decay
        );

    luzCalida.position.set(
        cfg.calidoFrio.calidoPos.x,
        cfg.calidoFrio.calidoPos.y,
        cfg.calidoFrio.calidoPos.z
    );

    scene.add(luzCalida);


    const luzFria =
        new THREE.PointLight(
            cfg.calidoFrio.frioColor,
            cfg.calidoFrio.intensidadHorizontal,
            cfg.calidoFrio.distance,
            cfg.calidoFrio.decay
        );

    luzFria.position.set(
        cfg.calidoFrio.frioPos.x,
        cfg.calidoFrio.frioPos.y,
        cfg.calidoFrio.frioPos.z
    );

    scene.add(luzFria);


    /*
        En vertical, el par cálido/frío se atenúa y sigue la
        altura de la cámara (para seguir aportando algo de
        contraste de color a medida que la columna sube, sin
        quedar plantado en una altura que ya no tiene nada
        cerca). En horizontal quedan fijas, como siempre.
        Se llama una vez por frame, sin importar la fase
        (mismo criterio que la maqueta) — ver el call site en
        galeria.js, junto a actualizarPisoSegunGeometria().
    */
    /*
        FIX (escalar con el ancho real de la fila): las
        posiciones X de "calidoPos"/"frioPos" venían
        calibradas a ojo (portadas de Maqueta.html) para EL
        ANCHO DE FILA QUE TENÍA ESA MAQUETA — unos pocos
        prismas con spacing chico. Con la geometría real de
        "galeria" (más elementos, geometrías más grandes/
        variadas), esa misma constante en X deja a las luces
        pegadas a un costado en vez de flanquear la fila,
        sea cual sea su ancho real.

        Se resuelve igual que "roomGroup.scale" en
        galeria-habitacion.js: en vez de un valor absoluto,
        una FRACCIÓN del ancho real ("xFactor", nuevo campo
        opcional en config.lightsAdicionales.calidoFrio,
        junto a "calidoPos"/"frioPos" — ver galeria-config.js),
        multiplicada por "anchoFilaActual" (el semiancho real
        de la fila en X, ya calculado en
        calcularLayoutDeFila() de galeria-escena.js, nunca
        expuesto hasta ahora fuera de ese archivo).

        Sin "xFactor" en config (compatibilidad hacia atrás,
        mismo criterio que "bboxesPorIndice" opcional en
        galeria-reordenar.js/galeria-revelado.js): se cae al
        "calidoPos.x"/"frioPos.x" de siempre, sin escalar —
        así un config viejo que no lo defina no rompe.

        "xFactor" es del mismo tipo de constante "ajustar a
        ojo" que ya tiene el resto del proyecto
        (radioFactor, levelSeparationFactor...): un valor de
        partida razonable es la fracción que ya daba el
        resultado calibrado en Maqueta.html sobre EL ANCHO
        DE ESA MAQUETA (calidoPos.x / anchoFilaDeLaMaqueta),
        para arrancar en un lugar parecido y de ahí ajustar
        a ojo contra el ancho real de "galeria".
    */
    function posXEscalada(posConfig, anchoFilaActual) {

        if (posConfig.xFactor !== undefined) {

            return posConfig.xFactor * anchoFilaActual;

        }

        return posConfig.x;

    }


    function actualizarSegunCamara(camera, ejePrincipal, anchoFilaActual) {

        if (ejePrincipal === "y") {

            luzCalida.intensity = cfg.calidoFrio.intensidadVertical;
            luzFria.intensity = cfg.calidoFrio.intensidadVertical;

            luzCalida.position.y = camera.position.y;
            luzFria.position.y = camera.position.y;

        } else {

            luzCalida.intensity = cfg.calidoFrio.intensidadHorizontal;
            luzFria.intensity = cfg.calidoFrio.intensidadHorizontal;

            luzCalida.position.y = cfg.calidoFrio.calidoPos.y;
            luzFria.position.y = cfg.calidoFrio.frioPos.y;

            luzCalida.position.x =
                posXEscalada(cfg.calidoFrio.calidoPos, anchoFilaActual);
            luzFria.position.x =
                posXEscalada(cfg.calidoFrio.frioPos, anchoFilaActual);

        }

    }


    return {
        rim,
        roomLight,
        wallLight,
        luzCalida,
        luzFria,
        actualizarSegunCamara
    };

}


/*
    Un PointLight por elemento, hijo de su propia malla —
    ver el comentario grande de la cabecera del archivo
    para el porqué de separarla de createLucesAdicionales.

    "bboxesPorIndice[id]" da la altura LOCAL real de cada
    elemento (bbox.max.y - bbox.min.y, no asumida en 1 fija
    como en una caja) — con geometría paramétrica real de
    tamaños dispares entre edificios, una altura de
    posicionamiento fija dejaría la luz enterrada en unos y
    flotando muy por encima en otros.
*/
export function createLucesPorCaja(config, { cones, bboxesPorIndice, elementCount }) {

    const cfg = config.lightsAdicionales.porCaja;

    const lucesPorCaja = [];

    for (let id = 0; id < elementCount; id++) {

        const [malla] = cones[id].userData.mallas;

        const bbox = bboxesPorIndice[id];
        const altura = bbox.max.y - bbox.min.y;

        const color =
            id % 2 === 0
                ? cfg.colorPar
                : cfg.colorImpar;

        const luz =
            new THREE.PointLight(
                color, 0, cfg.distance, cfg.decay
            );

        /*
            FIX: la maqueta mide "alturaFraccion"/"zOffset"
            desde el CENTRO de la caja (su malla nace centrada
            en el origen, y "mesh.position.y = h/2" es lo que
            hace que la base quede en y=0 — el centro real
            queda a h/2 de altura, no en el origen local).
            Acá el origen local de "malla" es la BASE del
            elemento (normalizarGeometriaElemento dejó
            bbox.min.y=0) y la cara FRONTAL en z=0 (no el
            centro) — usar cfg.alturaFraccion/cfg.zOffset tal
            cual, medidos desde el origen local, dejaba la luz
            a la mitad de la altura real de la maqueta (le
            faltaba sumar el medio-alto hasta el centro) y
            corrida en Z por la mitad de la profundidad del
            elemento (por medir desde la cara frontal en vez
            del centro).

            Se corrige recomponiendo el CENTRO real del bbox
            (alturaCentro/zCentro) y aplicando
            alturaFraccion/zOffset relativos a ESE punto, no al
            origen local — mismo punto de referencia que usaba
            la maqueta, aunque el origen local de la malla acá
            sea otro.
        */
        const alturaCentro = (bbox.min.y + bbox.max.y) / 2;
        const zCentro = (bbox.min.z + bbox.max.z) / 2;

        luz.position.set(
            0,
            alturaCentro + altura * cfg.alturaFraccion,
            zCentro + cfg.zOffset
        );

        malla.add(luz);

        lucesPorCaja.push(luz);

    }

    /*
        Mismo shaping que Maqueta.html: no es el "w" crudo
        (0..1) el que gobierna la intensidad, sino una banda
        angosta alrededor de "umbral" — por debajo, la luz
        queda prácticamente apagada (INTENSIDAD_FOCO_MIN);
        por encima de umbral+ancho, a full
        (INTENSIDAD_FOCO_MAX). Sin este paso intermedio,
        cualquier elemento con w>0 ya se vería iluminado, en
        vez de solo el/los que están realmente en foco.
    */
    function pesoFoco(w) {

        return smoothstep(
            (w - cfg.umbral) / cfg.ancho
        );

    }

    /*
        "focoWeights": mapa {id -> w crudo 0..1}, armado por
        quien esté manejando la fase vigente (galeria.js) —
        ver el comentario grande de la cabecera. Un id sin
        entrada se toma como w=0 (mismo criterio que
        "pesoDe" en galeria-rotacion.js: no aparecer en el
        mapa es lo mismo que valer 0, no un caso especial).

        FIX: faltaba el gating por "ejePrincipal" que sí tiene
        la maqueta (ver actualizarLucesSegunCamara,
        Maqueta.html) — ahí "lucesPorCaja" solo se enciende en
        layout VERTICAL; en horizontal se fuerzan a 0 cada
        frame (los dos PointLight fijos "luzCalida"/"luzFria",
        no estos, son los que iluminan en ese modo — ver
        actualizarSegunCamara más arriba en este mismo
        archivo). Sin este chequeo, acá quedaban siempre
        encendidas en las dos orientaciones a la vez.
    */
    function actualizar(focoWeights, ejePrincipal) {

        if (ejePrincipal !== "y") {

            for (let id = 0; id < elementCount; id++) {

                lucesPorCaja[id].intensity = 0;

            }

            return;

        }

        for (let id = 0; id < elementCount; id++) {

            const w =
                (focoWeights && focoWeights[id]) || 0;

            lucesPorCaja[id].intensity =
                cfg.intensidadMin +
                (cfg.intensidadMax - cfg.intensidadMin) *
                pesoFoco(w);

        }

    }

    return { lucesPorCaja, actualizar };

}
