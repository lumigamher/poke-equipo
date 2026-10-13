const ULTIMO = (ruta: string) => ruta.split("/").filter(Boolean).pop() ?? ruta;

/**
 * Lo que el Pokémon quiere hacer, en una frase que se entiende sin leer el detalle crudo: "Crear o reescribir
 * login.ts", "Correr: bun run test". Solo describe; no decide nada sobre el permiso.
 */
export function resumenPermiso(herramienta: string, detalle: string): string {
  const d = detalle.trim();
  switch (herramienta) {
    case "Bash":
      // El comando va justo debajo, entero: aquí no se repite.
      return "Correr un comando en la terminal";
    case "Write":
      return d ? `Crear o reescribir el archivo ${ULTIMO(d)}` : "Crear o reescribir un archivo";
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return d ? `Modificar el archivo ${ULTIMO(d)}` : "Modificar un archivo";
    case "Read":
      return d ? `Leer el archivo ${ULTIMO(d)}` : "Leer un archivo";
    case "WebFetch":
      return "Abrir una página de internet";
    case "WebSearch":
      return "Buscar en internet";
    case "Agent":
    case "Task":
      return "Lanzar un ayudante (subagente)";
    default:
      return herramienta.startsWith("mcp__")
        ? `Usar la herramienta externa ${herramienta.split("__").slice(1).join(" · ")}`
        : `Usar la herramienta ${herramienta}`;
  }
}
