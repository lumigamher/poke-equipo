export const ANCHO_MIN = 280;
export const ANCHO_MAX = 760;
export const ALTO_MIN = 200;
export const ALTO_MAX = 900;
/** El tamaño de siempre, cuando la persona no la ha ajustado. */
export const TAMANO_INICIAL = { ancho: 320, alto: 520 };

export interface Tamano {
  ancho: number;
  alto: number;
}

/** Entre los límites y siempre dentro de la pantalla, en píxeles enteros. */
export function limitarTamano(
  ancho: number,
  alto: number,
  anchoVentana: number,
  altoVentana: number,
): Tamano {
  const maxAncho = Math.max(ANCHO_MIN, Math.min(ANCHO_MAX, anchoVentana - 16));
  const maxAlto = Math.max(ALTO_MIN, Math.min(ALTO_MAX, altoVentana - 120));
  return {
    ancho: Math.round(Math.min(maxAncho, Math.max(ANCHO_MIN, ancho))),
    alto: Math.round(Math.min(maxAlto, Math.max(ALTO_MIN, alto))),
  };
}

/**
 * El tamaño mientras se arrastra el agarre. La burbuja va centrada sobre el Pokémon: mover el agarre a un lado la
 * ensancha por los dos. Abierta hacia arriba el agarre está arriba (subirlo la alarga); hacia abajo, abajo.
 */
export function tamanoTrasArrastre(inicio: Tamano, dx: number, dy: number, lado: "arriba" | "abajo"): Tamano {
  return { ancho: inicio.ancho + 2 * dx, alto: inicio.alto + (lado === "arriba" ? -dy : dy) };
}
