/** Un pastico: una mata diminuta de pixel art. "." es transparente; "o" hoja oscura, "c" hoja clara, "f" flor. */
export type Mata = string[];

/** Matas de pasto pequeñas (de 5 a 7 píxeles de ancho) y, muy de vez en cuando, una florecita. */
export const MATAS: Mata[] = [
  ["..c....", "o.c..c.", "oc.o.c.", ".coocc."],
  [".c...", ".c.o.", "oc.oc", ".ccc."],
  ["...c..", ".o.c.o", ".oc.co", "..occ."],
  ["o...c", ".o.c.", ".occ."],
  [".f.", "fcf", ".f.", ".o.", "oo."],
];
/** La florecita es la última: sale mucho menos que el pasto. */
const FLOR = MATAS.length - 1;
const PROBABILIDAD_FLOR = 0.12;

export const COLORES_MATA: Record<string, string> = { o: "#3f7a2c", c: "#78c850", f: "#f6efdc" };

/** Una mata se ve mientras algún Pokémon esté a esta distancia o menos. */
export const RADIO_ENTORNO = 150;
/** Separación entre matas vecinas, mínima y máxima: pocas y sueltas. */
const PASO: [number, number] = [90, 260];

export interface Sembrado {
  x: number;
  /** Índice en MATAS. */
  mata: number;
}

/**
 * Reparte matas a lo largo del suelo, de borde a borde, con huecos irregulares. Con el mismo `azar` sale siempre el
 * mismo suelo.
 */
export function sembrar(ancho: number, azar: () => number): Sembrado[] {
  const suelo: Sembrado[] = [];
  let x = PASO[0] / 2 + azar() * PASO[0];
  while (x < ancho - PASO[0] / 2) {
    const mata = azar() < PROBABILIDAD_FLOR ? FLOR : Math.min(FLOR - 1, Math.floor(azar() * FLOR));
    suelo.push({ x: Math.round(x), mata });
    x += PASO[0] + azar() * (PASO[1] - PASO[0]);
  }
  return suelo;
}

/** Cuáles matas se ven: las que tienen algún Pokémon cerca. Devuelve una clave estable ("0,3,4") para comparar. */
export function cercanos(suelo: Sembrado[], xs: Iterable<number>, radio: number): string {
  const pokemones = [...xs];
  const vistos: number[] = [];
  suelo.forEach((s, i) => {
    if (pokemones.some((x) => Math.abs(x - s.x) <= radio)) vistos.push(i);
  });
  return vistos.join(",");
}
