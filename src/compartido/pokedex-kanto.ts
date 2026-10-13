import { normalizar } from "./sonido";

/** Lo mínimo que la Pokédex del laboratorio necesita saber de una especie para buscarla. */
export interface EntradaPokedex {
  especie: number;
  nombre: string;
  /** Cómo se escribe en el juego, si no es el nombre («Mr. Mime», «Nidoran♀»). */
  titulo?: string;
}

/** Lo que se dibuja de una especie en la cuadrícula: el título del juego si lo tiene. */
export const rotulo = (e: EntradaPokedex): string => e.titulo ?? e.nombre;

/** El número de la Pokédex como se ve: 001, 025, 150. */
export const numeroDex = (especie: number): string => String(especie).padStart(3, "0");

/**
 * Las especies que encajan con lo escrito, en el orden de la Pokédex salvo que las que empiezan por el texto van antes
 * que las que solo lo contienen. Sin texto, todas.
 * - Solo dígitos: por número, el escrito con o sin ceros delante («15» → 15, 150 y 151; «015» → 15, 150 y 151).
 * - Si no: por nombre o título, sin importar tildes, mayúsculas ni símbolos; cuenta el comienzo de cualquier palabra
 *   («mime» halla «Mr. Mime») y, con menos prioridad, cualquier trozo («chu» halla «Pikachu»).
 */
export function filtrarEspecies<T extends EntradaPokedex>(lista: readonly T[], texto: string): T[] {
  const buscado = normalizar(texto);
  if (!buscado) return [...lista];
  if (/^\d+$/.test(buscado)) {
    const n = Number(buscado);
    if (n === 0) return [...lista];
    return lista.filter((e) => String(e.especie).startsWith(String(n)));
  }
  const compacto = buscado.replace(/\s/g, "");
  const puntuar = (e: T): number => {
    const formas = [e.nombre, e.titulo ?? ""].map((f) => normalizar(f));
    if (formas.some((f) => f.startsWith(buscado) || f.replace(/\s/g, "").startsWith(compacto))) return 0;
    if (formas.some((f) => f.split(" ").some((p) => p.startsWith(buscado)))) return 1;
    if (formas.some((f) => f.includes(buscado) || f.replace(/\s/g, "").includes(compacto))) return 2;
    return 3;
  };
  return lista
    .map((e, i) => ({ e, i, p: puntuar(e) }))
    .filter((x) => x.p < 3)
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.e);
}

/**
 * Adónde va la marca de la cuadrícula al moverla `delta` lugares entre las especies visibles (1 = la siguiente,
 * `columnas` = la de abajo). No da la vuelta: se queda en el borde. Sin marca (o si la marca ya no se ve) entra por el
 * primero al avanzar y por el último al retroceder. Null si no hay nada que marcar.
 */
export function moverMarca(visibles: readonly number[], actual: number | null, delta: number): number | null {
  if (visibles.length === 0) return null;
  const i = actual === null ? -1 : visibles.indexOf(actual);
  if (i === -1) return delta >= 0 ? visibles[0] : visibles[visibles.length - 1];
  return visibles[Math.min(visibles.length - 1, Math.max(0, i + delta))];
}

/**
 * La tecla del atajo secreto: una letra o un dígito suelto, sin Ctrl, Cmd ni Alt. Devuelve el carácter en minúscula
 * (lo que se añade a la búsqueda) o null si la tecla es otra cosa.
 */
export function teclaDeBusqueda(ev: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}): string | null {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return null;
  return /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]$/.test(ev.key) ? ev.key.toLocaleLowerCase("es") : null;
}
