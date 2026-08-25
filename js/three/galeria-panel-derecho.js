/* ==================================================
   galeria-panel-derecho.js

   Bottom sheet del panel derecho, SOLO relevante en
   mobile (<=780px, mismo breakpoint que navbar.css y
   el resto de galeria.css). En escritorio ".ficha__panel"
   sigue siendo la columna fija de siempre — el tirador
   está en display:none ahí (ver galeria.css), así que
   este módulo puede arrancar sin condicional ninguna:
   sus listeners cuelgan de un <button> que en escritorio
   nunca recibe foco ni gestos por estar oculto.

   Acepta AMBOS gestos para expandir/colapsar, mismo
   criterio que el panel de detalles de Google Maps:

     - Tap en el tirador: alterna el estado.
     - Arrastre (Pointer Events, mouse+touch+pen con la
       misma API): sigue al dedo/cursor en tiempo real
       mientras se arrastra, y al soltar "snapea" al
       estado más cercano — por posición si el gesto fue
       lento, o por DIRECCIÓN si fue un flick rápido
       (ver VELOCIDAD_FLICK más abajo), igual que
       cualquier bottom sheet nativo.

   Por qué Pointer Events y no touchstart/touchmove:
   unifica mouse/touch/pen en una sola API (útil acá
   porque el tirador también debe responder en un
   navegador de escritorio angosto, no solo en touch
   real) y "setPointerCapture" garantiza que el drag
   siga recibiendo eventos aunque el dedo se salga del
   propio tirador durante el arrastre.

   Por qué NO usa requestAnimationFrame para el drag:
   pointermove ya llega a lo sumo una vez por frame en
   la mayoría de los navegadores modernos, y solo se
   escribe "transform" (que no dispara layout) — sumarle
   un rAF propio acá sería una capa de más sin beneficio
   real, a diferencia del loop de render de Three.js en
   galeria.js, que sí necesita ese control fino.
================================================== */


/*
    Fracción del recorrido total (colapsado 0 -> expandido
    1) a partir de la cual, en un arrastre LENTO (sin
    flick), se decide terminar expandido en vez de
    colapsado. 0.35 = si se alcanzó a abrir más de un
    tercio del camino, redondea para arriba (a expandido)
    en vez de para abajo — se siente más generoso que
    exigir pasar la mitad.
*/
const UMBRAL_APERTURA = 0.35;

/*
    px/ms a partir de los cuales un arrastre cuenta como
    "flick": la dirección del gesto en el instante de
    soltar decide el estado final, sin importar cuánto se
    alcanzó a abrir/cerrar todavía. Valor típico de
    bottom sheets nativos (~0.3-0.5 px/ms); 0.5 evita que
    un gesto apenas rápido pero corto dispare un flick no
    intencional.
*/
const VELOCIDAD_FLICK = 0.5;


export function createPanelDerechoSheet(panel, tirador) {

    /*
        Sin alguno de los dos elementos (HTML desactualizado,
        o esta página todavía no los tiene) el resto de
        galeria.js puede seguir llamando reset()/
        actualizarPosicion() sin chequear null cada vez.
    */
    if (!panel || !tirador) {

        return {
            reset() {},
            actualizarPosicion() {}
        };

    }


    let expandido = false;
    let arrastrando = false;

    let clientYInicio = 0;
    let offsetInicio = 0;

    let ultimoClientY = 0;
    let ultimoTimeStamp = 0;
    let velocidad = 0;


    function altoPanel() {

        return panel.getBoundingClientRect().height;

    }

    function altoColapsado() {

        return tirador.getBoundingClientRect().height;

    }

    /*
        Cuánto hay que bajar el panel (en px, vía
        translateY) para que solo quede visible el
        tirador — la diferencia entre el alto total del
        sheet (tirador + cuadro + cuerpo, ya recortado
        contra max-height:70vh por el CSS si hiciera
        falta) y el alto del tirador solo.
    */
    function offsetColapsado() {

        return Math.max(
            0, altoPanel() - altoColapsado()
        );

    }

    function fijarTransform(offsetPx) {

        panel.style.transform =
            "translateY(" + offsetPx + "px)";

    }


    /*
        Único lugar que decide la posición de REPOSO
        (nada de esto corre durante un arrastre en curso,
        que ya está escribiendo su propio transform en
        pointermove). La llaman: alternar() al soltar un
        tap, finalizarArrastre() al soltar un drag, y
        actualizarPosicion() desde afuera (resize/rotación,
        fuentes que terminan de cargar) para no quedar con
        una medida vieja del tirador.
    */
    function posicionar() {

        if (arrastrando) return;

        const colapsadoAlto = altoColapsado();

        /*
            Tirador con alto 0 = está en "display:none" (ver
            galeria.css: el tirador solo existe por debajo
            de 780px) — estamos en escritorio, donde
            ".ficha__panel" NO es un bottom sheet, es la
            columna fija de siempre. Sin este guard,
            offsetColapsado() daría "altoPanel() - 0" =
            el alto ENTERO del panel, y el translateY
            resultante empujaría el sidebar de escritorio
            fuera de su lugar.

            Se limpia cualquier transform inline que hubiera
            quedado de una sesión mobile anterior (el
            visitante agrandó la ventana cruzando el
            breakpoint) y se deja que el CSS de escritorio
            mande, sin pisarlo — actualizarPosicion() ya se
            llama en cada resize, así que esto se resuelve
            solo apenas se cruza el breakpoint en cualquier
            dirección.
        */
        if (colapsadoAlto === 0) {

            panel.style.transform = "";
            return;

        }

        const offset =
            expandido
                ? 0
                : Math.max(0, altoPanel() - colapsadoAlto);

        fijarTransform(offset);

    }

    function aplicarEstado(nuevoExpandido) {

        expandido = nuevoExpandido;

        panel.dataset.estado =
            expandido ? "expandido" : "colapsado";

        tirador.setAttribute(
            "aria-expanded", String(expandido)
        );

        posicionar();

    }


    tirador.addEventListener("click", () => {

        /*
            Al soltar un arrastre, el navegador dispara un
            "click" sintético sobre el mismo elemento —sin
            este guard, cada drag terminaría alternando el
            estado DE NUEVO justo después de que
            finalizarArrastre() ya lo hubiera decidido bien.
        */
        if (arrastrando) return;

        aplicarEstado(!expandido);

    });


    tirador.addEventListener("pointerdown", ev => {

        /*
            Solo botón principal si es mouse (evita que un
            click derecho o del medio arranque un "drag").
            Touch/pen no traen esta distinción (button
            siempre 0 ahí), así que la condición no les
            afecta.
        */
        if (ev.pointerType === "mouse" && ev.button !== 0) {
            return;
        }

        arrastrando = true;
        panel.classList.add("arrastrando");

        clientYInicio = ev.clientY;
        offsetInicio =
            expandido ? 0 : offsetColapsado();

        ultimoClientY = ev.clientY;
        ultimoTimeStamp = ev.timeStamp;
        velocidad = 0;

        /*
            Sin esto, si el dedo se sale del área del
            tirador durante el arrastre (gesto rápido hacia
            arriba, común), pointermove/pointerup dejan de
            llegar a este elemento — setPointerCapture los
            sigue entregando igual, sin importar sobre qué
            otro elemento esté físicamente el puntero.
        */
        tirador.setPointerCapture(ev.pointerId);

    });


    tirador.addEventListener("pointermove", ev => {

        if (!arrastrando) return;

        const maxOffset = offsetColapsado();

        const delta = ev.clientY - clientYInicio;

        const offset =
            Math.min(
                maxOffset,
                Math.max(0, offsetInicio + delta)
            );

        fijarTransform(offset);


        const dt = ev.timeStamp - ultimoTimeStamp;

        /*
            dt<=0 puede pasar si el navegador entrega dos
            eventos con el mismo timeStamp — se ignora ese
            frame para la velocidad en vez de dividir por
            cero (Infinity rompería la comparación de
            VELOCIDAD_FLICK más abajo).
        */
        if (dt > 0) {

            velocidad =
                (ev.clientY - ultimoClientY) / dt;

        }

        ultimoClientY = ev.clientY;
        ultimoTimeStamp = ev.timeStamp;

    });


    function finalizarArrastre(ev) {

        if (!arrastrando) return;

        arrastrando = false;
        panel.classList.remove("arrastrando");


        const maxOffset = offsetColapsado();

        const offsetFinal =
            Math.min(
                maxOffset,
                Math.max(
                    0,
                    offsetInicio +
                        (ev.clientY - clientYInicio)
                )
            );

        /*
            0 = totalmente expandido, 1 = totalmente
            colapsado (maxOffset podría ser 0 en un caso
            límite —tirador tan alto como el panel entero—
            así que se guarda de dividir por cero quedándose
            expandido, la opción menos sorprendente).
        */
        const fraccionCerrado =
            maxOffset > 0 ? offsetFinal / maxOffset : 0;

        let debeExpandir;

        if (Math.abs(velocidad) > VELOCIDAD_FLICK) {

            /*
                Flick: clientY creciendo = dedo bajando en
                pantalla = cerrar; decreciendo = abrir. Gana
                por sobre la posición actual, sin importar
                cuánto se alcanzó a mover todavía — es lo
                que se espera de un flick corto y rápido.
            */
            debeExpandir = velocidad < 0;

        } else {

            debeExpandir =
                fraccionCerrado < (1 - UMBRAL_APERTURA);

        }

        aplicarEstado(debeExpandir);

    }

    tirador.addEventListener("pointerup", finalizarArrastre);
    tirador.addEventListener("pointercancel", finalizarArrastre);


    /*
        Arranca colapsado. La medición real (altoColapsado())
        recién tiene sentido una vez que el tirador está en
        su layout final — si esto llegara a correr antes de
        que las fuentes terminen de cargar, actualizarPosicion()
        (llamada desde galeria.js en document.fonts.ready,
        mismo patrón que posicionarGui()) lo corrige.
    */
    aplicarEstado(false);


    return {

        /*
            Vuelve a colapsado — mismo momento en el que
            galeria.js resetea carousel/interaccionFicha/mapa
            al salir de la fase "fichas" (ver ese archivo):
            así, la próxima vez que el visitante vuelva a
            esta fase, el sheet arranca cerrado de nuevo en
            vez de seguir expandido de la visita anterior.
        */
        reset() {

            if (arrastrando) return;
            aplicarEstado(false);

        },

        /*
            Recalcula la posición de reposo contra el layout
            ACTUAL (resize, rotación, fuentes que recién
            terminan de cargar) — mismo motivo que
            remedirFicha()/posicionarGui() en galeria.js: el
            alto del tirador puede cambiar con el tamaño de
            fuente real, así que un offset calculado antes
            puede quedar desalineado después.
        */
        actualizarPosicion() {

            posicionar();

        }

    };

}
