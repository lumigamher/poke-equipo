import { RAPIDO_MAX_MS } from "./tiempos-voz";
import type { Frase, Segmentador, Transcriptor, TranscriptorPreciso, Trozo } from "./transcriptor";

const FRECUENCIA = 16000;
/** Cuánto audio se recuerda para ubicar en el tiempo el inicio de una frase. */
const MEMORIA_MUESTRAS = 60 * FRECUENCIA;

interface Bloque {
  /** Índice de la primera muestra del bloque, contado desde el último reinicio. */
  indice: number;
  /** Hora (ms) en que se capturó esa primera muestra. */
  inicioMs: number;
}

export interface OpcionesOido {
  /** Recibe una línea de registro por frase con sus tiempos (sin texto). Por defecto, nada. */
  registrar?: (linea: string) => void;
  /** Reloj monótono (ms) para medir el paso rápido. */
  ahora?: () => number;
  /** Programa `fn` dentro de `ms` y devuelve cómo cancelarla (para el tope del paso rápido). Por defecto, setTimeout. */
  programar?: (fn: () => void, ms: number) => () => void;
  /** Avisa cuando empieza (true) o termina (false) la voz en curso, antes de que la frase llegue entera. */
  alVoz?: (hablando: boolean) => void;
  aviso?: (mensaje: string, e: unknown) => void;
  /** Avisa cuando empieza (true) y cuando termina (false) de haber frases transcribiéndose fuera del hilo principal. */
  alTranscribir?: (activo: boolean) => void;
}

const segundos = (muestras: number) => (muestras / FRECUENCIA).toFixed(1).replace(".", ",");

export class Oido {
  private motivos = new Set<string>();
  private bloques: Bloque[] = [];
  private alimentadas = 0;
  private tiempoDesconocido = false;
  private enVoz = false;
  /** Sube con cada reinicio: una frase pedida en otra época ya no se entrega. */
  private epoca = 0;
  private cola: Promise<void> = Promise.resolve();
  private enCurso = 0;

  constructor(
    private seg: Segmentador,
    /** En la app corre en otro proceso (asíncrono); el síncrono queda para las pruebas. */
    private rapido: Transcriptor | TranscriptorPreciso,
    private preciso: TranscriptorPreciso,
    private alFrase: (f: Frase) => void,
    private opciones: OpcionesOido = {},
  ) {}

  get silenciado(): boolean {
    return this.motivos.size > 0;
  }

  /** `t`: hora (ms) en que terminó de capturarse este bloque. Si no es válida, el tiempo queda desconocido. */
  recibir(muestras: Float32Array, t?: number | null): void {
    if (this.silenciado) return;
    this.anotar(muestras.length, t);
    const trozos = this.seg.alimentar(muestras);
    this.avisarVoz(this.seg.hablando());
    this.procesar(trozos);
  }

  /**
   * Entrega ya lo que venía oyendo, sin esperar al silencio, y empieza de cero (fin del dictado). Si alguna frase
   * sigue transcribiéndose fuera del hilo principal, devuelve la promesa que se cumple cuando todas llegaron.
   */
  vaciar(): Promise<void> | null {
    if (this.silenciado) return null;
    this.procesar(this.seg.vaciar?.() ?? []);
    // Empieza de cero sin cambiar de época: lo que está en camino todavía se entrega.
    this.limpiar();
    return this.enCurso > 0 ? this.cola : null;
  }

  private procesar(trozos: Trozo[]): void {
    const ahora = this.opciones.ahora ?? (() => performance.now());
    for (const trozo of trozos) {
      if (this.silenciado) return;
      // La hora se fija ya: cuando el texto llegue (otro proceso), la memoria del audio pudo haber avanzado.
      const inicioMs = this.horaDe(trozo.inicio);
      const t0 = ahora();
      const r = this.rapido.transcribir(trozo.muestras);
      if (typeof r === "string") {
        this.entregar(trozo, r, Math.round(ahora() - t0), inicioMs);
        continue;
      }
      // Fuera del hilo principal: las frases se entregan en el orden en que se oyeron, y lo que se pidió antes de
      // un reinicio (silencio, descarte) ya no cuenta.
      const epoca = this.epoca;
      const rapidoConTope = this.conTope(r);
      this.enCurso += 1;
      if (this.enCurso === 1) this.opciones.alTranscribir?.(true);
      this.cola = this.cola
        .then(() => rapidoConTope)
        .then(
          (res) => {
            if (epoca === this.epoca && !this.silenciado) {
              this.entregar(trozo, res.texto, Math.round(ahora() - t0), inicioMs);
            }
          },
          (e) =>
            this.opciones.aviso?.("Oído: falló o tardó demasiado el paso rápido, se pierde la frase:", e),
        )
        .finally(() => {
          this.enCurso -= 1;
          if (this.enCurso === 0) this.opciones.alTranscribir?.(false);
        });
    }
  }

  /** Rechaza si el paso rápido no responde en RAPIDO_MAX_MS: un proceso colgado no retiene el aviso para siempre. */
  private conTope<T>(r: Promise<T>): Promise<T> {
    const programar =
      this.opciones.programar ??
      ((fn: () => void, ms: number) => {
        const h = setTimeout(fn, ms);
        return () => clearTimeout(h);
      });
    return new Promise<T>((resolver, rechazar) => {
      const cancelar = programar(() => rechazar(new Error("el paso rápido tardó demasiado")), RAPIDO_MAX_MS);
      r.then(
        (v) => {
          cancelar();
          resolver(v);
        },
        (e) => {
          cancelar();
          rechazar(e);
        },
      );
    });
  }

  private entregar(trozo: Trozo, crudo: string, rapidoMs: number, inicioMs: number | null): void {
    const registrar = this.opciones.registrar ?? (() => {});
    const texto = crudo.trim();
    if (!texto) return;
    const cabeza = `Oído: frase de ${segundos(trozo.muestras.length)} s · rápido ${rapidoMs} ms · preciso`;
    let fino: Promise<string> | null = null;
    this.alFrase({
      rapido: texto,
      // Corre fuera del hilo principal y una sola vez por frase; si no entendió nada, resuelve "".
      preciso: () => {
        fino ??= this.preciso.transcribir(trozo.muestras).then(
          (r) => {
            registrar(`${cabeza} ${Math.round(r.computoMs)} ms (espera ${Math.round(r.esperaMs)} ms)`);
            return r.texto.trim();
          },
          (e) => {
            registrar(`${cabeza} falló`);
            throw e;
          },
        );
        return fino;
      },
      inicioMs,
      duracionMs: (trozo.muestras.length / FRECUENCIA) * 1000,
    });
    // Si nadie pidió el paso preciso mientras se manejaba la frase, tampoco se pedirá: se deja constancia.
    if (fino === null) registrar(`${cabeza} no se pidió`);
  }

  private anotar(largo: number, t?: number | null): void {
    if (typeof t === "number" && Number.isFinite(t)) {
      this.bloques.push({ indice: this.alimentadas, inicioMs: t - (largo / FRECUENCIA) * 1000 });
    } else {
      this.tiempoDesconocido = true;
    }
    this.alimentadas += largo;
    // Se olvida lo que el VAD ya no puede devolver, conservando el bloque que cubre el borde de la memoria.
    const limite = this.alimentadas - MEMORIA_MUESTRAS;
    while (this.bloques.length > 1 && this.bloques[1].indice <= limite) this.bloques.shift();
  }

  private horaDe(indice: number): number | null {
    if (this.tiempoDesconocido || !Number.isFinite(indice) || indice < 0) return null;
    let elegido: Bloque | null = null;
    for (const b of this.bloques) {
      if (b.indice <= indice) elegido = b;
      else break;
    }
    if (!elegido || indice < this.alimentadas - MEMORIA_MUESTRAS - 1) return null;
    return elegido.inicioMs + ((indice - elegido.indice) / FRECUENCIA) * 1000;
  }

  private avisarVoz(hablando: boolean): void {
    if (hablando === this.enVoz) return;
    this.enVoz = hablando;
    this.opciones.alVoz?.(hablando);
  }

  private reiniciar(): void {
    this.epoca += 1;
    this.limpiar();
  }

  private limpiar(): void {
    this.seg.reiniciar();
    this.avisarVoz(false);
    this.bloques = [];
    this.alimentadas = 0;
    this.tiempoDesconocido = false;
  }

  /** Tira lo que se venía oyendo (frase a medias) sin cambiar si está silenciado. */
  descartar(): void {
    this.reiniciar();
  }

  /** Cada motivo ("voz", "usuario") se enciende y apaga por separado. */
  silenciar(motivo: string, activo: boolean): void {
    if (activo) this.motivos.add(motivo);
    else this.motivos.delete(motivo);
    this.reiniciar();
  }
}
