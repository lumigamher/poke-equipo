const CORREDOR =
  /(^|[\s;&|])(bunx? (run )?(test|vitest)|(npm|npx) (run )?(test|vitest|jest|playwright test)|pnpm (run )?test|yarn test|vitest|jest|pytest|playwright test|go test|cargo test)\b/;

/** Dice si un comando de consola lanza una suite de pruebas. */
export function esComandoDePruebas(comando: string): boolean {
  return CORREDOR.test(comando);
}

function aTexto(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(aTexto).join("\n");
  if (v && typeof v === "object") return Object.values(v).map(aTexto).join("\n");
  return "";
}

/**
 * Para un comando que terminó con error (hook `PostToolUseFailure`): si era un corredor de pruebas, el
 * resultado es "fallo" aunque la salida no traiga cifras. Una interrupción del usuario no dice nada.
 */
export function resultadoDeTestsFallido(
  comando: string,
  _error: unknown,
  interrumpido = false,
): "fallo" | null {
  if (interrumpido || !CORREDOR.test(comando)) return null;
  return "fallo";
}

/** Mira la salida de un comando de pruebas y dice si pasaron, fallaron, o no se sabe. */
export function resultadoDeTests(comando: string, respuesta: unknown): "paso" | "fallo" | null {
  if (!CORREDOR.test(comando)) return null;
  const texto = aTexto(respuesta);
  if (/\b[1-9]\d*\s+(failed|failing|failures?|errors?)\b/i.test(texto) || /^\s*(FAIL|FAILED)\b/m.test(texto))
    return "fallo";
  if (/\b[1-9]\d*\s+(passed|passing)\b/i.test(texto)) return "paso";
  return null;
}
