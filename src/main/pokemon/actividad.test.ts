import { ACTIVIDADES } from "@compartido/tipos";
import { describe, expect, it } from "vitest";
import { clasificar, elegirVerbo, VERBOS } from "./actividad";

const h = (herramienta: string, detalle?: string) =>
  ({ tipo: "actividad", clase: "herramienta", herramienta, detalle }) as const;

describe("clasificar", () => {
  it.each([
    ["Write", "programando"],
    ["Edit", "programando"],
    ["MultiEdit", "programando"],
    ["NotebookEdit", "programando"],
    ["TodoWrite", "planeando"],
    ["ExitPlanMode", "planeando"],
    ["Read", "leyendo"],
    ["Grep", "buscando"],
    ["Glob", "buscando"],
    ["WebSearch", "explorando"],
    ["WebFetch", "explorando"],
    ["Agent", "delegando"],
    ["Task", "delegando"],
    ["mcp__serena__find_symbol", "herramienta"],
    ["AlgoQueNoExiste", "herramienta"],
    ["", "herramienta"],
    ["constructor", "herramienta"],
    ["toString", "herramienta"],
    ["__proto__", "herramienta"],
  ])("%s es %s", (nombre, esperado) => {
    expect(clasificar(h(nombre))).toBe(esperado);
  });

  it("Bash es ejecutando, y probando si lanza pruebas", () => {
    expect(clasificar(h("Bash", "ls -la"))).toBe("ejecutando");
    expect(clasificar(h("Bash"))).toBe("ejecutando");
    expect(clasificar(h("Bash", "bun run test"))).toBe("probando");
    expect(clasificar(h("Bash", "cd app && npx vitest run"))).toBe("probando");
  });

  it("razonamiento y redacción", () => {
    expect(clasificar({ tipo: "actividad", clase: "pensando" })).toBe("pensando");
    expect(clasificar({ tipo: "actividad", clase: "respondiendo" })).toBe("respondiendo");
  });
});

describe("verbos", () => {
  it("cada actividad tiene al menos dos verbos, cortos y sin emojis", () => {
    for (const a of ACTIVIDADES) {
      expect(VERBOS[a].length).toBeGreaterThanOrEqual(2);
      for (const v of VERBOS[a]) {
        expect(v.length).toBeLessThanOrEqual(22);
        expect(v).toMatch(/^[A-Za-zÁÉÍÓÚáéíóúñ ]+$/);
      }
    }
  });

  it("elegirVerbo usa el azar y nunca se sale de la lista", () => {
    expect(elegirVerbo("programando", () => 0)).toBe(VERBOS.programando[0]);
    expect(elegirVerbo("programando", () => 0.999999)).toBe(VERBOS.programando.at(-1));
    expect(elegirVerbo("programando", () => 1)).toBe(VERBOS.programando.at(-1));
  });
});

describe("clasificar: publicar", () => {
  const bash = (detalle: string) =>
    clasificar({ tipo: "actividad", clase: "herramienta", herramienta: "Bash", detalle });

  it("guardar en git, subir o desplegar es publicar", () => {
    for (const c of [
      "git push origin main",
      "cd app && git commit -m x",
      "gh pr create --fill",
      "bun run deploy",
      "rsync -a out/ vps:/srv",
    ]) {
      expect(bash(c), c).toBe("publicando");
    }
  });

  it("lo demás sigue siendo ejecutar o probar", () => {
    expect(bash("git status")).toBe("ejecutando");
    expect(bash("ls -la")).toBe("ejecutando");
    expect(bash("bun run test")).toBe("probando");
  });
});
