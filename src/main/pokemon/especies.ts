import { KANTO } from "@compartido/kanto";
import { normalizar } from "../oido/nombres";
import { resolverEspecie, resolverExacta } from "./especie-oida";

export interface Especie {
  especie: number;
  /** Una sola palabra de letras: lo que se dice, se escribe y se pone por omisión («Mime» por Mr. Mime). */
  nombre: string;
  /** Cómo se ve escrito en el juego, si no coincide con `nombre` («Mr. Mime», «Nidoran♀»). */
  titulo?: string;
  /**
   * Cómo escribe el transcriptor este nombre cuando no lo conoce (no son palabras del español). Solo se usan para
   * entender a quién se llama ("llama a Square" → Squirtle); nunca se muestran.
   */
  oidos?: string[];
}

/** Las especies que se pueden sacar; solo cuentan las que tienen sus sprites bajados (scripts/bajar-sprites.mjs). */
const CATALOGO_BASE: Especie[] = [
  { especie: 1, nombre: "Bulbasaur", oidos: ["bolbasar", "bulbasor", "balbasar"] },
  {
    especie: 4,
    nombre: "Charmander",
    oidos: ["sharmander", "chamander", "sermander", "tarmander", "yarmander", "armander"],
  },
  {
    especie: 7,
    nombre: "Squirtle",
    oidos: [
      "square",
      "squirrel",
      "skittle",
      "escuerto",
      "escuirtel",
      "esquirtel",
      "scuartel",
      "cuarto",
      "escuela",
      "scourt",
    ],
  },
  { especie: 25, nombre: "Pikachu", oidos: ["picachu", "pikachu", "icachu"] },
  { especie: 39, nombre: "Jigglypuff", oidos: ["yiglipuf", "jiglipuf", "yigglypuff"] },
  { especie: 52, nombre: "Meowth", oidos: ["miaut", "meaut", "miau"] },
  { especie: 54, nombre: "Psyduck", oidos: ["saidoc", "saidak", "sidoc", "saiduck"] },
  { especie: 94, nombre: "Gengar", oidos: ["guengar", "yengar", "jengar", "hengar", "genar"] },
  { especie: 133, nombre: "Eevee", oidos: ["ivi", "ibi", "evi", "ivy"] },
  { especie: 143, nombre: "Snorlax", oidos: ["esnorlax", "esnorlas"] },
  { especie: 150, nombre: "Mewtwo", oidos: ["miutu", "miuto", "mewto", "miudos"] },
  { especie: 151, nombre: "Mew", oidos: ["miu"] },
  { especie: 448, nombre: "Lucario", oidos: ["lukario"] },
  // Evoluciones y preevoluciones de las de arriba: se llaman por su nombre, igual que las demás.
  { especie: 2, nombre: "Ivysaur", oidos: ["aivisor", "ivisaur", "aivisaur"] },
  { especie: 3, nombre: "Venusaur", oidos: ["venusor", "benusaur"] },
  { especie: 5, nombre: "Charmeleon", oidos: ["charmelion", "sharmelion"] },
  { especie: 6, nombre: "Charizard", oidos: ["charizar", "sharizar", "charisar", "sharisar"] },
  { especie: 8, nombre: "Wartortle", oidos: ["wartortel", "guartortel", "uartortel"] },
  { especie: 9, nombre: "Blastoise", oidos: ["blastois", "blastoys"] },
  { especie: 26, nombre: "Raichu", oidos: ["rayshu", "raishu"] },
  { especie: 172, nombre: "Pichu", oidos: ["pishu"] },
  { especie: 40, nombre: "Wigglytuff", oidos: ["wiglitaf", "guiglitof", "wiglitof"] },
  { especie: 53, nombre: "Persian", oidos: ["persia", "pershan"] },
  { especie: 55, nombre: "Golduck", oidos: ["golduc", "goldoc", "goldak"] },
  { especie: 92, nombre: "Gastly", oidos: ["gasli", "gastli"] },
  { especie: 93, nombre: "Haunter", oidos: ["jaunter", "jonter", "honter", "hanter", "janter"] },
  { especie: 134, nombre: "Vaporeon", oidos: ["baporeon", "vaporion"] },
  { especie: 135, nombre: "Jolteon", oidos: ["yolteon", "yoltion"] },
  { especie: 136, nombre: "Flareon", oidos: ["flarion", "flerion"] },
  { especie: 446, nombre: "Munchlax", oidos: ["monchlax", "munchlas", "monchlas"] },
  { especie: 447, nombre: "Riolu", oidos: ["riolo"] },
];

/** Cómo oye el transcriptor los nombres que no son una palabra más del español: con símbolo, punto o apóstrofo. */
const OIDOS_EXTRA: Record<number, string[]> = {
  29: ["nidoran hembra", "nidoran femenino"],
  32: ["nidoran macho", "nidoran masculino"],
  83: ["farfech", "farfetch", "farfech de"],
  122: ["mister mime", "mr mime", "mistermaim"],
  // Nombres de pronunciación inglesa: así los escribe el transcriptor cuando la persona los dice.
  37: ["bulpix", "bulpics"],
  59: ["arcanai", "arcanain", "arcanaine", "arkanain"],
  65: ["alacasam", "alakasam", "alacazam"],
  68: ["machan", "macham", "machamb"],
  74: ["yiodud", "yeodud", "jeodud", "giodude"],
  95: ["onis", "onics"],
  123: ["saider", "saiter", "sayther", "saizer"],
  129: ["mayikarp", "mayicar", "majicarp"],
  130: ["guiarados", "yarados", "giarados"],
  149: ["dragonight"],
};

/**
 * Las 151 de Kanto (nombres y tipos en `@compartido/kanto`) más las que viven fuera de Kanto. Las que ya traían
 * variantes oídas las conservan; las demás se resuelven por sonido (`fonetica`) sin lista a mano.
 */
export const CATALOGO: Especie[] = [
  ...CATALOGO_BASE.map((e) => {
    const k = KANTO.find((x) => x.especie === e.especie);
    return k?.titulo ? { ...e, titulo: k.titulo } : e;
  }),
  ...KANTO.filter((k) => !CATALOGO_BASE.some((e) => e.especie === k.especie)).map(
    (k): Especie => ({
      especie: k.especie,
      nombre: k.nombre,
      ...(k.titulo ? { titulo: k.titulo } : {}),
      ...(OIDOS_EXTRA[k.especie] ? { oidos: OIDOS_EXTRA[k.especie] } : {}),
    }),
  ),
];

export type Eleccion =
  | { tipo: "especie"; especie: Especie }
  /** Se parece a una especie pero no es su nombre: no se actúa, se sugiere («¿Quisiste decir Kakuna?»). */
  | { tipo: "aproximada"; sugerida: Especie }
  | { tipo: "desconocida"; disponibles: Especie[] };

/**
 * Qué especie pide `valor`: un nombre (sin importar tildes ni mayúsculas), un número de la Pokédex, o "azar"
 * (una distinta de la actual). Si no se reconoce o no está bajada, devuelve las disponibles para avisarlas.
 */
export function elegirEspecie(
  valor: string,
  disponibles: Especie[],
  actual: number,
  azar: () => number,
): Eleccion {
  const buscado = normalizar(valor).trim();
  const desconocida: Eleccion = { tipo: "desconocida", disponibles };
  if (!buscado) return desconocida;
  if (buscado === "azar" || buscado === "random" || buscado === "sorpresa") {
    const otras = disponibles.filter((e) => e.especie !== actual);
    if (otras.length === 0) return desconocida;
    return { tipo: "especie", especie: otras[Math.min(otras.length - 1, Math.floor(azar() * otras.length))] };
  }
  const numero = /^\d+$/.test(buscado) ? Number(buscado) : null;
  if (numero !== null) {
    const porNumero = disponibles.find((e) => e.especie === numero);
    return porNumero ? { tipo: "especie", especie: porNumero } : desconocida;
  }
  // Por escrito solo actúa el nombre exacto (o una variante oída curada); lo aproximado ("Karina" ~ Kakuna) sugiere.
  const exacta = resolverExacta(valor, disponibles);
  if (exacta) return { tipo: "especie", especie: exacta };
  const parecida = resolverEspecie(valor, disponibles);
  return parecida ? { tipo: "aproximada", sugerida: parecida } : desconocida;
}
