import { describe, expect, it } from "vitest";
import { CANALES, ESTADOS } from "./tipos";

describe("tipos compartidos", () => {
  it("los canales no se repiten", () => {
    const valores = Object.values(CANALES);
    expect(new Set(valores).size).toBe(valores.length);
  });

  it("están los once estados del spec", () => {
    expect([...ESTADOS].sort()).toEqual([
      "cansado",
      "dormido",
      "error",
      "escuchando",
      "esperando",
      "guardandose",
      "paseando",
      "pidiendo_permiso",
      "saliendo",
      "termino",
      "trabajando",
    ]);
  });
});
