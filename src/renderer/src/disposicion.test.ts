import { describe, expect, it } from "vitest";
import { posicionInicial } from "./disposicion";

describe("posicionInicial", () => {
  it("nace en el margen izquierdo si la pantalla está vacía", () => {
    expect(posicionInicial([], 1200)).toBe(120);
  });

  it("nace a 180 px del más cercano si este está a menos de 120 px", () => {
    expect(posicionInicial([120], 1200)).toBe(300);
  });

  it("el tercero no cae encima del segundo", () => {
    expect(posicionInicial([120, 300], 1200)).toBe(480);
  });

  it("salta los huecos demasiado estrechos", () => {
    // 300 queda a 100 px de 400: no sirve. 480 queda a 80 px: tampoco. 660 está libre.
    expect(posicionInicial([120, 400], 1200)).toBe(660);
  });

  it("con la pantalla llena nace en el sitio libre más lejano, dentro de la pantalla", () => {
    const llena = [120, 300, 480, 660, 840, 1020];
    const x = posicionInicial(llena, 1200);
    expect(x).toBeGreaterThanOrEqual(80);
    expect(x).toBeLessThanOrEqual(1200 - 80);
    // El borde derecho (1120) queda a 100 px del último; ningún hueco entre ellos llega a tanto.
    expect(x).toBe(1120);
  });

  it("con la pantalla llena busca el hueco más ancho aunque esté en medio", () => {
    // Ningún paso de 180 (120, 300, 480, 660) queda a 120 px de todos. El hueco más ancho es el de 200 a 440.
    const x = posicionInicial([100, 200, 440, 640, 740], 840);
    expect(x).toBe(320);
  });

  it("en una pantalla más estrecha que los márgenes se queda en el margen", () => {
    expect(posicionInicial([], 100)).toBe(80);
  });
});
