import { describe, expect, it } from "vitest";
import { pideMicFalso, urlRendererDev } from "./mic-falso";

describe("urlRendererDev", () => {
  it("sin POKE_MIC_FALSO deja la URL igual", () => {
    expect(urlRendererDev("http://localhost:5173/", undefined)).toBe("http://localhost:5173/");
    expect(urlRendererDev("http://localhost:5173/", "0")).toBe("http://localhost:5173/");
    expect(urlRendererDev("http://localhost:5173/", "")).toBe("http://localhost:5173/");
  });

  it("con POKE_MIC_FALSO=1 añade la marca sin perder la ruta", () => {
    expect(urlRendererDev("http://localhost:5173/", "1")).toBe("http://localhost:5173/?micFalso=1");
    expect(urlRendererDev("http://localhost:5173/index.html?a=b", "1")).toBe(
      "http://localhost:5173/index.html?a=b&micFalso=1",
    );
  });
});

describe("pideMicFalso", () => {
  it("solo en desarrollo y con la marca", () => {
    expect(pideMicFalso(true, "?micFalso=1")).toBe(true);
    expect(pideMicFalso(false, "?micFalso=1")).toBe(false);
    expect(pideMicFalso(true, "")).toBe(false);
    expect(pideMicFalso(true, "?micFalso=0")).toBe(false);
    expect(pideMicFalso(true, "?otro=1")).toBe(false);
  });
});
