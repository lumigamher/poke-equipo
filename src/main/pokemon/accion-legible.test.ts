import { describe, expect, it } from "vitest";
import { accionLegible, sinVoz } from "./accion-legible";

describe("accionLegible", () => {
  it("un comando va entero después de «Correr»", () => {
    expect(accionLegible("Bash", "bun run test")).toBe("Correr: bun run test");
  });
  it("leer, escribir y editar nombran el archivo", () => {
    expect(accionLegible("Read", "/a/b/login.ts")).toBe("Leer el archivo login.ts");
    expect(accionLegible("Edit", "/a/b/login.ts")).toBe("Modificar el archivo login.ts");
    expect(accionLegible("Write", "/a/b/nuevo.ts")).toBe("Crear o reescribir el archivo nuevo.ts");
  });
  it("buscar muestra lo que busca", () => {
    expect(accionLegible("Grep", "publicar\\(")).toBe("Buscar «publicar\\(»");
    expect(accionLegible("Glob", "src/**/*.ts")).toBe("Buscar archivos «src/**/*.ts»");
  });
  it("la lista de tareas se dice en palabras", () => {
    expect(accionLegible("TodoWrite", "")).toBe("Actualizar la lista de tareas");
    expect(accionLegible("TaskCreate", "")).toBe("Actualizar la lista de tareas");
  });
  it("un ayudante lleva su encargo", () => {
    expect(accionLegible("Agent", "revisar el diff")).toBe("Lanzar un ayudante: revisar el diff");
  });
  it("una herramienta desconocida usa el texto de permisos", () => {
    expect(accionLegible("Foo", "")).toBe("Usar la herramienta Foo");
  });
  it("sin detalle de comando, dice que corre un comando", () => {
    expect(accionLegible("Bash", "")).toBe("Correr un comando en la terminal");
  });
});

describe("sinVoz", () => {
  it("quita la línea que se dice en voz alta", () => {
    expect(sinVoz("Listo.\nVOZ: Terminé")).toBe("Listo.");
  });
  it("no toca un texto sin esa línea", () => {
    expect(sinVoz("Hola VOZ-alta")).toBe("Hola VOZ-alta");
  });
  it("no deja parpadear el «VO» que va llegando en la última línea", () => {
    expect(sinVoz("Listo.\nVO")).toBe("Listo.");
    expect(sinVoz("Listo.\nV")).toBe("Listo.");
    expect(sinVoz("Listo.\nVOZ")).toBe("Listo.");
  });
  it("una palabra normal que empieza con V no se toca", () => {
    expect(sinVoz("Listo.\nVamos")).toBe("Listo.\nVamos");
  });
  it("quita también un «VOZ:» a medio escribir", () => {
    expect(sinVoz("Listo.\nVOZ: Term")).toBe("Listo.");
  });
});
