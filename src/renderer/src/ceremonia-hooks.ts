import {
  DURACION_MS,
  DURACION_REDUCIDA_MS,
  type FaseCeremonia,
  LINEA,
  LINEA_REDUCIDA,
} from "@compartido/ceremonia";
import type { PasoLab } from "@compartido/laboratorio";
import { useEffect, useRef, useState } from "react";

/** La consulta de "menos movimiento": una sola para toda la app. */
export const REDUCIDO = "(prefers-reduced-motion: reduce)";

/** Si la persona pidió menos movimiento. Sigue el cambio del ajuste mientras la pantalla está abierta. */
export function useReducido(): boolean {
  const [reducido, setReducido] = useState(() => window.matchMedia(REDUCIDO).matches);
  useEffect(() => {
    const consulta = window.matchMedia(REDUCIDO);
    const alCambiar = () => setReducido(consulta.matches);
    consulta.addEventListener("change", alCambiar);
    return () => consulta.removeEventListener("change", alCambiar);
  }, []);
  return reducido;
}

/**
 * La fase de la ceremonia según el paso del laboratorio: corre su línea de tiempo en "ceremonia", queda en el texto
 * final en "nombre" y "carpeta" (también si se saltó) y es null fuera de ella. Al terminar avisa una vez.
 */
export function useFaseCeremonia(
  paso: PasoLab,
  reducido: boolean,
  alTerminar: () => void,
): FaseCeremonia | null {
  const [fase, setFase] = useState<FaseCeremonia | null>(null);
  const fin = useRef(alTerminar);
  fin.current = alTerminar;
  useEffect(() => {
    if (paso === "nombre" || paso === "carpeta") {
      setFase("texto");
      return;
    }
    if (paso !== "ceremonia") {
      setFase(null);
      return;
    }
    const linea = reducido ? LINEA_REDUCIDA : LINEA;
    setFase(linea[0].fase);
    const timers = linea.slice(1).map((m) => setTimeout(() => setFase(m.fase), m.desdeMs));
    timers.push(setTimeout(() => fin.current(), reducido ? DURACION_REDUCIDA_MS : DURACION_MS));
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [paso, reducido]);
  return fase;
}
