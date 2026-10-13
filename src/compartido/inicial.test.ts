import { describe, expect, it } from "vitest";
import { inicialesVista, otrasVista, otroInicial, RESUMEN_TIPO, TIPO_NOMBRE } from "./inicial";
import { KANTO } from "./kanto";
import { PASOS } from "./recorrido";
import type { Tipo } from "./tipo-especie";
import { TIPOS } from "./tipo-especie";

const tipos = (modelo: string) =>
  Object.fromEntries(Object.keys(TIPO_NOMBRE).map((t) => [t, { modelo }])) as Record<
    Tipo,
    { modelo: string }
  >;

describe("pokémon iniciales", () => {
  it("son cuatro, en el orden del juego, con su tipo y su modelo según tipos.json", () => {
    const v = inicialesVista(tipos("sonnet"));
    expect(v.map((i) => [i.especie, i.nombre, i.tipo])).toEqual([
      [1, "Bulbasaur", "planta"],
      [4, "Charmander", "fuego"],
      [7, "Squirtle", "agua"],
      [25, "Pikachu", "electrico"],
    ]);
    expect(v.every((i) => i.modelo === "sonnet")).toBe(true);
  });

  it("el modelo sale de la configuración del tipo, no está escrito aquí", () => {
    const cfg = { ...tipos("sonnet"), fuego: { modelo: "opus" } };
    const v = inicialesVista(cfg);
    expect(v.find((i) => i.nombre === "Charmander")?.modelo).toBe("opus");
    expect(v.find((i) => i.nombre === "Pikachu")?.modelo).toBe("sonnet");
  });

  it("cada uno trae su descripción corta y el nombre legible de su tipo", () => {
    for (const i of inicialesVista(tipos("sonnet"))) {
      expect(i.resumen.length).toBeGreaterThan(10);
      expect(i.tipoNombre).toBe(TIPO_NOMBRE[i.tipo]);
    }
  });
});

describe("otroInicial (texto del recorrido)", () => {
  it("nombra a Squirtle salvo que el elegido sea Squirtle", () => {
    expect(otroInicial("Pikachu")).toBe("Squirtle");
    expect(otroInicial("Bulbasaur")).toBe("Squirtle");
    expect(otroInicial("Squirtle")).toBe("Charmander");
  });

  it("nunca devuelve el mismo, para ninguno de los cuatro", () => {
    for (const i of inicialesVista(tipos("sonnet"))) expect(otroInicial(i.nombre)).not.toBe(i.nombre);
  });

  it("el último paso del recorrido invita a llamar a otro distinto del elegido", () => {
    const fin = PASOS.find((p) => p.id === "fin");
    expect(fin?.texto("Squirtle")).toContain("llama a Charmander");
    expect(fin?.texto("Squirtle")).not.toContain("llama a Squirtle");
    expect(fin?.texto("Pikachu")).toContain("llama a Squirtle");
  });
});

describe("la Pokédex de Kanto del laboratorio", () => {
  it("todo tipo tiene nombre escrito y resumen", () => {
    for (const t of TIPOS) {
      expect(TIPO_NOMBRE[t], t).toBeTruthy();
      expect(RESUMEN_TIPO[t], t).toBeTruthy();
    }
  });

  it("ofrece solo las disponibles de Kanto, en orden de Pokédex, con tipo, título y el modelo de su tipo", () => {
    const cfg = { ...tipos("sonnet"), psiquico: { modelo: "opus" } };
    const disponibles = [
      { especie: 172, nombre: "Pichu" },
      { especie: 150, nombre: "Mewtwo" },
      { especie: 122, nombre: "Mime", titulo: "Mr. Mime" },
      { especie: 25, nombre: "Pikachu" },
      { especie: 448, nombre: "Lucario" },
    ];
    const v = otrasVista(cfg, disponibles);
    expect(v.map((i) => i.especie)).toEqual([25, 122, 150]);
    expect(v[1]).toMatchObject({
      titulo: "Mr. Mime",
      tipo: "psiquico",
      tipoNombre: "Psíquico",
      modelo: "opus",
    });
    expect(v[0]).not.toHaveProperty("titulo");
    expect(v[2].modelo).toBe("opus");
  });

  it("los cuatro iniciales muestran su resumen propio también desde la Pokédex", () => {
    const propios = inicialesVista(tipos("sonnet"));
    const v = otrasVista(tipos("sonnet"), KANTO);
    for (const ini of propios)
      expect(v.find((o) => o.especie === ini.especie)?.resumen, ini.nombre).toBe(ini.resumen);
    expect(v.find((o) => o.especie === 150)?.resumen).toBe(RESUMEN_TIPO.psiquico);
  });

  it("sin nada disponible, nada se ofrece (el botón no sale)", () => {
    expect(otrasVista(tipos("sonnet"), [])).toEqual([]);
  });

  it("con las 151 bajadas ofrece 151", () => {
    expect(otrasVista(tipos("sonnet"), KANTO)).toHaveLength(151);
  });
});
