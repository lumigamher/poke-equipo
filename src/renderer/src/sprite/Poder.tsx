import type { CSSProperties } from "react";
import { CUADRO_MS, EFECTOS, type HojaEfecto, type TipoPoder } from "./poderes";
import { ESCALA } from "./Sprite";

/** Lo que tarda el proyectil en llegar al objeto; el estallido y la sacudida del objeto salen al terminar. */
export const VUELO_MS = 280;

/** Lo común a las dos hojas: el recorte de un cuadro, a la escala del Pokémon y centrado en su punto. */
function recorte(h: HojaEfecto): CSSProperties {
  const lado = h.lado * ESCALA;
  return {
    width: lado,
    height: lado,
    marginLeft: -lado / 2,
    marginBottom: -lado / 2,
    backgroundImage: `url("poke://assets/poderes/${h.nombre}.png")`,
    backgroundSize: `${h.total * lado}px ${lado}px`,
    ["--recorrido" as string]: `${-h.cuadros * lado}px`,
  };
}

/**
 * El poder de un golpe, con los efectos originales del juego: el proyectil del tipo del Pokémon vuela hasta el
 * objeto y estalla donde pega; de cerca ("impacto") solo el estallido. Arranca cuando el ataque conecta
 * (`conectaMs` después de montarse). Va hacia la derecha y se voltea entero si el objeto está a la izquierda.
 * Decorativo: no recibe el mouse.
 */
export function Poder({
  tipo,
  modo,
  lado,
  conectaMs,
  distancia,
}: {
  tipo: TipoPoder;
  modo: "proyectil" | "impacto";
  lado: "derecha" | "izquierda";
  conectaMs: number;
  /** Hasta dónde vuela, en píxeles; por defecto, hasta el objeto de la actividad. */
  distancia?: number;
}) {
  const { proyectil, impacto } = EFECTOS[tipo];
  const vuelo = modo === "proyectil" ? VUELO_MS : 0;
  const cicloProyectil = proyectil.cuadros * CUADRO_MS;
  const duraImpacto = impacto.cuadros * CUADRO_MS;
  const llega = conectaMs + vuelo;
  return (
    <div
      className={`poder-lugar poder-${lado}`}
      aria-hidden="true"
      style={distancia === undefined ? undefined : { ["--poder-distancia" as string]: `${distancia}px` }}
    >
      {modo === "proyectil" && (
        <div
          className="poder-proyectil"
          style={{
            ...recorte(proyectil),
            animation: `poder-volar ${vuelo}ms linear ${conectaMs}ms forwards, poder-cuadros ${cicloProyectil}ms steps(${proyectil.cuadros}) ${conectaMs}ms infinite`,
          }}
        />
      )}
      <div
        className="poder-impacto"
        style={{
          ...recorte(impacto),
          animation: `poder-ver ${duraImpacto}ms step-end ${llega}ms, poder-cuadros ${duraImpacto}ms steps(${impacto.cuadros}) ${llega}ms forwards`,
        }}
      />
    </div>
  );
}
