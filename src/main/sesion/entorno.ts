/**
 * Entorno del proceso hijo de Claude Code: sin API key y sin variables CLAUDE* heredadas,
 * para que use el login de la persona. Conserva ANTHROPIC_BASE_URL y ANTHROPIC_AUTH_TOKEN a propósito
 * (La persona usa routers que dependen de ellas). No muta la entrada.
 */
export function entornoLimpio(env: NodeJS.ProcessEnv): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue;
    if (k === "ANTHROPIC_API_KEY" || k.startsWith("CLAUDE")) continue;
    salida[k] = v;
  }
  return salida;
}

/**
 * Una app abierta desde el Finder hereda un PATH mínimo (/usr/bin:/bin…): no ve Homebrew, bun ni nvm, y la
 * herramienta Bash de Claude Code no encontraría las herramientas del proyecto. Se añaden los sitios usuales
 * al final (lo que ya estaba manda). Desde una terminal el PATH ya es el bueno y esto no cambia nada.
 */
export function ampliarPath(actual: string | undefined, home: string): string {
  const base = (actual ?? "").split(":").filter(Boolean);
  const usuales = [
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    `${home}/.bun/bin`,
    `${home}/.local/bin`,
    `${home}/.cargo/bin`,
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ];
  return [...new Set([...base, ...usuales])].join(":");
}
