import { describe, expect, it } from "vitest";
import { diagnosticarClaude, mensajeDeDiagnostico, rutaClaudeIncluido } from "./claude-incluido";

describe("rutaClaudeIncluido", () => {
  it("apunta al paquete de la plataforma, no al asar", () => {
    expect(
      rutaClaudeIncluido({
        plataforma: "darwin",
        arch: "arm64",
        raizModulos: "/App/Contents/Resources/app.asar.unpacked/node_modules",
      }),
    ).toBe(
      "/App/Contents/Resources/app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude",
    );
  });

  it("en Intel usa el paquete x64 y en Windows el .exe", () => {
    expect(rutaClaudeIncluido({ plataforma: "darwin", arch: "x64", raizModulos: "/m" })).toContain(
      "claude-agent-sdk-darwin-x64/claude",
    );
    expect(rutaClaudeIncluido({ plataforma: "win32", arch: "x64", raizModulos: "/m" })).toMatch(
      /claude-agent-sdk-win32-x64.claude\.exe$/,
    );
  });
});

describe("diagnosticarClaude", () => {
  const base = { ruta: "/x/claude", existe: () => true, hayCredenciales: async () => true };

  it("ok si el ejecutable está y hay sesión", async () => {
    expect(await diagnosticarClaude(base)).toEqual({ tipo: "ok" });
  });

  it("sin ejecutable gana sobre todo lo demás y no consulta las credenciales", async () => {
    let consultadas = false;
    const d = await diagnosticarClaude({
      ...base,
      existe: () => false,
      hayCredenciales: async () => {
        consultadas = true;
        return false;
      },
    });
    expect(d).toEqual({ tipo: "sin_ejecutable", ruta: "/x/claude" });
    expect(consultadas).toBe(false);
  });

  it("sin sesión si faltan credenciales", async () => {
    expect(await diagnosticarClaude({ ...base, hayCredenciales: async () => false })).toEqual({
      tipo: "sin_sesion",
      ruta: "/x/claude",
    });
  });
});

describe("mensajeDeDiagnostico", () => {
  it("sin sesión da el comando exacto y menciona /login", () => {
    const m = mensajeDeDiagnostico({ tipo: "sin_sesion", ruta: "/Apps/Poke Equipo/claude" });
    expect(m.detalle).toContain('"/Apps/Poke Equipo/claude"');
    expect(m.detalle).toContain("/login");
  });

  it("sin ejecutable dice la ruta que buscó y cómo repararlo", () => {
    const m = mensajeDeDiagnostico({ tipo: "sin_ejecutable", ruta: "/x/claude" });
    expect(m.detalle).toContain("/x/claude");
    expect(m.detalle).toContain("Vuelve a instalar");
  });
});
