import { type RefObject, useEffect, useMemo, useState } from "react";
import { ESCALA } from "./sprite/Sprite";
import { COLORES_MATA, cercanos, MATAS, RADIO_ENTORNO, sembrar } from "./suelo";

/** Cada cuánto se mira por dónde andan los Pokémon: brotar no necesita más precisión. */
const MIRAR_MS = 200;

/**
 * El suelo por donde caminan: uno que otro pastico pequeño que brota cerca de cada Pokémon y se recoge cuando se
 * aleja, para que no ande solo en una pantalla vacía. Discreto a propósito. Va detrás de ellos, no recibe el mouse
 * ni se anuncia. Las posiciones se leen de un ref: que caminen no repinta la escena.
 */
export function Entorno({ posiciones }: { posiciones: RefObject<Map<string, number>> }) {
  const suelo = useMemo(() => sembrar(window.innerWidth, Math.random), []);
  const [vistos, setVistos] = useState("");
  useEffect(() => {
    const mirar = () => setVistos(cercanos(suelo, posiciones.current?.values() ?? [], RADIO_ENTORNO));
    mirar();
    const reloj = window.setInterval(mirar, MIRAR_MS);
    return () => clearInterval(reloj);
  }, [suelo, posiciones]);
  const visibles = new Set(vistos ? vistos.split(",").map(Number) : []);
  return (
    <div className="entorno" aria-hidden="true">
      {suelo.map(({ x, mata }, i) => {
        const filas = MATAS[mata];
        const ancho = filas[0].length;
        return (
          <svg
            // biome-ignore lint/suspicious/noArrayIndexKey: el suelo se siembra una vez y no cambia de orden
            key={i}
            className={`adorno ${visibles.has(i) ? "adorno-visible" : ""}`}
            style={{ left: x - (ancho * ESCALA) / 2 }}
            width={ancho * ESCALA}
            height={filas.length * ESCALA}
            viewBox={`0 0 ${ancho} ${filas.length}`}
            shapeRendering="crispEdges"
            aria-hidden="true"
          >
            {filas.flatMap((fila, y) =>
              [...fila].map((c, cx) =>
                c === "." ? null : (
                  // biome-ignore lint/suspicious/noArrayIndexKey: rejilla fija, la posición es la identidad
                  <rect key={`${cx}-${y}`} x={cx} y={y} width={1} height={1} fill={COLORES_MATA[c]} />
                ),
              ),
            )}
          </svg>
        );
      })}
    </div>
  );
}
