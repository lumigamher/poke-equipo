/**
 * El dibujo pixel-art de la pokébola: una sola fuente para la app (objeto "pokebola" de actividades.ts, tarjetas y
 * ceremonia) y para el ícono (scripts/icono.mjs). Solo sintaxis que Node puede ejecutar sin compilar.
 * "." es transparente; cualquier otra letra es una clave de `colores`.
 */
export const POKEBOLA_FILAS: string[] = [
  "...nnnn...",
  ".nrrrrrrn.",
  "nrrbrrrrrn",
  "nrrrrrrrrn",
  "nnnnnnnnnn",
  "nbbbnbnbbn",
  "nbbbbnbbbn",
  ".nbbbbbbn.",
  "...nnnn...",
];

export const POKEBOLA_COLORES: Record<string, string> = { n: "#1c1c1c", r: "#e03a3a", b: "#f4f4f4" };
