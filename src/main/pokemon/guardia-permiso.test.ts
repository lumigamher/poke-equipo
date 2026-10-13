import { describe, expect, it } from "vitest";
import { crearGuardiaPermiso, REACCION_MS, validarRespuestaPermiso } from "./guardia-permiso";

const v = (id: string, permiso: string | null) => ({ id, permiso: permiso ? { id: permiso } : null });

describe("guardia de permisos por Pokémon y permiso", () => {
  it("la reacción mínima es de 800 ms", () => expect(REACCION_MS).toBe(800));

  it("una frase que empezó antes de 800 ms del permiso no vale; a los 800 ms sí", () => {
    const g = crearGuardiaPermiso();
    g.alVista([v("A", "x1")], 10_000);
    expect(g.puedeResponder(10_799, "A", "x1")).toBe(false);
    expect(g.puedeResponder(10_000 + REACCION_MS, "A", "x1")).toBe(true);
  });

  it("una frase que empezó antes de mostrarse no vale", () => {
    const g = crearGuardiaPermiso();
    g.alVista([v("A", "x1")], 10_000);
    expect(g.puedeResponder(9_000, "A", "x1")).toBe(false);
    expect(g.puedeResponder(10_000, "A", "x1")).toBe(false);
  });

  it("sin hora fiable la respuesta no vale", () => {
    const g = crearGuardiaPermiso();
    g.alVista([v("A", "x1")], 10_000);
    expect(g.puedeResponder(null, "A", "x1")).toBe(false);
    expect(g.puedeResponder(Number.NaN, "A", "x1")).toBe(false);
    expect(g.puedeResponder(Number.POSITIVE_INFINITY, "A", "x1")).toBe(false);
  });

  it("sin permisos a la vista no vale nada", () => {
    const g = crearGuardiaPermiso();
    expect(g.puedeResponder(99_999, "A", "x1")).toBe(false);
    g.alVista([v("A", null)], 10_000);
    expect(g.puedeResponder(99_999, "A", "x1")).toBe(false);
    g.alVista([], 11_000);
    expect(g.puedeResponder(99_999, "A", "x1")).toBe(false);
  });

  it("un permiso nuevo de B no cambia la validez del de A, y B pide su propio margen", () => {
    const g = crearGuardiaPermiso();
    g.alVista([v("A", "x1")], 10_000);
    g.alVista([v("A", "x1"), v("B", "y1")], 20_000);
    expect(g.puedeResponder(20_900, "A", "x1")).toBe(true);
    expect(g.puedeResponder(20_100, "B", "y1")).toBe(false);
    expect(g.puedeResponder(20_800, "B", "y1")).toBe(true);
  });

  it("una respuesta contra un permiso ya contestado no vale", () => {
    const g = crearGuardiaPermiso();
    g.alVista([v("A", "x1")], 10_000);
    g.alVista([v("A", null)], 12_000);
    expect(g.puedeResponder(13_000, "A", "x1")).toBe(false);
  });

  it("un id de permiso viejo no vale para el nuevo del mismo Pokémon", () => {
    const g = crearGuardiaPermiso();
    g.alVista([v("A", "x1")], 10_000);
    g.alVista([v("A", "x2")], 15_000);
    expect(g.puedeResponder(16_000, "A", "x1")).toBe(false);
    expect(g.puedeResponder(15_799, "A", "x2")).toBe(false);
    expect(g.puedeResponder(15_800, "A", "x2")).toBe(true);
  });

  it("el permiso de un Pokémon no vale con el id de otro Pokémon", () => {
    const g = crearGuardiaPermiso();
    g.alVista([v("A", "x1")], 10_000);
    expect(g.puedeResponder(20_000, "B", "x1")).toBe(false);
    expect(g.puedeResponder(20_000, "x1", "A")).toBe(false);
  });

  it("la clave no se confunde al juntar ids", () => {
    const g = crearGuardiaPermiso();
    g.alVista([v("a", "bc")], 10_000);
    expect(g.puedeResponder(20_000, "ab", "c")).toBe(false);
  });

  it("publicar de nuevo el mismo permiso no mueve la hora en que se mostró", () => {
    const g = crearGuardiaPermiso();
    g.alVista([v("A", "x1")], 10_000);
    g.alVista([v("A", "x1")], 13_000);
    g.alVista([v("B", null), v("A", "x1")], 14_000);
    expect(g.puedeResponder(10_800, "A", "x1")).toBe(true);
  });

  it("un permiso que desaparece y vuelve a aparecer cuenta desde que volvió", () => {
    const g = crearGuardiaPermiso();
    g.alVista([v("A", "x1")], 10_000);
    g.alVista([], 11_000);
    g.alVista([v("A", "x1")], 12_000);
    expect(g.puedeResponder(12_799, "A", "x1")).toBe(false);
    expect(g.puedeResponder(12_800, "A", "x1")).toBe(true);
  });

  it("alVista devuelve true solo cuando aparece un permiso nuevo, no cuando se va uno", () => {
    const g = crearGuardiaPermiso();
    expect(g.alVista([v("A", null)], 0)).toBe(false);
    expect(g.alVista([v("A", "x1")], 1)).toBe(true);
    expect(g.alVista([v("A", "x1")], 2)).toBe(false);
    expect(g.alVista([v("A", "x1"), v("B", "y1")], 3)).toBe(true);
    expect(g.alVista([v("B", "y1")], 4)).toBe(false); // A contestado: nada nuevo que descartar
    expect(g.alVista([v("B", "y2")], 5)).toBe(true); // la cola de B avanza: permiso nuevo
    expect(g.alVista([], 6)).toBe(false);
  });
});

describe("validarRespuestaPermiso con id de Pokémon", () => {
  it("exige pokemonId y permisoId no vacíos y permitir booleano", () => {
    expect(validarRespuestaPermiso({ permitir: true, pokemonId: "p", permisoId: "x" })).toEqual({
      permitir: true,
      pokemonId: "p",
      permisoId: "x",
    });
    expect(validarRespuestaPermiso({ permitir: false, pokemonId: "p", permisoId: "x" })).toEqual({
      permitir: false,
      pokemonId: "p",
      permisoId: "x",
    });
    expect(validarRespuestaPermiso({ permitir: true, permisoId: "x" })).toBeNull();
    expect(validarRespuestaPermiso({ permitir: true, pokemonId: "", permisoId: "x" })).toBeNull();
    expect(validarRespuestaPermiso({ permitir: "si", pokemonId: "p", permisoId: "x" })).toBeNull();
  });

  it.each([
    true,
    "si",
    null,
    undefined,
    {},
    { permitir: true },
    { permitir: true, id: "x" }, // forma vieja, sin el Pokémon
    { permitir: true, pokemonId: "p" },
    { permitir: true, pokemonId: "p", permisoId: "" },
    { permitir: true, pokemonId: 1, permisoId: "x" },
    { permitir: true, pokemonId: "p", permisoId: 1 },
    [true, "p", "x"],
  ])("rechaza %j", (x) => expect(validarRespuestaPermiso(x)).toBeNull());
});
