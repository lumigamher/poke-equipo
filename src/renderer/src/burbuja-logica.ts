import { hayTexto } from "@compartido/burbuja-abierta";
import type { Alterado, Burbuja, Estado, VistaPokemon } from "@compartido/tipos";

// Viven en compartido: main las usa para decidir qué burbuja va abierta, y el renderer para dibujarla.
export { debeMostrarse, hayTexto } from "@compartido/burbuja-abierta";

/**
 * Qué burbuja se dibuja: la viva; y si la persona fijó la burbuja con un clic y no hay ninguna viva ni permiso,
 * la última respuesta, para que el clic nunca abra una caja vacía.
 */
export function burbujaAMostrar(vista: VistaPokemon, fijada: boolean): Burbuja | null {
  if (vista.burbuja) return vista.burbuja;
  if (fijada && !vista.permiso && vista.ultimaRespuesta !== null && hayTexto(vista.ultimaRespuesta)) {
    return { tipo: "respuesta", texto: vista.ultimaRespuesta };
  }
  return null;
}

/** El estado en palabras, para el chip y el lector de pantalla. */
const ESTADO_LEGIBLE: Record<Estado, string> = {
  saliendo: "saliendo",
  paseando: "paseando",
  escuchando: "escuchando",
  trabajando: "trabajando",
  pidiendo_permiso: "pidiendo permiso",
  termino: "terminó",
  esperando: "esperando",
  cansado: "cansado",
  dormido: "dormido",
  error: "con un error",
  guardandose: "guardándose",
};

/**
 * Lo que dice el chip de una burbuja cerrada: el estado en texto, un indicador ("pide permiso" o "habla") y la
 * etiqueta accesible con nombre y estado.
 */
export function etiquetaChip(vista: VistaPokemon): { estado: string; indicador: string; aria: string } {
  const estado = ESTADO_LEGIBLE[vista.estado];
  const indicador = vista.permiso ? "pide permiso" : vista.burbuja?.tipo === "respuesta" ? "habla" : "";
  // Empieza por lo que se ve (nombre y lo que dice el chip), para que el control por voz lo encuentre (WCAG 2.5.3).
  const aria = indicador
    ? `${vista.nombre} ${indicador}. Estado: ${estado}. Abrir su burbuja`
    : `${vista.nombre} ${estado}. Abrir su burbuja`;
  return { estado, indicador, aria };
}

export function colorPS(ps: number): "bien" | "medio" | "bajo" {
  if (ps > 50) return "bien";
  if (ps >= 20) return "medio";
  return "bajo";
}

/** La barrita del límite de la sesión: tranquila hasta el 70 %, ámbar hasta el 90 % y roja de ahí en adelante. */
export function colorLimite(usado: number): "bien" | "medio" | "bajo" {
  if (usado >= 90) return "bajo";
  if (usado >= 70) return "medio";
  return "bien";
}

/** "Límite de la sesión: 82 % usado · se reinicia a las 4:30 p. m." */
export function textoLimite(limite: { usado: number; reinicia?: string }): string {
  const base = `Límite de la sesión: ${Math.round(limite.usado)} % usado`;
  const cuando = limite.reinicia ? new Date(limite.reinicia) : null;
  if (!cuando || Number.isNaN(cuando.getTime())) return base;
  return `${base} · se reinicia a las ${cuando.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })}`;
}

export const ETIQUETAS: Record<Alterado, string> = {
  confundido: "CNF",
  paralizado: "PAR",
  envenenado: "ENV",
  dormido: "DOR",
};

/**
 * Tiempo que los botones de permiso quedan inactivos tras abrirse un permiso: el mismo margen de reacción que pide la
 * voz, y así un doble clic sobre el chip que lo abre no cae en "Sí".
 */
export const GRACIA_PERMISO_MS = 800;

export function botonesActivos(aparecio: number, ahora: number): boolean {
  return ahora - aparecio >= GRACIA_PERMISO_MS;
}

/** Borde izquierdo de la burbuja: centrada en el Pokémon si cabe; si no, dentro de la ventana. */
export function posicionBurbuja(
  xPokemon: number,
  anchoBurbuja: number,
  anchoVentana: number,
  margen = 8,
): number {
  const maximo = anchoVentana - anchoBurbuja - margen;
  if (maximo < margen) return margen;
  return Math.min(maximo, Math.max(margen, xPokemon - anchoBurbuja / 2));
}

/** Cuántas sugerencias de comandos caben en la burbuja sin taparla. */
export const MAX_SUGERENCIAS = 6;

/**
 * Los comandos que empiezan por lo escrito. Solo mientras se escribe el nombre (empieza con "/" y aún no hay
 * espacio): con el argumento ya no estorban.
 */
export function sugerenciasPara<T extends { nombre: string }>(texto: string, comandos: T[]): T[] {
  if (!texto.startsWith("/") || /\s/.test(texto)) return [];
  const buscado = texto.slice(1).toLowerCase();
  return comandos.filter((c) => c.nombre.toLowerCase().startsWith(buscado)).slice(0, MAX_SUGERENCIAS);
}

/** Lo que queda escrito al elegir un comando: con espacio si espera un argumento. */
export function completarComando(c: { nombre: string; argumento: string }): string {
  return `/${c.nombre}${c.argumento ? " " : ""}`;
}

/**
 * Al cerrarse una burbuja, ¿suelta el foco de la ventana? Solo si su campo es el que lo tiene: con varias burbujas,
 * cerrar la de un Pokémon no le quita el teclado a quien escribe en la de otro.
 */
export function debeSoltarFoco(campo: unknown, conFoco: unknown): boolean {
  return campo !== null && campo === conFoco;
}

/** Lo que la ficha de la burbuja muestra de un vistazo: su especie (si tiene nombre propio), su proyecto y su modelo. */
export function datosFicha(vista: VistaPokemon): string[] {
  return [vista.especieNombre, vista.proyecto, vista.modelo].filter((d): d is string => Boolean(d));
}
