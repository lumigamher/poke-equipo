import { describe, expect, it } from "vitest";
import { COLORES_MATA, cercanos, MATAS, sembrar } from "./suelo";

/** Azar repetible. */
function azarFijo(semilla: number): () => number {
  let s = semilla;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("sembrar", () => {
  it("cubre el suelo de borde a borde, en orden y sin amontonar", () => {
    for (const semilla of [1, 7, 42, 2026]) {
      const suelo = sembrar(1728, azarFijo(semilla));
      expect(suelo.length).toBeGreaterThan(5);
      expect(suelo[0].x).toBeGreaterThanOrEqual(0);
      expect(suelo.at(-1)?.x).toBeLessThan(1728);
      for (let i = 1; i < suelo.length; i++) {
        expect(suelo[i].x - suelo[i - 1].x).toBeGreaterThanOrEqual(90);
      }
    }
  });

  it("con el mismo azar sale el mismo suelo", () => {
    expect(sembrar(1200, azarFijo(5))).toEqual(sembrar(1200, azarFijo(5)));
  });

  it("una ventana diminuta no rompe nada", () => {
    expect(sembrar(0, azarFijo(1))).toEqual([]);
  });
});

describe("cercanos", () => {
  const suelo = [100, 300, 500, 900].map((x) => ({ x, mata: 0 }));

  it("solo los adornos con un Pokémon cerca", () => {
    expect(cercanos(suelo, [320], 190)).toBe("1,2");
    expect(cercanos(suelo, [320, 880], 190)).toBe("1,2,3");
  });

  it("sin Pokémon no se ve nada", () => {
    expect(cercanos(suelo, [], 190)).toBe("");
  });
});

describe("matas", () => {
  it("son pequeñas, rectangulares y solo usan colores definidos", () => {
    for (const mata of MATAS) {
      expect(new Set(mata.map((f) => f.length)).size).toBe(1);
      expect(mata[0].length).toBeLessThanOrEqual(7);
      expect(mata.length).toBeLessThanOrEqual(5);
      for (const c of mata.join("")) if (c !== ".") expect(COLORES_MATA[c]).toBeTruthy();
    }
  });

  it("la florecita sale poco", () => {
    const suelo = Array.from({ length: 40 }, (_, k) => sembrar(1728, azarFijo(k + 1))).flat();
    const flores = suelo.filter((s) => s.mata === MATAS.length - 1).length;
    expect(flores / suelo.length).toBeLessThan(0.25);
  });
});
