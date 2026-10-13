import { describe, expect, it } from "vitest";
import { resultadoDeTests, resultadoDeTestsFallido } from "./tests";

describe("resultadoDeTests", () => {
  it("no opina de comandos que no son de pruebas", () => {
    expect(resultadoDeTests("ls -la", "3 failed")).toBeNull();
    expect(resultadoDeTests("git commit -m 'arregla tests'", "1 failed")).toBeNull();
  });

  it("detecta fallos en varios corredores", () => {
    expect(resultadoDeTests("bun run test", " Tests  2 failed | 10 passed (12)")).toBe("fallo");
    expect(resultadoDeTests("pytest -q", "FAILED tests/test_a.py::test_x\n1 failed, 3 passed")).toBe("fallo");
    expect(resultadoDeTests("npx vitest run", { stdout: "ok", stderr: "Error: 1 failing" })).toBe("fallo");
  });

  it("detecta que pasaron", () => {
    expect(resultadoDeTests("bun run test", " Tests  12 passed (12)")).toBe("paso");
    expect(resultadoDeTests("npm test", { stdout: "Tests:       5 passed, 5 total" })).toBe("paso");
  });

  it("no confunde 0 failed con un fallo", () => {
    expect(resultadoDeTests("pytest", "4 passed, 0 failed")).toBe("paso");
  });

  it("si no puede saber, no opina", () => {
    expect(resultadoDeTests("bun run test", "")).toBeNull();
    expect(resultadoDeTests("bun run test", undefined)).toBeNull();
  });
});

describe("resultadoDeTestsFallido", () => {
  it("un corredor de pruebas que terminó con error es un fallo, aunque no se lean cifras", () => {
    expect(resultadoDeTestsFallido("bun run test", "Command failed with exit code 1")).toBe("fallo");
    expect(resultadoDeTestsFallido("npx vitest run", "Exit code 1\n 2 failed | 10 passed")).toBe("fallo");
    expect(resultadoDeTestsFallido("pytest -q", "")).toBe("fallo");
  });

  it("no opina de comandos que no son de pruebas", () => {
    expect(resultadoDeTestsFallido("ls /no-existe", "Exit code 2")).toBeNull();
    expect(resultadoDeTestsFallido("git commit -m 'arregla tests'", "Exit code 1")).toBeNull();
  });

  it("una interrupción del usuario no cuenta como fallo de las pruebas", () => {
    expect(resultadoDeTestsFallido("bun run test", "interrumpido", true)).toBeNull();
  });
});
