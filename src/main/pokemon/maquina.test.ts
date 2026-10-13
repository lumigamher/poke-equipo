import { describe, expect, it } from "vitest";
import { alterados, type Evento, inicial, type Memoria, TIEMPOS, transicion } from "./maquina";

const seguir = (m: Memoria, pasos: [Evento, number][]) =>
  pasos.reduce((acc, [e, t]) => transicion(acc, e, t), m);
const paseando = () => transicion(inicial(0), { tipo: "tic" }, TIEMPOS.salirMs);

describe("transicion", () => {
  it("empieza saliendo de la pokébola y luego pasea", () => {
    const m = inicial(0);
    expect(m.estado).toBe("saliendo");
    expect(transicion(m, { tipo: "tic" }, TIEMPOS.salirMs - 1).estado).toBe("saliendo");
    expect(paseando().estado).toBe("paseando");
  });

  it("recorre una orden completa", () => {
    const t0 = TIEMPOS.salirMs;
    let m = transicion(paseando(), { tipo: "llamado" }, t0 + 10);
    expect(m.estado).toBe("escuchando");
    m = transicion(m, { tipo: "orden_enviada" }, t0 + 20);
    expect(m.estado).toBe("trabajando");
    m = transicion(m, { tipo: "turno_ok", pregunta: false }, t0 + 30);
    expect(m.estado).toBe("termino");
    m = transicion(m, { tipo: "tic" }, t0 + 30 + TIEMPOS.celebrarMs);
    expect(m.estado).toBe("paseando");
  });

  it("si la respuesta fue una pregunta, queda esperando", () => {
    const m = seguir(paseando(), [
      [{ tipo: "orden_enviada" }, 5000],
      [{ tipo: "turno_ok", pregunta: true }, 6000],
      [{ tipo: "tic" }, 6000 + TIEMPOS.celebrarMs],
    ]);
    expect(m.estado).toBe("esperando");
  });

  it("pide permiso y vuelve a trabajar al resolverlo", () => {
    let m = seguir(paseando(), [
      [{ tipo: "orden_enviada" }, 5000],
      [{ tipo: "permiso_pedido" }, 5100],
    ]);
    expect(m.estado).toBe("pidiendo_permiso");
    m = transicion(m, { tipo: "permiso_resuelto" }, 5200);
    expect(m.estado).toBe("trabajando");
  });

  it("un permiso pendiente no caduca nunca por tiempo", () => {
    let m = seguir(paseando(), [
      [{ tipo: "orden_enviada" }, 5000],
      [{ tipo: "permiso_pedido" }, 5100],
    ]);
    m = transicion(m, { tipo: "tic" }, 5100 + 24 * 3600_000);
    expect(m.estado).toBe("pidiendo_permiso");
  });

  it("si lo llaman y no llega orden, vuelve a pasear", () => {
    let m = transicion(paseando(), { tipo: "llamado" }, 5000);
    m = transicion(m, { tipo: "tic" }, 5000 + TIEMPOS.atencionMs);
    expect(m.estado).toBe("paseando");
  });

  it("cancelar el borrador lo devuelve a pasear", () => {
    const m = seguir(paseando(), [
      [{ tipo: "llamado" }, 5000],
      [{ tipo: "cancelado" }, 5500],
    ]);
    expect(m.estado).toBe("paseando");
  });

  it("llamarlo mientras trabaja no lo saca del trabajo", () => {
    const m = seguir(paseando(), [
      [{ tipo: "orden_enviada" }, 5000],
      [{ tipo: "llamado" }, 5100],
    ]);
    expect(m.estado).toBe("trabajando");
  });

  it("se cansa y luego se duerme si nadie le habla", () => {
    const base = paseando();
    const cansado = transicion(base, { tipo: "tic" }, base.ultimaInteraccion + TIEMPOS.cansadoMs);
    expect(cansado.estado).toBe("cansado");
    const dormido = transicion(cansado, { tipo: "tic" }, base.ultimaInteraccion + TIEMPOS.dormidoMs);
    expect(dormido.estado).toBe("dormido");
  });

  it("se despierta con su nombre", () => {
    const base = paseando();
    const dormido = transicion(base, { tipo: "tic" }, base.ultimaInteraccion + TIEMPOS.dormidoMs);
    expect(transicion(dormido, { tipo: "llamado" }, 2_000_000).estado).toBe("escuchando");
  });

  it("con PS bajos se ve cansado aunque le acaben de hablar", () => {
    let m = transicion(paseando(), { tipo: "contexto", usado: 85 }, 5000);
    expect(m.ps).toBe(15);
    m = transicion(m, { tipo: "tic" }, 5001);
    expect(m.estado).toBe("cansado");
  });

  it("al recuperar PS deja de estar cansado", () => {
    const m = seguir(paseando(), [
      [{ tipo: "contexto", usado: 85 }, 5000],
      [{ tipo: "tic" }, 5001],
      [{ tipo: "contexto", usado: 10 }, 5002],
      [{ tipo: "tic" }, 5003],
    ]);
    expect(m.estado).toBe("paseando");
    expect(m.ps).toBe(90);
  });

  it("los PS se acotan entre 0 y 100", () => {
    expect(transicion(inicial(0), { tipo: "contexto", usado: 130 }, 1).ps).toBe(0);
    expect(transicion(inicial(0), { tipo: "contexto", usado: -5 }, 1).ps).toBe(100);
  });

  it("un error lo deja en error hasta reintentar", () => {
    const m = seguir(paseando(), [
      [{ tipo: "orden_enviada" }, 5000],
      [{ tipo: "turno_error" }, 5100],
    ]);
    expect(m.estado).toBe("error");
    expect(transicion(m, { tipo: "tic" }, 9_999_999).estado).toBe("error");
    expect(transicion(m, { tipo: "reintento", conOrden: true }, 6000).estado).toBe("trabajando");
    expect(transicion(m, { tipo: "reintento", conOrden: false }, 6000).estado).toBe("paseando");
  });

  it("guardándose ya no reacciona a nada", () => {
    let m = transicion(paseando(), { tipo: "guardar" }, 5000);
    expect(m.estado).toBe("guardandose");
    m = seguir(m, [
      [{ tipo: "llamado" }, 5100],
      [{ tipo: "turno_ok", pregunta: false }, 5200],
      [{ tipo: "tic" }, 99_999],
    ]);
    expect(m.estado).toBe("guardandose");
  });

  it("trabajando y esperando no derivan a cansado ni dormido con el tiempo", () => {
    const DIA = 24 * 3600_000;
    const trabajando = seguir(paseando(), [[{ tipo: "orden_enviada" }, 5000]]);
    expect(transicion(trabajando, { tipo: "tic" }, 5000 + DIA).estado).toBe("trabajando");
    const esperando = seguir(paseando(), [
      [{ tipo: "orden_enviada" }, 5000],
      [{ tipo: "turno_ok", pregunta: true }, 6000],
      [{ tipo: "tic" }, 6000 + TIEMPOS.celebrarMs],
    ]);
    expect(esperando.estado).toBe("esperando");
    expect(transicion(esperando, { tipo: "tic" }, 6000 + TIEMPOS.celebrarMs + DIA).estado).toBe("esperando");
  });

  it("despertar refresca el reloj de inactividad", () => {
    const base = paseando();
    const dormido = transicion(base, { tipo: "tic" }, base.ultimaInteraccion + TIEMPOS.dormidoMs);
    expect(dormido.estado).toBe("dormido");
    const t = 2_000_000;
    let m = transicion(dormido, { tipo: "llamado" }, t);
    expect(m.estado).toBe("escuchando");
    expect(m.ultimaInteraccion).toBe(t);
    m = transicion(m, { tipo: "tic" }, t + TIEMPOS.atencionMs);
    expect(m.estado).toBe("paseando");
    expect(transicion(m, { tipo: "tic" }, t + TIEMPOS.atencionMs + 1).estado).toBe("paseando");
  });

  it("llamarlo en error no borra el error", () => {
    let m = seguir(paseando(), [
      [{ tipo: "orden_enviada" }, 5000],
      [{ tipo: "turno_error" }, 5100],
    ]);
    m = transicion(m, { tipo: "llamado" }, 7000);
    expect(m.estado).toBe("error");
    expect(m.ultimaInteraccion).toBe(7000);
    m = transicion(m, { tipo: "tic" }, 99_999_999);
    expect(m.estado).toBe("error");
    expect(transicion(m, { tipo: "orden_enviada" }, 100_000_000).estado).toBe("trabajando");
  });

  it("devuelve el mismo objeto cuando nada cambia", () => {
    const m = paseando();
    expect(transicion(m, { tipo: "tic" }, m.desde + 10)).toBe(m);
  });
});

describe("alterados", () => {
  it("refleja el estado real de la sesión", () => {
    const base = paseando();
    expect(alterados(base)).toEqual([]);
    expect(alterados({ ...base, estado: "error" })).toEqual(["confundido"]);
    expect(alterados({ ...base, estado: "pidiendo_permiso" })).toEqual(["paralizado"]);
    expect(alterados({ ...base, estado: "dormido" })).toEqual(["dormido"]);
    expect(alterados({ ...base, testsFallando: true })).toEqual(["envenenado"]);
    expect(alterados({ ...base, estado: "error", testsFallando: true })).toEqual([
      "confundido",
      "envenenado",
    ]);
  });

  it("el veneno se cura cuando los tests pasan", () => {
    const m = seguir(paseando(), [
      [{ tipo: "tests", resultado: "fallo" }, 5000],
      [{ tipo: "tests", resultado: "paso" }, 6000],
    ]);
    expect(alterados(m)).toEqual([]);
  });
});
