/* ==================================================
   galeria-panel-parametros.js

   Panel de controles NATIVO (sliders, misma clase
   ".ficha__slider" que ya usan los planos de corte)
   para la fase C: deja ajustar en vivo los parámetros
   de la fórmula procedural del elemento actualmente
   enfocado en el carrusel (sección "Geometría").

   El tipo de material (sólido/estado/normales/ninguno)
   y la malla NO viven acá: son una configuración global
   de toda la escena, visible desde la fase A (ver
   galeria-panel-material.js). Este módulo solo se
   preocupa de reconstruir la GEOMETRÍA del elemento
   enfocado — y, si ese elemento ya tiene un overlay de
   malla activado por el panel global, de avisarle a ese
   mismo panel (vía "callbacks.actualizarAristasDeGrupo")
   para que lo mantenga sincronizado: este panel no
   conoce la técnica real (cuadrícula UV/densidad, ver
   galeria-malla-cuadricula.js), solo el momento en que
   hay que refrescarla.

   Este panel no conoce de antemano los parámetros de
   ningún generador: arma sus controles dinámicamente a
   partir de las claves de PARAMETROS_DEFECTO que
   exporte el módulo del elemento enfocado. Así sigue
   funcionando sin tocarse aunque los generadores
   cambien sus parámetros más adelante.

   RANGOS DE LOS SLIDERS — dos fuentes posibles:

     1) "PARAMETROS_RANGO" (opcional): si el módulo del
        generador exporta este objeto junto a
        PARAMETROS_DEFECTO, con la forma
        "{ clave: { min, max, step } }", se usa tal cual
        — la fuente real cuando la geometría sabe
        describir sus propios límites (p. ej. un radio no
        puede ser negativo). Ningún generador lo exporta
        todavía.

     2) Heurística genérica (calcularRango, más abajo):
        para cualquier clave sin entrada en
        PARAMETROS_RANGO, arma un rango proporcional al
        valor por defecto, con una única regla fija:
        nunca tocar 0 (evita geometría degenerada tipo
        radio/lados en cero). Todo lo demás (nombres
        legibles, límites reales por geometría, enteros
        vs. continuos) se agrega geometría por geometría
        el día que haga falta, vía PARAMETROS_RANGO.

   No sabe nada de "edificios": solo recibe el Group ya
   construido (con su modulo/mallas en group.userData,
   ver galeria-escena.js) y un nombre para el título.
================================================== */

import { obtenerFuncionConstructora } from "./galeria-generadores.js";
import {
    normalizarGeometriaElemento,
    posicionarPivote
} from "./galeria-escena.js";
import { invalidarBboxCono } from "./galeria-corte.js";


/*
    Heurística GENÉRICA de rango (ver "RANGOS DE LOS
    SLIDERS" en la cabecera): no conoce el significado
    real del parámetro, solo escala a partir de su valor
    por defecto.

    - Si el default es 0 (o no es un número finito): rango
      simétrico fijo de respaldo — el único caso donde el
      slider puede llegar a 0 a mitad de camino, porque el
      propio default ya es 0.

    - Si el default es distinto de 0: el rango va de una
      FRACCIÓN del valor (25%) a un MÚLTIPLO (3x),
      conservando el signo — así el 0 nunca queda dentro
      del rango, y el default cae bien adentro del
      recorrido del slider.
*/
function calcularRango(valorDefecto) {

    const v = Number(valorDefecto);

    if (!Number.isFinite(v) || v === 0) {

        return { min: -10, max: 10, step: 0.1 };

    }

    const signo = Math.sign(v);
    const magnitud = Math.abs(v);

    const minAbs = magnitud * 0.25;
    const maxAbs = magnitud * 3;

    const min = signo > 0 ? minAbs : -maxAbs;
    const max = signo > 0 ? maxAbs : -minAbs;

    /*
        Step proporcional al recorrido (100 pasos de
        punta a punta) — ni tan grueso que el slider
        salte de a saltos notorios, ni tan fino que
        cada pixel de arrastre cambie el valor. Se
        redondea a 3 decimales para no arrastrar error
        de punto flotante visible en el value del input.
    */
    const step =
        Math.round(((max - min) / 100) * 1000) / 1000;

    return {
        min: Math.round(min * 1000) / 1000,
        max: Math.round(max * 1000) / 1000,
        step: step || 0.01
    };

}


/*
    Redondeo solo para MOSTRAR el valor actual junto al
    label (el valor real que se manda a reconstruirGeometria
    es el Number(slider.value) crudo, sin este redondeo) —
    3 decimales alcanza para no mostrar ruido de punto
    flotante sin esconder precisión real del parámetro.
*/
function formatearValor(v) {

    return Number(v.toFixed(3)).toString();

}


/*
    "bboxesPorIndice" (opcional): el mismo array que
    devuelve createScene() (ver galeria-escena.js),
    indexado por elemento.indice. Si se pasa, cada
    reconstrucción de geometría actualiza en el lugar la
    entrada de este elemento, para que
    galeria-carrusel.js/galeria-zoom.js/las cajas de debug
    no sigan viendo el bbox con el que se armó la escena
    la primera vez.

    "callbacks.onGeometriaReconstruida" (opcional): patrón
    "inyectar, no importar" (mismo que getManualOffset,
    onCambioEje/onInvertirEje, onElementoCambiado — ver
    galeria.js) — este panel no conoce
    galeria-corte-interseccion.js ni galeria-plano-corte.js.
    Se llama sin argumentos, después de invalidarBboxCono(),
    cada vez que se reconstruye la geometría de un elemento
    (slider individual o "Restaurar predeterminados", ambos
    vía reconstruirGeometria() más abajo). Quien la inyecte
    decide qué hacer (típicamente releer
    corte.obtenerEstadoActivo() y pasárselo a esos dos
    módulos, igual que tras mover un slider de "Corte").

    "callbacks.actualizarAristasDeGrupo" (opcional, default
    no-op): mismo patrón — este panel no conoce
    galeria-panel-material.js ni su técnica interna
    (cuadrícula UV + densidad, ver
    galeria-malla-cuadricula.js), solo sabe que la geometría
    de "group" cambió. Se llama con el "group" recién
    reconstruido como único argumento, en el mismo punto que
    onGeometriaReconstruida. Quien la inyecte (galeria.js) le
    pasa materialPanel.actualizarAristasDeGrupo tal cual.
*/
export function createParamPanel(
    container, bboxesPorIndice = null, callbacks = {}
) {

    const {
        onGeometriaReconstruida,
        actualizarAristasDeGrupo = () => {}
    } = callbacks;

    let elementoActualId = null;


    function limpiar() {

        container.innerHTML = "";
        elementoActualId = null;

    }


    // Reconstruye la geometría del Group con los
    // parámetros actuales, reutilizando las dos mallas
    // (frontal/trasera) que ya existen — no hace falta
    // tocar galeria-escena.js ni el resto del motor de
    // fases. Si este elemento ya tiene un overlay de
    // wireframe (group.userData.overlayMalla, activado
    // desde el panel global de material), también se le
    // refresca la geometría.
    function reconstruirGeometria(
        group, modulo, parametros
    ) {

        const construirGeometria =
            obtenerFuncionConstructora(modulo);

        const nuevaGeometria =
            construirGeometria(parametros);

        // Mismo criterio de alineación (cara frontal en
        // z=0) y mismo recálculo de bbox/sphere que la
        // construcción inicial de la escena (ver
        // normalizarGeometriaElemento() en
        // galeria-escena.js).
        const { bbox } =
            normalizarGeometriaElemento(nuevaGeometria);

        const [mallaFrontal, mallaTrasera] =
            group.userData.mallas;

        const geometriaVieja =
            mallaFrontal.geometry;

        mallaFrontal.geometry = nuevaGeometria;
        mallaTrasera.geometry = nuevaGeometria;

        geometriaVieja.dispose();


        // Recentrar el pivote de rotación: el nuevo bbox
        // puede tener su centro X/Z corrido respecto al
        // anterior — si no se recalcula, el autorotado
        // (galeria-rotacion.js) "orbita" en vez de girar
        // en el lugar.
        posicionarPivote(
            group.userData.pivote,
            mallaFrontal, mallaTrasera,
            bbox
        );


        /*
            Bbox actualizado para quien lo consuma fuera de
            este panel: galeria-carrusel.js (centrado real
            al armar la curva línea->círculo),
            galeria-zoom.js (límites de acercamiento) y las
            cajas de debug.

            NO se toca "restY" acá (el desplazamiento
            vertical GLOBAL de toda la fila, calculado una
            sola vez como el máximo desplazamientoBase de
            todos los elementos — ver galeria-escena.js). Si
            el nuevo desplazamientoBase de este elemento
            superara el restY vigente, quedaría levemente
            enterrado en vez de apoyado, igual que ya puede
            pasar entre elementos distintos de la fila.
            Subir "restY" en caliente movería a TODOS los
            elementos por mover el slider de uno solo — se
            deja fuera a propósito: si hace falta, es un
            paso aparte y explícito.
        */
        if (bboxesPorIndice &&
            group.userData.indice !== undefined) {

            bboxesPorIndice[group.userData.indice] = bbox;

        }


        /*
            Mismo motivo que el paso anterior, pero para
            galeria-corte.js: ese módulo NO relee
            bboxesPorIndice cuadro a cuadro como el carrusel
            — cachea su propio snapshot del bbox en
            cono.userData.corte la primera vez que el
            elemento se activa, y no lo vuelve a tocar hasta
            el próximo cambio de foco. Si el elemento en foco
            ahora mismo en "Corte" es ESTE, y el visitante
            movió un slider de "Geometría" sin cambiar de
            foco, sin este paso el corte real
            (clippingPlanes) seguiría recortando contra el
            bbox VIEJO. No-op si este cono nunca activó
            "Corte" — ver invalidarBboxCono() en
            galeria-corte.js.
        */
        invalidarBboxCono(group, bbox);

        if (onGeometriaReconstruida) {

            onGeometriaReconstruida();

        }


        // Overlay de malla (galeria-panel-material.js es el
        // dueño real de esta lógica: cuadrícula UV +
        // densidad, ver galeria-malla-cuadricula.js). Este
        // panel no conoce esa técnica, solo avisa que la
        // geometría cambió, vía el callback inyectado. No-op
        // si ese grupo nunca tuvo overlay puesto.
        actualizarAristasDeGrupo(group);

    }


    // Arma UN campo — slider si el default es number,
    // switch si es boolean. Cualquier otro tipo se salta
    // con un aviso en consola: no es el caso esperado para
    // parámetros de "Forma" (radios, cantidades, ángulos...).
    function crearCampo(key, valorDefecto, rango, onCambio) {

        if (typeof valorDefecto === "boolean") {

            const boton = document.createElement("button");
            boton.type = "button";
            boton.className = "ficha__switch";
            boton.setAttribute("role", "switch");
            boton.setAttribute(
                "aria-checked", String(valorDefecto)
            );

            const label = document.createElement("span");
            label.className = "ficha__campo-label";
            label.textContent = key;

            const pista = document.createElement("span");
            pista.className = "ficha__switch-pista";
            pista.setAttribute("aria-hidden", "true");

            const perilla = document.createElement("span");
            perilla.className = "ficha__switch-perilla";

            pista.appendChild(perilla);
            boton.appendChild(label);
            boton.appendChild(pista);

            // Expuesto (además del click) para que
            // "Restaurar predeterminados" pueda devolver
            // este switch a su valor por defecto sin
            // simular un click.
            function fijar(valor) {

                boton.setAttribute(
                    "aria-checked", String(valor)
                );

            }

            boton.addEventListener("click", () => {

                const nuevoValor =
                    boton.getAttribute("aria-checked") !==
                        "true";

                fijar(nuevoValor);

                onCambio(nuevoValor);

            });

            return { elemento: boton, fijar };

        }

        if (typeof valorDefecto !== "number") {

            console.warn(
                "galeria-panel-parametros: se salteó " +
                "\"" + key + "\" (tipo \"" +
                typeof valorDefecto + "\" sin control " +
                "nativo todavía)."
            );

            return null;

        }

        const campo = document.createElement("div");
        campo.className = "ficha__campo";

        const inputId =
            "ficha-parametro-" + key;

        const label = document.createElement("label");
        label.className = "ficha__campo-label";
        label.htmlFor = inputId;

        const valorSpan = document.createElement("span");
        valorSpan.className = "ficha__campo-valor";
        valorSpan.textContent =
            formatearValor(valorDefecto);

        label.textContent = key + " ";
        label.appendChild(valorSpan);

        const slider = document.createElement("input");
        slider.type = "range";
        slider.className = "ficha__slider";
        slider.id = inputId;
        slider.min = String(rango.min);
        slider.max = String(rango.max);
        slider.step = String(rango.step);
        slider.value = String(valorDefecto);

        // Separado del listener de "input" (mismo motivo
        // que "fijar" en la rama boolean) para que
        // "Restaurar predeterminados" pueda pintar el
        // slider sin disparar un evento "input" sintético.
        function fijar(valor) {

            slider.value = String(valor);

            valorSpan.textContent =
                formatearValor(valor);

        }

        slider.addEventListener("input", () => {

            const nuevoValor = Number(slider.value);

            fijar(nuevoValor);

            onCambio(nuevoValor);

        });

        campo.appendChild(label);
        campo.appendChild(slider);

        return { elemento: campo, fijar };

    }


    /*
        Botón "Restaurar predeterminados": mismo look que
        los switch de "Opciones de visualización" (reutiliza
        ".ficha__switch"/".ficha__switch-pista"/
        ".ficha__switch-perilla") pero NO es un switch real:
        es una ACCIÓN puntual, así que no lleva role="switch"
        (ese role implicaría un estado persistente que acá
        nunca queda "prendido").

        Al click, togglea aria-checked a "true" para reusar
        la MISMA transición CSS que anima la perilla de
        cualquier ".ficha__switch", y "transitionend" sobre
        esa perilla dispara la vuelta a "false" — se
        reutiliza la transición existente en vez de
        hardcodear una duración aparte.

        Respaldo con setTimeout por si "transitionend" no
        llegara a disparar (transición deshabilitada,
        prefers-reduced-motion). El guard "revirtiendo" evita
        revertir dos veces si ambos llegan a disparar.
    */
    function crearBotonRestaurar(onClick) {

        const boton = document.createElement("button");
        boton.type = "button";
        boton.className =
            "ficha__switch ficha__switch--accion";
        boton.setAttribute("aria-checked", "false");

        const label = document.createElement("span");
        label.className = "ficha__campo-label";
        label.textContent = "Restaurar predeterminados";

        const pista = document.createElement("span");
        pista.className = "ficha__switch-pista";
        pista.setAttribute("aria-hidden", "true");

        const perilla = document.createElement("span");
        perilla.className = "ficha__switch-perilla";

        pista.appendChild(perilla);
        boton.appendChild(label);
        boton.appendChild(pista);

        let revirtiendo = false;

        function volverAtras() {

            if (revirtiendo) return;
            revirtiendo = true;

            boton.setAttribute("aria-checked", "false");

            window.setTimeout(() => {
                revirtiendo = false;
            }, 400);

        }

        boton.addEventListener("click", () => {

            boton.setAttribute("aria-checked", "true");

            perilla.addEventListener(
                "transitionend", volverAtras, { once: true }
            );

            window.setTimeout(volverAtras, 350);

            onClick();

        });

        return boton;

    }


    // Muestra (o actualiza) el panel para el elemento
    // enfocado. Si ya es el mismo elemento, no hace nada
    // (evita reconstruir el DOM en cada frame).
    function mostrar(elementoId, group) {

        if (elementoId === elementoActualId) return;

        limpiar();

        elementoActualId = elementoId;


        const modulo = group.userData.modulo;

        const defaults =
            modulo && modulo.PARAMETROS_DEFECTO;

        // Si el módulo no expone parámetros (generador sin
        // export de defaults), no se arma panel.
        if (!defaults) return;

        // Ver "RANGOS DE LOS SLIDERS" en la cabecera:
        // todavía ningún generador exporta PARAMETROS_RANGO,
        // así que esto siempre cae en calcularRango() — se
        // lee igual para no tener que tocar este archivo el
        // día que algún generador sí lo traiga.
        const rangos = modulo.PARAMETROS_RANGO || {};

        const parametros = { ...defaults };

        // Clave -> "fijar" de cada control ya armado, para
        // que el botón de restaurar pueda repintar
        // sliders/switches sin reconstruir el DOM.
        const controles = {};

        Object.keys(parametros).forEach(key => {

            const rango =
                rangos[key] ||
                calcularRango(defaults[key]);

            const resultado =
                crearCampo(
                    key, parametros[key], rango,
                    nuevoValor => {

                        parametros[key] = nuevoValor;

                        reconstruirGeometria(
                            group, modulo, parametros
                        );

                    }
                );

            if (!resultado) return;

            controles[key] = resultado.fijar;
            container.appendChild(resultado.elemento);

        });

        // Solo tiene sentido si se armó al menos un control
        // arriba. Va al final, después de todos los
        // sliders/switches — es la acción sobre TODOS ellos.
        // Reconstruye la geometría UNA sola vez con todos
        // los defaults ya aplicados, no una vez por
        // parámetro.
        if (Object.keys(controles).length > 0) {

            const botonRestaurar =
                crearBotonRestaurar(() => {

                    Object.keys(defaults).forEach(key => {

                        parametros[key] = defaults[key];

                        if (controles[key]) {
                            controles[key](defaults[key]);
                        }

                    });

                    reconstruirGeometria(
                        group, modulo, parametros
                    );

                });

            container.appendChild(botonRestaurar);

        }

    }


    return { mostrar, limpiar };

}
