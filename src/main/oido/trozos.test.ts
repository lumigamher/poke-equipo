import { describe, expect, it } from "vitest";
import { partirTrozo } from "./trozos";

const tr = (n: number, inicio = 0) => ({ muestras: Float32Array.from({ length: n }, (_, i) => i), inicio });

describe("partirTrozo", () => {
  it("deja igual un trozo que cabe en el tope", () => {
    const t = tr(100, 7);
    expect(partirTrozo(t, 100)).toEqual([t]);
  });

  it("parte en pedazos parejos que no pasan el tope y no pierden ni repiten muestras", () => {
    const pedazos = partirTrozo(tr(250, 1000), 100);
    expect(pedazos.map((p) => p.muestras.length)).toEqual([84, 84, 82]);
    expect(pedazos.map((p) => p.inicio)).toEqual([1000, 1084, 1168]);
    const unidos = pedazos.flatMap((p) => [...p.muestras]);
    expect(unidos).toEqual([...tr(250).muestras]);
  });

  it("solo el primer pedazo conserva la hora: los demás no pueden responder permisos", () => {
    const pedazos = partirTrozo(tr(250), 100);
    expect(pedazos.map((p) => p.sinHora ?? false)).toEqual([false, true, true]);
  });

  it("un trozo que ya venía sin hora deja sin hora todos sus pedazos", () => {
    const pedazos = partirTrozo({ ...tr(250), sinHora: true }, 100);
    expect(pedazos.every((p) => p.sinHora)).toBe(true);
  });

  it("con un tope inválido no parte nada", () => {
    const t = tr(10);
    expect(partirTrozo(t, 0)).toEqual([t]);
    expect(partirTrozo(t, Number.NaN)).toEqual([t]);
  });
});
