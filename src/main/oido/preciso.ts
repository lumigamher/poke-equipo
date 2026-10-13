import type { ResultadoPreciso, TranscriptorPreciso } from "./transcriptor";

/** Mínimo entre dos reinicios automáticos del proceso preciso. */
export const REINICIO_MIN_MS = 10_000;

export interface SolicitudPreciso {
  id: number;
  muestras: Float32Array;
}

/** El proceso aparte que carga Whisper. En la app es un `utilityProcess`; en las pruebas, un falso. */
export interface HijoPreciso {
  enviar(m: SolicitudPreciso): void;
  alMensaje(fn: (m: unknown) => void): void;
  alSalir(fn: () => void): void;
  matar(): void;
}

export interface OpcionesClientePreciso {
  lanzar(): HijoPreciso;
  /** Reloj (ms). */
  ahora(): number;
  aviso(mensaje: string, e?: unknown): void;
}

interface Pendiente {
  hijo: HijoPreciso;
  enviadaMs: number;
  resolver(r: ResultadoPreciso): void;
  rechazar(e: Error): void;
}

/**
 * Cliente del proceso preciso. Las peticiones se atienden en orden y de una en una (el hijo es de un solo hilo).
 * Si el hijo muere, lo pendiente rechaza y se relanza al pedir lo siguiente, a lo sumo una vez cada
 * REINICIO_MIN_MS; si vuelve a morir antes, las peticiones rechazan hasta que pase ese margen desde el último
 * reinicio, y entonces se vuelve a intentar.
 * No pone plazos: quien llama decide cuánto esperar.
 */
export function crearClientePreciso(o: OpcionesClientePreciso): TranscriptorPreciso & { cerrar(): void } {
  let hijo: HijoPreciso | null = null;
  let siguiente = 1;
  let cerrado = false;
  let avisado = false;
  let ultimoReinicioMs: number | null = null;
  let hubo = false;
  const pendientes = new Map<number, Pendiente>();

  const rechazarTodo = (motivo: string, de?: HijoPreciso) => {
    for (const [id, p] of [...pendientes]) {
      if (de && p.hijo !== de) continue;
      pendientes.delete(id);
      p.rechazar(new Error(motivo));
    }
  };

  const lanzar = (): HijoPreciso | null => {
    let nuevo: HijoPreciso;
    try {
      nuevo = o.lanzar();
    } catch (e) {
      o.aviso("Oído: no se pudo lanzar el proceso preciso:", e);
      return null;
    }
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
    nuevo.alSalir(() => {
      if (hijo === nuevo) hijo = null;
      rechazarTodo("el proceso preciso terminó", nuevo);
    });
    return nuevo;
  };

  /** El hijo vivo, lanzándolo (o relanzándolo, con tope) si hace falta. */
  const vivo = (): HijoPreciso | null => {
    if (cerrado) return null;
    if (hijo) return hijo;
    if (hubo) {
      const ahora = o.ahora();
      if (ultimoReinicioMs !== null && ahora - ultimoReinicioMs < REINICIO_MIN_MS) {
        if (!avisado) {
          avisado = true;
          o.aviso("Oído: el proceso preciso murió otra vez enseguida; se reintenta pasado el margen.");
        }
        return null;
      }
      ultimoReinicioMs = ahora;
      avisado = false;
    }
    hubo = true;
    hijo = lanzar();
    return hijo;
  };

  // Se lanza al crear el cliente para que el modelo cargue mientras la app arranca.
  vivo();

  return {
    transcribir(muestras) {
      return new Promise<ResultadoPreciso>((resolver, rechazar) => {
        const h = vivo();
        if (!h) {
          rechazar(new Error("el proceso preciso no está disponible"));
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
    cerrar() {
      cerrado = true;
      const h = hijo;
      hijo = null;
      rechazarTodo("la app se está cerrando");
      h?.matar();
    },
  };
}
