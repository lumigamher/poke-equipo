import { KANTO } from "./kanto";

/** El tipo de cada Pokémon: decide el poder que lanza y, en el equipo, su especialidad y su modelo. */
export type Tipo =
  | "electrico"
  | "fuego"
  | "agua"
  | "planta"
  | "hada"
  | "fantasma"
  | "psiquico"
  | "lucha"
  | "normal"
  | "bicho"
  | "veneno"
  | "tierra"
  | "roca"
  | "hielo"
  | "dragon";

/** Todos los tipos, en el orden de config/tipos.json. */
export const TIPOS: readonly Tipo[] = [
  "electrico",
  "fuego",
  "agua",
  "planta",
  "hada",
  "fantasma",
  "psiquico",
  "lucha",
  "normal",
  "bicho",
  "veneno",
  "tierra",
  "roca",
  "hielo",
  "dragon",
];

/** Los tipos de las especies de Kanto salen de su tabla (kanto.ts); aquí solo las demás. */
const TIPO_DE: Record<number, Tipo> = {
  ...Object.fromEntries(KANTO.map((k) => [k.especie, k.tipo])),
  172: "electrico",
  447: "lucha",
  448: "lucha",
};

export function tipoDe(especie: number): Tipo {
  return Object.hasOwn(TIPO_DE, especie) ? TIPO_DE[especie] : "normal";
}
