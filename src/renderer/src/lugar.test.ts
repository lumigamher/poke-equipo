import { describe, expect, it } from "vitest";
import { MARGEN } from "./disposicion";
import { ALTO_RESERVADO, ladoBurbuja, limitarLugar, soltar, UMBRAL_SUELO } from "./lugar";

describe("limitarLugar", () => {
  it("no lo deja salirse por los lados ni meterse bajo el suelo", () => {
    expect(limitarLugar(-50, -20, 1000, 800)).toEqual({ x: MARGEN, alto: 0 });
    expect(limitarLugar(5000, 100, 1000, 800)).toEqual({ x: 1000 - MARGEN, alto: 100 });
  });

  it("no lo deja subir tanto que se salga por arriba", () => {
    expect(limitarLugar(500, 5000, 1000, 800)).toEqual({ x: 500, alto: 800 - ALTO_RESERVADO });
  });

  it("en una ventana muy baja se queda en el suelo", () => {
    expect(limitarLugar(500, 300, 1000, ALTO_RESERVADO - 10).alto).toBe(0);
  });
});

describe("soltar", () => {
  it("cerca del suelo vuelve al suelo; más arriba queda posado donde lo soltaron", () => {
    expect(soltar(UMBRAL_SUELO - 1)).toBe(0);
    expect(soltar(0)).toBe(0);
    expect(soltar(UMBRAL_SUELO)).toBe(UMBRAL_SUELO);
    expect(soltar(300)).toBe(300);
  });
});

describe("ladoBurbuja", () => {
  it("abre hacia arriba si arriba cabe lo mínimo", () => {
    expect(ladoBurbuja(400, 100, 260)).toBe("arriba");
  });

  it("si arriba no cabe y abajo hay más espacio, abre hacia abajo", () => {
    expect(ladoBurbuja(120, 500, 260)).toBe("abajo");
  });

  it("si no cabe en ninguno, se queda arriba salvo que abajo haya más", () => {
    expect(ladoBurbuja(150, 100, 260)).toBe("arriba");
  });
});
