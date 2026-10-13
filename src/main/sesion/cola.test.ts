import { describe, expect, it } from "vitest";
import { crearCola } from "./cola";

describe("crearCola", () => {
  it("entrega en orden lo puesto antes y después de empezar a leer", async () => {
    const cola = crearCola<string>();
    cola.poner("a");
    const leidos: string[] = [];
    const lector = (async () => {
      for await (const v of cola.iterable) leidos.push(v);
    })();
    cola.poner("b");
    await new Promise((r) => setTimeout(r, 5));
    cola.poner("c");
    cola.cerrar();
    await lector;
    expect(leidos).toEqual(["a", "b", "c"]);
  });

  it("al cerrar termina el lector aunque esté esperando", async () => {
    const cola = crearCola<string>();
    const lector = (async () => {
      for await (const _ of cola.iterable) {
        /* nada */
      }
      return "fin";
    })();
    cola.cerrar();
    expect(await lector).toBe("fin");
  });

  it("ignora lo que se ponga después de cerrar", async () => {
    const cola = crearCola<string>();
    cola.cerrar();
    cola.poner("tarde");
    const leidos: string[] = [];
    for await (const v of cola.iterable) leidos.push(v);
    expect(leidos).toEqual([]);
  });
});
