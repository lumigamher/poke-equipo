import { describe, expect, it } from "vitest";
import { formatearBytes, porcentaje, validarAccionPreparacion } from "./preparacion";

describe("formatearBytes", () => {
  it.each([
    [0, "0 B"],
    [999, "999 B"],
    [643_854, "644 KB"],
    [5_000_000, "5 MB"],
    [21_283_187, "21,3 MB"],
    [487_170_055, "487 MB"],
    [1_173_822_522, "1,17 GB"],
    [20_000_000_000, "20 GB"],
    [1_100_000_000, "1,10 GB"],
  ])("%i -> %s", (n, texto) => {
    expect(formatearBytes(n)).toBe(texto);
  });
});

describe("porcentaje", () => {
  it("se queda entre 0 y 100 y no divide por cero", () => {
    expect(porcentaje(50, 200)).toBe(25);
    expect(porcentaje(300, 200)).toBe(100);
    expect(porcentaje(-5, 200)).toBe(0);
    expect(porcentaje(5, 0)).toBe(0);
  });
});

describe("validarAccionPreparacion", () => {
  it("solo acepta las tres acciones conocidas", () => {
    expect(validarAccionPreparacion("empezar")).toBe("empezar");
    expect(validarAccionPreparacion("cancelar")).toBe("cancelar");
    expect(validarAccionPreparacion("salir")).toBe("salir");
    expect(validarAccionPreparacion("aprobar")).toBeNull();
    expect(validarAccionPreparacion({ tipo: "empezar" })).toBeNull();
    expect(validarAccionPreparacion(undefined)).toBeNull();
  });
});
