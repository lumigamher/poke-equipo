import type { CSSProperties } from "react";
import { OBJETOS } from "./sprite/actividades";

const { filas, colores } = OBJETOS.pokebola;
/** La tapa son las filas de arriba hasta la franja negra incluida; el resto es la base. */
const FIN_TAPA = 5;
/** Ángulos de las chispas: diez, repartidas con algo de desorden para que no se vea como un reloj. */
const CHISPAS = [8, 40, 75, 108, 140, 178, 212, 248, 290, 326].map((angulo, i) => ({
  angulo,
  distancia: 46 + ((i * 17) % 3) * 12,
  dorada: i % 3 === 0,
}));

/** Media pokébola en pixel art, del mismo tamaño de píxel que el sprite. */
function Mitad({ desde, hasta, className }: { desde: number; hasta: number; className: string }) {
  const ancho = filas[0].length;
  const celdas: { id: string; x: number; y: number; color: string }[] = [];
  for (let y = desde; y < hasta; y++) {
    [...filas[y]].forEach((c, x) => {
      if (c !== ".") celdas.push({ id: `${x}-${y}`, x, y: y - desde, color: colores[c] });
    });
  }
  return (
    <svg
      className={className}
      viewBox={`0 0 ${ancho} ${hasta - desde}`}
      width={ancho * 3}
      height={(hasta - desde) * 3}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {celdas.map((c) => (
        <rect key={c.id} x={c.x} y={c.y} width={1} height={1} fill={c.color} />
      ))}
    </svg>
  );
}

/** La pokébola cerrada y quieta (la de las tarjetas): el mismo dibujo, sin animación. */
export function PokebolaFija() {
  return (
    <div className="pokebola-fija" aria-hidden="true">
      <Mitad desde={0} hasta={FIN_TAPA} className="pokebola-tapa" />
      <Mitad desde={FIN_TAPA} hasta={filas.length} className="pokebola-base" />
    </div>
  );
}

/**
 * Salida (`abrir`): cae, rebota, se sacude, se abre y suelta un estallido de luz del que sale el Pokémon.
 * Regreso (`cerrar`): llega abierta, un haz rojo se lo lleva, se cierra y se va. Todo con CSS (estilos.css).
 */
export function Pokebola({ fase }: { fase: "abrir" | "cerrar" }) {
  return (
    <div className={`pokebola pokebola-${fase}`} aria-hidden="true">
      <div className="pokebola-luz">
        <span className="pokebola-haz" />
        <span className="pokebola-rayos" />
        <span className="pokebola-halo" />
        <span className="pokebola-onda" />
        {CHISPAS.map((c) => (
          <span
            key={c.angulo}
            className={`chispa ${c.dorada ? "chispa-dorada" : ""}`}
            style={{ "--a": `${c.angulo}deg`, "--d": `${c.distancia}px` } as CSSProperties}
          />
        ))}
      </div>
      <div className="pokebola-bola">
        <Mitad desde={0} hasta={FIN_TAPA} className="pokebola-tapa" />
        <Mitad desde={FIN_TAPA} hasta={filas.length} className="pokebola-base" />
      </div>
    </div>
  );
}
