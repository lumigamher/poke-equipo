/** De noche (de 8 de la noche a 5 de la mañana) los Pokémon caminan lento y se duermen antes. */
export function esNoche(hora: number): boolean {
  return hora >= 20 || hora < 5;
}

/** La mañana, cuando el primero en salir cuenta en qué quedó cada uno. */
export function esManana(hora: number): boolean {
  return hora >= 5 && hora < 12;
}

/** Cuánto más lento caminan de noche. */
export const PASO_DE_NOCHE = 0.55;
/** De noche se cansan y se duermen en la mitad del tiempo. */
export const SUENO_DE_NOCHE = 0.5;
