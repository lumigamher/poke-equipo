import { afterEach, describe, expect, it } from "vitest";
import {
  guardarPrellenado,
  limpiarPrellenado,
  olvidarPrellenadoSiSeFue,
  suscribirPrellenado,
  usarPrellenado,
} from "./prellenado";

afterEach(limpiarPrellenado);

describe("prellenado del campo de la burbuja", () => {
  it("lo que llega antes de que exista el campo se entrega una sola vez a ese Pokémon", () => {
    guardarPrellenado({ pokemonId: "a", texto: "/nombre " }, 1000);
    expect(usarPrellenado("b", 1100)).toBeNull();
    expect(usarPrellenado("a", 1100)).toBe("/nombre ");
    expect(usarPrellenado("a", 1100)).toBeNull();
  });

  it("no caduca por tiempo: si el Pokémon está ocupado y su burbuja tarda en abrirse, el texto sigue ahí", () => {
    guardarPrellenado({ pokemonId: "a", texto: "/nombre " }, 1000);
    expect(usarPrellenado("a", 10 * 60_000)).toBe("/nombre ");
  });

  it("se olvida si ese Pokémon estaba en pantalla y se fue, o si un texto nuevo lo reemplaza", () => {
    guardarPrellenado({ pokemonId: "a", texto: "/nombre " });
    olvidarPrellenadoSiSeFue(["a", "b"], ["b"]);
    expect(usarPrellenado("a")).toBeNull();
    guardarPrellenado({ pokemonId: "a", texto: "uno" });
    guardarPrellenado({ pokemonId: "a", texto: "dos" });
    olvidarPrellenadoSiSeFue(["a"], ["a"]);
    expect(usarPrellenado("a")).toBe("dos");
  });

  it("si el texto llega antes de que el Pokémon aparezca en la lista, una actualización ajena no lo borra", () => {
    guardarPrellenado({ pokemonId: "a", texto: "/nombre " });
    olvidarPrellenadoSiSeFue(["b"], ["b", "c"]);
    olvidarPrellenadoSiSeFue([], ["b"]);
    expect(usarPrellenado("a")).toBe("/nombre ");
  });

  it("si el campo ya está montado lo recibe en el acto, sin dejarlo guardado", () => {
    const recibidos: string[] = [];
    const baja = suscribirPrellenado("a", (t) => recibidos.push(t));
    guardarPrellenado({ pokemonId: "a", texto: "/nombre " }, 1000);
    guardarPrellenado({ pokemonId: "b", texto: "otro" }, 1000);
    expect(recibidos).toEqual(["/nombre "]);
    expect(usarPrellenado("a", 1001)).toBeNull();
    baja();
    guardarPrellenado({ pokemonId: "a", texto: "x" }, 1000);
    expect(recibidos).toEqual(["/nombre "]);
  });
});
