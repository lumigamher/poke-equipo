import type { Tipo } from "./tipo-especie";
import type { DatosAnim } from "./tipos";

/**
 * La ceremonia de elegir al primer Pokémon (≈3 s). Las otras tres pokébolas se apagan mientras la elegida va al
 * centro, se sacude con su luz, se abre, sale el Pokémon con su alegría, usa su movimiento (con el grito) y aparece
 * "se une a tu equipo". Todo con las piezas que ya existen.
 */
export type FaseCeremonia = "retirar" | "sacudir" | "abrir" | "sale" | "movimiento" | "texto" | "fin";

export interface Marca {
  fase: Exclude<FaseCeremonia, "fin">;
  desdeMs: number;
}

export const LINEA: Marca[] = [
  { fase: "retirar", desdeMs: 0 },
  { fase: "sacudir", desdeMs: 500 },
  { fase: "abrir", desdeMs: 1350 },
  { fase: "sale", desdeMs: 1500 },
  { fase: "movimiento", desdeMs: 2000 },
  { fase: "texto", desdeMs: 2300 },
];
export const DURACION_MS = 3100;

/** Sin movimiento: aparece el Pokémon quieto con el texto, un momento, y sigue. */
export const LINEA_REDUCIDA: Marca[] = [{ fase: "texto", desdeMs: 0 }];
export const DURACION_REDUCIDA_MS = 1400;

export function faseEn(ms: number, reducido: boolean): FaseCeremonia {
  const linea = reducido ? LINEA_REDUCIDA : LINEA;
  if (ms >= (reducido ? DURACION_REDUCIDA_MS : DURACION_MS)) return "fin";
  let fase: FaseCeremonia = linea[0].fase;
  for (const m of linea) if (ms >= m.desdeMs) fase = m.fase;
  return fase;
}

const primera = (lista: string[], disponibles: Record<string, DatosAnim>): string | null =>
  lista.find((a) => disponibles[a]) ?? null;

/** Su animación de alegría: la primera que la especie tenga entre Hop, Pose y Charge; si no, Idle. */
export function animAlegria(anims: Record<string, DatosAnim>): string {
  return primera(["Hop", "Pose", "Charge"], anims) ?? "Idle";
}

/** El golpe con el que lanza su poder: Shock el eléctrico; los demás, Shoot (disparo) y luego sus golpes propios. */
export function animGolpe(tipo: Tipo, anims: Record<string, DatosAnim>): string | null {
  const lista =
    tipo === "electrico" ? ["Shock", "Shoot", "Attack"] : ["Shoot", "Strike", "Kick", "Slam", "Attack"];
  return primera(lista, anims);
}
