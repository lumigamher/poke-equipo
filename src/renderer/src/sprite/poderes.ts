import { type Tipo, tipoDe } from "@compartido/tipo-especie";
import type { DatosAnim } from "@compartido/tipos";

export type TipoPoder = Tipo;
export { tipoDe };

/**
 * El ataque propio de cada especie, en orden de preferencia: Shock de Pikachu, Withdraw de Squirtle, Kick de
 * Charmander… Cada especie trae uno o dos; quien no tenga ninguno cae en los golpes que tienen todas.
 */
export const ESPECIALES = [
  "Shock",
  "SpAttack",
  "Withdraw",
  "Kick",
  "Slam",
  "MultiStrike",
  "MultiScratch",
  "Lick",
  "TailWhip",
  "Stomp",
  "Punch",
  "RearUp",
  "Twirl",
  "QuickStrike",
  "Strike",
  "Attack",
];

/** Golpes cuerpo a cuerpo que tienen las 13 especies. */
export const GOLPES = ["Attack", "Swing", "Double"];

/** El golpe número `n` de una lista, saltando los que la especie no tiene; null si no tiene ninguno. */
export function golpeNumero(
  lista: string[],
  disponibles: Record<string, DatosAnim>,
  n: number,
): string | null {
  const validos = lista.filter((g) => disponibles[g]);
  return validos.length === 0 ? null : validos[n % validos.length];
}

/** El primero de la lista que la especie tiene; null si ninguno. */
export function primerGolpe(lista: string[], disponibles: Record<string, DatosAnim>): string | null {
  return lista.find((g) => disponibles[g]) ?? null;
}

const TIC_MS = 1000 / 60;

/**
 * Cuánto dura un golpe y en qué momento conecta (ahí sale el poder). Si la hoja no marca el cuadro del golpe, se
 * toma a cuatro décimas del recorrido. Un golpe muy corto se alarga a MIN_GOLPE_MS para que alcance a verse.
 */
export const MIN_GOLPE_MS = 450;
export function planGolpe(d: DatosAnim): { duracionMs: number; conectaMs: number } {
  const total = d.duraciones.reduce((s, n) => s + n, 0);
  const hasta =
    d.golpe === undefined ? total * 0.4 : d.duraciones.slice(0, d.golpe).reduce((s, n) => s + n, 0);
  return {
    duracionMs: Math.max(MIN_GOLPE_MS, Math.round(total * TIC_MS)),
    conectaMs: Math.round(hasta * TIC_MS),
  };
}

/** Una hoja de efecto ya animada (PMD: Origins): cuadros cuadrados en una sola fila. */
export interface HojaEfecto {
  /** Archivo en assets/pokemon/poderes, sin extensión. */
  nombre: string;
  /** Lado del cuadro, en píxeles de la hoja. */
  lado: number;
  /** Cuadros que se usan, desde el primero. */
  cuadros: number;
  /** Cuadros que trae la hoja. */
  total: number;
}

/** Lo que dura cada cuadro de un efecto. */
export const CUADRO_MS = 50;

const hoja = (nombre: string, lado: number, total: number, cuadros = total): HojaEfecto => ({
  nombre,
  lado,
  cuadros,
  total,
});

/** El poder de cada tipo: lo que vuela hasta el objeto y lo que estalla donde pega. */
export const EFECTOS: Record<TipoPoder, { proyectil: HojaEfecto; impacto: HojaEfecto }> = {
  electrico: { proyectil: hoja("Shock_Wave", 32, 4), impacto: hoja("Spark", 72, 4) },
  fuego: { proyectil: hoja("Ember", 24, 9), impacto: hoja("Fire_Fang_Hit", 80, 6) },
  agua: { proyectil: hoja("Bubbles_Blue", 16, 8), impacto: hoja("Weather_Ball_Water", 48, 6) },
  planta: { proyectil: hoja("Razor_Leaf", 32, 8), impacto: hoja("Leaf_Storm_Hit", 40, 12) },
  hada: { proyectil: hoja("Charm_Heart", 16, 6), impacto: hoja("Sparkle_RSE", 32, 5) },
  fantasma: { proyectil: hoja("Shadow_Ball", 24, 2), impacto: hoja("Shadow_Sneak_Hit", 48, 18, 10) },
  psiquico: { proyectil: hoja("Confuse_Ray", 16, 6), impacto: hoja("Psycho_Shift_Hit", 56, 30, 12) },
  lucha: { proyectil: hoja("Aura_Sphere", 32, 6), impacto: hoja("Force_Palm_Hit", 64, 4) },
  normal: { proyectil: hoja("Swift_Star", 16, 2), impacto: hoja("Hit_Neutral", 64, 4) },
  // Los tipos de Kanto que no traen hoja propia reutilizan la de un tipo parecido (ningún asset nuevo).
  bicho: { proyectil: hoja("Razor_Leaf", 32, 8), impacto: hoja("Hit_Neutral", 64, 4) },
  veneno: { proyectil: hoja("Shadow_Ball", 24, 2), impacto: hoja("Hit_Neutral", 64, 4) },
  tierra: { proyectil: hoja("Swift_Star", 16, 2), impacto: hoja("Force_Palm_Hit", 64, 4) },
  roca: { proyectil: hoja("Swift_Star", 16, 2), impacto: hoja("Force_Palm_Hit", 64, 4) },
  hielo: { proyectil: hoja("Bubbles_Blue", 16, 8), impacto: hoja("Sparkle_RSE", 32, 5) },
  dragon: { proyectil: hoja("Ember", 24, 9), impacto: hoja("Psycho_Shift_Hit", 56, 30, 12) },
};
