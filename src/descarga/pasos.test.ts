import { describe, expect, it } from "vitest";
import { ErrorDescarga } from "./descargar";
import { ejecutarPasos, type Paso, type ProgresoPasos, pasosPendientes } from "./pasos";

function paso(id: string, bytes: number, o: Partial<Paso> = {}): Paso {
  return {
    id,
    etiqueta: id,
    fuente: "prueba",
    bytes,
    completo: async () => false,
    ejecutar: async ({ alBytes }) => alBytes(bytes),
    ...o,
  };
}

describe("pasosPendientes", () => {
  it("deja fuera lo que ya está completo", async () => {
    const lista = [paso("a", 1, { completo: async () => true }), paso("b", 2), paso("c", 3)];
    expect((await pasosPendientes(lista)).map((p) => p.id)).toEqual(["b", "c"]);
  });
});

describe("ejecutarPasos", () => {
  it("corre en orden y el progreso total suma los pasos", async () => {
    const orden: string[] = [];
    const vistos: ProgresoPasos[] = [];
    const lista = [
      paso("a", 100, {
        ejecutar: async ({ alBytes }) => {
          orden.push("a");
          alBytes(40);
          alBytes(100);
        },
      }),
      paso("b", 300, {
        ejecutar: async ({ alBytes }) => {
          orden.push("b");
          alBytes(150);
        },
      }),
    ];
    await ejecutarPasos(lista, { alProgreso: (p) => vistos.push(p) });
    expect(orden).toEqual(["a", "b"]);
    expect(vistos[0].total).toBe(400);
    expect(vistos[0].hechos).toBe(0);
    expect(vistos.some((p) => p.hechos === 40 && p.pasos[0].estado === "bajando")).toBe(true);
    const ultimo = vistos.at(-1) as ProgresoPasos;
    expect(ultimo.hechos).toBe(400);
    expect(ultimo.pasos.map((p) => p.estado)).toEqual(["listo", "listo"]);
  });

  it("un paso ya completo cuenta como hecho y no se ejecuta", async () => {
    let corrio = false;
    const vistos: ProgresoPasos[] = [];
    await ejecutarPasos(
      [
        paso("a", 50, {
          completo: async () => true,
          ejecutar: async () => {
            corrio = true;
          },
        }),
      ],
      { alProgreso: (p) => vistos.push(p) },
    );
    expect(corrio).toBe(false);
    expect((vistos.at(-1) as ProgresoPasos).hechos).toBe(50);
  });

  it("un error marca el paso, detiene los siguientes y se relanza; al repetir continúa donde se quedó", async () => {
    let falla = true;
    const corridos: string[] = [];
    const hechos = new Set<string>();
    const mk = (id: string, falla2: () => boolean) =>
      paso(id, 10, {
        completo: async () => hechos.has(id),
        ejecutar: async () => {
          corridos.push(id);
          if (falla2()) throw new ErrorDescarga("red", "sin red");
          hechos.add(id);
        },
      });
    const lista = [mk("a", () => false), mk("b", () => falla), mk("c", () => false)];
    const vistos: ProgresoPasos[] = [];
    await expect(ejecutarPasos(lista, { alProgreso: (p) => vistos.push(p) })).rejects.toMatchObject({
      tipo: "red",
    });
    expect(corridos).toEqual(["a", "b"]);
    expect((vistos.at(-1) as ProgresoPasos).pasos.map((p) => p.estado)).toEqual([
      "listo",
      "error",
      "pendiente",
    ]);

    falla = false;
    corridos.length = 0;
    await ejecutarPasos(lista);
    expect(corridos).toEqual(["b", "c"]);
  });

  it("una señal ya cancelada no arranca ningún paso", async () => {
    const control = new AbortController();
    control.abort();
    let corrio = false;
    await expect(
      ejecutarPasos(
        [
          paso("a", 1, {
            ejecutar: async () => {
              corrio = true;
            },
          }),
        ],
        { señal: control.signal },
      ),
    ).rejects.toMatchObject({ tipo: "cancelada" });
    expect(corrio).toBe(false);
  });
});
