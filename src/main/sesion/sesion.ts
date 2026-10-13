import type { Pendiente } from "./pendientes";

export type EventoSesion =
  | { tipo: "iniciada"; sessionId: string }
  | { tipo: "permiso"; id: string; herramienta: string; detalle: string }
  | { tipo: "respuesta"; texto: string; contextoUsado: number }
  | { tipo: "error"; mensaje: string }
  | { tipo: "tests"; resultado: "paso" | "fallo" }
  /** Cuánto va usado del límite de la sesión del plan (la ventana de 5 horas), de 0 a 100. */
  | { tipo: "limite"; usado: number; reinicia?: string }
  /** La lista de tareas que Claude Code lleva para sí mismo cambió. */
  | { tipo: "pendientes"; lista: Pendiente[] }
  | {
      tipo: "actividad";
      clase: "pensando" | "herramienta" | "respondiendo";
      herramienta?: string;
      detalle?: string;
      /** Si lo hace un subagente: el id de la llamada que lo lanzó. Sin él, lo hace el Pokémon mismo. */
      ayudante?: string;
      /** Solo en herramientas: el detalle más completo (el de `detalle` va recortado para el rótulo corto). */
      completo?: string;
    }
  /**
   * Texto del agente principal mientras se escribe: lo que dice o piensa, ACUMULADO hasta ahora. Llega muchas veces
   * con la misma `clave` (cada trocito) y una última con `final`. Alimenta el registro en vivo de la burbuja.
   */
  | {
      tipo: "flujo";
      clave: string;
      clase: "texto" | "pensando";
      texto: string;
      final: boolean;
      /** Si lo dice un subagente: el id de la llamada que lo lanzó (llega completo, no en trocitos). */
      ayudante?: string;
    }
  /** Un subagente empieza (con su encargo) o termina. `id` es el de la llamada Agent/Task que lo lanzó. */
  | { tipo: "ayudante"; id: string; fase: "inicio" | "fin"; encargo?: string };

export interface Sesion {
  enviar(texto: string): void;
  resolverPermiso(id: string, permitir: boolean): void;
  cerrar(): void;
  alEvento(fn: (e: EventoSesion) => void): void;
  /** Detiene el turno en curso sin cerrar la sesión: la conversación sigue y acepta otra orden. */
  interrumpir?(): void;
  /** Cambia el modelo de la sesión en curso (no sobrevive a un reinicio de la app). */
  cambiarModelo?(modelo: string): Promise<void>;
  /** Los comandos con barra que ofrece Claude Code en esta sesión. */
  comandos?(): Promise<{ nombre: string; descripcion: string; argumento: string }[]>;
}

export interface OpcionesSesion {
  carpeta: string;
  sessionId: string | null;
  /** Texto que se agrega al prompt de sistema de Claude Code. */
  rol: string;
  /** Modelo de la sesión (lo fija el tipo del Pokémon); sin él, opus. */
  modelo?: string;
  /** Herramientas del equipo que Claude Code puede usar en esta sesión; sin ellas, ninguna. */
  herramientas?: HerramientasEquipo;
}

/**
 * Lo que la sesión de un Pokémon puede pedirle al equipo. Es el respaldo de la voz: si la orden de llamar a otro
 * llega a Claude Code como texto (porque el nombre se transcribió mal), él mismo lo llama con esta herramienta.
 */
export interface HerramientasEquipo {
  /** Saca a otro Pokémon (o le pasa un encargo si ya está en pantalla). Devuelve en una frase qué pasó. */
  llamar(especie: string, encargo: string): string;
  /** Saca a los Pokémon que trabajan en un proyecto ("saca el equipo Acme"). Devuelve qué pasó. */
  sacarEquipo(proyecto: string): string;
}

export type FabricaSesion = (o: OpcionesSesion) => Sesion;
