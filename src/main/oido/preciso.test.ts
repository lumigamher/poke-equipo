import { describe, expect, it } from "vitest";
import { crearClientePreciso, type HijoPreciso, REINICIO_MIN_MS } from "./preciso";

/** Un hijo falso: guarda lo que se le envía y deja responder o morir a mano. */
class HijoFalso implements HijoPreciso {
  enviados: { id: number; muestras: Float32Array }[] = [];
  matado = false;
  private mensaje: ((m: unknown) => void) | null = null;
  private salida: (() => void) | null = null;
  enviar(m: { id: number; muestras: Float32Array }) {
    this.enviados.push(m);
  }
  alMensaje(fn: (m: unknown) => void) {
    this.mensaje = fn;
  }
  alSalir(fn: () => void) {
    this.salida = fn;
  }
  matar() {
    this.matado = true;
  }
  responder(m: unknown) {
    this.mensaje?.(m);
  }
  morir() {
    this.salida?.();
  }
}

function montar() {
  let t = 1000;
  const hijos: HijoFalso[] = [];
  const avisos: string[] = [];
  const cliente = crearClientePreciso({
    lanzar: () => {
      const h = new HijoFalso();
      hijos.push(h);
      return h;
    },
    ahora: () => t,
    aviso: (m) => avisos.push(m),
  });
  return {
    cliente,
    hijos,
    avisos,
    avanzar: (ms: number) => {
      t += ms;
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

  it("si el hijo muere, rechaza todas las pendientes; no relanza hasta que haya otra petición", async () => {
    const x = montar();
    const a = x.cliente.transcribir(m(1));
    const b = x.cliente.transcribir(m(2));
    x.hijos[0].morir();
    await expect(a).rejects.toThrow();
    await expect(b).rejects.toThrow();
    expect(x.hijos).toHaveLength(1);
    void x.cliente.transcribir(m(3)).catch(() => {});
    expect(x.hijos).toHaveLength(2);
    expect(x.hijos[1].enviados).toHaveLength(1);
  });

  it("una respuesta tardía de un hijo muerto no resuelve nada del hijo nuevo", async () => {
    const x = montar();
    const a = x.cliente.transcribir(m(1));
    const idViejo = x.hijos[0].enviados[0].id;
    x.hijos[0].morir();
    await expect(a).rejects.toThrow();
    const b = x.cliente.transcribir(m(2));
    x.hijos[0].responder({ id: idViejo, texto: "fantasma", computoMs: 1 });
    x.hijos[1].responder({ id: x.hijos[1].enviados[0].id, texto: "real", computoMs: 1 });
    expect((await b).texto).toBe("real");
  });

  it("solo reinicia una vez cada 10 s: si vuelve a morir antes, rechaza hasta que pase ese margen y entonces lo intenta de nuevo", async () => {
    const x = montar();
    x.hijos[0].morir();
    const a = x.cliente.transcribir(m(1)); // reinicio 1
    expect(x.hijos).toHaveLength(2);
    x.avanzar(REINICIO_MIN_MS - 1);
    x.hijos[1].morir();
    await expect(a).rejects.toThrow();
    await expect(x.cliente.transcribir(m(2))).rejects.toThrow();
    expect(x.hijos).toHaveLength(2);
    // Todavía dentro del margen desde el último reinicio.
    x.avanzar(1);
    expect(x.hijos).toHaveLength(2);
    const c = x.cliente.transcribir(m(3));
    expect(x.hijos).toHaveLength(3);
    x.hijos[2].responder({ id: 2, texto: "hola", computoMs: 5 });
    expect((await c).texto).toBe("hola");
  });

  it("al rechazar por el margen avisa una sola vez, y avisa de nuevo si vuelve a pasar", async () => {
    const x = montar();
    x.hijos[0].morir();
    void x.cliente.transcribir(m(1)).catch(() => {});
    x.hijos[1].morir();
    await expect(x.cliente.transcribir(m(2))).rejects.toThrow();
    await expect(x.cliente.transcribir(m(3))).rejects.toThrow();
    expect(x.avisos).toHaveLength(1);
    expect(x.avisos[0]).not.toMatch(/hasta reiniciar la app/);
    x.avanzar(REINICIO_MIN_MS);
    void x.cliente.transcribir(m(4)).catch(() => {});
    x.hijos[2].morir();
    await expect(x.cliente.transcribir(m(5))).rejects.toThrow();
    expect(x.avisos).toHaveLength(2);
  });

  it("si el reinicio anterior fue hace más de 10 s, vuelve a reiniciar", () => {
    const x = montar();
    x.hijos[0].morir();
    void x.cliente.transcribir(m(1)).catch(() => {});
    x.avanzar(REINICIO_MIN_MS + 1);
    x.hijos[1].morir();
    void x.cliente.transcribir(m(2)).catch(() => {});
    expect(x.hijos).toHaveLength(3);
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

  it("cerrar mata al hijo, rechaza lo pendiente y lo que venga después", async () => {
    const x = montar();
    const a = x.cliente.transcribir(m(1));
    x.cliente.cerrar();
    expect(x.hijos[0].matado).toBe(true);
    await expect(a).rejects.toThrow();
    await expect(x.cliente.transcribir(m(2))).rejects.toThrow();
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
