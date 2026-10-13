/** Lo mínimo de un reloj: la hora y programar una tarea (devuelve cómo cancelarla). */
export interface RelojLimite {
  ahora(): number;
  programar(fn: () => void, ms: number): () => void;
}

/**
 * Deja pasar `fn` como mucho una vez cada `ms`: la primera petición corre al instante y las que llegan antes se juntan
 * en una sola, al final del intervalo (así lo último que llegó nunca se pierde).
 */
export function crearLimitador(reloj: RelojLimite, ms: number, fn: () => void) {
  let ultimo = Number.NEGATIVE_INFINITY;
  let cancelar: (() => void) | null = null;
  const correr = () => {
    cancelar = null;
    ultimo = reloj.ahora();
    fn();
  };
  return {
    pedir(): void {
      if (cancelar) return;
      const resta = ultimo + ms - reloj.ahora();
      if (resta <= 0) correr();
      else cancelar = reloj.programar(correr, resta);
    },
    cancelar(): void {
      cancelar?.();
      cancelar = null;
    },
  };
}
