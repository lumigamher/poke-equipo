import { describe, expect, it } from "vitest";
import { esVuelve, leerLlamada } from "./llamada";

describe("leerLlamada", () => {
  it("separa la especie y el encargo", () => {
    expect(leerLlamada("llama a charmander para que revise los tests de acme")).toEqual({
      nombreEspecie: "charmander",
      encargo: "que revise los tests de acme",
    });
  });

  it("acepta 'llamar a' sin encargo", () => {
    expect(leerLlamada("llamar a squirtle")).toEqual({ nombreEspecie: "squirtle", encargo: "" });
  });

  it("una frase normal no es una llamada", () => {
    expect(leerLlamada("revisa el deploy de acme")).toBeNull();
    expect(leerLlamada("llama al cliente")).toBeNull();
  });

  it("reconoce la llamada en el texto original, con mayúsculas, tildes y signos", () => {
    expect(leerLlamada("Llamá a Charmander, para que revise")).toEqual({
      nombreEspecie: "charmander",
      encargo: "que revise",
    });
  });

  it("el encargo sale del texto original: rutas, mayúsculas y puntuación intactas", () => {
    expect(leerLlamada("llama a Charmander para revise src/main/Index.ts, por favor")).toEqual({
      nombreEspecie: "charmander",
      encargo: "revise src/main/Index.ts, por favor",
    });
  });

  it("conserva tildes y espacios internos del encargo", () => {
    expect(leerLlamada("llama  a  Bulbasaur  para que actualice la migración  de Acme.")).toEqual({
      nombreEspecie: "bulbasaur",
      encargo: "que actualice la migración  de Acme.",
    });
  });

  it("'para' sin nada detrás deja el encargo vacío", () => {
    expect(leerLlamada("llama a squirtle para")).toEqual({ nombreEspecie: "squirtle", encargo: "" });
  });

  it("acepta 'yama' (yeísmo: el transcriptor preciso escribe así 'llama')", () => {
    expect(leerLlamada("yama a Charmander")).toEqual({ nombreEspecie: "charmander", encargo: "" });
    expect(leerLlamada("yamar a squirtle para que revise")).toEqual({
      nombreEspecie: "squirtle",
      encargo: "que revise",
    });
  });

  it("sin la 'a' (se funde con 'llama'), solo si lo que sigue es un único nombre o un nombre con 'para'", () => {
    expect(leerLlamada("yama Charmander.")).toEqual({ nombreEspecie: "charmander", encargo: "" });
    expect(leerLlamada("llama Charmander para que revise los tests")).toEqual({
      nombreEspecie: "charmander",
      encargo: "que revise los tests",
    });
    // Una orden que empieza por "llama" sigue siendo una orden.
    expect(leerLlamada("llama la función de pago")).toBeNull();
    expect(leerLlamada("llama al cliente")).toBeNull();
  });
});

describe("leerLlamada: formas naturales", () => {
  it("'necesito que llames a X', 'llámame a X', 'trae a X', 'saca a X'", () => {
    expect(leerLlamada("Necesito que llames a Square.")).toEqual({ nombreEspecie: "square", encargo: "" });
    expect(leerLlamada("Quiero que llames a Charmander para que revise")).toEqual({
      nombreEspecie: "charmander",
      encargo: "que revise",
    });
    expect(leerLlamada("llámame a Squirtle")).toEqual({ nombreEspecie: "squirtle", encargo: "" });
    expect(leerLlamada("trae a Bulbasaur")).toEqual({ nombreEspecie: "bulbasaur", encargo: "" });
    expect(leerLlamada("saca a Eevee")).toEqual({ nombreEspecie: "eevee", encargo: "" });
  });

  it("'ya más cuarto': así escribe el rápido 'llama a Squirtle'", () => {
    expect(leerLlamada("ya más cuarto.")).toEqual({ nombreEspecie: "cuarto", encargo: "" });
  });

  it("'es cuarto', 'es cuero': Squirtle partido en dos palabras cuenta como un solo nombre", () => {
    expect(leerLlamada("llama a es cuarto")).toEqual({ nombreEspecie: "es cuarto", encargo: "" });
    expect(leerLlamada("llama a es cuero para que revise")).toEqual({
      nombreEspecie: "es cuero",
      encargo: "que revise",
    });
  });

  it("'saca' y 'trae' sin la 'a' son órdenes normales", () => {
    expect(leerLlamada("saca reporte")).toBeNull();
    expect(leerLlamada("trae cambios")).toBeNull();
    expect(leerLlamada("necesito que revises el login")).toBeNull();
  });
});

describe("esVuelve", () => {
  it("reconoce 'vuelve' y sus variantes", () => {
    expect(esVuelve("vuelve")).toBe(true);
    expect(esVuelve("vuelve ya")).toBe(true);
    expect(esVuelve("vete")).toBe(true);
    expect(esVuelve("guardate")).toBe(true);
  });

  it("'vuelve' con más contenido es una orden, no un guardado", () => {
    expect(esVuelve("vuelve a correr los tests")).toBe(false);
  });
});
