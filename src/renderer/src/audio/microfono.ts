/** Un bloque de 100 ms y la hora (Date.now()) en que el worklet lo completó. */
export interface BloqueCapturado {
  muestras: Float32Array;
  t: number;
}

interface Captura {
  ctx: AudioContext;
  nodo: AudioWorkletNode;
  pausar(v: boolean): void;
}

/** Contexto a 16 kHz con el worklet que junta bloques de 100 ms; falta conectarle una fuente. */
async function abrirCaptura(alAudio: (b: BloqueCapturado) => void): Promise<Captura> {
  const ctx = new AudioContext({ sampleRate: 16000 });
  await ctx.audioWorklet.addModule(new URL("captura-worklet.js", document.baseURI).href);
  const nodo = new AudioWorkletNode(ctx, "captura");
  nodo.port.onmessage = (e: MessageEvent<BloqueCapturado>) => alAudio(e.data);
  // El nodo no escribe salida: conectarlo al destino solo sirve para que el navegador lo mantenga corriendo.
  nodo.connect(ctx.destination);
  return {
    ctx,
    nodo,
    pausar(v) {
      void (v ? ctx.suspend() : ctx.resume());
    },
  };
}

/** Abre el micrófono a 16 kHz mono y entrega bloques de 100 ms. Lanza si no hay micrófono o permiso. */
export async function abrirMicrofono(
  alAudio: (b: BloqueCapturado) => void,
): Promise<{ pausar(v: boolean): void }> {
  const flujo = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const { ctx, nodo, pausar } = await abrirCaptura(alAudio);
  ctx.createMediaStreamSource(flujo).connect(nodo);
  return { pausar };
}

/** Lo que el banco de pruebas llama por CDP en `window.__micFalso`. */
export interface MicFalso {
  /** Reproduce un audio (bytes de un WAV u otro formato que el navegador decodifique); resuelve al terminar con su duración en s. */
  reproducir(datos: ArrayBuffer): Promise<number>;
  /** Estado del contexto: "suspended" mientras la app tiene el micrófono cerrado (un Pokémon hablando o escucha apagada). */
  estado(): AudioContextState;
}

/**
 * Micrófono falso del banco de pruebas (solo desarrollo): NUNCA abre el micrófono real. Entrega silencio
 * continuo y, encima, lo que el banco reproduzca, por el mismo worklet y con la misma pausa que el real.
 * Con la captura pausada el audio en curso se congela y sigue al reanudar (el real lo perdería).
 */
export async function abrirMicrofonoFalso(
  alAudio: (b: BloqueCapturado) => void,
): Promise<{ pausar(v: boolean): void; falso: MicFalso }> {
  const { ctx, nodo, pausar } = await abrirCaptura(alAudio);
  const silencio = new ConstantSourceNode(ctx, { offset: 0 });
  silencio.connect(nodo);
  silencio.start();
  const falso: MicFalso = {
    async reproducir(datos) {
      const buffer = await ctx.decodeAudioData(datos);
      const fuente = new AudioBufferSourceNode(ctx, { buffer });
      fuente.connect(nodo);
      const fin = new Promise<void>((r) => {
        fuente.onended = () => r();
      });
      fuente.start();
      await fin;
      fuente.disconnect();
      return buffer.duration;
    },
    estado: () => ctx.state,
  };
  return { pausar, falso };
}
