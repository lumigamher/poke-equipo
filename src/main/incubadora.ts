import type { Estado } from "@compartido/tipos";
import type { Escondido } from "./preferencias";

/** Mientras está en uno de estos sigue en medio de una tarea: el que se escondió solo no sale todavía. */
const EN_TAREA: ReadonlySet<Estado> = new Set(["trabajando", "pidiendo_permiso", "escuchando"]);

/**
 * Los escondidos después de este cambio de estados. Con `auto`, el que empieza a trabajar se esconde solo; el que se
 * escondió solo sale al dejar la tarea (aunque se haya apagado el modo) o al irse de la pantalla. A los escondidos a
 * mano no los toca. Si nada cambia devuelve el mismo objeto.
 */
export function actualizarEscondidos(
  escondidos: Record<string, Escondido>,
  vistas: { id: string; estado: Estado }[],
  auto: boolean,
): Record<string, Escondido> {
  const estados = new Map(vistas.map((v) => [v.id, v.estado]));
  const nuevos: Record<string, Escondido> = {};
  let cambio = false;
  for (const [id, como] of Object.entries(escondidos)) {
    const estado = estados.get(id);
    if (como === "auto" && (estado === undefined || !EN_TAREA.has(estado))) cambio = true;
    else nuevos[id] = como;
  }
  if (auto) {
    for (const v of vistas) {
      if (v.estado === "trabajando" && !nuevos[v.id]) {
        nuevos[v.id] = "auto";
        cambio = true;
      }
    }
  }
  return cambio ? nuevos : escondidos;
}

/** Lo que dice si un Pokémon escondido necesita a la persona. */
export interface DatosAsomo {
  estado: Estado;
  permiso: object | null;
  abierta?: boolean;
  sinLeer?: boolean;
}

/** El escondido asoma de su pokébola cuando te necesita: permiso, error, te escucha, su burbuja abierta o algo sin leer. */
export function asoma(v: DatosAsomo): boolean {
  return (
    v.permiso !== null ||
    v.estado === "pidiendo_permiso" ||
    v.estado === "error" ||
    v.estado === "escuchando" ||
    v.abierta === true ||
    v.sinLeer === true
  );
}

/** Las marcas de incubadora que viajan con la vista: nada si no está escondido. */
export function marcasIncubadora(
  v: DatosAsomo & { id: string },
  escondidos: Record<string, Escondido>,
): { escondido?: true; asoma?: true } {
  if (!escondidos[v.id]) return {};
  return asoma(v) ? { escondido: true, asoma: true } : { escondido: true };
}
