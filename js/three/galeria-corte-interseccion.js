/* ==================================================
   galeria-corte-interseccion.js

   Switch "Mostrar intersección" (ver "#boton-mostrar-
   interseccion", sección "Corte" del panel derecho). Dibuja,
   para los 3 ejes (X/Y/Z) del elemento en foco, la curva donde
   ESE plano cruza la geometría: la silueta del corte, no el
   corte en sí (eso ya lo hace "clippingPlanes" en
   galeria-corte.js — este módulo solo resalta el borde).

   YA NO filtra por "percent < 1" (mismo pedido explícito que
   ya se aplicó en galeria-plano-corte.js): se recalculan los 3
   ejes siempre, no solo los que estén "cortando de verdad". En
   la práctica esto rara vez cambia lo que se VE en los
   extremos (percent=0 o 1): el algoritmo de más abajo ya
   descarta triángulos sin cruce, y justo en el borde del bbox
   casi nunca hay uno — pero evita depender de un umbral
   arbitrario, y el recorte cruzado entre ejes (ver más abajo)
   pasa a aplicarse de forma consistente contra los 3 ejes
   siempre, no solo contra los que resultaban "activos" bajo el
   filtro viejo.

   NO conoce el DOM (mismo criterio que galeria-corte.js: el
   switch en sí vive cableado desde galeria.js, acá solo entra
   un booleano vía "setActivo"). Tampoco conoce sliders ni
   botones de invertir — recibe el estado ya resuelto de
   galeria-corte.js vía "obtenerEstadoActivo()", inyectado por
   galeria.js en cada momento en que algo pudo haber cambiado
   (cambio de foco, mover un slider, invertir un eje, prender
   el switch). Nunca se llama desde el tick de cada frame — no
   hay ninguna razón para recalcular geometría 60 veces por
   segundo si el visitante no tocó nada.

   ====================================================
   POR QUÉ RECORTAR CONTRA LOS OTROS EJES ACTIVOS:

   Con más de un eje cortando a la vez (corte tipo "esquina",
   p.ej. X e Y con percent<1 simultáneo), la curva de X sola
   pasaría por zonas que el corte de Y ya se comió — se vería
   una línea "de más", saliendo del sólido visible. Por eso,
   antes de dibujar la curva de un eje, se recorta cada
   segmento contra los planos LOCALES de los otros 2 ejes
   (mismo criterio que decide qué fragmento sobrevive en
   "clippingPlanes": conservar el lado con
   plane.distanceToPoint >= 0) — sin importar si esos otros
   ejes están en su default o no: un eje en percent=1 recorta
   contra el borde mismo del bbox, así que no le saca nada de
   más al segmento (es un no-op geométrico, no hace falta
   excluirlo a mano).

   ====================================================
   ALGORITMO (marching triangles, plano contra malla):

   Para cada triángulo de la geometría, la distancia con signo
   de sus 3 vértices al plano dice cuántas aristas cruza el
   plano (0 o 2 — el caso "vértice justo sobre el plano" se
   descarta a propósito, no aporta nada al resaltado y
   complicaría el caso general sin beneficio visual). Si cruza
   2 aristas, se interpola el punto de cruce en cada una y esas
   dos intersecciones son un segmento de la curva.

   Corre sobre "mallaFrontal.geometry" (la ÚNICA geometría real
   — mallaFrontal/mallaTrasera la comparten, ver
   galeria-escena.js) en su espacio LOCAL, el mismo que ya usan
   "bbox"/"planosLocales" en galeria-corte.js — por eso la
   línea resultante puede colgarse directo de "mallaFrontal"
   sin ningún offset: hereda su posición/rotación/escala como
   cualquier otro hijo, en vez de tener que recalcularse cada
   frame en espacio de mundo.

   CONSTRUCCIÓN PEREZOSA POR CONO: igual que
   "cono.userData.corte" en galeria-corte.js, las líneas viven
   en "cono.userData.interseccion" — no se toca nada de los
   conos que el visitante nunca llega a enfocar con el switch
   prendido.
================================================== */


import * as THREE from "three";


const EJES = ["x", "y", "z"];

const COLOR_CURVA = 0x00e5ff;


function crearMaterialCurva() {

    return new THREE.LineBasicMaterial({
        color: COLOR_CURVA,
        /*
            depthTest:false a propósito: la curva es un
            RESALTADO, tiene que verse siempre por encima de
            la superficie que corta, nunca tapada por ella
            (mismo espíritu que un highlight de selección, no
            un objeto más de la escena compitiendo por
            profundidad).
        */
        depthTest: false,
        transparent: true,
        opacity: 0.95
    });

}


/*
    Segmentos [Vector3, Vector3] donde "plane" (espacio LOCAL
    de "geometry") cruza la malla — ver "ALGORITMO" en la
    cabecera del archivo.
*/
function segmentosPlanoGeometria(geometry, plane) {

    const posAttr = geometry.attributes.position;
    const index = geometry.index;

    const segmentos = [];

    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();

    function agregarSiCruza(puntos, p1, d1, p2, d2) {

        const cruza =
            (d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0);

        if (!cruza) return;

        const t = d1 / (d1 - d2);

        puntos.push(
            new THREE.Vector3().lerpVectors(p1, p2, t)
        );

    }

    function procesarTriangulo(iA, iB, iC) {

        vA.fromBufferAttribute(posAttr, iA);
        vB.fromBufferAttribute(posAttr, iB);
        vC.fromBufferAttribute(posAttr, iC);

        const dA = plane.distanceToPoint(vA);
        const dB = plane.distanceToPoint(vB);
        const dC = plane.distanceToPoint(vC);

        const puntos = [];

        agregarSiCruza(puntos, vA, dA, vB, dB);
        agregarSiCruza(puntos, vB, dB, vC, dC);
        agregarSiCruza(puntos, vC, dC, vA, dA);

        /*
            Caso normal: exactamente 2 aristas cruzadas =>
            1 segmento. Si dan 0 o 3 (vértice justo sobre el
            plano, o el triángulo entero de un lado) no hay
            nada que dibujar acá — ver "ALGORITMO" arriba.
        */
        if (puntos.length === 2) {

            segmentos.push([puntos[0], puntos[1]]);

        }

    }

    if (index) {

        for (let i = 0; i < index.count; i += 3) {

            procesarTriangulo(
                index.getX(i),
                index.getX(i + 1),
                index.getX(i + 2)
            );

        }

    } else {

        for (let i = 0; i < posAttr.count; i += 3) {

            procesarTriangulo(i, i + 1, i + 2);

        }

    }

    return segmentos;

}


/*
    Recorta UN segmento contra UN plano de corte adicional:
    conserva el lado "plane.distanceToPoint >= 0" (misma
    convención que "clippingPlanes"). Devuelve el segmento
    recortado, o null si queda enteramente del lado
    descartado.
*/
function recortarSegmentoContraPlano(p1, p2, plano) {

    const d1 = plano.distanceToPoint(p1);
    const d2 = plano.distanceToPoint(p2);

    if (d1 >= 0 && d2 >= 0) return [p1, p2];
    if (d1 < 0 && d2 < 0) return null;

    const t = d1 / (d1 - d2);

    const cruce =
        new THREE.Vector3().lerpVectors(p1, p2, t);

    return d1 >= 0 ? [p1, cruce] : [cruce, p2];

}


/*
    Recorta una lista de segmentos contra varios planos a la
    vez (uno por cada otro eje activo) — cada segmento es una
    recta, así que recortarlo secuencialmente contra varios
    semiespacios convexos deja como mucho UN sub-segmento (o
    ninguno), nunca lo parte en más pedazos.
*/
function recortarSegmentos(segmentos, planosRecorte) {

    const resultado = [];

    segmentos.forEach(([p1, p2]) => {

        let actual = [p1, p2];

        for (const plano of planosRecorte) {

            if (!actual) break;

            actual = recortarSegmentoContraPlano(
                actual[0], actual[1], plano
            );

        }

        if (actual) resultado.push(actual);

    });

    return resultado;

}


function armarLineSegments(segmentos) {

    const puntos = [];

    segmentos.forEach(([p1, p2]) => {

        puntos.push(p1, p2);

    });

    const geometry =
        new THREE.BufferGeometry().setFromPoints(puntos);

    const linea =
        new THREE.LineSegments(
            geometry, crearMaterialCurva()
        );

    linea.renderOrder = 10;

    return linea;

}


function obtenerInfraestructura(cono) {

    if (!cono.userData.interseccion) {

        cono.userData.interseccion = { lineas: {} };

    }

    return cono.userData.interseccion;

}


function limpiarLinea(info, eje) {

    const linea = info.lineas[eje];

    if (!linea) return;

    linea.geometry.dispose();
    linea.material.dispose();

    if (linea.parent) linea.parent.remove(linea);

    info.lineas[eje] = null;

}


function limpiarTodasLasLineas(cono) {

    if (!cono.userData.interseccion) return;

    const info = cono.userData.interseccion;

    EJES.forEach(eje => limpiarLinea(info, eje));

}


export function createCorteInterseccion({ cones } = {}) {

    if (!cones) {

        return {
            setActivo() {},
            actualizar() {},
            reset() {}
        };

    }


    let activo = false;

    /*
        Qué cono tiene líneas puestas HOY — si cambia el
        foco, hay que limpiarlas del cono anterior antes de
        (opcionalmente) ponerle nuevas al que corresponda
        ahora.
    */
    let idConCurvasPuestas = null;


    function limpiarConoActual() {

        if (idConCurvasPuestas === null) return;

        const cono = cones[idConCurvasPuestas];

        if (cono) limpiarTodasLasLineas(cono);

        idConCurvasPuestas = null;

    }


    return {

        /*
            Prende/apaga el switch. GLOBAL, no por ficha —
            mismo criterio que "Autorotado" (ver
            galeria-autorotar.js): si el visitante lo prende
            mirando una geometría, sigue prendido al pasar a
            la siguiente. Las curvas en sí igual desaparecen
            solas al cambiar de ficha si el nuevo elemento
            arranca sin cortar (percent=1 en los 3 ejes, el
            estado por defecto de galeria-corte.js) — apagar
            acá solo hace falta para dejar de calcular/pintar
            nada mientras el switch esté OFF.
        */
        setActivo(nuevoActivo) {

            activo = nuevoActivo;

            if (!activo) limpiarConoActual();

        },

        /*
            "estadoActivo": lo que devuelve
            corte.obtenerEstadoActivo() — null, o { id, cono,
            planosLocales, estado }. "estado" (percent/
            invertido por eje) ya NO hace falta acá: se
            recalculan y reemplazan las líneas de los 3 ejes
            siempre (ver el comentario grande más abajo, en
            el forEach) — no-op barato si el switch está
            apagado.
        */
        actualizar(estadoActivo) {

            if (!activo) return;

            if (!estadoActivo) {

                limpiarConoActual();
                return;

            }

            const { id, cono, planosLocales } =
                estadoActivo;

            if (id !== idConCurvasPuestas) {

                limpiarConoActual();
                idConCurvasPuestas = id;

            }

            const [mallaFrontal] = cono.userData.mallas;
            const geometry = mallaFrontal.geometry;
            const info = obtenerInfraestructura(cono);

            /*
                Ya NO se filtra por "percent < 1" (ver
                galeria-plano-corte.js, mismo pedido
                explícito aplicado acá): antes, un eje en su
                default (percent=1, sin cortar) ni se
                procesaba, y tampoco entraba en el recorte
                cruzado contra los OTROS ejes. Ahora los 3
                ejes se procesan siempre — en la práctica,
                un eje en percent=1 (o 0) casi nunca cruza
                ningún triángulo de la malla justo en el
                borde del bbox, así que "segmentosCrudos"
                sale vacío igual y no hay curva que dibujar
                (mismo resultado visual que antes, pero
                ahora decidido por la geometría real, no por
                un umbral artificial) — y de paso, si algún
                día SÍ hay geometría justo en ese borde, el
                recorte cruzado contra ese eje también se
                aplica de forma consistente, en vez de
                ignorarlo por estar en su default.
            */
            EJES.forEach(eje => {

                limpiarLinea(info, eje);

                const otrosPlanos = EJES
                    .filter(otro => otro !== eje)
                    .map(otro => planosLocales[otro]);

                const segmentosCrudos =
                    segmentosPlanoGeometria(
                        geometry, planosLocales[eje]
                    );

                const segmentosRecortados =
                    recortarSegmentos(
                        segmentosCrudos, otrosPlanos
                    );

                if (segmentosRecortados.length === 0) {

                    return;

                }

                const linea =
                    armarLineSegments(segmentosRecortados);

                mallaFrontal.add(linea);
                info.lineas[eje] = linea;

            });

        },

        /*
            Mismo momento que autorotar.reset()/corte.reset()/
            etc. — los 4 puntos donde galeria.js sale de
            "fichas". A diferencia de "Autorotado" (que vuelve
            a prender), acá se APAGA: es un control secundario
            de visualización, no tiene sentido que una sesión
            nueva de "fichas" arranque mostrando curvas que el
            visitante ni pidió.
        */
        reset() {

            activo = false;
            limpiarConoActual();

        }

    };

}
