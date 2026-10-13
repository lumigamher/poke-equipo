import { POKEBOLA_COLORES, POKEBOLA_FILAS } from "@compartido/pokebola-pixeles";
import type { Actividad, DatosAnim } from "@compartido/tipos";
import type { Direccion } from "./animaciones";
import { ESPECIALES, GOLPES } from "./poderes";

export type NombreObjeto =
  | "pc"
  | "tablero"
  | "libro"
  | "lupa"
  | "consola"
  | "muneco"
  | "catalejo"
  | "pokebola"
  | "caja"
  | "cohete"
  | "libreta";

export interface PoseActividad {
  /** Animaciones en orden de preferencia; la última siempre existe. */
  anims: string[];
  frente: boolean;
  objeto: NombreObjeto | null;
  /** Va y viene frente al objeto. */
  vaiven: boolean;
  /** Se gira de tres cuartos hacia el objeto, como quien trabaja en él. */
  mirarObjeto: boolean;
  /** Multiplica la velocidad de la animación: menos de 1 la calma. */
  velocidad: number;
  /** Cada tanto suelta un ataque de una sola pasada y vuelve a la calma. */
  golpes?: Golpes;
}

export interface Golpes {
  /** Ataques en orden de preferencia. */
  anims: string[];
  /** true: alterna entre los que la especie tenga. false: siempre el primero que tenga. */
  rotar: boolean;
  /** Pausa entre el final de un golpe y el comienzo del siguiente. */
  cadaMs: number;
  /** "proyectil": el poder de su tipo vuela hasta el objeto. "impacto": pega de cerca, solo el destello. */
  poder: "proyectil" | "impacto" | null;
}

/**
 * Solo hojas de 8 direcciones: las de una fila (Sit, LookUp, Eat) muestran al Pokémon de espaldas o sin cara.
 * Charge y Nod a velocidad normal cambian de cuadro cada 2 a 8 tics y se leen como un temblor: el trabajo va
 * con Nod a menos de la mitad (mira lo que escribe) mientras el objeto se anima solo (la pantalla teclea).
 * Los ataques no van en bucle por lo mismo: salen de a uno, con calma en medio (`golpes`).
 */
export const POSES_ACTIVIDAD: Record<Actividad, PoseActividad> = {
  programando: {
    anims: ["Nod"],
    frente: false,
    objeto: "pc",
    vaiven: false,
    mirarObjeto: true,
    velocidad: 0.4,
    golpes: { anims: ["Shoot", "Attack"], rotar: false, cadaMs: 4200, poder: "proyectil" },
  },
  // DeepBreath es de una fila pero mira al frente: respira hondo mientras piensa.
  pensando: {
    anims: ["DeepBreath", "Idle"],
    frente: true,
    objeto: null,
    vaiven: false,
    mirarObjeto: false,
    velocidad: 0.6,
  },
  planeando: {
    anims: ["Walk"],
    frente: false,
    objeto: "tablero",
    vaiven: true,
    mirarObjeto: false,
    velocidad: 1,
  },
  leyendo: {
    anims: ["Nod"],
    frente: false,
    objeto: "libro",
    vaiven: false,
    mirarObjeto: true,
    velocidad: 0.3,
  },
  buscando: {
    anims: ["Walk"],
    frente: false,
    objeto: "lupa",
    vaiven: true,
    mirarObjeto: false,
    velocidad: 1,
  },
  ejecutando: {
    anims: ["Nod"],
    frente: false,
    objeto: "consola",
    vaiven: false,
    mirarObjeto: true,
    velocidad: 0.4,
    // Su ataque propio (Shock, Withdraw, Kick…) contra la consola.
    golpes: { anims: ESPECIALES, rotar: false, cadaMs: 3600, poder: "proyectil" },
  },
  probando: {
    anims: ["Idle"],
    frente: false,
    objeto: "muneco",
    vaiven: false,
    mirarObjeto: true,
    velocidad: 1,
    golpes: { anims: GOLPES, rotar: true, cadaMs: 1500, poder: "impacto" },
  },
  explorando: {
    anims: ["Pose"],
    frente: true,
    objeto: "catalejo",
    vaiven: false,
    mirarObjeto: false,
    velocidad: 0.6,
  },
  delegando: {
    anims: ["Idle"],
    frente: false,
    objeto: "pokebola",
    vaiven: false,
    mirarObjeto: true,
    velocidad: 1,
    golpes: { anims: ["Shoot", "Hop"], rotar: false, cadaMs: 2600, poder: null },
  },
  publicando: {
    anims: ["Idle"],
    frente: false,
    objeto: "cohete",
    vaiven: false,
    mirarObjeto: true,
    velocidad: 1,
    golpes: { anims: ["QuickStrike", "Strike", "Attack"], rotar: false, cadaMs: 3000, poder: "proyectil" },
  },
  herramienta: {
    anims: ["Nod"],
    frente: false,
    objeto: "caja",
    vaiven: false,
    mirarObjeto: true,
    velocidad: 0.4,
    golpes: { anims: ["Swing", "Attack"], rotar: false, cadaMs: 4000, poder: "impacto" },
  },
  respondiendo: {
    anims: ["Nod"],
    frente: false,
    objeto: "libreta",
    vaiven: false,
    mirarObjeto: true,
    velocidad: 0.4,
  },
};

/** Hacia dónde mira quien trabaja en un objeto que está a ese lado. */
export function miradaHacia(lado: "derecha" | "izquierda"): Direccion {
  return lado === "derecha" ? "frente-derecha" : "frente-izquierda";
}

export function elegirDe(lista: string[], disponibles: Record<string, DatosAnim>): string | null {
  for (const nombre of [...lista, "Idle", "Walk"]) if (disponibles[nombre]) return nombre;
  return Object.keys(disponibles)[0] ?? null;
}

export const VAIVEN_ANCHO = 24;
const VAIVEN_TRAMO_MS = 1500;

/** Posición y dirección de un paseo corto de ida y vuelta, en función del tiempo. */
export function vaiven(ms: number): { dx: number; direccion: Direccion } {
  const t = ms % (VAIVEN_TRAMO_MS * 2);
  const ida = t < VAIVEN_TRAMO_MS;
  const avance = (ida ? t : t - VAIVEN_TRAMO_MS) / VAIVEN_TRAMO_MS;
  const dx = ida ? -VAIVEN_ANCHO + 2 * VAIVEN_ANCHO * avance : VAIVEN_ANCHO - 2 * VAIVEN_ANCHO * avance;
  return { dx, direccion: ida ? "derecha" : "izquierda" };
}

/** Espacio horizontal que ocupa el objeto a un lado del Pokémon: distancia más el objeto más ancho. */
export const ESPACIO_OBJETO = 116;

/** Lado del Pokémon donde se pone el objeto: a la izquierda si a la derecha se saldría de la ventana. */
export function ladoObjeto(xPokemon: number, anchoVentana: number, espacio: number): "derecha" | "izquierda" {
  if (anchoVentana < espacio) return "derecha";
  return xPokemon + espacio > anchoVentana ? "izquierda" : "derecha";
}

/** Colores de cada objeto que son "texto": aparecen uno a uno, como si se escribieran. */
const TEXTO: Partial<Record<NombreObjeto, string>> = {
  pc: "w",
  consola: "wv",
  libreta: "l",
  tablero: "br",
};

/** Color de fondo sobre el que se escribe: lo aún no escrito se pinta de este color. */
const FONDO_TEXTO: Partial<Record<NombreObjeto, string>> = {
  pc: "s",
  consola: "k",
  libreta: "p",
  tablero: "w",
};

export function colorFondoTexto(tipo: NombreObjeto): string | null {
  const clave = FONDO_TEXTO[tipo];
  return clave ? OBJETOS[tipo].colores[clave] : null;
}

/** Las celdas de texto de un objeto, en orden de lectura (fila por fila, de izquierda a derecha). */
export function celdasTexto(tipo: NombreObjeto): { x: number; y: number }[] {
  const claves = TEXTO[tipo] ?? "";
  const lista: { x: number; y: number }[] = [];
  OBJETOS[tipo].filas.forEach((fila, y) => {
    [...fila].forEach((c, x) => {
      if (claves.includes(c)) lista.push({ x, y });
    });
  });
  return lista;
}

export interface Rejilla {
  /** Una cadena por fila; "." es transparente, cualquier otra letra es una clave de `colores`. */
  filas: string[];
  colores: Record<string, string>;
}

export const OBJETOS: Record<NombreObjeto, Rejilla> = {
  pokebola: { filas: POKEBOLA_FILAS, colores: POKEBOLA_COLORES },
  libro: {
    filas: [
      ".mmmmm.mmmmm.",
      "mhhhhhmhhhhhm",
      "mhggghmhggghm",
      "mhhhhhmhhhhhm",
      "mhggghmhggghm",
      "mhhhhhmhhhhhm",
      "mmmmmmmmmmmmm",
    ],
    colores: { m: "#6b3f1d", h: "#f6efdc", g: "#9a9a9a" },
  },
  // Monitor con código sobre un escritorio de madera.
  pc: {
    filas: [
      ".nnnnnnnnnnnnnn.",
      ".nggggggggggggn.",
      ".ngssssssssssgn.",
      ".ngswwwwsssssgn.",
      ".ngssswwwwwssgn.",
      ".ngswwwssssssgn.",
      ".ngsssswwwsssgn.",
      ".ngssssssssssgn.",
      ".nggggggggggggn.",
      ".nnnnnnnnnnnnnn.",
      "......nggn......",
      "..nggggggggggn..",
      "nnnnnnnnnnnnnnnn",
      "nmmmmmmmmmmmmmmn",
      "nnnnnnnnnnnnnnnn",
    ],
    colores: { n: "#1c1c1c", g: "#b8b8b8", s: "#3b7dd8", w: "#f4f4f4", m: "#8a5a2b" },
  },
  // Pizarra con tres líneas de apuntes sobre un caballete.
  tablero: {
    filas: [
      "nnnnnnnnnnnnnnnn",
      "nwwwwwwwwwwwwwwn",
      "nwbbbbbbbbbwwwwn",
      "nwwwwwwwwwwwwwwn",
      "nwbbbbbbbbbbbbwn",
      "nwwwwwwwwwwwwwwn",
      "nwrrrrrrwwwwwwwn",
      "nwwwwwwwwwwwwwwn",
      "nnnnnnnnnnnnnnnn",
      "..ng........gn..",
      "..ng........gn..",
      "..ng........gn..",
      ".nngn......ngnn.",
    ],
    colores: { n: "#1c1c1c", w: "#f4f4f4", b: "#3b7dd8", r: "#e03a3a", g: "#9a9a9a" },
  },
  // Lupa con el mango en diagonal.
  lupa: {
    filas: [
      "...nnnnnnnn.....",
      "..nggggggggn....",
      ".nggwwggggggn...",
      ".ngwwgggggggn...",
      ".ngwggggggggn...",
      ".nggggggggggn...",
      ".nggggggggggn...",
      ".nggggggggggn...",
      "..nggggggggn....",
      "...nnnnnnnn.....",
      "..........nhn...",
      "...........nhn..",
      "............nhn.",
      ".............nhn",
      "..............nn",
    ],
    colores: { n: "#1c1c1c", g: "#bfe6f5", w: "#f4f4f4", h: "#8a5a2b" },
  },
  // Pantalla oscura con un indicador ">" y un cursor verde.
  consola: {
    filas: [
      "nnnnnnnnnnnnnnnn",
      "nkkkkkkkkkkkkkkn",
      "nkvkkwwwwwwkkkkn",
      "nkkvkkkkkkkkkkkn",
      "nkvkkwwwwkkkkkkn",
      "nkkkkkkkkkkkkkkn",
      "nkvkkvvkkkkkkkkn",
      "nkkkkvvkkkkkkkkn",
      "nnnnnnnnnnnnnnnn",
      "....nnnnnnnn....",
    ],
    colores: { n: "#1c1c1c", k: "#2b2f36", v: "#4ade80", w: "#9a9a9a" },
  },
  // Muñeco de práctica: cabeza, brazos, torso con banda roja y palo con base.
  muneco: {
    filas: [
      "....nnnn....",
      "...nssssn...",
      "...nssssn...",
      "...nsrrsn...",
      "...nnnnnn...",
      "nnnnnnnnnnnn",
      "nssssssssssn",
      "nnnnnnnnnnnn",
      "...nssssn...",
      "...nrrrrn...",
      "...nssssn...",
      "....nwwn....",
      "....nwwn....",
      "..nnnwwnnn..",
      "..nwwwwwwn..",
      "..nnnnnnnn..",
    ],
    colores: { n: "#1c1c1c", s: "#d9b45a", r: "#e03a3a", w: "#8a5a2b" },
  },
  // Catalejo en diagonal: lente arriba a la derecha, ocular abajo a la izquierda.
  catalejo: {
    filas: [
      "..........nnnn..",
      ".........nlllln.",
      ".........nlllln.",
      "........nddddn..",
      ".......nddddn...",
      ".......nbbbn....",
      "......nbbbn.....",
      ".....ndddn......",
      "....ndddn.......",
      "...nbbbn........",
      "..nbbbn.........",
      "..nddn..........",
      ".nddn...........",
      "nddn............",
      ".nn.............",
    ],
    colores: { n: "#1c1c1c", l: "#bfe6f5", b: "#d4a02f", d: "#8a6a1c" },
  },
  // Caja de herramientas roja con asa y cierre.
  caja: {
    filas: [
      "....nnnnnnnn....",
      "...ng......gn...",
      "...ng......gn...",
      "nnnnnnnnnnnnnnnn",
      "nrrrrrrrrrrrrrrn",
      "nrrrrrrrrrrrrrrn",
      "nnnnnnnnnnnnnnnn",
      "nddddddggddddddn",
      "nddddddggddddddn",
      "nddddddddddddddn",
      "nddddddddddddddn",
      "nnnnnnnnnnnnnnnn",
    ],
    colores: { n: "#1c1c1c", r: "#e8584a", d: "#a3322a", g: "#9a9a9a" },
  },
  // Cohete en su plataforma: lo que se manda al mundo.
  cohete: {
    filas: [
      ".....nn.....",
      "....nwwn....",
      "...nwwwwn...",
      "...nwccwn...",
      "...nwccwn...",
      "...nwwwwn...",
      "..nnwwwwnn..",
      ".nrnwwwwnrn.",
      "nrrnwwwwnrrn",
      "nrnnnnnnnnrn",
      "nn..noon..nn",
      "....noon....",
      ".....oo.....",
      "nnnnnnnnnnnn",
    ],
    colores: { n: "#1c1c1c", w: "#f4f4f4", c: "#6fa8dc", r: "#e03a3a", o: "#f08030" },
  },
  // Libreta de espiral: anillos a la izquierda, hojas con renglones azules.
  libreta: {
    filas: [
      "..nnnnnnnnn.",
      "nsnpppppppn.",
      "nsnplllllpn.",
      "..npppppppn.",
      "nsnplllllpn.",
      "nsnpppppppn.",
      "..nplllllpn.",
      "nsnpppppppn.",
      "nsnplllllpn.",
      "..npppppppn.",
      "..nnnnnnnnn.",
    ],
    colores: { n: "#1c1c1c", s: "#9a9a9a", p: "#f6efdc", l: "#6fa8dc" },
  },
};
