import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buscarLlamado } from "./nombres";
import { Oido } from "./oido";
import { crearSegmentador, crearTranscriptor } from "./sherpa";
import type { Frase } from "./transcriptor";

const raiz = join(__dirname, "..", "..", "..");
const modelos = join(raiz, "models");
const audio = join(raiz, "spikes", "grabaciones", "frases.wav");
const fondo = join(raiz, "spikes", "grabaciones", "fondo.wav");
const integracion = process.env.INTEGRACION === "1";
const hayTodo =
  existsSync(audio) && existsSync(fondo) && existsSync(join(modelos, "sherpa-onnx-whisper-turbo"));

const candidatos = [
  { id: "pikachu", nombre: "Pikachu", apodos: [] },
  { id: "charmander", nombre: "Charmander", apodos: ["sharmander", "sarmander"] },
  { id: "squirtle", nombre: "Squirtle", apodos: ["squirrel", "squarrel", "squarel", "squarton"] },
  {
    id: "bulbasaur",
    nombre: "Bulbasaur",
    apodos: ["bulbasar", "bulvasar", "bolvasar", "vuelvaso", "vuelvas"],
  },
];

function oir(archivo: string): Frase[] {
  const sherpa = createRequire(import.meta.url)("sherpa-onnx-node");
  const onda = sherpa.readWave(archivo, false) as { samples: Float32Array };
  const frases: Frase[] = [];
  // En la app el preciso corre en otro proceso; aquí se usa en línea con la misma forma asíncrona.
  const whisper = crearTranscriptor("whisper-turbo", modelos);
  const oido = new Oido(
    crearSegmentador(modelos),
    crearTranscriptor("parakeet", modelos),
    { transcribir: async (m) => ({ texto: whisper.transcribir(m), esperaMs: 0, computoMs: 0 }) },
    (f) => frases.push(f),
  );
  for (let i = 0; i < onda.samples.length; i += 1600) {
    oido.recibir(onda.samples.subarray(i, Math.min(i + 1600, onda.samples.length)));
  }
  oido.recibir(new Float32Array(16000));
  return frases;
}

describe.skipIf(!hayTodo || !integracion)("llamados con la voz de la persona", () => {
  it("el paso rápido detecta los llamados y el preciso deja la orden legible", async () => {
    const llamadas = oir(audio).filter((f) => buscarLlamado(f.rapido, candidatos));
    // La persona no hizo pausas, así que varios llamados caen en un mismo trozo.
    expect(llamadas.length).toBeGreaterThanOrEqual(1);
    const finos = await Promise.all(llamadas.map((f) => f.preciso()));
    expect(finos.join(" ").toLowerCase()).toMatch(/corre los tests?/);
    // El nombre también se reconoce sobre el texto de Whisper.
    expect(finos.some((t) => buscarLlamado(t, candidatos))).toBe(true);
  }, 300_000);

  it("en 2 min 38 s de habla sin llamar a nadie, no hay ningún llamado", () => {
    expect(oir(fondo).filter((f) => buscarLlamado(f.rapido, candidatos))).toEqual([]);
  }, 300_000);
});
