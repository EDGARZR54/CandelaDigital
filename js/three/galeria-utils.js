/* ==================================================
   galeria-utils.js

   Funciones puras, sin dependencias de Three.js ni
   del DOM. Se usan desde los distintos controladores
   de fase y desde galeria-escena.js.

   Única excepción: fijarOpacidadPanel, al final del
   archivo — sí escribe sobre el DOM, pero solo sobre
   elementos que recibe por parámetro (nunca los busca
   ella misma). Vive acá porque no pertenece a ninguna
   fase en particular: la usan hero, proyecto, revelado
   y fichas por igual, así que un módulo de fase
   cualquiera sería un dueño arbitrario.
================================================== */


/*
    Ease "in-out" cuadrático. Se usa para casi todas
    las transiciones (revelado, reordenamiento).
*/

export function ease(t) {

    return t < .5

        ? 2 * t * t

        : 1 -
          Math.pow(-2 * t + 2, 2) / 2;

}


/*
    Curva suave 0→1 con derivada nula en los
    extremos (evita "tirones" al entrar/salir de un
    estado).
*/

export function smoothstep(x) {

    x =
        Math.min(1, Math.max(0, x));

    return x * x * (3 - 2 * x);

}


/*
    Envolvente para la animación de reordenamiento:
    sube, se mantiene, baja — usada para el arco en
    Z y el "pop" de escala mientras un elemento está
    en movimiento.
*/

export function liftEnvelope(t, ramp = .28) {

    if (t < ramp) {

        return smoothstep(t / ramp);

    }

    if (t > 1 - ramp) {

        return smoothstep(
            (1 - t) / ramp
        );

    }

    return 1;

}


/*
    Anti "z-fighting" / anti-colisión para el
    reordenamiento: dos elementos solo pueden llegar
    a solaparse si sus recorridos horizontales (en X)
    se solapan. Se resuelve con "interval
    partitioning": se ordenan los movimientos por su
    inicio y se le da a cada uno el primer "carril"
    (nivel) libre.

    Cada movimiento en "movements" debe tener
    { from: {x}, to: {x} }. La función le agrega
    "level", "layer" (-1 o 1) y "layerMagnitude" a
    cada uno, mutándolos in-place.
*/

export function assignLayers(movements) {

    const items =
        movements.map(m => ({
            m,
            start: Math.min(m.from.x, m.to.x),
            end: Math.max(m.from.x, m.to.x)
        }));


    items.sort(
        (a, b) => a.start - b.start
    );


    const levelEnds = [];


    items.forEach(item => {

        let level =
            levelEnds.findIndex(
                end => end <= item.start
            );


        if (level === -1) {

            level = levelEnds.length;

            levelEnds.push(0);

        }


        levelEnds[level] = item.end;

        item.m.level = level;

    });


    items.forEach(item => {

        const level = item.m.level;

        item.m.layer =
            level % 2 === 0 ? -1 : 1;

        item.m.layerMagnitude =
            Math.floor(level / 2) + 1;

    });

}



/* ==================================================
   PROYECCIÓN DE CÁMARA (para auto-centrar la fila)

   Réplica en JS puro de cómo Three.js proyecta un
   punto del mundo a coordenadas de pantalla (NDC),
   para una PerspectiveCamera con lookAt. No depende
   de THREE: solo vectores y trigonometría, así se
   puede probar de forma aislada.

   findCenteredLookAtX(), más abajo, resuelve el
   centrado de la fila por bisección sobre esta misma
   proyección — ver el comentario de esa función para
   el detalle de por qué se descartó el Newton-Raphson
   de Encuadre.htm en favor de un método acotado.
================================================== */


function normalize3(v) {

    const len =
        Math.hypot(v.x, v.y, v.z) || 1;

    return {
        x: v.x / len,
        y: v.y / len,
        z: v.z / len
    };

}


function cross3(a, b) {

    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
    };

}


function dot3(a, b) {

    return a.x * b.x + a.y * b.y + a.z * b.z;

}


/*
    Proyecta "worldPoint" a NDC (-1..1 en cada eje)
    para una cámara ubicada en "cameraPos", mirando
    hacia "lookAt", con campo de visión vertical
    "fovDeg" y relación de aspecto "aspect".
*/

export function projectToNdc(
    cameraPos, lookAt, worldPoint, fovDeg, aspect
) {

    const up = { x: 0, y: 1, z: 0 };


    const forward =
        normalize3({
            x: lookAt.x - cameraPos.x,
            y: lookAt.y - cameraPos.y,
            z: lookAt.z - cameraPos.z
        });

    const back = {
        x: -forward.x,
        y: -forward.y,
        z: -forward.z
    };

    const right =
        normalize3(
            cross3(up, back)
        );

    const camUp =
        cross3(back, right);


    const v = {
        x: worldPoint.x - cameraPos.x,
        y: worldPoint.y - cameraPos.y,
        z: worldPoint.z - cameraPos.z
    };

    const cx = dot3(v, right);
    const cy = dot3(v, camUp);
    const cz = dot3(v, back);

    const dist = -cz;

    const halfV =
        Math.tan(fovDeg * Math.PI / 360);

    const halfH = halfV * aspect;

    return {
        x: cx / (dist * halfH),
        y: cy / (dist * halfV)
    };

}


/*
    Busca la coordenada X del punto de mira que deja
    centrada (en X) la fila de elementos — sin importar
    cuántos sean ni cómo esté ubicada la cámara. Se usa
    al armar la escena y en cada resize (ver
    galeria-escena.js), para que el encuadre siga
    funcionando aunque cambie la cantidad de elementos
    o el aspecto de la ventana.

    Tercera versión de esta función:

    1) La primera hacía un barrido exhaustivo (400
       pasos) sobre el PUNTO CENTRAL de cada slot. Eso
       no es lo mismo que centrar la SILUETA proyectada
       del conjunto: con la cámara casi en el eje de la
       fila ("lineup shot"), el escorzo de perspectiva
       no es lineal (ver encuadre-camara.md).

    2) La segunda versión pasó a recibir "worldVertices"
       — los 8 vértices de bounding box por elemento, en
       mundo (los arma galeria-escena.js, ver
       verticesMundoDeFila) — para centrar la silueta
       real en vez de puntos-centro, y cambió el método
       de búsqueda a Newton-Raphson (adaptado del
       solver 2×2 de Encuadre.htm, reducido a 1 variable
       ya que acá sólo se ajusta lookAtX, nunca la
       cámara ni lookAtY/lookAtZ). Esa versión tenía un
       defecto: al no tener ninguna cota (sólo el paso
       por iteración estaba acotado, no "x" en sí), la
       derivada por diferencias finitas podía dispararse
       cuando algún vértice —típicamente del elemento
       más cercano a la cámara— quedaba, durante alguna
       iteración intermedia, casi de canto respecto a la
       dirección de vista (profundidad "dist" en
       projectToNdc cercana a 0, ver esa función). El
       solver terminaba compensando ese único vértice
       patológico moviendo lookAtX MUY lejos del rango
       físico real de la fila — un lookAtX así no
       corresponde a ningún encuadre razonable: abre/
       cierra el ángulo de la cámara de un modo que hace
       que los elementos se amontonen entre sí en
       pantalla (oclusión) y que el primero pueda quedar
       directamente fuera del frustum.

    Esta tercera versión conserva el insumo correcto
    (los vértices de bounding box de la silueta
    completa) pero cambia el método de búsqueda a
    BISECCIÓN, acotada desde el arranque al rango
    [min(x), max(x)] de esos mismos vértices — la
    función error(x) (ver más abajo) es monótona en ese
    rango para una cámara fija con este tipo de "lineup
    shot" (correr el punto de mira a lo largo del eje de
    la fila desplaza la silueta proyectada siempre en el
    mismo sentido), así que no hace falta derivada:
    alcanza con partir el intervalo a la mitad en cada
    paso. A diferencia de Newton, la bisección NUNCA
    puede salir de ese intervalo — es, por construcción,
    la misma garantía de acotamiento que ya tenía el
    barrido original (versión 1), pero ahora aplicada
    sobre la silueta real en vez de los centros de slot.
*/

export function findCenteredLookAtX(
    cameraPos,
    lookAtY,
    lookAtZ,
    worldVertices,
    fovDeg,
    aspect
) {

    if (worldVertices.length === 0) return 0;

    const xs =
        worldVertices.map(v => v.x);

    let lo = Math.min(...xs);
    let hi = Math.max(...xs);


    /*
        error(candidateX): promedio de los extremos
        (min/max) de la proyección NDC en X de TODOS
        los vértices de bounding box de la fila, para
        un punto de mira candidato. 0 = silueta
        perfectamente centrada.
    */

    function error(candidateX) {

        const lookAt =
            { x: candidateX, y: lookAtY, z: lookAtZ };

        const ndcXs =
            worldVertices.map(v =>
                projectToNdc(
                    cameraPos,
                    lookAt,
                    v,
                    fovDeg,
                    aspect
                ).x
            );

        return (
            Math.min(...ndcXs) +
            Math.max(...ndcXs)
        ) / 2;

    }


    let errLo = error(lo);
    let errHi = error(hi);

    if (errLo === 0) return lo;
    if (errHi === 0) return hi;

    /*
        Si el error no cambia de signo entre los dos
        extremos físicos de la fila, no hay ningún
        lookAtX DENTRO de ese rango que centre del todo
        la silueta (puede pasar con geometrías muy
        asimétricas). En vez de extrapolar hacia afuera
        del rango —que es exactamente el
        comportamiento que causaba el bug reportado—,
        nos quedamos en el extremo con menor error
        absoluto: sigue siendo un lookAtX dentro de la
        fila, nunca un ángulo de cámara degenerado.
    */

    if ((errLo > 0) === (errHi > 0)) {

        return Math.abs(errLo) < Math.abs(errHi)
            ? lo
            : hi;

    }


    const maxIter = 60;
    const tol = 1e-6;

    for (let iter = 0; iter < maxIter; iter++) {

        const mid = (lo + hi) / 2;

        if (hi - lo < 1e-9) return mid;

        const errMid = error(mid);

        if (Math.abs(errMid) < tol) return mid;


        if ((errMid > 0) === (errLo > 0)) {

            lo = mid;
            errLo = errMid;

        } else {

            hi = mid;
            errHi = errMid;

        }

    }


    return (lo + hi) / 2;

}


/* ==================================================
   AJUSTE DE ANCHO ("fit to width"), para pantallas
   verticales (celular)

   findCenteredLookAtX() (arriba) resuelve "¿qué
   lookAtX deja la silueta centrada?", pero no toca
   ni el tamaño ni el margen con el que esa silueta
   entra en cuadro — eso lo gobierna, hoy, un valor
   fijo (config.camera.margenRasante) calibrado a
   mano para pantallas apaisadas.

   En una ventana VERTICAL (celular, o cualquier
   ventana angosta), el FOV horizontal es mucho más
   angosto que el vertical (a igual FOV vertical fijo,
   FOVh = 2·atan(tan(FOVv/2)·aspect), y aspect < 1) —
   así que, a la misma distancia calibrada para
   escritorio, la fila (bien horizontal, muchos
   elementos en X) queda recortada por los bordes
   izquierdo/derecho en vez de entrar completa.

   findFittedMagnitude() resuelve, por bisección
   —mismo criterio que findCenteredLookAtX(), acotado
   y sin extrapolar—, la MAGNITUD (distancia de cámara,
   como fracción del ancho de la fila — ver
   "margenRasante"/"cameraPosFromMagnitude" en
   galeria-escena.js) que deja el ANCHO PROYECTADO de
   la silueta ocupando el cuadro completo, de borde a
   borde (NDC de -1 a 1 en X), sin margen y sin
   recortar nada.
*/

export function findFittedMagnitude(
    cameraPosFromMagnitude,
    lookAtY,
    lookAtZ,
    worldVertices,
    fovDeg,
    aspect,
    magnitudMin,
    magnitudMax
) {

    if (worldVertices.length === 0) return magnitudMin;


    /*
        anchoProyectado(m): ancho NDC (der - izq) de la
        silueta completa, para una cámara ubicada según
        "cameraPosFromMagnitude(m)" y YA CENTRADA para
        esa posición (bisección anidada sobre
        findCenteredLookAtX, la misma función que ya
        centra la fila en cualquier otro lado de la
        app — así el ajuste de ancho nunca se calcula
        sobre un encuadre descentrado).

        Monótona DECRECIENTE en m: más lejos (m mayor)
        siempre se ve más chico, sin excepción —
        garantiza que la bisección converja igual que
        en findCenteredLookAtX.
    */

    function anchoProyectado(m) {

        const candidateCameraPos =
            cameraPosFromMagnitude(m);

        const lookAtX =
            findCenteredLookAtX(
                candidateCameraPos,
                lookAtY,
                lookAtZ,
                worldVertices,
                fovDeg,
                aspect
            );

        const lookAt =
            { x: lookAtX, y: lookAtY, z: lookAtZ };

        const ndcXs =
            worldVertices.map(v =>
                projectToNdc(
                    candidateCameraPos,
                    lookAt,
                    v,
                    fovDeg,
                    aspect
                ).x
            );

        return Math.max(...ndcXs) - Math.min(...ndcXs);

    }


    /*
        error(m) = 0 cuando el ancho proyectado ocupa
        EXACTAMENTE el cuadro completo (de -1 a 1 => 2
        de ancho NDC). Positivo = sobra ancho (se
        recorta), negativo = falta ancho (queda con
        margen).
    */

    function error(m) {

        return anchoProyectado(m) - 2;

    }


    let lo = magnitudMin;
    let hi = magnitudMax;

    let errLo = error(lo);
    let errHi = error(hi);

    if (errLo === 0) return lo;
    if (errHi === 0) return hi;

    /*
        Mismo resguardo que findCenteredLookAtX: si no
        hay cambio de signo dentro del rango dado, nos
        quedamos en el extremo con menor error absoluto
        en vez de extrapolar hacia una magnitud fuera
        de rango (una cámara demasiado cerca/lejos deja
        de ser un encuadre razonable).
    */

    if ((errLo > 0) === (errHi > 0)) {

        return Math.abs(errLo) < Math.abs(errHi)
            ? lo
            : hi;

    }


    const maxIter = 60;
    const tol = 1e-4;

    for (let iter = 0; iter < maxIter; iter++) {

        const mid = (lo + hi) / 2;

        if (hi - lo < 1e-6) return mid;

        const errMid = error(mid);

        if (Math.abs(errMid) < tol) return mid;


        /*
            Monótona DECRECIENTE (a diferencia de
            findCenteredLookAtX, que no asume signo):
            errMid > 0 (sobra ancho) => hay que alejar
            la cámara => mover el piso "lo" hacia acá.
            errMid < 0 (falta ancho) => acercar la
            cámara => mover el techo "hi" hacia acá.
        */

        if (errMid > 0) {

            lo = mid;
            errLo = errMid;

        } else {

            hi = mid;
            errHi = errMid;

        }

    }


    return (lo + hi) / 2;

}


/* ==================================================
   "DROP" PARA ESCONDER ELEMENTOS FUERA DE CUADRO
   (fases "revelado"/"fichas" — ver
   galeria-revelado.js / galeria-carrusel.js)

   Esas dos fases necesitan que ciertos elementos
   arranquen (o terminen) bien abajo, fuera del
   frustum de la cámara, y suban hasta su lugar de
   reposo. Antes, "cuánto" era una magnitud fija en
   unidades de mundo (config.reveal.hiddenDrop = 7),
   calibrada a mano para un encuadre de escritorio.

   El problema: desde que la cámara hace "dolly" en
   pantallas verticales (ver
   calcularMagnitudRasante/findFittedMagnitude en
   galeria-escena.js), la distancia cámara↔fila ya NO
   es fija — puede terminar bastante más lejos en
   celular que en escritorio. A más distancia, la
   MISMA magnitud fija en unidades de mundo cubre
   MENOS pantalla (el frustum, medido en unidades de
   mundo, se agranda con la distancia) — así, un
   "drop" calibrado para escritorio puede no alcanzar
   para esconder del todo un elemento en otros
   aspectos de ventana. Es exactamente lo que se
   reportó viendo las cajas de debug asomando en la
   esquina superior derecha en pantallas angostas.

   findHiddenDrop() resuelve, por bisección —mismo
   criterio que findFittedMagnitude(), acotado y sin
   extrapolar—, el MENOR "drop" (en unidades de
   mundo, restado a la Y de cada elemento) tal que el
   punto MÁS ALTO de CUALQUIERA de los elementos,
   bajado ese tanto, proyecte por debajo del borde
   inferior real de pantalla (NDC.y = -1), con un
   margen extra (margenNdc) para que no quede apenas
   rozando el borde.
================================================== */

export function findHiddenDrop(
    cameraPos,
    lookAt,
    fovDeg,
    aspect,
    puntosSuperiores,
    margenNdc,
    dropMin,
    dropMax
) {

    if (puntosSuperiores.length === 0) return dropMin;

    const targetNdcY = -1 - margenNdc;


    /*
        peorNdcY(drop): el NDC.y MÁS ALTO (el que
        menos "escondido" queda) entre todos los
        puntos más altos de cada elemento, bajados
        "drop" unidades. Monótona DECRECIENTE en drop
        —a más drop, todo baja, así que el peor caso
        también baja— misma garantía de convergencia
        que anchoProyectado() en findFittedMagnitude.
    */

    function peorNdcY(drop) {

        let peor = -Infinity;

        puntosSuperiores.forEach(punto => {

            const bajado = {
                x: punto.x,
                y: punto.y - drop,
                z: punto.z
            };

            const ndcY =
                projectToNdc(
                    cameraPos,
                    lookAt,
                    bajado,
                    fovDeg,
                    aspect
                ).y;

            if (ndcY > peor) peor = ndcY;

        });

        return peor;

    }


    /*
        error(drop) = 0 cuando el peor caso queda
        justo en el borde con el margen pedido.
        Positivo = todavía asoma (hace falta más
        drop). Negativo = ya está de sobra escondido.
    */

    function error(drop) {

        return peorNdcY(drop) - targetNdcY;

    }


    let lo = dropMin;
    let hi = dropMax;

    let errLo = error(lo);
    let errHi = error(hi);

    if (errLo <= 0) return lo;
    if (errHi > 0) return hi;

    /*
        Mismo resguardo que los otros dos solvers: si
        ni el máximo drop del rango alcanza a esconder
        el peor caso, nos quedamos con ese máximo (el
        mejor esfuerzo posible dentro de un rango
        razonable) en vez de extrapolar hacia un drop
        arbitrariamente grande.
    */

    const maxIter = 60;
    const tol = 1e-4;

    for (let iter = 0; iter < maxIter; iter++) {

        const mid = (lo + hi) / 2;

        if (hi - lo < 1e-6) return mid;

        const errMid = error(mid);

        if (Math.abs(errMid) < tol) return mid;


        if (errMid > 0) {

            lo = mid;
            errLo = errMid;

        } else {

            hi = mid;
            errHi = errMid;

        }

    }


    return (lo + hi) / 2;

}


/* ==================================================
   fijarOpacidadPanel(panel, elementoInteractivo, opacidad)

   hero/proyecto quedan "clavados" (position: absolute)
   sobre TODA la ventana, en un z-index (4) por encima
   de "#scene" — su opacidad llega a 0 en cuanto se sale
   de su fase, pero opacity:0 NO apaga pointer-events: el
   bloque de texto reactivado (heroTexto/proyectoContenedor,
   ver galeria-dom.js) seguía robándole el clic al canvas
   de más abajo en TODAS las demás fases, "fichas"
   incluida — el arrastre para rotar la geometría en foco
   (ver galeria-interaccion-ficha.js) nunca le llegaba al
   raycaster porque el pointerdown se quedaba en este
   bloque invisible antes de tocar el <canvas> (bug
   reportado: "no me deja rotar").

   Esta única función reemplaza toda asignación directa
   de "<panel>.style.opacity" en galeria.js, así opacidad
   y pointer-events viajan siempre juntos y no puede
   repetirse el mismo bug en otro lado si se agrega una
   fase nueva.
================================================== */

export function fijarOpacidadPanel(
    panel, elementoInteractivo, opacidad
) {

    panel.style.opacity = opacidad;

    elementoInteractivo.style.pointerEvents =
        opacidad > 0 ? "auto" : "none";

}
