import { readFileSync, writeFileSync } from "node:fs";

/** Lo que la persona ajusta desde el menú del Pokémon y debe seguir igual al volver a abrir la app. */
export interface Preferencias {
  /** Pokémon (por id) que se quedan quietos donde están en vez de pasear. */
  quietos: string[];
  /** Texto más grande en burbujas y rótulos. */
  textoGrande: boolean;
  /** La persona ya hizo (o saltó) el recorrido de la primera vez. */
  recorridoHecho: boolean;
  /** Marcó "No volver a mostrar" en el aviso de que falta iniciar sesión en Claude Code. */
  ocultarAvisoSesion: boolean;
}

export const PREFERENCIAS_POR_DEFECTO: Preferencias = {
  quietos: [],
  textoGrande: false,
  recorridoHecho: false,
  ocultarAvisoSesion: false,
};

/** Lo que haya de válido en `dato`; lo demás, por defecto. */
export function validarPreferencias(dato: unknown): Preferencias {
  const d = (dato && typeof dato === "object" ? dato : {}) as Record<string, unknown>;
  return {
    quietos: Array.isArray(d.quietos) ? d.quietos.filter((x): x is string => typeof x === "string") : [],
    textoGrande: d.textoGrande === true,
    recorridoHecho: d.recorridoHecho === true,
    ocultarAvisoSesion: d.ocultarAvisoSesion === true,
  };
}

/** Un archivo que falta o está roto no impide arrancar: se usan las de por defecto. */
export function leerPreferencias(ruta: string): Preferencias {
  try {
    return validarPreferencias(JSON.parse(readFileSync(ruta, "utf8")));
  } catch {
    return { ...PREFERENCIAS_POR_DEFECTO };
  }
}

export function guardarPreferencias(ruta: string, p: Preferencias): void {
  writeFileSync(ruta, `${JSON.stringify(p, null, 2)}\n`);
}

/** Pone o quita a `id` de los quietos. */
export function alternarQuieto(p: Preferencias, id: string): Preferencias {
  const estaba = p.quietos.includes(id);
  return { ...p, quietos: estaba ? p.quietos.filter((x) => x !== id) : [...p.quietos, id] };
}
