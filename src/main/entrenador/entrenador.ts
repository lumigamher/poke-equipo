import { buscarLlamado, type Candidato, normalizar } from "../oido/nombres";
import { esVuelve, leerLlamada, PALABRAS_VUELVE, VERBOS_LLAMAR } from "../pokemon/llamada";

export type Decision =
  | { tipo: "orden"; id: string; texto: string }
  | { tipo: "atencion"; id: string }
  | { tipo: "permiso"; id: string; permisoId: string; permitir: boolean }
  | { tipo: "cancelar"; id: string }
  /** Más voz para el borrador que ya está a la vista: la frase se partió por una pausa. */
  | { tipo: "continuar"; id: string; texto: string }
  | { tipo: "alta"; id: string; texto: string; rapido?: string }
  | { tipo: "llamar"; id: string; nombreEspecie: string; encargo: string }
  | { tipo: "guardar"; id: string }
  | { tipo: "ignorar" };

export interface Contexto {
  candidatos: Candidato[];
  /** Pokémon con un permiso a la vista, y cuál es ese permiso. */
  permisosDe: { id: string; permisoId: string }[];
  /** Pokémon con una orden transcrita a la vista, aún sin enviar. */
  borradoresDe: string[];
  /** Pokémon que quedó atento: lo llamaron sin orden. */
  escuchandoA: string | null;
  /** Pokémon que está aprendiendo cómo suena su nombre. */
  altaDe: string | null;
}

const SI = new Set(["si", "dale", "hazlo", "hagale", "apruebo", "aprobado"]);
const NO = new Set(["no", "niega", "negado", "para", "detente"]);
const CANCELAR = new Set(["cancela", "cancelar", "cancela eso", "cancelalo", "olvidalo", "olvida eso"]);

const RELLENO_SI = new Set(["por", "favor", "pues", "ya"]);
const RELLENO_NO = new Set(["por", "favor", "pues", "ya", "eso", "gracias"]);

/**
 * Una respuesta a un permiso cuenta solo si TODAS sus palabras son de respuesta (hasta tres):
 * "sí, pero espera" o "si quieres" no aprueban nada. "para" solo niega si va solo: acompañado es preposición.
 */
function respuestaCorta(texto: string): boolean | null {
  const palabras = normalizar(texto).split(" ").filter(Boolean);
  if (palabras.length === 0 || palabras.length > 3) return null;
  const aprueba = palabras.every((p) => SI.has(p) || RELLENO_SI.has(p)) && palabras.some((p) => SI.has(p));
  const niega =
    palabras.every((p) => NO.has(p) || RELLENO_NO.has(p)) &&
    palabras.some((p) => NO.has(p)) &&
    !(palabras.length > 1 && palabras.includes("para"));
  if (aprueba === niega) return null;
  return aprueba;
}

const MODELOS_Y_MARCAS = ["claude", "sonnet", "opus", "haiku", "fable", "anthropic"];
/** Palabras sueltas que `usarMovimiento` (usa/utiliza/haz …) y `pidePausa` (deja de escuchar…) interpretan. */
const USAR_Y_PAUSA = [
  "usa",
  "utiliza",
  "haz",
  "deja",
  "para",
  "escuchar",
  "escuchame",
  "escuches",
  "oir",
  "oirme",
];

const palabrasDe = (t: string) => normalizar(t).split(" ").filter(Boolean);

/** Solo las palabras de permiso y de mando (sin modelos, glosario ni movimientos): contra ellas un nombre corto se compara a una letra. */
export function palabrasDeMando(): string[] {
  const todas = [
    ...SI,
    ...NO,
    ...[...CANCELAR].flatMap(palabrasDe).filter((p) => p !== "eso"),
    // «ya» (de «vuelve ya») y «eso» (de «cancela eso») no son órdenes sueltas: siguen reservadas pero no son de mando.
    ...PALABRAS_VUELVE.filter((p) => p !== "ya"),
    ...VERBOS_LLAMAR,
    ...USAR_Y_PAUSA,
  ];
  return [...new Set(todas)].sort();
}

/**
 * Las palabras que la app interpreta al oírlas y que por eso un nombre propio no puede ser (ni sonar igual, ver
 * `validarNombre`): las de responder o negar un permiso, cancelar, guardar, llamar a otro, usar un movimiento y dejar
 * de escuchar, más los modelos, el glosario y los movimientos. Se derivan de las MISMAS tablas que usa `decidir`, así
 * que una palabra de mando nueva queda reservada sin acordarse de añadirla. Normalizadas (sin tildes, minúsculas).
 */
export function palabrasReservadas(glosario: string[] = [], movimientos: string[] = []): string[] {
  const todas = [
    ...SI,
    ...NO,
    ...[...CANCELAR].flatMap(palabrasDe),
    ...RELLENO_SI,
    ...RELLENO_NO,
    ...PALABRAS_VUELVE,
    ...VERBOS_LLAMAR,
    ...USAR_Y_PAUSA,
    ...MODELOS_Y_MARCAS,
    ...glosario.flatMap(palabrasDe),
    ...movimientos.flatMap(palabrasDe),
  ];
  return [...new Set(todas)].sort();
}

/** Sin nombre, la frase solo es para alguien si hay exactamente un caso posible. */
function unico<T>(lista: T[]): T | undefined {
  return lista.length === 1 ? lista[0] : undefined;
}

/** Qué hacer con un texto dirigido a un Pokémon: atender, guardarlo, llamar a otro u obedecer. */
function dirigidoA(id: string, texto: string): Decision {
  if (!texto) return { tipo: "atencion", id };
  if (esVuelve(texto)) return { tipo: "guardar", id };
  // El encargo sale del texto original (rutas, mayúsculas, puntuación), no del normalizado.
  const llamada = leerLlamada(texto);
  if (llamada) return { tipo: "llamar", id, nombreEspecie: llamada.nombreEspecie, encargo: llamada.encargo };
  return { tipo: "orden", id, texto };
}

export function decidir(texto: string, ctx: Contexto): Decision {
  // Una frase que es EXACTAMENTE «cancela» o una negación («para», «no»…) es esa orden, no un llamado a un Pokémon
  // cuyo nombre se le parece (Tangela ~ «cancela», Paras ~ «para»). Solo cancelar y negar: nunca aprueba nada.
  const sola = normalizar(texto);
  const llamado = CANCELAR.has(sola) || NO.has(sola) ? null : buscarLlamado(texto, ctx.candidatos);
  if (ctx.altaDe) {
    // El alta se traga lo que se diga, menos NEGAR un permiso o CANCELAR un borrador (de otro Pokémon): esas dos
    // salidas no pueden esperar 30 s. Aprobar sigue siendo imposible durante el alta (solo existe `permitir: false`).
    const resto = llamado ? llamado.resto : texto;
    const objetivo = llamado ? ctx.permisosDe.find((p) => p.id === llamado.id) : unico(ctx.permisosDe);
    if (objetivo && respuestaCorta(resto) === false)
      return { tipo: "permiso", id: objetivo.id, permisoId: objetivo.permisoId, permitir: false };
    const dueno = llamado ? ctx.borradoresDe.find((id) => id === llamado.id) : unico(ctx.borradoresDe);
    if (dueno && CANCELAR.has(normalizar(resto))) return { tipo: "cancelar", id: dueno };
    return { tipo: "alta", id: ctx.altaDe, texto };
  }

  // Una respuesta de permiso solo va al Pokémon que preguntó: nombrado, o el único con permiso a la vista.
  if (ctx.permisosDe.length > 0) {
    const objetivo = llamado ? ctx.permisosDe.find((p) => p.id === llamado.id) : unico(ctx.permisosDe);
    const respuesta = objetivo ? respuestaCorta(llamado ? llamado.resto : texto) : null;
    if (objetivo && respuesta !== null) {
      return { tipo: "permiso", id: objetivo.id, permisoId: objetivo.permisoId, permitir: respuesta };
    }
  }

  if (ctx.borradoresDe.length > 0) {
    const dueno = llamado ? ctx.borradoresDe.find((id) => id === llamado.id) : unico(ctx.borradoresDe);
    if (dueno && CANCELAR.has(normalizar(llamado ? llamado.resto : texto))) {
      return { tipo: "cancelar", id: dueno };
    }
    // Sin nombre, es el resto de la misma frase. Si el dueño del borrador tiene un permiso a la vista no hay
    // borrador que continuar (el permiso de OTRO no corta la frase), y si otro Pokémon acaba de ser llamado, la
    // frase es para él. Un "sí"/"no" puro con algún permiso a la vista es respuesta a ese permiso (ya pasó por la
    // rama de arriba, o era ambigua): nunca se pega a una orden.
    const paraElDueno = ctx.escuchandoA === null || ctx.escuchandoA === dueno;
    const permisoDelDueno = ctx.permisosDe.some((p) => p.id === dueno);
    const respuestaSuelta = ctx.permisosDe.length > 0 && respuestaCorta(texto) !== null;
    if (dueno && !llamado && !permisoDelDueno && !respuestaSuelta && paraElDueno) {
      return { tipo: "continuar", id: dueno, texto };
    }
  }

  if (llamado) return dirigidoA(llamado.id, llamado.resto);
  // Sin nombre, solo quien acaba de ser llamado; con un permiso a la vista (de cualquiera), no es para el Pokémon
  // (Ruling Minor 5 de T2: aquí la condición sigue siendo global; solo la continuación de un borrador es por dueño).
  if (ctx.escuchandoA && ctx.permisosDe.length === 0) return dirigidoA(ctx.escuchandoA, texto);
  return { tipo: "ignorar" };
}

/** Rehace una orden, atención, llamada o guarda con el texto del paso preciso. Nunca produce un permiso. */
export function afinar(previa: Decision, textoPreciso: string, ctx: Contexto): Decision {
  if (
    previa.tipo !== "orden" &&
    previa.tipo !== "atencion" &&
    previa.tipo !== "llamar" &&
    previa.tipo !== "guardar"
  ) {
    return previa;
  }
  const fino = textoPreciso.trim();
  if (!fino) return previa;
  const llamado = buscarLlamado(fino, ctx.candidatos);
  if (llamado) return dirigidoA(llamado.id, llamado.resto);
  if (previa.tipo === "atencion") return previa;
  return dirigidoA(previa.id, fino);
}
