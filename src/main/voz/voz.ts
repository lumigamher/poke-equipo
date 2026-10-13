import type { Audio } from "@compartido/tipos";

export interface Sintetizador {
  generar(texto: string, voz: string, velocidad: number): Audio;
}

export interface Reproductor {
  /** Se resuelve cuando el audio terminó de sonar o fue detenido. */
  reproducir(a: Audio): Promise<void>;
  detener(): void;
}

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** La fila de un dueño: su tanda (sube al callarlo) y cuántas frases suyas faltan por terminar o descartarse. */
interface FilaDueño {
  tanda: number;
  pendientes: number;
}

export class Voz {
  private cola: Promise<void> = Promise.resolve();
  /** Sube con `callar()`: descarta lo de todos. */
  private tanda = 0;
  /** Solo los dueños con frases en fila; se poda cuando la suya queda vacía. */
  private filas = new Map<string, FilaDueño>();
  /** Dueño de lo que suena ahora (null si no tiene); undefined si no suena nada. */
  private sonando: string | null | undefined = undefined;

  constructor(
    private s: Sintetizador,
    private r: Reproductor,
    private alCambiar: (hablando: boolean) => void,
  ) {}

  /** Cuántos dueños tienen frases en fila (para pruebas y diagnóstico). */
  dueñosEnFila(): number {
    return this.filas.size;
  }

  /** Pone la frase en la fila común (se habla de a una). `dueño` permite callarla sin tocar las de otros. */
  decir(texto: string, voz: string, velocidad: number, dueño?: string): Promise<void> {
    const tanda = this.tanda;
    let fila: FilaDueño | undefined;
    if (dueño !== undefined) {
      fila = this.filas.get(dueño) ?? { tanda: 0, pendientes: 0 };
      this.filas.set(dueño, fila);
      fila.pendientes += 1;
    }
    const propia = fila?.tanda ?? 0;
    const vigente = () => tanda === this.tanda && (fila === undefined || fila.tanda === propia);
    const soltar = () => {
      if (fila === undefined || dueño === undefined) return;
      fila.pendientes -= 1;
      if (fila.pendientes === 0 && this.filas.get(dueño) === fila) this.filas.delete(dueño);
    };
    this.cola = this.cola.then(async () => {
      try {
        if (!vigente()) return;
        let audio: Audio;
        try {
          audio = this.s.generar(texto, voz, velocidad);
        } catch (e) {
          // Voz no disponible: la burbuja ya muestra el texto.
          console.warn(`Voz: no se pudo sintetizar: ${mensaje(e)}`);
          return;
        }
        this.sonando = dueño ?? null;
        this.alCambiar(true);
        try {
          await this.r.reproducir(audio);
        } catch (e) {
          console.warn(`Voz: falló la reproducción: ${mensaje(e)}`);
        } finally {
          this.sonando = undefined;
          this.alCambiar(false);
        }
      } finally {
        soltar();
      }
    });
    return this.cola;
  }

  /**
   * Sin dueño corta lo que suena y descarta todo lo que estaba en fila. Con dueño, solo lo de ese dueño: si suena
   * otro, sigue sonando, y la fila de los demás no se toca.
   */
  callar(dueño?: string): void {
    if (dueño === undefined) {
      this.tanda += 1;
      this.r.detener();
      return;
    }
    const fila = this.filas.get(dueño);
    if (fila) fila.tanda += 1;
    if (this.sonando === dueño) this.r.detener();
  }
}
