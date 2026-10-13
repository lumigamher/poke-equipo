import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatosAnim } from "@compartido/tipos";
import { describe, expect, it } from "vitest";
import { POSES_ACTIVIDAD } from "./actividades";
import { EFECTOS, golpeNumero, MIN_GOLPE_MS, planGolpe, primerGolpe, tipoDe } from "./poderes";

const anim = (duraciones: number[], golpe?: number): DatosAnim => ({
  ancho: 40,
  alto: 40,
  duraciones,
  filas: 8,
  ...(golpe === undefined ? {} : { golpe }),
});

describe("tipoDe", () => {
  it("cada especie lanza el poder de su tipo; las demás, el normal", () => {
    expect(tipoDe(25)).toBe("electrico");
    expect(tipoDe(7)).toBe("agua");
    expect(tipoDe(4)).toBe("fuego");
    expect(tipoDe(133)).toBe("normal");
    expect(tipoDe(9999)).toBe("normal");
  });
});

describe("planGolpe", () => {
  it("conecta al empezar el cuadro del golpe y dura toda la animación", () => {
    // 30 tics = 500 ms; el golpe está en el cuadro 2, tras 12 tics = 200 ms.
    expect(planGolpe(anim([6, 6, 6, 12], 2))).toEqual({ duracionMs: 500, conectaMs: 200 });
  });

  it("sin cuadro de golpe, conecta a cuatro décimas", () => {
    expect(planGolpe(anim([30, 30])).conectaMs).toBe(400);
  });

  it("un golpe muy corto se alarga para que se vea", () => {
    expect(planGolpe(anim([2, 2], 1)).duracionMs).toBe(MIN_GOLPE_MS);
  });
});

describe("elegir el golpe", () => {
  const disponibles = { Attack: anim([4]), Double: anim([4]) };

  it("alterna entre los que la especie tiene", () => {
    const lista = ["Attack", "Swing", "Double"];
    expect([0, 1, 2].map((n) => golpeNumero(lista, disponibles, n))).toEqual(["Attack", "Double", "Attack"]);
  });

  it("el primero disponible, o null si no hay ninguno", () => {
    expect(primerGolpe(["Shock", "Double", "Attack"], disponibles)).toBe("Double");
    expect(primerGolpe(["Shock"], disponibles)).toBeNull();
    expect(golpeNumero(["Shock"], disponibles, 0)).toBeNull();
  });
});

describe("hojas de efectos", () => {
  it("cada efecto coincide con la hoja bajada: lado, cuadros y archivo", () => {
    const carpeta = join(__dirname, "../../../../assets/pokemon/poderes");
    const bajadas = JSON.parse(readFileSync(join(carpeta, "poderes.json"), "utf8")) as Record<
      string,
      { ancho: number; alto: number; cuadros: number }
    >;
    for (const [tipo, par] of Object.entries(EFECTOS)) {
      for (const h of [par.proyectil, par.impacto]) {
        const real = bajadas[h.nombre];
        expect(real, `${tipo}: ${h.nombre}`).toBeDefined();
        expect(existsSync(join(carpeta, `${h.nombre}.png`)), h.nombre).toBe(true);
        expect([real.ancho, real.alto, real.cuadros], h.nombre).toEqual([h.lado, h.lado, h.total]);
        expect(h.cuadros).toBeGreaterThan(0);
        expect(h.cuadros).toBeLessThanOrEqual(h.total);
      }
    }
  });
});

describe("golpes de las actividades", () => {
  it("quien lanza un poder tiene un objeto al que mirar y pegarle", () => {
    for (const [nombre, pose] of Object.entries(POSES_ACTIVIDAD)) {
      if (!pose.golpes) continue;
      expect(pose.objeto, nombre).not.toBeNull();
      expect(pose.mirarObjeto, nombre).toBe(true);
      expect(pose.vaiven, nombre).toBe(false);
      // La última opción la tienen las 13 especies.
      expect(["Attack", "Double", "Swing", "Hop"]).toContain(pose.golpes.anims.at(-1));
    }
  });
});
