import { describe, expect, it } from "vitest";
import { ampliarPath, entornoLimpio } from "./entorno";

describe("entornoLimpio", () => {
  const base = {
    PATH: "/usr/bin",
    HOME: "/Users/ana",
    ANTHROPIC_API_KEY: "sk-x",
    CLAUDECODE: "1",
    CLAUDE_CODE_ENTRYPOINT: "cli",
    CLAUDE_ANYTHING: "x",
    ANTHROPIC_BASE_URL: "http://localhost:3456",
    ANTHROPIC_AUTH_TOKEN: "tok",
    VACIA: undefined,
  } as NodeJS.ProcessEnv;

  it("conserva PATH y HOME", () => {
    const e = entornoLimpio(base);
    expect(e.PATH).toBe("/usr/bin");
    expect(e.HOME).toBe("/Users/ana");
  });

  it("quita la API key y todo lo que empiece por CLAUDE", () => {
    const e = entornoLimpio(base);
    expect(e).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(e).not.toHaveProperty("CLAUDECODE");
    expect(e).not.toHaveProperty("CLAUDE_CODE_ENTRYPOINT");
    expect(e).not.toHaveProperty("CLAUDE_ANYTHING");
  });

  it("conserva ANTHROPIC_BASE_URL y ANTHROPIC_AUTH_TOKEN (routers de la persona)", () => {
    const e = entornoLimpio(base);
    expect(e.ANTHROPIC_BASE_URL).toBe("http://localhost:3456");
    expect(e.ANTHROPIC_AUTH_TOKEN).toBe("tok");
  });

  it("descarta valores indefinidos y no muta la entrada", () => {
    const copia = { ...base };
    const e = entornoLimpio(base);
    expect(e).not.toHaveProperty("VACIA");
    expect(base).toEqual(copia);
    expect(base.CLAUDECODE).toBe("1");
  });
});

describe("ampliarPath", () => {
  it("deja lo que ya había primero y añade los sitios usuales sin repetir", () => {
    const p = ampliarPath("/usr/bin:/bin", "/Users/ana").split(":");
    expect(p.slice(0, 2)).toEqual(["/usr/bin", "/bin"]);
    expect(p).toContain("/opt/homebrew/bin");
    expect(p).toContain("/Users/ana/.bun/bin");
    expect(p.filter((x) => x === "/usr/bin")).toHaveLength(1);
  });

  it("con PATH vacío o ausente igual devuelve algo usable", () => {
    expect(ampliarPath(undefined, "/h")).toContain("/usr/local/bin");
    expect(ampliarPath("", "/h").startsWith(":")).toBe(false);
  });
});
