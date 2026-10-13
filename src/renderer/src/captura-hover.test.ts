import { describe, expect, it } from "vitest";
import { crearHover } from "./captura-hover";

type Caja = { x: number; y: number; w: number; h: number };

/** Un mundo con rectángulos "interactivos" que se pueden mover, quitar o poner. */
function mundo() {
  const cajas = new Map<string, Caja>();
  const cambios: boolean[] = [];
  const raices: Array<string | null> = [];
  const golpe = (px: number, py: number) =>
    [...cajas.entries()].find(([, c]) => px >= c.x && px < c.x + c.w && py >= c.y && py < c.y + c.h)?.[0] ??
    null;
  const hover = crearHover<string>({
    golpe,
    alCambiar: (c) => cambios.push(c),
    alRaiz: (r) => raices.push(r),
  });
  return { cajas, cambios, raices, hover };
}

describe("captura por hover", () => {
  it("posición desconocida: ignora, aunque haya algo interactivo", () => {
    const m = mundo();
    m.cajas.set("p", { x: 0, y: 0, w: 100, h: 100 });
    m.hover.iniciar();
    m.hover.reevaluar();
    expect(m.cambios).toEqual([false]);
  });

  it("el cursor entra en algo interactivo: captura; sale: suelta", () => {
    const m = mundo();
    m.cajas.set("p", { x: 0, y: 0, w: 100, h: 100 });
    m.hover.iniciar();
    m.hover.mover(50, 50);
    m.hover.mover(60, 60); // sin cambio: no repite
    m.hover.mover(500, 500);
    expect(m.cambios).toEqual([false, true, false]);
  });

  it("un cambio de estado bajo un cursor quieto mantiene la captura si el elemento sigue", () => {
    const m = mundo();
    m.cajas.set("p", { x: 0, y: 0, w: 100, h: 100 });
    m.hover.iniciar();
    m.hover.mover(50, 50);
    m.hover.reevaluar();
    m.hover.reevaluar();
    expect(m.cambios).toEqual([false, true]);
  });

  it("el elemento desaparece bajo un cursor quieto: suelta", () => {
    const m = mundo();
    m.cajas.set("p", { x: 0, y: 0, w: 100, h: 100 });
    m.hover.iniciar();
    m.hover.mover(50, 50);
    m.cajas.delete("p");
    m.hover.reevaluar();
    expect(m.cambios).toEqual([false, true, false]);
  });

  it("aparece algo bajo un cursor quieto con posición conocida: captura", () => {
    const m = mundo();
    m.hover.iniciar();
    m.hover.mover(50, 50);
    m.cajas.set("tarjeta", { x: 0, y: 0, w: 100, h: 100 });
    m.hover.reevaluar();
    expect(m.cambios).toEqual([false, true]);
  });

  it("un Pokémon que camina: se aleja del cursor quieto -> suelta; vuelve a pasar por encima -> captura", () => {
    const m = mundo();
    m.hover.iniciar();
    m.hover.mover(50, 50);
    m.cajas.set("p", { x: 0, y: 0, w: 100, h: 100 });
    m.hover.reevaluar();
    m.cajas.set("p", { x: 200, y: 0, w: 100, h: 100 });
    m.hover.reevaluar();
    m.cajas.set("p", { x: 10, y: 0, w: 100, h: 100 });
    m.hover.reevaluar();
    expect(m.cambios).toEqual([false, true, false, true]);
  });

  it("el cursor sale de la ventana: suelta aunque quedara algo en su última posición", () => {
    const m = mundo();
    m.cajas.set("p", { x: 0, y: 0, w: 100, h: 100 });
    m.hover.iniciar();
    m.hover.mover(50, 50);
    m.hover.salir();
    m.hover.reevaluar();
    expect(m.cambios).toEqual([false, true, false]);
  });

  it("arrastrando captura aunque el cursor no esté sobre nada, y al soltar vuelve a medir", () => {
    const m = mundo();
    m.hover.iniciar();
    m.hover.mover(500, 500);
    m.hover.arrastrando(true);
    m.hover.reevaluar();
    m.hover.arrastrando(false);
    expect(m.cambios).toEqual([false, true, false]);
  });

  it("reenviar vuelve a emitir el valor actual (main pudo perderlo en una carga)", () => {
    const m = mundo();
    m.cajas.set("p", { x: 0, y: 0, w: 100, h: 100 });
    m.hover.iniciar();
    m.hover.mover(50, 50);
    m.hover.reenviar();
    expect(m.cambios).toEqual([false, true, true]);
  });

  it("publica qué raíz está bajo el cursor; un cambio de estado bajo un cursor quieto NO la borra", () => {
    const m = mundo();
    m.cajas.set("p", { x: 0, y: 0, w: 100, h: 100 });
    m.hover.iniciar();
    m.hover.mover(50, 50);
    m.hover.reevaluar();
    m.hover.reevaluar();
    expect(m.raices).toEqual(["p"]);
  });

  it("la raíz pasa a null al irse el cursor, al perder la posición o al desaparecer el elemento", () => {
    const m = mundo();
    m.cajas.set("p", { x: 0, y: 0, w: 100, h: 100 });
    m.hover.iniciar();
    m.hover.mover(50, 50);
    m.hover.mover(500, 500);
    m.hover.mover(50, 50);
    m.hover.salir();
    expect(m.raices).toEqual(["p", null, "p", null]);
    m.hover.mover(50, 50);
    m.cajas.clear();
    m.hover.reevaluar();
    expect(m.raices.slice(-2)).toEqual(["p", null]);
  });

  it("pasar de una raíz a otra publica la nueva sin pasar por null y mantiene la captura", () => {
    const m = mundo();
    m.cajas.set("a", { x: 0, y: 0, w: 100, h: 100 });
    m.hover.iniciar();
    m.hover.mover(50, 50);
    m.cajas.delete("a");
    m.cajas.set("b", { x: 0, y: 0, w: 100, h: 100 });
    m.hover.reevaluar();
    expect(m.raices).toEqual(["a", "b"]);
    expect(m.cambios).toEqual([false, true]);
  });

  it("es idempotente: reevaluar sin cambios no emite nada (sin bucle hover -> DOM -> hover)", () => {
    const m = mundo();
    m.cajas.set("p", { x: 0, y: 0, w: 100, h: 100 });
    m.hover.iniciar();
    m.hover.mover(50, 50);
    const antes = [m.cambios.length, m.raices.length];
    for (let i = 0; i < 5; i++) m.hover.reevaluar();
    expect([m.cambios.length, m.raices.length]).toEqual(antes);
  });

  it("invariante: captura solo si algo interactivo está bajo la última posición", () => {
    const m = mundo();
    let ultimo = false;
    const h = crearHover<string>({
      golpe: (px, py) =>
        [...m.cajas.entries()].find(
          ([, c]) => px >= c.x && px < c.x + c.w && py >= c.y && py < c.y + c.h,
        )?.[0] ?? null,
      alCambiar: (c) => {
        ultimo = c;
      },
    });
    h.iniciar();
    const pasos: Array<[() => void, boolean]> = [
      [() => h.mover(10, 10), false],
      [() => m.cajas.set("a", { x: 0, y: 0, w: 20, h: 20 }), false],
      [() => h.reevaluar(), true],
      [() => m.cajas.clear(), true],
      [() => h.reevaluar(), false],
      [() => h.mover(300, 300), false],
      [() => m.cajas.set("b", { x: 290, y: 290, w: 20, h: 20 }), false],
      [() => h.reevaluar(), true],
      [() => h.salir(), false],
      [() => h.reevaluar(), false],
    ];
    pasos.forEach(([paso, esperado], i) => {
      paso();
      expect(ultimo, `paso ${i}`).toBe(esperado);
    });
  });
});
