import { INICIALES_ESPECIES } from "./inicial";
import { esModeloElegible, siguienteModelo } from "./modelos";

/** Dónde va el laboratorio de la primera vez. Pura: el renderer solo dibuja lo que esto dice. */
export type PasoLab = "elegir" | "confirmar" | "ceremonia" | "nombre" | "modelo" | "carpeta" | "salir";

export interface EstadoLab {
  paso: PasoLab;
  /** Índice de la pokébola con el foco o elegida con flechas (la "marcada" del radiogroup); null hasta entonces. */
  enfocada: number | null;
  /** Índice del Pokémon que se asoma: el del foco o el del cursor (el cursor solo asoma, no marca). */
  asomada: number | null;
  /** Índice del elegido, desde que se pide confirmación hasta que se cancela la carpeta. */
  elegida: number | null;
  /** Ya se pulsó Escape una vez: otro seguido cierra la app. */
  avisoSalir: boolean;
  /** El nombre ya dado, desde que se deja hasta que se vuelve a elegir; null antes. */
  nombre: string | null;
  /** El modelo marcado en el paso del modelo (id de `MODELOS`); null hasta llegar a él. */
  modelo: string | null;
  /** La «Pokédex de Kanto» (el huevo de pascua) está abierta en lugar de las cuatro pokébolas. Solo en el paso de elegir. */
  pokedex: boolean;
  /** Lo escrito en su búsqueda (nombre o número); vacío = todas. */
  filtro: string;
  /** Número de la Pokédex de quien se eligió ahí, desde que se pide confirmación hasta que se cancela; null si se eligió una de las cuatro. */
  otra: number | null;
}

export type Evento =
  | { tipo: "enfocar"; indice: number }
  | { tipo: "asomar"; indice: number }
  | { tipo: "mover"; delta: 1 | -1 }
  | { tipo: "escoger"; indice: number }
  /** Abre la Pokédex de Kanto (el botón «¿Buscas a otro?» o el atajo de teclado, que ya trae lo escrito). */
  | { tipo: "abrirPokedex"; filtro?: string }
  | { tipo: "cerrarPokedex" }
  | { tipo: "filtrar"; texto: string }
  /** Elige a alguien de la Pokédex de Kanto: el renderer solo manda las que main dijo que están disponibles. */
  | { tipo: "escogerOtra"; especie: number }
  | { tipo: "confirmar" }
  | { tipo: "volver" }
  | { tipo: "escape" }
  | { tipo: "saltar" }
  | { tipo: "ceremoniaTerminada" }
  /** Ya tiene nombre (el escrito, o el de la especie si lo dejó): el renderer lo validó antes de mandarlo. */
  | { tipo: "nombrar"; nombre: string; modeloInicial?: string }
  /** Marca un modelo con el ratón (las flechas usan `mover`). */
  | { tipo: "escogerModelo"; modelo: string }
  /** Deja el modelo marcado: el laboratorio ya tiene todo y main pide la carpeta. */
  | { tipo: "modelar" }
  | { tipo: "carpetaCancelada" }
  | { tipo: "salir" };

/** Lo que el renderer le dice a main: la especie elegida con su nombre y modelo (main pide la carpeta) o cerrar la app. */
export type Efecto = { tipo: "elegida"; especie: number; nombre: string; modelo: string } | { tipo: "salir" };

/** El modelo con el que se preselecciona si el del tipo no está en la lista. */
const MODELO_RESPALDO = "sonnet";

export const ESTADO_INICIAL: EstadoLab = {
  paso: "elegir",
  enfocada: null,
  asomada: null,
  elegida: null,
  avisoSalir: false,
  nombre: null,
  modelo: null,
  pokedex: false,
  filtro: "",
  otra: null,
};

/** La escena del Pokémon recién salido de su pokébola sigue a la vista hasta que se va a la carpeta. */
export const activaCeremonia = (paso: PasoLab): boolean =>
  paso === "ceremonia" || paso === "nombre" || paso === "modelo" || paso === "carpeta";

/** Cuánto se guarda de lo escrito en la búsqueda. */
const MAX_FILTRO = 24;

const valido = (i: number, total: number) => Number.isInteger(i) && i >= 0 && i < total;

/** Hay alguien elegido: una de las cuatro pokébolas o alguien de la Pokédex de Kanto. */
const hayElegida = (e: EstadoLab) => e.elegida !== null || e.otra !== null;

const aNombre = (e: EstadoLab): { estado: EstadoLab } =>
  hayElegida(e) ? { estado: { ...e, paso: "nombre" } } : { estado: e };

const aModelo = (
  e: EstadoLab,
  nombre: unknown,
  modeloInicial: unknown,
): { estado: EstadoLab; efecto?: Efecto } =>
  !hayElegida(e) || typeof nombre !== "string" || nombre === ""
    ? { estado: e }
    : {
        // Si ya había uno marcado (se volvió atrás desde el modelo), se conserva.
        estado: {
          ...e,
          paso: "modelo",
          nombre,
          modelo: e.modelo ?? (esModeloElegible(modeloInicial) ? modeloInicial : MODELO_RESPALDO),
        },
      };

const aCarpeta = (e: EstadoLab): { estado: EstadoLab; efecto?: Efecto } =>
  !hayElegida(e) || e.nombre === null || e.modelo === null
    ? { estado: e }
    : {
        estado: { ...e, paso: "carpeta" },
        efecto: {
          tipo: "elegida",
          especie: e.otra ?? INICIALES_ESPECIES[e.elegida as number],
          nombre: e.nombre,
          modelo: e.modelo,
        },
      };

/** De vuelta a la elección: si se había escogido en la Pokédex de Kanto, se regresa a ella (con su búsqueda). */
const aElegir = (e: EstadoLab): EstadoLab => ({
  ...e,
  paso: "elegir",
  elegida: null,
  pokedex: e.otra !== null || e.pokedex,
  otra: null,
  avisoSalir: false,
  nombre: null,
  modelo: null,
});

/**
 * Un paso de la máquina. Lo que no toca en el paso actual se ignora. Cerrar el laboratorio solo se puede eligiendo o
 * confirmando; durante la ceremonia solo se salta, en el nombre solo se nombra o se vuelve atrás, en el modelo solo
 * se marca uno, se deja o se vuelve atrás, y con la carpeta abierta no se atiende nada.
 */
export function reducir(e: EstadoLab, ev: Evento, total: number): { estado: EstadoLab; efecto?: Efecto } {
  const quieto = { estado: e };
  switch (e.paso) {
    case "elegir":
      switch (ev.tipo) {
        case "enfocar":
          return valido(ev.indice, total)
            ? { estado: { ...e, enfocada: ev.indice, asomada: ev.indice, avisoSalir: false } }
            : quieto;
        case "asomar":
          return valido(ev.indice, total) ? { estado: { ...e, asomada: ev.indice } } : quieto;
        case "mover": {
          // Con la Pokédex abierta las flechas son de su cuadrícula (las mueve el renderer), no de las pokébolas.
          if (e.pokedex) return quieto;
          const desde = e.enfocada ?? (ev.delta === 1 ? total - 1 : 0);
          const a = (desde + ev.delta + total) % total;
          return { estado: { ...e, enfocada: a, asomada: a, avisoSalir: false } };
        }
        case "escoger":
          return !e.pokedex && valido(ev.indice, total)
            ? {
                estado: {
                  ...e,
                  paso: "confirmar",
                  elegida: ev.indice,
                  enfocada: ev.indice,
                  avisoSalir: false,
                },
              }
            : quieto;
        case "abrirPokedex":
          return e.pokedex
            ? quieto
            : { estado: { ...e, pokedex: true, filtro: ev.filtro ?? "", avisoSalir: false } };
        case "cerrarPokedex":
          return e.pokedex ? { estado: { ...e, pokedex: false, filtro: "" } } : quieto;
        case "filtrar":
          return e.pokedex ? { estado: { ...e, filtro: ev.texto.slice(0, MAX_FILTRO) } } : quieto;
        case "escogerOtra":
          return e.pokedex && Number.isInteger(ev.especie) && ev.especie > 0
            ? {
                estado: {
                  ...e,
                  paso: "confirmar",
                  otra: ev.especie,
                  elegida: null,
                  enfocada: null,
                  avisoSalir: false,
                },
              }
            : quieto;
        // Con la Pokédex abierta, Escape la cierra (no cuenta para salir de la app).
        case "escape":
          if (e.pokedex) return { estado: { ...e, pokedex: false, filtro: "" } };
          return e.avisoSalir
            ? { estado: { ...e, paso: "salir" }, efecto: { tipo: "salir" } }
            : { estado: { ...e, avisoSalir: true } };
        case "salir":
          return { estado: { ...e, paso: "salir" }, efecto: { tipo: "salir" } };
        default:
          return quieto;
      }
    case "confirmar":
      switch (ev.tipo) {
        case "confirmar":
          return { estado: { ...e, paso: "ceremonia" } };
        case "volver":
        case "escape":
          return { estado: aElegir(e) };
        case "salir":
          return { estado: { ...e, paso: "salir" }, efecto: { tipo: "salir" } };
        default:
          return quieto;
      }
    case "ceremonia":
      switch (ev.tipo) {
        case "saltar":
        case "escape":
        case "ceremoniaTerminada":
          return aNombre(e);
        default:
          return quieto;
      }
    case "nombre":
      switch (ev.tipo) {
        case "nombrar":
          return aModelo(e, ev.nombre, ev.modeloInicial);
        // Atrás: la ceremonia ya pasó (no se repite), así que se vuelve a la elección, como desde la confirmación.
        case "volver":
        case "escape":
          return { estado: aElegir(e) };
        default:
          return quieto;
      }
    case "modelo":
      switch (ev.tipo) {
        case "mover":
          return e.modelo === null
            ? quieto
            : { estado: { ...e, modelo: siguienteModelo(e.modelo, ev.delta) } };
        case "escogerModelo":
          return esModeloElegible(ev.modelo) ? { estado: { ...e, modelo: ev.modelo } } : quieto;
        case "modelar":
          return aCarpeta(e);
        // Atrás: al nombre, que se conserva (nombre y modelo siguen guardados).
        case "volver":
        case "escape":
          return { estado: { ...e, paso: "nombre" } };
        default:
          return quieto;
      }
    case "carpeta":
      return ev.tipo === "carpetaCancelada"
        ? e.otra !== null
          ? // Quien se eligió en la Pokédex de Kanto: de vuelta a ella, con la búsqueda que había.
            { estado: { ...ESTADO_INICIAL, pokedex: true, filtro: e.filtro } }
          : { estado: { ...ESTADO_INICIAL, enfocada: e.elegida, asomada: e.elegida } }
        : quieto;
    case "salir":
      return quieto;
  }
}

/**
 * A qué pokébola debe ir el foco del teclado tras un cambio de la bola enfocada (las flechas), o null si no se toca.
 * Solo en la elección y solo si el foco está en el cuerpo, el título o una bola: el cursor solo asoma y no le quita
 * el foco a otra cosa (p. ej. «Salir»). Sin esto las flechas cambian `aria-checked` pero Enter elige la bola vieja.
 */
export function bolaParaElFoco(
  paso: PasoLab,
  enfocada: number | null,
  focoEn: "cuerpo" | "titulo" | "bola" | "otro",
): number | null {
  if (paso !== "elegir" || enfocada === null) return null;
  return focoEn === "otro" ? null : enfocada;
}
