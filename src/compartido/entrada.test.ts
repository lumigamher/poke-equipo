import { describe, expect, it } from "vitest";
import { debeEntrar, ENTRADA_MS } from "./entrada";

describe("debeEntrar", () => {
  it("entra con pokébola al aparecer, sea cual sea su primer estado", () => {
    expect(debeEntrar(null, "saliendo")).toBe(true);
    expect(debeEntrar(null, "trabajando")).toBe(true);
    expect(debeEntrar(null, "paseando")).toBe(true);
  });
  it("vuelve a entrar al salir tras guardarse (cambio de especie, de carpeta, evolución)", () => {
    expect(debeEntrar("guardandose", "saliendo")).toBe(true);
  });
  it("no entra si lo que pasa es que se guarda", () => {
    expect(debeEntrar(null, "guardandose")).toBe(false);
    expect(debeEntrar("paseando", "guardandose")).toBe(false);
  });
  it("un cambio normal de estado no repite la entrada", () => {
    expect(debeEntrar("saliendo", "trabajando")).toBe(false);
    expect(debeEntrar("paseando", "escuchando")).toBe(false);
  });
  it("la entrada dura lo que la animación", () => {
    expect(ENTRADA_MS).toBe(2100);
  });
});
