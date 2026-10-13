import { describe, expect, it } from "vitest";
import {
  animAlegria,
  animGolpe,
  DURACION_MS,
  DURACION_REDUCIDA_MS,
  faseEn,
  LINEA,
  LINEA_REDUCIDA,
} from "./ceremonia";

describe("ceremonia: línea de tiempo", () => {
  it("dura unos tres segundos y sus fases van en orden", () => {
    expect(DURACION_MS).toBeGreaterThanOrEqual(2800);
    expect(DURACION_MS).toBeLessThanOrEqual(3400);
    expect(LINEA.map((m) => m.fase)).toEqual(["retirar", "sacudir", "abrir", "sale", "movimiento", "texto"]);
    for (let i = 1; i < LINEA.length; i++) expect(LINEA[i].desdeMs).toBeGreaterThan(LINEA[i - 1].desdeMs);
    expect(LINEA[0].desdeMs).toBe(0);
    expect(LINEA.at(-1)?.desdeMs).toBeLessThan(DURACION_MS);
  });

  it("faseEn devuelve la fase que toca en cada instante", () => {
    expect(faseEn(0, false)).toBe("retirar");
    expect(faseEn(LINEA[2].desdeMs, false)).toBe("abrir");
    expect(faseEn(LINEA[2].desdeMs - 1, false)).toBe("sacudir");
    expect(faseEn(DURACION_MS - 1, false)).toBe("texto");
    expect(faseEn(DURACION_MS, false)).toBe("fin");
    expect(faseEn(99999, false)).toBe("fin");
  });

  it("el texto 'se une a tu equipo' ya está a la vista antes de que acabe", () => {
    expect(DURACION_MS - (LINEA.at(-1)?.desdeMs ?? 0)).toBeGreaterThanOrEqual(700);
  });

  it("con movimiento reducido no hay sacudida, destello ni efecto: solo el texto y el fin", () => {
    expect(LINEA_REDUCIDA.map((m) => m.fase)).toEqual(["texto"]);
    expect(faseEn(0, true)).toBe("texto");
    expect(faseEn(DURACION_REDUCIDA_MS, true)).toBe("fin");
    expect(DURACION_REDUCIDA_MS).toBeLessThan(DURACION_MS);
  });
});

const anims = (...nombres: string[]) =>
  Object.fromEntries(nombres.map((n) => [n, { ancho: 1, alto: 1, duraciones: [1], filas: 1 }]));

describe("animaciones de la especie", () => {
  it("la alegría es Hop, luego Pose, luego Charge, y cae en Idle", () => {
    expect(animAlegria(anims("Idle", "Hop", "Pose"))).toBe("Hop");
    expect(animAlegria(anims("Idle", "Pose", "Charge"))).toBe("Pose");
    expect(animAlegria(anims("Idle", "Charge"))).toBe("Charge");
    expect(animAlegria(anims("Idle", "Walk"))).toBe("Idle");
  });

  it("el golpe es el característico de la especie; el eléctrico usa Shock; respaldo en los golpes comunes", () => {
    expect(animGolpe("electrico", anims("Idle", "Shock", "Shoot", "Attack"))).toBe("Shock");
    expect(animGolpe("fuego", anims("Idle", "Kick", "Shoot", "Attack"))).toBe("Shoot");
    expect(animGolpe("agua", anims("Idle", "Withdraw", "Shoot", "Attack"))).toBe("Shoot");
    expect(animGolpe("planta", anims("Idle", "Strike", "Attack"))).toBe("Strike");
    expect(animGolpe("fuego", anims("Idle", "Attack"))).toBe("Attack");
    expect(animGolpe("fuego", anims("Idle"))).toBeNull();
  });
});
