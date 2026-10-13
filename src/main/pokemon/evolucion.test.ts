import { describe, expect, it } from "vitest";
import { CATALOGO } from "./especies";
import { evolucionPara, tareasParaEvolucionar } from "./evolucion";

describe("evolucionPara", () => {
  it("evoluciona al llegar a las tareas de su especie, no antes", () => {
    expect(evolucionPara(4, 14)).toBeNull();
    expect(evolucionPara(4, 15)).toBe(5);
    expect(evolucionPara(5, 39)).toBeNull();
    expect(evolucionPara(5, 40)).toBe(6);
    expect(evolucionPara(172, 15)).toBe(25);
  });

  it("las que no evolucionan se quedan como están", () => {
    expect(evolucionPara(6, 999)).toBeNull();
    expect(evolucionPara(133, 999)).toBeNull();
    expect(evolucionPara(150, 999)).toBeNull();
  });

  it("toda evolución lleva a una especie del catálogo", () => {
    for (const e of CATALOGO) {
      const destino = evolucionPara(e.especie, 9999);
      if (destino !== null)
        expect(
          CATALOGO.some((c) => c.especie === destino),
          e.nombre,
        ).toBe(true);
    }
  });

  it("cuenta lo que falta", () => {
    expect(tareasParaEvolucionar(4, 10)).toBe(5);
    expect(tareasParaEvolucionar(4, 99)).toBe(0);
    expect(tareasParaEvolucionar(6, 0)).toBeNull();
  });
});
