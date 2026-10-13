import { describe, expect, it } from "vitest";
import { KANTO } from "./kanto";
import { TIPOS, tipoDe } from "./tipo-especie";

describe("Kanto", () => {
  it("trae las 151 especies, en orden y sin repetir número", () => {
    expect(KANTO).toHaveLength(151);
    expect(KANTO.map((k) => k.especie)).toEqual(Array.from({ length: 151 }, (_, i) => i + 1));
  });

  it("cada una tiene nombre propio válido (una palabra de letras) y no se repite", () => {
    const nombres = KANTO.map((k) => k.nombre.toLowerCase());
    expect(new Set(nombres).size).toBe(151);
    for (const k of KANTO) expect(k.nombre, String(k.especie)).toMatch(/^[A-Za-z]{3,12}$/);
  });

  it("cada una tiene un tipo que la app conoce, y tipoDe lo devuelve", () => {
    for (const k of KANTO) {
      expect(TIPOS, k.nombre).toContain(k.tipo);
      expect(tipoDe(k.especie), k.nombre).toBe(k.tipo);
    }
  });

  it("los tipos de las especies que ya existían no cambian", () => {
    const antes: Record<number, string> = {
      1: "planta",
      4: "fuego",
      7: "agua",
      25: "electrico",
      26: "electrico",
      39: "hada",
      40: "hada",
      52: "normal",
      53: "normal",
      54: "agua",
      55: "agua",
      92: "fantasma",
      93: "fantasma",
      94: "fantasma",
      133: "normal",
      134: "agua",
      135: "electrico",
      136: "fuego",
      143: "normal",
      150: "psiquico",
      151: "psiquico",
      172: "electrico",
      446: "normal",
      447: "lucha",
      448: "lucha",
    };
    for (const [n, t] of Object.entries(antes)) expect(tipoDe(Number(n)), n).toBe(t);
  });

  it("los tipos de primera generación más conocidos", () => {
    expect(tipoDe(6)).toBe("fuego"); // Charizard
    expect(tipoDe(10)).toBe("bicho");
    expect(tipoDe(95)).toBe("roca");
    expect(tipoDe(124)).toBe("hielo");
    expect(tipoDe(130)).toBe("agua"); // Gyarados
    expect(tipoDe(149)).toBe("dragon");
    expect(tipoDe(122)).toBe("psiquico"); // Mr. Mime
    expect(tipoDe(31)).toBe("veneno"); // Nidoqueen
  });

  it("los cuatro con símbolo o punto se llaman con una palabra y guardan su título del juego", () => {
    const titulos = Object.fromEntries(KANTO.filter((k) => k.titulo).map((k) => [k.especie, k.titulo]));
    expect(titulos).toEqual({ 29: "Nidoran♀", 32: "Nidoran♂", 83: "Farfetch'd", 122: "Mr. Mime" });
  });
});
