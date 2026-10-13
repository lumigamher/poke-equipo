import { esManana } from "@compartido/dia-noche";
/** Lo que la Pokédex sabe de un Pokémon: en qué trabajó, cuánto y qué ganó. */
export interface FichaPokedex {
  nombre: string;
  especie: number;
  shiny: boolean;
  tareas: number;
  /** Tiempo total trabajado, en milisegundos. */
  ms: number;
  medallas: string[];
  /** Sus últimos encargos, del más reciente al más viejo. */
  ultimas: { orden: string; carpeta: string; fin: number }[];
}

/** "2 h 10 min", "45 min", "menos de 1 min". */
export function duracion(ms: number): string {
  const minutos = Math.floor(ms / 60_000);
  if (minutos < 1) return "menos de 1 min";
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const corto = (texto: string, largo: number) => {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > largo ? `${limpio.slice(0, largo - 1)}…` : limpio;
};

const proyecto = (carpeta: string) => carpeta.split("/").filter(Boolean).at(-1) ?? carpeta;

/** La Pokédex como texto para la burbuja: una ficha por Pokémon, con más trabajo primero. */
export function textoPokedex(fichas: FichaPokedex[]): string {
  if (fichas.length === 0) return "La Pokédex está vacía: todavía nadie ha terminado una tarea.";
  const orden = [...fichas].sort((a, b) => b.tareas - a.tareas || a.nombre.localeCompare(b.nombre));
  return orden
    .map((f) => {
      const cabeza = [
        `${f.nombre}${f.shiny ? " (shiny)" : ""}`,
        `${f.tareas} ${f.tareas === 1 ? "tarea" : "tareas"}`,
        duracion(f.ms),
        ...(f.medallas.length > 0
          ? [`${f.medallas.length} ${f.medallas.length === 1 ? "medalla" : "medallas"}`]
          : []),
      ].join(" · ");
      const lineas = [cabeza];
      for (const m of f.medallas.slice(0, 3)) lineas.push(`  Medalla: ${corto(m, 60)}`);
      for (const u of f.ultimas.slice(0, 3)) lineas.push(`  ${proyecto(u.carpeta)}: ${corto(u.orden, 70)}`);
      return lineas.join("\n");
    })
    .join("\n\n");
}

/**
 * Shiny: una tarea que termina con las pruebas en verde a la primera, es decir, corrió pruebas en el turno, alguna
 * pasó y ninguna falló.
 */
export function ganaShiny(tests: { paso: boolean; fallo: boolean }): boolean {
  return tests.paso && !tests.fallo;
}

const inicioDelDia = (ahora: number) => {
  const d = new Date(ahora);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * Lo que el primero de la mañana cuenta al salir: en qué quedó cada Pokémon. Null si no es de mañana, si hoy ya se
 * trabajó (el resumen es para arrancar el día, no para repetirlo) o si no hay nada que contar.
 */
export function resumenManana(fichas: FichaPokedex[], ahora: number): string | null {
  if (!esManana(new Date(ahora).getHours())) return null;
  const hoy = inicioDelDia(ahora);
  const ultimas = fichas.flatMap((f) => (f.ultimas[0] ? [{ nombre: f.nombre, ...f.ultimas[0] }] : []));
  if (ultimas.length === 0 || ultimas.some((u) => u.fin >= hoy)) return null;
  const lineas = ultimas
    .sort((a, b) => b.fin - a.fin)
    .slice(0, 4)
    .map((u) => `${u.nombre}, en ${proyecto(u.carpeta)}: ${corto(u.orden, 70)}`);
  return `Buenos días. Así quedamos:\n${lineas.join("\n")}`;
}
