import { describe, expect, it } from "vitest";
import { endurecerVentana, origenDe, origenDeDesarrollo, urlRendererDeDesarrollo } from "./ventanas-seguras";

describe("endurecerVentana", () => {
  it("cancela la navegación y deniega las ventanas nuevas", () => {
    let navegar: ((e: { preventDefault(): void }) => void) | null = null;
    let abrir: (() => { action: "deny" }) | null = null;
    endurecerVentana({
      on: (_e, fn) => {
        navegar = fn;
      },
      setWindowOpenHandler: (fn) => {
        abrir = fn;
      },
    });
    let cancelada = false;
    (navegar as unknown as (e: { preventDefault(): void }) => void)({
      preventDefault: () => {
        cancelada = true;
      },
    });
    expect(cancelada).toBe(true);
    expect((abrir as unknown as () => { action: string })()).toEqual({ action: "deny" });
  });
});

describe("urlRendererDeDesarrollo", () => {
  const env = { ELECTRON_RENDERER_URL: "http://evil.example/" };
  it("empaquetada ignora la variable", () => {
    expect(urlRendererDeDesarrollo(true, env)).toBeUndefined();
  });
  it("en desarrollo la respeta, y sin ella no hay URL", () => {
    expect(urlRendererDeDesarrollo(false, env)).toBe("http://evil.example/");
    expect(urlRendererDeDesarrollo(false, {})).toBeUndefined();
    expect(urlRendererDeDesarrollo(false, { ELECTRON_RENDERER_URL: "" })).toBeUndefined();
  });
});

describe("will-navigate y el servidor de Vite", () => {
  const montar = (origenDev?: string) => {
    let navegar!: (e: { preventDefault(): void; url?: string }, url?: string) => void;
    endurecerVentana(
      {
        on: (_e, fn) => {
          navegar = fn;
        },
        setWindowOpenHandler: () => {},
      },
      { origenDev },
    );
    return (url: string, comoSegundoArgumento = false) => {
      let cancelada = false;
      const e = { preventDefault: () => (cancelada = true), ...(comoSegundoArgumento ? {} : { url }) };
      navegar(e, comoSegundoArgumento ? url : undefined);
      return cancelada;
    };
  };

  it("en desarrollo deja pasar la recarga del mismo origen que el servidor de Vite", () => {
    const ir = montar("http://localhost:5173");
    expect(ir("http://localhost:5173/")).toBe(false);
    expect(ir("http://localhost:5173/?preparacion=1")).toBe(false);
    expect(ir("http://localhost:5173/", true)).toBe(false);
  });

  it("en desarrollo sigue bloqueando otros orígenes (otro puerto, otro host, esquema distinto, basura)", () => {
    const ir = montar("http://localhost:5173");
    for (const u of [
      "http://localhost:5174/",
      "http://evil.example/",
      "https://localhost:5173/",
      "file:///etc/hosts",
      "no es url",
    ])
      expect(ir(u)).toBe(true);
  });

  it("empaquetada (sin origen de desarrollo) bloquea todo, incluso la misma URL", () => {
    const ir = montar(undefined);
    expect(ir("http://localhost:5173/")).toBe(true);
    expect(ir("file:///x/index.html")).toBe(true);
  });

  it("origenDe y origenDeDesarrollo", () => {
    expect(origenDe("http://localhost:5173/a?b")).toBe("http://localhost:5173");
    expect(origenDe("zzz")).toBeNull();
    expect(origenDeDesarrollo(undefined)).toBeUndefined();
    expect(origenDeDesarrollo("nada")).toBeUndefined();
    expect(origenDeDesarrollo("http://localhost:5173/")).toBe("http://localhost:5173");
  });
});
