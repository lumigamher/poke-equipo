import type { Audio } from "@compartido/tipos";
import { describe, expect, it, vi } from "vitest";
import { type Reproductor, type Sintetizador, Voz } from "./voz";

function montar(opciones: { fallaSintesis?: boolean; rechazaPrimera?: boolean } = {}) {
  const dichos: string[] = [];
  const cambios: boolean[] = [];
  let soltar: (() => void) | null = null;
  const s: Sintetizador = {
    generar(texto) {
      if (opciones.fallaSintesis) throw new Error("sin modelo");
      dichos.push(texto);
      return { muestras: new Float32Array(1), frecuencia: 22050 } satisfies Audio;
    },
  };
  let reproducciones = 0;
  const r: Reproductor = {
    reproducir: () => {
      reproducciones += 1;
      if (opciones.rechazaPrimera && reproducciones === 1)
        return Promise.reject(new Error("sin salida de audio"));
      return new Promise<void>((resolver) => {
        soltar = resolver;
      });
    },
    detener: () => {
      soltar?.();
      soltar = null;
    },
  };
  const voz = new Voz(s, r, (h) => cambios.push(h));
  const terminar = async () => {
    soltar?.();
    soltar = null;
    await new Promise((x) => setTimeout(x, 0));
  };
  return { voz, dichos, cambios, terminar };
}
const pausa = () => new Promise((r) => setTimeout(r, 0));

describe("Voz", () => {
  it("avisa cuando empieza y cuando termina de hablar", async () => {
    const m = montar();
    const fin = m.voz.decir("hola", "v", 1);
    await pausa();
    expect(m.cambios).toEqual([true]);
    await m.terminar();
    await fin;
    expect(m.cambios).toEqual([true, false]);
  });

  it("habla de a una frase: la segunda espera a la primera", async () => {
    const m = montar();
    void m.voz.decir("uno", "v", 1);
    const fin = m.voz.decir("dos", "v", 1);
    await pausa();
    expect(m.dichos).toEqual(["uno"]);
    await m.terminar();
    await pausa();
    expect(m.dichos).toEqual(["uno", "dos"]);
    await m.terminar();
    await fin;
  });

  it("callar corta la frase y descarta las que esperaban", async () => {
    const m = montar();
    void m.voz.decir("uno", "v", 1);
    const fin = m.voz.decir("dos", "v", 1);
    await pausa();
    m.voz.callar();
    await fin;
    expect(m.dichos).toEqual(["uno"]);
    expect(m.cambios.at(-1)).toBe(false);
  });

  it("después de callar puede volver a hablar", async () => {
    const m = montar();
    void m.voz.decir("uno", "v", 1);
    await pausa();
    m.voz.callar();
    await pausa();
    const fin = m.voz.decir("tres", "v", 1);
    await pausa();
    expect(m.dichos).toEqual(["uno", "tres"]);
    await m.terminar();
    await fin;
    expect(m.cambios).toEqual([true, false, true, false]);
  });

  it("con dos Pokémon (dueños) pidiendo voz a la vez, sus frases suenan una tras otra, nunca a la vez", async () => {
    const eventos: string[] = [];
    const cambios: boolean[] = [];
    const textos = new WeakMap<Audio, string>();
    let sonando = 0;
    let maximo = 0;
    const s: Sintetizador = {
      generar(texto) {
        const audio: Audio = { muestras: new Float32Array(1), frecuencia: 22050 };
        textos.set(audio, texto);
        return audio;
      },
    };
    const r: Reproductor = {
      reproducir: async (a) => {
        sonando += 1;
        maximo = Math.max(maximo, sonando);
        eventos.push(`inicio:${textos.get(a)}`);
        await new Promise((x) => setTimeout(x, 5));
        eventos.push(`fin:${textos.get(a)}`);
        sonando -= 1;
      },
      detener: () => {},
    };
    const voz = new Voz(s, r, (h) => cambios.push(h));
    await Promise.all([
      voz.decir("A uno", "v1", 1, "a"),
      voz.decir("B uno", "v2", 1, "b"),
      voz.decir("A dos", "v1", 1, "a"),
      voz.decir("B dos", "v2", 1, "b"),
    ]);
    expect(eventos).toEqual([
      "inicio:A uno",
      "fin:A uno",
      "inicio:B uno",
      "fin:B uno",
      "inicio:A dos",
      "fin:A dos",
      "inicio:B dos",
      "fin:B dos",
    ]);
    expect(maximo).toBe(1);
    // Cada frase abre y cierra su aviso: nunca dos "empieza" seguidos.
    expect(cambios).toEqual([true, false, true, false, true, false, true, false]);
  });

  it("callar(dueño) corta lo de ese dueño y descarta su cola, pero la del otro sigue", async () => {
    const m = montar();
    void m.voz.decir("a1", "v", 1, "a");
    void m.voz.decir("b1", "v", 1, "b");
    const fin = m.voz.decir("a2", "v", 1, "a");
    await pausa();
    expect(m.dichos).toEqual(["a1"]);
    m.voz.callar("a");
    await pausa();
    expect(m.dichos).toEqual(["a1", "b1"]);
    await m.terminar();
    await fin;
    expect(m.dichos).toEqual(["a1", "b1"]);
  });

  it("callar(dueño) no corta lo que suena de otro dueño", async () => {
    const m = montar();
    void m.voz.decir("b1", "v", 1, "b");
    const fin = m.voz.decir("a1", "v", 1, "a");
    await pausa();
    m.voz.callar("a");
    await pausa();
    expect(m.cambios).toEqual([true]);
    await m.terminar();
    await fin;
    expect(m.dichos).toEqual(["b1"]);
    expect(m.cambios).toEqual([true, false]);
  });

  it("después de callar(dueño) ese dueño puede volver a hablar", async () => {
    const m = montar();
    void m.voz.decir("a1", "v", 1, "a");
    await pausa();
    m.voz.callar("a");
    await pausa();
    const fin = m.voz.decir("a2", "v", 1, "a");
    await pausa();
    expect(m.dichos).toEqual(["a1", "a2"]);
    await m.terminar();
    await fin;
  });

  it("la fila de un dueño se poda cuando queda vacía, también tras callarlo", async () => {
    const m = montar();
    const fin = m.voz.decir("a1", "v", 1, "a");
    void m.voz.decir("b1", "v", 1, "b");
    await pausa();
    expect(m.voz.dueñosEnFila()).toBe(2);
    await m.terminar();
    await fin;
    expect(m.voz.dueñosEnFila()).toBe(1);
    m.voz.callar("b");
    await pausa();
    expect(m.voz.dueñosEnFila()).toBe(0);
    m.voz.callar("nadie");
    expect(m.voz.dueñosEnFila()).toBe(0);
  });

  it("callar() sin dueño corta y descarta lo de todos", async () => {
    const m = montar();
    void m.voz.decir("a1", "v", 1, "a");
    const fin = m.voz.decir("b1", "v", 1, "b");
    await pausa();
    m.voz.callar();
    await fin;
    expect(m.dichos).toEqual(["a1"]);
  });

  it("si la síntesis falla no cierra el micrófono ni bloquea la cola", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = montar({ fallaSintesis: true });
    await m.voz.decir("uno", "v", 1);
    await m.voz.decir("dos", "v", 1);
    expect(m.cambios).toEqual([]);
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });

  it("si el reproductor rechaza no rompe la cola ni rechaza al llamador", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = montar({ rechazaPrimera: true });
    await expect(m.voz.decir("uno", "v", 1)).resolves.toBeUndefined();
    expect(m.cambios).toEqual([true, false]);
    expect(aviso).toHaveBeenCalledTimes(1);
    const fin = m.voz.decir("dos", "v", 1);
    await pausa();
    await m.terminar();
    await fin;
    expect(m.dichos).toEqual(["uno", "dos"]);
    expect(m.cambios).toEqual([true, false, true, false]);
    aviso.mockRestore();
  });
});
