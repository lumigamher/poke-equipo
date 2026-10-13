import { describe, expect, it } from "vitest";
import { MAX_BYTES_ENTRADA, MAX_BYTES_REGISTRO, MAX_ENTRADAS, RegistroVivo } from "./registro-vivo";

describe("RegistroVivo", () => {
  it("empieza vacío y sin marca de omitido", () => {
    const r = new RegistroVivo();
    expect(r.vista()).toEqual({ entradas: [], omitido: false });
  });

  it("un texto que crece con la misma clave se reemplaza, no se duplica", () => {
    const r = new RegistroVivo();
    r.poner("a", "texto", "Hola");
    r.poner("a", "texto", "Hola, voy a leer");
    const { entradas } = r.vista();
    expect(entradas).toHaveLength(1);
    expect(entradas[0]).toMatchObject({ tipo: "texto", texto: "Hola, voy a leer" });
  });

  it("conserva el orden en que llegan pensamiento, acciones y texto", () => {
    const r = new RegistroVivo();
    r.poner("p", "pensando", "Veamos");
    r.accion("Leer el archivo a.ts");
    r.poner("t", "texto", "Listo");
    expect(r.vista().entradas.map((e) => e.tipo)).toEqual(["pensando", "accion", "texto"]);
  });

  it("ignora textos vacíos o de puro espacio", () => {
    const r = new RegistroVivo();
    r.poner("a", "texto", "   \n");
    r.accion("");
    expect(r.vista().entradas).toEqual([]);
  });

  it("las entradas tienen ids distintos y crecientes", () => {
    const r = new RegistroVivo();
    r.accion("uno");
    r.accion("dos");
    const [a, b] = r.vista().entradas;
    expect(b.id).toBeGreaterThan(a.id);
  });

  it("pasado el tope de entradas descarta las más viejas y marca omitido", () => {
    const r = new RegistroVivo();
    for (let i = 0; i < MAX_ENTRADAS + 10; i++) r.accion(`acción ${i}`);
    const v = r.vista();
    expect(v.entradas).toHaveLength(MAX_ENTRADAS);
    expect(v.omitido).toBe(true);
    expect(v.entradas[0].texto).toBe("acción 10");
    expect(v.entradas.at(-1)?.texto).toBe(`acción ${MAX_ENTRADAS + 9}`);
  });

  it("pasado el tope de bytes descarta las más viejas pero nunca la última", () => {
    const r = new RegistroVivo();
    const trozo = "x".repeat(MAX_BYTES_ENTRADA);
    for (let i = 0; i < 20; i++) r.poner(`k${i}`, "texto", trozo);
    const v = r.vista();
    const total = v.entradas.reduce((n, e) => n + e.texto.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_BYTES_REGISTRO);
    expect(v.omitido).toBe(true);
    expect(v.entradas.at(-1)?.texto.length).toBeGreaterThan(0);
  });

  it("una sola entrada gigante se recorta por el principio y conserva lo último con «…»", () => {
    const r = new RegistroVivo();
    r.poner("a", "texto", `${"a".repeat(MAX_BYTES_ENTRADA)}FINAL`);
    const t = r.vista().entradas[0].texto;
    expect(t.length).toBeLessThanOrEqual(MAX_BYTES_ENTRADA);
    expect(t.startsWith("…")).toBe(true);
    expect(t.endsWith("FINAL")).toBe(true);
  });

  it("si la entrada descartada vuelve a recibir texto, se crea de nuevo sin romper", () => {
    const r = new RegistroVivo();
    r.poner("vieja", "texto", "algo");
    for (let i = 0; i < MAX_ENTRADAS + 1; i++) r.accion(`a${i}`);
    r.poner("vieja", "texto", "algo más");
    expect(r.vista().entradas.at(-1)?.texto).toBe("algo más");
  });

  it("quitarUltimoTexto saca el último texto solo si coincide con la respuesta final", () => {
    const r = new RegistroVivo();
    r.poner("t", "texto", "La respuesta final.");
    r.quitarUltimoTexto("La respuesta final.");
    expect(r.vista().entradas).toEqual([]);
    r.poner("u", "texto", "Otra cosa");
    r.quitarUltimoTexto("distinto");
    expect(r.vista().entradas).toHaveLength(1);
  });

  it("al recortar no deja media pareja de sustitución al principio", () => {
    const r = new RegistroVivo();
    // el corte cae justo en la mitad de un emoji
    r.poner("a", "texto", `${"a".repeat(10)}😀${"b".repeat(MAX_BYTES_ENTRADA - 2)}`);
    const t = r.vista().entradas[0].texto;
    expect(t.startsWith("…")).toBe(true);
    expect(/^…[\udc00-\udfff]/.test(t)).toBe(false);
  });

  it("una respuesta final más larga que el tope también se reconoce y no se duplica", () => {
    const r = new RegistroVivo();
    const larga = `${"z".repeat(MAX_BYTES_ENTRADA + 500)}FIN`;
    r.poner("t", "texto", larga);
    r.quitarUltimoTexto(larga);
    expect(r.vista().entradas).toEqual([]);
  });

  it("limpiar vacía todo", () => {
    const r = new RegistroVivo();
    r.accion("x");
    r.limpiar();
    expect(r.vista()).toEqual({ entradas: [], omitido: false });
  });

  it("una vista ya entregada no cambia cuando el registro sigue creciendo", () => {
    const r = new RegistroVivo();
    r.accion("x");
    const antes = r.vista();
    r.accion("y");
    expect(antes.entradas).toHaveLength(1);
    expect(r.vista().entradas).toHaveLength(2);
  });

  it("sin cambios entre dos llamadas devuelve la misma vista (no copia de más)", () => {
    const r = new RegistroVivo();
    r.accion("x");
    expect(r.vista()).toBe(r.vista());
  });
});
