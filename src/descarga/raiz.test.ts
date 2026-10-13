import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rutasDeDatos } from "./raiz";

describe("rutasDeDatos", () => {
  it("en desarrollo usa las carpetas del repo", () => {
    const r = rutasDeDatos({ empaquetada: false, repo: "/repo", userData: "/u" });
    expect(r.raiz).toBe("/repo");
    expect(r.modelos).toBe(join("/repo", "models"));
    expect(r.assets).toBe(join("/repo", "assets", "pokemon"));
  });

  it("empaquetada usa una carpeta dentro de userData, nunca el interior de la app", () => {
    const r = rutasDeDatos({ empaquetada: true, repo: "/App/Resources/app.asar", userData: "/u/Poke" });
    expect(r.raiz).toBe(join("/u/Poke", "datos"));
    expect(r.modelos).toBe(join("/u/Poke", "datos", "models"));
    expect(r.assets).toBe(join("/u/Poke", "datos", "assets", "pokemon"));
  });
});
