/* ==================================================
   galeria-proyecto.js

   Cubre DOS fases del recorrido de scroll: "hero" y
   "proyecto" (ver galeria-fases.js). En ambas, la fila
   de conos queda completamente quieta —eso lo deja
   resuelto reveal.update(0), que galeria.js sigue
   llamando durante las dos— mientras el visitante lee,
   primero, el título, y después "El proyecto" + cifras
   (mismo contenido que la sección homónima de
   index.html; el panel de esa segunda parte lo maneja
   este módulo, el del título lo maneja
   galeria-revelado.js/heroFadeEnvelope).

   Este módulo YA NO gira ningún cono: la autorotación
   se centralizó en galeria-rotacion.js (antes vivía
   acá porque era exclusiva de estas dos fases; ahora
   tiene que seguir sonando a través de "revelado" y
   "fichas" también, así que quien decide el PESO de
   rotación de cada cono en cada fase es galeria.js,
   consultando a cada controlador — este incluido, pero
   ya no con rotar()/reset(), sino simplemente
   devolviendo "el cono hero gira a peso 1" desde
   afuera). Ver el comentario grande de
   galeria-rotacion.js para el porqué del modelo de
   velocidad con inercia.

   Este módulo NO toca position/scale/opacity/rotation
   de ningún cono: lo único que hace es calcular la
   opacidad del panel de texto "El proyecto" + cifras
   en función del progreso de su propia fase.
================================================== */

import { liftEnvelope } from "./galeria-utils.js";


export function createProjectController(config) {

    const panelRamp =
        config.proyecto.panelRamp;


    /*
        t: progreso 0..1 propio de la fase "proyecto".
        Devuelve la opacidad que debe tener el panel
        de texto — sube, se sostiene, baja (mismo
        envolvente que usa el arco de reordenamiento,
        ver liftEnvelope en galeria-utils.js), así el
        panel no aparece ni desaparece de golpe.
    */
    function update(t) {

        return {
            panelOpacity: liftEnvelope(t, panelRamp)
        };

    }


    return { update };

}
