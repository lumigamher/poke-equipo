import { join } from "node:path";

/**
 * El SDK de Claude trae su propio ejecutable de Claude Code en un paquete por plataforma
 * (`@anthropic-ai/claude-agent-sdk-<plataforma>-<arquitectura>/claude`, unos 240 MB). No hace falta instalar
 * Claude Code aparte para que la app arranque; sí hace falta una SESIÓN iniciada (el login de tu cuenta).
 *
 * Empaquetada, ese ejecutable tiene que estar fuera del asar (`asarUnpack`): un binario no se puede ejecutar desde
 * dentro de un asar. Por eso la app calcula la ruta ella misma y se la pasa al SDK (`pathToClaudeCodeExecutable`).
 */
export function rutaClaudeIncluido(o: {
  plataforma: NodeJS.Platform;
  arch: string;
  /** La carpeta node_modules que contiene @anthropic-ai (la desempaquetada si la app está instalada). */
  raizModulos: string;
}): string {
  const nombre = o.plataforma === "win32" ? "claude.exe" : "claude";
  return join(o.raizModulos, "@anthropic-ai", `claude-agent-sdk-${o.plataforma}-${o.arch}`, nombre);
}

export type DiagnosticoClaude =
  | { tipo: "ok" }
  /** El ejecutable que debía venir con la app no está: instalación dañada o incompleta. */
  | { tipo: "sin_ejecutable"; ruta: string }
  /** El ejecutable está, pero no hay una sesión de Claude Code iniciada en este equipo. */
  | { tipo: "sin_sesion"; ruta: string };

export interface DepsDiagnostico {
  ruta: string;
  existe(ruta: string): boolean;
  /** true si hay credenciales de Claude Code (llavero de macOS, archivo de credenciales o token en el entorno). */
  hayCredenciales(): Promise<boolean>;
}

export async function diagnosticarClaude(d: DepsDiagnostico): Promise<DiagnosticoClaude> {
  if (!d.existe(d.ruta)) return { tipo: "sin_ejecutable", ruta: d.ruta };
  if (!(await d.hayCredenciales())) return { tipo: "sin_sesion", ruta: d.ruta };
  return { tipo: "ok" };
}

export interface MensajeClaude {
  titulo: string;
  detalle: string;
}

/** Lo que se le dice a la persona, con el comando exacto para arreglarlo. */
export function mensajeDeDiagnostico(d: Exclude<DiagnosticoClaude, { tipo: "ok" }>): MensajeClaude {
  if (d.tipo === "sin_ejecutable")
    return {
      titulo: "Falta el motor de Claude Code",
      detalle: [
        "Poke Equipo trae dentro el motor de Claude Code que usan los Pokémon para trabajar, y no lo encuentro:",
        d.ruta,
        "Parece que la instalación quedó incompleta. Vuelve a instalar la app desde el .dmg (arrástrala a Aplicaciones de nuevo). Sin ese motor los Pokémon se pueden oír y hablar, pero no pueden trabajar.",
      ].join("\n\n"),
    };
  return {
    titulo: "Falta iniciar sesión en Claude Code",
    detalle: [
      "Los Pokémon trabajan con tu cuenta de Claude (tu suscripción), y en este equipo no hay una sesión iniciada.",
      "Para iniciarla, abre la app Terminal, ejecuta este comando y escribe /login cuando se abra:",
      `"${d.ruta}"`,
      "Si ya tienes Claude Code instalado, basta con abrir una terminal, ejecutar «claude» e iniciar sesión allí. Después cierra y vuelve a abrir Poke Equipo.",
    ].join("\n\n"),
  };
}
