import { describe, expect, it } from "vitest";
import { TOLERANCIA_FUTURO_MS, validarBloqueAudio } from "./bloque-audio";

const AHORA = 1_000_000;
const muestras = new Float32Array(1600);

describe("validarBloqueAudio", () => {
  it("un bloque válido conserva sus muestras y su hora", () => {
    expect(validarBloqueAudio({ muestras, t: AHORA - 20 }, AHORA)).toEqual({
      muestras,
      t: AHORA - 20,
      aviso: null,
    });
  });

  it("una hora NaN se transcribe sin hora", () => {
    const r = validarBloqueAudio({ muestras, t: Number.NaN }, AHORA);
    expect(r).toMatchObject({ muestras, t: null });
    expect((r as { aviso: string | null }).aviso).toBeTruthy();
  });

  it("una hora ausente o de otro tipo se transcribe sin hora", () => {
    expect(validarBloqueAudio({ muestras }, AHORA)).toMatchObject({ muestras, t: null });
    expect(validarBloqueAudio({ muestras, t: "123" }, AHORA)).toMatchObject({ muestras, t: null });
    expect(validarBloqueAudio({ muestras, t: Number.POSITIVE_INFINITY }, AHORA)).toMatchObject({ t: null });
  });

  it("adelantada 49 ms se conserva y adelantada 51 ms pierde la hora", () => {
    expect(TOLERANCIA_FUTURO_MS).toBe(50);
    expect(validarBloqueAudio({ muestras, t: AHORA + 49 }, AHORA)).toMatchObject({ t: AHORA + 49 });
    const r = validarBloqueAudio({ muestras, t: AHORA + 51 }, AHORA);
    expect(r).toMatchObject({ muestras, t: null });
    expect((r as { aviso: string | null }).aviso).toBeTruthy();
  });

  it("sin Float32Array se rechaza, con el tipo en el aviso", () => {
    expect(validarBloqueAudio({ muestras: [1, 2], t: AHORA }, AHORA)).toEqual({
      rechazado: true,
      tipo: "[object Array]",
    });
    expect(validarBloqueAudio(undefined, AHORA)).toMatchObject({ rechazado: true });
    expect(validarBloqueAudio(null, AHORA)).toMatchObject({ rechazado: true });
    expect(validarBloqueAudio(new Float32Array(3), AHORA)).toMatchObject({ rechazado: true });
  });
});
