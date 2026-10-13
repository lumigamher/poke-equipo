import type { VistaPokemon } from "@compartido/tipos";

/** Si hay algo que contar de la tarea en curso: lo que piensa o ayudantes trabajando. */
export function tieneProgreso(vista: VistaPokemon): boolean {
  return (
    Boolean(vista.pensamiento) || (vista.ayudantes?.length ?? 0) > 0 || (vista.pendientes?.length ?? 0) > 0
  );
}

/** Medio ancho máximo del cuadro (260 px en estilos.css) y el margen que guarda con el borde de la ventana. */
const MEDIO_ANCHO = 130;
const MARGEN_BORDE = 8;

/** Cuánto se corre el cuadro (px) para caber entero en una ventana de `ancho`, centrado sobre `x` si puede. */
export function corrimiento(x: number, ancho: number): number {
  const izquierda = MARGEN_BORDE + MEDIO_ANCHO - x;
  if (izquierda > 0) return izquierda;
  const derecha = x + MEDIO_ANCHO + MARGEN_BORDE - ancho;
  return derecha > 0 ? -derecha : 0;
}

/**
 * La tarea en curso en un solo cuadro: arriba lo que piensa o ejecuta el Pokémon (el agente principal) y debajo,
 * sangrados y numerados, sus ayudantes (los subagentes) con su encargo y lo que hace cada uno. El número es el mismo
 * que lleva el ayudante dibujado a su lado. `enBurbuja`: va dentro de la burbuja abierta, con sus colores.
 */
export function Progreso({
  vista,
  enBurbuja = false,
  conRegistro = false,
  x,
}: {
  vista: VistaPokemon;
  enBurbuja?: boolean;
  /** El registro en vivo ya muestra lo que piensa, completo: aquí no se repite recortado. */
  conRegistro?: boolean;
  /** Dónde está el Pokémon (px): cerca de un borde, el cuadro se corre para no salirse de la ventana. */
  x?: number;
}) {
  const ayudantes = vista.ayudantes ?? [];
  const pendientes = vista.pendientes ?? [];
  const piensa = conRegistro ? undefined : vista.pensamiento;
  if (!tieneProgreso(vista) || (conRegistro && !pendientes.length && !ayudantes.length)) return null;
  return (
    <div
      className={enBurbuja ? "progreso progreso-en-burbuja" : "progreso"}
      aria-live="off"
      style={
        enBurbuja || x === undefined
          ? undefined
          : { transform: `translateX(calc(-50% + ${corrimiento(x, window.innerWidth)}px))` }
      }
    >
      {piensa && <p className="progreso-piensa">{piensa}</p>}
      {pendientes.length > 0 && (
        <>
          <p className="progreso-titulo">
            Tareas · {pendientes.filter((p) => p.estado === "hecha").length} de {pendientes.length}
          </p>
          <ul className="progreso-pendientes">
            {pendientes.map((p, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: la lista llega entera y en orden cada vez
              <li key={i} className={`pendiente pendiente-${p.estado}`}>
                <span className="pendiente-marca" aria-hidden="true" />
                <span className="solo-lector">
                  {p.estado === "hecha" ? "Hecha: " : p.estado === "en_curso" ? "En curso: " : "Pendiente: "}
                </span>
                {p.texto}
              </li>
            ))}
          </ul>
        </>
      )}
      {ayudantes.length > 0 && (
        <>
          <p className="progreso-titulo">
            {ayudantes.length === 1 ? "1 ayudante" : `${ayudantes.length} ayudantes`} de {vista.nombre}
          </p>
          <ol className="progreso-ayudantes">
            {ayudantes.map((a, i) => (
              <li key={a.id}>
                <span className="progreso-numero">{i + 1}</span>
                <span className="progreso-linea">
                  <span className="progreso-encargo">{a.encargo || "Ayudando"}</span>
                  {(a.detalle || a.actividad) && (
                    <span className="progreso-hace">{a.detalle ?? a.actividad?.verbo}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
