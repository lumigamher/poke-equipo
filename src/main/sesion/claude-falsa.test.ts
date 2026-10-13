import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SesionClaude } from "./claude";
import type { EventoSesion } from "./sesion";

type Msg = Record<string, unknown>;
interface Opciones {
  env: Record<string, string>;
  settingSources: string[];
  hooks: Record<
    string,
    { matcher: string; hooks: ((entrada: Record<string, unknown>) => Promise<unknown>)[] }[]
  >;
  canUseTool: (
    h: string,
    i: Record<string, unknown>,
    e: { toolUseID: string },
  ) => Promise<{ behavior: string; updatedInput?: unknown }>;
}

function crearFalsa() {
  const pendientes: Msg[] = [];
  let despertar: (() => void) | null = null;
  let fallo: Error | null = null;
  let fin = false;
  let opciones = {} as Opciones;
  const consulta = {
    close() {
      fin = true;
      despertar?.();
    },
    async getContextUsage() {
      return { percentage: 7 };
    },
    modelos: [] as string[],
    async setModel(m?: string) {
      consulta.modelos.push(String(m));
    },
    async supportedCommands() {
      return [{ name: "compact", description: "Compacta", argumentHint: "" }];
    },
    async *[Symbol.asyncIterator]() {
      while (true) {
        while (!pendientes.length && !fallo && !fin) await new Promise<void>((r) => (despertar = r));
        if (fallo) throw fallo;
        if (!pendientes.length) return;
        yield pendientes.shift() as Msg;
      }
    },
  };
  return {
    consultar: (args: { options: Opciones }) => {
      opciones = args.options;
      return consulta;
    },
    get opciones() {
      return opciones;
    },
    consulta,
    emitir(m: Msg) {
      pendientes.push(m);
      despertar?.();
    },
    reventar(e: Error) {
      fallo = e;
      despertar?.();
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 10));

async function armar() {
  const falsa = crearFalsa();
  const sesion = new SesionClaude(
    { carpeta: "/tmp", sessionId: null, rol: "r" },
    { consultar: falsa.consultar as never },
  );
  const eventos: EventoSesion[] = [];
  sesion.alEvento((e) => eventos.push(e));
  await tick();
  return { falsa, sesion, eventos };
}

async function estado(p: Promise<unknown>) {
  return Promise.race([p, tick().then(() => "pendiente")]);
}

describe("SesionClaude con consulta falsa", () => {
  const guardado = { ...process.env };
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-prueba";
    process.env.CLAUDECODE = "1";
    process.env.CLAUDE_CODE_ENTRYPOINT = "cli";
  });
  afterEach(() => {
    for (const k of ["ANTHROPIC_API_KEY", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT"]) {
      if (guardado[k] === undefined) delete process.env[k];
      else process.env[k] = guardado[k];
    }
  });

  it("permiso: queda pendiente y se resuelve allow o deny", async () => {
    const { falsa, sesion, eventos } = await armar();
    const a = falsa.opciones.canUseTool("Bash", { command: "ls" }, { toolUseID: "t1" });
    const b = falsa.opciones.canUseTool("Bash", { command: "rm" }, { toolUseID: "t2" });
    expect(eventos.filter((e) => e.tipo === "permiso")).toHaveLength(2);
    expect(await estado(a)).toBe("pendiente");
    sesion.resolverPermiso("t1", true);
    sesion.resolverPermiso("t2", false);
    expect(await a).toEqual({ behavior: "allow", updatedInput: { command: "ls" } });
    expect((await b).behavior).toBe("deny");
    sesion.cerrar();
  });

  it("pide los mensajes parciales y convierte el texto que llega en trocitos en eventos de flujo", async () => {
    const { falsa, eventos, sesion } = await armar();
    expect((falsa.opciones as unknown as { includePartialMessages?: boolean }).includePartialMessages).toBe(
      true,
    );
    falsa.emitir({
      type: "stream_event",
      parent_tool_use_id: null,
      event: { type: "message_start", message: { id: "m1" } },
    });
    falsa.emitir({
      type: "stream_event",
      parent_tool_use_id: null,
      event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    });
    falsa.emitir({
      type: "stream_event",
      parent_tool_use_id: null,
      event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hola" } },
    });
    await tick();
    expect(eventos.filter((e) => e.tipo === "flujo")).toEqual([
      { tipo: "flujo", clave: "m1:0", clase: "texto", texto: "Hola", final: false },
    ]);
    sesion.cerrar();
  });

  it("cerrar con un permiso pendiente lo niega", async () => {
    const { falsa, sesion } = await armar();
    const p = falsa.opciones.canUseTool("Bash", { command: "ls" }, { toolUseID: "t1" });
    sesion.cerrar();
    expect((await p).behavior).toBe("deny");
  });

  it("id desconocido o ya resuelto no hace nada ni lanza", async () => {
    const { falsa, sesion } = await armar();
    const p = falsa.opciones.canUseTool("Bash", { command: "ls" }, { toolUseID: "t1" });
    expect(() => sesion.resolverPermiso("nada", true)).not.toThrow();
    sesion.resolverPermiso("t1", false);
    expect(() => sesion.resolverPermiso("t1", true)).not.toThrow();
    expect((await p).behavior).toBe("deny");
    sesion.cerrar();
  });

  it("si el flujo revienta con un permiso pendiente: deny y un solo error", async () => {
    const { falsa, eventos } = await armar();
    const p = falsa.opciones.canUseTool("Bash", { command: "ls" }, { toolUseID: "t1" });
    falsa.reventar(new Error("se cayó"));
    expect((await p).behavior).toBe("deny");
    await tick();
    const errores = eventos.filter((e) => e.tipo === "error");
    expect(errores).toHaveLength(1);
  });

  it("un result con subtype de error emite error, no respuesta", async () => {
    const { falsa, sesion, eventos } = await armar();
    falsa.emitir({ type: "result", subtype: "error_during_execution", errors: ["mal"] });
    await tick();
    expect(eventos.some((e) => e.tipo === "error")).toBe(true);
    expect(eventos.some((e) => e.tipo === "respuesta")).toBe(false);
    sesion.cerrar();
  });

  it("un result success con is_error true emite error, no respuesta", async () => {
    const { falsa, sesion, eventos } = await armar();
    falsa.emitir({ type: "result", subtype: "success", is_error: true, result: "API Error: 529 overloaded" });
    await tick();
    expect(eventos).toContainEqual({ tipo: "error", mensaje: "API Error: 529 overloaded" });
    expect(eventos.some((e) => e.tipo === "respuesta")).toBe(false);
    sesion.cerrar();
  });

  it("un result success normal emite respuesta", async () => {
    const { falsa, sesion, eventos } = await armar();
    falsa.emitir({ type: "result", subtype: "success", is_error: false, result: "hola\nVOZ: hola" });
    await tick();
    expect(eventos).toContainEqual({ tipo: "respuesta", texto: "hola\nVOZ: hola", contextoUsado: 7 });
    sesion.cerrar();
  });

  it("un Bash de pruebas que sale con error (PostToolUseFailure) emite tests: fallo", async () => {
    const { falsa, sesion, eventos } = await armar();
    const falla = falsa.opciones.hooks.PostToolUseFailure;
    expect(falla).toHaveLength(1);
    expect(falla[0].matcher).toBe("Bash");
    await falla[0].hooks[0]({
      hook_event_name: "PostToolUseFailure",
      tool_name: "Bash",
      tool_input: { command: "bun run test" },
      error: "Command failed with exit code 1",
    });
    expect(eventos).toContainEqual({ tipo: "tests", resultado: "fallo" });
    await falla[0].hooks[0]({
      hook_event_name: "PostToolUseFailure",
      tool_name: "Bash",
      tool_input: { command: "ls /no-existe" },
      error: "exit 2",
    });
    await falla[0].hooks[0]({
      hook_event_name: "PostToolUseFailure",
      tool_name: "Bash",
      tool_input: { command: "bun run test" },
      error: "interrumpido",
      is_interrupt: true,
    });
    expect(eventos.filter((e) => e.tipo === "tests")).toHaveLength(1);
    sesion.cerrar();
  });

  it("las opciones llevan env limpio y settingSources", async () => {
    const { falsa, sesion } = await armar();
    const { env, settingSources } = falsa.opciones;
    expect(env).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(Object.keys(env).some((k) => k.startsWith("CLAUDE"))).toBe(false);
    expect(env.PATH).toBeDefined();
    expect(settingSources).toEqual(["user", "project", "local"]);
    sesion.cerrar();
  });

  it("siempre arranca en Opus, sin heredar el modelo predeterminado de Claude Code", async () => {
    const { falsa, sesion } = await armar();
    expect((falsa.opciones as unknown as { model?: string }).model).toBe("opus");
    sesion.cerrar();
  });

  it("cambia el modelo con setModel del SDK y traduce la lista de comandos", async () => {
    const { falsa, sesion } = await armar();
    await sesion.cambiarModelo("sonnet");
    expect(falsa.consulta.modelos).toEqual(["sonnet"]);
    expect(await sesion.comandos()).toEqual([{ nombre: "compact", descripcion: "Compacta", argumento: "" }]);
    sesion.cerrar();
  });
});
