/** Cuánto del trabajo del rival se le pasa al que revisa. */
const MAXIMO_TRABAJO = 1500;

/** El encargo que recibe el retador: revisar el último trabajo del rival y dar un veredicto que se pueda leer. */
export function encargoCombate(rival: { nombre: string; carpeta: string; respuesta: string }): string {
  const trabajo =
    rival.respuesta.length > MAXIMO_TRABAJO
      ? `${rival.respuesta.slice(0, MAXIMO_TRABAJO)}…`
      : rival.respuesta;
  return [
    `Combate de revisión contra ${rival.nombre}. Revisa su último trabajo en la carpeta ${rival.carpeta}:`,
    "mira los cambios sin confirmar y los últimos commits (git -C esa carpeta) y lee el código que tocó.",
    "No cambies nada: solo revisa. Busca errores reales (lógica, casos sin cubrir, seguridad, pruebas que faltan), no estilo.",
    `Esto fue lo que ${rival.nombre} dijo que hizo:`,
    `«${trabajo}»`,
    "Termina tu respuesta con una línea exacta: VEREDICTO: APROBADO o VEREDICTO: RECHAZADO.",
  ].join("\n");
}

export type Veredicto = "aprobado" | "rechazado";

/** El veredicto que dejó escrito el retador; null si no dejó ninguno (entonces nadie gana). */
export function leerVeredicto(respuesta: string | null): Veredicto | null {
  if (!respuesta) return null;
  const todos = [...respuesta.matchAll(/VEREDICTO:\s*\**\s*(APROBADO|RECHAZADO)/gi)];
  const ultimo = todos.at(-1)?.[1].toUpperCase();
  if (ultimo === "APROBADO") return "aprobado";
  return ultimo === "RECHAZADO" ? "rechazado" : null;
}

/** Cuánto se queda a la vista el final del combate (el que gana posa, el que pierde cae). */
export const RESULTADO_MS = 5000;
