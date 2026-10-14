import { describe, expect, it } from "vitest";
import { MARGEN_INCUBADORA, SEPARACION_BOLA, xRanura } from "./ranuras-incubadora";

describe("xRanura", () => {
  it("la primera pokébola va en la esquina derecha y las demás a su izquierda", () => {
    expect(xRanura(0, 1200)).toBe(1200 - MARGEN_INCUBADORA);
    expect(xRanura(1, 1200)).toBe(1200 - MARGEN_INCUBADORA - SEPARACION_BOLA);
    expect(xRanura(3, 1200)).toBe(1200 - MARGEN_INCUBADORA - 3 * SEPARACION_BOLA);
  });

  it("nunca se sale por la izquierda", () => {
    expect(xRanura(500, 1200)).toBe(MARGEN_INCUBADORA);
  });
});
