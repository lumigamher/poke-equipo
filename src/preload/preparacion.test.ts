import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CANALES } from "@compartido/tipos";
import { describe, expect, it } from "vitest";

describe("preload de la preparación", () => {
  const fuente = readFileSync(join(__dirname, "preparacion.ts"), "utf8");

  it("sus nombres de canal son los de CANALES (no importa tipos.ts porque con sandbox no hay chunks compartidos)", () => {
    for (const k of ["preparacion", "pedirPreparacion", "accionPreparacion"] as const)
      expect(fuente).toContain(`${k}: "${CANALES[k]}"`);
  });

  it("no importa nada propio (solo tipos y electron), para que el empaquetado no lo parta en trozos", () => {
    const importes = [...fuente.matchAll(/^import (?!type)[^;]*from "([^"]+)"/gm)].map((m) => m[1]);
    expect(importes).toEqual(["electron"]);
  });
});
