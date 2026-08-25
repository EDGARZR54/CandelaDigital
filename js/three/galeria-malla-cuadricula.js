/* ==================================================
   galeria-malla-cuadricula.js

   Lógica de "alambre limpio" — detecta si una geometría
   viene de una superficie paramétrica con UVs en
   cuadrícula regular (filas × columnas), como las que
   producen los generadores procedurales de este sitio
   (cono-sinusoidal.js y afines — mismos módulos que ya
   acepta visor-geometrias.html, de donde sale ESTE
   archivo casi literal), y arma un overlay de isocurvas
   decimadas según una densidad elegida, en vez del
   THREE.WireframeGeometry íntegro (una línea por cada
   arista de cada triángulo real de la malla, sin importar
   la resolución del generador) — mucho más ruidoso en
   superficies con muchos triángulos.

   MÓDULO PURO: no conoce group/cones/GUI ni nada de
   galeria.js — sólo recibe THREE.BufferGeometry y números,
   y devuelve THREE.BufferGeometry. Quien lo use decide
   dónde colgar el resultado (galeria-panel-material.js) y
   cuándo volver a llamarlo (cambio de densidad, geometría
   reconstruida por galeria-panel-parametros.js).

   API PÚBLICA, dos funciones:

     - extraerCuadriculaUV(geometria): detecta la
       cuadrícula UNA vez por geometría (cachear el
       resultado — es más trabajo que construirGeometria-
       Aristas, no hace falta repetirlo por cada cambio de
       densidad, sólo cuando la geometría en sí cambió).
       Devuelve null si no hay cuadrícula detectable.

     - construirGeometriaAristas(geometriaViva,
       infoCuadricula, densidad): con el resultado de
       arriba (o null) más una densidad, arma el
       BufferGeometry de líneas a mostrar — decimado por
       cuadrícula si hay infoCuadricula, o el wireframe
       íntegro como red de seguridad automática si no la
       hay (nunca una opción elegible por quien llama, ver
       reconstruirAristas() en visor-geometrias.html, de
       donde sale este mismo criterio).
================================================== */

import * as THREE from "three";


/*
    Detecta si "geometria" proviene de una superficie
    parametrizada con UVs en cuadrícula regular (filas ×
    columnas). Si no encuentra esa estructura devuelve
    null y quien llama cae de vuelta al wireframe íntegro
    de Three.js (ver construirGeometriaAristas).
*/
export function extraerCuadriculaUV(geometria) {

    const uvAttr = geometria.getAttribute("uv");
    const posAttr = geometria.getAttribute("position");

    if (!uvAttr || !posAttr) return null;

    const PRECISION = 5;
    const clave = x => x.toFixed(PRECISION);

    const valoresU = new Set();
    const valoresV = new Set();

    for (let i = 0; i < uvAttr.count; i++) {

        valoresU.add(clave(uvAttr.getX(i)));
        valoresV.add(clave(uvAttr.getY(i)));

    }

    const listaU =
        [...valoresU].map(Number).sort((a, b) => a - b);
    const listaV =
        [...valoresV].map(Number).sort((a, b) => a - b);

    const nu = listaU.length;
    const nv = listaV.length;

    if (nu < 2 || nv < 2) return null;

    const indiceU =
        new Map(listaU.map((v, i) => [clave(v), i]));
    const indiceV =
        new Map(listaV.map((v, i) => [clave(v), i]));

    const celdas = nu * nv;

    /*
        ¿El total de vértices es un múltiplo exacto de una
        cuadrícula nu×nv? Algunos módulos arman la pieza
        final concatenando varias copias de la MISMA
        superficie paramétrica (arreglos lineales o
        rotacionales hechos a mano con clone()/translate()/
        scale(-1,...), como el Linear Array de
        la-muela.js), donde cada copia recorre el dominio
        u,v completo de 0 a 1. Si es así, tratamos cada
        copia como un "parche" independiente, en vez de
        exigir una única cuadrícula global (que nunca
        cuadraría: habría el doble/triple de vértices que
        combinaciones únicas de UV).

        Algunos otros módulos (p. ej. paraguas.js) van más
        lejos y fusionan a la cubierta paramétrica una
        pieza NO paramétrica (una columna extruida como
        BoxGeometry) dentro de la MISMA malla final. Esos
        vértices sueltos ya no encajan en ningún múltiplo
        exacto de la grilla, así que en vez de exigir que
        TODO el buffer decodifique limpio (lo que
        descartaba la detección entera y forzaba el
        wireframe íntegro para toda la pieza), se intenta
        parche por parche desde el principio y se corta
        apenas uno no cierra — típicamente al llegar a
        esos vértices sueltos del final. Los parches
        válidos anteriores (la cubierta) sí quedan
        disponibles como cuadrícula; la parte no
        paramétrica (la columna) recibe su propio
        wireframe de respaldo por triángulo (ver
        indicesSobrantes más abajo).
    */
    const maxParchesPosibles =
        Math.min(64, Math.floor(uvAttr.count / celdas));

    if (maxParchesPosibles < 1) return null;

    const parches = [];

    for (let p = 0; p < maxParchesPosibles; p++) {

        const inicio = p * celdas;

        /*
            Guardamos el ÍNDICE de vértice de cada celda,
            no su posición. Así, si la geometría cambiara,
            el overlay puede releer la posición ACTUAL de
            ese mismo vértice en vez de quedar pegado a la
            forma original.
        */
        const grilla = new Array(celdas).fill(-1);

        let bloqueValido = true;

        for (let local = 0; local < celdas; local++) {

            const i = inicio + local;

            const iu =
                indiceU.get(clave(uvAttr.getX(i)));
            const iv =
                indiceV.get(clave(uvAttr.getY(i)));

            if (iu === undefined || iv === undefined) {

                bloqueValido = false;
                break;

            }

            const idx = iv * nu + iu;

            if (grilla[idx] === -1) grilla[idx] = i;

        }

        /*
            Huecos en la cuadrícula de este parche = ya no
            encaja (fin de la zona paramétrica, p. ej.
            donde empieza una columna fusionada). Cortamos
            acá en vez de descartar los parches anteriores,
            que sí son válidos.
        */
        if (
            !bloqueValido ||
            grilla.some(v => v === -1)
        ) break;

        parches.push({ nu, nv, grilla });

    }

    if (parches.length === 0) return null;

    const numParches = parches.length;

    /*
        Vértices que quedaron fuera de todo parche
        detectado (p. ej. la columna de paraguas.js,
        fusionada al final de la misma malla). Sin esto,
        esa parte no tiene ningún tipo de línea: con el
        material "Ninguno" la malla sólida se oculta por
        completo y, al no pertenecer a ningún parche,
        tampoco recibiría líneas de cuadrícula — quedaría
        invisible. Se buscan los triángulos que caen
        ÍNTEGRAMENTE en ese rango sobrante (nunca a
        caballo con la zona paramétrica) para armarles un
        wireframe de respaldo con sus aristas reales,
        igual que el wireframe íntegro automático pero
        acotado sólo a esa porción.
    */
    const primerVerticeSinPatch = numParches * celdas;
    let indicesSobrantes = null;

    const indexAttr = geometria.index;

    if (indexAttr && primerVerticeSinPatch < posAttr.count) {

        const arr = [];

        for (let t = 0; t < indexAttr.count; t += 3) {

            const a = indexAttr.getX(t);
            const b = indexAttr.getX(t + 1);
            const c = indexAttr.getX(t + 2);

            if (
                a >= primerVerticeSinPatch &&
                b >= primerVerticeSinPatch &&
                c >= primerVerticeSinPatch
            ) {

                arr.push(a, b, c);

            }

        }

        if (arr.length > 0) {

            indicesSobrantes = new Uint32Array(arr);

        }

    }

    /*
        Longitud real de arco (en unidades de mundo) de
        una isocurva representativa en cada dirección,
        promediando varias muestras para no depender de un
        único corte que podría no ser representativo (p.
        ej. piezas que se angostan hacia un extremo). Esto
        es lo que permite luego calcular las divisiones
        "por distancia" en vez de adivinar cuántas van en
        U y cuántas en V. Se mide una sola vez sobre la
        forma en este instante: sólo se usa para repartir
        cuántas líneas van en cada dirección, no hace
        falta que se re-mida si la pieza luego se deforma
        con el mismo parche (ver construirGeometriaAristas,
        que sí relee la posición ACTUAL de cada vértice
        para las líneas en sí).
    */
    const { Lu, Lv } =
        medirLongitudesPatch(parches[0], posAttr);

    return {
        nu, nv, numParches, parches,
        longitudU: Lu, longitudV: Lv,
        indicesSobrantes
    };

}


function medirLongitudesPatch(parche, posAttr) {

    const { nu, nv, grilla } = parche;

    const punto = (i, j) =>
        new THREE.Vector3()
            .fromBufferAttribute(posAttr, grilla[j * nu + i]);

    const filasMuestra =
        [0.25, 0.5, 0.75].map(
            t => Math.round(t * (nv - 1))
        );

    let sumaLu = 0;

    for (const j of filasMuestra) {

        let l = 0;

        for (let i = 0; i < nu - 1; i++) {

            l += punto(i, j).distanceTo(punto(i + 1, j));

        }

        sumaLu += l;

    }

    const Lu = sumaLu / filasMuestra.length;

    const columnasMuestra =
        [0.25, 0.5, 0.75].map(
            t => Math.round(t * (nu - 1))
        );

    let sumaLv = 0;

    for (const i of columnasMuestra) {

        let l = 0;

        for (let j = 0; j < nv - 1; j++) {

            l += punto(i, j).distanceTo(punto(i, j + 1));

        }

        sumaLv += l;

    }

    const Lv = sumaLv / columnasMuestra.length;

    return { Lu, Lv };

}


/*
    A partir de la densidad elegida y las longitudes
    reales medidas, reparte las líneas entre U y V de
    forma que el ESPACIADO real entre isocurvas
    consecutivas sea igual en ambas direcciones (en vez de
    mostrar la misma cantidad de líneas en un eje corto y
    uno largo).
*/
export function calcularDivisionesAutomaticas(info, densidad) {

    const { longitudU, longitudV, nu, nv } = info;

    if (!(longitudU > 0) || !(longitudV > 0)) {

        // Sin longitudes válidas (geometría degenerada):
        // repartir parejo.
        const d = Math.max(1, Math.round(densidad));

        return {
            divU: Math.min(d, nu - 1),
            divV: Math.min(d, nv - 1)
        };

    }

    const media = Math.sqrt(longitudU * longitudV);
    const espaciado = media / Math.max(1, densidad);

    const divU =
        Math.max(
            1,
            Math.min(
                Math.round(longitudU / espaciado), nu - 1
            )
        );
    const divV =
        Math.max(
            1,
            Math.min(
                Math.round(longitudV / espaciado), nv - 1
            )
        );

    return { divU, divV };

}


/*
    Construye sólo las líneas visibles de una cuadrícula
    decimada para UN parche. Importante: lo que se decima
    es CUÁNTAS curvas u/v se muestran (divU × divV de
    ellas), no la resolución de cada curva — cada curva
    mostrada se traza con TODOS los puntos densos de la
    malla real a lo largo de esa dirección. Si en vez de
    esto se conectara sólo el punto inicial y final con
    una cuerda recta, esa cuerda se separaría de la
    superficie curva real en el tramo intermedio, dando la
    apariencia de z-fighting aunque en realidad es una
    desviación geométrica genuina. Los vértices resultantes
    se acumulan en el array "vertices" recibido (así varios
    parches pueden compartir un mismo LineSegments).
*/
function construirLineasParche(
    parche, divU, divV, vertices, leerPunto
) {

    const { nu, nv, grilla } = parche;

    divU = Math.max(1, Math.min(Math.round(divU), nu - 1));
    divV = Math.max(1, Math.min(Math.round(divV), nv - 1));

    /*
        Qué columnas (líneas a U fija) y qué filas (líneas
        a V fija) se muestran — esto sí sigue decimado
        según divU/divV.
    */
    const columnasI = [];

    for (let i = 0; i <= divU; i++) {

        columnasI.push(
            Math.round((i * (nu - 1)) / divU)
        );

    }

    const filasJ = [];

    for (let j = 0; j <= divV; j++) {

        filasJ.push(
            Math.round((j * (nv - 1)) / divV)
        );

    }

    const punto = (i, j) => leerPunto(grilla[j * nu + i]);
    const agregar = (a, b) =>
        vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);

    // Isocurvas horizontales (V fija, recorriendo TODO U
    // en resolución completa) — una por cada fila
    // seleccionada.
    for (const j of filasJ) {

        for (let i = 0; i < nu - 1; i++) {

            agregar(punto(i, j), punto(i + 1, j));

        }

    }

    // Isocurvas verticales (U fija, recorriendo TODO V en
    // resolución completa) — una por cada columna
    // seleccionada.
    for (const i of columnasI) {

        for (let j = 0; j < nv - 1; j++) {

            agregar(punto(i, j), punto(i, j + 1));

        }

    }

}


/*
    Construye la geometría de líneas de cuadrícula
    completa, recorriendo todos los parches detectados
    (normalmente 1, o varios si la pieza es un arreglo de
    copias de la misma superficie paramétrica) más el
    wireframe de respaldo de "indicesSobrantes" si lo hay.

    Lee la posición ACTUAL de "geometriaViva" (no una copia
    congelada) — por eso alcanza con volver a llamar a esta
    función para que el overlay siga cualquier cambio en la
    geometría, sin desplazar el punto a lo largo de su
    normal para separarlo de la superficie sólida (eso lo
    resuelve polygonOffset del lado del material sólido, no
    hace falta duplicar esa lógica acá).
*/
function construirLineasCuadricula(
    info, divU, divV, geometriaViva
) {

    const posAttr = geometriaViva.getAttribute("position");
    const tmpPos = new THREE.Vector3();

    const leerPunto = indice => {

        tmpPos.fromBufferAttribute(posAttr, indice);

        /*
            clone(): construirLineasParche mantiene una
            referencia "anterior" viva entre llamadas
            sucesivas (modo triángulos), así que cada punto
            debe ser un objeto independiente, no el mismo
            Vector3 reutilizado.
        */
        return tmpPos.clone();

    };

    const vertices = [];

    for (const parche of info.parches) {

        construirLineasParche(
            parche, divU, divV, vertices, leerPunto
        );

    }

    if (info.indicesSobrantes) {

        const bordesVistos = new Set();

        const agregarBorde = (i1, i2) => {

            const clave =
                i1 < i2 ? `${i1}_${i2}` : `${i2}_${i1}`;

            if (bordesVistos.has(clave)) return;

            bordesVistos.add(clave);

            const p1 = leerPunto(i1);
            const p2 = leerPunto(i2);

            vertices.push(
                p1.x, p1.y, p1.z, p2.x, p2.y, p2.z
            );

        };

        const idx = info.indicesSobrantes;

        for (let t = 0; t < idx.length; t += 3) {

            const a = idx[t], b = idx[t + 1], c = idx[t + 2];

            agregarBorde(a, b);
            agregarBorde(b, c);
            agregarBorde(c, a);

        }

    }

    const geometriaLineas = new THREE.BufferGeometry();

    geometriaLineas.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(vertices, 3)
    );

    return geometriaLineas;

}


/*
    Punto de entrada público: cuadrícula decimada según
    "densidad" si "infoCuadricula" no es null, o el
    wireframe íntegro de Three.js como red de seguridad
    automática si es null — NUNCA una opción elegible por
    quien llama, mismo criterio que reconstruirAristas() en
    visor-geometrias.html. Quien use esto (galeria-panel-
    material.js) decide cuándo llamarlo: al crear el
    overlay, al cambiar la densidad, o al reconstruirse la
    geometría (galeria-panel-parametros.js).
*/
export function construirGeometriaAristas(
    geometriaViva, infoCuadricula, densidad
) {

    if (!infoCuadricula) {

        return new THREE.WireframeGeometry(geometriaViva);

    }

    const { divU, divV } =
        calcularDivisionesAutomaticas(
            infoCuadricula, densidad
        );

    return construirLineasCuadricula(
        infoCuadricula, divU, divV, geometriaViva
    );

}
