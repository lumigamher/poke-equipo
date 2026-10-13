import { describe, expect, it } from "vitest";
import { buscarMiembro, fonetica, resolverEspecie } from "./especie-oida";
import { CATALOGO } from "./especies";

const nombre = (oido: string) => resolverEspecie(oido, CATALOGO)?.nombre ?? null;

describe("resolverEspecie", () => {
  it("el nombre exacto, sin importar mayúsculas, tildes ni signos", () => {
    expect(nombre("Charmander")).toBe("Charmander");
    expect(nombre("pikachu.")).toBe("Pikachu");
  });

  it("lo que el transcriptor escribe mal cae en la especie más parecida", () => {
    // Casos reales: el paso preciso con frases cortas y la voz de la persona.
    expect(nombre("Tarmander")).toBe("Charmander");
    expect(nombre("Sermander")).toBe("Charmander");
    expect(nombre("bolbasar")).toBe("Bulbasaur");
    expect(nombre("Bulbasar")).toBe("Bulbasaur");
    expect(nombre("Skittle")).toBe("Squirtle");
    expect(nombre("Icachu")).toBe("Pikachu");
  });

  it("lo que el transcriptor escribe cuando no conoce el nombre (casos reales de la persona)", () => {
    expect(nombre("Square")).toBe("Squirtle");
    expect(nombre("squirrel")).toBe("Squirtle");
    expect(nombre("Escuerto")).toBe("Squirtle");
    expect(nombre("cuarto")).toBe("Squirtle");
    expect(nombre("Charvander")).toBe("Charmander");
    expect(nombre("ivi")).toBe("Eevee");
    expect(nombre("miutu")).toBe("Mewtwo");
  });

  it("una palabra cualquiera no es una especie", () => {
    expect(nombre("cliente")).toBeNull();
    expect(nombre("Carlos")).toBeNull();
    expect(nombre("tests")).toBeNull();
    expect(nombre("")).toBeNull();
  });

  it("Mew y Mewtwo no se confunden entre sí", () => {
    expect(nombre("mew")).toBe("Mew");
    expect(nombre("mewtwo")).toBe("Mewtwo");
  });

  it("solo resuelve entre las disponibles", () => {
    expect(resolverEspecie("Tarmander", [{ especie: 25, nombre: "Pikachu" }])).toBeNull();
  });
});

describe("resolverEspecie con las evoluciones en el catálogo", () => {
  it("cada nombre exacto del catálogo se resuelve a sí mismo", () => {
    for (const e of CATALOGO) expect(resolverEspecie(e.nombre, CATALOGO)?.nombre, e.nombre).toBe(e.nombre);
  });

  it("las evoluciones no le quitan sus formas torcidas a las de siempre", () => {
    expect(resolverEspecie("Charvander", CATALOGO)?.nombre).toBe("Charmander");
    expect(resolverEspecie("charizar", CATALOGO)?.nombre).toBe("Charizard");
    expect(resolverEspecie("Square", CATALOGO)?.nombre).toBe("Squirtle");
    expect(resolverEspecie("picachu", CATALOGO)?.nombre).toBe("Pikachu");
    expect(resolverEspecie("ivi", CATALOGO)?.nombre).toBe("Eevee");
  });
});

describe("por sonido (lo que el transcriptor escribió cuando la persona dijo Squirtle)", () => {
  it("Escuela, Scourt y Square son Squirtle", () => {
    expect(nombre("Escuela")).toBe("Squirtle");
    expect(nombre("Scourt")).toBe("Squirtle");
    expect(nombre("Square")).toBe("Squirtle");
    expect(fonetica("Squirtle")).toBe("eskuirtel");
  });

  it("palabras corrientes siguen sin ser una especie", () => {
    for (const palabra of ["Carlos", "reporte", "cliente", "login", "pruebas", "archivo", "casa"]) {
      expect(nombre(palabra), palabra).toBeNull();
    }
  });
});

describe("lo que escribieron los transcriptores en las grabaciones de la persona", () => {
  it("las formas torcidas de cada nombre llevan a su especie", () => {
    const casos: Record<string, string[]> = {
      Squirtle: [
        "es cuarto",
        "es cuerdo",
        "es cuero",
        "escuerdo",
        "esquiarl",
        "squirple",
        "squire",
        "squartle",
        "Scartle",
        "Squirrel",
        "Squired",
      ],
      Charmander: [
        "Chairmander",
        "Shormander",
        "Sherman del",
        "Charman del",
        "Shermander",
        "germander",
        "armander",
        "Charmenther",
        "almander",
      ],
      Bulbasaur: ["Bulbbasaw"],
    };
    for (const [esperada, oidos] of Object.entries(casos)) {
      for (const oido of oidos) expect(nombre(oido), oido).toBe(esperada);
    }
  });

  it("las que son palabras de verdad no se toman por un Pokémon", () => {
    for (const palabra of ["esfuerzo", "Germany", "vaso"]) expect(nombre(palabra), palabra).toBeNull();
  });
});

describe("buscarMiembro: llamar a alguien del equipo por su nombre propio", () => {
  const equipo = [
    { id: "a", nombre: "Rayo", apodos: ["rallo"], alias: ["Pikachu"] },
    { id: "b", nombre: "Charmander", apodos: [], alias: [] },
  ];

  it("encuentra por nombre propio y por apodo aprendido, sin importar mayúsculas ni tildes", () => {
    expect(buscarMiembro("Rayo", equipo)?.id).toBe("a");
    expect(buscarMiembro("rallo", equipo)?.id).toBe("a");
    expect(buscarMiembro("RÁYO.", equipo)?.id).toBe("a");
  });

  it("solo cuenta a los que tienen nombre propio: el de la especie lo resuelve el catálogo", () => {
    expect(buscarMiembro("Charmander", equipo)).toBeNull();
    expect(buscarMiembro("Pikachu", equipo)).toBeNull();
  });

  it("lo que no se parece a nadie, no", () => {
    expect(buscarMiembro("Squirtle", equipo)).toBeNull();
    expect(buscarMiembro("", equipo)).toBeNull();
  });
});
