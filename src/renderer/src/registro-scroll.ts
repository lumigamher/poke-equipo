/** Cuántos píxeles de margen cuentan todavía como «estar al fondo». */
export const MARGEN_FONDO = 24;

export interface MedidasScroll {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

/** ¿Está leyendo lo último? Si subió a leer algo anterior, no. */
export function estaAlFondo(m: MedidasScroll): boolean {
  return m.scrollHeight - m.scrollTop - m.clientHeight <= MARGEN_FONDO;
}

/** Llegó contenido nuevo: baja solo únicamente si ya estaba al fondo; si no, ofrece «Ir a lo último». */
export function quePasaAlLlegar(alFondo: boolean): "bajar" | "avisar" {
  return alFondo ? "bajar" : "avisar";
}

/** Lo que se recuerda del registro de un Pokémon cuando su bloque se desmonta (p. ej. mientras hay un permiso). */
export interface ScrollGuardado {
  /** Primera entrada de la tarea: si cambia, es otra tarea y no se restaura nada. */
  tarea: number;
  pegado: boolean;
  scrollTop: number;
  enfocado: boolean;
}

const guardados = new Map<string, ScrollGuardado>();

export function guardarScroll(pokemonId: string, s: ScrollGuardado): void {
  guardados.set(pokemonId, s);
}

/** Lo guardado para esa tarea de ese Pokémon (y lo olvida); null si no hay o es de otra tarea. */
export function tomarScroll(pokemonId: string, tarea: number): ScrollGuardado | null {
  const s = guardados.get(pokemonId);
  guardados.delete(pokemonId);
  return s && s.tarea === tarea ? s : null;
}

/** Alto máximo de una burbuja anclada abajo: lo que queda sobre su borde inferior, sin salirse por arriba. */
export function altoDisponible(bordeInferior: number, margen = 12): number {
  return Math.max(160, Math.floor(bordeInferior - margen));
}
