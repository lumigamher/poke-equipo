/**
 * Los modelos de Claude que se pueden elegir para un Pokémon: una sola fuente para el laboratorio, los menús y la
 * validación. Los ids son los mismos de config/tipos.json y los que se pasan al SDK.
 */
export interface ModeloElegible {
  id: string;
  nombre: string;
  /** Para qué sirve, en una línea. */
  linea: string;
}

export const MODELOS: readonly ModeloElegible[] = [
  { id: "haiku", nombre: "Haiku", linea: "Rápido y barato" },
  { id: "sonnet", nombre: "Sonnet", linea: "Equilibrado" },
  { id: "opus", nombre: "Opus", linea: "El más capaz y más lento" },
];

export const esModeloElegible = (m: unknown): m is string =>
  typeof m === "string" && MODELOS.some((x) => x.id === m);

/** Los ids que se pueden dejar guardados como modelo propio: los del menú y fable (que `/model` también acepta). */
export const MODELOS_GUARDABLES: readonly string[] = [...MODELOS.map((m) => m.id), "fable"];

export const esModeloGuardable = (m: unknown): m is string =>
  typeof m === "string" && MODELOS_GUARDABLES.includes(m);

/** Lo que sale de la base: un valor fuera de la lista guardable cuenta como nulo (cae al modelo del tipo). */
export const leerModelo = (m: unknown): string | null => (esModeloGuardable(m) ? m : null);

/** El id si está en la lista; si no, null. */
export const modeloValido = (m: unknown): string | null => (esModeloElegible(m) ? m : null);

/** Con qué modelo corre: el propio del Pokémon (nulo = el de su tipo). */
export function modeloEfectivo(propio: string | null | undefined, deTipo: string): string {
  return propio ? propio : deTipo;
}

/** El que sigue (o el anterior) en la lista, dando la vuelta; desde uno fuera de la lista, el primero. */
export function siguienteModelo(actual: string, delta: 1 | -1): string {
  const i = MODELOS.findIndex((m) => m.id === actual);
  if (i < 0) return MODELOS[0].id;
  return MODELOS[(i + delta + MODELOS.length) % MODELOS.length].id;
}

/** El nombre para leerlo ("Sonnet"); un id fuera de la lista sale con mayúscula inicial. */
export const nombreModelo = (id: string): string =>
  MODELOS.find((m) => m.id === id)?.nombre ?? id.charAt(0).toUpperCase() + id.slice(1);
