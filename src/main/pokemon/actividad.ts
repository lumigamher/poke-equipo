import type { Actividad } from "@compartido/tipos";
import type { EventoSesion } from "../sesion/sesion";
import { esComandoDePruebas } from "../sesion/tests";

/** Tiempo mínimo entre dos cambios visibles de actividad: menos que esto se ve como un parpadeo de poses y objetos. */
export const ACTIVIDAD_MS = 2500;

const POR_HERRAMIENTA: Record<string, Actividad> = {
  Write: "programando",
  Edit: "programando",
  MultiEdit: "programando",
  NotebookEdit: "programando",
  TodoWrite: "planeando",
  ExitPlanMode: "planeando",
  Read: "leyendo",
  Grep: "buscando",
  Glob: "buscando",
  WebSearch: "explorando",
  WebFetch: "explorando",
  Agent: "delegando",
  Task: "delegando",
};

export const VERBOS: Record<Actividad, string[]> = {
  programando: ["Tecleando", "Programando", "Escribiendo código"],
  pensando: ["Pensando", "Cavilando", "Dándole vueltas"],
  planeando: ["Planeando", "Trazando el plan", "Organizando"],
  leyendo: ["Leyendo", "Hojeando", "Repasando"],
  buscando: ["Buscando", "Olfateando", "Rastreando"],
  ejecutando: ["Ejecutando", "Cargando energía", "Corriendo comandos"],
  probando: ["Probando", "Entrenando", "Corriendo pruebas"],
  explorando: ["Explorando", "Mirando a lo lejos", "Navegando"],
  delegando: ["Delegando", "Llamando refuerzos", "Lanzando pokébola"],
  publicando: ["Publicando", "Enviando cambios", "Lanzando al mundo"],
  herramienta: ["Usando herramienta", "Trasteando", "Manipulando"],
  respondiendo: ["Respondiendo", "Redactando", "Anotando"],
};

/** Comandos que sacan el trabajo de la máquina: guardar en git, subirlo o desplegarlo. */
const PUBLICAR =
  /(^|[\s;&|])(git\s+(push|commit|merge|tag)|gh\s+(pr|release)\s+create|vercel|rsync|scp)(\s|$)|\b(deploy|publish)\b/;

export function esComandoDePublicar(comando: string): boolean {
  return PUBLICAR.test(comando);
}

export function clasificar(e: Extract<EventoSesion, { tipo: "actividad" }>): Actividad {
  if (e.clase === "pensando") return "pensando";
  if (e.clase === "respondiendo") return "respondiendo";
  const nombre = e.herramienta ?? "";
  if (nombre === "Bash") {
    const comando = e.detalle ?? "";
    if (esComandoDePruebas(comando)) return "probando";
    return esComandoDePublicar(comando) ? "publicando" : "ejecutando";
  }
  return Object.hasOwn(POR_HERRAMIENTA, nombre) ? POR_HERRAMIENTA[nombre] : "herramienta";
}

export function elegirVerbo(a: Actividad, azar: () => number): string {
  const lista = VERBOS[a];
  return lista[Math.min(lista.length - 1, Math.floor(azar() * lista.length))];
}
