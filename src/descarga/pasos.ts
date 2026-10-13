import { ErrorDescarga } from "./descargar.ts";

/** Una unidad de trabajo de la preparación: un modelo, los poderes, una especie… */
export interface Paso {
  id: string;
  /** Cómo se le dice a la persona ("Voz de Pikachu"). */
  etiqueta: string;
  /** De dónde sale, para mostrarlo ("github.com/k2-fsa/sherpa-onnx"). */
  fuente: string;
  /** Peso a bajar (exacto en modelos; estimado en sprites). */
  bytes: number;
  /** true si ya está hecho en disco y verificado: se salta. */
  completo(): Promise<boolean>;
  /** `alBytes(n)`: cuántos de `bytes` lleva este paso (0..bytes). */
  ejecutar(ctx: { alBytes(n: number): void; señal?: AbortSignal }): Promise<void>;
}

export type EstadoPaso = "pendiente" | "bajando" | "listo" | "error";

export interface ProgresoPaso {
  id: string;
  etiqueta: string;
  bytes: number;
  hechos: number;
  estado: EstadoPaso;
}

export interface ProgresoPasos {
  /** Suma de los `bytes` de todos los pasos. */
  total: number;
  hechos: number;
  pasos: ProgresoPaso[];
}

export interface OpcionesEjecucion {
  alProgreso?: (p: ProgresoPasos) => void;
  señal?: AbortSignal;
}

/** Pasos que faltan (los que `completo()` da por buenos no entran en el plan). */
export async function pasosPendientes(pasos: Paso[]): Promise<Paso[]> {
  const resultado: Paso[] = [];
  for (const p of pasos) if (!(await p.completo())) resultado.push(p);
  return resultado;
}

const resumen = (pasos: ProgresoPaso[]): ProgresoPasos => ({
  total: pasos.reduce((s, p) => s + p.bytes, 0),
  hechos: pasos.reduce((s, p) => s + p.hechos, 0),
  pasos: pasos.map((p) => ({ ...p })),
});

/**
 * Corre los pasos en orden. Los que ya están completos cuentan como hechos sin tocar la red. Ante un error se
 * detiene (lo ya hecho queda; volver a llamar continúa donde se quedó) y relanza el error. Un paso que lanza algo
 * que no es `ErrorDescarga` se anota como error de disco/inesperado para que la interfaz lo muestre.
 */
export async function ejecutarPasos(pasos: Paso[], o: OpcionesEjecucion = {}): Promise<void> {
  const estado: ProgresoPaso[] = pasos.map((p) => ({
    id: p.id,
    etiqueta: p.etiqueta,
    bytes: p.bytes,
    hechos: 0,
    estado: "pendiente",
  }));
  const avisar = () => o.alProgreso?.(resumen(estado));
  avisar();
  for (const [i, paso] of pasos.entries()) {
    const mio = estado[i];
    if (o.señal?.aborted) throw new ErrorDescarga("cancelada", "Preparación cancelada.");
    if (await paso.completo()) {
      mio.hechos = mio.bytes;
      mio.estado = "listo";
      avisar();
      continue;
    }
    mio.estado = "bajando";
    avisar();
    try {
      await paso.ejecutar({
        señal: o.señal,
        alBytes: (n) => {
          mio.hechos = Math.max(0, Math.min(mio.bytes, n));
          avisar();
        },
      });
    } catch (e) {
      // Cancelar no es fallar: el paso queda en espera con lo que lleve, y reanudar continúa.
      mio.estado = e instanceof ErrorDescarga && e.tipo === "cancelada" ? "pendiente" : "error";
      avisar();
      throw e;
    }
    mio.hechos = mio.bytes;
    mio.estado = "listo";
    avisar();
  }
}
