/** Un trozo de voz y dónde empezó: índice de su primera muestra contado desde el último `reiniciar()`. */
export interface Trozo {
  muestras: Float32Array;
  inicio: number;
  /** El pedazo de un trozo largo que se partió y no es el primero: su hora no vale para responder permisos. */
  sinHora?: boolean;
}

export interface Segmentador {
  /** Recibe audio mono a 16 kHz y devuelve los trozos de voz que quedaron completos. */
  alimentar(muestras: Float32Array): Trozo[];
  /** Entrega ya lo que venía oyendo, sin esperar al silencio (fin del dictado). Si falta, no se entrega nada. */
  vaciar?(): Trozo[];
  reiniciar(): void;
  /** True mientras hay voz en curso: ya empezó una frase y el segmentador aún no la entregó. */
  hablando(): boolean;
}

export interface Transcriptor {
  transcribir(muestras: Float32Array): string;
}

/** Lo que devuelve el paso preciso: el texto y cuánto esperó en la cola y calculó (ms), para medir la latencia. */
export interface ResultadoPreciso {
  texto: string;
  esperaMs: number;
  computoMs: number;
}

/** El transcriptor lento y exacto: corre fuera del hilo principal, así que siempre es asíncrono. */
export interface TranscriptorPreciso {
  transcribir(muestras: Float32Array): Promise<ResultadoPreciso>;
}

export type ModeloTranscriptor = "parakeet" | "whisper-turbo";

/**
 * Una frase oída. El texto rápido ya viene; el preciso se calcula (fuera del hilo principal) solo si alguien lo
 * pide, una sola vez por frase. Rechaza si el paso preciso falla; resuelve "" si no entendió nada.
 */
export interface Frase {
  rapido: string;
  preciso(): Promise<string>;
  /** Hora (ms, reloj de pared) en que se capturó la primera muestra de la frase; null si no es confiable. */
  inicioMs: number | null;
  /** Duración del audio de la frase, en ms; ausente si no se conoce (entonces se espera siempre al preciso). */
  duracionMs?: number;
}
