import { normalizar, plegar, suenaCorta, suenaIgual } from "./sonido";

/**
 * El nombre propio de un Pokémon (lo que la persona le pone para que la voz lo entienda mejor). Lógica pura: la usan el
 * laboratorio (en vivo, con el contexto que le manda main) y main (que nunca cree lo que llega por IPC).
 */
export const MIN_NOMBRE = 2;
export const MAX_NOMBRE = 12;

export interface ContextoNombre {
  /**
   * Palabras que la app interpreta al oírlas (mando, modelos, glosario), normalizadas. De dónde sale: `palabrasReservadas`
   * en main/entrenador, que las deriva de las mismas tablas que usa `decidir`.
   */
  reservadas: string[];
  /**
   * El subconjunto de `reservadas` que son palabras de permiso y de mando (sí/no, cancelar, llamar, guardar, usar):
   * contra ellas un nombre corto no puede ni parecerse a una letra. Sin él, todas cuentan como de mando.
   */
  mando?: string[];
  /** Nombres de las demás especies del catálogo (sin la del propio Pokémon): un nombre propio no puede ser igual a ninguno. */
  especies: string[];
  /**
   * Las especies de los Pokémon que ya están en el equipo (sin la de este): contra ellas el nombre se compara por
   * sonido, porque la voz las confundiría con el compañero. Sin ellas solo cuenta la igualdad exacta.
   */
  especiesEquipo?: string[];
  /**
   * El nombre de su propia especie: dejarlo (o volver a él) siempre vale, aunque suene parecido a otra especie
   * ("Pikachu" y "Pichu"), porque es lo que la voz ya entiende hoy.
   */
  propia?: string;
  /** Los demás Pokémon del equipo, con las variantes oídas que ya aprendieron. */
  otros: { nombre: string; apodos: string[] }[];
}

/**
 * Palabras con las que se empieza una frase al hablar. Con el micrófono abierto, un Pokémon que se llamara así tomaría
 * por una orden cualquier frase que empiece igual.
 */
export const PALABRAS_COMUNES = [
  "bueno",
  "buena",
  "buenas",
  "pero",
  "mira",
  "mire",
  "hola",
  "listo",
  "lista",
  "oye",
  "oiga",
  "vale",
  "claro",
  "entonces",
  "ahora",
  "bien",
  "mal",
  "ok",
  "okay",
  "gracias",
  "perdon",
  "disculpa",
  "espera",
  "momento",
  "mas",
  "menos",
  "tambien",
  "ademas",
  "luego",
  "despues",
  "antes",
  "porque",
  "como",
  "cuando",
  "donde",
  "que",
  "quien",
  "cual",
  "eso",
  "esto",
  "ese",
  "esta",
  "aqui",
  "alli",
  "ahi",
  "aja",
  "ah",
  "eh",
  "uh",
  "um",
  "este",
  "pues",
  "ve",
  "vamos",
  "venga",
  "dime",
  "di",
  "mande",
  "adios",
  "chao",
  "vaya",
  "ojala",

  "nada",
  "todo",
  "algo",
  "hay",
  "favor",
  "ya",
  "yo",
  "tu",
  "el",
  "la",
  "un",
  "una",
  "y",
  "o",
  "a",
  "de",
  "en",
  "con",
  "sin",
  "por",
  "si",
  "no",
];

/**
 * ¿Se confunde con una palabra de mando o con una muy común?
 * - Reservadas (todas): suenan igual por el criterio de la resolución por voz (`suenaIgual`) o al plegar la fonética.
 * - De mando (permiso, cancelar, llamar, guardar, usar): además, un nombre corto (≤3 letras) a una letra de ellas.
 * - Comunes: solo si suenan exactamente igual al plegar (así «Luna», «Max» o «Bola» valen aunque se parezcan a «una»,
 *   «mas» u «hola»).
 */
export function esPalabraDeMando(
  palabra: string,
  reservadas: readonly string[],
  mando: readonly string[] = reservadas,
): boolean {
  const p = plegar(palabra);
  return (
    reservadas.some((r) => suenaIgual(palabra, r) || plegar(r) === p) ||
    mando.some((m) => suenaCorta(palabra, m)) ||
    PALABRAS_COMUNES.some((c) => plegar(c) === p)
  );
}

export type ResultadoNombre = { ok: true; nombre: string } | { ok: false; motivo: string };

const SOLO_LETRAS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+$/;

const conMayuscula = (t: string) => t.charAt(0).toLocaleUpperCase("es") + t.slice(1).toLocaleLowerCase("es");

export function validarNombre(texto: string, ctx: ContextoNombre): ResultadoNombre {
  const t = texto.trim().normalize("NFC");
  if (/\s/.test(t)) return { ok: false, motivo: "Un solo nombre, sin espacios." };
  if (t.length < MIN_NOMBRE) return { ok: false, motivo: `Escribe de ${MIN_NOMBRE} a ${MAX_NOMBRE} letras.` };
  if (!SOLO_LETRAS.test(t)) return { ok: false, motivo: "Solo letras, sin números ni símbolos." };
  if (t.length > MAX_NOMBRE) return { ok: false, motivo: `Máximo ${MAX_NOMBRE} letras.` };
  const nombre = conMayuscula(t);
  // Un compañero del equipo con el mismo sonido (o apodo) siempre estorba, también al dejar el nombre de la especie.
  const otro = ctx.otros.find(
    (o) => suenaIgual(nombre, o.nombre) || o.apodos.some((a) => suenaIgual(nombre, a)),
  );
  if (otro) return { ok: false, motivo: `Suena igual que ${otro.nombre}, que ya está en tu equipo.` };
  // El nombre de su propia especie siempre vale (es lo que la voz ya entiende), aunque se parezca a una palabra de
  // mando («Tangela» ~ «cancela», «Paras» ~ «para», «Dragonite» ~ «dragon») o a otra especie.
  if (ctx.propia && normalizar(ctx.propia) === normalizar(nombre)) return { ok: true, nombre };
  if (esPalabraDeMando(nombre, ctx.reservadas, ctx.mando))
    return {
      ok: false,
      motivo: `«${nombre}» se parece a una palabra que uso al oírte (o que se dice mucho al hablar). Elige otra.`,
    };
  // Otra especie: contra las del equipo, por sonido (la voz las confundiría); contra el resto del catálogo, solo si es
  // exactamente su nombre («Laura», «Karina» o «Nacho» valen aunque se parezcan a Lapras, Kakuna u Onix).
  const delEquipo = ctx.especiesEquipo?.find((e) => suenaIgual(nombre, e));
  if (delEquipo) return { ok: false, motivo: `Suena igual que ${delEquipo}. Elige otro nombre.` };
  const especie = ctx.especies.find((e) => normalizar(e) === normalizar(nombre));
  if (especie) return { ok: false, motivo: `Suena igual que ${especie}. Elige otro nombre.` };
  return { ok: true, nombre };
}
