import { describe, expect, it } from "vitest";
import configReal from "../../../config/voces.json";
import { type ConfigVoces, elegirVoz, validarConfigVoces } from "./voces";

const cfg: ConfigVoces = {
  conjunto: ["A", "B", "C"],
  especies: {
    "25": { voz: "A", velocidad: 1.1 },
    "4": { voz: "B", velocidad: 1 },
  },
};

const real: ConfigVoces = configReal;

describe("elegirVoz", () => {
  it("usa la voz base de la especie si nadie más la usa", () => {
    expect(elegirVoz(25, [], cfg)).toEqual({ voz: "A", velocidad: 1.1, repetida: false });
  });

  it("si la voz base ya suena en el equipo, toma la primera libre con la velocidad de la especie", () => {
    expect(elegirVoz(25, [{ voz: "A", velocidad: 1 }], cfg)).toEqual({
      voz: "B",
      velocidad: 1.1,
      repetida: false,
    });
  });

  it("una especie sin configurar cae a la primera voz del conjunto a velocidad 1", () => {
    expect(elegirVoz(999, [], cfg)).toEqual({ voz: "A", velocidad: 1, repetida: false });
  });

  it("una especie cuya voz no está en el conjunto cae a la base", () => {
    const malo: ConfigVoces = {
      conjunto: ["A", "B"],
      especies: { "4": { voz: "Z", velocidad: 1.2 } },
    };
    expect(elegirVoz(4, [], malo)).toEqual({ voz: "A", velocidad: 1, repetida: false });
  });

  it("sin voz libre repite la menos usada con otra velocidad y lo avisa", () => {
    const enUso = [
      { voz: "A", velocidad: 1 },
      { voz: "B", velocidad: 1 },
      { voz: "C", velocidad: 1 },
      { voz: "B", velocidad: 1.15 },
    ];
    // A, B y C tienen 1, 2 y 1 usos: gana A por ser la menos usada y la primera del conjunto.
    // Con A a velocidad 1, la base 1,1 sigue libre.
    const r = elegirVoz(25, enUso, cfg);
    expect(r).toEqual({ voz: "A", velocidad: 1.1, repetida: true });
  });

  it("si la velocidad base ya la usa esa voz, prueba base+0,15 y la deja fuera de la repetida", () => {
    const enUso = [
      { voz: "A", velocidad: 1.1 },
      { voz: "B", velocidad: 1 },
      { voz: "C", velocidad: 1 },
    ];
    expect(elegirVoz(25, enUso, cfg)).toEqual({ voz: "A", velocidad: 1.25, repetida: true });
  });

  it("respeta el rango [0,8; 1,3] al buscar velocidad libre", () => {
    const enUso = [
      { voz: "A", velocidad: 1.25 },
      { voz: "B", velocidad: 1 },
      { voz: "C", velocidad: 1 },
    ];
    // base 1.25 usada; 1.40 fuera de rango; 1.10 libre.
    expect(elegirVoz(25, enUso, cfg)).toEqual({ voz: "A", velocidad: 1.1, repetida: true });
  });

  it("si ninguna velocidad sirve, devuelve la velocidad base con repetida=true", () => {
    // Desde 1,1 con pasos de 0,15 solo son alcanzables en [0,8; 1,3]: 1,1, 1,25, 0,95 y 0,8.
    // A, B y C con 4 usos cada una: A gana el empate por ser la primera del conjunto.
    const enUso = [
      { voz: "A", velocidad: 1.1 },
      { voz: "A", velocidad: 1.25 },
      { voz: "A", velocidad: 0.95 },
      { voz: "A", velocidad: 0.8 },
      ...Array.from({ length: 4 }, () => ({ voz: "B", velocidad: 1 })),
      ...Array.from({ length: 4 }, () => ({ voz: "C", velocidad: 1 })),
    ];
    expect(elegirVoz(25, enUso, cfg)).toEqual({ voz: "A", velocidad: 1.1, repetida: true });
  });

  it("ignora en el conteo las voces que no están en el conjunto", () => {
    const enUso = [
      { voz: "X", velocidad: 1.1 },
      { voz: "X", velocidad: 1.1 },
      { voz: "B", velocidad: 1 },
      { voz: "C", velocidad: 1 },
      { voz: "A", velocidad: 1.1 },
    ];
    // X no cuenta; A, B, C con 1 uso cada uno; empate gana A.
    expect(elegirVoz(25, enUso, cfg)).toEqual({ voz: "A", velocidad: 1.25, repetida: true });
  });

  it("conjunto vacío lanza error explícito", () => {
    const vacio: ConfigVoces = { conjunto: [], especies: {} };
    expect(() => elegirVoz(25, [], vacio)).toThrow("voces.json: el conjunto de voces está vacío");
  });

  it("escenario de la revisión: el sexto Pokémon (448) suena con otra velocidad que Psyduck (54)", () => {
    const equipo = [1, 54, 7, 39, 4];
    const usadas: { voz: string; velocidad: number }[] = [];
    for (const especie of equipo) {
      usadas.push(elegirVoz(especie, usadas, real));
    }
    const sexto = elegirVoz(448, usadas, real);
    const psyduck = usadas[1];
    expect(sexto.repetida).toBe(true);
    expect(sexto.voz).toBe(psyduck.voz);
    expect(sexto.velocidad).not.toBe(psyduck.velocidad);
    expect(sexto).toEqual({
      voz: "vits-piper-es_MX-claude-high-int8",
      velocidad: 1.15,
      repetida: true,
    });
  });
});

describe("validarConfigVoces", () => {
  const instaladas = new Set(["A", "B", "C"]);
  const hay = (v: string) => instaladas.has(v);

  it("acepta una config válida y la devuelve", () => {
    expect(validarConfigVoces(cfg, hay)).toEqual(cfg);
  });

  it("acepta el voces.json real con las voces que trae", () => {
    expect(validarConfigVoces(configReal, (v) => real.conjunto.includes(v))).toEqual(real);
  });

  it("rechaza algo que no es un objeto", () => {
    expect(() => validarConfigVoces(null, hay)).toThrow(/voces\.json/);
    expect(() => validarConfigVoces([], hay)).toThrow(/voces\.json/);
  });

  it("rechaza un conjunto vacío o que no es lista de textos", () => {
    expect(() => validarConfigVoces({ conjunto: [], especies: {} }, hay)).toThrow(/conjunto.*vacío/);
    expect(() => validarConfigVoces({ conjunto: "A", especies: {} }, hay)).toThrow(/conjunto/);
    expect(() => validarConfigVoces({ conjunto: ["A", 3], especies: {} }, hay)).toThrow(/conjunto/);
  });

  it("rechaza una voz del conjunto que no está instalada en models/", () => {
    expect(() => validarConfigVoces({ conjunto: ["A", "Z"], especies: {} }, hay)).toThrow(/Z.*models/);
  });

  it("rechaza una especie cuya voz no está en el conjunto", () => {
    const malo = { conjunto: ["A"], especies: { "4": { voz: "B", velocidad: 1 } } };
    expect(() => validarConfigVoces(malo, hay)).toThrow(/especie 4.*B/);
  });

  it("una especie sin voz o con voz null lo dice claro", () => {
    const sinVoz = { conjunto: ["A"], especies: { "4": { velocidad: 1 } } };
    expect(() => validarConfigVoces(sinVoz, hay)).toThrow(/especie 4 no tiene voz/);
    const nula = { conjunto: ["A"], especies: { "4": { voz: null, velocidad: 1 } } };
    expect(() => validarConfigVoces(nula, hay)).toThrow(/especie 4 no tiene voz/);
  });

  it("rechaza una velocidad fuera de [0,8; 1,3]", () => {
    for (const velocidad of [0.79, 1.31, 3]) {
      const malo = { conjunto: ["A"], especies: { "4": { voz: "A", velocidad } } };
      expect(() => validarConfigVoces(malo, hay)).toThrow(/especie 4.*velocidad.*0,8.*1,3/);
    }
    const borde = {
      conjunto: ["A"],
      especies: { "4": { voz: "A", velocidad: 0.8 }, "7": { voz: "A", velocidad: 1.3 } },
    };
    expect(validarConfigVoces(borde, hay).especies["7"].velocidad).toBe(1.3);
  });

  it("rechaza especies que no son un objeto o una velocidad que no es número", () => {
    expect(() => validarConfigVoces({ conjunto: ["A"], especies: [] }, hay)).toThrow(/especies/);
    const malo = { conjunto: ["A"], especies: { "4": { voz: "A", velocidad: "1" } } };
    expect(() => validarConfigVoces(malo, hay)).toThrow(/especie 4.*velocidad/);
  });
});
