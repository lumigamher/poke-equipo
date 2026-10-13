import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crearSintetizador } from "./sherpa";

const modelos = join(__dirname, "..", "..", "..", "models");
const voz = "vits-piper-es_MX-claude-high-int8";
const hayModelo = existsSync(join(modelos, voz));
// Carga el modelo real: solo con `bun run test:integracion`.
const integracion = process.env.INTEGRACION === "1";

describe.skipIf(!hayModelo || !integracion)("sintetizador Piper real", () => {
  it("genera muestras de audio a 22050 Hz", () => {
    const audio = crearSintetizador(modelos).generar("hola", voz, 1.1);
    expect(audio.muestras.length).toBeGreaterThan(0);
    expect(audio.frecuencia).toBe(22050);
  });
});
