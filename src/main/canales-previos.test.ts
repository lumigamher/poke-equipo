import { readFileSync } from "node:fs";
import { CANALES } from "@compartido/tipos";
import { describe, expect, it, vi } from "vitest";
import {
  CANALES_PREVIOS,
  crearEntrada,
  crearPuertaLab,
  registrarPrevios,
  type VentanaEntrada,
  vigilarPrimeraVez,
  vigilarRespuesta,
} from "./canales-previos";

function ventana(destruida = false, enfocada = true) {
  const log: string[] = [];
  const w: VentanaEntrada = {
    setIgnoreMouseEvents: (i) => log.push(`ignorar:${i}`),
    setFocusable: (f) => log.push(`focusable:${f}`),
    focus: () => log.push("focus"),
    blur: () => log.push("blur"),
    isFocused: () => enfocada,
    isDestroyed: () => destruida,
  };
  return { w, log };
}

describe("entrada de la ventana", () => {
  it("lo que el renderer pidió mientras mandaba main se aplica al volver a libre (captura)", () => {
    const { w, log } = ventana();
    const e = crearEntrada(w);
    e.poner("lab");
    e.ignorarMouse(false); // el renderer quiere capturar; main manda y lo ignora
    e.poner("carpeta");
    log.length = 0;
    e.poner("libre");
    expect(log).toEqual(["ignorar:false", "focusable:false", "blur"]);
  });

  it("lo que el renderer pidió mientras mandaba main se aplica al volver a libre (ignorar)", () => {
    const { w, log } = ventana();
    const e = crearEntrada(w);
    e.ignorarMouse(false);
    e.poner("lab");
    e.ignorarMouse(true);
    log.length = 0;
    e.poner("libre");
    expect(log).toEqual(["ignorar:true", "focusable:false", "blur"]);
  });

  it("sin petición del renderer, libre ignora el ratón (nunca captura por defecto)", () => {
    const { w, log } = ventana();
    const e = crearEntrada(w);
    e.poner("lab");
    e.poner("libre");
    expect(log.filter((l) => l.startsWith("ignorar"))).toEqual(["ignorar:false", "ignorar:true"]);
  });

  it("al acabar la carga lo pedido por el renderer ANTERIOR no vale: ignora (el nuevo reenvía el suyo)", () => {
    const { w, log } = ventana();
    const e = crearEntrada(w);
    e.ignorarMouse(false);
    log.length = 0;
    e.alCargar();
    expect(log).toEqual(["ignorar:true"]);
    log.length = 0;
    e.ignorarMouse(false); // el renderer nuevo reenvía su valor real
    expect(log).toEqual(["ignorar:false"]);
  });

  it("no hace blur si la ventana no tiene el foco (sin blur en cadena al aparecer el Pokémon)", () => {
    const { w, log } = ventana(false, false);
    const e = crearEntrada(w);
    e.enfocar(false);
    e.poner("libre");
    expect(log).toEqual(["focusable:false", "ignorar:true", "focusable:false"]);
  });

  it("con foco, enfocar(false) sí hace blur", () => {
    const { w, log } = ventana(false, true);
    crearEntrada(w).enfocar(false);
    expect(log).toEqual(["focusable:false", "blur"]);
  });

  it("una carga nueva olvida lo pedido por el renderer anterior y deja la ventana ignorando", () => {
    const { w, log } = ventana();
    const e = crearEntrada(w);
    e.ignorarMouse(false);
    log.length = 0;
    e.alEmpezarCarga();
    expect(log).toEqual(["ignorar:true"]);
    log.length = 0;
    e.alCargar();
    expect(log).toEqual(["ignorar:true"]);
  });

  it("libre: el renderer manda", () => {
    const { w, log } = ventana();
    const e = crearEntrada(w);
    e.ignorarMouse(false);
    e.enfocar(true);
    expect(log).toEqual(["ignorar:false", "focusable:true", "focus"]);
  });

  it("laboratorio: recibe ratón y foco, ignora lo que diga el renderer y lo recupera tras la carga", () => {
    const { w, log } = ventana();
    const e = crearEntrada(w);
    e.poner("lab");
    expect(log).toEqual(["ignorar:false", "focusable:true", "focus"]);
    log.length = 0;
    e.ignorarMouse(true);
    e.enfocar(false);
    expect(log).toEqual([]);
    e.alCargar();
    expect(log).toEqual(["ignorar:false", "focusable:true", "focus"]);
  });

  it("carpeta: sin ratón ni foco; al volver al laboratorio los recupera", () => {
    const { w, log } = ventana();
    const e = crearEntrada(w);
    e.poner("lab");
    log.length = 0;
    e.poner("carpeta");
    expect(log).toEqual(["ignorar:true", "focusable:false", "blur"]);
    log.length = 0;
    e.ignorarMouse(false);
    expect(log).toEqual([]);
    e.poner("lab");
    expect(log).toEqual(["ignorar:false", "focusable:true", "focus"]);
  });

  it("al cerrar el laboratorio (libre) la ventana vuelve a ignorar el ratón", () => {
    const { w, log } = ventana();
    const e = crearEntrada(w);
    e.poner("lab");
    log.length = 0;
    e.poner("libre");
    expect(log).toEqual(["ignorar:true", "focusable:false", "blur"]);
  });

  it("no toca una ventana destruida", () => {
    const { w, log } = ventana(true);
    const e = crearEntrada(w);
    e.poner("lab");
    e.ignorarMouse(true);
    expect(log).toEqual([]);
  });
});

describe("canales previos al laboratorio", () => {
  it("se registran todos, y los datos mal formados no llegan", () => {
    const oyentes = new Map<string, (e: unknown, d: unknown) => unknown>();
    const ipc = {
      on: (c: string, f: (e: unknown, d: unknown) => void) => oyentes.set(c, f),
      handle: (c: string, f: (e: unknown, d: unknown) => unknown) => oyentes.set(c, f),
    };
    const d = {
      entrada: {
        ignorarMouse: vi.fn(),
        enfocar: vi.fn(),
        poner: vi.fn(),
        alCargar: vi.fn(),
        alEmpezarCarga: vi.fn(),
      },
      anims: vi.fn(() => ({ Idle: 1 })),
      alMicrofono: vi.fn(),
      alPedirLaboratorio: vi.fn(),
      alInicial: vi.fn(),
      alLabListo: vi.fn(),
      alLabFallo: vi.fn(),
      alPedirEspecie: vi.fn(),
      esRemitente: (e: unknown) => (e as { ventana?: string }).ventana === "propia",
    };
    const hechos = registrarPrevios(ipc, d);
    expect([...hechos].sort()).toEqual([...CANALES_PREVIOS].sort());
    expect([...oyentes.keys()].sort()).toEqual([...CANALES_PREVIOS].sort());
    expect(oyentes.get(CANALES.anims)?.({}, 25)).toEqual({ Idle: 1 });
    expect(oyentes.get(CANALES.anims)?.({}, "25")).toEqual({});
    oyentes.get(CANALES.microfonoEstado)?.({}, "no");
    oyentes.get(CANALES.microfonoEstado)?.({}, false);
    expect(d.alMicrofono.mock.calls).toEqual([[false]]);
  });

  it("pedir una especie: solo del remitente propio; la carga la valida main (aquí llega tal cual)", () => {
    const oyentes = new Map<string, (e: unknown, d: unknown) => unknown>();
    const ipc = {
      on: (c: string, f: (e: unknown, d: unknown) => void) => oyentes.set(c, f),
      handle: (c: string, f: (e: unknown, d: unknown) => unknown) => oyentes.set(c, f),
    };
    const alPedirEspecie = vi.fn();
    registrarPrevios(ipc, {
      entrada: {
        ignorarMouse: vi.fn(),
        enfocar: vi.fn(),
        poner: vi.fn(),
        alCargar: vi.fn(),
        alEmpezarCarga: vi.fn(),
      },
      anims: vi.fn(),
      alMicrofono: vi.fn(),
      alPedirLaboratorio: vi.fn(),
      alInicial: vi.fn(),
      alLabListo: vi.fn(),
      alLabFallo: vi.fn(),
      alPedirEspecie,
      esRemitente: (e) => (e as { ventana?: string }).ventana === "propia",
    });
    const pedir = oyentes.get(CANALES.pedirEspecie);
    pedir?.({ ventana: "ajena" }, { especie: 25 });
    expect(alPedirEspecie).not.toHaveBeenCalled();
    pedir?.({ ventana: "propia" }, { especie: 25 });
    expect(alPedirEspecie.mock.calls).toEqual([[{ especie: 25 }]]);
  });

  it("index.ts los registra antes de esperar el laboratorio, y ninguno otra vez después", () => {
    const fuente = readFileSync("src/main/index.ts", "utf8");
    const limite = fuente.indexOf("await primeraVez(");
    expect(limite).toBeGreaterThan(0);
    expect(fuente.slice(0, limite)).toContain("registrarPrevios(");
    const despues = fuente.slice(limite);
    for (const nombre of Object.entries(CANALES)
      .filter(([, v]) => (CANALES_PREVIOS as readonly string[]).includes(v))
      .map(([k]) => k))
      expect(despues).not.toMatch(new RegExp(`ipcMain\\.(on|handle)\\(CANALES\\.${nombre}\\b`));
  });
});

function puerta() {
  const modos: string[] = [];
  const avisos: string[] = [];
  const tareas: { fn: () => void; ms: number; cancelada: boolean }[] = [];
  const p = crearPuertaLab({
    entrada: { poner: (m) => modos.push(m) },
    programar: (fn, ms) => {
      const t = { fn, ms, cancelada: false };
      tareas.push(t);
      return () => {
        t.cancelada = true;
      };
    },
    aviso: (m) => avisos.push(m),
    esperaMs: 15000,
  });
  return { p, modos, avisos, tareas };
}

describe("puerta del laboratorio: la ventana solo toma el ratón cuando el laboratorio se ve", () => {
  it("abrir deja la ventana libre hasta el aviso del renderer; entonces pasa a lab", () => {
    const { p, modos } = puerta();
    p.abrir();
    expect(modos.at(-1)).toBe("libre");
    expect(modos).not.toContain("lab");
    p.listo();
    expect(modos.at(-1)).toBe("lab");
  });

  it("el paso del nombre (campo de texto) tiene teclado: sigue en lab hasta que main pide la carpeta", () => {
    const { p, modos } = puerta();
    p.abrir();
    p.listo();
    // Elegir, confirmar, ceremonia y nombre ocurren en el renderer: main no cambia el modo en ninguno.
    expect(modos.at(-1)).toBe("lab");
    // Con el nombre dado, main pide la carpeta: entonces sí no recibe nada; si se cancela, vuelve a lab.
    p.carpeta();
    expect(modos.at(-1)).toBe("carpeta");
    p.volver();
    expect(modos.at(-1)).toBe("lab");
  });

  it("el aviso fuera de lugar (laboratorio no abierto) se ignora", () => {
    const { p, modos } = puerta();
    p.listo();
    expect(modos).toEqual([]);
  });

  it("sin aviso en N segundos: se registra y sigue libre; con aviso se cancela el plazo", () => {
    const a = puerta();
    a.p.abrir();
    expect(a.tareas[0].ms).toBe(15000);
    a.tareas[0].fn();
    expect(a.avisos).toHaveLength(1);
    expect(a.modos).not.toContain("lab");
    const b = puerta();
    b.p.abrir();
    b.p.listo();
    expect(b.tareas[0].cancelada).toBe(true);
  });

  it("carpeta quita la entrada y volver la devuelve solo si el laboratorio estaba a la vista", () => {
    const { p, modos } = puerta();
    p.abrir();
    p.listo();
    p.carpeta();
    expect(modos.at(-1)).toBe("carpeta");
    p.volver();
    expect(modos.at(-1)).toBe("lab");
    const otra = puerta();
    otra.p.abrir();
    otra.p.carpeta();
    otra.p.volver();
    expect(otra.modos).not.toContain("lab");
  });

  it("una carga nueva del renderer devuelve la ventana a libre hasta el siguiente aviso", () => {
    const { p, modos } = puerta();
    p.abrir();
    p.listo();
    p.alEmpezarCarga();
    expect(modos.at(-1)).toBe("libre");
    p.listo();
    expect(modos.at(-1)).toBe("lab");
  });

  it("el error boundary (fallo) libera la entrada", () => {
    const { p, modos } = puerta();
    p.abrir();
    p.listo();
    p.fallo();
    expect(modos.at(-1)).toBe("libre");
    p.listo(); // un aviso tardío no la vuelve a tomar
    expect(modos.at(-1)).toBe("libre");
  });

  it("cerrar la deja libre y cancela el plazo", () => {
    const { p, modos, tareas } = puerta();
    p.abrir();
    p.cerrar();
    expect(modos.at(-1)).toBe("libre");
    expect(tareas[0].cancelada).toBe(true);
    p.listo();
    expect(modos.at(-1)).toBe("libre");
  });
});

describe("vigilar la ventana durante la primera vez", () => {
  function emisor() {
    const f = new Map<string, (...a: unknown[]) => void>();
    return { on: (e: string, fn: (...a: unknown[]) => void) => f.set(e, fn), f };
  }
  it("el renderer muerto o la carga fallida avisan una sola vez mientras está activa", () => {
    const em = emisor();
    const motivos: string[] = [];
    let activa = true;
    vigilarPrimeraVez(em, { activa: () => activa, alFallar: (m) => motivos.push(m) });
    em.f.get("render-process-gone")?.({}, { reason: "crashed" });
    em.f.get("did-fail-load")?.({}, -105, "NAME_NOT_RESOLVED", "x", true);
    expect(motivos).toHaveLength(2);
    activa = false;
    em.f.get("render-process-gone")?.({}, { reason: "crashed" });
    expect(motivos).toHaveLength(2);
  });
  it("ignora la salida limpia, las cargas abortadas y los subframes", () => {
    const em = emisor();
    const motivos: string[] = [];
    vigilarPrimeraVez(em, { activa: () => true, alFallar: (m) => motivos.push(m) });
    em.f.get("render-process-gone")?.({}, { reason: "clean-exit" });
    em.f.get("did-fail-load")?.({}, -3, "ABORTED", "x", true);
    em.f.get("did-fail-load")?.({}, -105, "x", "x", false);
    expect(motivos).toEqual([]);
  });
});

describe("renderer que deja de responder", () => {
  it("unresponsive: la ventana deja de capturar; responsive: se pide reenviar", () => {
    const { w, log } = ventana();
    const e = crearEntrada(w);
    const oyentes = new Map<string, () => void>();
    const reenvios: string[] = [];
    vigilarRespuesta(
      { on: (ev, fn) => oyentes.set(ev, fn as () => void) },
      { olvidarCaptura: () => e.alEmpezarCarga(), reenviarCaptura: () => reenvios.push("reenviar") },
    );
    e.ignorarMouse(false);
    log.length = 0;
    oyentes.get("unresponsive")?.();
    expect(log).toEqual(["ignorar:true"]);
    oyentes.get("responsive")?.();
    expect(reenvios).toEqual(["reenviar"]);
  });
});
