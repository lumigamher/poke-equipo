/**
 * Texto que main pide dejar escrito en el campo de una burbuja (p. ej. "/nombre " desde "Cambiar nombre…"). El mensaje
 * puede llegar antes de que el campo exista (la burbuja se abre a la vez) o después: si ya hay un campo suscrito se
 * le entrega en el acto; si no, se guarda hasta que aparezca (aunque el Pokémon esté ocupado y su burbuja tarde), y se
 * olvida cuando se usa, cuando llega otro texto o cuando ese Pokémon se va de la pantalla.
 */
export interface Prellenado {
  pokemonId: string;
  texto: string;
}

let pendiente: Prellenado | null = null;
const oyentes = new Map<string, Set<(texto: string) => void>>();

export function guardarPrellenado(p: Prellenado, _ahora = Date.now()): void {
  const campos = oyentes.get(p.pokemonId);
  if (campos && campos.size > 0) {
    for (const fn of campos) fn(p.texto);
    pendiente = null;
    return;
  }
  pendiente = { ...p };
}

/** Lo pendiente para ese Pokémon, una sola vez. */
export function usarPrellenado(pokemonId: string, _ahora = Date.now()): string | null {
  const p = pendiente;
  if (!p || p.pokemonId !== pokemonId) return null;
  pendiente = null;
  return p.texto;
}

/**
 * Si el Pokémon al que iba el texto estaba en pantalla y ya no está, no se escribe en la burbuja de otro. Si todavía no
 * había llegado a la vista (el texto puede adelantarse a la lista que lo incluye) no se toca.
 */
export function olvidarPrellenadoSiSeFue(antes: readonly string[], ahora: readonly string[]): void {
  if (pendiente && antes.includes(pendiente.pokemonId) && !ahora.includes(pendiente.pokemonId))
    pendiente = null;
}

/** Un campo montado pide recibir lo que llegue para su Pokémon. Devuelve cómo darse de baja. */
export function suscribirPrellenado(pokemonId: string, fn: (texto: string) => void): () => void {
  const set = oyentes.get(pokemonId) ?? new Set();
  set.add(fn);
  oyentes.set(pokemonId, set);
  return () => {
    set.delete(fn);
    if (set.size === 0) oyentes.delete(pokemonId);
  };
}

export function limpiarPrellenado(): void {
  pendiente = null;
  oyentes.clear();
}
