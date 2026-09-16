/* ==================================================
   galeria-compat-r128.js

   Reproduce, sobre three 0.169, el modelo de luces de
   three r128 (physicallyCorrectLights = false, el modo
   en el que se calibró TODA la iluminación de
   Maqueta.html) — sin esto, ninguna intensity/distance/
   decay portados de la maqueta dan el mismo resultado
   visual, aunque los números sean idénticos.

   Dos diferencias reales entre r128 y 0.169 (verificadas
   contra el código fuente de ambas versiones, no de
   memoria):

   (a) ATENUACIÓN POR DISTANCIA — distinta fórmula.
       r128 (bsdfs.glsl.js, rama sin
       PHYSICALLY_CORRECT_LIGHTS):

           pow(saturate(1 - d/cutoff), decay)

       — caída LINEAL hasta cutoff, apagado total recién
       ahí. 0.169 (lights_pars_begin.glsl.js) solo tiene
       la fórmula física (Frostbite):

           (1/pow(d, decay)) *
           pow2(saturate(1 - pow4(d/cutoff)))

       — con inversa de la potencia MÁS una "ventana" que
       ya cae fuerte bastante antes de llegar a cutoff.
       Con keyLight.distance recalculado cada frame como
       (altura del cono + margen) — ver
       galeria-cono-luz.js — los elementos quedan
       sistemáticamente cerca del borde de esa ventana,
       es decir, en la parte de la curva que más oscurece.

   (b) FACTOR ×PI IMPLÍCITO. r128 multiplica la
       irradiancia de toda luz puntual/spot/ambient/
       hemisférica por PI cuando physicallyCorrectLights
       es false (mismo "#ifndef PHYSICALLY_CORRECT_LIGHTS
       / irradiance *= PI" en varios shaders: bsdfs.glsl.js,
       lights_pars_begin.glsl.js,
       lights_physical_pars_fragment.glsl.js). 0.169 no
       tiene ese modo: siempre se comporta como si
       PHYSICALLY_CORRECT_LIGHTS estuviera definido. Por
       eso el factor de reescalado real, portando
       intensity desde la maqueta, es ×PI — no ×4PI (que
       fue lo que se aplicó por error en varios campos de
       config.lights/config.lightsAdicionales; ver el
       comentario de auditoría en galeria-config.js).

   TAMBIÉN desactiva ColorManagement (r128 no lo tenía:
   los hex se usaban tal cual, sin conversión sRGB→lineal)
   — sin esto, cualquier color hex portado de la maqueta
   (piso, pared, ambient, etc.) entra más oscuro/distinto
   de lo calibrado ahí.

   IMPORTAR PRIMERO, antes de construir cualquier
   Renderer/Material/Scene — el parche a
   THREE.ShaderChunk solo afecta materiales compilados
   DESPUÉS de este import (ver galeria.js, primera línea
   de imports).
================================================== */

import * as THREE from 'three';

// (b/color) Colores hex tal cual, sin conversión
// sRGB→lineal — mismo comportamiento que r128, que no
// tenía ColorManagement.
THREE.ColorManagement.enabled = false;


/*
    (a) Atenuación por distancia: reemplaza la fórmula
    Frostbite por la lineal de r128. Se edita el chunk
    ANTES de compilar cualquier material, así que todo
    material construido después (todos, en este
    proyecto) ya sale con la fórmula correcta.

    Los dos "replace" apuntan a subcadenas LITERALES del
    chunk real de three@0.169.0 (verificado contra
    node_modules/three/src/renderers/shaders/ShaderChunk/
    lights_pars_begin.glsl.js). Si una futura versión de
    three cambia el texto de ese chunk, el replace no
    tira error — falla en silencio y el asserttion de
    abajo lo va a delatar en consola.
*/
const ORIGINAL_FALLOFF =
    '1.0 / max( pow( lightDistance, decayExponent ), 0.01 )';

const FALLOFF_LINEAL_R128 =
    '( cutoffDistance > 0.0 && decayExponent > 0.0 )\n' +
    '\t\t? pow( saturate( 1.0 - lightDistance / cutoffDistance ), decayExponent )\n' +
    '\t\t: 1.0';

const ORIGINAL_VENTANA =
    'distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );';

THREE.ShaderChunk.lights_pars_begin =
    THREE.ShaderChunk.lights_pars_begin
        .replace(ORIGINAL_FALLOFF, FALLOFF_LINEAL_R128)
        .replace(ORIGINAL_VENTANA, '// ventana Frostbite desactivada (compat r128)');


// Guard: si el chunk de three cambió (versión distinta,
// texto fuente distinto) y por eso el replace no
// encontró nada que reemplazar, esto avisa fuerte en
// consola en vez de dejar pasar en silencio una
// iluminación calculada con la fórmula Frostbite vieja.
if (THREE.ShaderChunk.lights_pars_begin.includes('pow4(')) {

    console.error(
        "[galeria-compat-r128] El patch de atenuación NO " +
        "se aplicó — el chunk lights_pars_begin todavía " +
        "tiene la fórmula Frostbite (pow4). Revisar si " +
        "cambió el texto fuente en esta versión de three."
    );

}
