/** Lo mínimo de `webContents` que se usa aquí (así se prueba sin Electron). */
export interface WebContentsMinimo {
  on(
    evento: "will-navigate",
    fn: (e: { preventDefault(): void; url?: string }, url?: string) => void,
  ): unknown;
  setWindowOpenHandler(fn: () => { action: "deny" }): unknown;
}

/**
 * Ninguna ventana de la app navega a otra página ni abre ventanas nuevas: el renderer solo muestra lo suyo. Si un
 * texto de Claude o un enlace intentara llevarlo a una web, se cancela.
 */
export function endurecerVentana(wc: WebContentsMinimo, opciones: { origenDev?: string } = {}): void {
  wc.on("will-navigate", (e, urlLegada) => {
    // Solo en desarrollo: la recarga completa del servidor de Vite navega a su propia URL y debe poder pasar.
    if (opciones.origenDev && origenDe(e.url ?? urlLegada) === opciones.origenDev) return;
    e.preventDefault();
  });
  wc.setWindowOpenHandler(() => ({ action: "deny" }));
}

/** El origen (`http://localhost:5173`) de una URL, o null si no es una URL válida. */
export function origenDe(url: string | undefined): string | null {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

/** El origen del servidor de Vite si se está en desarrollo con él; empaquetada (o sin él) no hay excepción. */
export const origenDeDesarrollo = (dev: string | undefined): string | undefined =>
  (dev && origenDe(dev)) || undefined;

/**
 * La URL del servidor de Vite (`ELECTRON_RENDERER_URL`) solo se respeta en desarrollo: una app instalada nunca
 * carga una página que le diga una variable de entorno.
 */
export function urlRendererDeDesarrollo(
  empaquetada: boolean,
  env: Record<string, string | undefined>,
): string | undefined {
  if (empaquetada) return undefined;
  return env.ELECTRON_RENDERER_URL || undefined;
}
