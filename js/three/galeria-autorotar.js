/* ==================================================
   galeria-autorotar.js

   Switch "Autorotado" (ver "#boton-autorotar", sección
   "Corte" del panel derecho — ver galeria.html/
   galeria.css). Prende/apaga el AUTOROTADO de la
   geometría en foco sobre su propio centroide durante la
   fase "fichas" — el mismo giro constante que ya maneja
   "rotation" (galeria-rotacion.js) vía "rotationWeights",
   ver el tick() de "fichas" en galeria.js.

   NO toca (a propósito, son mecanismos completamente
   aparte que comparten la MISMA geometría pero nunca se
   pisan entre sí):

     - La rotación de "revelado" (reveal.update() → mismo
       "rotation" controller, pero en OTRA fase — este
       switch solo vive/importa durante "fichas", donde
       está el panel derecho).

     - El rotado MANUAL con el cursor (arrastre sobre el
       modelo — ver galeria-interaccion-ficha.js): eso
       escribe directamente "cone.rotation.y" vía
       getManualOffset, nunca pasa por "rotation"/
       rotationWeights. Frenar el autorotado acá no frena
       ni interfiere con que el visitante siga pudiendo
       orbitar manualmente.

   MECANISMO: este módulo no conoce a "rotation" ni al
   carrusel — solo expone "activo()" (booleano) y deja que
   galeria.js decida qué hacer con eso. En el tick() de
   "fichas", justo antes de "rotation.update(...)", si
   "activo()" es false se pisa a 0 el peso del elemento en
   foco dentro de "result.rotationWeights" (copia nueva del
   objeto, no se muta el original — "result" puede tener
   otros consumidores del mismo objeto en ese mismo frame,
   ver galeria-carrusel.js). Mismo patrón de "inyectar la
   decisión, no importar el módulo ajeno" que ya usa
   galeria-carrusel.js con "getManualOffset" y
   galeria-panel-derecho-secciones.js con "onCambio".

   POR QUÉ NO TOCA EL PESO DE OTROS ELEMENTOS: durante
   "fichas", "result.rotationWeights" trae, además del
   elemento en foco a peso pleno, pesos residuales
   decrecientes para los vecinos que recién perdieron el
   foco (así el giro desacelera con inercia en vez de
   cortar en seco, ver "rotation" en galeria-rotacion.js) —
   apagar el switch solo debe frenar al que está siendo
   MIRADO ahora mismo, no interrumpir esa desaceleración ya
   en curso de los demás.

   ROLE="SWITCH", NO ARIA-PRESSED: a diferencia del resto de
   los botones toggle de esta página (secciones colapsables,
   invertir corte — todos "aria-pressed"), este es un
   verdadero switch on/off con texto explícito ("Autorotado"),
   así que usa la semántica ARIA correspondiente
   ("role=switch" + "aria-checked") en vez de aria-pressed,
   que es para botones que se "presionan" (como
   mute/favoritos), no para un interruptor de dos estados con
   su propio label.

   RESET AL VOLVER A "fichas": arranca ENCENDIDO por
   default en DESKTOP (mismo criterio que el resto de los
   controles de "fichas" — carousel/zoom/mapa/etc. — que
   también reinician su estado por defecto en los mismos 4
   puntos donde galeria.js sale de esa fase). Así, cada vez
   que el visitante entra a una ficha nueva, el modelo
   arranca girando — nunca hereda el "apagado" que haya
   dejado en la ficha anterior.

   En MOBILE (IS_MOBILE_TIER) el default es el opuesto:
   arranca APAGADO, y cada reset() vuelve a "apagado" — un
   giro constante fuerza al renderer a seguir pintando
   frame tras frame sin que el visitante haga nada, y en un
   dispositivo ya limitado de recursos eso pesa. Sigue
   siendo un switch real: el visitante en mobile puede
   prenderlo a mano si quiere: esto solo cambia el punto de
   partida, no le saca la opción a nadie.
================================================== */

import { IS_MOBILE_TIER } from "./galeria-dispositivo.js";


export function createAutorotarToggle(boton) {

    /*
        Gateado por IS_MOBILE_TIER: el giro constante
        durante "fichas" fuerza al renderer a seguir
        pintando frame tras frame aunque el visitante no
        toque nada — en un dispositivo ya justo de
        recursos, apagar esto por default es trabajo por
        frame que directamente deja de pasar, no solo una
        reducción de detalle. Sigue siendo un switch real:
        el visitante en mobile puede prenderlo a mano si
        quiere, esto solo cambia el punto de partida.
    */
    const DEFAULT_ACTIVO = !IS_MOBILE_TIER;

    /*
        Sin el botón (HTML desactualizado, o esta página
        todavía no lo tiene) el resto de galeria.js puede
        seguir llamando activo()/reset() sin chequear null
        cada vez — mismo criterio que el resto de los
        guards de esta página (createPanelDerechoSheet,
        createSeccionesColapsables). "activo()" devuelve
        DEFAULT_ACTIVO (true en desktop, false en mobile)
        por default, así que sin botón el autorotado
        simplemente se comporta como si el switch no
        existiera, con el default que le toque por tier —
        nunca se apaga solo en desktop, nunca arranca
        girando solo en mobile.
    */
    if (!boton) {

        return {
            activo: () => DEFAULT_ACTIVO,
            reset() {}
        };

    }


    let activo = DEFAULT_ACTIVO;


    function aplicar(nuevoActivo) {

        activo = nuevoActivo;

        boton.setAttribute(
            "aria-checked", String(activo)
        );

    }

    /*
        Sincroniza el DOM con el default real desde el
        primer momento: el HTML trae aria-checked="true"
        fijo (pensado para el único default que existía
        antes de este cambio), así que en mobile hace
        falta este llamado para que el switch se VEA
        apagado — sin esto, mostraría "prendido" aunque el
        comportamiento real ya sea "apagado".
    */
    aplicar(activo);


    boton.addEventListener("click", () => {

        aplicar(!activo);

    });


    return {

        activo: () => activo,

        /*
            Mismo momento que panelDerechoSheet.reset()/
            seccionesPanelDerecho.reset() — ver los 4
            puntos donde galeria.js sale de "fichas".
        */
        reset() {

            aplicar(DEFAULT_ACTIVO);

        }

    };

}
