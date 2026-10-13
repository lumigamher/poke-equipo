import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  leerMovimiento,
  movimientosDe,
  nombresDeMovimientos,
  textoMovimientos,
  validarConfigTipos,
} from "./tipos";

const config = validarConfigTipos(
  JSON.parse(readFileSync(join(__dirname, "../../../config/tipos.json"), "utf8")),
);

describe("nombresDeMovimientos", () => {
  it("junta los de cada tipo y los tres comunes, sin repetir", () => {
    const nombres = nombresDeMovimientos(config);
    expect(nombres).toEqual(expect.arrayContaining(["Impactrueno", "Golpe certero", "Vistazo", "Descanso"]));
    expect(new Set(nombres).size).toBe(nombres.length);
  });
});

describe("config/tipos.json", () => {
  it("es válida y sigue el diseño: psíquico el más capaz, el resto en sonnet", () => {
    expect(config.electrico.modelo).toBe("sonnet");
    expect(config.psiquico.modelo).toBe("opus");
  });

  it("los seis tipos que trae Kanto (bicho, veneno, tierra, roca, hielo, dragón) van en sonnet y con su movimiento", () => {
    for (const t of ["bicho", "veneno", "tierra", "roca", "hielo", "dragon"] as const) {
      expect(config[t].modelo, t).toBe("sonnet");
      expect(config[t].movimiento.nombre, t).not.toBe("");
    }
  });

  it("un tipo sin modelo conocido o sin movimiento no pasa", () => {
    expect(() => validarConfigTipos({})).toThrow(/modelo/);
    expect(() => validarConfigTipos({ ...config, fuego: { ...config.fuego, modelo: "gpt" } })).toThrow(
      /fuego/,
    );
    expect(() => validarConfigTipos({ ...config, agua: { modelo: "sonnet", especialidad: "x" } })).toThrow(
      /agua/,
    );
  });
});

describe("movimientos", () => {
  const deCharmander = movimientosDe(4, config);

  it("cuatro por Pokémon: el de su tipo y tres comunes", () => {
    expect(deCharmander.map((m) => m.nombre)).toEqual([
      "Lanzallamas",
      "Golpe certero",
      "Vistazo",
      "Descanso",
    ]);
    expect(movimientosDe(25, config)[0].nombre).toBe("Impactrueno");
    expect(movimientosDe(9999, config)[0].nombre).toBe("Placaje");
  });

  it("«usa <movimiento>» da su comando, dicho como sea", () => {
    expect(leerMovimiento("Usa Lanzallamas.", deCharmander)).toBe(config.fuego.movimiento.comando);
    expect(leerMovimiento("usa descanso", deCharmander)).toBe("/compact");
    expect(leerMovimiento("utiliza golpe certero", deCharmander)).toContain("lint");
  });

  it("lo que venga después se pega a la instrucción, no a un comando con barra", () => {
    // Squirtle (agua) tiene una instrucción; Pikachu (eléctrico), un comando con barra de la persona.
    const deSquirtle = movimientosDe(7, config);
    expect(leerMovimiento("usa pistola agua en el login", deSquirtle)).toBe(
      `${config.agua.movimiento.comando} en el login`,
    );
    const dePikachu = movimientosDe(25, config);
    expect(leerMovimiento("usa impactrueno donde se valida el token", dePikachu)).toBe("/audit-perf");
    expect(leerMovimiento("usa descanso ya", dePikachu)).toBe("/compact");
  });

  it("una orden corriente no es un movimiento", () => {
    expect(leerMovimiento("usa la función de pago", deCharmander)).toBeNull();
    expect(leerMovimiento("revisa el login", deCharmander)).toBeNull();
    expect(leerMovimiento("lanzallamas", deCharmander)).toBeNull();
  });

  it("la lista se puede leer", () => {
    expect(textoMovimientos(deCharmander).split("\n")).toHaveLength(5);
  });
});
