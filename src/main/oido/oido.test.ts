import { describe, expect, it } from "vitest";
import { Oido } from "./oido";
import { RAPIDO_MAX_MS, TROZO_MAX_S } from "./tiempos-voz";
import type { Frase, Segmentador, Transcriptor, TranscriptorPreciso, Trozo } from "./transcriptor";

function falsos() {
  const cola: Trozo[][] = [];
  let reinicios = 0;
  const rapidos: number[] = [];
  const precisos: number[] = [];
  const voz = { hablando: false };
  const seg: Segmentador = {
    alimentar: () => cola.shift() ?? [],
    reiniciar: () => {
      reinicios += 1;
      voz.hablando = false;
    },
    hablando: () => voz.hablando,
  };
  const rapido: Transcriptor = {
    transcribir: (m) => {
      rapidos.push(m.length);
      return m.length === 1 ? "" : `rapido ${m.length}`;
    },
  };
  const preciso: TranscriptorPreciso = {
    transcribir: async (m) => {
      precisos.push(m.length);
      return { texto: `preciso ${m.length}`, esperaMs: 0, computoMs: 0 };
    },
  };
  return { cola, voz, seg, rapido, preciso, rapidos, precisos, reinicios: () => reinicios };
}
const trozo = (n: number) => new Float32Array(n);
const tr = (n: number, inicio = 0): Trozo => ({ muestras: trozo(n), inicio });

describe("Oido", () => {
  it("entrega una frase por cada trozo, con el texto rápido", () => {
    const f = falsos();
    const frases: Frase[] = [];
    const oido = new Oido(f.seg, f.rapido, f.preciso, (x) => frases.push(x));
    f.cola.push([tr(10), tr(20)]);
    oido.recibir(trozo(512));
    expect(frases.map((x) => x.rapido)).toEqual(["rapido 10", "rapido 20"]);
  });

  it("el paso preciso no corre hasta que se pide, y corre una sola vez", async () => {
    const f = falsos();
    const frases: Frase[] = [];
    const oido = new Oido(f.seg, f.rapido, f.preciso, (x) => frases.push(x));
    f.cola.push([tr(10), tr(20)]);
    oido.recibir(trozo(512));
    expect(f.precisos).toEqual([]);
    expect(await frases[1].preciso()).toBe("preciso 20");
    expect(await frases[1].preciso()).toBe("preciso 20");
    expect(f.precisos).toEqual([20]);
  });

  it("no entrega transcripciones vacías", () => {
    const f = falsos();
    const frases: Frase[] = [];
    const oido = new Oido(f.seg, f.rapido, f.preciso, (x) => frases.push(x));
    f.cola.push([tr(1)]);
    oido.recibir(trozo(512));
    expect(frases).toEqual([]);
  });

  // Review Focus 5
  it("descarta el audio mientras está silenciado, sin transcribir", () => {
    const f = falsos();
    const frases: Frase[] = [];
    const oido = new Oido(f.seg, f.rapido, f.preciso, (x) => frases.push(x));
    oido.silenciar("voz", true);
    f.cola.push([tr(10)]);
    oido.recibir(trozo(512));
    expect(frases).toEqual([]);
    expect(f.rapidos).toEqual([]);
    expect(f.cola).toHaveLength(1);
  });

  it("reinicia el corte al silenciar y al reabrir, para no transcribir un trozo a medias", () => {
    const f = falsos();
    const oido = new Oido(f.seg, f.rapido, f.preciso, () => {});
    oido.silenciar("voz", true);
    oido.silenciar("voz", false);
    expect(f.reinicios()).toBe(2);
  });

  it("sigue silenciado mientras quede algún motivo", () => {
    const f = falsos();
    const oido = new Oido(f.seg, f.rapido, f.preciso, () => {});
    oido.silenciar("voz", true);
    oido.silenciar("usuario", true);
    oido.silenciar("voz", false);
    expect(oido.silenciado).toBe(true);
    oido.silenciar("usuario", false);
    expect(oido.silenciado).toBe(false);
  });

  it("si se silencia en medio de una tanda, no transcribe los trozos que faltan", () => {
    const f = falsos();
    const frases: Frase[] = [];
    const oido: Oido = new Oido(f.seg, f.rapido, f.preciso, (x) => {
      frases.push(x);
      oido.silenciar("voz", true);
    });
    f.cola.push([tr(10), tr(20)]);
    oido.recibir(trozo(512));
    expect(frases.map((x) => x.rapido)).toEqual(["rapido 10"]);
  });

  it("descartar() tira lo que se venía oyendo sin silenciar: el audio de después sí produce frase", () => {
    // Segmentador con memoria: guarda el audio y lo entrega junto con el silencio siguiente.
    let guardado = 0;
    const seg: Segmentador = {
      alimentar: (m) => {
        if (m.length === 1) return []; // silencio sin nada guardado
        if (m.length === 2) {
          const t = guardado;
          guardado = 0;
          return t > 0 ? [tr(t)] : [];
        }
        guardado += m.length;
        return [];
      },
      reiniciar: () => {
        guardado = 0;
      },
      hablando: () => guardado > 0,
    };
    const f = falsos();
    const frases: Frase[] = [];
    const oido = new Oido(seg, f.rapido, f.preciso, (x) => frases.push(x));
    oido.recibir(trozo(512)); // voz que empieza antes
    oido.descartar();
    oido.recibir(trozo(2)); // silencio que la cerraría
    expect(frases).toEqual([]);
    expect(oido.silenciado).toBe(false);
    oido.recibir(trozo(512)); // voz nueva, después
    oido.recibir(trozo(2));
    expect(frases.map((x) => x.rapido)).toEqual(["rapido 512"]);
  });

  describe("hora de inicio de la frase", () => {
    // Bloques de 1600 muestras (100 ms). El bloque que termina en t empezó en t - 100.
    it("calcula la hora cuando el trozo empieza a mitad de un bloque", () => {
      const f = falsos();
      const frases: Frase[] = [];
      const oido = new Oido(f.seg, f.rapido, f.preciso, (x) => frases.push(x));
      oido.recibir(trozo(1600), 10_100); // empezó en 10_000
      oido.recibir(trozo(1600), 10_200); // empezó en 10_100
      f.cola.push([tr(500, 1600 + 800)]); // 800 muestras dentro del segundo bloque = 50 ms
      oido.recibir(trozo(1600), 10_300);
      expect(frases[0].inicioMs).toBeCloseTo(10_150, 5);
    });

    it("es null si algún bloque llegó sin hora válida", () => {
      const f = falsos();
      const frases: Frase[] = [];
      const oido = new Oido(f.seg, f.rapido, f.preciso, (x) => frases.push(x));
      oido.recibir(trozo(1600), 10_100);
      oido.recibir(trozo(1600), Number.NaN);
      oido.recibir(trozo(1600));
      f.cola.push([tr(500, 100)]);
      oido.recibir(trozo(1600), 10_400);
      expect(frases[0].inicioMs).toBeNull();
    });

    it("descartar() borra la cuenta: el índice vuelve a contar desde cero", () => {
      const f = falsos();
      const frases: Frase[] = [];
      const oido = new Oido(f.seg, f.rapido, f.preciso, (x) => frases.push(x));
      oido.recibir(trozo(1600), 5_100);
      oido.recibir(trozo(1600), Number.NaN);
      oido.descartar();
      oido.recibir(trozo(1600), 20_100); // primer bloque tras el reinicio: empezó en 20_000
      f.cola.push([tr(500, 0)]);
      oido.recibir(trozo(1600), 20_200);
      expect(frases[0].inicioMs).toBe(20_000);
    });

    it("un trozo de más de TROZO_MAX_S se parte antes de transcribirlo; solo el primer pedazo lleva hora", () => {
      const f = falsos();
      const frases: Frase[] = [];
      const lineas: string[] = [];
      const oido = new Oido(f.seg, f.rapido, f.preciso, (x) => frases.push(x), {
        registrar: (l) => lineas.push(l),
      });
      oido.recibir(trozo(1600), 10_100); // empezó en 10_000
      const largo = Math.round(1.5 * TROZO_MAX_S * 16000);
      f.cola.push([tr(largo, 0)]);
      oido.recibir(trozo(1600), 10_200);
      expect(f.rapidos).toEqual([largo / 2, largo / 2]);
      expect(Math.max(...f.rapidos)).toBeLessThanOrEqual(TROZO_MAX_S * 16000);
      expect(frases.map((x) => x.inicioMs)).toEqual([10_000, null]);
      expect(lineas[0]).toMatch(/partido en 2/);
    });

    it("un índice de hace más de la memoria no se puede ubicar", () => {
      const f = falsos();
      const frases: Frase[] = [];
      const oido = new Oido(f.seg, f.rapido, f.preciso, (x) => frases.push(x));
      for (let i = 0; i < 700; i++) oido.recibir(trozo(1600), 100 * (i + 1)); // 70 s
      f.cola.push([tr(500, 0)]);
      oido.recibir(trozo(1600), 70_100);
      expect(frases[0].inicioMs).toBeNull();
    });
  });

  describe("tiempos en el registro", () => {
    const HZ = 16000;
    function conRegistro(preciso: TranscriptorPreciso, textoRapido = "hola", pedir = true) {
      const lineas: string[] = [];
      let t = 0;
      const f = falsos();
      const oido = new Oido(
        f.seg,
        {
          transcribir: () => {
            t += 210;
            return textoRapido;
          },
        },
        preciso,
        (x) => {
          frases.push(x);
          // Como la tubería real: lo que lo necesita lo pide mientras maneja la frase.
          if (pedir) x.preciso().catch(() => {});
        },
        { registrar: (l) => lineas.push(l), ahora: () => t },
      );
      const frases: Frase[] = [];
      return { f, oido, lineas, frases };
    }
    const ok: TranscriptorPreciso = {
      transcribir: async () => ({ texto: "hola", esperaMs: 12, computoMs: 1380 }),
    };

    it("una frase cuyo preciso se pidió registra audio, rápido y preciso (espera y cómputo), sin texto", async () => {
      const x = conRegistro(ok, "palabra secreta");
      x.f.cola.push([tr(Math.round(3.2 * HZ))]);
      x.oido.recibir(trozo(512));
      await x.frases[0].preciso();
      expect(x.lineas).toEqual(["Oído: frase de 3,2 s · rápido 210 ms · preciso 1380 ms (espera 12 ms)"]);
      expect(x.lineas[0]).not.toContain("secreta");
    });

    it("una frase cuyo preciso nunca se pidió lo dice, una sola vez", () => {
      const x = conRegistro(ok, "hola", false);
      x.f.cola.push([tr(HZ)]);
      x.oido.recibir(trozo(512));
      expect(x.lineas).toEqual(["Oído: frase de 1,0 s · rápido 210 ms · preciso no se pidió"]);
    });

    it("si el preciso falla, lo dice y la promesa rechaza", async () => {
      const x = conRegistro({
        transcribir: async () => {
          throw new Error("x");
        },
      });
      x.f.cola.push([tr(HZ)]);
      x.oido.recibir(trozo(512));
      await expect(x.frases[0].preciso()).rejects.toThrow();
      expect(x.lineas).toEqual(["Oído: frase de 1,0 s · rápido 210 ms · preciso falló"]);
    });

    it("un preciso vacío resuelve vacío (no cae al rápido: lo decide quien llama)", async () => {
      const x = conRegistro({ transcribir: async () => ({ texto: "  ", esperaMs: 0, computoMs: 5 }) });
      x.f.cola.push([tr(HZ)]);
      x.oido.recibir(trozo(512));
      expect(await x.frases[0].preciso()).toBe("");
    });
  });
});

describe("Oido avisa si hay voz en curso", () => {
  it("avisa solo cuando cambia, tras alimentar el segmentador", () => {
    const f = falsos();
    const avisos: boolean[] = [];
    const oido = new Oido(f.seg, f.rapido, f.preciso, () => {}, { alVoz: (h) => avisos.push(h) });
    oido.recibir(trozo(512));
    expect(avisos).toEqual([]);
    f.voz.hablando = true;
    oido.recibir(trozo(512));
    oido.recibir(trozo(512));
    expect(avisos).toEqual([true]);
    f.voz.hablando = false;
    oido.recibir(trozo(512));
    expect(avisos).toEqual([true, false]);
  });

  it("al descartar o silenciar con voz en curso, avisa que ya no hay", () => {
    const f = falsos();
    const avisos: boolean[] = [];
    const oido = new Oido(f.seg, f.rapido, f.preciso, () => {}, { alVoz: (h) => avisos.push(h) });
    f.voz.hablando = true;
    oido.recibir(trozo(512));
    oido.descartar();
    expect(avisos).toEqual([true, false]);
    f.voz.hablando = true;
    oido.recibir(trozo(512));
    oido.silenciar("voz", true);
    expect(avisos).toEqual([true, false, true, false]);
  });

  it("sin voz en curso, descartar no avisa nada", () => {
    const f = falsos();
    const avisos: boolean[] = [];
    const oido = new Oido(f.seg, f.rapido, f.preciso, () => {}, { alVoz: (h) => avisos.push(h) });
    oido.descartar();
    expect(avisos).toEqual([]);
  });
});

describe("Oido con el paso rápido fuera del hilo principal", () => {
  /** Un rápido asíncrono que resuelve cuando la prueba lo decide, en el orden que quiera. */
  function conRapidoAsincrono() {
    const f = falsos();
    const pendientes: ((texto: string) => void)[] = [];
    const rapido: TranscriptorPreciso = {
      transcribir: () =>
        new Promise((r) => pendientes.push((texto) => r({ texto, esperaMs: 0, computoMs: 0 }))),
    };
    const frases: string[] = [];
    const oido = new Oido(f.seg, rapido, f.preciso, (x) => frases.push(x.rapido));
    const drenar = () => new Promise<void>((r) => setImmediate(r));
    return { f, pendientes, frases, oido, drenar };
  }

  it("el tope del paso rápido es de 8 s: deja margen a un arranque en frío lento", () => {
    expect(RAPIDO_MAX_MS).toBe(8000);
  });

  it("si el paso rápido se cuelga, a los RAPIDO_MAX_MS se pierde el trozo, se libera el aviso y se registra una vez", async () => {
    const f = falsos();
    const tareas: { en: number; fn: () => void; viva: boolean }[] = [];
    let t = 0;
    const eventos: boolean[] = [];
    const avisos: string[] = [];
    const frases: string[] = [];
    const colgado: TranscriptorPreciso = { transcribir: () => new Promise(() => {}) };
    const oido = new Oido(f.seg, colgado, f.preciso, (x) => frases.push(x.rapido), {
      programar: (fn, ms) => {
        const tarea = { en: t + ms, fn, viva: true };
        tareas.push(tarea);
        return () => {
          tarea.viva = false;
        };
      },
      alTranscribir: (a) => eventos.push(a),
      aviso: (mensaje) => avisos.push(mensaje),
    });
    const drenar = () => new Promise<void>((r) => setImmediate(r));
    f.cola.push([tr(10)]);
    oido.recibir(trozo(5), 1000);
    expect(eventos).toEqual([true]);
    t += RAPIDO_MAX_MS - 1;
    for (const x of tareas) if (x.viva && x.en <= t) x.fn();
    await drenar();
    expect(eventos).toEqual([true]);
    t += 1;
    for (const x of tareas) if (x.viva && x.en <= t) x.fn();
    await drenar();
    expect(eventos).toEqual([true, false]);
    expect(avisos).toHaveLength(1);
    expect(frases).toEqual([]);
  });

  it("entrega las frases en el orden en que se oyeron, aunque la segunda termine antes", async () => {
    const m = conRapidoAsincrono();
    m.f.cola.push([tr(10), tr(20)]);
    m.oido.recibir(trozo(5), 1000);
    expect(m.frases).toEqual([]);
    m.pendientes[1]("segunda");
    await m.drenar();
    expect(m.frases).toEqual([]);
    m.pendientes[0]("primera");
    await m.drenar();
    expect(m.frases).toEqual(["primera", "segunda"]);
  });

  it("lo que se pidió antes de un descarte o un silencio no se entrega", async () => {
    const m = conRapidoAsincrono();
    m.f.cola.push([tr(10)]);
    m.oido.recibir(trozo(5), 1000);
    m.oido.descartar();
    m.pendientes[0]("vieja");
    await m.drenar();
    expect(m.frases).toEqual([]);
    m.f.cola.push([tr(10)]);
    m.oido.recibir(trozo(5), 2000);
    m.pendientes[1]("nueva");
    await m.drenar();
    expect(m.frases).toEqual(["nueva"]);
  });

  it("vaciar espera lo que sigue en camino y sí lo entrega", async () => {
    const m = conRapidoAsincrono();
    m.f.cola.push([tr(10)]);
    m.oido.recibir(trozo(5), 1000);
    const espera = m.oido.vaciar();
    expect(espera).not.toBeNull();
    m.pendientes[0]("a medias");
    await espera;
    expect(m.frases).toEqual(["a medias"]);
    expect(m.oido.vaciar()).toBeNull();
  });
});
