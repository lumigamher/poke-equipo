import type { VistaPokemon } from "@compartido/tipos";
import { etiquetaChip } from "./burbuja-logica";

/**
 * Una burbuja cerrada: un botón pequeño con el nombre, el estado en texto y, si toca, el indicador "pide permiso" o
 * "habla". Al pulsarlo se pide a main que esa burbuja sea la abierta; un permiso en chip no se responde (ni por voz
 * ni con clic) hasta abrirlo.
 */
export function BurbujaChip({ vista, onElegir }: { vista: VistaPokemon; onElegir(): void }) {
  const { estado, indicador, aria } = etiquetaChip(vista);
  const tono = vista.permiso ? "chip-permiso" : indicador ? "chip-habla" : "";
  return (
    <button type="button" className={`chip ${tono}`} aria-label={aria} onClick={onElegir}>
      <span className="chip-punto" aria-hidden="true" />
      <span className="chip-nombre">{vista.nombre}</span>
      <span className="chip-estado">{indicador || estado}</span>
    </button>
  );
}
