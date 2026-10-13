import { join } from "node:path";

/** Dónde viven los datos que no son del repo (modelos de voz y sprites de Pokémon). */
export interface RutasDatos {
  /** Carpeta que contiene `models/` y `assets/`. */
  raiz: string;
  modelos: string;
  /** assets/pokemon: una carpeta por especie y `poderes/`. */
  assets: string;
}

export interface EntradaRaiz {
  /** true = app instalada (`app.isPackaged`). */
  empaquetada: boolean;
  /** La raíz del repo en desarrollo (`app.getAppPath()`). */
  repo: string;
  /** `app.getPath("userData")`. */
  userData: string;
}

/**
 * Una sola decisión para todo el proceso: en desarrollo los datos son los del repo (models/ y assets/pokemon/,
 * como siempre, ignorados por git); instalada, viven en una carpeta `datos` dentro de userData, que sobrevive a
 * las actualizaciones de la app.
 */
export function rutasDeDatos({ empaquetada, repo, userData }: EntradaRaiz): RutasDatos {
  const raiz = empaquetada ? join(userData, "datos") : repo;
  return { raiz, modelos: join(raiz, "models"), assets: join(raiz, "assets", "pokemon") };
}
