/* ==================================================
   galeria-camara-debug.js

   MÓDULO OPCIONAL — pensado para sacarse del proyecto
   sin dejar rastro. Para removerlo alcanza con:

     1) borrar este archivo, y
     2) en galeria.js, borrar las líneas marcadas con
        "// === CÁMARA DEBUG ===" (el import + 3 líneas
        más: la creación del controller y las dos que se
        agregaron en cada uno de los DOS render() del
        tick() + la de resize).

   Nada más en el proyecto conoce este módulo: no toca
   galeria-dom.js, no agrega nada a CONFIG, no depende
   de ningún elemento del HTML — el botón lo crea él
   mismo por JS.

   Mismo comportamiento que Maqueta.html
   (debugCamera/debugControls/btnDepuracion), pero
   encapsulado: expone una API chica en vez de variables
   sueltas, para que integrarlo en el tick() de
   galeria.js sea una sola línea por render call.

   USO en galeria.js:

     const camaraDebug =
         createCamaraDebug(CONFIG, { renderer, camera, cones });

     // en cada sitio que hoy hace renderer.render(scene, camera):
     camaraDebug.update();
     renderer.render(scene, camaraDebug.getCamaraActiva(camera));

     // en refrescarTrasResize(), después de resize():
     camaraDebug.resize(sceneContainer.clientWidth / sceneContainer.clientHeight);

   IMPORTANTE — import de OrbitControls: este archivo
   asume que el import map de galeria.html resuelve
   "three/addons/controls/OrbitControls.js" (la
   convención actual de three.js para los ejemplos como
   módulo ES). Si el import map de este proyecto usa
   otra convención (p. ej. "three/examples/jsm/..."),
   ajustar SOLO la línea de import de abajo — el resto
   del archivo no cambia.
================================================== */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';


export function createCamaraDebug(config, { renderer, camera, cones }) {

    const debugCamera = new THREE.PerspectiveCamera(
        50,
        window.innerWidth / window.innerHeight,
        0.1,
        5000
    );

    const controls =
        new OrbitControls(debugCamera, renderer.domElement);

    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = Math.PI - 0.05;
    controls.enabled = false;


    /*
        Botón propio, insertado por JS — no depende de que
        el HTML/galeria-dom.js reserve nada para esto. Estilo
        inline (no clases CSS del proyecto) para que este
        módulo no tenga NINGUNA dependencia externa además de
        three/OrbitControls.
    */
    const boton = document.createElement("button");
    boton.type = "button";
    boton.textContent = "Cámara: real";

    Object.assign(boton.style, {
        position: "fixed",
        top: "10px",
        right: "10px",
        zIndex: "9999",
        font: "12px monospace",
        padding: "8px 12px",
        background: "#fff",
        color: "#111",
        border: "1px solid #333",
        borderRadius: "4px",
        cursor: "pointer"
    });

    document.body.appendChild(boton);


    let activo = false;


    /*
        Mismo criterio que reencuadrarDebug() en
        Maqueta.html: centra la órbita en el centroide XZ
        de los conos (altura Y promedio como target), con
        un radio que cubre a todos — así el botón siempre
        arranca mirando la fila completa, sea cual sea la
        fase de scroll en la que el visitante lo aprieta.
    */
    function reencuadrar() {

        const n = cones.length || 1;

        let cx = 0, cy = 0, cz = 0;

        cones.forEach(cono => {

            cx += cono.position.x;
            cy += cono.position.y;
            cz += cono.position.z;

        });

        cx /= n; cy /= n; cz /= n;

        let radio = 1;

        cones.forEach(cono => {

            radio = Math.max(
                radio,
                Math.hypot(
                    cono.position.x - cx,
                    cono.position.z - cz
                )
            );

        });

        const distancia = radio * 2.2 + 5;

        debugCamera.position.set(
            cx + distancia * 0.6,
            cy + distancia * 0.5,
            cz + distancia * 0.8
        );

        controls.target.set(cx, cy, cz);
        debugCamera.lookAt(cx, cy, cz);
        controls.update();

    }


    function alternar() {

        activo = !activo;
        controls.enabled = activo;

        if (activo) reencuadrar();

        boton.textContent =
            "Cámara: " + (activo ? "depuración" : "real");

    }

    boton.addEventListener("click", alternar);

    // Mismo atajo que la maqueta ("d"), para no tener que ir
    // a buscar el botón con el mouse mientras se prueba.
    function onKeydown(evento) {

        if (evento.key.toLowerCase() === "d") alternar();

    }

    window.addEventListener("keydown", onKeydown);


    function resize(aspect) {

        debugCamera.aspect = aspect;
        debugCamera.updateProjectionMatrix();

    }


    // Llamar UNA vez por frame, siempre — si no está activa,
    // es un no-op barato (early return). Actualiza el damping
    // de OrbitControls con el input más reciente ANTES de
    // renderizar ese mismo frame.
    function update() {

        if (activo) controls.update();

    }


    function estaActivo() {

        return activo;

    }


    /*
        Único punto de decisión "qué cámara usar" — el resto
        del proyecto (tick()) no necesita saber si está activa
        o no, solo le pasa la cámara "real" de siempre y este
        módulo decide si la reemplaza.
    */
    function getCamaraActiva(camaraReal) {

        return activo ? debugCamera : camaraReal;

    }


    // Por si alguna vez se quiere desactivar en caliente sin
    // sacar el import (p. ej. un flag de CONFIG a futuro) sin
    // dejar el botón/listener colgado en el DOM.
    function destruir() {

        boton.remove();
        window.removeEventListener("keydown", onKeydown);
        controls.dispose();

    }


    return {
        estaActivo,
        getCamaraActiva,
        update,
        resize,
        destruir
    };

}
