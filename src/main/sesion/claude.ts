import { cerrarAyudantes, eventosDeMensaje, sinAyudantes } from "./actividad";
import { crearCola } from "./cola";
import { entornoLimpio } from "./entorno";
import { flujoDeMensaje, sinFlujo } from "./flujo";
import { pendientesDeMensaje, sinPendientes } from "./pendientes";
import type { EventoSesion, HerramientasEquipo, OpcionesSesion, Sesion } from "./sesion";
import { resultadoDeTests, resultadoDeTestsFallido } from "./tests";

interface MensajeUsuario {
  type: "user";
  message: { role: "user"; content: string };
  parent_tool_use_id: null;
}

type RespuestaPermiso =
  | { behavior: "allow"; updatedInput: Record<string, unknown> }
  | { behavior: "deny"; message: string };

interface Consulta extends AsyncIterable<Record<string, unknown>> {
  close(): void;
  getContextUsage(): Promise<{ percentage: number }>;
  setModel?(modelo?: string): Promise<void>;
  interrupt?(): Promise<unknown>;
  /** Experimental en el SDK: puede cambiar de nombre o desaparecer; si falta, no hay barra de límite. */
  usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET?(opts?: {
    skipBehaviors?: boolean;
  }): Promise<unknown>;
  supportedCommands?(): Promise<{ name: string; description: string; argumentHint: string }[]>;
}

/**
 * Cuánto va usado de la ventana de 5 horas del plan (0 a 100) y cuándo se reinicia, leído de la respuesta de uso del
 * SDK. Null si no hay dato (clave de API, sin plan, o el SDK ya no lo trae).
 */
export function limiteDeUso(uso: unknown): { usado: number; reinicia?: string } | null {
  const cinco = (
    uso as { rate_limits?: { five_hour?: { utilization?: unknown; resets_at?: unknown } | null } | null }
  )?.rate_limits?.five_hour;
  const usado = cinco?.utilization;
  if (typeof usado !== "number" || !Number.isFinite(usado)) return null;
  return {
    usado: Math.min(100, Math.max(0, usado)),
    ...(typeof cinco?.resets_at === "string" ? { reinicia: cinco.resets_at } : {}),
  };
}

function describir(_herramienta: string, input: Record<string, unknown>): string {
  if (typeof input.command === "string") return input.command;
  if (typeof input.file_path === "string") return input.file_path;
  return JSON.stringify(input).slice(0, 300);
}

/** Nombre completo con el que Claude Code ve la herramienta de llamar a otro Pokémon. */
export const HERRAMIENTA_LLAMAR = "mcp__poke__llamar_pokemon";
export const HERRAMIENTA_EQUIPO = "mcp__poke__sacar_equipo";

/** El servidor de herramientas en proceso que expone el equipo a la sesión. */
async function servidorEquipo(h: HerramientasEquipo): Promise<unknown> {
  const sdk = await import("@anthropic-ai/claude-agent-sdk");
  const { z } = await import("zod");
  return sdk.createSdkMcpServer({
    name: "poke",
    version: "1.0.0",
    tools: [
      sdk.tool(
        "llamar_pokemon",
        "Saca a la pantalla a otro Pokémon del equipo de quien te usa (otra sesión de Claude Code) y, si se da, le pasa un encargo. Úsala cuando la persona pida llamar, traer o sacar a otro Pokémon, o pasarle una tarea a otro.",
        {
          especie: z
            .string()
            .describe(
              "Nombre de la especie tal como está en el catálogo (por ejemplo Squirtle) o el nombre propio de alguien del equipo (por ejemplo Rayo)",
            ),
          encargo: z
            .string()
            .optional()
            .describe("Lo que ese Pokémon debe hacer, con las palabras de la persona"),
        },
        async (a) => ({ content: [{ type: "text" as const, text: h.llamar(a.especie, a.encargo ?? "") }] }),
        // Siempre cargada: si Claude Code tuviera que buscarla primero, la llamada tardaría un turno más.
        { alwaysLoad: true },
      ),
      sdk.tool(
        "sacar_equipo",
        "Saca a la pantalla a todos los Pokémon de quien te usa que trabajan en un proyecto. Úsala cuando pida «saca el equipo» de un proyecto.",
        { proyecto: z.string().describe("Nombre del proyecto, por ejemplo Acme") },
        async (a) => ({ content: [{ type: "text" as const, text: h.sacarEquipo(a.proyecto) }] }),
        { alwaysLoad: true },
      ),
    ],
  });
}

/** Función con la forma de `query` del SDK; se puede inyectar para probar sin Claude real. */
export type Consultar = (args: {
  prompt: AsyncIterable<MensajeUsuario>;
  options: Record<string, unknown>;
}) => Consulta;

export interface ExtrasSesionClaude {
  consultar?: Consultar;
  /** Ruta del ejecutable de Claude Code; sin ella el SDK busca el suyo (en desarrollo). Empaquetada se da siempre. */
  ejecutable?: string;
}

export class SesionClaude implements Sesion {
  private cola = crearCola<MensajeUsuario>();
  private oyentes: ((e: EventoSesion) => void)[] = [];
  private permisos = new Map<string, (permitir: boolean) => void>();
  private consulta: Consulta | null = null;
  private cerrada = false;

  constructor(
    private o: OpcionesSesion,
    private extras: ExtrasSesionClaude = {},
  ) {
    void this.arrancar();
  }

  alEvento(fn: (e: EventoSesion) => void): void {
    this.oyentes.push(fn);
  }

  enviar(texto: string): void {
    this.cola.poner({ type: "user", message: { role: "user", content: texto }, parent_tool_use_id: null });
  }

  async cambiarModelo(modelo: string): Promise<void> {
    if (!this.consulta?.setModel) throw new Error("la sesión aún no arranca");
    await this.consulta.setModel(modelo);
  }

  interrumpir(): void {
    // Si falla (la sesión aún no arranca o ya terminó el turno), no hay nada que detener.
    void this.consulta?.interrupt?.().catch(() => {});
  }

  async comandos(): Promise<{ nombre: string; descripcion: string; argumento: string }[]> {
    if (!this.consulta?.supportedCommands) return [];
    return (await this.consulta.supportedCommands()).map((c) => ({
      nombre: c.name,
      descripcion: c.description,
      argumento: c.argumentHint,
    }));
  }

  resolverPermiso(id: string, permitir: boolean): void {
    const resolver = this.permisos.get(id);
    this.permisos.delete(id);
    resolver?.(permitir);
  }

  cerrar(): void {
    this.cerrada = true;
    this.negarPendientes();
    this.cola.cerrar();
    this.consulta?.close();
  }

  /** El uso del plan, si el SDK lo da; cualquier fallo se trata como "no se sabe". */
  private async uso(consulta: Consulta): Promise<unknown> {
    try {
      return await consulta.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET?.({
        skipBehaviors: true,
      });
    } catch {
      return null;
    }
  }

  private emitir(e: EventoSesion): void {
    if (this.cerrada) return;
    for (const fn of this.oyentes) fn(e);
  }

  private negarPendientes(): void {
    for (const resolver of this.permisos.values()) resolver(false);
    this.permisos.clear();
  }

  private async arrancar(): Promise<void> {
    try {
      // El SDK es ESM; el proceso principal se compila a CommonJS, así que se carga en caliente.
      const consultar: Consultar =
        this.extras.consultar ??
        ((await import("@anthropic-ai/claude-agent-sdk")).query as unknown as Consultar);
      // Las herramientas del equipo solo existen con el SDK real (una sesión de prueba no las monta).
      const delEquipo =
        this.o.herramientas && !this.extras.consultar ? await servidorEquipo(this.o.herramientas) : null;
      // Sin API key y sin variables heredadas de otra sesión: así usa el login de Claude Code.
      const env = entornoLimpio(process.env);
      const opciones = {
        cwd: this.o.carpeta,
        env,
        // Empaquetada, el ejecutable del SDK vive fuera del asar y el SDK no lo encontraría solo.
        ...(this.extras.ejecutable ? { pathToClaudeCodeExecutable: this.extras.ejecutable } : {}),
        // Carga el CLAUDE.md, las skills, los MCP y las reglas de permisos de quien la usa.
        settingSources: ["user", "project", "local"],
        // Fijo: el predeterminado de Claude Code cambia con /model en la terminal y el Pokémon no debe seguirlo.
        model: this.o.modelo ?? "opus",
        ...(this.o.sessionId ? { resume: this.o.sessionId } : {}),
        // Llamar a otro Pokémon no toca nada del disco: va permitido de entrada, sin burbuja de permiso.
        ...(delEquipo
          ? { mcpServers: { poke: delEquipo }, allowedTools: [HERRAMIENTA_LLAMAR, HERRAMIENTA_EQUIPO] }
          : {}),
        // El texto del Pokémon llega en trocitos mientras lo escribe: alimenta el registro en vivo de la burbuja.
        includePartialMessages: true,
        // El texto de los subagentes (completo, sin trocitos) también va al registro, atribuido a su ayudante.
        forwardSubagentText: true,
        systemPrompt: { type: "preset", preset: "claude_code", append: this.o.rol },
        canUseTool: (herramienta: string, input: Record<string, unknown>, extra: { toolUseID: string }) =>
          new Promise<RespuestaPermiso>((resolver) => {
            this.permisos.set(extra.toolUseID, (permitir) =>
              resolver(
                permitir
                  ? { behavior: "allow", updatedInput: input }
                  : { behavior: "deny", message: "La persona dijo que no." },
              ),
            );
            this.emitir({
              tipo: "permiso",
              id: extra.toolUseID,
              herramienta,
              detalle: describir(herramienta, input),
            });
          }),
        hooks: {
          PostToolUse: [
            {
              matcher: "Bash",
              hooks: [
                // Verificado en vivo: la salida de Bash llega en tool_response (p. ej. { stdout, stderr, ... }).
                async (entrada: { tool_input?: { command?: unknown }; tool_response?: unknown }) => {
                  const resultado = resultadoDeTests(
                    String(entrada.tool_input?.command ?? ""),
                    entrada.tool_response,
                  );
                  if (resultado) this.emitir({ tipo: "tests", resultado });
                  return {};
                },
              ],
            },
          ],
          // Un Bash que sale con código distinto de cero no pasa por PostToolUse sino por este evento.
          PostToolUseFailure: [
            {
              matcher: "Bash",
              hooks: [
                async (entrada: {
                  tool_input?: { command?: unknown };
                  error?: unknown;
                  is_interrupt?: boolean;
                }) => {
                  const resultado = resultadoDeTestsFallido(
                    String(entrada.tool_input?.command ?? ""),
                    entrada.error,
                    entrada.is_interrupt === true,
                  );
                  if (resultado) this.emitir({ tipo: "tests", resultado });
                  return {};
                },
              ],
            },
          ],
        },
      };
      const consulta = consultar({ prompt: this.cola.iterable, options: opciones });
      this.consulta = consulta;

      const ayudantes = sinAyudantes();
      const pendientes = sinPendientes();
      const flujo = sinFlujo();
      for await (const m of consulta) {
        if (m.type === "stream_event") {
          for (const evento of flujoDeMensaje(m, flujo)) this.emitir(evento);
        } else if (m.type === "system" && m.subtype === "init") {
          this.emitir({ tipo: "iniciada", sessionId: String(m.session_id) });
        } else if (m.type === "assistant" || m.type === "user" || m.type === "system") {
          if (m.type === "assistant") for (const evento of flujoDeMensaje(m, flujo)) this.emitir(evento);
          for (const evento of eventosDeMensaje(m, ayudantes)) this.emitir(evento);
          const lista = pendientesDeMensaje(m, pendientes);
          if (lista) this.emitir({ tipo: "pendientes", lista });
        } else if (m.type === "result") {
          for (const evento of cerrarAyudantes(ayudantes)) this.emitir(evento);
          let usado = 0;
          try {
            usado = (await consulta.getContextUsage()).percentage;
          } catch {
            // Sin dato de contexto la barra de PS no se mueve; el turno sigue siendo válido.
          }
          const limite = limiteDeUso(await this.uso(consulta));
          if (limite) this.emitir({ tipo: "limite", ...limite });
          // Un turno "success" puede traer is_error: true con el texto del error de la API.
          if (m.subtype === "success" && m.is_error === true) {
            this.emitir({ tipo: "error", mensaje: String(m.result ?? "Error de la API") });
          } else if (m.subtype === "success") {
            this.emitir({ tipo: "respuesta", texto: String(m.result ?? ""), contextoUsado: usado });
          } else {
            const errores = Array.isArray(m.errors) ? m.errors.join(" · ") : String(m.subtype);
            this.emitir({ tipo: "error", mensaje: errores });
          }
        }
      }
      if (!this.cerrada) this.emitir({ tipo: "error", mensaje: "La sesión se cerró sola." });
    } catch (err) {
      this.emitir({ tipo: "error", mensaje: err instanceof Error ? err.message : String(err) });
    } finally {
      this.negarPendientes();
    }
  }
}
