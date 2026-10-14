import type { Estado } from "@compartido/tipos";
import { describe, expect, it } from "vitest";
import { actualizarEscondidos, asoma, marcasIncubadora } from "./incubadora";

const v = (id: string, estado: Estado) => ({ id, estado });

describe("actualizarEscondidos", () => {
  it("con el modo automático, el que empieza a trabajar se esconde solo", () => {
    expect(actualizarEscondidos({}, [v("a", "trabajando"), v("b", "paseando")], true)).toEqual({ a: "auto" });
  });

  it("sin el modo automático, nadie se esconde solo", () => {
    expect(actualizarEscondidos({}, [v("a", "trabajando")], false)).toEqual({});
  });

  it("el que se escondió solo sigue escondido mientras trabaja, pide permiso o escucha", () => {
    for (const estado of ["trabajando", "pidiendo_permiso", "escuchando"] as const) {
      expect(actualizarEscondidos({ a: "auto" }, [v("a", estado)], true)).toEqual({ a: "auto" });
    }
  });

  it("el que se escondió solo sale solo al dejar de trabajar, aunque se haya apagado el modo", () => {
    for (const estado of ["termino", "esperando", "paseando", "error"] as const) {
      expect(actualizarEscondidos({ a: "auto" }, [v("a", estado)], true)).toEqual({});
      expect(actualizarEscondidos({ a: "auto" }, [v("a", estado)], false)).toEqual({});
    }
  });

  it("el escondido a mano no sale solo y no pasa a automático", () => {
    expect(actualizarEscondidos({ a: "manual" }, [v("a", "termino")], true)).toEqual({ a: "manual" });
    expect(actualizarEscondidos({ a: "manual" }, [v("a", "trabajando")], true)).toEqual({ a: "manual" });
  });

  it("olvida a los automáticos que ya no están en pantalla; a los manuales los recuerda", () => {
    expect(actualizarEscondidos({ a: "auto", b: "manual" }, [], true)).toEqual({ b: "manual" });
  });

  it("si nada cambia devuelve el mismo objeto (así no se guarda en disco en cada cambio de estado)", () => {
    const antes = { a: "manual" as const, b: "auto" as const };
    expect(actualizarEscondidos(antes, [v("a", "paseando"), v("b", "trabajando")], true)).toBe(antes);
  });
});

describe("asoma", () => {
  const base = { estado: "trabajando" as Estado, permiso: null, abierta: false, sinLeer: false };

  it("trabajando sin nada pendiente se queda en su pokébola", () => {
    expect(asoma(base)).toBe(false);
  });

  it("asoma si pide permiso, falla, escucha, tiene la burbuja abierta o algo sin leer", () => {
    expect(asoma({ ...base, permiso: { id: "p" } })).toBe(true);
    expect(asoma({ ...base, estado: "pidiendo_permiso" })).toBe(true);
    expect(asoma({ ...base, estado: "error" })).toBe(true);
    expect(asoma({ ...base, estado: "escuchando" })).toBe(true);
    expect(asoma({ ...base, abierta: true })).toBe(true);
    expect(asoma({ ...base, sinLeer: true })).toBe(true);
  });
});

describe("marcasIncubadora", () => {
  it("al que no está escondido no le marca nada", () => {
    expect(marcasIncubadora({ id: "a", estado: "trabajando", permiso: null }, {})).toEqual({});
  });

  it("al escondido lo marca, y si te necesita, también asomado", () => {
    expect(marcasIncubadora({ id: "a", estado: "trabajando", permiso: null }, { a: "manual" })).toEqual({
      escondido: true,
    });
    expect(
      marcasIncubadora({ id: "a", estado: "termino", permiso: null, sinLeer: true }, { a: "auto" }),
    ).toEqual({
      escondido: true,
      asoma: true,
    });
  });
});
