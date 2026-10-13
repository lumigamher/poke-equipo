import { CANALES } from "@compartido/tipos";

/**
 * Los canales que el renderer usa nada más montarse (y durante el laboratorio de la primera vez). Main debe tenerlos
 * registrados ANTES de `primeraVez`: un `invoke` sin manejador rechaza y un `send` sin oyente se pierde en silencio.
 */
export const CANALES_PREVIOS = [
  CANALES.anims,
  CANALES.ignorarMouse,
  CANALES.enfocar,
  CANALES.microfonoEstado,
  CANALES.pedirLaboratorio,
  CANALES.inicial,
  CANALES.labListo,
  CANALES.labFallo,
  CANALES.pedirEspecie,
] as const;

export interface VentanaEntrada {
  setIgnoreMouseEvents(ignorar: boolean, opciones?: { forward: boolean }): void;
  setFocusable(f: boolean): void;
  focus(): void;
  blur(): void;
  isFocused(): boolean;
  isDestroyed(): boolean;
}

/** Quién manda en el ratón y el foco: normalmente el renderer; en la primera vez, main. */
export type ModoEntrada = "libre" | "lab" | "carpeta";

/**
 * En el laboratorio la ventana recibe ratón y teclado diga lo que diga el renderer (y lo recupera tras la carga);
 * con el diálogo de carpeta abierto no recibe nada, para que un clic no la suba sobre el diálogo.
 */
export function crearEntrada(win: VentanaEntrada) {
  let modo: ModoEntrada = "libre";
  // Lo último que pidió el renderer (true = ignorar), también mientras mandaba main: al volver a "libre" se aplica, para
  // que ventana y renderer no queden desacordes. Por defecto ignora: nunca captura sin que el renderer lo pida.
  let ignorarPedido = true;
  const ratonLibre = () =>
    win.setIgnoreMouseEvents(ignorarPedido, ignorarPedido ? { forward: true } : undefined);
  // Soltar el foco solo si lo tiene: un blur sobre una ventana que no lo tiene es ruido (y en macOS puede mover foco).
  const soltarFoco = () => {
    if (win.isFocused()) win.blur();
  };
  const sinEntrada = () => {
    ratonLibre();
    win.setFocusable(false);
    soltarFoco();
  };
  const aplicar = () => {
    if (win.isDestroyed()) return;
    if (modo === "lab") {
      win.setIgnoreMouseEvents(false);
      win.setFocusable(true);
      win.focus();
    } else sinEntrada();
  };
  return {
    poner(nuevo: ModoEntrada) {
      modo = nuevo;
      aplicar();
    },
    ignorarMouse(ignorar: boolean) {
      ignorarPedido = ignorar;
      if (modo !== "libre" || win.isDestroyed()) return;
      ratonLibre();
    },
    enfocar(enfocar: boolean) {
      if (modo !== "libre" || win.isDestroyed()) return;
      // La ventana no toma el foco salvo cuando la persona quiere escribir.
      win.setFocusable(enfocar);
      if (enfocar) win.focus();
      else soltarFoco();
    },
    /** Tras `did-finish-load` (ventana.ts ignora el ratón): se reaplica lo que toca, en el laboratorio o lo pedido en libre. */
    alCargar() {
      if (win.isDestroyed()) return;
      // Lo pedido antes por el renderer anterior no vale; el nuevo reenvía el suyo (ver `reenviarCaptura`).
      ignorarPedido = true;
      if (modo !== "libre") aplicar();
      else ratonLibre();
    },
    /** Renderer nuevo (carga o recarga) o caído: lo que pidió el anterior ya no vale y la ventana ignora el ratón. */
    alEmpezarCarga() {
      ignorarPedido = true;
      if (modo === "libre" && !win.isDestroyed()) ratonLibre();
    },
  };
}

export interface DepsPuerta {
  entrada: { poner(modo: ModoEntrada): void };
  programar(fn: () => void, ms: number): () => void;
  aviso(mensaje: string): void;
  esperaMs: number;
}

/**
 * Cuándo la ventana toma de verdad el ratón y el teclado en la primera vez: solo cuando el renderer avisa de que el
 * laboratorio está a la vista. Antes (o si falla, o si el renderer se recarga) queda "libre": el escritorio se puede
 * usar. Si el aviso no llega a tiempo se registra y todo sigue libre.
 */
export function crearPuertaLab(d: DepsPuerta) {
  let abierta = false;
  let visible = false;
  let fallido = false;
  let enCarpeta = false;
  let cancelar: (() => void) | null = null;
  const parar = () => {
    cancelar?.();
    cancelar = null;
  };
  const armar = () => {
    parar();
    cancelar = d.programar(() => {
      cancelar = null;
      if (abierta && !visible)
        d.aviso(
          `El laboratorio no avisó que estaba a la vista tras ${d.esperaMs / 1000} s: la ventana sigue libre.`,
        );
    }, d.esperaMs);
  };
  const aplicar = () => d.entrada.poner(enCarpeta ? "carpeta" : abierta && visible ? "lab" : "libre");
  return {
    abrir() {
      abierta = true;
      visible = false;
      fallido = false;
      enCarpeta = false;
      armar();
      aplicar();
    },
    /** El renderer ya pintó el laboratorio. */
    listo() {
      if (!abierta || fallido) return;
      visible = true;
      parar();
      aplicar();
    },
    /** El laboratorio falló al dibujarse: se suelta la ventana. */
    fallo() {
      if (!abierta) return;
      visible = false;
      fallido = true;
      parar();
      aplicar();
    },
    carpeta() {
      enCarpeta = true;
      aplicar();
    },
    volver() {
      enCarpeta = false;
      aplicar();
    },
    /** Empezó una carga nueva del renderer: lo que había en pantalla ya no está. */
    alEmpezarCarga() {
      if (!abierta) return;
      visible = false;
      fallido = false;
      armar();
      aplicar();
    },
    cerrar() {
      abierta = false;
      visible = false;
      fallido = false;
      enCarpeta = false;
      parar();
      aplicar();
    },
  };
}

export interface EmisorWeb {
  on(evento: string, fn: (...args: unknown[]) => void): unknown;
}

/** Durante la primera vez, un renderer muerto o una carga fallida dejarían la ventana sin interfaz: se avisa. */
export function vigilarPrimeraVez(
  wc: EmisorWeb,
  d: { activa(): boolean; alFallar(motivo: string): void },
): void {
  wc.on("render-process-gone", (_e, detalle) => {
    const razon = (detalle as { reason?: string } | undefined)?.reason ?? "desconocida";
    if (d.activa() && razon !== "clean-exit")
      d.alFallar(`El proceso de la pantalla se cerró inesperadamente (${razon}).`);
  });
  wc.on("did-fail-load", (_e, codigo, descripcion, _url, principal) => {
    // -3 = carga abortada (una recarga la interrumpe): no es un fallo.
    if (d.activa() && principal === true && codigo !== -3)
      d.alFallar(`La pantalla no pudo cargar (${String(descripcion)}).`);
  });
}

/**
 * Un renderer colgado mientras captura dejaría la pantalla entera sin ratón: al dejar de responder la ventana pasa a
 * ignorarlo (olvida lo pedido) y, cuando responde otra vez, el renderer reenvía su valor real.
 */
export function vigilarRespuesta(
  win: EmisorWeb,
  d: { olvidarCaptura(): void; reenviarCaptura(): void },
): void {
  win.on("unresponsive", () => d.olvidarCaptura());
  win.on("responsive", () => d.reenviarCaptura());
}

export interface Ipc {
  on(canal: string, fn: (e: unknown, dato: unknown) => void): unknown;
  handle(canal: string, fn: (e: unknown, dato: unknown) => unknown): unknown;
}

export interface DepsPrevios {
  entrada: ReturnType<typeof crearEntrada>;
  anims(especie: number): unknown;
  alMicrofono(disponible: boolean): void;
  alPedirLaboratorio(): void;
  alInicial(dato: unknown): void;
  /** El laboratorio está a la vista. */
  alLabListo(): void;
  /** El laboratorio falló al dibujarse (error boundary). */
  alLabFallo(): void;
  /** El laboratorio pide bajar una especie con prioridad (main valida la carga contra lo que ofrece). */
  alPedirEspecie(dato: unknown): void;
  /** Que el mensaje venga del marco principal de la ventana propia de la app (no de otra página ni de un subframe). */
  esRemitente(evento: unknown): boolean;
}

/** Registra los canales previos. Devuelve cuáles registró, para comprobar que no falta ninguno. */
export function registrarPrevios(ipc: Ipc, d: DepsPrevios): string[] {
  const hechos: string[] = [];
  const on = (canal: string, fn: (dato: unknown) => void) => {
    hechos.push(canal);
    ipc.on(canal, (_e, dato) => fn(dato));
  };
  hechos.push(CANALES.anims);
  ipc.handle(CANALES.anims, (_e, especie) => (typeof especie === "number" ? d.anims(especie) : {}));
  on(CANALES.ignorarMouse, (v) => {
    if (typeof v === "boolean") d.entrada.ignorarMouse(v);
  });
  on(CANALES.enfocar, (v) => {
    if (typeof v === "boolean") d.entrada.enfocar(v);
  });
  on(CANALES.microfonoEstado, (v) => {
    if (typeof v === "boolean") d.alMicrofono(v);
  });
  on(CANALES.pedirLaboratorio, () => d.alPedirLaboratorio());
  on(CANALES.inicial, (dato) => d.alInicial(dato));
  on(CANALES.labListo, () => d.alLabListo());
  on(CANALES.labFallo, () => d.alLabFallo());
  hechos.push(CANALES.pedirEspecie);
  ipc.on(CANALES.pedirEspecie, (e, dato) => {
    if (d.esRemitente(e)) d.alPedirEspecie(dato);
  });
  return hechos;
}
