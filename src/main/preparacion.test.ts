import type { EstadoPreparacion } from "@compartido/preparacion";
import { describe, expect, it } from "vitest";
import { ErrorDescarga } from "../descarga/descargar";
import type { Paso } from "../descarga/pasos";
import { crearPreparacion, mensajeDeError } from "./preparacion";

const vacio = () => new Promise<void>((r) => setTimeout(r, 0));

/** Un paso que se completa solo cuando `hecho` es true; `ejecutar` lo controla la prueba. */
function paso(
  id: string,
  bytes: number,
  ejecutar: Paso["ejecutar"],
  hecho = { v: false },
): Paso & { hecho: { v: boolean } } {
  return {
    id,
    etiqueta: id,
    fuente: "fuente-prueba",
    bytes,
    completo: async () => hecho.v,
    ejecutar: async (ctx) => {
      await ejecutar(ctx);
      hecho.v = true;
    },
    hecho,
  };
}

function montar(pasos: Paso[], extra: { libre?: number | null } = {}) {
  const estados: EstadoPreparacion[] = [];
  const prep = crearPreparacion({
    pasos,
    alEstado: (e) => estados.push(e),
    espacioLibre: async () => (extra.libre === undefined ? null : extra.libre),
    ahora: (() => {
      let t = 0;
      return () => (t += 1000);
    })(),
  });
  return { prep, estados };
}

describe("preparación", () => {
  it("si no falta nada no muestra nada y devuelve listo", async () => {
    const { prep, estados } = montar([paso("a", 10, async () => {}, { v: true })]);
    expect(await prep.preparar()).toBe("listo");
    expect(estados).toEqual([]);
  });

  it("muestra qué se baja, espera el clic y recién entonces baja", async () => {
    let corrio = false;
    const { prep, estados } = montar([
      paso("a", 100, async ({ alBytes }) => {
        corrio = true;
        alBytes(100);
      }),
    ]);
    const fin = prep.preparar();
    await vacio();
    expect(estados).toHaveLength(1);
    expect(estados[0]).toMatchObject({ fase: "inicio", total: 100 });
    expect(corrio).toBe(false);

    prep.accion("empezar");
    expect(await fin).toBe("listo");
    expect(corrio).toBe(true);
    expect(estados.at(-1)).toEqual({ fase: "listo" });
    expect(estados.some((e) => e.fase === "bajando")).toBe(true);
  });

  it("un clic repetido en Empezar no lanza dos descargas", async () => {
    let veces = 0;
    let soltar!: () => void;
    const { prep } = montar([
      paso("a", 100, () => {
        veces++;
        return new Promise<void>((r) => {
          soltar = r;
        });
      }),
    ]);
    const fin = prep.preparar();
    await vacio();
    prep.accion("empezar");
    prep.accion("empezar");
    await vacio();
    soltar();
    await fin;
    expect(veces).toBe(1);
  });

  it("cancelar deja la pantalla en pausa y Empezar de nuevo reanuda sin repetir lo hecho", async () => {
    const hechoA = { v: false };
    const hechoB = { v: false };
    let intentosB = 0;
    const { prep, estados } = montar([
      paso("a", 100, async ({ alBytes }) => alBytes(100), hechoA),
      paso(
        "b",
        100,
        ({ señal }) => {
          intentosB++;
          if (intentosB > 1) return Promise.resolve();
          return new Promise<void>((_, rej) => {
            señal?.addEventListener("abort", () => rej(new ErrorDescarga("cancelada", "cancelada")));
          });
        },
        hechoB,
      ),
    ]);
    const fin = prep.preparar();
    await vacio();
    prep.accion("empezar");
    await vacio();
    await vacio();
    prep.accion("cancelar");
    await vacio();
    await vacio();
    expect(estados.at(-1)?.fase).toBe("pausada");
    expect(hechoA.v).toBe(true);

    prep.accion("empezar");
    expect(await fin).toBe("listo");
    expect(intentosB).toBe(2);
  });

  it("un error de red muestra un mensaje que dice qué hacer y Reintentar continúa", async () => {
    let falla = true;
    const { prep, estados } = montar([
      paso("a", 100, async () => {
        if (falla) throw new ErrorDescarga("red", "Se cortó la conexión bajando a.bin.");
      }),
    ]);
    const fin = prep.preparar();
    await vacio();
    prep.accion("empezar");
    await vacio();
    await vacio();
    const e = estados.at(-1);
    expect(e?.fase).toBe("error");
    expect(e?.fase === "error" && e.mensaje).toContain("Reintentar");
    expect(e?.fase === "error" && e.mensaje).toContain("conexión");

    falla = false;
    prep.accion("empezar");
    expect(await fin).toBe("listo");
  });

  it("sin espacio en el disco no empieza y lo explica con las cifras", async () => {
    let corrio = false;
    const { prep, estados } = montar(
      [
        paso("a", 1_000_000_000, async () => {
          corrio = true;
        }),
      ],
      { libre: 500_000_000 },
    );
    void prep.preparar();
    await vacio();
    prep.accion("empezar");
    await vacio();
    await vacio();
    const e = estados.at(-1);
    expect(e?.fase).toBe("error");
    expect(e?.fase === "error" && e.mensaje).toMatch(/2,20 GB.*500 MB/);
    expect(corrio).toBe(false);
  });

  it("salir devuelve 'salir' y corta lo que corra", async () => {
    let cortado = false;
    const { prep } = montar([
      paso(
        "a",
        100,
        ({ señal }) =>
          new Promise<void>((_, rej) => {
            señal?.addEventListener("abort", () => {
              cortado = true;
              rej(new ErrorDescarga("cancelada", "x"));
            });
          }),
      ),
    ]);
    const fin = prep.preparar();
    await vacio();
    prep.accion("empezar");
    await vacio();
    await vacio();
    prep.accion("salir");
    expect(await fin).toBe("salir");
    expect(cortado).toBe(true);
  });
});

describe("mensajeDeError", () => {
  it("cada tipo dice qué hacer", () => {
    expect(mensajeDeError(new ErrorDescarga("disco", "No se pudo escribir."))).toContain("espacio");
    expect(mensajeDeError(new ErrorDescarga("integridad", "dañado."))).toContain("de nuevo");
    expect(mensajeDeError(new ErrorDescarga("http", "500."))).toContain("Reintentar");
    expect(mensajeDeError(new Error("raro"))).toContain("raro");
  });
});
