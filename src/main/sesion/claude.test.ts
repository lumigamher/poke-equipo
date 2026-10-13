import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { limiteDeUso, SesionClaude } from "./claude";
import { construirRol, separarResumen } from "./resumen";
import type { EventoSesion } from "./sesion";

// Gasta de la suscripción de la persona: solo corre cuando se pide.
describe.skipIf(process.env.POKE_SESION_REAL !== "1")("SesionClaude contra Claude Code real", () => {
  it("responde con el login de la persona, entrega la línea de voz y reporta contexto", async () => {
    const sesion = new SesionClaude({
      carpeta: mkdtempSync(join(tmpdir(), "poke-sesion-")),
      sessionId: null,
      rol: construirRol("Pikachu", ["Acme"]),
    });
    const eventos: EventoSesion[] = [];
    const respuesta = new Promise<Extract<EventoSesion, { tipo: "respuesta" }>>((resolver, rechazar) => {
      sesion.alEvento((e) => {
        eventos.push(e);
        if (e.tipo === "respuesta") resolver(e);
        if (e.tipo === "error") rechazar(new Error(e.mensaje));
      });
    });
    sesion.enviar("Di solo la palabra mango.");
    const r = await respuesta;
    sesion.cerrar();

    expect(eventos.some((e) => e.tipo === "iniciada" && e.sessionId.length > 0)).toBe(true);
    expect(r.texto.toLowerCase()).toContain("mango");
    expect(separarResumen(r.texto).voz).not.toBe("Listo, mira la burbuja.");
    expect(r.contextoUsado).toBeGreaterThan(0);
    expect(r.contextoUsado).toBeLessThan(100);
  }, 120_000);
});

describe("limiteDeUso", () => {
  it("lee el uso de la ventana de 5 horas y lo deja entre 0 y 100", () => {
    const uso = { rate_limits: { five_hour: { utilization: 82.4, resets_at: "2026-10-12T21:30:00Z" } } };
    expect(limiteDeUso(uso)).toEqual({ usado: 82.4, reinicia: "2026-10-12T21:30:00Z" });
    expect(limiteDeUso({ rate_limits: { five_hour: { utilization: 140, resets_at: null } } })).toEqual({
      usado: 100,
    });
  });

  it("sin dato (clave de API, sin plan o respuesta rara) no hay barra", () => {
    expect(limiteDeUso(null)).toBeNull();
    expect(limiteDeUso({ rate_limits: null })).toBeNull();
    expect(limiteDeUso({ rate_limits: { five_hour: { utilization: null } } })).toBeNull();
  });
});
