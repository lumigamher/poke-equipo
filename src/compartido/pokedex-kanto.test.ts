import { describe, expect, it } from "vitest";
import { KANTO } from "./kanto";
import { filtrarEspecies, moverMarca, numeroDex, rotulo, teclaDeBusqueda } from "./pokedex-kanto";

const nums = (texto: string) => filtrarEspecies(KANTO, texto).map((e) => e.especie);

describe("filtrarEspecies", () => {
  it("sin texto, todas, en orden", () => {
    expect(nums("")).toHaveLength(151);
    expect(nums("   ").slice(0, 3)).toEqual([1, 2, 3]);
  });

  it("por número: lo escrito es el comienzo del número, con o sin ceros", () => {
    expect(nums("150")).toEqual([150]);
    expect(nums("15")).toEqual([15, 150, 151]);
    expect(nums("015")).toEqual([15, 150, 151]);
    expect(nums("152")).toEqual([]);
    expect(nums("0")).toHaveLength(151);
  });

  it("por las primeras letras del nombre, sin importar mayúsculas", () => {
    expect(nums("PIKA")).toEqual([25]);
    expect(nums("mew")).toEqual([150, 151]);
    expect(nums("char")).toEqual([4, 5, 6]);
  });

  it("los que empiezan por el texto van antes que los que solo lo contienen", () => {
    const r = nums("ar");
    expect(r.slice(0, 3)).toEqual([24, 59, 144]); // Arbok, Arcanine, Articuno
    expect(r).toContain(6); // Charizard lo contiene
    expect(r.indexOf(6)).toBeGreaterThan(2);
  });

  it("halla «Mr. Mime», «Farfetch'd» y «Nidoran♀» por su título o por su nombre de una palabra", () => {
    expect(nums("mr")).toContain(122);
    expect(nums("mr. mi")).toContain(122);
    expect(nums("mime")[0]).toBe(122);
    expect(nums("farfetch'd")).toEqual([83]);
    expect(nums("nidoran")).toEqual([29, 32]);
    expect(nums("nidorana")).toEqual([29]);
  });

  it("cualquier trozo cuenta, con menos prioridad", () => {
    expect(nums("chu")).toContain(25); // Pikachu
  });

  it("lo que no existe da una lista vacía", () => {
    expect(nums("zzzz")).toEqual([]);
  });

  it("no modifica la lista de entrada", () => {
    const copia = [...KANTO];
    filtrarEspecies(KANTO, "pi");
    expect(KANTO).toEqual(copia);
  });
});

describe("moverMarca", () => {
  const v = [4, 5, 6, 7, 8];
  it("avanza y retrocede sin dar la vuelta", () => {
    expect(moverMarca(v, 5, 1)).toBe(6);
    expect(moverMarca(v, 5, -1)).toBe(4);
    expect(moverMarca(v, 4, -1)).toBe(4);
    expect(moverMarca(v, 8, 1)).toBe(8);
  });

  it("una fila es +/- las columnas y se queda en el borde", () => {
    expect(moverMarca(v, 4, 3)).toBe(7);
    expect(moverMarca(v, 6, 3)).toBe(8);
    expect(moverMarca(v, 6, -3)).toBe(4);
  });

  it("sin marca entra por un extremo; sin nada visible, null", () => {
    expect(moverMarca(v, null, 1)).toBe(4);
    expect(moverMarca(v, null, -1)).toBe(8);
    expect(moverMarca(v, 99, 1)).toBe(4);
    expect(moverMarca([], 5, 1)).toBeNull();
  });
});

describe("teclaDeBusqueda", () => {
  it("letras y dígitos sueltos valen; el resto no", () => {
    expect(teclaDeBusqueda({ key: "1" })).toBe("1");
    expect(teclaDeBusqueda({ key: "P" })).toBe("p");
    expect(teclaDeBusqueda({ key: "ñ" })).toBe("ñ");
    expect(teclaDeBusqueda({ key: "Enter" })).toBeNull();
    expect(teclaDeBusqueda({ key: "ArrowUp" })).toBeNull();
    expect(teclaDeBusqueda({ key: " " })).toBeNull();
    expect(teclaDeBusqueda({ key: "a", ctrlKey: true })).toBeNull();
    expect(teclaDeBusqueda({ key: "a", metaKey: true })).toBeNull();
  });
});

describe("rótulos", () => {
  it("el título del juego si lo tiene; el número con tres cifras", () => {
    expect(rotulo(KANTO[121])).toBe("Mr. Mime");
    expect(rotulo(KANTO[24])).toBe("Pikachu");
    expect(numeroDex(7)).toBe("007");
    expect(numeroDex(150)).toBe("150");
  });
});
