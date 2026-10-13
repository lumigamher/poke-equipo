import { CANALES } from "@compartido/tipos";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const oyentes = new Map<string, (e: unknown, ...a: unknown[]) => void>();
vi.mock("electron", () => ({
  ipcMain: {
    on: (canal: string, fn: (e: unknown, ...a: unknown[]) => void) => oyentes.set(canal, fn),
    removeListener: (canal: string) => oyentes.delete(canal),
  },
}));

import { crearReproductor } from "./puente";

function ventanaFalsa() {
  const enviados: { canal: string; datos: unknown }[] = [];
  const cierres: (() => void)[] = [];
  const win = {
    destruida: false,
    isDestroyed() {
      return this.destruida;
    },
    once: (_ev: string, fn: () => void) => cierres.push(fn),
    webContents: {
      send(canal: string, datos?: unknown) {
        if (win.destruida) throw new Error("Object has been destroyed");
        enviados.push({ canal, datos });
      },
    },
  };
  return { win, enviados, cierres };
}

const audio = { muestras: new Float32Array(16000), frecuencia: 16000 };
const resuelto = async (p: Promise<void>) => {
  let listo = false;
  void p.then(() => {
    listo = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  return listo;
};
const fin = (id: number) => oyentes.get(CANALES.reproduccionFin)?.({}, id);

describe("crearReproductor", () => {
  beforeEach(() => {
    oyentes.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("manda el audio con un id y se resuelve cuando llega el fin con ese id", async () => {
    const { win, enviados } = ventanaFalsa();
    const r = crearReproductor(win as never);
    const p = r.reproducir(audio);
    expect(enviados[0].canal).toBe(CANALES.reproducir);
    const id = (enviados[0].datos as { id: number }).id;
    expect(await resuelto(p)).toBe(false);
    fin(id);
    expect(await resuelto(p)).toBe(true);
  });

  it("ignora un fin con otro id", async () => {
    const { win, enviados } = ventanaFalsa();
    const r = crearReproductor(win as never);
    const p = r.reproducir(audio);
    const id = (enviados[0].datos as { id: number }).id;
    fin(id + 99);
    fin("x" as never);
    expect(await resuelto(p)).toBe(false);
    fin(id);
    expect(await resuelto(p)).toBe(true);
  });

  it("detener() avisa al Escenario y resuelve lo pendiente", async () => {
    const { win, enviados } = ventanaFalsa();
    const r = crearReproductor(win as never);
    const p = r.reproducir(audio);
    r.detener();
    expect(enviados.at(-1)?.canal).toBe(CANALES.detener);
    expect(await resuelto(p)).toBe(true);
  });

  it("si la ventana ya está destruida se resuelve sin colgarse", async () => {
    const { win } = ventanaFalsa();
    win.destruida = true;
    const r = crearReproductor(win as never);
    expect(await resuelto(r.reproducir(audio))).toBe(true);
    expect(() => r.detener()).not.toThrow();
  });

  it("si la ventana se cierra a mitad de reproducción se resuelve", async () => {
    const { win, cierres } = ventanaFalsa();
    const r = crearReproductor(win as never);
    const p = r.reproducir(audio);
    win.destruida = true;
    for (const f of cierres) f();
    expect(await resuelto(p)).toBe(true);
  });

  it("si el Escenario nunca avisa, el tiempo límite lo resuelve", async () => {
    const { win } = ventanaFalsa();
    const r = crearReproductor(win as never);
    const p = r.reproducir(audio);
    await vi.advanceTimersByTimeAsync(1000 + 3000);
    expect(await resuelto(p)).toBe(true);
  });
});
