import { describe, expect, it } from "vitest";
import { especieAyudante } from "./ayudantes";

describe("especieAyudante", () => {
  it("recorre la lista y nunca repite la especie del propio Pokémon", () => {
    const de = (propia: number) => Array.from({ length: 10 }, (_, n) => especieAyudante(n, propia));
    expect(de(25).slice(0, 3)).toEqual([172, 447, 446]);
    expect(de(172)).not.toContain(172);
    expect(de(172)[0]).toBe(447);
    expect(new Set(de(25).slice(0, 8)).size).toBe(8);
  });
});
