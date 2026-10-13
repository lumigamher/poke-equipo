// Micrófono falso del banco de pruebas (`scripts/banco.mjs`). Solo existe en desarrollo:
// main añade `?micFalso=1` a la URL del servidor de Vite cuando lo lanza el banco (POKE_MIC_FALSO=1),
// y el Escenario, en vez de abrir el micrófono real, abre una captura que solo oye lo que el banco
// reproduce. La marca vive en la URL, así que sobrevive a las recargas del renderer.
// En producción no hay servidor de Vite (se carga el archivo) y la rama del renderer se elimina al compilar.

export const PARAMETRO_MIC_FALSO = "micFalso";

/** URL del renderer en desarrollo: con la marca del micrófono falso solo si el banco la pidió. */
export function urlRendererDev(base: string, micFalso: string | undefined): string {
  if (micFalso !== "1") return base;
  const url = new URL(base);
  url.searchParams.set(PARAMETRO_MIC_FALSO, "1");
  return url.toString();
}

/** El Escenario usa el micrófono falso solo en desarrollo y con la marca en la URL. */
export function pideMicFalso(dev: boolean, search: string): boolean {
  return dev && new URLSearchParams(search).get(PARAMETRO_MIC_FALSO) === "1";
}
