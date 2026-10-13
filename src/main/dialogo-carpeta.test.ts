import { describe, expect, it } from "vitest";
import { elegirCarpeta } from "./dialogo-carpeta";

function montar(filePaths: string[], falla = false) {
  const log: string[] = [];
  return {
    log,
    deps: {
      apartarEscena: () => {
        log.push("aparta");
        return () => log.push("restaura");
      },
      traerAlFrente: () => log.push("frente"),
      abrir: async (o: { title?: string }) => {
        log.push(`abrir:${o.title ?? ""}`);
        if (falla) throw new Error("no se pudo abrir");
        return { filePaths };
      },
    },
  };
}

describe("elegirCarpeta", () => {
  it("trae la app al frente antes de abrir, sin ventana padre", async () => {
    const m = montar(["/a"]);
    expect(await elegirCarpeta(m.deps, "T")).toBe("/a");
    expect(m.log).toEqual(["aparta", "frente", "abrir:T", "restaura"]);
  });

  it("aparta la escena antes de abrir y la restaura al elegir", async () => {
    const m = montar(["/a"]);
    await elegirCarpeta(m.deps);
    expect(m.log.indexOf("aparta")).toBeLessThan(m.log.indexOf("abrir:"));
    expect(m.log.at(-1)).toBe("restaura");
  });

  it("restaura la escena también al cancelar", async () => {
    const m = montar([]);
    await elegirCarpeta(m.deps);
    expect(m.log).toEqual(["aparta", "frente", "abrir:", "restaura"]);
  });

  it("restaura la escena si abrir lanza, y el error se propaga", async () => {
    const m = montar([], true);
    await expect(elegirCarpeta(m.deps)).rejects.toThrow("no se pudo abrir");
    expect(m.log).toEqual(["aparta", "frente", "abrir:", "restaura"]);
  });

  it("si se cancela devuelve null", async () => {
    const m = montar([]);
    expect(await elegirCarpeta(m.deps)).toBeNull();
  });
});
