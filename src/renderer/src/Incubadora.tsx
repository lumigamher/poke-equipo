import type { VistaPokemon } from "@compartido/tipos";
import { ESTADO_LEGIBLE } from "./burbuja-logica";
import { PokebolaFija } from "./Pokebola";
import { xRanura } from "./ranuras-incubadora";

/**
 * La incubadora: una pokébola mini por cada Pokémon escondido, en la esquina de abajo a la derecha (sobre el Dock).
 * Siguen trabajando; la bola se mece mientras trabaja y salta cuando te necesita (y el Pokémon asoma a su lado).
 * Clic: lo saca. Clic derecho: su menú de siempre.
 */
export function Incubadora({ vistas }: { vistas: VistaPokemon[] }) {
  if (vistas.length === 0) return null;
  const ancho = window.innerWidth;
  return (
    // biome-ignore lint/a11y/useSemanticElements: un grupo de botones a la vista; un fieldset no es un formulario aquí
    <div className="incubadora" role="group" aria-label="Incubadora">
      {vistas.map((v, i) => {
        const necesita = v.asoma === true;
        const estado = necesita && v.permiso ? "pide permiso" : ESTADO_LEGIBLE[v.estado];
        return (
          <button
            key={v.id}
            type="button"
            data-captura=""
            className={`incubadora-bola${necesita ? " incubadora-bola-asoma" : ""}${
              v.estado === "trabajando" ? " incubadora-bola-trabaja" : ""
            }`}
            style={{ left: `${xRanura(i, ancho)}px` }}
            aria-label={`${v.nombre}, ${estado}. Sacar de la incubadora`}
            onClick={() => window.poke.sacar(v.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              window.poke.menu(v.id);
            }}
          >
            <PokebolaFija />
            <span className="incubadora-nombre" aria-hidden="true">
              {v.nombre} · {estado}
            </span>
          </button>
        );
      })}
    </div>
  );
}
