/** Un renglón de la lista de tareas que Claude Code arma para sí mismo. */
export interface Pendiente {
  texto: string;
  estado: "pendiente" | "en_curso" | "hecha";
}

/** La lista en curso y lo necesario para seguirla: el id de cada tarea y qué llamada creó cuál. */
export interface EstadoPendientes {
  lista: (Pendiente & { id?: string })[];
  /** Llamadas TaskCreate cuyo resultado (con el id de la tarea) aún no llega. */
  creando: Map<string, Pendiente & { id?: string }>;
}

export function sinPendientes(): EstadoPendientes {
  return { lista: [], creando: new Map() };
}

const ESTADOS: Record<string, Pendiente["estado"]> = {
  pending: "pendiente",
  in_progress: "en_curso",
  completed: "hecha",
};
const MAXIMO_TEXTO = 90;
const recortar = (t: string) => (t.length > MAXIMO_TEXTO ? `${t.slice(0, MAXIMO_TEXTO - 1)}…` : t);

/** El id de la tarea recién creada, tal como lo trae el resultado de TaskCreate (texto o JSON). */
function idCreado(contenido: unknown): string | null {
  const texto =
    typeof contenido === "string"
      ? contenido
      : Array.isArray(contenido)
        ? contenido.map((c) => (c as { text?: unknown })?.text ?? "").join(" ")
        : JSON.stringify(contenido ?? "");
  return /"id"\s*:\s*"([^"]+)"/.exec(texto)?.[1] ?? /#(\d+)/.exec(texto)?.[1] ?? null;
}

/**
 * Sigue la lista de tareas del Pokémon (no la de sus subagentes) leyendo sus mensajes: TodoWrite la reemplaza
 * entera; TaskCreate agrega una y TaskUpdate le cambia el estado o la borra. Devuelve la lista nueva si este mensaje
 * la cambió, o null. `e` se va actualizando.
 */
export function pendientesDeMensaje(m: Record<string, unknown>, e: EstadoPendientes): Pendiente[] | null {
  if (typeof m.parent_tool_use_id === "string") return null;
  const contenido = (m.message as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(contenido)) return null;
  let cambio = false;
  for (const bloque of contenido) {
    const b = (bloque ?? {}) as Record<string, unknown>;
    if (m.type === "user" && b.type === "tool_result" && typeof b.tool_use_id === "string") {
      const creada = e.creando.get(b.tool_use_id);
      if (!creada) continue;
      e.creando.delete(b.tool_use_id);
      // Sin id reconocible se numera en orden, como hace Claude Code.
      creada.id = idCreado(b.content) ?? String(e.lista.indexOf(creada) + 1);
      continue;
    }
    if (m.type !== "assistant" || b.type !== "tool_use") continue;
    const input = (b.input && typeof b.input === "object" ? b.input : {}) as Record<string, unknown>;
    if (b.name === "TodoWrite" && Array.isArray(input.todos)) {
      e.lista = input.todos.flatMap((t) => {
        const x = (t ?? {}) as { content?: unknown; status?: unknown };
        return typeof x.content === "string" && x.content
          ? [{ texto: recortar(x.content), estado: ESTADOS[String(x.status)] ?? "pendiente" }]
          : [];
      });
      e.creando.clear();
      cambio = true;
    } else if (b.name === "TaskCreate" && typeof input.subject === "string" && input.subject) {
      const nueva: Pendiente & { id?: string } = { texto: recortar(input.subject), estado: "pendiente" };
      e.lista.push(nueva);
      if (typeof b.id === "string") e.creando.set(b.id, nueva);
      cambio = true;
    } else if (b.name === "TaskUpdate" && typeof input.taskId === "string") {
      const i = e.lista.findIndex((p) => p.id === input.taskId);
      if (i < 0) continue;
      if (input.status === "deleted") e.lista.splice(i, 1);
      else {
        if (typeof input.status === "string" && ESTADOS[input.status])
          e.lista[i].estado = ESTADOS[input.status];
        if (typeof input.subject === "string" && input.subject) e.lista[i].texto = recortar(input.subject);
      }
      cambio = true;
    }
  }
  return cambio ? e.lista.map(({ texto, estado }) => ({ texto, estado })) : null;
}
