/** Lo que la persona tarda, como mínimo, en ver un permiso y decidir qué responder. */
export const REACCION_MS = 800;

/** Clave de un permiso a la vista: el Pokémon que lo pidió y el permiso. El separador no puede salir en un id. */
const clave = (pokemonId: string, permisoId: string) => `${pokemonId}\u0000${permisoId}`;

/**
 * Una respuesta por voz solo vale para un permiso si la frase EMPEZÓ (según cuándo se capturó su primera muestra)
 * al menos REACCION_MS después de que ESE permiso, de ESE Pokémon, se mostró. Sin hora fiable, no vale.
 * Cada permiso cuenta desde que apareció: uno nuevo de otro Pokémon no mueve la hora de los demás.
 */
export function crearGuardiaPermiso() {
  let mostrados = new Map<string, number>();
  return {
    /**
     * Recibe todo lo que hay a la vista. True solo cuando aparece un permiso que no estaba (lo que se venía oyendo
     * empezó antes y no puede responderlo); que uno se conteste o desaparezca no es motivo para descartar nada.
     */
    alVista(vistas: { id: string; permiso: { id: string } | null }[], ahoraMs: number): boolean {
      const nuevo = new Map<string, number>();
      let aparecio = false;
      for (const v of vistas) {
        if (!v.permiso) continue;
        const k = clave(v.id, v.permiso.id);
        const desde = mostrados.get(k);
        if (desde === undefined) aparecio = true;
        nuevo.set(k, desde ?? ahoraMs);
      }
      mostrados = nuevo;
      return aparecio;
    },
    /** True solo si la frase empezó ≥ REACCION_MS después de que ese permiso de ese Pokémon se mostró. */
    puedeResponder(inicioFraseMs: number | null, pokemonId: string, permisoId: string): boolean {
      const desde = mostrados.get(clave(pokemonId, permisoId));
      if (desde === undefined || inicioFraseMs === null || !Number.isFinite(inicioFraseMs)) return false;
      return inicioFraseMs >= desde + REACCION_MS;
    },
  };
}

/**
 * Valida lo que llega por IPC al responder un permiso con un clic: { permitir: boolean, pokemonId y permisoId:
 * texto no vacío }. Sin el id del Pokémon no vale: un clic solo responde el permiso de ESE Pokémon con ESE id.
 */
export function validarRespuestaPermiso(
  r: unknown,
): { permitir: boolean; pokemonId: string; permisoId: string } | null {
  if (typeof r !== "object" || r === null || Array.isArray(r)) return null;
  const { permitir, pokemonId, permisoId } = r as Record<string, unknown>;
  if (typeof permitir !== "boolean") return null;
  if (typeof pokemonId !== "string" || pokemonId === "") return null;
  if (typeof permisoId !== "string" || permisoId === "") return null;
  return { permitir, pokemonId, permisoId };
}
