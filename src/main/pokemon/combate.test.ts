import { describe, expect, it } from "vitest";
import { encargoCombate, leerVeredicto } from "./combate";

describe("encargoCombate", () => {
  it("nombra al rival, su carpeta y su trabajo, y pide el veredicto exacto", () => {
    const texto = encargoCombate({
      nombre: "Charmander",
      carpeta: "/x/acme",
      respuesta: "Arreglé el login.",
    });
    expect(texto).toContain("contra Charmander");
    expect(texto).toContain("/x/acme");
    expect(texto).toContain("«Arreglé el login.»");
    expect(texto).toContain("VEREDICTO: APROBADO o VEREDICTO: RECHAZADO");
    expect(texto).toContain("No cambies nada");
  });

  it("recorta un trabajo larguísimo", () => {
    const texto = encargoCombate({ nombre: "C", carpeta: "/x", respuesta: "a".repeat(5000) });
    expect(texto.length).toBeLessThan(2400);
  });
});

describe("leerVeredicto", () => {
  it("lee el último veredicto, con o sin negrita, sin importar mayúsculas", () => {
    expect(leerVeredicto("Todo bien.\nVEREDICTO: APROBADO")).toBe("aprobado");
    expect(leerVeredicto("Hay un bug.\n**Veredicto: RECHAZADO**")).toBe("rechazado");
    expect(leerVeredicto("VEREDICTO: **APROBADO**")).toBe("aprobado");
    expect(leerVeredicto("Pensé VEREDICTO: APROBADO pero no.\nVEREDICTO: RECHAZADO")).toBe("rechazado");
  });

  it("sin veredicto, nadie gana", () => {
    expect(leerVeredicto("Revisé y no sé.")).toBeNull();
    expect(leerVeredicto(null)).toBeNull();
  });
});
