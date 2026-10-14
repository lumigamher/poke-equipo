import { describe, expect, it } from "vitest";
import { comandoDeAccion } from "./registro-terminal";

describe("comandoDeAccion", () => {
  it("de «Correr: …» saca el comando tal cual", () => {
    expect(comandoDeAccion("Correr: seq 2 49 | awk '{ print $1 }'")).toBe("seq 2 49 | awk '{ print $1 }'");
  });

  it("conserva los saltos de línea de un comando largo", () => {
    expect(comandoDeAccion("Correr: cd app &&\n  bun test")).toBe("cd app &&\n  bun test");
  });

  it("otras acciones no son de terminal", () => {
    expect(comandoDeAccion("Leer: src/app.ts")).toBeNull();
    expect(comandoDeAccion("Correr:")).toBeNull();
    expect(comandoDeAccion("Corre: algo")).toBeNull();
  });
});
