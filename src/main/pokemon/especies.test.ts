import { describe, expect, it } from "vitest";
import { CATALOGO, elegirEspecie } from "./especies";

const fijo = (v: number) => () => v;

describe("elegirEspecie", () => {
  it("por nombre, sin importar mayúsculas ni espacios", () => {
    expect(elegirEspecie("  CharMander ", CATALOGO, 25, fijo(0))).toMatchObject({
      tipo: "especie",
      especie: { especie: 4, nombre: "Charmander" },
    });
  });

  it("por número de la Pokédex", () => {
    expect(elegirEspecie("133", CATALOGO, 25, fijo(0))).toMatchObject({ especie: { nombre: "Eevee" } });
  });

  it("al azar nunca repite la actual", () => {
    for (const v of [0, 0.3, 0.6, 0.99]) {
      const r = elegirEspecie("azar", CATALOGO, 25, fijo(v));
      expect(r.tipo).toBe("especie");
      if (r.tipo === "especie") expect(r.especie.especie).not.toBe(25);
    }
  });

  it("si no la conoce o no está bajada, devuelve las disponibles", () => {
    const pocas = CATALOGO.filter((e) => e.especie === 25 || e.especie === 4);
    expect(elegirEspecie("gengar", pocas, 25, fijo(0))).toEqual({ tipo: "desconocida", disponibles: pocas });
    expect(elegirEspecie("", pocas, 25, fijo(0)).tipo).toBe("desconocida");
    expect(elegirEspecie("azar", [pocas[0]], pocas[0].especie, fijo(0)).tipo).toBe("desconocida");
  });
});
