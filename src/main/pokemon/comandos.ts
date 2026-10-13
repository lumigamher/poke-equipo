import type { ComandoVista } from "@compartido/tipos";

/** Qué hacer con un texto escrito que empieza con "/". */
export type Comando =
  | { tipo: "modelo"; modelo: string | null }
  | { tipo: "reiniciar" }
  | { tipo: "especie"; valor: string }
  | { tipo: "pokedex" }
  | { tipo: "movimientos" }
  | { tipo: "medalla"; texto: string }
  /** Cualquier otro comando lo resuelve Claude Code: se envía tal cual, como un mensaje. */
  | { tipo: "claude"; texto: string };

/** Los que atiende la app; el resto los lista el SDK. `/model` va aquí porque su selector no existe en el SDK. */
export const COMANDOS_LOCALES: ComandoVista[] = [
  {
    nombre: "model",
    descripcion: "Cambia el modelo de esta sesión (opus, sonnet, haiku, fable)",
    argumento: "<modelo>",
  },
  {
    nombre: "pokemon",
    descripcion: "Cambia de Pokémon: nombre, número de la Pokédex o azar",
    argumento: "<nombre>",
  },
  {
    nombre: "reiniciar",
    descripcion: "Reinicia la sesión de Claude Code y retoma la conversación",
    argumento: "",
  },
  {
    nombre: "movimientos",
    descripcion: "Muestra los cuatro movimientos de este Pokémon; «usa <movimiento>» lo dispara",
    argumento: "",
  },
  {
    nombre: "pokedex",
    descripcion: "Muestra en qué ha trabajado cada Pokémon, cuánto tiempo y sus medallas",
    argumento: "",
  },
  {
    nombre: "medalla",
    descripcion: "Le das una medalla a este Pokémon por un despliegue o una feature cerrada",
    argumento: "<por qué>",
  },
  // /nombre también lo atiende el equipo (necesita saber quién más está en el equipo).
  {
    nombre: "nombre",
    descripcion: "Le pone otro nombre a este Pokémon (uno corto y sonoro se entiende mejor)",
    argumento: "<nombre>",
  },
  // Los siguientes los atiende el equipo (EquipoActivo.comando), no el controlador de cada Pokémon.
  {
    nombre: "llamar",
    descripcion: "Saca a otro Pokémon de la pokébola o uno nuevo, con un encargo opcional",
    argumento: "<especie> [encargo]",
  },
  {
    nombre: "equipo",
    descripcion: "Saca a los Pokémon que trabajan en un proyecto",
    argumento: "<proyecto>",
  },
  {
    nombre: "combate",
    descripcion:
      "Este Pokémon revisa el último trabajo de otro que esté en pantalla; el veredicto decide quién gana",
    argumento: "<rival>",
  },
  {
    nombre: "guardar",
    descripcion: "Guarda a este Pokémon en la pokébola",
    argumento: "",
  },
];

/** null si el texto no es un comando. */
export function leerComando(texto: string): Comando | null {
  const t = texto.trim();
  if (!t.startsWith("/") || t.length < 2) return null;
  const [cabeza, ...resto] = t.slice(1).split(/\s+/);
  const nombre = cabeza.toLowerCase();
  if (nombre === "model" || nombre === "modelo")
    return { tipo: "modelo", modelo: resto[0]?.toLowerCase() || null };
  if (nombre === "reiniciar" || nombre === "restart") return { tipo: "reiniciar" };
  if (nombre === "pokemon" || nombre === "pokémon") return { tipo: "especie", valor: resto.join(" ") };
  if (nombre === "movimientos" || nombre === "movimiento") return { tipo: "movimientos" };
  if (nombre === "pokedex" || nombre === "pokédex") return { tipo: "pokedex" };
  if (nombre === "medalla") return { tipo: "medalla", texto: resto.join(" ") };
  return { tipo: "claude", texto: t };
}

/** Los locales primero; del SDK, los que no choquen con un local. Sin duplicados, en orden alfabético. */
export function unirComandos(locales: ComandoVista[], sdk: ComandoVista[]): ComandoVista[] {
  const vistos = new Set(locales.map((c) => c.nombre));
  const otros: ComandoVista[] = [];
  for (const c of sdk) {
    if (!c.nombre || vistos.has(c.nombre)) continue;
    vistos.add(c.nombre);
    otros.push(c);
  }
  otros.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return [...locales, ...otros];
}
