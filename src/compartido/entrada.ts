import type { Estado } from "./tipos";

/** Lo que dura la entrada con pokébola (la animación `abrir` de estilos.css); la máquina de estados usa el mismo. */
export const ENTRADA_MS = 2100;

/**
 * ¿Este cambio de estado es una ENTRADA a escena (hay que dibujar la pokébola abriéndose)?
 * Sí al aparecer por primera vez (`antes` null) y al volver a salir tras guardarse. No mientras se guarda. Así un
 * Pokémon que recibe un encargo en cuanto sale (llamada con tarea, llamar_pokemon) no pierde la pokébola a medias
 * porque su estado pase enseguida de `saliendo` a `trabajando`.
 */
export function debeEntrar(antes: Estado | null, ahora: Estado): boolean {
  if (ahora === "guardandose") return false;
  return antes === null || antes === "guardandose";
}
