import { describe, expect, it } from "vitest";
import {
  esModeloElegible,
  esModeloGuardable,
  leerModelo,
  MODELOS,
  modeloEfectivo,
  modeloValido,
  siguienteModelo,
} from "./modelos";

describe("modelos: la lista que usan el laboratorio, el menú y la validación", () => {
  it("son tres, con los ids que ya usa la app, y cada uno con su línea", () => {
    expect(MODELOS.map((m) => m.id)).toEqual(["haiku", "sonnet", "opus"]);
    for (const m of MODELOS) {
      expect(m.nombre.length).toBeGreaterThan(0);
      expect(m.linea.length).toBeGreaterThan(0);
    }
  });

  it("solo valen los ids de la lista (lo que llega por IPC no se cree)", () => {
    expect(esModeloElegible("opus")).toBe(true);
    expect(esModeloElegible("fable")).toBe(false);
    expect(esModeloElegible("Opus")).toBe(false);
    expect(esModeloElegible(undefined)).toBe(false);
    expect(esModeloElegible(3)).toBe(false);
    expect(modeloValido("haiku")).toBe("haiku");
    expect(modeloValido("gpt")).toBeNull();
  });

  it("el efectivo es el propio si hay, y si no el del tipo", () => {
    expect(modeloEfectivo("haiku", "sonnet")).toBe("haiku");
    expect(modeloEfectivo(null, "opus")).toBe("opus");
    expect(modeloEfectivo(undefined, "sonnet")).toBe("sonnet");
    // Un modelo que /model aceptó fuera de la lista (fable) también es el efectivo.
    expect(modeloEfectivo("fable", "sonnet")).toBe("fable");
    expect(modeloEfectivo("", "sonnet")).toBe("sonnet");
  });

  it("se pueden guardar los de la lista y fable; lo demás se lee de la base como nulo", () => {
    for (const id of ["haiku", "sonnet", "opus", "fable"]) expect(esModeloGuardable(id), id).toBe(true);
    expect(esModeloGuardable("gpt-9")).toBe(false);
    expect(esModeloGuardable(null)).toBe(false);
    expect(leerModelo("fable")).toBe("fable");
    expect(leerModelo("gpt-9")).toBeNull();
    expect(leerModelo("")).toBeNull();
    expect(leerModelo(null)).toBeNull();
    expect(leerModelo(undefined)).toBeNull();
  });

  it("las flechas dan la vuelta por la lista", () => {
    expect(siguienteModelo("haiku", 1)).toBe("sonnet");
    expect(siguienteModelo("opus", 1)).toBe("haiku");
    expect(siguienteModelo("haiku", -1)).toBe("opus");
    expect(siguienteModelo("fable", 1)).toBe("haiku");
  });
});
