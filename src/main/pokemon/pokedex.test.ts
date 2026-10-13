import { describe, expect, it } from "vitest";
import { duracion, type FichaPokedex, ganaShiny, resumenManana, textoPokedex } from "./pokedex";

const ficha = (extra: Partial<FichaPokedex>): FichaPokedex => ({
  nombre: "Pikachu",
  especie: 25,
  shiny: false,
  tareas: 0,
  ms: 0,
  medallas: [],
  ultimas: [],
  ...extra,
});

describe("duracion", () => {
  it("se lee como se dice", () => {
    expect(duracion(20_000)).toBe("menos de 1 min");
    expect(duracion(45 * 60_000)).toBe("45 min");
    expect(duracion(120 * 60_000)).toBe("2 h");
    expect(duracion(130 * 60_000)).toBe("2 h 10 min");
  });
});

describe("textoPokedex", () => {
  it("vacía, lo dice", () => {
    expect(textoPokedex([])).toContain("vacía");
  });

  it("una ficha por Pokémon, el que más trabajó primero, con medallas y últimos encargos", () => {
    const texto = textoPokedex([
      ficha({ nombre: "Charmander", tareas: 1, ms: 60_000 }),
      ficha({
        tareas: 15,
        ms: 130 * 60_000,
        shiny: true,
        medallas: ["Acme en producción"],
        ultimas: [{ orden: "revisa   el\nlogin", carpeta: "/Users/ana/Documents/acme", fin: 1 }],
      }),
    ]);
    const [primera, segunda] = texto.split("\n\n");
    expect(primera).toContain("Pikachu (shiny) · 15 tareas · 2 h 10 min · 1 medalla");
    expect(primera).toContain("Medalla: Acme en producción");
    expect(primera).toContain("acme: revisa el login");
    expect(segunda).toBe("Charmander · 1 tarea · 1 min");
  });
});

describe("ganaShiny", () => {
  it("solo con pruebas que pasaron y ninguna que falló", () => {
    expect(ganaShiny({ paso: true, fallo: false })).toBe(true);
    expect(ganaShiny({ paso: true, fallo: true })).toBe(false);
    expect(ganaShiny({ paso: false, fallo: false })).toBe(false);
  });
});

describe("resumenManana", () => {
  const a = (y: number, m: number, d: number, h: number) => new Date(y, m, d, h).getTime();
  const fichas = [
    {
      nombre: "Pikachu",
      especie: 25,
      shiny: false,
      tareas: 3,
      ms: 0,
      medallas: [],
      ultimas: [{ orden: "revisa el login", carpeta: "/x/acme", fin: a(2026, 9, 11, 18) }],
    },
    { nombre: "Charmander", especie: 4, shiny: false, tareas: 0, ms: 0, medallas: [], ultimas: [] },
  ];

  it("de mañana, sin trabajo hoy, cuenta en qué quedó cada uno", () => {
    expect(resumenManana(fichas, a(2026, 9, 12, 8))).toBe(
      "Buenos días. Así quedamos:\nPikachu, en acme: revisa el login",
    );
  });

  it("de tarde o de noche no dice nada", () => {
    expect(resumenManana(fichas, a(2026, 9, 12, 15))).toBeNull();
    expect(resumenManana(fichas, a(2026, 9, 12, 23))).toBeNull();
  });

  it("si hoy ya se trabajó, o no hay historial, tampoco", () => {
    const hoy = [{ ...fichas[0], ultimas: [{ orden: "x", carpeta: "/x", fin: a(2026, 9, 12, 7) }] }];
    expect(resumenManana(hoy, a(2026, 9, 12, 8))).toBeNull();
    expect(resumenManana([fichas[1]], a(2026, 9, 12, 8))).toBeNull();
  });
});
