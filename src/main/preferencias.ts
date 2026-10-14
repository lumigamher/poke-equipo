import { readFileSync, writeFileSync } from "node:fs";

/** Dónde lo dejó la persona: `x` en px desde la izquierda y `alto` en px sobre el suelo (0 = en el suelo, paseando). */
export interface Lugar {
  x: number;
  alto: number;
}

/** Cómo llegó a la incubadora: a mano (se queda hasta que lo saquen) o solo al trabajar (sale solo al terminar). */
export type Escondido = "manual" | "auto";

/** Tamaño de la burbuja abierta, el mismo para todos. */
export interface TamanoBurbuja {
  ancho: number;
  alto: number;
}

/** Lo que la persona ajusta desde el menú del Pokémon y debe seguir igual al volver a abrir la app. */
export interface Preferencias {
  /** Pokémon (por id) que se quedan quietos donde están en vez de pasear. */
  quietos: string[];
  /** Texto más grande en burbujas y rótulos. */
  textoGrande: boolean;
  /** La persona ya hizo (o saltó) el recorrido de la primera vez. */
  recorridoHecho: boolean;
  /** Marcó "No volver a mostrar" en el aviso de que falta iniciar sesión en Claude Code. */
  ocultarAvisoSesion: boolean;
  /** Dónde dejó a cada Pokémon (por id) la última vez que lo soltó. */
  lugares: Record<string, Lugar>;
  /** Los que están en la incubadora (por id) y cómo llegaron. */
  escondidos: Record<string, Escondido>;
  /** Se esconden solos en la incubadora al empezar a trabajar y salen al terminar. */
  esconderAlTrabajar: boolean;
  /** Tamaño que la persona le dio a la burbuja; null = el de siempre. */
  burbuja: TamanoBurbuja | null;
}

export const PREFERENCIAS_POR_DEFECTO: Preferencias = {
  quietos: [],
  textoGrande: false,
  recorridoHecho: false,
  ocultarAvisoSesion: false,
  lugares: {},
  escondidos: {},
  esconderAlTrabajar: false,
  burbuja: null,
};

const esObjeto = (d: unknown): d is Record<string, unknown> =>
  d !== null && typeof d === "object" && !Array.isArray(d);
const numeroNoNegativo = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
const numeroPositivo = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

function validarLugares(d: unknown): Record<string, Lugar> {
  if (!esObjeto(d)) return {};
  const lugares: Record<string, Lugar> = {};
  for (const [id, l] of Object.entries(d)) {
    if (esObjeto(l) && numeroNoNegativo(l.x) && numeroNoNegativo(l.alto))
      lugares[id] = { x: l.x, alto: l.alto };
  }
  return lugares;
}

function validarEscondidos(d: unknown): Record<string, Escondido> {
  if (!esObjeto(d)) return {};
  const escondidos: Record<string, Escondido> = {};
  for (const [id, e] of Object.entries(d)) if (e === "manual" || e === "auto") escondidos[id] = e;
  return escondidos;
}

function validarBurbuja(d: unknown): TamanoBurbuja | null {
  return esObjeto(d) && numeroPositivo(d.ancho) && numeroPositivo(d.alto)
    ? { ancho: d.ancho, alto: d.alto }
    : null;
}

/** Lo que haya de válido en `dato`; lo demás, por defecto. */
export function validarPreferencias(dato: unknown): Preferencias {
  const d = (dato && typeof dato === "object" ? dato : {}) as Record<string, unknown>;
  return {
    quietos: Array.isArray(d.quietos) ? d.quietos.filter((x): x is string => typeof x === "string") : [],
    textoGrande: d.textoGrande === true,
    recorridoHecho: d.recorridoHecho === true,
    ocultarAvisoSesion: d.ocultarAvisoSesion === true,
    lugares: validarLugares(d.lugares),
    escondidos: validarEscondidos(d.escondidos),
    esconderAlTrabajar: d.esconderAlTrabajar === true,
    burbuja: validarBurbuja(d.burbuja),
  };
}

/** Un archivo que falta o está roto no impide arrancar: se usan las de por defecto. */
export function leerPreferencias(ruta: string): Preferencias {
  try {
    return validarPreferencias(JSON.parse(readFileSync(ruta, "utf8")));
  } catch {
    return { ...PREFERENCIAS_POR_DEFECTO };
  }
}

export function guardarPreferencias(ruta: string, p: Preferencias): void {
  writeFileSync(ruta, `${JSON.stringify(p, null, 2)}\n`);
}

/** Pone o quita a `id` de los quietos. */
export function alternarQuieto(p: Preferencias, id: string): Preferencias {
  const estaba = p.quietos.includes(id);
  return { ...p, quietos: estaba ? p.quietos.filter((x) => x !== id) : [...p.quietos, id] };
}

/** Guarda dónde la persona dejó a `id`. */
export function ponerLugar(p: Preferencias, id: string, lugar: Lugar): Preferencias {
  return { ...p, lugares: { ...p.lugares, [id]: { x: lugar.x, alto: lugar.alto } } };
}

/** Lo esconde a mano; si ya estaba en la incubadora (a mano o solo), lo saca. */
export function alternarEscondido(p: Preferencias, id: string): Preferencias {
  return p.escondidos[id]
    ? sacarDeIncubadora(p, id)
    : { ...p, escondidos: { ...p.escondidos, [id]: "manual" } };
}

/** Saca a `id` de la incubadora; si no estaba, devuelve las mismas preferencias. */
export function sacarDeIncubadora(p: Preferencias, id: string): Preferencias {
  if (!p.escondidos[id]) return p;
  const { [id]: _, ...resto } = p.escondidos;
  return { ...p, escondidos: resto };
}

/** Esconde a mano a todos los `ids`: también los que se habían escondido solos, para que no salgan al terminar. */
export function esconderTodos(p: Preferencias, ids: string[]): Preferencias {
  const escondidos = { ...p.escondidos };
  for (const id of ids) escondidos[id] = "manual";
  return { ...p, escondidos };
}

/** Vacía la incubadora. */
export function sacarTodos(p: Preferencias): Preferencias {
  return { ...p, escondidos: {} };
}

/** Ningún lugar ni tamaño legítimo pasa de esto: lo que venga más grande es un mensaje roto. */
const TOPE_PX = 20000;
const razonable = (n: unknown, min: (n: number) => boolean): n is number =>
  typeof n === "number" && Number.isFinite(n) && min(n) && n <= TOPE_PX;

/** El mensaje del renderer al soltar un Pokémon (`{ pokemonId, x, alto }`), validado; null si no sirve. */
export function lugarDesdeMensaje(dato: unknown): { id: string; lugar: Lugar } | null {
  if (!esObjeto(dato) || typeof dato.pokemonId !== "string" || dato.pokemonId === "") return null;
  const { x, alto } = dato;
  if (!razonable(x, (n) => n >= 0) || !razonable(alto, (n) => n >= 0)) return null;
  return { id: dato.pokemonId, lugar: { x, alto } };
}

/** El mensaje del renderer al ajustar la burbuja (`{ ancho, alto }`), validado; null si no sirve. */
export function tamanoDesdeMensaje(dato: unknown): TamanoBurbuja | null {
  if (!esObjeto(dato)) return null;
  const { ancho, alto } = dato;
  if (!razonable(ancho, (n) => n > 0) || !razonable(alto, (n) => n > 0)) return null;
  return { ancho, alto };
}
