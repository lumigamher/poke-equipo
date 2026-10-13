import { describe, expect, it } from "vitest";
import { type ContextoNombre, MAX_NOMBRE, MIN_NOMBRE, validarNombre } from "./nombre";

const ctx: ContextoNombre = {
  reservadas: ["si", "no", "para", "llama", "vuelve", "guardate", "usa", "cancela", "claude", "sonnet"],
  especies: ["Bulbasaur", "Charmander", "Squirtle", "Eevee", "Mewtwo"],
  otros: [{ nombre: "Chispa", apodos: ["chispas"] }],
};
const ok = (t: string, c: ContextoNombre = ctx) => {
  const r = validarNombre(t, c);
  if (!r.ok) throw new Error(`debía valer: ${r.motivo}`);
  return r.nombre;
};
const falla = (t: string, c: ContextoNombre = ctx) => {
  const r = validarNombre(t, c);
  if (r.ok) throw new Error(`no debía valer: ${r.nombre}`);
  return r.motivo;
};

describe("validarNombre: forma", () => {
  it("guarda con mayúscula inicial y el resto en minúscula", () => {
    expect(ok("rayo")).toBe("Rayo");
    expect(ok("  RAYO ")).toBe("Rayo");
    expect(ok("ñandú")).toBe("Ñandú");
  });
  it("admite tildes, ñ y diéresis", () => {
    expect(ok("Güero")).toBe("Güero");
    expect(ok("Tomás")).toBe("Tomás");
    expect(ok("Niño")).toBe("Niño");
  });
  it("pide entre 2 y 12 letras", () => {
    expect(MIN_NOMBRE).toBe(2);
    expect(MAX_NOMBRE).toBe(12);
    expect(falla("A")).toMatch(/2/);
    expect(falla("")).toMatch(/2/);
    expect(ok("Kiwi")).toBe("Kiwi");
    expect(ok("Abcdefghijkl")).toBe("Abcdefghijkl");
    expect(falla("Abcdefghijklm")).toMatch(/12/);
  });
  it("rechaza números, símbolos y espacios", () => {
    expect(falla("Rayo2")).toMatch(/letras/i);
    expect(falla("Ra-yo")).toMatch(/letras/i);
    expect(falla("Rayo!")).toMatch(/letras/i);
    expect(falla("Rayo 2")).toMatch(/sin espacios|un solo/i);
    expect(falla("Rayo Veloz")).toMatch(/sin espacios|un solo/i);
  });
});

describe("validarNombre: palabras que la app entiende", () => {
  it("no deja una palabra de mando, con o sin tilde o mayúsculas", () => {
    for (const p of ["Sí", "si", "NO", "Para", "Llama", "Vuelve", "Guárdate", "Usa", "Cancela"])
      expect(falla(p), p).toMatch(/palabra/i);
  });
  it("no deja un modelo", () => {
    expect(falla("Claude")).toBeTruthy();
    expect(falla("sonnet")).toBeTruthy();
  });
  it("no deja algo que suena a una palabra de mando larga", () => {
    expect(falla("Guardate")).toBeTruthy();
    expect(falla("Guardaté")).toBeTruthy();
    expect(falla("Cancelar")).toBeTruthy();
  });
});

describe("validarNombre: lo que la transcripción escribe como una palabra de mando", () => {
  it("no deja lo que suena a «sí» o «no» (Ci, Zi, Sy, Sii, Noo, Nou)", () => {
    for (const p of ["Ci", "Zi", "Sy", "Sii", "Noo", "Nó", "Sí"]) expect(falla(p), p).toBeTruthy();
  });
  it("no deja una palabra a una letra de una orden corta", () => {
    expect(falla("Usa")).toBeTruthy();
    expect(falla("Usá")).toBeTruthy();
    expect(falla("Uza")).toBeTruthy();
  });
  it("no deja las palabras con que se empieza una frase", () => {
    for (const p of [
      "Bueno",
      "Pero",
      "Mira",
      "Hola",
      "Listo",
      "Oye",
      "Vale",
      "Entonces",
      "Gracias",
      "Bueeno",
    ])
      expect(falla(p), p).toBeTruthy();
  });
  it("las palabras largas normales siguen valiendo", () => {
    for (const p of ["Rayo", "Nube", "Gota", "Lumbre", "Bruma"]) expect(ok(p), p).toBe(p);
  });
  it("normaliza a NFC antes de mirar las letras (una tilde suelta no es un símbolo)", () => {
    expect(ok("Tomás".normalize("NFD"))).toBe("Tomás");
  });
});

describe("validarNombre: choques por sonido", () => {
  it("no deja el nombre de otro Pokémon del equipo ni uno que suene igual", () => {
    expect(falla("Chispa")).toMatch(/Chispa/);
    expect(falla("chíspa")).toMatch(/Chispa/);
    expect(falla("Chispas")).toMatch(/Chispa/);
  });
  it("no deja un apodo aprendido de otro", () => {
    const c: ContextoNombre = { ...ctx, otros: [{ nombre: "Rayo", apodos: ["rallo"] }] };
    expect(falla("Rallo", c)).toMatch(/Rayo/);
  });
  it("no deja el nombre de otra especie del catálogo; uno parecido solo si esa especie está en el equipo", () => {
    expect(falla("Squirtle")).toMatch(/Squirtle/);
    expect(falla("Mewtwo")).toMatch(/Mewtwo/);
    expect(ok("Squirtel")).toBe("Squirtel");
    const equipo: ContextoNombre = { ...ctx, especiesEquipo: ["Squirtle", "Eevee"] };
    expect(falla("Squirtel", equipo)).toMatch(/Squirtle/);
    expect(falla("Evee", equipo)).toMatch(/Eevee/);
    expect(ok("Mimi", equipo)).toBe("Mimi");
  });
  it("nombres corrientes valen aunque se parezcan a una especie del catálogo que no está en el equipo", () => {
    const catalogo = [
      "Lapras",
      "Kakuna",
      "Onix",
      "Magmar",
      "Machop",
      "Omastar",
      "Seadra",
      "Goldeen",
      "Persian",
    ];
    const c: ContextoNombre = { ...ctx, especies: catalogo, especiesEquipo: ["Pidgey"] };
    for (const n of [
      "Laura",
      "Karina",
      "Sandra",
      "Magda",
      "Nacho",
      "Paris",
      "Mama",
      "Master",
      "Seda",
      "Golden",
    ])
      expect(ok(n, c)).toBe(n);
    // Y el nombre exacto de otra especie sigue sin valer.
    expect(falla("Onix", c)).toMatch(/Onix/);
  });
  it("dejar el nombre de su propia especie siempre vale, aunque suene a otra (Pikachu / Pichu)", () => {
    const c: ContextoNombre = { ...ctx, especies: ["Pichu"], especiesEquipo: ["Pichu"], propia: "Pikachu" };
    expect(ok("pikachu", c)).toBe("Pikachu");
    expect(falla("Pikachu", { ...c, propia: undefined })).toMatch(/Pichu/);
    // Pero no se salta a los demás del equipo.
    expect(falla("Pikachu", { ...c, otros: [{ nombre: "Pikachu", apodos: [] }] })).toMatch(/equipo/);
  });

  it("el nombre de su propia especie vale aunque se parezca a una palabra de mando (Tangela ~ cancela)", () => {
    const c: ContextoNombre = {
      ...ctx,
      reservadas: ["cancela", "para", "dragon", "yamar"],
      mando: ["cancela", "para"],
    };
    for (const n of ["Tangela", "Paras", "Magmar", "Dragonite", "Dragonair"]) {
      expect(falla(n, c)).toMatch(/palabra/);
      expect(ok(n, { ...c, propia: n })).toBe(n);
    }
  });

  it("la especie propia no cuenta: el contexto ya la deja fuera", () => {
    const c: ContextoNombre = { ...ctx, especies: ["Bulbasaur"] };
    expect(ok("Pikachu", c)).toBe("Pikachu");
  });
});
