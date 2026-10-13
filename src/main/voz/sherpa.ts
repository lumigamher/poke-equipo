import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { Audio } from "@compartido/tipos";
import type { Sintetizador } from "./voz";

interface Tts {
  generate(a: { text: string; sid: number; speed: number; enableExternalBuffer: boolean }): {
    samples: Float32Array;
    sampleRate: number;
  };
}
interface Sherpa {
  OfflineTts: new (config: unknown) => Tts;
}

const sherpa = createRequire(import.meta.url)("sherpa-onnx-node") as Sherpa;

/** `voz` es el nombre de la carpeta del modelo Piper dentro de models/. */
export function crearSintetizador(dirModelos: string): Sintetizador {
  const cargadas = new Map<string, Tts>();
  const cargar = (voz: string): Tts => {
    const lista = cargadas.get(voz);
    if (lista) return lista;
    const dir = join(dirModelos, voz);
    const modelo = readdirSync(dir).find((f) => f.endsWith(".onnx"));
    if (!modelo) throw new Error(`No hay modelo de voz en ${dir}`);
    const tts = new sherpa.OfflineTts({
      model: {
        vits: {
          model: join(dir, modelo),
          tokens: join(dir, "tokens.txt"),
          dataDir: join(dir, "espeak-ng-data"),
        },
        debug: false,
        numThreads: 2,
        provider: "cpu",
      },
      maxNumSentences: 1,
    });
    cargadas.set(voz, tts);
    return tts;
  };
  return {
    generar(texto, voz, velocidad): Audio {
      // false: Electron no admite buffers externos.
      const a = cargar(voz).generate({ text: texto, sid: 0, speed: velocidad, enableExternalBuffer: false });
      return { muestras: a.samples, frecuencia: a.sampleRate };
    },
  };
}
