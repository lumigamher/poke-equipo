import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { alternarQuieto, guardarPreferencias, leerPreferencias, validarPreferencias } from "./preferencias";

describe("preferencias", () => {
  it("lo inválido cae a los valores por defecto", () => {
    expect(validarPreferencias(null)).toEqual({
      quietos: [],
      textoGrande: false,
      recorridoHecho: false,
      ocultarAvisoSesion: false,
    });
    expect(validarPreferencias({ quietos: ["a", 3], textoGrande: "sí" })).toEqual({
      quietos: ["a"],
      textoGrande: false,
      recorridoHecho: false,
      ocultarAvisoSesion: false,
    });
  });

  it("se guardan y se leen; un archivo roto o ausente no impide arrancar", () => {
    const dir = mkdtempSync(join(tmpdir(), "poke-pref-"));
    const ruta = join(dir, "preferencias.json");
    expect(leerPreferencias(ruta)).toEqual({
      quietos: [],
      textoGrande: false,
      recorridoHecho: false,
      ocultarAvisoSesion: false,
    });
    guardarPreferencias(ruta, {
      quietos: ["p"],
      textoGrande: true,
      recorridoHecho: true,
      ocultarAvisoSesion: true,
    });
    expect(leerPreferencias(ruta)).toEqual({
      quietos: ["p"],
      textoGrande: true,
      recorridoHecho: true,
      ocultarAvisoSesion: true,
    });
    writeFileSync(ruta, "{roto");
    expect(leerPreferencias(ruta)).toEqual({
      quietos: [],
      textoGrande: false,
      recorridoHecho: false,
      ocultarAvisoSesion: false,
    });
  });

  it("ocultarAvisoSesion solo vale si es exactamente true", () => {
    expect(validarPreferencias({ ocultarAvisoSesion: true }).ocultarAvisoSesion).toBe(true);
    expect(validarPreferencias({ ocultarAvisoSesion: "true" }).ocultarAvisoSesion).toBe(false);
  });

  it("alternarQuieto pone y quita", () => {
    const uno = alternarQuieto(
      { quietos: [], textoGrande: false, recorridoHecho: false, ocultarAvisoSesion: false },
      "p",
    );
    expect(uno.quietos).toEqual(["p"]);
    expect(alternarQuieto(uno, "p").quietos).toEqual([]);
  });
});
