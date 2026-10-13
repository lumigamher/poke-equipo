import { resumenPermiso } from "@compartido/permiso-legible";

const TAREAS = new Set(["TodoWrite", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet"]);

/**
 * Una acción de herramienta en palabras, para el registro de la burbuja. Reusa las frases del bloque de permisos
 * (`resumenPermiso`) y les agrega lo que ahí va aparte: el comando entero, lo que se busca, el encargo del ayudante.
 */
export function accionLegible(herramienta: string, detalle: string | undefined): string {
  const d = (detalle ?? "").trim();
  if (herramienta === "Bash") return d ? `Correr: ${d}` : resumenPermiso(herramienta, d);
  if (herramienta === "Grep") return d ? `Buscar «${d}»` : "Buscar en el código";
  if (herramienta === "Glob") return d ? `Buscar archivos «${d}»` : "Buscar archivos";
  if (TAREAS.has(herramienta)) return "Actualizar la lista de tareas";
  if (herramienta === "Agent" || herramienta === "Task")
    return d ? `Lanzar un ayudante: ${d}` : resumenPermiso(herramienta, d);
  return resumenPermiso(herramienta, d);
}

/** Quita la línea «VOZ: …» (lo que se dice en voz alta, también si va a medias): no es parte de lo que se lee. */
export function sinVoz(texto: string): string {
  // También un «V», «VO» o «VOZ» que va llegando al comienzo de la última línea: no debe parpadear.
  return texto
    .replace(/\s*\bVOZ:[\s\S]*$/, "")
    .replace(/\n\s*V(?:OZ?)?$/, "")
    .trimEnd();
}
