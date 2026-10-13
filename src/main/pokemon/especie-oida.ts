import { buscarLlamado, type Candidato, normalizar } from "../oido/nombres";
import type { Especie } from "./especies";

/** Distancia de edición (insertar, borrar o cambiar una letra). */
function distancia(a: string, b: string): number {
  let fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const nueva = [i];
    for (let j = 1; j <= b.length; j++) {
      nueva[j] = Math.min(fila[j] + 1, nueva[j - 1] + 1, fila[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    fila = nueva;
  }
  return fila[b.length];
}

/** Cuántas letras de diferencia se perdonan según el largo del nombre: los cortos casi ninguna. */
function tolerancia(largo: number): number {
  return largo <= 3 ? 1 : Math.min(4, Math.floor(largo * 0.3));
}

/** Por sonido se perdona menos que por letras: hasta tres diferencias, y solo en nombres largos. */
function toleranciaSonido(largo: number): number {
  return largo <= 4 ? 1 : Math.min(3, Math.ceil(largo * 0.25));
}

const soloLetras = (texto: string) => normalizar(texto).replace(/[^a-z0-9]/g, "");

/**
 * Cómo suena en español, más o menos: el transcriptor escribe los nombres de oído ("Escuela", "Scourt", "Square"
 * por Squirtle), así que se compara también por sonido. "qu" y "c" dura son k, "w" y "ou" son u, la "s" líquida
 * lleva e delante, "tle" suena "tel", sin h ni letras dobles.
 */
export function fonetica(texto: string): string {
  return (
    soloLetras(texto)
      .replace(/ph/g, "f")
      // La "ch" es su propio sonido (se marca con C para que no se vuelva k ni s).
      .replace(/ch/g, "C")
      .replace(/qu/g, "ku")
      .replace(/ck|c(?![ei])|q/g, "k")
      .replace(/[cz]/g, "s")
      .replace(/h/g, "")
      .replace(/ou|oo|w/g, "u")
      .replace(/ee|y/g, "i")
      .replace(/ll/g, "i")
      .replace(/v/g, "b")
      .replace(/x/g, "ks")
      .replace(/tle$/, "tel")
      .replace(/^s(?=[bcdfgkmnpqt])/, "es")
      .replace(/(.)\1+/g, "$1")
  );
}

/**
 * La especie cuyo nombre, título o variante oída CURADA (`oidos`) es exactamente lo dicho o escrito (sin tildes,
 * mayúsculas ni símbolos). Es la única coincidencia que actúa sola; una aproximada (`resolverEspecie`) solo sugiere o
 * exige que las dos transcripciones coincidan.
 */
export function resolverExacta(oido: string, disponibles: readonly Especie[]): Especie | null {
  const buscado = soloLetras(oido);
  if (!buscado) return null;
  return (
    disponibles.find((e) =>
      [e.nombre, e.titulo ?? "", ...(e.oidos ?? [])].some((forma) => soloLetras(forma) === buscado),
    ) ?? null
  );
}

/**
 * La especie que el transcriptor quiso escribir. Los nombres de Pokémon no son palabras del español y salen torcidos
 * ("Tarmander", "bolbasar", "Square"), sobre todo en frases cortas: se toma la especie disponible más parecida
 * (por su nombre o por sus variantes oídas), si queda dentro de la tolerancia y es claramente mejor que la segunda.
 * Null si no se parece a ninguna.
 */
export function resolverEspecie(oido: string, disponibles: readonly Especie[]): Especie | null {
  const buscado = soloLetras(oido);
  if (!buscado) return null;
  const sonido = fonetica(oido);
  let mejor: Especie | null = null;
  let menor = Number.POSITIVE_INFINITY;
  let segunda = Number.POSITIVE_INFINITY;
  for (const e of disponibles) {
    // La distancia de una especie es la de su forma más cercana: el nombre o alguna de sus variantes oídas.
    let propia = Number.POSITIVE_INFINITY;
    const formas = [e.nombre, ...(e.oidos ?? [])];
    for (const [i, forma] of formas.entries()) {
      const f = soloLetras(forma);
      if (f === buscado) return e;
      const d = distancia(buscado, f);
      // El nombre real perdona varias letras; una variante oída ya es una aproximación: solo una letra más.
      const limite = i === 0 ? tolerancia(f.length) : Math.min(1, tolerancia(f.length));
      if (d <= limite && d < propia) propia = d;
      if (i > 0) continue;
      // El nombre real también se compara por sonido.
      const son = fonetica(forma);
      const ds = distancia(sonido, son);
      if (ds <= toleranciaSonido(son.length) && ds < propia) propia = ds;
    }
    if (propia < menor) {
      segunda = menor;
      menor = propia;
      mejor = e;
    } else if (propia < segunda) {
      segunda = propia;
    }
  }
  // Empate entre dos especies: no se adivina.
  return mejor !== null && menor < segunda ? mejor : null;
}

/**
 * Quién del equipo (en pantalla o guardado) tiene ese nombre propio, o un apodo aprendido. Solo cuentan los que tienen
 * nombre propio (los que llevan `alias`: el nombre de su especie): llamar por la especie lo resuelve el catálogo.
 */
export function buscarMiembro(oido: string, equipo: readonly Candidato[]): Candidato | null {
  const propios = equipo
    .filter((c) => (c.alias ?? []).length > 0)
    .map((c) => ({ id: c.id, nombre: c.nombre, apodos: c.apodos }));
  const hallado = buscarLlamado(oido, propios);
  return hallado ? (equipo.find((c) => c.id === hallado.id) ?? null) : null;
}
