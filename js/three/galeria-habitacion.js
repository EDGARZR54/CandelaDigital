/* ==================================================
   galeria-habitacion.js

   Habitación atmosférica ("cyclorama") que envuelve la
   fila de elementos: piso + pared como UNA sola malla
   continua por pieza (perfil radial revolucionado, con
   esquinas redondeadas en vez de un círculo perfecto o
   un cuadrado con costura visible en las esquinas).

   Portado de Maqueta.html casi sin cambios — la única
   diferencia real es de origen de datos: acá los
   parámetros de geometría/margen salen de
   config.room (ver galeria-config.js) en vez de estar
   hardcodeados, y "actualizarPisoSegunGeometria" recibe
   "cones"/"restY"/"ejePrincipal" como argumentos frescos
   en cada llamada (los mismos vienen del closure de
   galeria-escena.js, que es quien de verdad los posee y
   los actualiza) en vez de leer variables globales del
   script, como hacía la maqueta.

   No proyecta sombra (ni pared ni piso tienen
   castShadow): son puramente receptores
   (receiveShadow=true) — el único caster de la escena
   sigue siendo el "keyLight" configurado en
   galeria-escena.js.

   "roomFloor" es ahora el ÚNICO receptor de esa sombra: la
   "mesa" que convivía con él (un plano ShadowMaterial
   invisible en galeria-escena.js) fue SACADA, igual que en
   Maqueta.html. Un ShadowMaterial solo puede oscurecer,
   nunca mostrar la "piscina de luz" —el parche más
   iluminado donde el cono del spot toca el piso—, que sí se
   ve sobre el MeshPhysicalMaterial real de roomFloor.
================================================== */

import * as THREE from 'three';

export function createHabitacion(scene, renderer, config) {

    const roomCfg = config.room.geometry;
    const floorDropMargin = config.room.floorDropMargin;
    const floorFlatMargin = config.room.floorFlatMargin ?? 1.5;

    /*
        Radio del área PLANA del piso (antes de que arranque
        el fillet que sube hacia la pared) en las unidades
        LOCALES de la geometría de la sala — se calcula una
        sola vez acá (no en floorProfile(), que se llama solo
        al construir la malla) porque también lo necesita
        actualizarPisoSegunGeometria() más abajo, en cada
        frame, para decidir cuánto escalar la sala.
    */
    const R_flat = roomCfg.radius - roomCfg.filletR;


    /*
        Texturas generadas en canvas (no archivos
        externos): un moteado tipo cáscara de huevo para
        bump (relieve) y otro, con otro rango de gris, para
        roughness. "gFn" mapea un aleatorio 0..1 a un tono
        de gris —dos gFn distintas dan dos texturas con
        distinta "personalidad" (el bump usa tonos oscuros
        alrededor de un fondo medio, el roughness usa tonos
        claros sobre fondo blanco) reutilizando la misma
        función de dibujo.
    */
    const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
    const TEX_ANISO = Math.min(8, MAX_ANISO);

    function makeSpeckleTexture({ bg, count, rMin, rMax, gFn, size = 512 }) {

        const c = document.createElement("canvas");
        c.width = c.height = size;
        const ctx = c.getContext("2d");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, size, size);

        for (let i = 0; i < count; i++) {
            const g = gFn(Math.random());
            ctx.fillStyle = `rgb(${g},${g},${g})`;
            ctx.beginPath();
            ctx.arc(
                Math.random() * size, Math.random() * size,
                rMin + Math.random() * (rMax - rMin), 0, Math.PI * 2
            );
            ctx.fill();
        }

        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = TEX_ANISO;
        return tex;

    }

    const eggBump = makeSpeckleTexture({
        bg: "#808080", count: 25000, rMin: 0, rMax: 1.2,
        gFn: r => 128 - Math.floor(r * 45)
    });

    const eggRoughness = makeSpeckleTexture({
        bg: "#ffffff", count: 18000, rMin: 0.3, rMax: 1.3,
        gFn: r => 40 + Math.floor(r * 40)
    });


    /*
        Perfil radial del PISO: de r=0 al inicio del
        fillet, plano (y=0); de ahí, un cuarto de círculo
        (14 segmentos) que sube curvando hacia la vertical
        — así conecta sin quiebre con el perfil de la
        PARED, que arranca donde termina el fillet
        (y = filletR) y sube recto hasta wallHeight.
    */
    function floorProfile() {

        const out = [];

        for (let i = 0; i <= 6; i++) {
            out.push({ r: R_flat * i / 6, y: 0 });
        }

        for (let i = 1; i <= 14; i++) {
            const th = -Math.PI / 2 + (i / 14) * (Math.PI / 2);
            out.push({
                r: R_flat + roomCfg.filletR * Math.cos(th),
                y: roomCfg.filletR + roomCfg.filletR * Math.sin(th)
            });
        }

        return out;

    }

    function wallProfile() {

        const out = [{ r: roomCfg.radius, y: roomCfg.filletR }];

        for (let i = 1; i <= 6; i++) {
            out.push({
                r: roomCfg.radius,
                y: roomCfg.filletR + roomCfg.wallHeight * i / 6
            });
        }

        return out;

    }


    /*
        Revoluciona un perfil radial (piso o pared)
        alrededor del eje Y, con el contorno angular de una
        SUPERELIPSE (exponente 2/n) en vez de un círculo:
        con n=4 da una silueta cuadrada de esquinas
        redondeadas — ni la costura visible de un cuadrado
        real ni un círculo sin relación con la fila
        rectangular de elementos que envuelve.
    */
    function makeRoomGeometry(profile, uvScale) {

        const { angSegs, n } = roomCfg;
        const inv = 2 / n;

        const cosT = new Float32Array(angSegs);
        const sinT = new Float32Array(angSegs);

        for (let j = 0; j < angSegs; j++) {
            const th = (j / angSegs) * Math.PI * 2;
            const c = Math.cos(th), s = Math.sin(th);
            cosT[j] = Math.sign(c) * Math.abs(c) ** inv;
            sinT[j] = Math.sign(s) * Math.abs(s) ** inv;
        }

        const rings = profile.length;
        const positions = new Float32Array(rings * angSegs * 3);
        const uvs = new Float32Array(rings * angSegs * 2);
        let p = 0, q = 0;

        for (const { r, y } of profile) {
            for (let j = 0; j < angSegs; j++) {
                const x = r * cosT[j], z = r * sinT[j];
                positions[p++] = x; positions[p++] = y; positions[p++] = z;
                uvs[q++] = x * uvScale; uvs[q++] = z * uvScale;
            }
        }

        const indices = [];
        for (let i = 0; i < rings - 1; i++) {
            for (let j = 0; j < angSegs; j++) {
                const j2 = (j + 1) % angSegs;
                const a = i * angSegs + j, b = i * angSegs + j2;
                const c = (i + 1) * angSegs + j, d = (i + 1) * angSegs + j2;
                indices.push(a, b, c, b, d, c);
            }
        }

        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
        g.setIndex(indices);
        g.computeVertexNormals();
        return g;

    }


    const roomMat = new THREE.MeshStandardMaterial({
        color: 0x0a0a0c, roughness: 1.0, metalness: 0.0,
        side: THREE.FrontSide, emissive: 0x000000
    });

    const roomGroup = new THREE.Group();
    scene.add(roomGroup);

    const roomWall =
        new THREE.Mesh(makeRoomGeometry(wallProfile(), 1.4), roomMat);

    roomWall.receiveShadow = true;
    roomWall.frustumCulled = false;

    // Capa 1: aparte de la capa por defecto (0), para que
    // luces que solo deben afectar a la habitación (ver
    // "wallLight" en galeria-luces.js, Fase 4) puedan
    // aislarse sin iluminar también los elementos.
    roomWall.layers.enable(1);

    // Pared/piso son estáticos salvo por el reposicionamiento
    // en bloque de "roomGroup" (ver actualizarPisoSegunGeometria
    // más abajo, que mueve el GRUPO, no estas mallas
    // individualmente) — no hace falta que Three.js recalcule
    // su matriz local en cada frame.
    roomWall.matrixAutoUpdate = false;
    roomWall.updateMatrix();
    roomGroup.add(roomWall);


    const FLOOR_NIGHT = new THREE.Color(0x2a231b);

    const floorMat = new THREE.MeshPhysicalMaterial({
        color: FLOOR_NIGHT.clone(),
        roughness: 1.0, metalness: 0.0, reflectivity: 0.5,
        bumpMap: eggBump, bumpScale: 0.008,
        roughnessMap: eggRoughness,
        side: THREE.FrontSide
    });

    /*
        Parche manual al shader estándar de Three.js: hashea
        la celda UV y rota/refleja el muestreo de bump/
        roughness por celda, para romper el patrón
        repetido/tileado que se vería si se muestreara la
        textura tal cual a esta escala. Se aplica a las DOS
        texturas (bump y roughness) porque ambas comparten
        el mismo espacio UV de la malla.
    */
    floorMat.onBeforeCompile = (shader) => {

        const stochasticFn = `
        float floorStochasticHash(vec2 cell) {
            return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453123);
        }
        vec2 floorStochasticUv(vec2 uv) {
            vec2 cell = floor(uv);
            vec2 f = fract(uv) - 0.5;
            float h = floorStochasticHash(cell) * 4.0;
            if (h < 1.0)      { }
            else if (h < 2.0) { f = vec2(-f.y, f.x); }
            else if (h < 3.0) { f = vec2(-f.x, -f.y); }
            else              { f = vec2(f.y, -f.x); }
            return cell + f + 0.5;
        }
        `;

        shader.fragmentShader = shader.fragmentShader
            .replace(
                "#include <common>",
                "#include <common>\n" + stochasticFn
            )
            .replace(
                "#include <bumpmap_pars_fragment>",
                `#ifdef USE_BUMPMAP
                uniform sampler2D bumpMap;
                uniform float bumpScale;

                /*
                    FIX: la maqueta (three r128) usaba "vUv", una
                    única varying de UV compartida por todos los
                    mapas. Desde que three separó las UV por mapa
                    (ver uv_pars_fragment.glsl.js: vUv solo se
                    declara con USE_UV/USE_ANISOTROPY, ninguno de
                    los dos aplica acá porque este material no
                    tiene "map" de color), la varying real que
                    corresponde a bumpMap es "vBumpMapUv" — usar
                    "vUv" a secas compila a una variable
                    inexistente y tira "Fragment shader is not
                    compiled" (error real que motivó este fix).
                */
                vec2 dHdxy_fwd() {
                    vec2 dSTdx = dFdx( vBumpMapUv );
                    vec2 dSTdy = dFdy( vBumpMapUv );
                    float Hll = bumpScale * texture2D( bumpMap, floorStochasticUv( vBumpMapUv ) ).x;
                    float dBx = bumpScale * texture2D( bumpMap, floorStochasticUv( vBumpMapUv + dSTdx ) ).x - Hll;
                    float dBy = bumpScale * texture2D( bumpMap, floorStochasticUv( vBumpMapUv + dSTdy ) ).x - Hll;
                    return vec2( dBx, dBy );
                }
                vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
                    vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
                    vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
                    vec3 vN = surf_norm;
                    vec3 R1 = cross( vSigmaY, vN );
                    vec3 R2 = cross( vN, vSigmaX );
                    float fDet = dot( vSigmaX, R1 ) * faceDirection;
                    vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
                    return normalize( abs( fDet ) * surf_norm - vGrad );
                }
                #endif`
            )
            .replace(
                "#include <roughnessmap_fragment>",
                `float roughnessFactor = roughness;
                #ifdef USE_ROUGHNESSMAP
                    // Mismo motivo que en dHdxy_fwd más arriba:
                    // "vRoughnessMapUv" es la varying real, no
                    // "vUv".
                    vec4 texelRoughness = texture2D( roughnessMap, floorStochasticUv( vRoughnessMapUv ) );
                    roughnessFactor *= texelRoughness.g;
                #endif`
            );

    };

    const roomFloor =
        new THREE.Mesh(makeRoomGeometry(floorProfile(), 1.4), floorMat);

    roomFloor.receiveShadow = true;
    roomFloor.frustumCulled = false;
    roomFloor.layers.enable(1);
    roomFloor.matrixAutoUpdate = false;
    roomFloor.updateMatrix();
    roomGroup.add(roomFloor);


    /*
        Reutilizado en cada llamada (no se reasigna) para no
        alocar un Vector3 nuevo por elemento en cada frame
        que se llame esta función — mismo criterio de "reusar
        temporales" que ya sigue el resto del proyecto (ver
        p. ej. los vectores temporales de galeria-escena.js).
    */
    const _pivoteMundoTmp = new THREE.Vector3();
    const _sizeLocalTmp = new THREE.Vector3();

    /*
        En horizontal (ejePrincipal==="x") la fila entera
        comparte un "restY" físico real y fijo — el piso no
        necesita seguir nada, se queda en su lugar (y=0,
        valor con el que se construyó la geometría).

        En vertical (ejePrincipal==="y") la "fila" es una
        columna: el elemento más bajo cambia de altura real
        según cuántos elementos haya y su tamaño, así que el
        piso tiene que perseguir a "el punto más bajo de
        cualquier elemento, ahora mismo" cada frame — no hay
        un "restY" único que sirva de referencia fija como
        en horizontal (ver el mismo razonamiento en
        corregirSecundario de galeria-revelado.js/
        galeria-reordenar.js para el eje secundario).

        NOTA (seguimiento, no se resuelve en esta fase): el
        cálculo del radio (más abajo, "radioMaximoXZ") recorre
        el pivote de cada cono — barato, sin iterar vértices.
        El cálculo de "minY" TAMPOCO recorre vértices (ver el
        FIX grande más abajo): usa la posición/escala del
        grupo + el bbox local del elemento, O(1) por cono.
    */
    function actualizarPisoSegunGeometria(
        cones, restY, ejePrincipal, bboxesPorIndice
    ) {

        let minY = Infinity;
        let radioMaximoXZ = 0;

        cones.forEach((cono, id) => {

            const bbox = bboxesPorIndice[id];

            /*
                FIX (piso "respirando"/"temblando" al rotar la
                geometría en vertical): antes acá se computaba
                el mundo AABB del grupo con
                "_boxMundoTmp.setFromObject(cono)" y se usaba
                su min.y. Ese AABB incluye la ROTACIÓN actual
                del objeto (tanto el spin del pivote,
                galeria-rotacion.js, como el quaternion
                completo del carrusel con yaw+pitch, más el
                arrastre manual de galeria-interaccion-ficha.js),
                así que su min.y se movía con cada frame de
                giro. Como en vertical el piso sigue a minY
                (ver más abajo), el piso subía y bajaba
                acompañando la rotación — el bug reportado
                ("el piso se mueve verticalmente, subir y
                bajar, al rotar la geometría").

                La rotación alrededor de Y no debería mover el
                piso (preserva la Y de cualquier punto), y el
                pitch del arrastre manual es una interacción
                del visitante, no una propiedad del layout —
                tampoco debería reescribir el piso.

                Se reemplaza por la base LÓGICA del elemento:
                "posición Y del grupo + escala Y × bbox.min.y
                (local)". Ese valor es independiente de la
                rotación por construcción:
                  - Y-rotation preserva la Y de cualquier
                    punto (y el pivote solo rota en Y, ver
                    galeria-rotacion.js).
                  - La escala sí afecta la Y (multiplica la
                    distancia al origen) — "cono.scale.y" la
                    refleja, la cuenta la incluye.
                  - El pitch (arrastre manual) se IGNORA a
                    propósito: es efímero, no un cambio de
                    layout.
                  - El yaw del carrusel (rotación alrededor
                    de Y) también se ignora por el mismo
                    motivo que el spin.

                Con escala=1 y sin animar (reposo en "orden"),
                da exactamente "positions[slot].y" —el mismo
                valor que antes—, así que el resto del
                sistema no se entera. Durante el blend de
                "formar" transiciona suave de la base de la
                columna a la base del círculo (0), sin
                wobble. Durante "rotar" (blend=1) queda
                clavado en 0, porque el carrusel compone
                "curvaY = baseElemento * scaleFinal" justo
                para que "curvaY + scaleFinal * bbox.min.y =
                0" — la base del elemento queda exactamente
                en la altura del piso sin importar cuánto
                crezca su escala por énfasis.

                Bonus: evita el recorrido completo de
                "_boxMundoTmp.setFromObject(cono)" (que
                iteraba todos los vértices de la malla cada
                frame) — O(1) por cono en vez de O(vértices).
            */
            const baseY =
                cono.position.y +
                cono.scale.y * bbox.min.y;

            if (baseY < minY) minY = baseY;

            /*
                Radio XZ: se mantiene la medición por pivote
                (que sí necesita la posición de mundo real
                del pivote para decidir cuánto agrandar el
                piso). Mismo criterio que la versión
                anterior — la rotación del pivote NO afecta
                esta cuenta (getWorldPosition del pivote no
                depende de la rotación del propio pivote, solo
                de la cadena de padres).

                FIX (piso "respirando" por AABB de mundo
                rotado): la versión original de este radio
                recorría las 4 esquinas del AABB de mundo
                (_boxMundoTmp) — un AABB alineado a los ejes
                del mundo, alrededor de una forma que va
                ROTANDO. A medida que gira, ese AABB crece y
                encoge (un rectángulo alineado a los ejes que
                envuelve una forma rotando no tiene tamaño
                constante, aunque la forma en sí no cambie),
                y eso hacía "respirar" la escala de toda la
                sala (roomGroup.scale) frame a frame — visible
                sobre todo en el moteado del piso, cuya UV
                depende de esa escala. Se reemplaza por una
                medida INVARIANTE a la rotación: la posición
                de mundo del PIVOTE (el punto alrededor del
                cual gira — no cambia con la rotación, solo
                la orientación cambia) más "radioInscrito"
                (mitad de la diagonal del bbox LOCAL, mismo
                cálculo que ya usa calcularRadio() en
                galeria-cono-luz.js): una esfera que cubre al
                elemento sea cual sea su orientación actual.
                Da un radio ligeramente más conservador que el
                AABB exacto en un instante dado (la esfera es
                un sobre-envolvente), pero constante — que es
                justamente lo que hace falta acá.
            */
            const pivote = cono.userData.pivote;

            // Fuerza el recálculo de matrixWorld con la
            // posición/rotación YA fijadas este frame por el
            // controller de turno (revelado/reorder/carousel) —
            // mismo motivo que el "updateWorldMatrix" explícito
            // en galeria-corte.js: no esperar al recorrido
            // automático que hace el renderer recién al
            // llamar a renderer.render().
            pivote.updateWorldMatrix(true, false);
            pivote.getWorldPosition(_pivoteMundoTmp);

            const radioInscrito =
                bbox.getSize(_sizeLocalTmp).length() * 0.5;

            const r =
                Math.hypot(_pivoteMundoTmp.x, _pivoteMundoTmp.z) +
                radioInscrito;

            if (r > radioMaximoXZ) radioMaximoXZ = r;

        });

        /*
            Escala TODA la sala (piso+pared, como un solo grupo)
            en XZ para que el área plana del piso siempre cubra
            el punto más lejano de la fila real, con
            "floorFlatMargin" de aire extra. Nunca escala por
            debajo de 1 (no achica la sala si el contenido es
            chico — eso rompería las proporciones calibradas a
            mano para el caso normal, sin ganar nada a cambio).
            La altura de la pared (Y) queda SIN escalar a
            propósito: crece el radio, no la sensación de
            "techo alto", que no depende del ancho de la fila.

            Efecto secundario conocido, aceptado por ahora: el
            mapeo UV de piso/pared (bump/roughness, ver
            makeRoomGeometry) usa las coordenadas LOCALES de la
            geometría — con la sala escalada, el tamaño aparente
            de cada mota del moteado crece en la misma
            proporción. No se nota a simple vista salvo con
            factores grandes; si llega a notarse, la solución es
            dividir "uvScale" por el mismo factor al reconstruir
            la textura, no algo para resolver en este pase.
        */
        const radioRequerido = radioMaximoXZ + floorFlatMargin;
        const factor = Math.max(1, radioRequerido / R_flat);

        roomGroup.scale.set(factor, 1, factor);

        if (ejePrincipal !== "y") {

            roomGroup.position.y = 0;
            return;

        }

        if (!isFinite(minY)) minY = restY;

        roomGroup.position.y = minY - floorDropMargin;

    }


    return {
        roomGroup,
        roomWall,
        roomFloor,
        actualizarPisoSegunGeometria
    };

}