import { describe, expect, it } from "vitest";
import { COMANDOS_LOCALES, leerComando, unirComandos } from "./comandos";

describe("leerComando", () => {
  it("un texto sin barra no es comando", () => {
    expect(leerComando("revisa el deploy")).toBeNull();
    expect(leerComando("/")).toBeNull();
    expect(leerComando("  ")).toBeNull();
  });

  it("/model con y sin modelo, también en español y en mayúsculas", () => {
    expect(leerComando("/model opus")).toEqual({ tipo: "modelo", modelo: "opus" });
    expect(leerComando(" /Modelo  Sonnet ")).toEqual({ tipo: "modelo", modelo: "sonnet" });
    expect(leerComando("/model")).toEqual({ tipo: "modelo", modelo: null });
  });

  it("/pokemon con nombre, número o azar; sin valor también se reconoce", () => {
    expect(leerComando("/pokemon Charmander")).toEqual({ tipo: "especie", valor: "Charmander" });
    expect(leerComando("/pokemon 133")).toEqual({ tipo: "especie", valor: "133" });
    expect(leerComando("/pokemon")).toEqual({ tipo: "especie", valor: "" });
  });

  it("/reiniciar y /restart", () => {
    expect(leerComando("/reiniciar")).toEqual({ tipo: "reiniciar" });
    expect(leerComando("/restart")).toEqual({ tipo: "reiniciar" });
  });

  it("cualquier otro comando pasa tal cual a Claude Code", () => {
    expect(leerComando("/compact  ")).toEqual({ tipo: "claude", texto: "/compact" });
    expect(leerComando("/review 12")).toEqual({ tipo: "claude", texto: "/review 12" });
  });
});

describe("COMANDOS_LOCALES", () => {
  it("ofrece /llamar con la especie y /guardar sin argumento, sin barra en el nombre", () => {
    expect(COMANDOS_LOCALES).toContainEqual(
      expect.objectContaining({ nombre: "llamar", argumento: "<especie> [encargo]" }),
    );
    expect(COMANDOS_LOCALES).toContainEqual(expect.objectContaining({ nombre: "guardar", argumento: "" }));
    expect(COMANDOS_LOCALES.every((c) => !c.nombre.startsWith("/"))).toBe(true);
    expect(COMANDOS_LOCALES).toContainEqual(
      expect.objectContaining({ nombre: "nombre", argumento: "<nombre>" }),
    );
  });
});

describe("unirComandos", () => {
  it("los locales van primero y ganan; los del SDK se ordenan y no se repiten", () => {
    const sdk = [
      { nombre: "review", descripcion: "r", argumento: "" },
      { nombre: "model", descripcion: "del sdk", argumento: "" },
      { nombre: "compact", descripcion: "c", argumento: "" },
      { nombre: "compact", descripcion: "otra vez", argumento: "" },
      { nombre: "", descripcion: "sin nombre", argumento: "" },
    ];
    expect(unirComandos(COMANDOS_LOCALES, sdk).map((c) => c.nombre)).toEqual([
      "model",
      "pokemon",
      "reiniciar",
      "movimientos",
      "pokedex",
      "medalla",
      "nombre",
      "llamar",
      "equipo",
      "combate",
      "guardar",
      "compact",
      "review",
    ]);
  });
});
