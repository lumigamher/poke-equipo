import { otroInicial } from "./inicial";
import type { EstadoOido, VistaPokemon } from "./tipos";

/** Un paso del recorrido de la primera vez: qué se le pide a la persona y con qué se da por hecho. */
export interface Paso {
  id: "abrir" | "ordenar" | "mirar" | "dictar" | "menu" | "fin";
  titulo: string;
  /** Lo que dice el Pokémon; `n` es su nombre propio y `otro` un Pokémon distinto de su especie para sugerir. */
  texto(n: string, otro?: string): string;
  /** Qué hacer para avanzar, en pocas palabras. Vacío en el último. */
  haz: string;
}

export const PASOS: Paso[] = [
  {
    id: "abrir",
    titulo: "Hola",
    texto: (n) =>
      `Soy ${n} y manejo una sesión de Claude Code por ti. Vivo aquí encima de tus ventanas; lo demás de la pantalla sigue siendo tuyo.`,
    haz: "Haz clic sobre mí para abrir mi burbuja.",
  },
  {
    id: "ordenar",
    titulo: "Dame una orden",
    texto: (n) =>
      `Puedes hablarme diciendo mi nombre («${n}, dime qué hay en esta carpeta») o escribirme en el campo de la burbuja. Arriba ves en qué proyecto y con qué modelo trabajo.`,
    haz: "Dime o escríbeme algo sencillo.",
  },
  {
    id: "mirar",
    titulo: "Mírame trabajar",
    texto: () =>
      "Mientras trabajo ves lo que pienso, el paso por el que voy y mis ayudantes. Con Detener me paras. Si necesito permiso te digo qué voy a hacer y eliges Sí o No: nunca me apruebo solo.",
    haz: "Espera mi respuesta (o detenme).",
  },
  {
    id: "dictar",
    titulo: "Dictar sin decir mi nombre",
    texto: () =>
      "Si la voz se corta o hay ruido, usa el dictado: una tecla lo abre, hablas con las pausas que quieras y la misma tecla lo envía. Junto a mis PS ves cuándo te estoy oyendo.",
    haz: "Pulsa Control + Opción + D, di algo y vuelve a pulsarla.",
  },
  {
    id: "menu",
    titulo: "Mi menú",
    texto: () =>
      "Con clic derecho sobre mí puedes guardarme en la pokébola, cambiarme de proyecto, dejarme quieto en un sitio, agrandar el texto o pausar la escucha.",
    haz: "Haz clic derecho sobre mí.",
  },
  {
    id: "fin",
    titulo: "Listo",
    texto: (n, otro) =>
      `Ya sabes lo esencial. Para traer a otro di «${n}, llama a ${otro ?? otroInicial(n)}». La barra verde son mis PS (el contexto que me queda) y la de abajo, el límite de tu sesión. El «?» de la burbuja repite todo esto.`,
    haz: "",
  },
];

/** Lo que el recorrido mira para saber si la persona ya hizo lo del paso. */
export interface Senales {
  vistas: Pick<VistaPokemon, "abierta" | "estado" | "ultimaRespuesta" | "alta">[];
  oido: EstadoOido;
  /** Ya se vio trabajar a alguno desde que empezó el paso "mirar". */
  trabajo: boolean;
  /** Ya se vio el dictado abierto desde que empezó el paso "dictar". */
  dicto: boolean;
  /** Hubo un clic derecho desde que empezó el paso "menu". */
  menu: boolean;
}

/** True si lo que pide el paso `id` ya pasó. El último no se cumple solo: lo cierra la persona. */
export function pasoCumplido(id: Paso["id"], s: Senales): boolean {
  switch (id) {
    case "abrir":
      return s.vistas.some((v) => v.abierta === true);
    case "ordenar":
      return s.vistas.some((v) => v.estado === "trabajando" || v.estado === "pidiendo_permiso");
    case "mirar":
      // Trabajó y ya no trabaja ninguno: respondió, lo detuvieron o falló.
      return s.trabajo && !s.vistas.some((v) => v.estado === "trabajando" || v.estado === "pidiendo_permiso");
    case "dictar":
      return s.dicto && s.oido !== "dictando";
    case "menu":
      return s.menu;
    case "fin":
      return false;
  }
}

/** Lo que se ve en un instante, en tres bits: es lo que se compara con el momento de entrar a un paso. */
export interface Niveles {
  abierta: boolean;
  ocupado: boolean;
  dictando: boolean;
}

type Vistas = Senales["vistas"];

/**
 * ¿Algún Pokémon está aprendiendo cómo suena su nombre (el alta de voz)? Mientras dura, el recorrido espera: sus avisos
 * abren la burbuja y sus frases no son las órdenes del recorrido, así que NADA se da por cumplido por ellos.
 */
export const enAlta = (vistas: Vistas): boolean => vistas.some((v) => v.alta === true);

export const nivelesDe = (vistas: Vistas, oido: EstadoOido): Niveles => ({
  abierta: vistas.some((v) => v.abierta === true),
  ocupado: vistas.some((v) => v.estado === "trabajando" || v.estado === "pidiendo_permiso"),
  dictando: oido === "dictando",
});

/**
 * Dónde va el recorrido. Cada señal solo se anota estando en SU paso, y lo que ya estaba hecho al entrar (`entrada`)
 * no cuenta: así un clic derecho en el paso 1 no deja el paso del menú medio hecho, ni un paso al que se vuelve con
 * Atrás se da por cumplido porque la burbuja siga abierta.
 */
export interface EstadoRecorrido {
  paso: number;
  entrada: Niveles;
  trabajo: boolean;
  dicto: boolean;
  menu: boolean;
}

const idDe = (e: EstadoRecorrido) => PASOS[e.paso].id;

/** El recorrido recién empezado: lo que haya ya en pantalla cuenta (p. ej. "Repetir" con la burbuja abierta). */
export function iniciar(ahora: Niveles): EstadoRecorrido {
  return irA({ paso: 0, entrada: ahora, trabajo: false, dicto: false, menu: false }, 0, ahora, "avance");
}

/**
 * Pasa al paso `n`. Hacia delante, el trabajo o el dictado que ya siguen en marcha cuentan (los pidió el paso
 * anterior); con Atrás se parte de cero: hay que repetir la acción.
 */
export function irA(e: EstadoRecorrido, n: number, ahora: Niveles, via: "avance" | "atras"): EstadoRecorrido {
  const paso = Math.max(0, Math.min(n, PASOS.length - 1));
  const id = PASOS[paso].id;
  const inicio = via === "avance" && e.paso === 0 && paso === 0;
  return {
    paso,
    // Al empezar, nada se da por visto: lo que haya en pantalla cuenta.
    entrada: inicio ? { abierta: false, ocupado: false, dictando: false } : ahora,
    trabajo: via === "avance" && id === "mirar" && ahora.ocupado,
    dicto: via === "avance" && id === "dictar" && ahora.dictando,
    menu: false,
  };
}

/**
 * Pasa a otro paso con lo que se ve AHORA (no con lo que se veía al cumplir el anterior): el trabajo o dictado que
 * arrancó durante el respiro de 900 ms cuenta para el paso al que se entra.
 */
export function moverA(
  e: EstadoRecorrido,
  n: number,
  vistas: Vistas,
  oido: EstadoOido,
  via: "avance" | "atras",
): EstadoRecorrido {
  return observar(irA(e, n, nivelesDe(vistas, oido), via), vistas, oido);
}

export function atras(e: EstadoRecorrido, ahora: Niveles): EstadoRecorrido {
  return e.paso === 0 ? e : irA(e, e.paso - 1, ahora, "atras");
}

/**
 * Anota lo que se ve, solo si el paso actual lo está esperando. Si lo que ya estaba al entrar se apaga (cerró la
 * burbuja, acabó el trabajo), deja de contar como "de antes": repetirlo desde cero sí cumple el paso.
 */
export function observar(e: EstadoRecorrido, vistas: Vistas, oido: EstadoOido): EstadoRecorrido {
  const n = nivelesDe(vistas, oido);
  // Durante el alta lo que se ve (el aviso abierto) es "de antes": al acabar no cuenta como algo que la persona hizo.
  if (enAlta(vistas)) return { ...e, entrada: n };
  const id = idDe(e);
  let s = e;
  const entrada = {
    abierta: e.entrada.abierta && n.abierta,
    ocupado: e.entrada.ocupado && n.ocupado,
    dictando: e.entrada.dictando && n.dictando,
  };
  if (
    entrada.abierta !== e.entrada.abierta ||
    entrada.ocupado !== e.entrada.ocupado ||
    entrada.dictando !== e.entrada.dictando
  )
    s = { ...s, entrada };
  if (id === "mirar" && n.ocupado && !s.entrada.ocupado && !s.trabajo) s = { ...s, trabajo: true };
  if (id === "dictar" && n.dictando && !s.entrada.dictando && !s.dicto) s = { ...s, dicto: true };
  return s;
}

/** Un clic derecho solo cuenta en el paso del menú. */
export function clicDerecho(e: EstadoRecorrido): EstadoRecorrido {
  return idDe(e) === "menu" && !e.menu ? { ...e, menu: true } : e;
}

/** ¿Ya hizo la persona lo del paso actual, estando en él? */
export function cumplido(e: EstadoRecorrido, vistas: Vistas, oido: EstadoOido): boolean {
  if (enAlta(vistas)) return false;
  const n = nivelesDe(vistas, oido);
  const id = idDe(e);
  switch (id) {
    case "abrir":
      return n.abierta && !e.entrada.abierta;
    case "ordenar":
      return n.ocupado && !e.entrada.ocupado;
    default:
      return pasoCumplido(id, { vistas, oido, trabajo: e.trabajo, dicto: e.dicto, menu: e.menu });
  }
}
