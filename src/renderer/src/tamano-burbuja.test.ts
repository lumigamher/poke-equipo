import { describe, expect, it } from "vitest";
import {
  ALTO_MAX,
  ALTO_MIN,
  ANCHO_MAX,
  ANCHO_MIN,
  limitarTamano,
  tamanoTrasArrastre,
} from "./tamano-burbuja";

describe("limitarTamano", () => {
  it("respeta los mínimos y máximos", () => {
    expect(limitarTamano(10, 10, 3000, 2000)).toEqual({ ancho: ANCHO_MIN, alto: ALTO_MIN });
    expect(limitarTamano(9999, 9999, 3000, 2000)).toEqual({ ancho: ANCHO_MAX, alto: ALTO_MAX });
  });

  it("nunca más ancha ni más alta que la pantalla (con un margen)", () => {
    const t = limitarTamano(700, 850, 600, 700);
    expect(t.ancho).toBeLessThanOrEqual(600 - 16);
    expect(t.alto).toBeLessThanOrEqual(700 - 120);
  });

  it("redondea a píxeles enteros", () => {
    expect(limitarTamano(400.6, 300.2, 3000, 2000)).toEqual({ ancho: 401, alto: 300 });
  });
});

describe("tamanoTrasArrastre", () => {
  const inicio = { ancho: 400, alto: 300 };

  it("abierta hacia arriba (agarre arriba): subir el agarre la hace más alta; a la derecha, más ancha a los dos lados", () => {
    expect(tamanoTrasArrastre(inicio, 50, -80, "arriba")).toEqual({ ancho: 500, alto: 380 });
  });

  it("abierta hacia abajo (agarre abajo): bajar el agarre la hace más alta", () => {
    expect(tamanoTrasArrastre(inicio, -25, 60, "abajo")).toEqual({ ancho: 350, alto: 360 });
  });
});
