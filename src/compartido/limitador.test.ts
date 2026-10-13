import { describe, expect, it } from "vitest";
import { crearLimitador } from "./limitador";

function reloj() {
  let t = 1000;
  const tareas: { en: number; fn: () => void; viva: boolean }[] = [];
  return {
    ahora: () => t,
    programar(fn: () => void, ms: number) {
      const tarea = { en: t + ms, fn, viva: true };
      tareas.push(tarea);
      return () => {
        tarea.viva = false;
      };
    },
    avanzar(ms: number) {
      t += ms;
      for (const x of tareas) {
        if (x.viva && x.en <= t) {
          x.viva = false;
          x.fn();
        }
      }
    },
  };
}

describe("crearLimitador", () => {
  it("la primera petición corre al instante", () => {
    const r = reloj();
    let n = 0;
    const l = crearLimitador(r, 100, () => n++);
    l.pedir();
    expect(n).toBe(1);
  });

  it("muchas peticiones seguidas se juntan en una sola al final del intervalo", () => {
    const r = reloj();
    let n = 0;
    const l = crearLimitador(r, 100, () => n++);
    l.pedir();
    for (let i = 0; i < 50; i++) l.pedir();
    expect(n).toBe(1);
    r.avanzar(100);
    expect(n).toBe(2);
    r.avanzar(500);
    expect(n).toBe(2);
  });

  it("no pasa de 10 por segundo con 100 peticiones repartidas en un segundo", () => {
    const r = reloj();
    let n = 0;
    const l = crearLimitador(r, 100, () => n++);
    for (let i = 0; i < 100; i++) {
      l.pedir();
      r.avanzar(10);
    }
    expect(n).toBeLessThanOrEqual(11);
    expect(n).toBeGreaterThan(5);
  });

  it("pasado el intervalo sin peticiones, la siguiente corre al instante", () => {
    const r = reloj();
    let n = 0;
    const l = crearLimitador(r, 100, () => n++);
    l.pedir();
    r.avanzar(300);
    l.pedir();
    expect(n).toBe(2);
  });

  it("cancelar descarta lo pendiente", () => {
    const r = reloj();
    let n = 0;
    const l = crearLimitador(r, 100, () => n++);
    l.pedir();
    l.pedir();
    l.cancelar();
    r.avanzar(500);
    expect(n).toBe(1);
  });
});
