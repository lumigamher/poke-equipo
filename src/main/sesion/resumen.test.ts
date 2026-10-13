import { describe, expect, it } from "vitest";
import { construirRol, GENERICA, separarResumen } from "./resumen";

describe("separarResumen", () => {
  it("separa el detalle de la línea de voz", () => {
    expect(
      separarResumen("Cambié dos archivos:\n- a.ts\n- b.ts\n\nVOZ: Listo, cambié dos archivos."),
    ).toEqual({ detalle: "Cambié dos archivos:\n- a.ts\n- b.ts", voz: "Listo, cambié dos archivos." });
  });

  it("acepta la etiqueta en negrilla y limpia el markdown de la voz", () => {
    expect(separarResumen("Hecho.\n**VOZ:** Quedó `listo` el **deploy**.\n")).toEqual({
      detalle: "Hecho.",
      voz: "Quedó listo el deploy.",
    });
  });

  it("si solo vino la línea de voz, el detalle es esa misma frase", () => {
    expect(separarResumen("VOZ: Hola Ana.")).toEqual({ detalle: "Hola Ana.", voz: "Hola Ana." });
  });

  // Review Focus 3
  it("sin línea de voz dice la frase genérica y no pierde texto", () => {
    expect(separarResumen("Respuesta larga\nsin resumen.")).toEqual({
      detalle: "Respuesta larga\nsin resumen.",
      voz: GENERICA,
    });
  });

  it("con la línea de voz vacía dice la frase genérica y conserva todo", () => {
    expect(separarResumen("Detalle.\nVOZ:   ")).toEqual({ detalle: "Detalle.\nVOZ:", voz: GENERICA });
  });

  it("una línea VOZ a mitad del texto no cuenta", () => {
    const texto = "Uno.\nVOZ: esto no es el final.\nDos.";
    expect(separarResumen(texto)).toEqual({ detalle: texto, voz: GENERICA });
  });

  it("recorta una voz demasiado larga", () => {
    expect(separarResumen(`Detalle.\nVOZ: ${"palabra ".repeat(100)}`).voz.length).toBeLessThanOrEqual(300);
  });

  it("una voz larga se recorta para hablar pero el detalle conserva el texto completo", () => {
    const larga = "a".repeat(400);
    const r = separarResumen(`Detalle.\nVOZ: ${larga}`);
    expect(r.voz.length).toBeLessThanOrEqual(300);
    expect(r.detalle).toContain(larga);
    expect(r.detalle).toContain("Detalle.");
  });

  it("con texto vacío no revienta", () => {
    expect(separarResumen("")).toEqual({ detalle: "", voz: GENERICA });
  });
});

describe("construirRol", () => {
  it("incluye el nombre, el glosario y la instrucción de voz", () => {
    const rol = construirRol("Pikachu", ["Acme", "Tienda"]);
    expect(rol).toContain("Pikachu");
    expect(rol).toContain("Acme, Tienda");
    expect(rol).toContain("VOZ:");
  });
});

describe("construirRol con equipo", () => {
  it("con especies, explica que llamar a otro va por la herramienta y lista el catálogo", () => {
    const rol = construirRol("Pikachu", ["Acme"], ["Squirtle", "Charmander"]);
    expect(rol).toContain("llamar_pokemon");
    expect(rol).toContain("Catálogo: Squirtle, Charmander.");
  });

  it("sin especies no menciona la herramienta", () => {
    expect(construirRol("Pikachu", ["Acme"])).not.toContain("llamar_pokemon");
  });
});

describe("construirRol con el equipo por nombres propios", () => {
  const equipo = [
    { nombre: "Rayo", especie: "Pikachu" },
    { nombre: "Squirtle", especie: "Squirtle" },
  ];

  it("lista al equipo con su nombre propio y su especie, y dice que se les llama por cualquiera", () => {
    const rol = construirRol("Chispa", ["Acme"], ["Squirtle", "Pikachu"], "", equipo);
    expect(rol).toContain("Tu equipo: Rayo (Pikachu), Squirtle.");
    expect(rol).toMatch(/nombre propio/);
    expect(rol).toContain("llamar_pokemon");
  });

  it("sin equipo no añade la línea", () => {
    expect(construirRol("Chispa", ["Acme"], ["Squirtle"])).not.toContain("Tu equipo:");
  });
});
