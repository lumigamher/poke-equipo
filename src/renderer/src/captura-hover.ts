/**
 * Única fuente de verdad, en el renderer, de si la ventana debe capturar el ratón. Con `setIgnoreMouseEvents(true,
 * {forward:true})` solo llegan los movimientos del cursor, así que se guarda la última posición conocida y se vuelve
 * a medir "¿hay algo interactivo bajo el cursor?" cada vez que el diseño puede cambiar bajo un cursor quieto (aparece
 * una tarjeta, se cierra una burbuja, el Pokémon camina). Captura si se arrastra o si el cursor, en una posición
 * conocida, está sobre algo interactivo; sin posición conocida, ignora (nunca se come los clics del escritorio).
 */
export interface DepsHover<R> {
  /**
   * La raíz interactiva justo en (x, y), o null si no hay. Es el `elementFromPoint` real: lo que tiene
   * pointer-events:none no cuenta. Solo lee: el almacén nunca toca el DOM.
   */
  golpe(x: number, y: number): R | null;
  /** Se llama con el valor nuevo de "capturar" cada vez que cambia. */
  alCambiar(capturar: boolean): void;
  /** Se llama con la raíz interactiva bajo el cursor cada vez que cambia (null si ninguna): de aquí sale el "encima". */
  alRaiz?(raiz: R | null): void;
}

export function crearHover<R>(d: DepsHover<R>) {
  let pos: { x: number; y: number } | null = null;
  let arrastre = false;
  let ultimo: boolean | null = null;
  let ultimaRaiz: R | null = null;
  const emitir = () => {
    const raiz = pos === null ? null : d.golpe(pos.x, pos.y);
    if (raiz !== ultimaRaiz) {
      ultimaRaiz = raiz;
      d.alRaiz?.(raiz);
    }
    const c = arrastre || raiz !== null;
    if (c === ultimo) return;
    ultimo = c;
    d.alCambiar(c);
  };
  return {
    /** Al montarse: envía el valor inicial (ignorar si no hay posición conocida). */
    iniciar: emitir,
    mover(x: number, y: number) {
      pos = { x, y };
      emitir();
    },
    /** El cursor salió de la ventana: su última posición ya no vale. */
    salir() {
      pos = null;
      emitir();
    },
    /** El diseño pudo cambiar bajo un cursor quieto. */
    reevaluar: emitir,
    arrastrando(si: boolean) {
      arrastre = si;
      emitir();
    },
    /** Vuelve a enviar el valor actual aunque no haya cambiado (main pudo perderlo en una carga). */
    reenviar() {
      ultimo = null;
      emitir();
    },
  };
}
