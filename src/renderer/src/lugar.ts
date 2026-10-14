import { MARGEN } from "./disposicion";

/** Más abajo que esto (px sobre el suelo) al soltarlo, vuelve al suelo a pasear. */
export const UMBRAL_SUELO = 48;
/** Lo que el Pokémon ocupa por encima de su lugar (cuerpo, barra de PS y rótulo): no puede subir tanto que se corte. */
export const ALTO_RESERVADO = 170;

/** El lugar dentro de la ventana: x entre los márgenes y alto entre el suelo y lo que deja ver el Pokémon entero. */
export function limitarLugar(
  x: number,
  alto: number,
  ancho: number,
  altoVentana: number,
): { x: number; alto: number } {
  const maxX = Math.max(MARGEN, ancho - MARGEN);
  const maxAlto = Math.max(0, altoVentana - ALTO_RESERVADO);
  return { x: Math.min(maxX, Math.max(MARGEN, x)), alto: Math.min(maxAlto, Math.max(0, alto)) };
}

/** Al soltarlo: cerca del suelo vuelve al suelo; más arriba queda posado donde lo dejaron. */
export function soltar(alto: number): number {
  return alto < UMBRAL_SUELO ? 0 : alto;
}

/** Hacia dónde abre su burbuja: arriba si cabe lo mínimo; si no, hacia donde haya más espacio. */
export function ladoBurbuja(espacioArriba: number, espacioAbajo: number, minimo: number): "arriba" | "abajo" {
  if (espacioArriba >= minimo) return "arriba";
  return espacioAbajo > espacioArriba ? "abajo" : "arriba";
}
