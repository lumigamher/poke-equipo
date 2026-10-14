/** Distancia del borde derecho a la primera pokébola de la incubadora. */
export const MARGEN_INCUBADORA = 36;
/** Separación entre pokébolas vecinas. */
export const SEPARACION_BOLA = 34;

/** La x (centro) de la pokébola número `indice`, de derecha a izquierda; nunca más allá del margen izquierdo. */
export function xRanura(indice: number, anchoVentana: number): number {
  return Math.max(MARGEN_INCUBADORA, anchoVentana - MARGEN_INCUBADORA - indice * SEPARACION_BOLA);
}
