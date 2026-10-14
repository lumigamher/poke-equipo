const PREFIJO = "Correr: ";

/** El comando de una acción de terminal («Correr: …», como la escribe main), o null si es otra acción. */
export function comandoDeAccion(texto: string): string | null {
  if (!texto.startsWith(PREFIJO)) return null;
  const comando = texto.slice(PREFIJO.length);
  return comando.trim() === "" ? null : comando;
}
