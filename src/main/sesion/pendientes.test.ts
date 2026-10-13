import { describe, expect, it } from "vitest";
import { pendientesDeMensaje, sinPendientes } from "./pendientes";

const asistente = (name: string, input: unknown, id = "u1", padre: string | null = null) => ({
  type: "assistant",
  parent_tool_use_id: padre,
  message: { content: [{ type: "tool_use", id, name, input }] },
});
const resultado = (id: string, content: unknown) => ({
  type: "user",
  parent_tool_use_id: null,
  message: { content: [{ type: "tool_result", tool_use_id: id, content }] },
});

describe("pendientesDeMensaje", () => {
  it("TodoWrite reemplaza la lista entera", () => {
    const e = sinPendientes();
    const lista = pendientesDeMensaje(
      asistente("TodoWrite", {
        todos: [
          { content: "Leer el login", status: "completed", activeForm: "Leyendo" },
          { content: "Arreglar la validación", status: "in_progress", activeForm: "Arreglando" },
          { content: "Correr pruebas", status: "pending", activeForm: "Corriendo" },
        ],
      }),
      e,
    );
    expect(lista).toEqual([
      { texto: "Leer el login", estado: "hecha" },
      { texto: "Arreglar la validación", estado: "en_curso" },
      { texto: "Correr pruebas", estado: "pendiente" },
    ]);
  });

  it("TaskCreate agrega, su resultado le da el id y TaskUpdate la mueve o la borra", () => {
    const e = sinPendientes();
    expect(pendientesDeMensaje(asistente("TaskCreate", { subject: "Migrar la base" }, "c1"), e)).toEqual([
      { texto: "Migrar la base", estado: "pendiente" },
    ]);
    pendientesDeMensaje(asistente("TaskCreate", { subject: "Probar" }, "c2"), e);
    expect(pendientesDeMensaje(resultado("c1", "Task #7 created successfully"), e)).toBeNull();
    pendientesDeMensaje(
      resultado("c2", [{ type: "text", text: '{"task":{"id":"8","subject":"Probar"}}' }]),
      e,
    );
    expect(pendientesDeMensaje(asistente("TaskUpdate", { taskId: "7", status: "completed" }), e)).toEqual([
      { texto: "Migrar la base", estado: "hecha" },
      { texto: "Probar", estado: "pendiente" },
    ]);
    expect(pendientesDeMensaje(asistente("TaskUpdate", { taskId: "8", status: "deleted" }), e)).toEqual([
      { texto: "Migrar la base", estado: "hecha" },
    ]);
  });

  it("la lista de un subagente no es la del Pokémon; otra herramienta no cambia nada", () => {
    const e = sinPendientes();
    const deAyudante = asistente("TodoWrite", { todos: [{ content: "x", status: "pending" }] }, "u", "padre");
    expect(pendientesDeMensaje(deAyudante, e)).toBeNull();
    expect(pendientesDeMensaje(asistente("Bash", { command: "ls" }), e)).toBeNull();
    expect(pendientesDeMensaje(asistente("TaskUpdate", { taskId: "99", status: "completed" }), e)).toBeNull();
  });
});
