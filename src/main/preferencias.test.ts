import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  alternarEscondido,
  alternarQuieto,
  esconderTodos,
  guardarPreferencias,
  leerPreferencias,
  lugarDesdeMensaje,
  PREFERENCIAS_POR_DEFECTO,
  ponerLugar,
  sacarDeIncubadora,
  sacarTodos,
  tamanoDesdeMensaje,
  validarPreferencias,
} from "./preferencias";

const NUEVOS_POR_DEFECTO = { lugares: {}, escondidos: {}, esconderAlTrabajar: false, burbuja: null };

describe("preferencias", () => {
  it("lo inválido cae a los valores por defecto", () => {
    expect(validarPreferencias(null)).toEqual({
      quietos: [],
      textoGrande: false,
      recorridoHecho: false,
      ocultarAvisoSesion: false,
      ...NUEVOS_POR_DEFECTO,
    });
    expect(validarPreferencias({ quietos: ["a", 3], textoGrande: "sí" })).toEqual({
      quietos: ["a"],
      textoGrande: false,
      recorridoHecho: false,
      ocultarAvisoSesion: false,
      ...NUEVOS_POR_DEFECTO,
    });
  });

  it("se guardan y se leen; un archivo roto o ausente no impide arrancar", () => {
    const dir = mkdtempSync(join(tmpdir(), "poke-pref-"));
    const ruta = join(dir, "preferencias.json");
    expect(leerPreferencias(ruta)).toEqual(PREFERENCIAS_POR_DEFECTO);
    const completas = {
      quietos: ["p"],
      textoGrande: true,
      recorridoHecho: true,
      ocultarAvisoSesion: true,
      lugares: { p: { x: 400, alto: 120 } },
      escondidos: { p: "auto" as const },
      esconderAlTrabajar: true,
      burbuja: { ancho: 520, alto: 400 },
    };
    guardarPreferencias(ruta, completas);
    expect(leerPreferencias(ruta)).toEqual(completas);
    writeFileSync(ruta, "{roto");
    expect(leerPreferencias(ruta)).toEqual(PREFERENCIAS_POR_DEFECTO);
  });

  it("ocultarAvisoSesion solo vale si es exactamente true", () => {
    expect(validarPreferencias({ ocultarAvisoSesion: true }).ocultarAvisoSesion).toBe(true);
    expect(validarPreferencias({ ocultarAvisoSesion: "true" }).ocultarAvisoSesion).toBe(false);
  });

  it("alternarQuieto pone y quita", () => {
    const uno = alternarQuieto(PREFERENCIAS_POR_DEFECTO, "p");
    expect(uno.quietos).toEqual(["p"]);
    expect(alternarQuieto(uno, "p").quietos).toEqual([]);
  });

  it("lugares: solo los que traen x y alto numéricos, finitos y no negativos", () => {
    const p = validarPreferencias({
      lugares: {
        a: { x: 300, alto: 0 },
        b: { x: 120.5, alto: 240 },
        c: { x: -1, alto: 0 },
        d: { x: 10 },
        e: "x",
      },
    });
    expect(p.lugares).toEqual({ a: { x: 300, alto: 0 }, b: { x: 120.5, alto: 240 } });
    expect(validarPreferencias({ lugares: [1, 2] }).lugares).toEqual({});
  });

  it("escondidos: solo manual o auto", () => {
    const p = validarPreferencias({ escondidos: { a: "manual", b: "auto", c: "otro", d: 1 } });
    expect(p.escondidos).toEqual({ a: "manual", b: "auto" });
  });

  it("esconderAlTrabajar solo vale si es exactamente true", () => {
    expect(validarPreferencias({ esconderAlTrabajar: true }).esconderAlTrabajar).toBe(true);
    expect(validarPreferencias({ esconderAlTrabajar: 1 }).esconderAlTrabajar).toBe(false);
  });

  it("burbuja: ancho y alto positivos, o null", () => {
    expect(validarPreferencias({ burbuja: { ancho: 480, alto: 360 } }).burbuja).toEqual({
      ancho: 480,
      alto: 360,
    });
    expect(validarPreferencias({ burbuja: { ancho: 0, alto: 360 } }).burbuja).toBeNull();
    expect(validarPreferencias({ burbuja: { ancho: 480 } }).burbuja).toBeNull();
  });

  it("ponerLugar guarda el lugar de uno sin tocar el de los demás", () => {
    const uno = ponerLugar(PREFERENCIAS_POR_DEFECTO, "a", { x: 200, alto: 0 });
    const dos = ponerLugar(uno, "b", { x: 500, alto: 300 });
    expect(dos.lugares).toEqual({ a: { x: 200, alto: 0 }, b: { x: 500, alto: 300 } });
    expect(PREFERENCIAS_POR_DEFECTO.lugares).toEqual({});
  });

  it("alternarEscondido lo esconde a mano y, si ya estaba escondido (a mano o solo), lo saca", () => {
    const uno = alternarEscondido(PREFERENCIAS_POR_DEFECTO, "a");
    expect(uno.escondidos).toEqual({ a: "manual" });
    expect(alternarEscondido(uno, "a").escondidos).toEqual({});
    expect(alternarEscondido({ ...uno, escondidos: { a: "auto" } }, "a").escondidos).toEqual({});
  });

  it("esconderTodos los deja a mano (también a los que se escondieron solos); sacarTodos vacía la incubadora", () => {
    const p = esconderTodos({ ...PREFERENCIAS_POR_DEFECTO, escondidos: { b: "auto" } }, ["a", "b"]);
    expect(p.escondidos).toEqual({ a: "manual", b: "manual" });
    expect(sacarTodos(p).escondidos).toEqual({});
  });

  it("sacarDeIncubadora saca solo a ese, y si no estaba devuelve lo mismo", () => {
    const p = { ...PREFERENCIAS_POR_DEFECTO, escondidos: { a: "manual" as const, b: "auto" as const } };
    expect(sacarDeIncubadora(p, "b").escondidos).toEqual({ a: "manual" });
    expect(sacarDeIncubadora(p, "z")).toBe(p);
  });
  it("lugarDesdeMensaje: solo un id de texto con x y alto finitos, no negativos y de tamaño razonable", () => {
    expect(lugarDesdeMensaje({ pokemonId: "p", x: 300, alto: 40 })).toEqual({
      id: "p",
      lugar: { x: 300, alto: 40 },
    });
    expect(lugarDesdeMensaje({ pokemonId: "p", x: -1, alto: 0 })).toBeNull();
    expect(lugarDesdeMensaje({ pokemonId: "p", x: 10, alto: Number.NaN })).toBeNull();
    expect(lugarDesdeMensaje({ pokemonId: "p", x: 1e9, alto: 0 })).toBeNull();
    expect(lugarDesdeMensaje({ pokemonId: 3, x: 10, alto: 0 })).toBeNull();
    expect(lugarDesdeMensaje({ pokemonId: "", x: 10, alto: 0 })).toBeNull();
    expect(lugarDesdeMensaje(null)).toBeNull();
  });

  it("tamanoDesdeMensaje: ancho y alto positivos y de tamaño razonable", () => {
    expect(tamanoDesdeMensaje({ ancho: 480, alto: 360 })).toEqual({ ancho: 480, alto: 360 });
    expect(tamanoDesdeMensaje({ ancho: 0, alto: 360 })).toBeNull();
    expect(tamanoDesdeMensaje({ ancho: 480, alto: 99999 })).toBeNull();
    expect(tamanoDesdeMensaje("x")).toBeNull();
  });
});
