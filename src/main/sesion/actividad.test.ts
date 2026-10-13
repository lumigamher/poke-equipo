import { describe, expect, it } from "vitest";
import { actividadDeBloque, cerrarAyudantes, eventosDeMensaje, sinAyudantes } from "./actividad";

describe("actividadDeBloque", () => {
  it("un bloque thinking es pensando", () => {
    expect(actividadDeBloque({ type: "thinking", thinking: "hmm" })).toEqual({
      tipo: "actividad",
      clase: "pensando",
      detalle: "hmm",
    });
  });

  it("lo que piensa va en una línea, sin markdown y recortado; vacío u oculto no lleva detalle", () => {
    expect(actividadDeBloque({ type: "thinking", thinking: "**Plan**\n\nrevisar `login.ts`" })?.detalle).toBe(
      "Plan revisar login.ts",
    );
    expect(actividadDeBloque({ type: "text", text: "a".repeat(300) })?.detalle).toHaveLength(160);
    expect(actividadDeBloque({ type: "text", text: "Listo, ya quedó.\n\nVOZ: Ya quedó." })?.detalle).toBe(
      "Listo, ya quedó.",
    );
    expect(actividadDeBloque({ type: "thinking", thinking: "" })).toEqual({
      tipo: "actividad",
      clase: "pensando",
    });
    expect(actividadDeBloque({ type: "thinking" })).toEqual({ tipo: "actividad", clase: "pensando" });
  });

  it("tool_use con command usa el comando como detalle", () => {
    expect(actividadDeBloque({ type: "tool_use", name: "Bash", input: { command: "ls -la" } })).toEqual({
      tipo: "actividad",
      clase: "herramienta",
      herramienta: "Bash",
      detalle: "ls -la",
    });
  });

  it("tool_use con file_path usa la ruta como detalle", () => {
    expect(actividadDeBloque({ type: "tool_use", name: "Read", input: { file_path: "/a/b.ts" } })).toEqual({
      tipo: "actividad",
      clase: "herramienta",
      herramienta: "Read",
      detalle: "/a/b.ts",
    });
  });

  it("tool_use sin campo conocido no trae detalle", () => {
    expect(actividadDeBloque({ type: "tool_use", name: "Raro", input: { x: 1 } })).toEqual({
      tipo: "actividad",
      clase: "herramienta",
      herramienta: "Raro",
    });
  });

  it("un bloque text es respondiendo", () => {
    expect(actividadDeBloque({ type: "text", text: "hola" })).toEqual({
      tipo: "actividad",
      clase: "respondiendo",
      detalle: "hola",
    });
  });

  it("un tipo desconocido da null", () => {
    expect(actividadDeBloque({ type: "otra_cosa" })).toBeNull();
    expect(actividadDeBloque(null)).toBeNull();
    expect(actividadDeBloque("texto")).toBeNull();
  });

  it("trunca un comando de 300 caracteres a 120", () => {
    const r = actividadDeBloque({ type: "tool_use", name: "Bash", input: { command: "x".repeat(300) } });
    expect(r?.detalle).toHaveLength(120);
  });

  it("al recortar el rótulo corto lo dice con «…» y guarda el detalle más completo aparte", () => {
    const r = actividadDeBloque({ type: "tool_use", name: "Bash", input: { command: "x".repeat(300) } });
    expect(r?.detalle?.endsWith("…")).toBe(true);
    expect(r?.completo).toBe("x".repeat(300));
  });

  it("un detalle corto no trae «…» ni duplicado", () => {
    const r = actividadDeBloque({ type: "tool_use", name: "Bash", input: { command: "ls" } });
    expect(r?.detalle).toBe("ls");
    expect(r?.completo).toBeUndefined();
  });
});

describe("eventosDeMensaje: subagentes", () => {
  const asistente = (content: unknown[], padre: string | null = null) => ({
    type: "assistant",
    parent_tool_use_id: padre,
    message: { content },
  });
  const resultado = (id: string) => ({
    type: "user",
    parent_tool_use_id: null,
    message: { content: [{ type: "tool_result", tool_use_id: id }] },
  });
  const con = (...ids: string[]) => ({ activos: new Set(ids), fondo: new Set<string>() });

  it("la llamada Agent abre un ayudante con su encargo", () => {
    const a = sinAyudantes();
    const eventos = eventosDeMensaje(
      asistente([{ type: "tool_use", id: "t1", name: "Agent", input: { description: "Revisar tests" } }]),
      a,
    );
    expect(eventos).toEqual([
      { tipo: "actividad", clase: "herramienta", herramienta: "Agent", detalle: "Revisar tests" },
      { tipo: "ayudante", id: "t1", fase: "inicio", encargo: "Revisar tests" },
    ]);
    expect([...a.activos]).toEqual(["t1"]);
  });

  it("lo que hace el subagente llega marcado y no cuenta como actividad del Pokémon", () => {
    const eventos = eventosDeMensaje(
      asistente([{ type: "tool_use", id: "x", name: "Read", input: { file_path: "a.ts" } }], "t1"),
      con("t1"),
    );
    expect(eventos).toEqual([
      { tipo: "actividad", clase: "herramienta", herramienta: "Read", detalle: "a.ts", ayudante: "t1" },
    ]);
  });

  it("el resultado de la llamada lo cierra; otros resultados no hacen nada", () => {
    const a = con("t1");
    expect(eventosDeMensaje(resultado("otro"), a)).toEqual([]);
    expect(eventosDeMensaje(resultado("t1"), a)).toEqual([{ tipo: "ayudante", id: "t1", fase: "fin" }]);
    expect(a.activos.size).toBe(0);
  });

  it("de fondo (caso real del SDK): el resultado inmediato no lo cierra; lo cierra task_notification", () => {
    const a = sinAyudantes();
    eventosDeMensaje(asistente([{ type: "tool_use", id: "t1", name: "Agent", input: {} }]), a);
    const inicio = {
      type: "system",
      subtype: "task_started",
      task_type: "local_agent",
      tool_use_id: "t1",
      description: "Leer nota.txt",
      is_backgrounded: true,
    };
    // Ya estaba abierto por la llamada: no se abre dos veces.
    expect(eventosDeMensaje(inicio, a)).toEqual([]);
    expect(eventosDeMensaje(resultado("t1"), a)).toEqual([]);
    expect(cerrarAyudantes(a)).toEqual([]);
    expect(eventosDeMensaje(asistente([{ type: "thinking" }], "t1"), a)).toEqual([
      { tipo: "actividad", clase: "pensando", ayudante: "t1" },
    ]);
    const aviso = { type: "system", subtype: "task_notification", tool_use_id: "t1", status: "completed" };
    expect(eventosDeMensaje(aviso, a)).toEqual([{ tipo: "ayudante", id: "t1", fase: "fin" }]);
    expect(a.activos.size + a.fondo.size).toBe(0);
  });

  it("task_started sin llamada vista abre el ayudante con su descripción", () => {
    const inicio = {
      type: "system",
      subtype: "task_started",
      task_type: "local_agent",
      tool_use_id: "t7",
      description: "Buscar usos",
    };
    expect(eventosDeMensaje(inicio, sinAyudantes())).toEqual([
      { tipo: "ayudante", id: "t7", fase: "inicio", encargo: "Buscar usos" },
    ]);
  });

  it("al cerrar el turno se van los que no corren de fondo", () => {
    const a = con("a", "b");
    a.fondo.add("b");
    expect(cerrarAyudantes(a)).toEqual([{ tipo: "ayudante", id: "a", fase: "fin" }]);
    expect([...a.activos]).toEqual(["b"]);
  });
});
