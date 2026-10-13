import type { EventoSesion } from "./sesion";

type EventoFlujo = Extract<EventoSesion, { tipo: "flujo" }>;
type Clase = EventoFlujo["clase"];

interface Bloque {
  clave: string;
  clase: Clase;
  texto: string;
  cerrado: boolean;
}

/** Lo que se sabe del mensaje que está llegando: sus bloques de texto y de pensamiento, por índice. */
export interface EstadoFlujo {
  mensaje: string | null;
  bloques: Map<number, Bloque>;
  /** Cuántos mensajes completos sin streaming se han visto (para dar claves propias). */
  sueltos: number;
}

export function sinFlujo(): EstadoFlujo {
  return { mensaje: null, bloques: new Map(), sueltos: 0 };
}

const claseDe = (tipo: unknown): Clase | null =>
  tipo === "text" ? "texto" : tipo === "thinking" ? "pensando" : null;

/**
 * Traduce los mensajes de la sesión que traen TEXTO del asistente (en trocitos mientras se escribe, con
 * `includePartialMessages`, y completo al cerrarse el mensaje) a eventos `flujo` con el texto acumulado. Es lo único
 * que alimenta el registro en vivo con lo que dice o piensa; las herramientas siguen por `actividad`. Solo el agente
 * principal: lo de los subagentes (con `parent_tool_use_id`) se ignora. `estado` se va actualizando.
 */
export function flujoDeMensaje(m: Record<string, unknown>, estado: EstadoFlujo): EventoSesion[] {
  if (m.parent_tool_use_id != null) {
    // Un subagente: solo su texto ya completo (`forwardSubagentText`), atribuido a él.
    return m.type === "assistant" && typeof m.parent_tool_use_id === "string"
      ? deSubagente(m.message, m.parent_tool_use_id)
      : [];
  }
  if (m.type === "stream_event") return deStream(m.event, estado);
  if (m.type === "assistant") return deCompleto(m.message, estado);
  return [];
}

function deSubagente(mensaje: unknown, padre: string): EventoSesion[] {
  const msg = mensaje as { id?: unknown; content?: unknown } | null;
  if (!msg || !Array.isArray(msg.content)) return [];
  const salidas: EventoSesion[] = [];
  msg.content.forEach((b: unknown, i: number) => {
    const bl = b as { type?: unknown; text?: unknown } | null;
    if (bl?.type !== "text" || typeof bl.text !== "string" || bl.text.trim() === "") return;
    salidas.push({
      tipo: "flujo",
      clave: `${padre}:${typeof msg.id === "string" ? msg.id : "?"}:${i}`,
      clase: "texto",
      texto: bl.text,
      final: true,
      ayudante: padre,
    });
  });
  return salidas;
}

function deStream(ev: unknown, estado: EstadoFlujo): EventoSesion[] {
  if (!ev || typeof ev !== "object") return [];
  const e = ev as {
    type?: unknown;
    index?: unknown;
    message?: { id?: unknown };
    content_block?: { type?: unknown; text?: unknown; thinking?: unknown };
    delta?: { type?: unknown; text?: unknown; thinking?: unknown };
  };
  if (e.type === "message_start") {
    estado.mensaje = typeof e.message?.id === "string" ? e.message.id : null;
    estado.bloques.clear();
    return [];
  }
  if (typeof e.index !== "number") return [];
  if (e.type === "content_block_start") {
    const clase = claseDe(e.content_block?.type);
    if (!clase) return [];
    const inicial = e.content_block?.text ?? e.content_block?.thinking;
    const bloque: Bloque = {
      clave: `${estado.mensaje ?? "?"}:${e.index}`,
      clase,
      texto: typeof inicial === "string" ? inicial : "",
      cerrado: false,
    };
    estado.bloques.set(e.index, bloque);
    return bloque.texto ? [salida(bloque, false)] : [];
  }
  if (e.type === "content_block_delta") {
    const bloque = estado.bloques.get(e.index);
    if (!bloque) return [];
    const d = e.delta;
    const trozo =
      d?.type === "text_delta" && bloque.clase === "texto"
        ? d.text
        : d?.type === "thinking_delta" && bloque.clase === "pensando"
          ? d.thinking
          : null;
    if (typeof trozo !== "string" || trozo === "") return [];
    bloque.texto += trozo;
    return [salida(bloque, false)];
  }
  return [];
}

function deCompleto(mensaje: unknown, estado: EstadoFlujo): EventoSesion[] {
  const msg = mensaje as { id?: unknown; content?: unknown } | null;
  if (!msg || !Array.isArray(msg.content)) return [];
  const id = typeof msg.id === "string" ? msg.id : null;
  const salidas: EventoSesion[] = [];
  msg.content.forEach((b: unknown, i: number) => {
    const bl = b as { type?: unknown; text?: unknown; thinking?: unknown } | null;
    const clase = claseDe(bl?.type);
    if (!clase) return;
    const texto = clase === "texto" ? bl?.text : bl?.thinking;
    if (typeof texto !== "string" || texto.trim() === "") return;
    // El bloque que ya iba llegando por streaming: del mismo mensaje, misma clase y mismo texto (o el que iba más
    // atrás de lo que quedó). El SDK puede mandar un mensaje por bloque, así que el índice no sirve para encontrarlo.
    const visto =
      id !== null && id === estado.mensaje
        ? [...estado.bloques.values()].find(
            (x) => !x.cerrado && x.clase === clase && (x.texto === texto || texto.startsWith(x.texto)),
          )
        : undefined;
    if (visto) {
      visto.texto = texto;
      visto.cerrado = true;
      salidas.push(salida(visto, true));
    } else {
      estado.sueltos += 1;
      salidas.push({
        tipo: "flujo",
        clave: `${id ?? "msg"}:c${estado.sueltos}:${i}`,
        clase,
        texto,
        final: true,
      });
    }
  });
  return salidas;
}

const salida = (b: Bloque, final: boolean): EventoFlujo => ({
  tipo: "flujo",
  clave: b.clave,
  clase: b.clase,
  texto: b.texto,
  final,
});
