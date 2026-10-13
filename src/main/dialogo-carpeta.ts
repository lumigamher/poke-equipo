export interface DepsDialogo {
  /**
   * Quita la escena de los Pokémon de en medio (es una ventana a pantalla completa, siempre-encima en nivel
   * "screen-saver", y se pintaría SOBRE el diálogo). Devuelve la función que la deja exactamente como estaba.
   */
  apartarEscena(): () => void;
  /** Trae la app al primer plano; las ventanas de los Pokémon son siempre-encima y taparían el diálogo. */
  traerAlFrente(): void;
  /** Diálogo sin ventana padre: la del Pokémon es un panel sin foco y una hoja colgada de él podría no salir. */
  abrir(opciones: { title?: string; buttonLabel: string; properties: ["openDirectory"] }): Promise<{
    filePaths: string[];
  }>;
}

/** Pide una carpeta con el diálogo al frente. Devuelve null si se cancela. Solo elige: nunca aprueba nada. */
export async function elegirCarpeta(deps: DepsDialogo, title?: string): Promise<string | null> {
  const restaurar = deps.apartarEscena();
  try {
    deps.traerAlFrente();
    const r = await deps.abrir({ title, buttonLabel: "Elegir carpeta", properties: ["openDirectory"] });
    return r.filePaths[0] ?? null;
  } finally {
    // Al elegir, al cancelar y si abrir falla: la escena siempre vuelve.
    restaurar();
  }
}
