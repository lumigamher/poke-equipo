import { describe, expect, it } from "vitest";
import { type DepsCredenciales, hayCredencialesClaude } from "./credenciales";

const base = (o: Partial<DepsCredenciales> = {}): DepsCredenciales => ({
  plataforma: "darwin",
  env: {},
  home: "/Users/ana",
  existe: () => false,
  llavero: async () => false,
  ...o,
});

describe("hayCredencialesClaude", () => {
  it("sin nada, no hay sesión", async () => {
    expect(await hayCredencialesClaude(base())).toBe(false);
  });

  it("el llavero de macOS cuenta", async () => {
    expect(await hayCredencialesClaude(base({ llavero: async () => true }))).toBe(true);
  });

  it("el archivo de credenciales de ~/.claude cuenta, en cualquier sistema", async () => {
    const existe = (r: string) => r === "/Users/ana/.claude/.credentials.json";
    expect(await hayCredencialesClaude(base({ existe, plataforma: "linux" }))).toBe(true);
  });

  it("ANTHROPIC_AUTH_TOKEN cuenta, pero ANTHROPIC_API_KEY no (la app no la pasa)", async () => {
    expect(await hayCredencialesClaude(base({ env: { ANTHROPIC_AUTH_TOKEN: "t" } }))).toBe(true);
    expect(await hayCredencialesClaude(base({ env: { ANTHROPIC_API_KEY: "k" } }))).toBe(false);
  });

  it("fuera de macOS no consulta el llavero", async () => {
    let consultado = false;
    const r = await hayCredencialesClaude(
      base({
        plataforma: "win32",
        llavero: async () => {
          consultado = true;
          return true;
        },
      }),
    );
    expect(r).toBe(false);
    expect(consultado).toBe(false);
  });
});
