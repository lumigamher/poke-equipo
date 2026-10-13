import { describe, expect, it } from "vitest";
import { ErrorDescarga } from "./descargar";
import { crearGestor } from "./gestor";
import type { Paso } from "./pasos";

/** Pasos de mentira: cada especie se "baja" cuando la prueba suelta su compuerta. */
function montar(opciones: { falla?: (e: number) => ErrorDescarga | null } = {}) {
  const hechas = new Set<number>();
  const orden: number[] = [];
  const compuertas = new Map<number, () => void>();
  const listas: number[] = [];
  let simultaneas = 0;
  let maximo = 0;
  const gestor = crearGestor({
    pasoDe: (e): Paso => ({
      id: String(e),
      etiqueta: String(e),
      fuente: "x",
      bytes: 1,
      completo: async () => hechas.has(e),
      ejecutar: async ({ señal }) => {
        simultaneas++;
        maximo = Math.max(maximo, simultaneas);
        orden.push(e);
        try {
          const error = opciones.falla?.(e);
          if (error) throw error;
          await new Promise<void>((res, rej) => {
            compuertas.set(e, res);
            señal?.addEventListener("abort", () => rej(new ErrorDescarga("cancelada", "x")));
          });
          hechas.add(e);
        } finally {
          simultaneas--;
        }
      },
    }),
    alListo: (e) => listas.push(e),
  });
  const soltar = async (e: number) => {
    // Espera a que el trabajador llegue a esa especie.
    for (let i = 0; i < 50 && !compuertas.has(e); i++) await new Promise((r) => setTimeout(r, 0));
    compuertas.get(e)?.();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { gestor, orden, soltar, listas, maximo: () => maximo, hechas };
}

describe("gestor de especies", () => {
  it("baja de a una, en el orden de la cola de fondo", async () => {
    const m = montar();
    m.gestor.segundoPlano([2, 3, 5]);
    await m.soltar(2);
    await m.soltar(3);
    await m.soltar(5);
    expect(m.orden).toEqual([2, 3, 5]);
    expect(m.maximo()).toBe(1);
    expect(m.listas).toEqual([2, 3, 5]);
  });

  it("una especie pedida pasa por delante de la cola de fondo y resuelve true", async () => {
    const m = montar();
    m.gestor.segundoPlano([2, 3, 5]);
    const pedida = m.gestor.pedir(5);
    await m.soltar(2); // la 2 ya había empezado
    await m.soltar(5);
    expect(await pedida).toBe(true);
    await m.soltar(3);
    expect(m.orden).toEqual([2, 5, 3]);
  });

  it("pedir dos veces la misma especie comparte la descarga", async () => {
    const m = montar();
    const a = m.gestor.pedir(9);
    const b = m.gestor.pedir(9);
    await m.soltar(9);
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(m.orden).toEqual([9]);
  });

  it("pedir una que ya está en disco resuelve true sin bajar nada", async () => {
    const m = montar();
    m.hechas.add(7);
    expect(await m.gestor.pedir(7)).toBe(true);
    expect(m.orden).toEqual([]);
  });

  it("si el fondo falla por red se detiene y no insiste con el resto", async () => {
    const m = montar({ falla: (e) => (e === 2 ? new ErrorDescarga("red", "sin red") : null) });
    m.gestor.segundoPlano([2, 3, 5]);
    await new Promise((r) => setTimeout(r, 10));
    expect(m.orden).toEqual([2]);
  });

  it("un 404 en una especie no vacía la cola: se marca y se sigue con las demás", async () => {
    const m = montar({ falla: (e) => (e === 2 ? new ErrorDescarga("http", "404", { estado: 404 }) : null) });
    m.gestor.segundoPlano([2, 3, 5]);
    await m.soltar(3);
    await m.soltar(5);
    expect(m.orden).toEqual([2, 3, 5]);
    // Y pedirla después no vuelve a golpear al servidor.
    expect(await m.gestor.pedir(2)).toBe(false);
    expect(m.orden).toEqual([2, 3, 5]);
  });

  it("un 500 sí detiene el fondo (puede ser una caída del servidor)", async () => {
    const m = montar({ falla: (e) => (e === 2 ? new ErrorDescarga("http", "500", { estado: 500 }) : null) });
    m.gestor.segundoPlano([2, 3, 5]);
    await new Promise((r) => setTimeout(r, 10));
    expect(m.orden).toEqual([2]);
  });

  it("una petición explícita que falla resuelve false (y deja intentar de nuevo)", async () => {
    const m = montar({ falla: () => new ErrorDescarga("red", "sin red") });
    expect(await m.gestor.pedir(4)).toBe(false);
    expect(await m.gestor.pedir(4)).toBe(false);
    expect(m.orden).toEqual([4, 4]);
  });

  it("detener corta la que corre y vacía la cola", async () => {
    const m = montar();
    m.gestor.segundoPlano([2, 3]);
    const pedida = m.gestor.pedir(8);
    await new Promise((r) => setTimeout(r, 5));
    m.gestor.detener();
    expect(await pedida).toBe(false);
    await new Promise((r) => setTimeout(r, 5));
    expect(m.orden).toEqual([2]);
  });
});
