import { type ModeloRemoto, pasosDeModelos } from "../descarga/modelos";
import type { Paso } from "../descarga/pasos";
import { pasoDeEspecie, pasoDePoderes } from "../descarga/pokemon";
import { CATALOGO } from "./pokemon/especies";

/** Los cuatro del laboratorio (Bulbasaur, Charmander, Squirtle, Pikachu): los únicos que se bajan de entrada. */
export const ESPECIES_INICIALES = [1, 4, 7, 25] as const;

export interface RutasPasos {
  modelos: string;
  assets: string;
}

const nombreDe = (especie: number): string =>
  CATALOGO.find((e) => e.especie === especie)?.nombre ?? `Pokémon ${especie}`;

export const pasoDeEspecieCatalogo = (rutas: RutasPasos, especie: number): Paso =>
  pasoDeEspecie(rutas.assets, especie, nombreDe(especie));

/** Lo que hace falta para llegar al laboratorio: modelos, poderes y los cuatro iniciales. */
export function pasosMinimos(rutas: RutasPasos, modelos?: readonly ModeloRemoto[]): Paso[] {
  return [
    ...pasosDeModelos({ dirModelos: rutas.modelos, modelos }),
    pasoDePoderes(rutas.assets),
    ...ESPECIES_INICIALES.map((e) => pasoDeEspecieCatalogo(rutas, e)),
  ];
}

/** El resto del catálogo (Kanto y las demás), en orden de Pokédex: se baja en segundo plano. */
export const especiesDeFondo = (): number[] =>
  CATALOGO.map((e) => e.especie)
    .filter((e) => !(ESPECIES_INICIALES as readonly number[]).includes(e))
    .sort((a, b) => a - b);
