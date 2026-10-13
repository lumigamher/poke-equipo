import { describe, expect, it } from "vitest";
import {
  ATRIBUTOS_QUE_MUEVEN,
  conectarCaptura,
  type DocumentoCaptura,
  raizInteractiva,
} from "./captura-mouse";

type Oyente = (e: never) => void;
type Elem = { closest(s: string): unknown };

/** Un documento falso: elementos con `closest`, oyentes y un único punto "interactivo" movible. */
function entorno() {
  const oyentes = new Map<string, Set<Oyente>>();
  const raiz: Elem = { closest: (s) => (s === "[data-captura]" ? raiz : null) };
  const hijo: Elem = { closest: (s) => (s === "[data-captura]" ? raiz : null) };
  const fondo: Elem = { closest: () => null };
  const estado = {
    caja: { x: 0, y: 0, w: 100, h: 100 } as { x: number; y: number; w: number; h: number } | null,
  };
  const doc: DocumentoCaptura = {
    addEventListener: (t, fn) => {
      if (!oyentes.has(t)) oyentes.set(t, new Set());
      oyentes.get(t)?.add(fn);
    },
    removeEventListener: (t, fn) => {
      oyentes.get(t)?.delete(fn);
    },
    elementFromPoint: (x, y) => {
      const c = estado.caja;
      return c && x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h ? hijo : fondo;
    },
    body: {},
  };
  const ignorar: boolean[] = [];
  const raices: unknown[] = [];
  let pendiente: (() => void) | null = null;
  let avisoObservador: (() => void) | null = null;
  let opcionesObservador: MutationObserverInit | null = null;
  let observadorCerrado = false;
  let reenviar: (() => void) | null = null;
  let dejoDeReenviar = false;
  const dispara = (t: string, ev: object = {}) => {
    for (const fn of oyentes.get(t) ?? []) fn(ev as never);
  };
  const c = conectarCaptura({
    doc,
    observador: (fn) => {
      avisoObservador = fn;
      return {
        observe: (_d, o) => {
          opcionesObservador = o;
        },
        disconnect: () => {
          observadorCerrado = true;
        },
      };
    },
    pedirCuadro: (fn) => {
      pendiente = fn;
      return 1;
    },
    cancelarCuadro: () => {
      pendiente = null;
    },
    ignorarMouse: (i) => ignorar.push(i),
    alReenviarCaptura: (fn) => {
      reenviar = fn;
      return () => {
        dejoDeReenviar = true;
      };
    },
    alRaiz: (r) => raices.push(r),
  });
  /** Deja pasar el fotograma. */
  const cuadro = () => {
    const f = pendiente;
    pendiente = null;
    f?.();
  };
  return {
    doc,
    oyentes,
    raiz,
    estado,
    ignorar,
    raices,
    c,
    dispara,
    cuadro,
    mutar: () => avisoObservador?.(),
    hayCuadro: () => pendiente !== null,
    opciones: () => opcionesObservador,
    cerrado: () => observadorCerrado,
    reenviar: () => reenviar?.(),
    dejoDeReenviar: () => dejoDeReenviar,
  };
}

describe("conexión de la captura con el documento", () => {
  it("el selector devuelve la raíz [data-captura] del elemento bajo el punto, o null", () => {
    const e = entorno();
    expect(raizInteractiva(e.doc, 50, 50)).toBe(e.raiz);
    expect(raizInteractiva(e.doc, 500, 500)).toBeNull();
  });

  it("al conectar ignora el ratón; un mousemove sobre la raíz captura y publica la raíz", () => {
    const e = entorno();
    expect(e.ignorar).toEqual([true]);
    e.dispara("mousemove", { clientX: 50, clientY: 50 });
    expect(e.ignorar).toEqual([true, false]);
    expect(e.raices).toEqual([e.raiz]);
  });

  it("mouseout con relatedTarget nulo (salió de la ventana) suelta; con destino no", () => {
    const e = entorno();
    e.dispara("mousemove", { clientX: 50, clientY: 50 });
    e.dispara("mouseout", { relatedTarget: {} });
    expect(e.ignorar).toEqual([true, false]);
    e.dispara("mouseout", { relatedTarget: null });
    expect(e.ignorar).toEqual([true, false, true]);
    expect(e.raices).toEqual([e.raiz, null]);
  });

  it("una mutación bajo un cursor quieto reevalúa en el siguiente fotograma, y solo una vez", () => {
    const e = entorno();
    e.dispara("mousemove", { clientX: 50, clientY: 50 });
    e.estado.caja = null;
    e.mutar();
    e.mutar();
    e.mutar();
    expect(e.ignorar).toEqual([true, false]); // aún no: espera al fotograma
    e.cuadro();
    expect(e.ignorar).toEqual([true, false, true]);
    expect(e.hayCuadro()).toBe(false);
  });

  it("al terminar una animación o transición se reevalúa (las cajas se mueven sin mutar el DOM)", () => {
    for (const tipo of ["animationend", "transitionend"]) {
      const e = entorno();
      e.dispara("mousemove", { clientX: 150, clientY: 50 }); // en el borde, fuera
      e.estado.caja = { x: 100, y: 0, w: 100, h: 100 };
      e.dispara(tipo);
      e.cuadro();
      expect(e.ignorar, tipo).toEqual([true, false]);
    }
  });

  it("sin posición conocida una mutación no captura nada", () => {
    const e = entorno();
    e.mutar();
    e.cuadro();
    expect(e.ignorar).toEqual([true]);
  });

  it("el observador filtra atributos pero mantiene style (el paseo reescribe style)", () => {
    const e = entorno();
    expect(e.opciones()?.attributeFilter).toEqual(ATRIBUTOS_QUE_MUEVEN);
    expect(ATRIBUTOS_QUE_MUEVEN).toContain("style");
    expect(e.opciones()).toMatchObject({ childList: true, subtree: true, attributes: true });
  });

  it("reenviar vuelve a emitir el valor actual", () => {
    const e = entorno();
    e.dispara("mousemove", { clientX: 50, clientY: 50 });
    e.reenviar();
    expect(e.ignorar).toEqual([true, false, false]);
  });

  it("desconectar quita oyentes, cierra el observador, deja de escuchar a main y ignora el ratón", () => {
    const e = entorno();
    e.dispara("mousemove", { clientX: 50, clientY: 50 });
    e.mutar();
    e.c.desconectar();
    expect(e.ignorar.at(-1)).toBe(true);
    expect(e.cerrado()).toBe(true);
    expect(e.dejoDeReenviar()).toBe(true);
    expect(e.hayCuadro()).toBe(false);
    for (const set of e.oyentes.values()) expect(set.size).toBe(0);
  });
});
