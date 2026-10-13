import { distancia, normalizar, seTomaPor, suenaIgual } from "@compartido/sonido";

export interface Candidato {
  id: string;
  nombre: string;
  apodos: string[];
  /** Otros nombres con los que también responde (el de su especie, si le pusieron uno propio). */
  alias?: string[];
}

export interface Llamado {
  id: string;
  resto: string;
}

export { distancia, normalizar };

function oraciones(texto: string): string[] {
  return texto
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function coincide(palabra: string, c: Candidato): boolean {
  if (c.apodos.includes(palabra)) return true;
  return [c.nombre, ...(c.alias ?? [])].some((n) => seTomaPor(palabra, normalizar(n)));
}

/**
 * Quita el nombre de especie (alias) de quien lo tiene si la voz podría tomarlo por el nombre propio o un apodo de OTRO
 * miembro del equipo: ahí gana el nombre propio. El nombre propio y los apodos de cada uno no se tocan.
 */
export function sinChoques(candidatos: Candidato[]): Candidato[] {
  return candidatos.map((c) => {
    if (!c.alias || c.alias.length === 0) return c;
    const ajenos = candidatos.filter((o) => o.id !== c.id);
    const alias = c.alias.filter(
      (a) => !ajenos.some((o) => [o.nombre, ...o.apodos].some((n) => suenaIgual(a, n))),
    );
    return alias.length === c.alias.length ? c : { ...c, alias };
  });
}

/** Busca el nombre o un apodo en las dos primeras palabras de alguna oración del trozo. */
export function buscarLlamado(texto: string, candidatos: Candidato[]): Llamado | null {
  const partes = oraciones(texto);
  for (let i = 0; i < partes.length; i++) {
    const palabras = partes[i].split(/\s+/);
    for (let j = 0; j < Math.min(2, palabras.length); j++) {
      const hallado = candidatos.find((c) => coincide(normalizar(palabras[j]), c));
      if (!hallado) continue;
      const resto = [palabras.slice(j + 1).join(" "), ...partes.slice(i + 1)]
        .join(" ")
        .replace(/^[\s,.:;!?]+/, "")
        .trim();
      return { id: hallado.id, resto };
    }
  }
  return null;
}

/** De lo que la transcripción escribió cuando la persona dijo el nombre, saca las formas que conviene aceptar. */
export function aprenderApodos(
  nombre: string,
  transcripciones: string[],
  maximo = 8,
  /** Variantes que no se deben aprender (una palabra de mando, el nombre de otro del equipo…). */
  descartar: (variante: string) => boolean = () => false,
): string[] {
  const base = normalizar(nombre);
  const cuenta = new Map<string, number>();
  for (const t of transcripciones) {
    for (const p of new Set(normalizar(t).split(" "))) {
      if (p.length < 3 || p === base) continue;
      cuenta.set(p, (cuenta.get(p) ?? 0) + 1);
    }
  }
  // Repetida basta si todavía se parece al nombre; una palabra cualquiera repetida (charla de fondo) no.
  const limiteRepetida = Math.max(2, Math.ceil(base.length / 2));
  return [...cuenta.entries()]
    .filter(([p, veces]) => {
      const d = distancia(p, base);
      if (descartar(p)) return false;
      // Las de 3 o 4 letras (lo que pide un nombre corto) son fáciles de confundir con otra cosa: dos veces y a una letra.
      if (p.length < 5) return veces >= 2 && d <= 1;
      return d <= Math.floor(base.length / 2) || (veces >= 2 && d <= limiteRepetida);
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, maximo)
    .map(([p]) => p);
}
