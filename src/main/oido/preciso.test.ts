import { describe, expect, it } from "vitest";
import { crearClientePreciso, ESPERAS_RELANZAR_MS, type HijoPreciso, VIDA_SANA_MS } from "./preciso";

/** Un hijo falso: guarda lo que se le envía y deja responder o morir a mano. */
class HijoFalso implements HijoPreciso {
  enviados: { id: number; muestras: Float32Array }[] = [];
  matado = false;
  private mensaje: ((m: unknown) => void) | null = null;
  private salida: ((codigo: number | null) => void) | null = null;
  enviar(m: { id: number; muestras: Float32Array }) {
    this.enviados.push(m);
  }
  alMensaje(fn: (m: unknown) => void) {
    this.mensaje = fn;
  }
  alSalir(fn: (codigo: number | null) => void) {
    this.salida = fn;
  }
  matar() {
    this.matado = true;
  }
  responder(m: unknown) {
    this.mensaje?.(m);
  }
  morir(codigo: number | null = 5) {
    this.salida?.(codigo);
  }
}

function montar() {
  let t = 1000;
  const hijos: HijoFalso[] = [];
  const avisos: string[] = [];
  const timers: { en: number; fn: () => void; vivo: boolean }[] = [];
  let caidas = 0;
  const cliente = crearClientePreciso({
    lanzar: () => {
      const h = new HijoFalso();
      hijos.push(h);
      return h;
    },
    ahora: () => t,
    aviso: (m) => avisos.push(m),
    nombre: "rápido",
    programar: (fn, ms) => {
      const timer = { en: t + ms, fn, vivo: true };
      timers.push(timer);
      return () => {
        timer.vivo = false;
      };
    },
    alCaido: () => {
      caidas += 1;
    },
  });
  return {
    cliente,
    hijos,
    avisos,
    caidas: () => caidas,
    /** Avanza el reloj y dispara lo que venza. */
    avanzar: (ms: number) => {
      t += ms;
      for (const timer of [...timers]) {
        if (timer.vivo && timer.en <= t) {
          timer.vivo = false;
          timer.fn();
        }
      }
    },
  };
}
const m = (n: number) => new Float32Array(n);

describe("cliente del transcriptor preciso", () => {
  it("lanza el hijo una sola vez al crearse y le manda las peticiones en orden, cada una con su id", () => {
    const x = montar();
    expect(x.hijos).toHaveLength(1);
    void x.cliente.transcribir(m(1)).catch(() => {});
    void x.cliente.transcribir(m(2)).catch(() => {});
    void x.cliente.transcribir(m(3)).catch(() => {});
    expect(x.hijos).toHaveLength(1);
    expect(x.hijos[0].enviados.map((e) => e.muestras.length)).toEqual([1, 2, 3]);
    expect(new Set(x.hijos[0].enviados.map((e) => e.id)).size).toBe(3);
  });

  it("resuelve cada petición con su texto, aunque las respuestas lleguen en otro orden", async () => {
    const x = montar();
    const a = x.cliente.transcribir(m(1));
    const b = x.cliente.transcribir(m(2));
    const [pa, pb] = x.hijos[0].enviados;
    x.hijos[0].responder({ id: pb.id, texto: "segunda", computoMs: 5 });
    x.hijos[0].responder({ id: pa.id, texto: "primera", computoMs: 5 });
    expect((await a).texto).toBe("primera");
    expect((await b).texto).toBe("segunda");
  });

  it("separa la espera del cómputo", async () => {
    const x = montar();
    const a = x.cliente.transcribir(m(1));
    x.avanzar(1500);
    x.hijos[0].responder({ id: x.hijos[0].enviados[0].id, texto: "hola", computoMs: 400 });
    expect(await a).toEqual({ texto: "hola", esperaMs: 1100, computoMs: 400 });
  });

  it("rechaza la petición cuando el hijo responde con un error, y sigue sirviendo las demás", async () => {
    const x = montar();
    const a = x.cliente.transcribir(m(1));
    const b = x.cliente.transcribir(m(2));
    const [pa, pb] = x.hijos[0].enviados;
    x.hijos[0].responder({ id: pa.id, error: "sherpa se quejó" });
    await expect(a).rejects.toThrow("sherpa se quejó");
    x.hijos[0].responder({ id: pb.id, texto: "bien", computoMs: 1 });
    expect((await b).texto).toBe("bien");
  });

  it("ignora respuestas con id desconocido o mal formadas", async () => {
    const x = montar();
    const a = x.cliente.transcribir(m(1));
    x.hijos[0].responder({ id: 999, texto: "nadie" });
    x.hijos[0].responder("basura");
    x.hijos[0].responder(null);
    x.hijos[0].responder({ id: x.hijos[0].enviados[0].id, texto: "ok", computoMs: 1 });
    expect((await a).texto).toBe("ok");
  });

  it("si el hijo muere, rechaza todas las pendientes, lo registra con su código y lo relanza solo tras la primera espera", async () => {
    const x = montar();
    const a = x.cliente.transcribir(m(1));
    const b = x.cliente.transcribir(m(2));
    x.hijos[0].morir(5);
    await expect(a).rejects.toThrow();
    await expect(b).rejects.toThrow();
    expect(x.avisos.at(-1)).toMatch(/rápido terminó \(código 5\).*intento 1/);
    expect(x.hijos).toHaveLength(1);
    x.avanzar(ESPERAS_RELANZAR_MS[0] - 1);
    expect(x.hijos).toHaveLength(1);
    x.avanzar(1);
    expect(x.hijos).toHaveLength(2);
    // Lo que estaba pendiente no se reenvía al hijo nuevo: ese audio ya es viejo.
    expect(x.hijos[1].enviados).toHaveLength(0);
    void x.cliente.transcribir(m(3)).catch(() => {});
    expect(x.hijos[1].enviados.map((e) => e.muestras.length)).toEqual([3]);
  });

  it("mientras espera para relanzar, las peticiones rechazan enseguida y no lanzan nada", async () => {
    const x = montar();
    x.hijos[0].morir();
    await expect(x.cliente.transcribir(m(1))).rejects.toThrow(/no está disponible/);
    expect(x.hijos).toHaveLength(1);
  });

  it("una respuesta tardía de un hijo muerto no resuelve nada del hijo nuevo", async () => {
    const x = montar();
    const a = x.cliente.transcribir(m(1));
    const idViejo = x.hijos[0].enviados[0].id;
    x.hijos[0].morir();
    await expect(a).rejects.toThrow();
    x.avanzar(ESPERAS_RELANZAR_MS[0]);
    const b = x.cliente.transcribir(m(2));
    x.hijos[0].responder({ id: idViejo, texto: "fantasma", computoMs: 1 });
    x.hijos[1].responder({ id: x.hijos[1].enviados[0].id, texto: "real", computoMs: 1 });
    expect((await b).texto).toBe("real");
  });

  it("espera cada vez más entre relanzamientos seguidos y, agotados, queda caído y avisa una vez", async () => {
    const x = montar();
    for (const [i, espera] of ESPERAS_RELANZAR_MS.entries()) {
      x.hijos[i].morir();
      x.avanzar(espera - 1);
      expect(x.hijos).toHaveLength(i + 1);
      x.avanzar(1);
      expect(x.hijos).toHaveLength(i + 2);
    }
    expect(x.caidas()).toBe(0);
    x.hijos[ESPERAS_RELANZAR_MS.length].morir();
    expect(x.caidas()).toBe(1);
    expect(x.avisos.at(-1)).toMatch(/queda apagado/);
    x.avanzar(10 * 60_000);
    expect(x.hijos).toHaveLength(ESPERAS_RELANZAR_MS.length + 1);
    await expect(x.cliente.transcribir(m(1))).rejects.toThrow();
    expect(x.caidas()).toBe(1);
  });

  it("un hijo que vivió lo suficiente antes de morir vuelve a empezar el conteo de caídas", () => {
    const x = montar();
    x.hijos[0].morir();
    x.avanzar(ESPERAS_RELANZAR_MS[0]);
    x.hijos[1].morir();
    x.avanzar(ESPERAS_RELANZAR_MS[1]);
    expect(x.hijos).toHaveLength(3);
    x.avanzar(VIDA_SANA_MS);
    x.hijos[2].morir();
    expect(x.avisos.at(-1)).toMatch(/intento 1 de/);
    x.avanzar(ESPERAS_RELANZAR_MS[0]);
    expect(x.hijos).toHaveLength(4);
  });

  it("reintentar levanta enseguida un proceso caído y reinicia el conteo; con el hijo vivo no hace nada", () => {
    const x = montar();
    x.cliente.reintentar();
    expect(x.hijos).toHaveLength(1);
    for (const [i, espera] of ESPERAS_RELANZAR_MS.entries()) {
      x.hijos[i].morir();
      x.avanzar(espera);
    }
    x.hijos.at(-1)?.morir();
    expect(x.caidas()).toBe(1);
    const antes = x.hijos.length;
    x.cliente.reintentar();
    expect(x.hijos).toHaveLength(antes + 1);
    x.hijos.at(-1)?.morir();
    expect(x.avisos.at(-1)).toMatch(/intento 1 de/);
  });

  it("reintentar durante la espera relanza ya y cancela el relanzamiento programado", () => {
    const x = montar();
    x.hijos[0].morir();
    x.cliente.reintentar();
    expect(x.hijos).toHaveLength(2);
    x.avanzar(ESPERAS_RELANZAR_MS[0]);
    expect(x.hijos).toHaveLength(2);
  });

  it("si no se puede lanzar, cuenta como caída y lo vuelve a intentar tras la espera", () => {
    let intentos = 0;
    const timers: (() => void)[] = [];
    crearClientePreciso({
      lanzar: () => {
        intentos += 1;
        throw new Error("no arranca");
      },
      ahora: () => 0,
      aviso: () => {},
      programar: (fn) => {
        timers.push(fn);
        return () => {};
      },
    });
    expect(intentos).toBe(1);
    timers.shift()?.();
    expect(intentos).toBe(2);
  });

  it("si no se puede lanzar el hijo, la petición rechaza", async () => {
    let intentos = 0;
    const cliente = crearClientePreciso({
      lanzar: () => {
        intentos += 1;
        throw new Error("no arranca");
      },
      ahora: () => 0,
      aviso: () => {},
    });
    await expect(cliente.transcribir(m(1))).rejects.toThrow();
    expect(intentos).toBeGreaterThan(0);
  });

  it("cerrar mata al hijo, rechaza lo pendiente y lo que venga después, y no relanza nada", async () => {
    const x = montar();
    const a = x.cliente.transcribir(m(1));
    x.cliente.cerrar();
    expect(x.hijos[0].matado).toBe(true);
    x.hijos[0].morir(0);
    await expect(a).rejects.toThrow();
    await expect(x.cliente.transcribir(m(2))).rejects.toThrow();
    x.cliente.reintentar();
    x.avanzar(10 * 60_000);
    expect(x.hijos).toHaveLength(1);
  });

  it("cerrar durante la espera cancela el relanzamiento", () => {
    const x = montar();
    x.hijos[0].morir();
    x.cliente.cerrar();
    x.avanzar(10 * 60_000);
    expect(x.hijos).toHaveLength(1);
  });

  it("el cliente no pone plazos: una petición sin respuesta queda pendiente (el plazo lo pone quien llama)", async () => {
    const x = montar();
    let resuelta = false;
    void x.cliente.transcribir(m(1)).then(() => {
      resuelta = true;
    });
    x.avanzar(10 * 60_000);
    await Promise.resolve();
    expect(resuelta).toBe(false);
  });
});
