import type { Actividad, DatosAnim, Estado } from "@compartido/tipos";
import { useEffect, useRef, useState } from "react";
import { elegirDe, POSES_ACTIVIDAD } from "./actividades";
import {
  cuadroEn,
  type Direccion,
  elegirAnim,
  filaPara,
  margenInferior,
  margenSuperior,
  POSES,
  poseDe,
  ticEn,
} from "./animaciones";

export const ESCALA = 3;

/** Filas vacías arriba y abajo del dibujo en la fila usada de una hoja. */
interface Margen {
  arriba: number;
  abajo: number;
}

/** Medidas una sola vez por `dex/anim/fila`. */
const margenes = new Map<string, Margen>();

/** Mide el aire que trae la hoja sobre la cabeza y bajo los pies; ante cualquier fallo, ninguno. */
function medirMargen(hoja: HTMLImageElement, datos: DatosAnim, fila: number): Margen {
  try {
    const fuera = document.createElement("canvas");
    fuera.width = hoja.naturalWidth;
    fuera.height = datos.alto;
    const ctx = fuera.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { arriba: 0, abajo: 0 };
    ctx.drawImage(
      hoja,
      0,
      fila * datos.alto,
      hoja.naturalWidth,
      datos.alto,
      0,
      0,
      hoja.naturalWidth,
      datos.alto,
    );
    const rgba = ctx.getImageData(0, 0, fuera.width, fuera.height).data;
    const alfa = new Uint8ClampedArray(fuera.width * fuera.height);
    for (let i = 0; i < alfa.length; i++) alfa[i] = rgba[i * 4 + 3];
    return {
      arriba: margenSuperior(alfa, fuera.width, fuera.height),
      abajo: margenInferior(alfa, fuera.width, fuera.height),
    };
  } catch {
    return { arriba: 0, abajo: 0 };
  }
}

/**
 * Una sola imagen por hoja, compartida entre renders. Las hojas las sirve el proceso principal, que se
 * queda ocupado varios segundos al transcribir: si cada cambio de animación pidiera su imagen de nuevo,
 * el Pokémon desaparecería justo cuando escucha.
 */
const hojas = new Map<string, HTMLImageElement>();

function hojaDe(dex: string, nombre: string, shiny = false): HTMLImageElement {
  const clave = `${dex}/${shiny ? "shiny/" : ""}${nombre}`;
  let hoja = hojas.get(clave);
  if (!hoja) {
    hoja = new Image();
    hoja.crossOrigin = "anonymous";
    const normal = `poke://assets/${dex}/${nombre}-Anim.png`;
    if (shiny) {
      // Si la especie no trae esa hoja en shiny, se queda con la normal: nunca un Pokémon invisible.
      const propia = hoja;
      propia.addEventListener("error", () => {
        if (!propia.src.endsWith(normal)) propia.src = normal;
      });
    }
    hoja.src = shiny ? `poke://assets/${dex}/shiny/${nombre}-Anim.png` : normal;
    hojas.set(clave, hoja);
  }
  return hoja;
}

const cargada = (hoja: HTMLImageElement) => hoja.complete && hoja.naturalWidth > 0;

/** Las animaciones de cada especie, pedidas a main una sola vez (la cuadrícula de la Pokédex y el laboratorio comparten). */
const animsPedidas = new Map<number, Promise<Record<string, DatosAnim>>>();

export function animsDe(especie: number): Promise<Record<string, DatosAnim>> {
  let p = animsPedidas.get(especie);
  if (!p) {
    p = window.poke.anims(especie);
    // Si falla se vuelve a intentar la próxima vez (el que la pidió ya maneja su error). Y "no hay animaciones"
    // tampoco se recuerda: una especie que aún no estaba bajada llega más tarde y debe poder pedirse otra vez.
    p.then(
      (a) => {
        if (Object.keys(a).length === 0 && animsPedidas.get(especie) === p) animsPedidas.delete(especie);
      },
      () => {
        if (animsPedidas.get(especie) === p) animsPedidas.delete(especie);
      },
    );
    animsPedidas.set(especie, p);
  }
  return p;
}

/** Olvida lo recordado de una especie: al llegar sus archivos de fondo, la próxima petición los lee de verdad. */
export function olvidarAnims(especie: number): void {
  animsPedidas.delete(especie);
}

/** Pide todas las hojas de una especie apenas se conocen, para que ningún cambio de estado espere una carga. */
export function precargarHojas(especie: number, anims: Record<string, DatosAnim>): void {
  const dex = String(especie).padStart(4, "0");
  for (const nombre of Object.keys(anims)) hojaDe(dex, nombre);
}

function margenDe(clave: string, hoja: HTMLImageElement, datos: DatosAnim, fila: number): Margen {
  let margen = margenes.get(clave);
  if (margen === undefined) {
    margen = medirMargen(hoja, datos, fila);
    margenes.set(clave, margen);
  }
  return margen;
}

/** Alto dibujado de la pose de reposo (Idle, mirando al frente); null mientras su hoja no haya cargado. */
function altoReferencia(dex: string, anims: Record<string, DatosAnim>): number | null {
  const datos = anims.Idle;
  if (!datos) return null;
  const hoja = hojaDe(dex, "Idle");
  if (!cargada(hoja)) return null;
  const fila = filaPara(datos, "frente");
  const m = margenDe(`${dex}/Idle/${fila}`, hoja, datos, fila);
  return datos.alto - m.arriba - m.abajo;
}

/** Lo que el lienzo está dibujando: una animación cuya hoja ya cargó. */
interface Visible {
  clave: string;
  hoja: HTMLImageElement;
  datos: DatosAnim;
  fila: number;
  bucle: boolean;
  velocidad: number;
}

interface Props {
  especie: number;
  estado: Estado;
  direccion: Direccion;
  anims: Record<string, DatosAnim>;
  /** Qué hace Claude Code; solo cuenta mientras el estado es `trabajando`. */
  actividad?: Actividad | null;
  /** Una reacción o travesura del momento (nombre de animación); solo cuenta si anda suelto. */
  forzada?: string | null;
  /** Una animación de una sola pasada (un golpe, despertar, caer al suelo) que manda sobre todo lo demás. */
  unaVez?: { anim: string; frente: boolean } | null;
  /** Colgado del cursor mientras lo arrastran (nombre de animación): manda sobre la pose de su estado. */
  colgado?: string | null;
  /** Brillante: usa las hojas shiny de la especie. */
  shiny?: boolean;
  /** Plantado en su sitio mirando hacia `direccion` (en un combate), en vez de la pose de su estado. */
  plantado?: boolean;
  /** No se desplaza: si su estado es de caminar, reposa en vez de caminar en el sitio. */
  quieto?: boolean;
}

/** Estados en los que el Pokémon no está ocupado y puede saludar al cursor. */
const LIBRE: Estado[] = ["paseando", "esperando", "cansado"];

export function Sprite({
  especie,
  estado,
  direccion,
  anims,
  actividad,
  forzada = null,
  unaVez = null,
  colgado = null,
  shiny = false,
  plantado = false,
  quieto = false,
}: Props) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const ultima = useRef<Visible | null>(null);
  /** Tamaño de la caja con la última animación que no era una pasada. */
  const cajaBase = useRef<{ ancho: number; alto: number } | null>(null);
  const [, repintar] = useState(0);
  const deActividad = !unaVez && estado === "trabajando" && actividad ? POSES_ACTIVIDAD[actividad] : null;
  const base = unaVez
    ? { anim: unaVez.anim, bucle: false, frente: unaVez.frente, paso: 0 }
    : colgado
      ? { anim: colgado, bucle: true, frente: true, paso: 0 }
      : plantado && LIBRE.includes(estado)
        ? { anim: "Idle", bucle: true, frente: false, paso: 0 }
        : forzada && LIBRE.includes(estado)
          ? { anim: forzada, bucle: true, frente: true, paso: 0 }
          : poseDe(estado, quieto);
  // Con actividad la animación sale de su lista y siempre va en bucle; sin ella, como siempre.
  const pose = deActividad ? { ...base, bucle: true, frente: deActividad.frente } : base;
  const velocidad = deActividad?.velocidad ?? 1;
  const nombre = deActividad ? elegirDe(deActividad.anims, anims) : elegirAnim(base, anims);
  const datos = nombre ? anims[nombre] : null;
  const dex = String(especie).padStart(4, "0");
  const fila = datos ? filaPara(datos, pose.frente ? "frente" : direccion) : 0;
  const pedida = nombre && datos ? hojaDe(dex, nombre, shiny) : null;
  const lista = pedida !== null && cargada(pedida);
  // Mientras la hoja pedida no haya cargado se sigue viendo la animación anterior: nunca un lienzo vacío.
  const visible: Visible | null =
    lista && pedida && datos
      ? {
          clave: `${dex}/${nombre}/${fila}${shiny ? "/shiny" : ""}`,
          hoja: pedida,
          datos,
          fila,
          bucle: pose.bucle,
          velocidad,
        }
      : ultima.current;
  const margen = visible
    ? margenDe(visible.clave, visible.hoja, visible.datos, visible.fila)
    : { arriba: 0, abajo: 0 };
  const claveVisible = visible?.clave ?? null;
  const bucle = visible?.bucle ?? true;
  const ritmo = visible?.velocidad ?? 1;

  useEffect(() => {
    if (!pedida || lista) return;
    let cancelado = false;
    const avisar = () => {
      if (!cancelado) repintar((n) => n + 1);
    };
    pedida.addEventListener("load", avisar);
    pedida.addEventListener("error", avisar);
    return () => {
      cancelado = true;
      pedida.removeEventListener("load", avisar);
      pedida.removeEventListener("error", avisar);
    };
  }, [pedida, lista]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `visible` se rehace en cada render; su identidad es la clave y el bucle
  useEffect(() => {
    const el = lienzo.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx || !visible) return;
    ultima.current = visible;
    const { hoja, datos: d, fila: f } = visible;
    // El tic sale del tiempo transcurrido, no de contar cuadros: a 120 Hz la animación no va al doble.
    const inicio = performance.now();
    let cuadro = 0;
    const dibujar = (ahora: number) => {
      const c = cuadroEn(d, Math.floor(ticEn(ahora, inicio) * ritmo), bucle);
      ctx.clearRect(0, 0, d.ancho, d.alto);
      ctx.drawImage(hoja, c * d.ancho, f * d.alto, d.ancho, d.alto, 0, 0, d.ancho, d.alto);
      cuadro = requestAnimationFrame(dibujar);
    };
    // El primer cuadro se pinta ya: cambiar el tamaño del lienzo lo borra y no debe verse vacío.
    dibujar(inicio);
    return () => cancelAnimationFrame(cuadro);
  }, [claveVisible, bucle, ritmo]);

  if (!visible) return null;
  // Lo dibujado de esta pose, sin el aire de la hoja.
  const altoDibujo = visible.datos.alto - margen.arriba - margen.abajo;
  // La caja mide al menos lo que la pose de reposo: las poses más bajas (las de trabajo) no mueven la barra de PS
  // ni la burbuja. Solo una más alta (el salto de un permiso) la sube. Los pies quedan siempre en el mismo suelo.
  const libre = Math.max(altoReferencia(dex, anims) ?? 0, altoDibujo);
  // Una pasada (un ataque que salta o embiste) no mueve nada: la caja se queda del tamaño que tenía justo antes y
  // el dibujo se sale de ella por arriba y por los lados.
  if (unaVez === null) cajaBase.current = { ancho: visible.datos.ancho, alto: libre };
  const fija = unaVez !== null ? cajaBase.current : null;
  const altoCaja = fija?.alto ?? libre;
  const anchoCaja = fija?.ancho ?? visible.datos.ancho;
  return (
    <div
      className="sprite-caja"
      data-anim={visible.clave.split("/")[1]}
      style={{ width: anchoCaja * ESCALA, height: altoCaja * ESCALA }}
    >
      <canvas
        ref={lienzo}
        className="sprite"
        width={visible.datos.ancho}
        height={visible.datos.alto}
        style={{
          width: visible.datos.ancho * ESCALA,
          height: visible.datos.alto * ESCALA,
          marginTop: (altoCaja - (visible.datos.alto - margen.abajo)) * ESCALA,
          marginLeft: ((anchoCaja - visible.datos.ancho) * ESCALA) / 2,
        }}
      />
    </div>
  );
}

/** Un observador por contenedor con scroll (el `rootMargin` solo cuenta respecto a su `root`), compartido por todas las celdas. */
const vigias = new Map<Element | null, { obs: IntersectionObserver; avisos: Map<Element, () => void> }>();

/**
 * Avisa una sola vez cuando `el` está a 80 px de verse dentro de su contenedor con scroll (el ancestro marcado
 * `data-vigia`, o la ventana). Devuelve cómo dejar de vigilar. Sin IntersectionObserver avisa ya.
 */
function vigilarCerca(el: Element, avisar: () => void): () => void {
  if (typeof IntersectionObserver === "undefined") {
    avisar();
    return () => {};
  }
  const raiz = el.closest("[data-vigia]");
  let v = vigias.get(raiz);
  if (!v) {
    const avisos = new Map<Element, () => void>();
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          const fn = avisos.get(e.target);
          obs.unobserve(e.target);
          avisos.delete(e.target);
          fn?.();
          if (avisos.size === 0 && vigias.get(raiz) === v) {
            obs.disconnect();
            vigias.delete(raiz);
          }
        }
      },
      { root: raiz, rootMargin: "80px" },
    );
    v = { obs, avisos };
    vigias.set(raiz, v);
  }
  const { obs, avisos } = v;
  avisos.set(el, avisar);
  obs.observe(el);
  return () => {
    avisos.delete(el);
    obs.unobserve(el);
    // Sin nadie más vigilando, el observador y su entrada se van (si no, el mapa retendría contenedores muertos).
    if (avisos.size === 0 && vigias.get(raiz) === v) {
      obs.disconnect();
      vigias.delete(raiz);
    }
  };
}

/**
 * El Pokémon quieto, en un solo cuadro (el primero de su pose de reposo, de frente): para listas largas como la
 * Pokédex de Kanto, donde 151 animados a la vez serían un gasto sin sentido. Carga perezosa: no pide ni sus
 * animaciones ni su hoja hasta que entra en pantalla (o a 80 px de hacerlo). Si algo falla queda vacío.
 */
export function SpriteQuieto({
  especie,
  lado = 52,
  lista = true,
}: {
  especie: number;
  lado?: number;
  /** Sus archivos ya están en disco; si no, no se pide nada (queda el recuadro) y al llegar se carga solo. */
  lista?: boolean;
}) {
  const caja = useRef<HTMLSpanElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [cerca, setCerca] = useState(false);
  const [listo, setListo] = useState<{ datos: DatosAnim; hoja: HTMLImageElement; fila: number } | null>(null);

  useEffect(() => {
    const el = caja.current;
    if (!el || cerca) return;
    return vigilarCerca(el, () => setCerca(true));
  }, [cerca]);

  useEffect(() => {
    if (!cerca || !lista) return;
    let vivo = true;
    animsDe(especie).then(
      (a) => {
        const nombre = a.Idle ? "Idle" : elegirAnim(POSES.esperando, a);
        const datos = nombre ? a[nombre] : null;
        if (!vivo || !nombre || !datos) return;
        setListo({
          datos,
          hoja: hojaDe(String(especie).padStart(4, "0"), nombre),
          fila: filaPara(datos, "frente"),
        });
      },
      () => {
        // Sin hojas queda el recuadro con el número y el nombre.
      },
    );
    return () => {
      vivo = false;
    };
  }, [cerca, especie, lista]);

  useEffect(() => {
    const el = lienzo.current;
    const ctx = el?.getContext("2d");
    if (!listo || !el || !ctx) return;
    const { datos, hoja, fila } = listo;
    const pintar = () => {
      ctx.clearRect(0, 0, datos.ancho, datos.alto);
      ctx.drawImage(hoja, 0, fila * datos.alto, datos.ancho, datos.alto, 0, 0, datos.ancho, datos.alto);
    };
    if (cargada(hoja)) {
      pintar();
      return;
    }
    hoja.addEventListener("load", pintar, { once: true });
    return () => hoja.removeEventListener("load", pintar);
  }, [listo]);

  // Píxeles enteros mientras quepa (hasta 2); un cuadro más grande que el recuadro se encoge para no salirse.
  const mayor = listo ? Math.max(listo.datos.ancho, listo.datos.alto) : lado;
  const escala = mayor > lado ? lado / mayor : Math.max(1, Math.min(2, Math.floor(lado / mayor)));
  return (
    <span ref={caja} className="sprite-quieto" style={{ width: lado, height: lado }} aria-hidden="true">
      {listo && lista && (
        <canvas
          ref={lienzo}
          className="sprite"
          width={listo.datos.ancho}
          height={listo.datos.alto}
          style={{ width: listo.datos.ancho * escala, height: listo.datos.alto * escala }}
        />
      )}
    </span>
  );
}
