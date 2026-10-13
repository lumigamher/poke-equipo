/**
 * La pantalla "Preparando a tu equipo" del primer arranque: lo que main le cuenta al renderer y lo que el renderer
 * le pide a main. Sin lógica de red aquí; esa vive en src/descarga y src/main/preparacion.ts.
 */

/** Una cosa que se va a bajar, tal como se le explica a la persona. */
export interface LineaPlan {
  etiqueta: string;
  bytes: number;
  /** De dónde sale ("github.com/k2-fsa/sherpa-onnx (releases)"). */
  fuente: string;
}

export type EstadoLinea = "pendiente" | "bajando" | "listo" | "error";

export interface LineaProgreso {
  etiqueta: string;
  bytes: number;
  hechos: number;
  estado: EstadoLinea;
}

export interface ProgresoVista {
  total: number;
  hechos: number;
  lineas: LineaProgreso[];
}

export type EstadoPreparacion =
  /** Explica qué va a bajar y espera un clic. */
  | { fase: "inicio"; lineas: LineaPlan[]; total: number }
  | { fase: "bajando"; progreso: ProgresoVista }
  /** La persona canceló: lo bajado se conserva y se puede reanudar. */
  | { fase: "pausada"; progreso: ProgresoVista }
  /** Algo falló; `mensaje` explica qué y qué hacer. Reintentar continúa donde se quedó. */
  | { fase: "error"; mensaje: string; progreso: ProgresoVista | null }
  | { fase: "listo" };

export type AccionPreparacion = "empezar" | "cancelar" | "salir";

export const ACCIONES_PREPARACION: readonly AccionPreparacion[] = ["empezar", "cancelar", "salir"];

/** Lo que llega por IPC no se cree: solo se aceptan las tres acciones conocidas. */
export const validarAccionPreparacion = (dato: unknown): AccionPreparacion | null =>
  ACCIONES_PREPARACION.find((a) => a === dato) ?? null;

/** "1,17 GB", "487 MB", "643 KB": unidades decimales, coma decimal. */
export function formatearBytes(bytes: number): string {
  const unidades: [number, string][] = [
    [1e9, "GB"],
    [1e6, "MB"],
    [1e3, "KB"],
  ];
  for (const [factor, nombre] of unidades) {
    if (bytes >= factor) {
      const valor = bytes / factor;
      const texto = valor >= 100 ? valor.toFixed(0) : valor >= 10 ? valor.toFixed(1) : valor.toFixed(2);
      return `${texto.replace(".", ",").replace(/,?0+$/, (m) => (m.startsWith(",") ? "" : m))} ${nombre}`;
    }
  }
  return `${Math.max(0, Math.round(bytes))} B`;
}

/** 0 a 100, entero; con total 0 devuelve 0. */
export const porcentaje = (hechos: number, total: number): number =>
  total <= 0 ? 0 : Math.max(0, Math.min(100, Math.floor((hechos / total) * 100)));
