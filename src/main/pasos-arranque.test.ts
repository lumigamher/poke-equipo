import { describe, expect, it } from "vitest";
import { ESPECIES_INICIALES, especiesDeFondo, pasosMinimos } from "./pasos-arranque";
import { CATALOGO } from "./pokemon/especies";

describe("pasos del primer arranque", () => {
  it("de entrada: los 8 modelos, los poderes y los 4 iniciales (y nada más)", () => {
    const ids = pasosMinimos({ modelos: "/m", assets: "/a" }).map((p) => p.id);
    expect(ids).toHaveLength(8 + 1 + 4);
    expect(ids).toContain("poderes");
    expect(ids.filter((i) => i.startsWith("especie-"))).toEqual([
      "especie-1",
      "especie-4",
      "especie-7",
      "especie-25",
    ]);
  });

  it("los cuatro iniciales son los del laboratorio y existen en el catálogo", () => {
    for (const e of ESPECIES_INICIALES) expect(CATALOGO.some((c) => c.especie === e)).toBe(true);
  });

  it("en segundo plano va el resto del catálogo, ordenado y sin repetir los iniciales", () => {
    const fondo = especiesDeFondo();
    expect(fondo).toEqual([...fondo].sort((a, b) => a - b));
    expect(new Set(fondo).size).toBe(fondo.length);
    for (const e of ESPECIES_INICIALES) expect(fondo).not.toContain(e);
    expect(fondo.length + ESPECIES_INICIALES.length).toBe(CATALOGO.length);
  });
});
