import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crearSegmentador, crearTranscriptor } from "./sherpa";

const raiz = join(__dirname, "..", "..", "..");
const modelos = join(raiz, "models");
const audio = join(raiz, "spikes", "grabaciones", "frases.wav");
const hayTodo =
  existsSync(audio) &&
  existsSync(join(modelos, "silero_vad.onnx")) &&
  existsSync(join(modelos, "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8")) &&
  existsSync(join(modelos, "sherpa-onnx-whisper-turbo"));
// Carga modelos reales y tarda cerca de un minuto: solo con `bun run test:integracion`.
const integracion = process.env.INTEGRACION === "1";

describe.skipIf(!hayTodo || !integracion)(
  "transcriptores con la voz de la persona (referencia de la etapa 0)",
  () => {
    it("Parakeet es rápido y Whisper turbo escribe mejor, dentro de los tiempos medidos", () => {
      const sherpa = createRequire(import.meta.url)("sherpa-onnx-node");
      const onda = sherpa.readWave(audio, false) as { samples: Float32Array; sampleRate: number };
      expect(onda.sampleRate).toBe(16000);

      const seg = crearSegmentador(modelos);
      const crudos: { muestras: Float32Array; inicio: number }[] = [];
      for (let i = 0; i < onda.samples.length; i += 1600) {
        crudos.push(...seg.alimentar(onda.samples.subarray(i, Math.min(i + 1600, onda.samples.length))));
      }
      crudos.push(...seg.alimentar(new Float32Array(16000)));
      const trozos = crudos.map((c) => c.muestras);
      // El inicio cuenta muestras alimentadas desde el reinicio: la grabación empieza con una pausa.
      const alimentadas = onda.samples.length + 16000;
      expect(crudos[0].inicio).toBeGreaterThan(0);
      for (const c of crudos) expect(c.inicio + c.muestras.length).toBeLessThanOrEqual(alimentadas);
      // Y es exacto: las muestras del trozo son las de la grabación a partir de ese índice.
      const primero = crudos[0];
      expect(Array.from(primero.muestras.subarray(0, 200))).toEqual(
        Array.from(onda.samples.subarray(primero.inicio, primero.inicio + 200)),
      );
      expect(trozos.length).toBeGreaterThan(0);
      // Whisper no admite más de 30 s por trozo.
      for (const t of trozos) expect(t.length).toBeLessThanOrEqual(26 * 16000);
      const segundosVoz = trozos.reduce((s, t) => s + t.length, 0) / 16000;

      const medir = (modelo: "parakeet" | "whisper-turbo") => {
        const tr = crearTranscriptor(modelo, modelos);
        tr.transcribir(new Float32Array(16000));
        const t0 = Date.now();
        const texto = trozos
          .map((t) => tr.transcribir(t))
          .join(" ")
          .toLowerCase();
        return { texto, porSegundo: (Date.now() - t0) / 1000 / segundosVoz };
      };

      const rapido = medir("parakeet");
      const preciso = medir("whisper-turbo");

      console.info(
        `[integracion] cómputo por segundo de voz: parakeet ${rapido.porSegundo.toFixed(3)} s, whisper-turbo ${preciso.porSegundo.toFixed(3)} s`,
      );
      // La referencia de velocidad vive en config/transcriptor.json y es solo informativa.

      expect(rapido.texto).toContain("pikachu");
      expect(rapido.texto).toContain("migraci");
      // Lo que Parakeet escribía mal y Whisper escribe bien.
      expect(preciso.texto).toContain("squirtle");
      expect(preciso.texto).toMatch(/corre los tests?/);
      expect(preciso.texto).toContain("cancela eso");
    }, 300_000);

    it("el segmentador no devuelve trozos a medias después de reiniciar", () => {
      const sherpa = createRequire(import.meta.url)("sherpa-onnx-node");
      const onda = sherpa.readWave(audio, false) as { samples: Float32Array };
      // La grabación empieza con una pausa: se busca hasta dónde llega la primera frase y se corta
      // 0,3 s antes de que el segmentador la cierre (cierra tras 0,6 s de silencio), con la frase aún abierta.
      const sonda = crearSegmentador(modelos);
      let cierre = -1;
      for (let i = 0; i < onda.samples.length && cierre < 0; i += 1600) {
        const fin = Math.min(i + 1600, onda.samples.length);
        if (sonda.alimentar(onda.samples.subarray(i, fin)).length > 0) cierre = fin;
      }
      expect(cierre).toBeGreaterThan(16000);
      const voz = onda.samples.subarray(0, cierre - 4800);
      const silencio = () => new Float32Array(16000 * 2);

      // Control: la misma voz seguida de silencio SIN reiniciar sí produce un trozo.
      const control = crearSegmentador(modelos);
      const conVoz = [...control.alimentar(voz), ...control.alimentar(silencio())];
      expect(conVoz.length).toBeGreaterThan(0);

      // Con reiniciar() entre la voz y el silencio no sale nada: se descartó el trozo a medias.
      const seg = crearSegmentador(modelos);
      seg.alimentar(voz);
      seg.reiniciar();
      expect(seg.alimentar(silencio())).toEqual([]);

      // Tras un reinicio el índice vuelve a contar desde cero (4 s de silencio, luego voz, luego silencio).
      seg.reiniciar();
      const previo = new Float32Array(16000 * 4);
      seg.alimentar(previo);
      const tras = [...seg.alimentar(voz), ...seg.alimentar(silencio())];
      expect(tras.length).toBeGreaterThan(0);
      const t = tras[0];
      expect(t.inicio).toBeGreaterThanOrEqual(previo.length);
      expect(Array.from(t.muestras.subarray(0, 200))).toEqual(
        Array.from(voz.subarray(t.inicio - previo.length, t.inicio - previo.length + 200)),
      );
    });
  },
);
