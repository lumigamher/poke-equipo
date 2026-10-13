/** Cuántos subagentes se dibujan a la vez junto a su Pokémon; los demás trabajan sin verse. */
export const MAX_AYUDANTES = 4;

/** Especies pequeñas que hacen de ayudantes: Pichu, Riolu, Munchlax, Eevee, Meowth, Psyduck, Gastly y Jigglypuff. */
const ESPECIES_AYUDANTE = [172, 447, 446, 133, 52, 54, 92, 39];

/** La especie del ayudante número `n` de un Pokémon: recorre la lista sin repetir la del propio Pokémon. */
export function especieAyudante(n: number, especiePropia: number): number {
  const lista = ESPECIES_AYUDANTE.filter((e) => e !== especiePropia);
  return lista[n % lista.length];
}
