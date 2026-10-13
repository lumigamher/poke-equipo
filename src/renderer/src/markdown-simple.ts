/** Un trozo de línea: texto corriente, negrita o código. */
export interface Trozo {
  tipo: "texto" | "negrita" | "codigo";
  texto: string;
}

export type BloqueMd =
  | { tipo: "parrafo"; trozos: Trozo[] }
  | { tipo: "titulo"; trozos: Trozo[] }
  | { tipo: "lista"; ordenada: boolean; items: Trozo[][] }
  | { tipo: "codigo"; texto: string };

/** Parte una línea en texto, **negrita** y `código`. Lo que no cierra se deja como texto. */
export function trozosDe(linea: string): Trozo[] {
  const trozos: Trozo[] = [];
  const marca = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let desde = 0;
  for (const m of linea.matchAll(marca)) {
    if (m.index > desde) trozos.push({ tipo: "texto", texto: linea.slice(desde, m.index) });
    const t = m[0];
    trozos.push(
      t.startsWith("`")
        ? { tipo: "codigo", texto: t.slice(1, -1) }
        : { tipo: "negrita", texto: t.slice(2, -2) },
    );
    desde = m.index + t.length;
  }
  if (desde < linea.length) trozos.push({ tipo: "texto", texto: linea.slice(desde) });
  return trozos;
}

/**
 * Lo básico del markdown que escribe Claude Code, para leer una respuesta larga sin asteriscos sueltos: párrafos,
 * títulos, listas, bloques de código, negrita y código en línea. Nada de HTML: todo sale como texto.
 */
export function bloquesMarkdown(texto: string): BloqueMd[] {
  const bloques: BloqueMd[] = [];
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  let parrafo: string[] = [];
  const cerrarParrafo = () => {
    if (parrafo.length > 0) bloques.push({ tipo: "parrafo", trozos: trozosDe(parrafo.join(" ")) });
    parrafo = [];
  };
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    if (linea.trimStart().startsWith("```")) {
      cerrarParrafo();
      const codigo: string[] = [];
      for (i++; i < lineas.length && !lineas[i].trimStart().startsWith("```"); i++) codigo.push(lineas[i]);
      bloques.push({ tipo: "codigo", texto: codigo.join("\n") });
      continue;
    }
    const titulo = /^#{1,6}\s+(.*)$/.exec(linea);
    if (titulo) {
      cerrarParrafo();
      bloques.push({ tipo: "titulo", trozos: trozosDe(titulo[1]) });
      continue;
    }
    const item = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/.exec(linea);
    if (item) {
      cerrarParrafo();
      const ordenada = item[2] !== undefined;
      const previa = bloques.at(-1);
      if (previa?.tipo === "lista" && previa.ordenada === ordenada) previa.items.push(trozosDe(item[3]));
      else bloques.push({ tipo: "lista", ordenada, items: [trozosDe(item[3])] });
      continue;
    }
    if (linea.trim() === "") cerrarParrafo();
    else parrafo.push(linea.trim());
  }
  cerrarParrafo();
  return bloques;
}
