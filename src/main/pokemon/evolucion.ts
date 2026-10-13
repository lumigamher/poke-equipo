/** Una evolución: la especie `de` se vuelve `a` cuando el Pokémon ha terminado `tareas` tareas en total. */
interface Evolucion {
  de: number;
  a: number;
  tareas: number;
}

/** Primera evolución a las 15 tareas y segunda a las 40; las de una sola etapa, a las 25. Eevee no evoluciona solo. */
const EVOLUCIONES: Evolucion[] = [
  { de: 1, a: 2, tareas: 15 },
  { de: 2, a: 3, tareas: 40 },
  { de: 4, a: 5, tareas: 15 },
  { de: 5, a: 6, tareas: 40 },
  { de: 7, a: 8, tareas: 15 },
  { de: 8, a: 9, tareas: 40 },
  { de: 172, a: 25, tareas: 15 },
  { de: 25, a: 26, tareas: 40 },
  { de: 92, a: 93, tareas: 15 },
  { de: 93, a: 94, tareas: 40 },
  { de: 39, a: 40, tareas: 25 },
  { de: 52, a: 53, tareas: 25 },
  { de: 54, a: 55, tareas: 25 },
  { de: 446, a: 143, tareas: 25 },
  { de: 447, a: 448, tareas: 25 },
];

/** La especie a la que le toca evolucionar a un Pokémon con esas tareas terminadas, o null si todavía no. */
export function evolucionPara(especie: number, tareas: number): number | null {
  const e = EVOLUCIONES.find((x) => x.de === especie);
  return e && tareas >= e.tareas ? e.a : null;
}

/** Cuántas tareas le faltan para evolucionar; null si su especie no evoluciona. */
export function tareasParaEvolucionar(especie: number, tareas: number): number | null {
  const e = EVOLUCIONES.find((x) => x.de === especie);
  return e ? Math.max(0, e.tareas - tareas) : null;
}
