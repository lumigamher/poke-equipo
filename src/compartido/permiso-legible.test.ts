import { describe, expect, it } from "vitest";
import { resumenPermiso } from "./permiso-legible";

describe("resumenPermiso", () => {
  it("dice qué va a hacer con el archivo o el comando", () => {
    expect(resumenPermiso("Write", "/x/src/login.ts")).toBe("Crear o reescribir el archivo login.ts");
    expect(resumenPermiso("Edit", "/x/src/login.ts")).toBe("Modificar el archivo login.ts");
    expect(resumenPermiso("Bash", "bun run test")).toBe("Correr un comando en la terminal");
  });

  it("herramientas externas y desconocidas se nombran tal cual", () => {
    expect(resumenPermiso("mcp__chrome__click", "{}")).toBe("Usar la herramienta externa chrome · click");
    expect(resumenPermiso("Rara", "")).toBe("Usar la herramienta Rara");
  });
});
