import { describe, expect, it } from "vitest";
import { flujoDeMensaje, sinFlujo } from "./flujo";

const inicio = (id: string) => ({
  type: "stream_event",
  parent_tool_use_id: null,
  event: { type: "message_start", message: { id } },
});
const bloque = (index: number, tipo: "text" | "thinking") => ({
  type: "stream_event",
  parent_tool_use_id: null,
  event: {
    type: "content_block_start",
    index,
    content_block: tipo === "text" ? { type: "text", text: "" } : { type: "thinking", thinking: "" },
  },
});
const delta = (index: number, d: Record<string, unknown>) => ({
  type: "stream_event",
  parent_tool_use_id: null,
  event: { type: "content_block_delta", index, delta: d },
});

describe("flujoDeMensaje", () => {
  it("acumula text_delta y emite el texto completo hasta ahora", () => {
    const e = sinFlujo();
    flujoDeMensaje(inicio("m1"), e);
    flujoDeMensaje(bloque(0, "text"), e);
    const a = flujoDeMensaje(delta(0, { type: "text_delta", text: "Hola" }), e);
    const b = flujoDeMensaje(delta(0, { type: "text_delta", text: ", mundo" }), e);
    expect(a).toEqual([{ tipo: "flujo", clave: "m1:0", clase: "texto", texto: "Hola", final: false }]);
    expect(b[0]).toMatchObject({ clave: "m1:0", texto: "Hola, mundo", final: false });
  });

  it("acumula thinking_delta como pensamiento", () => {
    const e = sinFlujo();
    flujoDeMensaje(inicio("m1"), e);
    flujoDeMensaje(bloque(0, "thinking"), e);
    const r = flujoDeMensaje(delta(0, { type: "thinking_delta", thinking: "Pienso" }), e);
    expect(r[0]).toMatchObject({ clase: "pensando", texto: "Pienso" });
  });

  it("ignora deltas de herramientas, firmas y eventos de subagentes", () => {
    const e = sinFlujo();
    flujoDeMensaje(inicio("m1"), e);
    flujoDeMensaje(bloque(0, "text"), e);
    expect(flujoDeMensaje(delta(0, { type: "input_json_delta", partial_json: "{" }), e)).toEqual([]);
    expect(flujoDeMensaje(delta(0, { type: "signature_delta", signature: "x" }), e)).toEqual([]);
    expect(
      flujoDeMensaje(
        { ...delta(0, { type: "text_delta", text: "de un ayudante" }), parent_tool_use_id: "toolu_1" },
        e,
      ),
    ).toEqual([]);
  });

  it("el mensaje completo cierra el bloque ya visto con la misma clave y texto final", () => {
    const e = sinFlujo();
    flujoDeMensaje(inicio("m1"), e);
    flujoDeMensaje(bloque(0, "text"), e);
    flujoDeMensaje(delta(0, { type: "text_delta", text: "Hola" }), e);
    const r = flujoDeMensaje(
      {
        type: "assistant",
        parent_tool_use_id: null,
        message: { id: "m1", content: [{ type: "text", text: "Hola" }] },
      },
      e,
    );
    expect(r).toEqual([{ tipo: "flujo", clave: "m1:0", clase: "texto", texto: "Hola", final: true }]);
  });

  it("encuentra el bloque aunque el SDK mande un mensaje por bloque (índice 0 en cada uno)", () => {
    const e = sinFlujo();
    flujoDeMensaje(inicio("m1"), e);
    flujoDeMensaje(bloque(0, "thinking"), e);
    flujoDeMensaje(delta(0, { type: "thinking_delta", thinking: "Mmm" }), e);
    flujoDeMensaje(bloque(1, "text"), e);
    flujoDeMensaje(delta(1, { type: "text_delta", text: "Listo" }), e);
    const r = flujoDeMensaje(
      {
        type: "assistant",
        parent_tool_use_id: null,
        message: { id: "m1", content: [{ type: "text", text: "Listo" }] },
      },
      e,
    );
    expect(r[0]).toMatchObject({ clave: "m1:1", clase: "texto", texto: "Listo", final: true });
  });

  it("sin streaming, el mensaje completo llega entero con clave propia", () => {
    const e = sinFlujo();
    const r = flujoDeMensaje(
      {
        type: "assistant",
        parent_tool_use_id: null,
        message: {
          id: "m9",
          content: [
            { type: "thinking", thinking: "Pienso" },
            { type: "text", text: "Digo" },
            { type: "tool_use", id: "t", name: "Read", input: {} },
          ],
        },
      },
      e,
    );
    expect(r.map((x) => (x.tipo === "flujo" ? [x.clase, x.texto] : []))).toEqual([
      ["pensando", "Pienso"],
      ["texto", "Digo"],
    ]);
    expect(r.every((x) => x.tipo === "flujo" && x.final)).toBe(true);
  });

  it("el texto completo de un subagente llega atribuido a él", () => {
    const e = sinFlujo();
    const r = flujoDeMensaje(
      {
        type: "assistant",
        parent_tool_use_id: "toolu_1",
        message: { id: "m2", content: [{ type: "text", text: "yo soy el ayudante" }] },
      },
      e,
    );
    expect(r).toEqual([
      {
        tipo: "flujo",
        clave: "toolu_1:m2:0",
        clase: "texto",
        texto: "yo soy el ayudante",
        final: true,
        ayudante: "toolu_1",
      },
    ]);
  });

  it("no revienta con mensajes mal formados", () => {
    const e = sinFlujo();
    expect(flujoDeMensaje({ type: "stream_event" }, e)).toEqual([]);
    expect(flujoDeMensaje({ type: "assistant", message: null }, e)).toEqual([]);
    expect(flujoDeMensaje({ type: "result" }, e)).toEqual([]);
  });

  it("un mensaje nuevo reinicia los bloques del anterior", () => {
    const e = sinFlujo();
    flujoDeMensaje(inicio("m1"), e);
    flujoDeMensaje(bloque(0, "text"), e);
    flujoDeMensaje(delta(0, { type: "text_delta", text: "uno" }), e);
    flujoDeMensaje(inicio("m2"), e);
    flujoDeMensaje(bloque(0, "text"), e);
    const r = flujoDeMensaje(delta(0, { type: "text_delta", text: "dos" }), e);
    expect(r[0]).toMatchObject({ clave: "m2:0", texto: "dos" });
  });
});
