import { useEffect, useRef, useState } from "react";
import { crearHover } from "./captura-hover";

/** Lo mínimo del DOM que usa la captura: así se prueba con un documento falso, sin jsdom. */
export interface DocumentoCaptura {
  addEventListener(tipo: string, fn: (e: never) => void, opciones?: AddEventListenerOptions): void;
  removeEventListener(tipo: string, fn: (e: never) => void, opciones?: EventListenerOptions): void;
  elementFromPoint(x: number, y: number): { closest(selector: string): unknown } | null;
  body: unknown;
}

export interface EntornoCaptura {
  doc: DocumentoCaptura;
  observador(fn: () => void): {
    observe(destino: never, opciones: MutationObserverInit): void;
    disconnect(): void;
  };
  pedirCuadro(fn: () => void): number;
  cancelarCuadro(id: number): void;
  ignorarMouse(ignorar: boolean): void;
  /** Main terminó una carga y olvidó lo pedido: devuelve la función que deja de escuchar. */
  alReenviarCaptura(fn: () => void): () => void;
  /** La raíz interactiva bajo el cursor (o null) cambió. */
  alRaiz(raiz: unknown): void;
}

/** Lo que cambia el diseño sin tocar el DOM: las animaciones de entrada (burbuja, tarjeta, chip) mueven cajas. */
export const ATRIBUTOS_QUE_MUEVEN = ["style", "class", "data-captura", "inert", "hidden"];

/** Lo interactivo se marca con `data-captura`; lo que tiene `pointer-events: none` no lo devuelve `elementFromPoint`. */
export function raizInteractiva(
  doc: Pick<DocumentoCaptura, "elementFromPoint">,
  x: number,
  y: number,
): unknown {
  return doc.elementFromPoint(x, y)?.closest("[data-captura]") ?? null;
}

/**
 * Conecta la captura (ver `captura-hover.ts`): un `mousemove` en el documento, `mouseout` (relatedTarget nulo = el
 * cursor salió de la ventana) y una reevaluación, como mucho una por fotograma, cuando el DOM cambia o termina una
 * animación bajo un cursor quieto. En reposo no hace nada. Devuelve el hover y la función que lo desconecta.
 */
export function conectarCaptura(e: EntornoCaptura) {
  const h = crearHover<unknown>({
    golpe: (x, y) => raizInteractiva(e.doc, x, y),
    alCambiar: (capturar) => e.ignorarMouse(!capturar),
    alRaiz: e.alRaiz,
  });
  h.iniciar();
  const alMover = (ev: { clientX: number; clientY: number }) => h.mover(ev.clientX, ev.clientY);
  const alSalir = (ev: { relatedTarget: unknown }) => {
    if (ev.relatedTarget === null) h.salir();
  };
  let cuadro = 0;
  const programar = () => {
    if (cuadro) return;
    cuadro = e.pedirCuadro(() => {
      cuadro = 0;
      h.reevaluar();
    });
  };
  const conCaptura = { capture: true, passive: true };
  e.doc.addEventListener("mousemove", alMover as (x: never) => void, conCaptura);
  e.doc.addEventListener("mouseout", alSalir as (x: never) => void, { passive: true });
  e.doc.addEventListener("animationend", programar, conCaptura);
  e.doc.addEventListener("transitionend", programar, conCaptura);
  const observador = e.observador(programar);
  observador.observe(e.doc.body as never, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ATRIBUTOS_QUE_MUEVEN,
  });
  const dejarDeReenviar = e.alReenviarCaptura(() => h.reenviar());
  return {
    hover: h,
    desconectar() {
      e.doc.removeEventListener("mousemove", alMover as (x: never) => void, { capture: true });
      e.doc.removeEventListener("mouseout", alSalir as (x: never) => void);
      e.doc.removeEventListener("animationend", programar, { capture: true });
      e.doc.removeEventListener("transitionend", programar, { capture: true });
      observador.disconnect();
      if (cuadro) e.cancelarCuadro(cuadro);
      dejarDeReenviar();
      e.ignorarMouse(true);
    },
  };
}

/**
 * Única fuente de verdad de si la ventana captura el mouse. Devuelve la raíz `[data-captura]` que hay bajo el cursor
 * (o null): de ahí cada Pokémon saca su "encima" sin eventos propios que se desincronicen.
 */
export function useCapturaMouse(arrastrando: boolean): Element | null {
  const conexion = useRef<ReturnType<typeof conectarCaptura> | null>(null);
  const [raiz, setRaiz] = useState<Element | null>(null);
  useEffect(() => {
    const c = conectarCaptura({
      doc: document as unknown as DocumentoCaptura,
      observador: (fn) => new MutationObserver(fn),
      pedirCuadro: (fn) => requestAnimationFrame(fn),
      cancelarCuadro: (id) => cancelAnimationFrame(id),
      ignorarMouse: (ignorar) => window.poke.ignorarMouse(ignorar),
      alReenviarCaptura: (fn) => window.poke.alReenviarCaptura(fn),
      alRaiz: (r) => setRaiz(r as Element | null),
    });
    conexion.current = c;
    return () => {
      conexion.current = null;
      c.desconectar();
    };
  }, []);
  useEffect(() => {
    conexion.current?.hover.arrastrando(arrastrando);
  }, [arrastrando]);
  return raiz;
}
