import { describe, expect, it } from "vitest";
import { aprenderApodos, buscarLlamado, distancia, normalizar, sinChoques } from "./nombres";

const pikachu = { id: "p1", nombre: "Pikachu", apodos: [] };
const squirtle = { id: "s1", nombre: "Squirtle", apodos: ["squirrel", "squarrel"] };

describe("normalizar", () => {
  it("quita tildes, signos y mayúsculas", () => {
    expect(normalizar("¿Cómo vás, Pikachú?")).toBe("como vas pikachu");
  });
});

describe("distancia", () => {
  it("cuenta ediciones", () => {
    expect(distancia("pikachu", "picachu")).toBe(1);
    expect(distancia("squirtle", "squirrel")).toBe(3);
  });
});

describe("buscarLlamado", () => {
  it("reconoce el nombre al inicio y devuelve el resto", () => {
    expect(buscarLlamado("Pikachu, revisa el deploy de Acme.", [pikachu])).toEqual({
      id: "p1",
      resto: "revisa el deploy de Acme.",
    });
  });

  it("acepta una muletilla antes del nombre", () => {
    expect(buscarLlamado("Oye Pikachu, cancela eso.", [pikachu])).toEqual({
      id: "p1",
      resto: "cancela eso.",
    });
  });

  it("acepta un parecido de hasta un tercio de las letras", () => {
    expect(buscarLlamado("Picachu corre los tests", [pikachu])?.id).toBe("p1");
  });

  it("usa los apodos", () => {
    expect(buscarLlamado("Squirrel, ¿cómo vas con la migración?", [pikachu, squirtle])).toEqual({
      id: "s1",
      resto: "¿cómo vas con la migración?",
    });
  });

  it("el nombre solo deja el resto vacío", () => {
    expect(buscarLlamado("Pikachu.", [pikachu])).toEqual({ id: "p1", resto: "" });
  });

  it("une la orden que viene en la oración siguiente", () => {
    expect(buscarLlamado("Pikachu. Revisa el deploy.", [pikachu])).toEqual({
      id: "p1",
      resto: "Revisa el deploy.",
    });
  });

  it("encuentra el llamado en la segunda oración del trozo", () => {
    expect(buscarLlamado("Bueno, a ver. Pikachu, abre el proyecto.", [pikachu])).toEqual({
      id: "p1",
      resto: "abre el proyecto.",
    });
  });

  // Review Focus 1
  it("no activa con el nombre en medio de la frase", () => {
    expect(buscarLlamado("Ayer vi a Pikachu en la tele.", [pikachu])).toBeNull();
    expect(buscarLlamado("Suele escribir cada nombre como squirtle.", [squirtle])).toBeNull();
  });

  it("no activa con el nombre en la tercera palabra", () => {
    expect(buscarLlamado("El nombre Pikachu es corto.", [pikachu])).toBeNull();
  });

  it("no activa con palabras parecidas pero cortas o lejanas", () => {
    expect(buscarLlamado("Pica, pica. Pica.", [pikachu])).toBeNull();
    expect(buscarLlamado("Pick up the phone.", [pikachu])).toBeNull();
    expect(buscarLlamado("Cuartel general.", [squirtle])).toBeNull();
  });

  it("devuelve null con texto vacío o sin candidatos", () => {
    expect(buscarLlamado("", [pikachu])).toBeNull();
    expect(buscarLlamado("Pikachu, hola.", [])).toBeNull();
  });
});

describe("aprenderApodos", () => {
  it("guarda las formas parecidas al nombre", () => {
    expect(aprenderApodos("Squirtle", ["Squirrel.", "Squarrel.", "Squirtle."]).sort()).toEqual([
      "squarrel",
      "squirrel",
    ]);
  });

  it("guarda una forma algo lejana si se repite, mientras siga pareciéndose al nombre", () => {
    expect(aprenderApodos("Bulbasaur", ["Bolvasar.", "Bolvasar.", "Bulbasar."]).sort()).toEqual([
      "bolvasar",
      "bulbasar",
    ]);
  });

  it("una palabra cualquiera repetida no se aprende como apodo", () => {
    expect(aprenderApodos("Pikachu", ["Entonces.", "Entonces."])).toEqual([]);
    expect(aprenderApodos("Pikachu", ["entonces fuimos", "entonces dijo", "mercado mercado"])).toEqual([]);
    // "vuelvaso" (distancia 6 de bulbasaur, el límite es 5) ya no se aprende por repetición.
    expect(aprenderApodos("Bulbasaur", ["Vuelvaso.", "Vuelvaso."])).toEqual([]);
  });

  it("aprende las formas observadas en el spike, dichas dos veces", () => {
    const casos: [string, string[]][] = [
      ["Squirtle", ["squirrel", "squarrel", "squarel", "scartle", "squarton"]],
      ["Bulbasaur", ["bulbasar", "bulvasar", "balbasar", "bolvasar"]],
      ["Charmander", ["sharmander", "sarmander"]],
    ];
    for (const [nombre, formas] of casos) {
      const dicho = formas.flatMap((f) => [f, f]);
      expect(aprenderApodos(nombre, dicho, 10).sort()).toEqual([...formas].sort());
    }
  });

  it("ignora el nombre exacto, las palabras cortas y las lejanas dichas una vez", () => {
    expect(aprenderApodos("Pikachu", ["Pikachu.", "Pica.", "Hola mesa."])).toEqual([]);
  });

  it("respeta el máximo", () => {
    const formas = ["picachu", "pikachus", "pikacho", "pikachi"];
    expect(aprenderApodos("Pikachu", formas, 2)).toHaveLength(2);
  });
});

describe("nombre propio y nombre de la especie", () => {
  const rayo = { id: "p1", nombre: "Rayo", apodos: [], alias: ["Pikachu"] };
  const chispa = { id: "c1", nombre: "Chispa", apodos: [], alias: ["Charmander"] };

  it("responde a su nombre propio y también al de su especie", () => {
    expect(buscarLlamado("Rayo, revisa el deploy", [rayo])?.id).toBe("p1");
    expect(buscarLlamado("Pikachu, revisa el deploy", [rayo])).toEqual({
      id: "p1",
      resto: "revisa el deploy",
    });
    expect(buscarLlamado("Picachu, revisa el deploy", [rayo])?.id).toBe("p1");
  });

  it("sinChoques quita el nombre de especie que suena como el nombre propio de otro miembro", () => {
    const pika = { id: "p1", nombre: "Chamander", apodos: [], alias: ["Pikachu"] };
    const char = { id: "c1", nombre: "Pikachu2", apodos: [], alias: ["Charmander"] };
    // "Chamander" (nombre propio de p1) suena a "Charmander" (especie de c1): c1 pierde su alias.
    const r = sinChoques([
      pika,
      { ...char, nombre: "Zeta" },
      { id: "c2", nombre: "Otro", apodos: [], alias: ["Charmander"] },
    ]);
    expect(r.find((c) => c.id === "c2")?.alias).toEqual([]);
    expect(r.find((c) => c.id === "p1")?.alias).toEqual(["Pikachu"]);
  });

  it("sinChoques deja los alias cuando nada choca y no toca el nombre propio", () => {
    const r = sinChoques([rayo, chispa]);
    expect(r).toEqual([rayo, chispa]);
  });

  it("sinChoques también quita el alias que choca con un apodo aprendido de otro", () => {
    const a = { id: "a", nombre: "Rayo", apodos: ["pikachu"], alias: [] };
    const b = { id: "b", nombre: "Trueno", apodos: [], alias: ["Pikachu"] };
    expect(sinChoques([a, b]).find((c) => c.id === "b")?.alias).toEqual([]);
  });

  it("sin alias todo sigue como antes", () => {
    expect(buscarLlamado("Rayo ven", [{ id: "x", nombre: "Rayo", apodos: [] }])?.id).toBe("x");
  });
});

describe("aprenderApodos con nombres cortos y filtro", () => {
  it("aprende una variante de 3 o 4 letras solo si se oyó dos veces y está a una letra", () => {
    expect(aprenderApodos("Rayo", ["raio", "raio"])).toEqual(["raio"]);
    expect(aprenderApodos("Rayo", ["raio", "otra cosa"])).toEqual([]);
    expect(aprenderApodos("Rayo", ["ralo", "ralo", "ralo"])).toEqual(["ralo"]);
    // Dos veces pero a dos letras: no.
    expect(aprenderApodos("Rayo", ["rbbo", "rbbo"])).toEqual([]);
    // Menos de tres letras nunca.
    expect(aprenderApodos("Rayo", ["ra", "ra"])).toEqual([]);
  });

  it("descarta lo que el filtro rechaza (palabras de mando, nombres de otros)", () => {
    expect(aprenderApodos("Halo", ["hazlo", "hazlo", "halo"], 8, (v) => v === "hazlo")).toEqual([]);
    expect(aprenderApodos("Llaves", ["llama", "llama", "yaves"], 8, (v) => v === "llama")).toEqual(["yaves"]);
  });
});
