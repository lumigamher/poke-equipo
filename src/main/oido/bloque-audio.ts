/** Cuánto puede adelantarse la hora de un bloque respecto al reloj de main (desfase entre procesos). */
export const TOLERANCIA_FUTURO_MS = 50;

export type BloqueAudio =
  | { muestras: Float32Array; t: number | null; aviso: string | null }
  | { rechazado: true; tipo: string };

/**
 * Valida un bloque de audio llegado por IPC. Sin Float32Array se rechaza. Una hora ausente, no finita o
 * más de TOLERANCIA_FUTURO_MS en el futuro se vuelve null: el audio se transcribe igual, pero la frase
 * queda sin hora de inicio y no puede responder un permiso.
 */
export function validarBloqueAudio(bloque: unknown, ahoraMs: number): BloqueAudio {
  const { muestras, t } = (typeof bloque === "object" && bloque !== null ? bloque : {}) as {
    muestras?: unknown;
    t?: unknown;
  };
  if (!(muestras instanceof Float32Array)) {
    return { rechazado: true, tipo: Object.prototype.toString.call(muestras) };
  }
  if (typeof t !== "number" || !Number.isFinite(t)) {
    return { muestras, t: null, aviso: "Audio de entrada con una hora inválida; se transcribe sin hora." };
  }
  if (t > ahoraMs + TOLERANCIA_FUTURO_MS) {
    return {
      muestras,
      t: null,
      aviso: "Audio de entrada con una hora en el futuro; se transcribe sin hora.",
    };
  }
  return { muestras, t, aviso: null };
}
