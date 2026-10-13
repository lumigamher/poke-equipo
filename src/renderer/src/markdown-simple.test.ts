import { describe, expect, it } from "vitest";
import { bloquesMarkdown, trozosDe } from "./markdown-simple";

describe("markdown simple", () => {
  it("separa negrita y código en línea; lo que no cierra queda como texto", () => {
    expect(trozosDe("Arreglé **el login** en `auth.ts` y ya")).toEqual([
      { tipo: "texto", texto: "Arreglé " },
      { tipo: "negrita", texto: "el login" },
      { tipo: "texto", texto: " en " },
      { tipo: "codigo", texto: "auth.ts" },
      { tipo: "texto", texto: " y ya" },
    ]);
    expect(trozosDe("2 * 3 y un `suelto")).toEqual([{ tipo: "texto", texto: "2 * 3 y un `suelto" }]);
  });

  it("arma párrafos, títulos, listas y bloques de código", () => {
    const b = bloquesMarkdown("## Hallazgos\n\nUno\ndos.\n\n- a\n- b\n1. x\n\n```ts\nconst a = 1;\n```\nfin");
    expect(b.map((x) => x.tipo)).toEqual(["titulo", "parrafo", "lista", "lista", "codigo", "parrafo"]);
    expect(b[1]).toEqual({ tipo: "parrafo", trozos: [{ tipo: "texto", texto: "Uno dos." }] });
    expect(b[2]).toMatchObject({ ordenada: false, items: [[{ texto: "a" }], [{ texto: "b" }]] });
    expect(b[3]).toMatchObject({ ordenada: true });
    expect(b[4]).toEqual({ tipo: "codigo", texto: "const a = 1;" });
  });

  it("un bloque de código sin cerrar no se pierde", () => {
    expect(bloquesMarkdown("```\nls")).toEqual([{ tipo: "codigo", texto: "ls" }]);
  });
});
