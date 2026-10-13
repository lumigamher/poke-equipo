import {
  type AccionPreparacion,
  type EstadoPreparacion,
  formatearBytes,
  type ProgresoVista,
} from "@compartido/preparacion";
import { ErrorDescarga } from "../descarga/descargar";
import { ejecutarPasos, type Paso, type ProgresoPasos, pasosPendientes } from "../descarga/pasos";

/** Por cada byte que se baja hace falta sitio para el paquete y para lo descomprimido (unas 2,2 veces). */
const FACTOR_ESPACIO = 2.2;
/** Cada cuánto, como mucho, se le avisa a la pantalla del avance de un mismo archivo. */
const INTERVALO_AVANCE_MS = 100;

export interface DepsPreparacion {
  pasos: Paso[];
  alEstado(estado: EstadoPreparacion): void;
  /** Bytes libres donde se va a escribir; null si no se sabe (no se bloquea por eso). */
  espacioLibre?(): Promise<number | null>;
  ahora?(): number;
}

export interface Preparacion {
  /** "listo" enseguida si no falta nada; si falta, muestra la pantalla y espera a que termine o la persona salga. */
  preparar(): Promise<"listo" | "salir">;
  /** Lo que la persona pidió en la pantalla. */
  accion(accion: AccionPreparacion): void;
  /** Lo último que se mostró; para quien abre la pantalla tarde. */
  estado(): EstadoPreparacion | null;
}

/** Qué pasó y qué puede hacer la persona, en el tono de la app. */
export function mensajeDeError(e: unknown): string {
  if (e instanceof ErrorDescarga) {
    switch (e.tipo) {
      case "red":
        return `${e.message} Revisa tu conexión a internet y pulsa «Reintentar»: se sigue desde donde se quedó.`;
      case "http":
        return `${e.message} Suele ser pasajero: pulsa «Reintentar» en un rato.`;
      case "disco":
        return `${e.message} Libera espacio en el disco y pulsa «Reintentar».`;
      case "integridad":
        return `${e.message} Pulsa «Reintentar» para bajarlo de nuevo.`;
      case "cancelada":
        return e.message;
    }
  }
  return `Algo falló al preparar el equipo: ${e instanceof Error ? e.message : String(e)}. Pulsa «Reintentar».`;
}

const aVista = (p: ProgresoPasos): ProgresoVista => ({
  total: p.total,
  hechos: p.hechos,
  lineas: p.pasos.map((x) => ({ etiqueta: x.etiqueta, bytes: x.bytes, hechos: x.hechos, estado: x.estado })),
});

/**
 * La máquina de la pantalla de preparación. No sabe de ventanas ni de red: recibe pasos y avisa estados.
 * Reanudar es volver a empezar: los pasos ya terminados se saltan y las descargas parciales continúan con Range.
 */
export function crearPreparacion(deps: DepsPreparacion): Preparacion {
  const ahora = deps.ahora ?? Date.now;
  let actual: EstadoPreparacion | null = null;
  let pendientes: Paso[] = [];
  let control: AbortController | null = null;
  let corriendo = false;
  let ultimoProgreso: ProgresoVista | null = null;
  let alTerminar: ((r: "listo" | "salir") => void) | null = null;

  const emitir = (e: EstadoPreparacion) => {
    actual = e;
    deps.alEstado(e);
  };

  async function correr(): Promise<void> {
    corriendo = true;
    control = new AbortController();
    try {
      pendientes = await pasosPendientes(deps.pasos);
      const total = pendientes.reduce((s, p) => s + p.bytes, 0);
      const libre = (await deps.espacioLibre?.()) ?? null;
      const necesario = Math.ceil(total * FACTOR_ESPACIO);
      if (libre !== null && libre < necesario) {
        emitir({
          fase: "error",
          progreso: ultimoProgreso,
          mensaje: `Falta espacio en el disco: hacen falta unos ${formatearBytes(necesario)} libres y hay ${formatearBytes(libre)}. Libera espacio y pulsa «Reintentar».`,
        });
        return;
      }
      let ultimaFirma = "";
      let ultimoAviso = 0;
      await ejecutarPasos(pendientes, {
        señal: control.signal,
        alProgreso: (p) => {
          ultimoProgreso = aVista(p);
          // El avance de un mismo archivo se limita; un cambio de archivo o de estado pasa siempre.
          const firma = p.pasos.map((x) => x.estado).join("|");
          const t = ahora();
          if (firma === ultimaFirma && t - ultimoAviso < INTERVALO_AVANCE_MS) return;
          ultimaFirma = firma;
          ultimoAviso = t;
          emitir({ fase: "bajando", progreso: ultimoProgreso });
        },
      });
      emitir({ fase: "listo" });
      alTerminar?.("listo");
      alTerminar = null;
    } catch (e) {
      const progreso = ultimoProgreso;
      if (e instanceof ErrorDescarga && e.tipo === "cancelada" && progreso) {
        emitir({ fase: "pausada", progreso });
      } else {
        emitir({ fase: "error", progreso, mensaje: mensajeDeError(e) });
      }
    } finally {
      corriendo = false;
      control = null;
    }
  }

  return {
    estado: () => actual,
    async preparar() {
      pendientes = await pasosPendientes(deps.pasos);
      if (pendientes.length === 0) return "listo";
      emitir({
        fase: "inicio",
        total: pendientes.reduce((s, p) => s + p.bytes, 0),
        lineas: pendientes.map((p) => ({ etiqueta: p.etiqueta, bytes: p.bytes, fuente: p.fuente })),
      });
      return new Promise((resolver) => {
        alTerminar = resolver;
      });
    },
    accion(accion) {
      if (accion === "empezar") {
        if (corriendo || actual === null || actual.fase === "listo") return;
        void correr();
      } else if (accion === "cancelar") {
        if (corriendo) control?.abort();
      } else {
        // Salir: se corta lo que corra (lo bajado queda) y la app decide qué hacer sin modelos.
        control?.abort();
        alTerminar?.("salir");
        alTerminar = null;
      }
    },
  };
}
