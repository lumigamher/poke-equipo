/** Lo más cerca que puede quedar un Pokémon del borde de la pantalla (el mismo margen del paseo). */
export const MARGEN = 80;
/** Dónde nace el primero. */
const INICIO = 120;
/** De cuánto en cuánto se busca sitio hacia la derecha. */
const SEPARACION = 180;
/** A menos de esto de otro, se le monta encima. */
const CERCA = 120;

const distanciaMinima = (x: number, ocupadas: number[]) =>
  ocupadas.reduce((min, o) => Math.min(min, Math.abs(x - o)), Number.POSITIVE_INFINITY);

/**
 * Dónde nace un Pokémon nuevo. Busca desde INICIO hacia la derecha, en pasos de SEPARACION, la primera x que quede a
 * CERCA o más de todas las ocupadas y dentro de [MARGEN, ancho - MARGEN]. Si la pantalla está llena, nace en la x del
 * rango más lejana de todas (un extremo o el centro del hueco más ancho).
 */
export function posicionInicial(xsOcupadas: number[], ancho: number): number {
  const min = MARGEN;
  const max = Math.max(MARGEN, ancho - MARGEN);
  for (let x = INICIO; x <= max; x += SEPARACION) {
    if (distanciaMinima(x, xsOcupadas) >= CERCA) return x;
  }
  if (xsOcupadas.length === 0) return min;

  const dentro = xsOcupadas.filter((o) => o >= min && o <= max).sort((a, b) => a - b);
  const candidatas = [min, max];
  for (let i = 1; i < dentro.length; i++) candidatas.push(Math.round((dentro[i - 1] + dentro[i]) / 2));
  let mejor = candidatas[0];
  let lejania = distanciaMinima(mejor, xsOcupadas);
  for (const c of candidatas.slice(1)) {
    const d = distanciaMinima(c, xsOcupadas);
    if (d > lejania) {
      mejor = c;
      lejania = d;
    }
  }
  return mejor;
}
