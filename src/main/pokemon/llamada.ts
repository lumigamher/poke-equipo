import { normalizar } from "../oido/nombres";

export interface LlamadaLeida {
  nombreEspecie: string;
  encargo: string;
}

// Formas de pedir que salga otro Pokémon, sobre el texto normalizado:
// - "llama a X", "llamar a X", "necesito/quiero que llames a X", "llamame a X", "trae a X", "saca a X".
// - "yama"/"yamar": con yeísmo el transcriptor escribe así "llama". "ya mas": así sale "llama a S…".
// - La "a" es opcional solo con llama/yama (se funde al hablar: "llamaa"); sin ella cuenta un único nombre
//   (o nombre + "para …"), así que "llama la función de pago" sigue siendo una orden. "saca" y "trae" siempre
//   llevan la "a": "saca reporte" es una orden.
const ENTRADA = "(?:(?:necesito|quiero) que |por favor |puedes )?";
const LLAMAR = new RegExp(
  `^${ENTRADA}(?:(?:llama|llamar|llames|llamame|yama|yamar|ya mas)(?: a)?|(?:trae|traeme|traigas|saca|sacame|saques) a) ((?:es )?\\S+)(?: para(?: (.*))?)?$`,
);
const VUELVE = new Set(["vuelve", "vuelve ya", "vete", "guardate"]);

/** Los verbos con los que se pide sacar a otro Pokémon (los de LLAMAR, sin "ya mas"): un nombre propio no puede serlos. */
export const VERBOS_LLAMAR = [
  "llama",
  "llamar",
  "llames",
  "llamame",
  "yama",
  "yamar",
  "trae",
  "traeme",
  "traigas",
  "saca",
  "sacame",
  "saques",
];
/** Las palabras de "vuelve", sueltas. */
export const PALABRAS_VUELVE = [...VUELVE].flatMap((f) => f.split(" "));

/**
 * Normaliza como `normalizar` pero recuerda, para cada carácter del resultado,
 * en qué posición del texto original estaba. Así se puede cortar el original
 * donde coincidió el patrón normalizado.
 */
function normalizarConMapa(texto: string): { normal: string; origen: number[] } {
  let normal = "";
  const origen: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    const trozo = texto[i]
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ");
    for (const c of trozo) {
      const espacio = /\s/.test(c);
      // Espacios colapsados y sin espacio inicial, igual que `normalizar`.
      if (espacio && (normal === "" || normal.endsWith(" "))) continue;
      normal += espacio ? " " : c;
      origen.push(i);
    }
  }
  if (normal.endsWith(" ")) {
    normal = normal.slice(0, -1);
    origen.pop();
  }
  return { normal, origen };
}

/**
 * Lee "llama a charmander para que revise X". Reconoce la forma sobre el texto normalizado,
 * pero el encargo se corta del texto ORIGINAL: Claude debe recibir rutas, mayúsculas,
 * tildes y puntuación tal como se dijeron. Null si no es una llamada.
 */
export function leerLlamada(texto: string): LlamadaLeida | null {
  const { normal, origen } = normalizarConMapa(texto);
  const m = LLAMAR.exec(normal);
  if (!m) return null;
  const encargo = m[2] ? texto.slice(origen[normal.length - m[2].length]).trim() : "";
  return { nombreEspecie: m[1], encargo };
}

/** True si el texto es "vuelve" (y variantes): guardar al Pokémon nombrado. */
export function esVuelve(texto: string): boolean {
  return VUELVE.has(normalizar(texto));
}
