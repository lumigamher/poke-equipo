import { useEffect, useState } from "react";
import { REDUCIDO } from "../ceremonia-hooks";
import { celdasTexto, colorFondoTexto, type NombreObjeto, OBJETOS } from "./actividades";
import { ESCALA } from "./Sprite";

/** Cada cuánto aparece una celda de texto nueva: ritmo de alguien que teclea con calma. */
const TECLA_MS = 90;
/** Celdas de pausa, con todo escrito, antes de borrar y empezar otra vez. */
const PAUSA = 14;

function celdas(tipo: NombreObjeto, texto: Set<string>) {
  const { filas, colores } = OBJETOS[tipo];
  const fondo: { id: string; x: number; y: number; color: string }[] = [];
  filas.forEach((fila, y) => {
    [...fila].forEach((c, x) => {
      if (c === "." || texto.has(`${x}-${y}`)) return;
      fondo.push({ id: `${x}-${y}`, x, y, color: colores[c] });
    });
  });
  return fondo;
}

/** Cuántas celdas de texto se ven ahora; sin movimiento, todas. */
function useEscritura(total: number): number {
  const [n, setN] = useState(total);
  useEffect(() => {
    if (total === 0) return;
    const consulta = window.matchMedia(REDUCIDO);
    let reloj = 0;
    const arrancar = () => {
      clearInterval(reloj);
      if (consulta.matches) {
        setN(total);
        return;
      }
      setN(0);
      reloj = window.setInterval(() => setN((v) => (v >= total + PAUSA ? 0 : v + 1)), TECLA_MS);
    };
    arrancar();
    consulta.addEventListener("change", arrancar);
    return () => {
      consulta.removeEventListener("change", arrancar);
      clearInterval(reloj);
    };
  }, [total]);
  return n;
}

/**
 * Un objeto de pixel art dibujado celda a celda; no recibe el mouse ni se anuncia. Si tiene texto (pantalla,
 * consola, libreta, pizarra), el texto se va escribiendo solo con un cursor que parpadea donde va.
 */
export function Objeto({ tipo }: { tipo: NombreObjeto }) {
  const { filas, colores } = OBJETOS[tipo];
  const texto = celdasTexto(tipo);
  const claves = new Set(texto.map((c) => `${c.x}-${c.y}`));
  const n = useEscritura(texto.length);
  const ancho = filas[0].length;
  const cursor = n < texto.length ? texto[n] : null;
  const fondo = colorFondoTexto(tipo);
  return (
    <svg
      className="objeto"
      width={ancho * ESCALA}
      height={filas.length * ESCALA}
      viewBox={`0 0 ${ancho} ${filas.length}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {celdas(tipo, claves).map((c) => (
        <rect key={c.id} x={c.x} y={c.y} width={1} height={1} fill={c.color} />
      ))}
      {/* Lo que no se ha escrito se pinta con el color del fondo sobre el que se escribe. */}
      {texto.map((c, i) => {
        const color = colores[filas[c.y][c.x]];
        return (
          <rect
            key={`t-${c.x}-${c.y}`}
            x={c.x}
            y={c.y}
            width={1}
            height={1}
            fill={i < n ? color : (fondo ?? color)}
          />
        );
      })}
      {cursor && <rect className="objeto-cursor" x={cursor.x} y={cursor.y} width={1} height={1} />}
    </svg>
  );
}
