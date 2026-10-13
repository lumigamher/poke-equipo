import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface DepsCredenciales {
  plataforma: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  home: string;
  existe(ruta: string): boolean;
  /** macOS: true si el llavero tiene la credencial de Claude Code (solo mira que exista, no la lee ni pide permiso). */
  llavero(): Promise<boolean>;
}

/**
 * ¿Hay una sesión de Claude Code iniciada en este equipo? Es una comprobación de cortesía para avisar a tiempo, no una
 * garantía: Claude Code guarda el login en el llavero de macOS (o en ~/.claude/.credentials.json en otros sistemas).
 * La app no pasa ANTHROPIC_API_KEY ni variables CLAUDE* a la sesión (ver entorno.ts), así que solo cuenta el token
 * de ANTHROPIC_AUTH_TOKEN, que sí se conserva.
 */
export async function hayCredencialesClaude(d: DepsCredenciales): Promise<boolean> {
  if (d.env.ANTHROPIC_AUTH_TOKEN) return true;
  if (d.existe(join(d.home, ".claude", ".credentials.json"))) return true;
  if (d.plataforma === "darwin") return d.llavero();
  return false;
}

const llaveroMac = (): Promise<boolean> =>
  new Promise((resolver) => {
    execFile(
      "/usr/bin/security",
      ["find-generic-password", "-s", "Claude Code-credentials"],
      { timeout: 5000 },
      (error) => resolver(!error),
    );
  });

/** Con las dependencias reales. */
export const hayCredencialesClaudeReal = (): Promise<boolean> =>
  hayCredencialesClaude({
    plataforma: process.platform,
    env: process.env,
    home: homedir(),
    existe: existsSync,
    llavero: llaveroMac,
  });
