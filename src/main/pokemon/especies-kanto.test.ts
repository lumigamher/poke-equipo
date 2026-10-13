import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KANTO } from "@compartido/kanto";
import { MAX_NOMBRE, PALABRAS_COMUNES, validarNombre } from "@compartido/nombre";
import { distancia, normalizar, plegar } from "@compartido/sonido";
import { describe, expect, it } from "vitest";
import { palabrasDeMando, palabrasReservadas } from "../entrenador/entrenador";
import { listaDeEspecies } from "./controlador";
import { resolverEspecie, resolverExacta } from "./especie-oida";
import { CATALOGO, elegirEspecie } from "./especies";
import { nombresDeMovimientos, validarConfigTipos } from "./tipos";

const raiz = join(__dirname, "../../..");
const glosario = JSON.parse(readFileSync(join(raiz, "config/glosario.json"), "utf8")) as string[];
const tipos = validarConfigTipos(JSON.parse(readFileSync(join(raiz, "config/tipos.json"), "utf8")));
/** Las reservadas REALES de la app: mando, modelos, glosario y movimientos. */
const reservadas = palabrasReservadas(glosario, nombresDeMovimientos(tipos));
const mando = palabrasDeMando();

describe("catálogo con Kanto completo", () => {
  it("tiene las 151 de Kanto con el mismo nombre y las de fuera de Kanto de antes", () => {
    for (const k of KANTO)
      expect(CATALOGO.find((e) => e.especie === k.especie)?.nombre, k.nombre).toBe(k.nombre);
    for (const n of [172, 446, 447, 448])
      expect(
        CATALOGO.some((e) => e.especie === n),
        String(n),
      ).toBe(true);
    expect(new Set(CATALOGO.map((e) => e.especie)).size).toBe(CATALOGO.length);
    expect(CATALOGO).toHaveLength(155);
  });

  it("cada nombre se resuelve a sí mismo, también con 151 (nadie se confunde con otro)", () => {
    for (const e of CATALOGO) expect(resolverEspecie(e.nombre, CATALOGO)?.especie, e.nombre).toBe(e.especie);
  });

  it("el nombre por omisión de cada especie le sirve como nombre propio", () => {
    for (const e of CATALOGO) {
      const r = validarNombre(e.nombre, {
        reservadas,
        mando,
        especies: CATALOGO.filter((x) => x.especie !== e.especie).map((x) => x.nombre),
        propia: e.nombre,
        otros: [],
      });
      expect(r.ok, e.nombre).toBe(true);
      expect(e.nombre.length).toBeLessThanOrEqual(MAX_NOMBRE);
    }
  });

  it("los nombres raros se piden por voz y por comando", () => {
    const quien = (t: string) => elegirEspecie(t, CATALOGO, -1, () => 0);
    expect(quien("Mr. Mime")).toMatchObject({ especie: { especie: 122 } });
    expect(quien("mister mime")).toMatchObject({ especie: { especie: 122 } });
    expect(quien("Farfetch'd")).toMatchObject({ especie: { especie: 83 } });
    expect(quien("nidoran hembra")).toMatchObject({ especie: { especie: 29 } });
    expect(quien("nidoran macho")).toMatchObject({ especie: { especie: 32 } });
    expect(quien("150")).toMatchObject({ especie: { nombre: "Mewtwo" } });
    // Lo torcido solo sugiere: no actúa.
    expect(quien("sharmandar")).toMatchObject({ tipo: "aproximada", sugerida: { especie: 4 } });
  });

  const corrientes = [
    "cliente",
    "archivo",
    "casa",
    "proyecto",
    "servidor",
    "cambio",
    "agente",
    "ventana",
    "pantalla",
    "error",
    "mensaje",
    "pedro",
    "camila",
    "andres",
    "bruno",
    "gracias",
    "bueno",
    "mama",
    "karina",
    "laura",
    "master",
    "unix",
    "seda",
    "golden",
    "mago",
    "paris",
    "sandra",
    "magda",
    "nacho",
    "sofia",
    "carlos",
    "usuario",
    "menu",
    "modelo",
    "golpe",
    "gollum",
    "magia",
    "obra",
    "muy",
    "mucho",
    "persona",
    "policia",
    "dragones",
    "zapatos",
    "pincel",
    "electro",
    "tangente",
    "cangrejo",
    "caballo",
    "rapido",
    "arbol",
    "estrellas",
    "hipnosis",
    "mimo",
    "meme",
    "cubo",
    "marco",
    "chance",
    "horse",
    "onice",
    "omar",
    "abre",
  ];

  it("palabras corrientes (las medidas por el revisor y más) no coinciden EXACTAMENTE con ninguna especie", () => {
    for (const p of corrientes) expect(resolverExacta(p, CATALOGO), p).toBeNull();
  });

  it("y por escrito solo sugieren: elegirEspecie no actúa con una coincidencia aproximada", () => {
    for (const p of ["karina", "laura", "master", "unix", "seda", "golden", "mago"]) {
      const r = elegirEspecie(p, CATALOGO, -1, () => 0);
      expect(r.tipo, p).not.toBe("especie");
    }
    expect(elegirEspecie("karina", CATALOGO, -1, () => 0)).toMatchObject({
      tipo: "aproximada",
      sugerida: { nombre: "Kakuna" },
    });
  });

  it("la tolerancia del oído sigue ajustada: estas palabras corrientes ni se le parecen a una especie", () => {
    const lejanas = [
      "cliente",
      "archivo",
      "casa",
      "proyecto",
      "servidor",
      "cambio",
      "agente",
      "ventana",
      "pantalla",
      "error",
      "mensaje",
      "pedro",
      "camila",
      "andres",
      "bruno",
      "gracias",
      "bueno",
    ];
    for (const p of lejanas) expect(resolverEspecie(p, CATALOGO), p).toBeNull();
  });

  it("las variantes oídas curadas de Kanto se resuelven exactas a su especie", () => {
    const casos: Record<string, string[]> = {
      Dragonite: ["dragonight"],
      Scyther: ["saider", "saiter"],
      Geodude: ["yiodud", "yeodud"],
      Onix: ["onis"],
      Machamp: ["machan"],
      Arcanine: ["arcanai", "arcanain"],
      Charmander: ["tarmander"],
      Gengar: ["guengar", "hengar"],
    };
    for (const [nombre, variantes] of Object.entries(casos))
      for (const v of variantes) expect(resolverExacta(v, CATALOGO)?.nombre, v).toBe(nombre);
  });

  it("ninguna variante oída está a una letra o menos del nombre de OTRA especie", () => {
    const sl = (t: string) => normalizar(t).replace(/\s/g, "");
    for (const e of CATALOGO)
      for (const v of e.oidos ?? [])
        for (const otra of CATALOGO) {
          if (otra.especie === e.especie) continue;
          for (const forma of [otra.nombre, otra.titulo ?? ""].filter(Boolean))
            expect(distancia(sl(v), sl(forma)) > 1, `${v} (${e.nombre}) ~ ${forma}`).toBe(true);
        }
  });

  it("ninguna variante oída choca con otra especie, con una palabra de mando ni con una muy común", () => {
    const dura = new Set([...reservadas, ...PALABRAS_COMUNES].map(plegar));
    for (const e of CATALOGO)
      for (const v of e.oidos ?? []) {
        const exacta = resolverExacta(v, CATALOGO);
        expect(exacta?.especie, `${v} (${e.nombre})`).toBe(e.especie);
        expect(dura.has(plegar(v)), `${v} (${e.nombre}) es palabra de mando o común`).toBe(false);
      }
  });

  it("el aviso de /pokemon no lista las 151", () => {
    const texto = listaDeEspecies(CATALOGO.map((e) => e.nombre));
    expect(texto.length).toBeLessThan(200);
    expect(texto).toMatch(/y \d+ más\.$/);
    expect(listaDeEspecies(["A", "B"])).toBe("Puedo llamar a: A, B.");
  });
});
