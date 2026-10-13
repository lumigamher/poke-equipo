import { describe, expect, it } from "vitest";
import {
  type DepsPrimeraVez,
  primeraVez,
  type RespuestaLab,
  validarPedidoEspecie,
  validarRespuestaLab,
} from "./primera-vez";

const INICIALES = [1, 4, 7, 25];
const NOMBRES: Record<number, string> = { 1: "Bulbasaur", 4: "Charmander", 7: "Squirtle", 25: "Pikachu" };

/** Fakes: `respuestas` son lo que el renderer dice, en orden; `carpetas`, lo que contesta el diálogo. */
function montar(respuestas: RespuestaLab[], carpetas: (string | null)[]) {
  const log: string[] = [];
  const deps: DepsPrimeraVez = {
    iniciales: INICIALES.map((especie) => ({ especie, nombre: NOMBRES[especie] })),
    mostrar: (o) =>
      log.push(o.tipo === "volver" && o.fallo ? `mostrar:volver:${o.fallo}` : `mostrar:${o.tipo}`),
    asegurar: async () => true,
    esperar: async () => {
      const r = respuestas.shift();
      if (!r) throw new Error("el laboratorio pidió más respuestas de las previstas");
      log.push(`espera:${r.tipo}`);
      return r;
    },
    elegirCarpeta: async (titulo) => {
      log.push(`carpeta:${titulo}`);
      return carpetas.shift() ?? null;
    },
    datosDe: (especie) => ({ voz: `voz-${especie}`, velocidad: 1 + especie / 100 }),
    // Prueba: solo vale "Rayo", "Gota" y el nombre de la especie.
    nombreValido: (especie, nombre) => (["Rayo", "Gota", NOMBRES[especie]].includes(nombre) ? nombre : null),
  };
  return { log, deps };
}

describe("primera vez: laboratorio → carpeta → crear", () => {
  it("elige, pide la carpeta con el nombre de la especie y devuelve los datos de ese Pokémon", async () => {
    const m = montar([{ tipo: "elegida", especie: 4 }], ["/proyecto"]);
    const r = await primeraVez(m.deps);
    expect(r).toEqual({
      nombre: "Charmander",
      especie: 4,
      voz: "voz-4",
      velocidad: 1.04,
      carpeta: "/proyecto",
    });
    expect(m.log).toEqual([
      "mostrar:abrir",
      "espera:elegida",
      "carpeta:¿En qué proyecto va a trabajar Charmander?",
      "mostrar:cerrar",
    ]);
  });

  it("con nombre propio: la carpeta se pide con ese nombre y el Pokémon nace con él", async () => {
    const m = montar([{ tipo: "elegida", especie: 25, nombre: "Rayo" }], ["/p"]);
    const r = await primeraVez(m.deps);
    expect(r).toMatchObject({ nombre: "Rayo", especie: 25, carpeta: "/p" });
    expect(m.log).toContain("carpeta:¿En qué proyecto va a trabajar Rayo?");
  });

  it("dejar el nombre de la especie, o no mandar nombre, es lo mismo", async () => {
    const a = await primeraVez(montar([{ tipo: "elegida", especie: 4, nombre: "Charmander" }], ["/p"]).deps);
    const b = await primeraVez(montar([{ tipo: "elegida", especie: 4 }], ["/p"]).deps);
    expect(a?.nombre).toBe("Charmander");
    expect(b?.nombre).toBe("Charmander");
  });

  it("un nombre que main no valida (llegó torcido) se cambia por el de la especie", async () => {
    for (const malo of ["Claude", "si", "", "Dos Palabras"]) {
      const m = montar([{ tipo: "elegida", especie: 7, nombre: malo }], ["/p"]);
      expect((await primeraVez(m.deps))?.nombre, malo).toBe("Squirtle");
    }
  });

  it("el modelo elegido en el laboratorio viaja a los datos si es de la lista y distinto del de su tipo", async () => {
    const a = await primeraVez(montar([{ tipo: "elegida", especie: 4, modelo: "haiku" }], ["/p"]).deps);
    expect(a?.modelo).toBe("haiku");
    const b = await primeraVez(montar([{ tipo: "elegida", especie: 25, modelo: "sonnet" }], ["/p"]).deps);
    expect(b?.modelo).toBe("sonnet");
  });

  it("una elección explícita se guarda siempre, aunque coincida con la de su tipo", async () => {
    const r = await primeraVez(montar([{ tipo: "elegida", especie: 4, modelo: "sonnet" }], ["/p"]).deps);
    expect(r?.modelo).toBe("sonnet");
  });

  it("sin modelo, o con uno inválido o fuera del menú, queda nulo (manda el tipo)", async () => {
    for (const modelo of [undefined, "gpt-9", "fable", ""]) {
      const r = await primeraVez(montar([{ tipo: "elegida", especie: 4, modelo }], ["/p"]).deps);
      expect(r, String(modelo)).not.toHaveProperty("modelo");
    }
  });

  it("carpeta cancelada: vuelve al laboratorio, se elige otro y sigue", async () => {
    const m = montar(
      [
        { tipo: "elegida", especie: 7 },
        { tipo: "elegida", especie: 25 },
      ],
      [null, "/otra"],
    );
    const r = await primeraVez(m.deps);
    expect(r?.nombre).toBe("Pikachu");
    expect(r?.carpeta).toBe("/otra");
    expect(m.log).toEqual([
      "mostrar:abrir",
      "espera:elegida",
      "carpeta:¿En qué proyecto va a trabajar Squirtle?",
      "mostrar:volver",
      "espera:elegida",
      "carpeta:¿En qué proyecto va a trabajar Pikachu?",
      "mostrar:cerrar",
    ]);
  });

  it("una especie de la Pokédex de Kanto solo vale si main la ofrece (tiene sus sprites); si no, vuelve a la elección", async () => {
    // Main ofrece las cuatro y Mewtwo (150), pero no Mew (151: sin sprites bajados).
    const montarConOtras = (r: RespuestaLab[], c: (string | null)[]) => {
      const m = montar(r, c);
      m.deps.iniciales = [...m.deps.iniciales, { especie: 150, nombre: "Mewtwo" }];
      return m;
    };
    const ok = montarConOtras([{ tipo: "elegida", especie: 150, nombre: "Mewtwo", modelo: "opus" }], ["/p"]);
    expect(await primeraVez(ok.deps)).toMatchObject({
      nombre: "Mewtwo",
      especie: 150,
      voz: "voz-150",
      carpeta: "/p",
      modelo: "opus",
    });
    const mal = montarConOtras(
      [
        { tipo: "elegida", especie: 151 },
        { tipo: "elegida", especie: 25 },
      ],
      ["/q"],
    );
    expect((await primeraVez(mal.deps))?.especie).toBe(25);
    expect(mal.log.filter((l) => l === "mostrar:volver")).toHaveLength(1);
    expect(mal.log.some((l) => l.startsWith("carpeta:¿En qué proyecto va a trabajar Mew"))).toBe(false);
  });

  it("la elegida debe tener sus assets completos al crearla: si no están, se intenta bajarla (asegurar) antes de crear", async () => {
    const m = montar([{ tipo: "elegida", especie: 4 }], ["/p"]);
    m.deps.asegurar = async (e) => {
      m.log.push(`asegurar:${e}`);
      return true;
    };
    const r = await primeraVez(m.deps);
    expect(r?.especie).toBe(4);
    // Se comprueba tras la carpeta y justo antes de devolver los datos.
    expect(m.log.indexOf("asegurar:4")).toBeGreaterThan(m.log.findIndex((l) => l.startsWith("carpeta:")));
    expect(m.log.indexOf("asegurar:4")).toBeLessThan(m.log.indexOf("mostrar:cerrar"));
  });

  it("si no se puede asegurar (sin red, 404), no se crea: vuelve al laboratorio avisando de cuál fue y se puede elegir otra", async () => {
    const m = montar(
      [
        { tipo: "elegida", especie: 150 },
        { tipo: "elegida", especie: 25 },
      ],
      ["/p", "/q"],
    );
    m.deps.iniciales = [...m.deps.iniciales, { especie: 150, nombre: "Mewtwo" }];
    m.deps.asegurar = async (e) => {
      m.log.push(`asegurar:${e}`);
      return e !== 150;
    };
    const r = await primeraVez(m.deps);
    expect(r).toMatchObject({ especie: 25, carpeta: "/q" });
    expect(m.log).toContain("mostrar:volver:150");
    expect(m.log.filter((l) => l.startsWith("asegurar:"))).toEqual(["asegurar:150", "asegurar:25"]);
  });

  it("puede cancelar la carpeta varias veces seguidas sin cerrar la app", async () => {
    const m = montar(
      [
        { tipo: "elegida", especie: 1 },
        { tipo: "elegida", especie: 1 },
        { tipo: "elegida", especie: 1 },
      ],
      [null, null, "/x"],
    );
    expect((await primeraVez(m.deps))?.carpeta).toBe("/x");
    expect(m.log.filter((l) => l === "mostrar:volver")).toHaveLength(2);
  });

  it("salir desde el laboratorio devuelve null (la app se cierra) y no pregunta carpeta", async () => {
    const m = montar([{ tipo: "salir" }], []);
    expect(await primeraVez(m.deps)).toBeNull();
    expect(m.log).toEqual(["mostrar:abrir", "espera:salir", "mostrar:cerrar"]);
  });

  it("una especie que no es de las cuatro se ignora: no se crea ni se pregunta nada", async () => {
    const m = montar(
      [
        { tipo: "elegida", especie: 150 },
        { tipo: "elegida", especie: 7 },
      ],
      ["/p"],
    );
    const r = await primeraVez(m.deps);
    expect(r?.nombre).toBe("Squirtle");
    expect(m.log.filter((l) => l.startsWith("carpeta:"))).toHaveLength(1);
    expect(m.log).toContain("mostrar:volver");
  });

  it("si el diálogo de carpeta falla, el error sube y el laboratorio no queda a medias", async () => {
    const m = montar([{ tipo: "elegida", especie: 4 }], []);
    m.deps.elegirCarpeta = async () => {
      throw new Error("no abrió");
    };
    await expect(primeraVez(m.deps)).rejects.toThrow("no abrió");
    expect(m.log.at(-1)).toBe("mostrar:cerrar");
  });
});

describe("validarRespuestaLab", () => {
  it("acepta elegir una especie entera (con su nombre, si lo trae) o salir", () => {
    expect(validarRespuestaLab({ tipo: "elegida", especie: 25 })).toEqual({ tipo: "elegida", especie: 25 });
    expect(validarRespuestaLab({ tipo: "elegida", especie: 25, nombre: "Rayo" })).toEqual({
      tipo: "elegida",
      especie: 25,
      nombre: "Rayo",
    });
    // Un nombre que no es texto se descarta (queda el de la especie).
    expect(validarRespuestaLab({ tipo: "elegida", especie: 25, nombre: 7 })).toEqual({
      tipo: "elegida",
      especie: 25,
    });
    expect(validarRespuestaLab({ tipo: "salir", extra: 1 })).toEqual({ tipo: "salir" });
  });

  it("el modelo se acepta solo si es de la lista; si no, se descarta", () => {
    expect(validarRespuestaLab({ tipo: "elegida", especie: 4, modelo: "haiku" })).toEqual({
      tipo: "elegida",
      especie: 4,
      modelo: "haiku",
    });
    for (const malo of ["gpt", "Opus", 3, null, {}, "fable"])
      expect(validarRespuestaLab({ tipo: "elegida", especie: 4, modelo: malo })).toEqual({
        tipo: "elegida",
        especie: 4,
      });
  });

  it("rechaza lo demás", () => {
    for (const malo of [
      null,
      3,
      "salir",
      [],
      {},
      { tipo: "elegida" },
      { tipo: "elegida", especie: "4" },
      { tipo: "elegida", especie: 1.5 },
      { tipo: "aprobar" },
    ])
      expect(validarRespuestaLab(malo)).toBeNull();
  });
});

describe("validarPedidoEspecie", () => {
  const ofrecidas = [1, 4, 7, 25, 150];
  it("acepta una especie entera de las ofrecidas, marcada o elegida", () => {
    expect(validarPedidoEspecie({ especie: 150 }, ofrecidas)).toEqual({ especie: 150, eleccion: false });
    expect(validarPedidoEspecie({ especie: 1, eleccion: true }, ofrecidas)).toEqual({
      especie: 1,
      eleccion: true,
    });
    expect(validarPedidoEspecie({ especie: 1, eleccion: "si" }, ofrecidas)?.eleccion).toBe(false);
  });
  it("rechaza lo que no es una especie ofrecida (nada de rutas ni URLs, ni números fuera del catálogo)", () => {
    for (const malo of [
      null,
      undefined,
      25,
      "25",
      "../25",
      {},
      [],
      { especie: "25" },
      { especie: "poke://assets/0025" },
      { especie: 2.5 },
      { especie: -1 },
      { especie: 0 },
      { especie: 9999 },
      { especie: Number.NaN },
      { especie: 151 },
    ])
      expect(validarPedidoEspecie(malo, ofrecidas), String(malo)).toBeNull();
  });
});
