import type { ResultadoPreciso, TranscriptorPreciso } from "./transcriptor";

/**
 * Espera antes de cada relanzamiento seguido tras una caída del proceso. Agotadas, el proceso queda caído hasta que
 * se pida `reintentar()` (en la app, al volver a prender el micrófono).
 */
export const ESPERAS_RELANZAR_MS = [1_000, 5_000, 15_000, 30_000, 60_000];

/** Un hijo que vivió al menos esto antes de morir no cuenta como caída seguida: el conteo vuelve a empezar. */
export const VIDA_SANA_MS = 120_000;

export interface SolicitudPreciso {
  id: number;
  muestras: Float32Array;
}

/** El proceso aparte que carga un transcriptor. En la app es un `utilityProcess`; en las pruebas, un falso. */
export interface HijoPreciso {
  enviar(m: SolicitudPreciso): void;
  alMensaje(fn: (m: unknown) => void): void;
  /** `codigo`: el de salida del proceso, si se conoce. */
  alSalir(fn: (codigo: number | null) => void): void;
  matar(): void;
}

export interface OpcionesClientePreciso {
  lanzar(): HijoPreciso;
  /** Reloj (ms). */
  ahora(): number;
  aviso(mensaje: string, e?: unknown): void;
  /** Cómo se llama el proceso en el registro ("rápido", "preciso"). */
  nombre?: string;
  /** Programa `fn` dentro de `ms` y devuelve cómo cancelarla. Por defecto, setTimeout. */
  programar?: (fn: () => void, ms: number) => () => void;
  /** Se agotaron los relanzamientos: el proceso queda caído hasta `reintentar()`. */
  alCaido?: () => void;
}

interface Pendiente {
  hijo: HijoPreciso;
  enviadaMs: number;
  resolver(r: ResultadoPreciso): void;
  rechazar(e: Error): void;
}

/**
 * Cliente del proceso preciso. Las peticiones se atienden en orden y de una en una (el hijo es de un solo hilo).
 * Si el hijo muere, se registra con su código, lo pendiente rechaza (nunca se reenvía: ese audio ya es viejo) y se
 * relanza solo tras ESPERAS_RELANZAR_MS; mientras tanto las peticiones rechazan enseguida. Agotadas las esperas,
 * queda caído, se avisa con `alCaido` y solo `reintentar()` lo vuelve a lanzar.
 * No pone plazos: quien llama decide cuánto esperar.
 */
export function crearClientePreciso(
  o: OpcionesClientePreciso,
): TranscriptorPreciso & { cerrar(): void; reintentar(): void } {
  const nombre = o.nombre ?? "preciso";
  const programar =
    o.programar ??
    ((fn: () => void, ms: number) => {
      const h = setTimeout(fn, ms);
      return () => clearTimeout(h);
    });
  let hijo: HijoPreciso | null = null;
  let nacidoMs = 0;
  let siguiente = 1;
  let cerrado = false;
  let caido = false;
  /** Caídas seguidas sin que un hijo llegue a VIDA_SANA_MS. */
  let fallos = 0;
  let cancelarRelanzar: (() => void) | null = null;
  const pendientes = new Map<number, Pendiente>();

  const rechazarTodo = (motivo: string, de?: HijoPreciso) => {
    for (const [id, p] of [...pendientes]) {
      if (de && p.hijo !== de) continue;
      pendientes.delete(id);
      p.rechazar(new Error(motivo));
    }
  };

  /** El hijo actual murió (o no arrancó): se relanza tras una espera, o se da por caído si ya fueron muchas. */
  const caer = (motivo: string, vidaMs: number) => {
    hijo = null;
    if (cerrado) return;
    if (vidaMs >= VIDA_SANA_MS) fallos = 0;
    fallos += 1;
    if (fallos > ESPERAS_RELANZAR_MS.length) {
      caido = true;
      o.aviso(
        `Oído: el proceso ${nombre} ${motivo}; ${fallos - 1} relanzamientos seguidos fallaron, queda apagado.`,
      );
      o.alCaido?.();
      return;
    }
    const espera = ESPERAS_RELANZAR_MS[fallos - 1];
    o.aviso(
      `Oído: el proceso ${nombre} ${motivo}; se relanza en ${espera / 1000} s (intento ${fallos} de ${ESPERAS_RELANZAR_MS.length}).`,
    );
    cancelarRelanzar = programar(() => {
      cancelarRelanzar = null;
      arrancar();
    }, espera);
  };

  const arrancar = (): void => {
    if (cerrado || hijo) return;
    let nuevo: HijoPreciso;
    try {
      nuevo = o.lanzar();
    } catch (e) {
      o.aviso(`Oído: no se pudo lanzar el proceso ${nombre}:`, e);
      caer("no arrancó", 0);
      return;
    }
    hijo = nuevo;
    nacidoMs = o.ahora();
    nuevo.alMensaje((m) => {
      if (typeof m !== "object" || m === null) return;
      const { id, texto, computoMs, error } = m as Record<string, unknown>;
      if (typeof id !== "number") return;
      const p = pendientes.get(id);
      // Solo vale lo que contesta el hijo al que se le pidió.
      if (!p || p.hijo !== nuevo) return;
      pendientes.delete(id);
      if (typeof error === "string") {
        p.rechazar(new Error(error));
        return;
      }
      if (typeof texto !== "string") {
        p.rechazar(new Error("respuesta inválida del proceso preciso"));
        return;
      }
      const computo = typeof computoMs === "number" && Number.isFinite(computoMs) ? computoMs : 0;
      const total = o.ahora() - p.enviadaMs;
      p.resolver({ texto, esperaMs: Math.max(0, total - computo), computoMs: computo });
    });
    nuevo.alSalir((codigo) => {
      rechazarTodo(`el proceso ${nombre} terminó`, nuevo);
      if (hijo !== nuevo) return;
      caer(`terminó (código ${codigo ?? "desconocido"})`, o.ahora() - nacidoMs);
    });
  };

  // Se lanza al crear el cliente para que el modelo cargue mientras la app arranca.
  arrancar();

  return {
    transcribir(muestras) {
      return new Promise<ResultadoPreciso>((resolver, rechazar) => {
        const h = cerrado ? null : hijo;
        if (!h) {
          rechazar(new Error(`el proceso ${nombre} no está disponible`));
          return;
        }
        const id = siguiente++;
        pendientes.set(id, { hijo: h, enviadaMs: o.ahora(), resolver, rechazar });
        try {
          h.enviar({ id, muestras });
        } catch (e) {
          pendientes.delete(id);
          rechazar(e instanceof Error ? e : new Error(String(e)));
        }
      });
    },
    reintentar() {
      if (cerrado || hijo) return;
      cancelarRelanzar?.();
      cancelarRelanzar = null;
      if (caido) o.aviso(`Oído: se reintenta lanzar el proceso ${nombre}.`);
      caido = false;
      fallos = 0;
      arrancar();
    },
    cerrar() {
      cerrado = true;
      cancelarRelanzar?.();
      cancelarRelanzar = null;
      const h = hijo;
      hijo = null;
      rechazarTodo("la app se está cerrando");
      h?.matar();
    },
  };
}
