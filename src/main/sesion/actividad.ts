import type { EventoSesion } from "./sesion";

const MAXIMO_DETALLE = 120;
/** Lo que se guarda para el registro en vivo: más que el rótulo corto, pero acotado. */
const MAXIMO_COMPLETO = 400;
const CAMPOS_DETALLE = ["command", "file_path", "pattern", "query", "description"] as const;

const MAXIMO_PENSAMIENTO = 160;

/** Recorta a `max` y, si cortó, lo dice con «…» para que no parezca un error. */
function recortar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

/** Un pensamiento en una línea: sin saltos ni marcas de markdown, recortado; nada si viene vacío u oculto. */
function conDetalle(texto: unknown): { detalle?: string } {
  if (typeof texto !== "string") return {};
  const limpio = texto
    // La línea que se dice en voz alta no es un pensamiento.
    .replace(/\bVOZ:[\s\S]*$/, "")
    .replace(/[`*_#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!limpio) return {};
  return {
    detalle: limpio.length > MAXIMO_PENSAMIENTO ? `${limpio.slice(0, MAXIMO_PENSAMIENTO - 1)}…` : limpio,
  };
}

/** Traduce un bloque de contenido de un mensaje del asistente a un evento de actividad (o null si no aplica). */
export function actividadDeBloque(bloque: unknown): Extract<EventoSesion, { tipo: "actividad" }> | null {
  if (!bloque || typeof bloque !== "object") return null;
  const b = bloque as { type?: unknown; name?: unknown; input?: unknown; thinking?: unknown; text?: unknown };
  // Lo que piensa y lo que va diciendo entre herramienta y herramienta se muestra junto al Pokémon.
  if (b.type === "thinking") return { tipo: "actividad", clase: "pensando", ...conDetalle(b.thinking) };
  if (b.type === "text") return { tipo: "actividad", clase: "respondiendo", ...conDetalle(b.text) };
  if (b.type === "tool_use") {
    const evento: Extract<EventoSesion, { tipo: "actividad" }> = {
      tipo: "actividad",
      clase: "herramienta",
      herramienta: String(b.name ?? ""),
    };
    const input = b.input && typeof b.input === "object" ? (b.input as Record<string, unknown>) : {};
    for (const campo of CAMPOS_DETALLE) {
      const valor = input[campo];
      if (typeof valor === "string" && valor) {
        evento.detalle = recortar(valor, MAXIMO_DETALLE);
        // Solo si el rótulo corto se quedó corto: si no, `detalle` ya es todo.
        if (valor.length > MAXIMO_DETALLE) evento.completo = recortar(valor, MAXIMO_COMPLETO);
        break;
      }
    }
    return evento;
  }
  return null;
}

const LANZA_AYUDANTE = new Set(["Agent", "Task"]);
const MAXIMO_ENCARGO = 60;

/** Subagentes en curso (por el id de la llamada que los lanzó) y cuáles de ellos corren de fondo. */
export interface Ayudantes {
  activos: Set<string>;
  fondo: Set<string>;
}

export function sinAyudantes(): Ayudantes {
  return { activos: new Set(), fondo: new Set() };
}

/**
 * Los eventos de un mensaje de la sesión, separando lo que hace el Pokémon de lo que hacen sus subagentes.
 * Un subagente empieza cuando se ve su llamada Agent/Task (o el aviso `task_started`, o su primera actividad) y
 * termina con el resultado de esa llamada; si corre de fondo, ese resultado llega enseguida y no cuenta: termina
 * con el aviso `task_notification`. Lo que un subagente hace llega marcado con `ayudante`. `a` se va actualizando.
 */
export function eventosDeMensaje(m: Record<string, unknown>, a: Ayudantes): EventoSesion[] {
  const eventos: EventoSesion[] = [];
  const abrir = (id: string, encargo: unknown) => {
    if (a.activos.has(id)) return;
    a.activos.add(id);
    eventos.push({
      tipo: "ayudante",
      id,
      fase: "inicio",
      ...(typeof encargo === "string" && encargo ? { encargo: recortar(encargo, MAXIMO_ENCARGO) } : {}),
    });
  };
  const cerrar = (id: string) => {
    a.fondo.delete(id);
    if (a.activos.delete(id)) eventos.push({ tipo: "ayudante", id, fase: "fin" });
  };
  if (m.type === "system") {
    const id = m.tool_use_id;
    if (typeof id !== "string") return [];
    if (m.subtype === "task_started" && m.task_type === "local_agent") {
      if (m.is_backgrounded === true) a.fondo.add(id);
      abrir(id, m.description);
    } else if (m.subtype === "task_notification") {
      cerrar(id);
    }
    return eventos;
  }
  const contenido = (m.message as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(contenido)) return [];
  const padre = typeof m.parent_tool_use_id === "string" ? m.parent_tool_use_id : null;
  if (m.type === "user") {
    for (const bloque of contenido) {
      const b = bloque as { type?: unknown; tool_use_id?: unknown } | null;
      if (b?.type !== "tool_result" || typeof b.tool_use_id !== "string") continue;
      if (!a.fondo.has(b.tool_use_id)) cerrar(b.tool_use_id);
    }
    return eventos;
  }
  if (m.type !== "assistant") return [];
  for (const bloque of contenido) {
    const actividad = actividadDeBloque(bloque);
    if (!actividad) continue;
    if (padre === null) {
      eventos.push(actividad);
    } else {
      abrir(padre, undefined);
      eventos.push({ ...actividad, ayudante: padre });
    }
    const b = bloque as { id?: unknown; input?: unknown };
    if (actividad.herramienta && LANZA_AYUDANTE.has(actividad.herramienta) && typeof b.id === "string") {
      abrir(b.id, (b.input as { description?: unknown } | undefined)?.description);
    }
  }
  return eventos;
}

/** Al cerrar el turno se van los que no corren de fondo: esos siguen hasta su aviso. */
export function cerrarAyudantes(a: Ayudantes): EventoSesion[] {
  const eventos: EventoSesion[] = [];
  for (const id of [...a.activos]) {
    if (a.fondo.has(id)) continue;
    a.activos.delete(id);
    eventos.push({ tipo: "ayudante", id, fase: "fin" });
  }
  return eventos;
}
