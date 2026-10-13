import { describe, expect, it } from "vitest";
import { corrimiento } from "./Progreso";

describe("corrimiento del cuadro de la tarea", () => {
  it("centrado si cabe; pegado al borde, se corre lo justo para no salirse", () => {
    expect(corrimiento(700, 1470)).toBe(0);
    expect(corrimiento(40, 1470)).toBe(98);
    expect(corrimiento(1450, 1470)).toBe(-118);
  });
});
