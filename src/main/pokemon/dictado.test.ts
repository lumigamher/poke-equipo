import { describe, expect, it } from "vitest";
import type { Contexto, Decision } from "../entrenador/entrenador";
import { crearCableadoVoz, DICTADO_MAX_MS } from "./cableado-voz";
import type { ControladorFrases } from "./frases";

/** El cableado real con audio falso: cada bloque recibido entrega la frase `texto`; `cola` es lo que `vaciar` suelta. */
function montar() {
  let texto = "";
  let cola: string | null = null;
  const ejecutadas: Decision[] = [];
  const dictados: string[] = [];
  const tareas: { ms: number; fn: () => void; viva: boolean }[] = [];
  const ctx: Contexto = {
    candidatos: [{ id: "p", nombres: ["pikachu"] }],
    escuchandoA: null,
    // Pikachu tiene un permiso a la vista: fuera del dictado, un "sí" lo respondería.
    permisosDe: [{ id: "p", permisoId: "perm" }],
    borradoresDe: [],
    altaDe: null,
  } as unknown as Contexto;
  const controlador = {
    contexto: () => ctx,
    ejecutar: (d: Decision) => ejecutadas.push(d),
    voz: () => {},
  } as unknown as ControladorFrases;
  const cableado = crearCableadoVoz({
    segmentador: {
      alimentar: () => (texto ? [{ muestras: new Float32Array(8000), inicio: 0 }] : []),
      vaciar: () => {
        if (cola === null) return [];
        texto = cola;
        cola = null;
        return [{ muestras: new Float32Array(8000), inicio: 0 }];
      },
      reiniciar: () => {},
      hablando: () => false,
    },
    rapido: { transcribir: () => texto },
    preciso: { transcribir: async () => ({ texto, esperaMs: 0, computoMs: 0 }) },
    controlador: () => controlador,
    ahora: () => 1_000_000,
    programar: (fn, ms) => {
      const t = { ms, fn, viva: true };
      tareas.push(t);
      return () => {
        t.viva = false;
      };
    },
    aviso: () => {},
    alDictado: (id, t, final) => dictados.push(`${id}|${final ? "final" : "parcial"}|${t}`),
  });
  const decir = (frase: string) => {
    texto = frase;
    cableado.oido.recibir(new Float32Array(1600), 1_000_000);
    texto = "";
  };
  return {
    cableado,
    decir,
    ejecutadas,
    dictados,
    tareas,
    dejarEnCola: (frase: string) => {
      cola = frase;
    },
  };
}

describe("dictado con tecla", () => {
  it("junta todo lo que se oye, incluida la frase a medias, y lo entrega al cerrar", () => {
    const m = montar();
    m.cableado.dictar("p");
    expect(m.cableado.dictandoA()).toBe("p");
    m.decir("revisa el login");
    m.decir("y corre las pruebas");
    m.dejarEnCola("de acme");
    m.cableado.terminarDictado();
    expect(m.dictados).toEqual([
      "p|parcial|",
      "p|parcial|revisa el login",
      "p|parcial|revisa el login y corre las pruebas",
      "p|parcial|revisa el login y corre las pruebas de acme",
      "p|final|revisa el login y corre las pruebas de acme",
    ]);
    expect(m.cableado.dictandoA()).toBeNull();
    expect(m.ejecutadas).toEqual([]);
  });

  it("nunca responde un permiso: un 'sí' dictado es solo texto", () => {
    const m = montar();
    m.cableado.dictar("p");
    m.decir("sí");
    m.cableado.terminarDictado();
    expect(m.ejecutadas).toEqual([]);
    expect(m.dictados.at(-1)).toBe("p|final|sí");
  });

  it("sin nada oído entrega vacío; un segundo `dictar` en curso no lo reinicia", () => {
    const m = montar();
    m.cableado.dictar("p");
    m.cableado.dictar("otro");
    expect(m.cableado.dictandoA()).toBe("p");
    m.cableado.terminarDictado();
    expect(m.dictados.at(-1)).toBe("p|final|");
    m.cableado.terminarDictado();
    expect(m.dictados.filter((d) => d.includes("final"))).toHaveLength(1);
  });

  it("si nadie lo cierra, se envía solo al cumplirse el plazo", () => {
    const m = montar();
    m.cableado.dictar("p");
    m.decir("hola");
    const plazo = m.tareas.find((t) => t.ms === DICTADO_MAX_MS && t.viva);
    plazo?.fn();
    expect(m.dictados.at(-1)).toBe("p|final|hola");
    expect(m.cableado.dictandoA()).toBeNull();
  });
});
