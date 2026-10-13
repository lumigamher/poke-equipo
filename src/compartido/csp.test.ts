import { describe, expect, it } from "vitest";
import { politicaCsp } from "./csp";

const directiva = (p: string, nombre: string) =>
  p
    .split("; ")
    .find((d) => d.startsWith(`${nombre} `))
    ?.slice(nombre.length + 1);

describe("politicaCsp", () => {
  const prod = politicaCsp({ dev: false });
  const dev = politicaCsp({ dev: true });

  it("empieza por default-src 'self' y no permite eval, data:, blob: ni http(s) externo en producción", () => {
    expect(directiva(prod, "default-src")).toBe("'self'");
    expect(prod).not.toMatch(/unsafe-eval|data:|blob:|https?:|ws:/);
  });

  it("producción: scripts solo propios, sin red, y poke: para imágenes y audio", () => {
    expect(directiva(prod, "script-src")).toBe("'self'");
    expect(directiva(prod, "connect-src")).toBe("'none'");
    expect(directiva(prod, "img-src")).toContain("poke:");
    expect(directiva(prod, "media-src")).toContain("poke:");
  });

  it("estilos en línea sí (React los usa), plugins, iframes y formularios no", () => {
    expect(directiva(prod, "style-src")).toContain("'unsafe-inline'");
    for (const d of ["object-src", "frame-src", "form-action", "base-uri"])
      expect(directiva(prod, d)).toBe("'none'");
  });

  it("solo en desarrollo se permite el script en línea de Vite y el websocket local", () => {
    expect(directiva(dev, "script-src")).toContain("'unsafe-inline'");
    expect(directiva(dev, "connect-src")).toContain("ws://localhost:*");
    expect(prod).not.toContain("localhost");
  });
});
