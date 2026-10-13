import { describe, expect, it } from "vitest";
import { altoDisponible, estaAlFondo, guardarScroll, quePasaAlLlegar, tomarScroll } from "./registro-scroll";

describe("estaAlFondo", () => {
  it("pegado al fondo exacto", () => {
    expect(estaAlFondo({ scrollTop: 600, clientHeight: 200, scrollHeight: 800 })).toBe(true);
  });
  it("a pocos píxeles del fondo todavía cuenta", () => {
    expect(estaAlFondo({ scrollTop: 590, clientHeight: 200, scrollHeight: 800 })).toBe(true);
  });
  it("si subió a leer, no está al fondo", () => {
    expect(estaAlFondo({ scrollTop: 100, clientHeight: 200, scrollHeight: 800 })).toBe(false);
  });
  it("sin desbordar, está al fondo", () => {
    expect(estaAlFondo({ scrollTop: 0, clientHeight: 200, scrollHeight: 200 })).toBe(true);
  });
});

describe("quePasaAlLlegar", () => {
  it("al fondo: baja solo", () => {
    expect(quePasaAlLlegar(true)).toBe("bajar");
  });
  it("leyendo arriba: no lo mueve y ofrece el botón", () => {
    expect(quePasaAlLlegar(false)).toBe("avisar");
  });
});

describe("scroll guardado", () => {
  it("se restaura para la misma tarea y se olvida", () => {
    guardarScroll("p1", { tarea: 7, pegado: false, scrollTop: 120, enfocado: true });
    expect(tomarScroll("p1", 7)).toEqual({ tarea: 7, pegado: false, scrollTop: 120, enfocado: true });
    expect(tomarScroll("p1", 7)).toBeNull();
  });
  it("de otra tarea o de otro Pokémon no se restaura", () => {
    guardarScroll("p1", { tarea: 7, pegado: false, scrollTop: 120, enfocado: false });
    expect(tomarScroll("p2", 7)).toBeNull();
    expect(tomarScroll("p1", 8)).toBeNull();
  });
});

describe("altoDisponible", () => {
  it("deja un margen con el borde de arriba", () => {
    expect(altoDisponible(600)).toBe(588);
  });
  it("nunca baja de un mínimo usable", () => {
    expect(altoDisponible(50)).toBe(160);
  });
});
