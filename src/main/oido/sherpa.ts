import { createRequire } from "node:module";
import { join } from "node:path";
import { SILENCIO_FIN_FRASE_S, VOZ_MINIMA_S } from "./tiempos-voz";
import type { ModeloTranscriptor, Segmentador, Transcriptor, Trozo } from "./transcriptor";

interface Flujo {
  acceptWaveform(a: { sampleRate: number; samples: Float32Array }): void;
}
interface Reconocedor {
  createStream(): Flujo;
  decode(f: Flujo): void;
  getResult(f: Flujo): { text: string };
}
interface Vad {
  acceptWaveform(m: Float32Array): void;
  isEmpty(): boolean;
  flush(): void;
  front(externo: boolean): { start: number; samples: Float32Array };
  pop(): void;
  reset(): void;
  isDetected(): boolean;
}
interface Sherpa {
  OfflineRecognizer: new (config: unknown) => Reconocedor;
  Vad: new (config: unknown, segundos: number) => Vad;
}

const sherpa = createRequire(import.meta.url)("sherpa-onnx-node") as Sherpa;
const VENTANA = 512;
const MINIMO = 16000 * 0.3;

export function crearSegmentador(dirModelos: string): Segmentador {
  const vad = new sherpa.Vad(
    {
      sileroVad: {
        model: join(dirModelos, "silero_vad.onnx"),
        threshold: 0.5,
        minSpeechDuration: VOZ_MINIMA_S,
        minSilenceDuration: SILENCIO_FIN_FRASE_S,
        // Whisper no admite más de 30 s por trozo.
        maxSpeechDuration: 25,
        windowSize: VENTANA,
      },
      sampleRate: 16000,
      debug: false,
      numThreads: 1,
    },
    60,
  );
  let resto = new Float32Array(0);
  const sacar = (listos: Trozo[]) => {
    while (!vad.isEmpty()) {
      // false: Electron no admite buffers externos.
      const delante = vad.front(false);
      const trozo = Float32Array.from(delante.samples);
      vad.pop();
      // `start` cuenta las muestras que el VAD recibió desde su último reset: las mismas que se han alimentado.
      if (trozo.length >= MINIMO) listos.push({ muestras: trozo, inicio: delante.start });
    }
  };
  return {
    alimentar(muestras) {
      const todo = new Float32Array(resto.length + muestras.length);
      todo.set(resto);
      todo.set(muestras, resto.length);
      const listos: Trozo[] = [];
      let i = 0;
      for (; i + VENTANA <= todo.length; i += VENTANA) {
        vad.acceptWaveform(todo.subarray(i, i + VENTANA));
        sacar(listos);
      }
      resto = todo.slice(i);
      return listos;
    },
    vaciar() {
      const listos: Trozo[] = [];
      vad.flush();
      sacar(listos);
      return listos;
    },
    hablando: () => vad.isDetected(),
    reiniciar() {
      vad.reset();
      resto = new Float32Array(0);
    },
  };
}

function configuracion(modelo: ModeloTranscriptor, dirModelos: string): unknown {
  const base = { featConfig: { sampleRate: 16000, featureDim: 80 } };
  if (modelo === "parakeet") {
    const dir = join(dirModelos, "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8");
    return {
      ...base,
      modelConfig: {
        transducer: {
          encoder: join(dir, "encoder.int8.onnx"),
          decoder: join(dir, "decoder.int8.onnx"),
          joiner: join(dir, "joiner.int8.onnx"),
        },
        tokens: join(dir, "tokens.txt"),
        numThreads: 4,
        provider: "cpu",
        debug: 0,
        modelType: "nemo_transducer",
      },
    };
  }
  const dir = join(dirModelos, "sherpa-onnx-whisper-turbo");
  return {
    ...base,
    modelConfig: {
      whisper: {
        encoder: join(dir, "turbo-encoder.int8.onnx"),
        decoder: join(dir, "turbo-decoder.int8.onnx"),
        language: "es",
        task: "transcribe",
      },
      tokens: join(dir, "turbo-tokens.txt"),
      numThreads: 4,
      provider: "cpu",
      debug: 0,
    },
  };
}

export function crearTranscriptor(modelo: ModeloTranscriptor, dirModelos: string): Transcriptor {
  const rec = new sherpa.OfflineRecognizer(configuracion(modelo, dirModelos));
  return {
    transcribir(muestras) {
      const flujo = rec.createStream();
      flujo.acceptWaveform({ sampleRate: 16000, samples: muestras });
      rec.decode(flujo);
      return rec.getResult(flujo).text.trim();
    },
  };
}
