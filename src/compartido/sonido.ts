/** Cómo se comparan los nombres "por sonido": lo comparten la resolución por voz (main) y el validador de nombres. */

export function normalizar(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function distancia(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/**
 * ¿La palabra oída (ya normalizada) se toma por ese nombre (ya normalizado)? Igual, o con hasta un tercio de las
 * letras distintas; las palabras oídas de menos de 5 letras se parecen a demasiadas cosas y solo valen iguales.
 */
export function seTomaPor(palabra: string, nombre: string): boolean {
  if (palabra === nombre) return true;
  if (palabra.length < 5) return false;
  return distancia(palabra, nombre) <= Math.floor(nombre.length / 3);
}

/** Dos nombres chocan si la voz podría tomar uno por el otro (en cualquiera de los dos sentidos). */
export function suenaIgual(a: string, b: string): boolean {
  const na = normalizar(a);
  const nb = normalizar(b);
  return seTomaPor(na, nb) || seTomaPor(nb, na);
}

/**
 * Cómo suena en español, más o menos, para comparar palabras cortas: "ci", "zi", "sy" y "sii" suenan "si"; "noo", "no".
 * c/z antes de e/i son s; qu/k/c duras son k; y/ll son i; v es b; la h no suena; w es u; las letras repetidas se funden.
 */
export function plegar(t: string): string {
  return normalizar(t)
    .replace(/\s/g, "")
    .replace(/ph/g, "f")
    .replace(/qu/g, "k")
    .replace(/c(?=[ei])/g, "s")
    .replace(/z/g, "s")
    .replace(/ck|c|q/g, "k")
    .replace(/ll|y/g, "i")
    .replace(/v/g, "b")
    .replace(/h/g, "")
    .replace(/w/g, "u")
    .replace(/x/g, "ks")
    .replace(/(.)\1+/g, "$1");
}

/**
 * ¿Se confunde con una palabra de mando corta? Al sonar igual; y si el nombre es de 3 letras o menos, también a una
 * letra de distancia de una palabra de mando de 4 o menos ("Ci", "Zi", "Sy", "Sii" son «sí»; "Noa" es «no»). Un nombre
 * de 4 letras o más solo choca si suena exactamente igual: «Luna», «Sasha» o «Max» no se confunden con «una», «saca» o
 * «mas» (esas ni siquiera son palabras de mando).
 */
export function suenaCorta(nombre: string, mando: string): boolean {
  const pn = plegar(nombre);
  const pm = plegar(mando);
  if (pn === pm) return true;
  return pn.length <= 3 && pm.length <= 4 && distancia(pn, pm) <= 1;
}
