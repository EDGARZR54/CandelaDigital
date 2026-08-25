/* ==================================================
   galeria-panel-parametros.js

   Panel de controles NATIVO (sliders, misma clase
   ".ficha__slider" que ya usan los planos de corte)
   para la fase C: deja ajustar en vivo los parámetros
   de la fórmula procedural del elemento actualmente
   enfocado en el carrusel (sección "Geometría").

   YA NO ES lil-gui: mismo motivo que
   galeria-panel-material.js (ver la cabecera de ese
   archivo) — un widget con su propia tipografía/
   bordes/sombra adentro de una sección que YA es
   colapsable por su cuenta sobraba. Acá además hay
   una segunda vuelta de tuerca: los campos de lil-gui
   eran number-drag (arrastrar un número de texto) sin
   límites — ahora son sliders de verdad, así que hacen
   falta min/max/step por parámetro, que antes lil-gui
   no necesitaba.

   El tipo de material (sólido/estado/normales/ninguno) y
   la malla YA NO viven acá: son una configuración
   global de toda la escena, visible desde la fase A
   (ver galeria-panel-material.js). Este módulo solo
   se preocupa de reconstruir la GEOMETRÍA del
   elemento enfocado — y, si ese elemento ya tiene un
   overlay de malla activado por el panel global, de
   avisarle a ese mismo panel (vía
   "callbacks.actualizarAristasDeGrupo", ver más abajo)
   para que lo mantenga sincronizado con la nueva
   geometría — este panel no conoce la técnica real
   (cuadrícula UV/densidad, ver
   galeria-malla-cuadricula.js), sólo el momento en que
   hay que refrescarla.

   IMPORTANTE — este panel no conoce de antemano los
   parámetros de NINGÚN generador: arma sus controles
   dinámicamente a partir de las claves de
   PARAMETROS_DEFECTO que exporte el módulo del
   elemento enfocado. Así sigue funcionando sin
   tocarse aunque los generadores cambien sus
   parámetros más adelante.

   RANGOS DE LOS SLIDERS — DOS FUENTES POSIBLES:

     1) "PARAMETROS_RANGO" (opcional): si el módulo del
        generador exporta este objeto junto a
        PARAMETROS_DEFECTO, con la forma
        "{ clave: { min, max, step } }", se usa TAL
        CUAL — es la fuente real cuando cada geometría
        ya sabe describir sus propios límites (p. ej.
        un radio no puede ser negativo, una cantidad de
        lados tiene que ser entera). NINGÚN generador
        lo exporta todavía.

     2) Heurística genérica (calcularRango más abajo):
        para cualquier clave SIN entrada en
        PARAMETROS_RANGO, arma un rango proporcional al
        valor por defecto, con una única regla fija —
        pedida explícitamente: NUNCA tocar 0 (evita
        geometría degenerada tipo radio/lados en cero)
        — todo lo demás (nombres legibles como "Radio"
        en vez de "r", límites reales por geometría,
        enteros vs. continuos) queda pendiente a
        propósito: se agrega geometría por geometría
        el día que haga falta, vía PARAMETROS_RANGO,
        sin tener que tocar este archivo de nuevo.

   No sabe nada de "edificios": solo recibe el Group
   ya construido (con su modulo/mallas en
   group.userData, ver galeria-escena.js) y un nombre
   para el título.
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
    real del parámetro, solo escala a partir de su
    valor por defecto.

    - Si el default es 0 (o no es un número finito): no
      hay escala de la que partir — rango simétrico fijo
      de respaldo. Es el único caso donde el slider SÍ
      puede llegar a 0 a mitad de camino (el propio
      default ya es 0); ver la cabecera del archivo, se
      resuelve geometría por geometría con
      PARAMETROS_RANGO cuando haga falta.

    - Si el default es distinto de 0: el rango va de una
      FRACCIÓN del valor (25%) hasta un MÚLTIPLO (3x),
      conservando el signo — así el 0 nunca queda
      adentro del rango ("nunca tocar 0", pedido
      explícito), y el default siempre cae bien adentro
      del recorrido del slider, ni pegado a una punta ni
      a la otra.
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
    galeria-carrusel.js / galeria-zoom.js / las cajas de
    debug no sigan viendo el bbox con el que se armó la
    escena la primera vez. Si no se pasa (por ejemplo,
    mientras se termina de cablear en galeria.js), el
    panel sigue funcionando igual — solo que esos otros
    módulos quedan con el bbox stale hasta el próximo
    reload, como pasaba antes de este fix.

    "callbacks.onGeometriaReconstruida" (opcional): mismo
    patrón de "inyectar, no importar" que ya usa el resto de
    esta página (getManualOffset, onCambioEje/onInvertirEje,
    onElementoCambiado — ver galeria.js) — este panel no
    conoce a galeria-corte-interseccion.js ni a
    galeria-plano-corte.js, así que no puede refrescarlos
    directamente. Se llama SIN argumentos, después de
    invalidarBboxCono(), cada vez que se reconstruye la
    geometría de un elemento — sea por un slider individual
    o por "Restaurar predeterminados" (ambos casos pasan por
    la misma reconstruirGeometria() de más abajo, así que
    alcanza con este único punto). Quien la inyecte
    (galeria.js) decide qué hacer con eso (típicamente,
    releer corte.obtenerEstadoActivo() y pasárselo a esos dos
    módulos, igual que ya hace tras mover un slider de
    "Corte" — ver ese archivo). Sin esto, esos dos overlays
    visuales (curva de intersección, cuadrado del plano)
    seguirían mostrando el corte contra el bbox VIEJO hasta
    el próximo evento de "Corte" genuino, aunque el corte
    REAL (clippingPlanes) ya esté al día por invalidarBboxCono().

    "callbacks.actualizarAristasDeGrupo" (opcional, default
    no-op): mismo patrón "inyectar, no importar" que el
    callback de arriba — este panel no conoce
    galeria-panel-material.js (el dueño real del overlay de
    malla) ni su técnica interna (cuadrícula UV + densidad,
    ver galeria-malla-cuadricula.js), sólo sabe que la
    geometría de "group" cambió y hay que avisar. Se llama
    con el "group" recién reconstruido como único argumento,
    en el mismo punto que onGeometriaReconstruida (ver
    reconstruirGeometria() más abajo). Quien la inyecte
    (galeria.js) le pasa materialPanel.actualizarAristasDeGrupo
    tal cual, sin envolverla. Sin esto, un elemento con
    "Mostrar malla" ya activado seguiría mostrando la
    cuadrícula/wireframe de la forma ANTERIOR hasta el
    próximo toque de densidad o del switch global.
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

        /*
            Mismo criterio de alineación (cara frontal en
            z=0) y mismo recálculo de bounding box/sphere
            que usa la construcción inicial de la escena
            (ver normalizarGeometriaElemento() en
            galeria-escena.js) — sin esto, cada slider de
            "Geometría" dejaba la geometría cruda del
            generador: sin alinear con su slot.z, con el
            bbox/sphere del objeto ANTERIOR (raycasting y
            frustum culling desactualizados), y con el
            pivote de rotación apuntando al centro viejo.
            Ver geometria-recalculo-centroide.md.
        */
        const { bbox } =
            normalizarGeometriaElemento(nuevaGeometria);

        const [mallaFrontal, mallaTrasera] =
            group.userData.mallas;

        const geometriaVieja =
            mallaFrontal.geometry;

        mallaFrontal.geometry = nuevaGeometria;
        mallaTrasera.geometry = nuevaGeometria;

        geometriaVieja.dispose();


        /*
            Recentrar el pivote de rotación: el nuevo
            bbox puede tener su centro X/Z corrido
            respecto al anterior. Sin este paso, el
            pivote queda desalineado del bbox nuevo y el
            autorotado (galeria-rotacion.js) vuelve a
            "orbitar" en vez de girar en el lugar — el
            síntoma reportado originalmente.
        */
        posicionarPivote(
            group.userData.pivote,
            mallaFrontal, mallaTrasera,
            bbox
        );


        /*
            Bbox actualizado para quien lo consuma fuera
            de este panel: galeria-carrusel.js (centrado
            real al armar la curva línea->círculo),
            galeria-zoom.js (límites de acercamiento) y
            las cajas de debug. Sin esto, todos ellos
            seguirían viendo el bbox con el que se armó
            la escena la primera vez.

            NO se toca "restY" acá (el desplazamiento
            vertical GLOBAL de toda la fila, calculado
            una sola vez como el máximo desplazamientoBase
            de todos los elementos — ver su comentario en
            galeria-escena.js). Si el nuevo
            desplazamientoBase de este elemento superara
            el restY vigente, quedaría levemente enterrado
            en vez de apoyado, igual que ya puede pasar
            hoy entre elementos distintos de la fila.
            Subir "restY" en caliente movería a TODOS los
            elementos por mover el slider de uno solo —
            se deja fuera de este fix a propósito; si hace
            falta, es un paso aparte y explícito, no un
            efecto colateral de tocar un slider.
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


        /*
            Overlay de malla (ver galeria-panel-material.js,
            que es el dueño real de esta lógica desde que
            dejó de ser un simple WireframeGeometry íntegro:
            ahora detecta cuadrícula UV + densidad, ver
            galeria-malla-cuadricula.js). Este panel no
            conoce esa técnica ni falta que le hace — sólo
            avisa que la geometría cambió, vía el callback
            inyectado (mismo patrón "inyectar, no importar"
            que onGeometriaReconstruida, arriba). No-op
            interno si ese grupo nunca tuvo overlay puesto
            (ver el guard adentro de
            actualizarAristasDeGrupo).
        */
        actualizarAristasDeGrupo(group);

    }


    /*
        Arma UN campo — slider si el default es number,
        switch si es boolean. Cualquier otro tipo (string,
        function, etc.) se salta con un aviso en consola:
        no es el caso esperado para parámetros de "Forma"
        (radios, cantidades, ángulos...), así que no vale
        la pena inventarle un control genérico.
    */
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

            /*
                "fijar" queda expuesto (además del click) para
                que "Restaurar predeterminados" pueda devolver
                este switch a su valor por defecto sin
                simular un click ni duplicar la lógica de
                pintado acá y allá.
            */
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

        /*
            Mismo motivo que "fijar" en la rama boolean de
            más arriba: separado del listener de "input" para
            que "Restaurar predeterminados" pueda pintar el
            slider (posición + número al lado) sin disparar
            un evento "input" sintético.
        */
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
        los switch de "Opciones de visualización" (Autorotado,
        Mostrar plano de corte...) — reutiliza las clases
        ".ficha__switch"/".ficha__switch-pista"/
        ".ficha__switch-perilla" para no introducir un
        estilo nuevo — pero NO es un switch real: es una
        ACCIÓN puntual (restaurar), así que a propósito no
        lleva role="switch" (ese role le diría a un lector
        de pantalla que hay un estado que persiste, y acá
        nunca queda "prendido").

        "Se regresa automáticamente" (pedido explícito): al
        click, togglea aria-checked a "true" para reusar la
        MISMA transición CSS que ya anima la perilla de
        cualquier ".ficha__switch" al cambiar de estado — y
        "transitionend" sobre esa perilla dispara la vuelta
        a "false". Se reutiliza la transición que ya existe
        en vez de inventar una animación aparte o
        hardcodear acá una duración que se desincronice si
        el timing de ".ficha__switch" cambia en galeria.css.

        Respaldo con setTimeout: por si "transitionend" no
        llegara a disparar en algún caso (transición
        deshabilitada, prefers-reduced-motion, la variante
        sin role="switch" no matchea el mismo selector CSS
        que las demás) — sin esto, un click en ese escenario
        dejaría el botón visualmente trabado en "prendido"
        para siempre. El guard "revirtiendo" evita que
        "transitionend" y el setTimeout de respaldo intenten
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


    /*
        Muestra (o actualiza) el panel para el
        elemento enfocado. Si ya es el mismo
        elemento, no hace nada (evita reconstruir el
        DOM en cada frame).

        Ya NO recibe "elemento" (el objeto con
        ".nombre") — era el único uso que tenía, para
        el título con el nombre del elemento enfocado,
        sacado por pedido explícito: la ficha ya
        muestra ese nombre en grande, era redundante
        repetirlo acá adentro.
    */
    function mostrar(elementoId, group) {

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

        /*
            Ver "RANGOS DE LOS SLIDERS" en la cabecera:
            todavía ningún generador lo exporta, así que
            hoy esto siempre cae en la heurística de
            calcularRango() de más abajo — queda leído
            igual para no tener que volver a tocar este
            archivo el día que algún generador sí lo
            traiga.
        */
        const rangos = modulo.PARAMETROS_RANGO || {};

        const parametros = { ...defaults };

        /*
            Clave -> "fijar" de cada control ya armado, para
            que el botón de restaurar (más abajo) pueda
            repintar sliders/switches sin volver a construir
            el DOM ni duplicar la lógica de crearCampo().
        */
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

        /*
            Solo tiene sentido si se armó al menos un
            control arriba (si "defaults" viniera vacío no
            habría nada que restaurar). Va AL FINAL, después
            de todos los sliders/switches — es la acción
            sobre TODOS ellos, no un campo más de la lista.

            Reconstruye la geometría UNA sola vez con todos
            los valores por defecto ya aplicados, no una vez
            por parámetro — mismo criterio que reconstruir
            de a un slider por vez durante el arrastre normal,
            pero acá no hace falta ir campo por campo porque
            no hay feedback visual intermedio que preservar.
        */
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
