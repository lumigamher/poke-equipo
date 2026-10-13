import { esNoche, SUENO_DE_NOCHE } from "@compartido/dia-noche";
import { ENTRADA_MS } from "@compartido/entrada";
import type { Alterado, Estado } from "@compartido/tipos";

export interface Memoria {
  estado: Estado;
  /** Momento (ms) en que entró al estado actual. */
  desde: number;
  /** Última vez que la persona le habló o que terminó un turno. */
  ultimaInteraccion: number;
  ps: number;
  testsFallando: boolean;
  /** La última respuesta terminó en pregunta. */
  pregunta: boolean;
}

export type Evento =
  | { tipo: "llamado" }
  | { tipo: "cancelado" }
  | { tipo: "orden_enviada" }
  | { tipo: "permiso_pedido" }
  | { tipo: "permiso_resuelto" }
  | { tipo: "turno_ok"; pregunta: boolean }
  | { tipo: "turno_error" }
  | { tipo: "reintento"; conOrden: boolean }
  | { tipo: "contexto"; usado: number }
  | { tipo: "tests"; resultado: "paso" | "fallo" }
  | { tipo: "guardar" }
  | { tipo: "tic" };

export const TIEMPOS = {
  salirMs: ENTRADA_MS,
  atencionMs: 6000,
  celebrarMs: 4000,
  cansadoMs: 5 * 60_000,
  dormidoMs: 15 * 60_000,
  guardarMs: 1600,
  psBajo: 20,
} as const;

export function inicial(ahora: number): Memoria {
  return {
    estado: "saliendo",
    desde: ahora,
    ultimaInteraccion: ahora,
    ps: 100,
    testsFallando: false,
    pregunta: false,
  };
}

function pasar(m: Memoria, estado: Estado, ahora: number, extra: Partial<Memoria> = {}): Memoria {
  return { ...m, ...extra, estado, desde: ahora };
}

function porTiempo(m: Memoria, ahora: number): Memoria {
  const enEstado = ahora - m.desde;
  const quieto = ahora - m.ultimaInteraccion;
  if (m.estado === "saliendo" && enEstado >= TIEMPOS.salirMs)
    return pasar(m, "paseando", ahora, { ultimaInteraccion: ahora });
  if (m.estado === "escuchando" && enEstado >= TIEMPOS.atencionMs) return pasar(m, "paseando", ahora);
  if (m.estado === "termino" && enEstado >= TIEMPOS.celebrarMs)
    return pasar(m, m.pregunta ? "esperando" : "paseando", ahora);
  if (m.estado === "paseando" || m.estado === "cansado") {
    // De noche se cansan y se duermen antes.
    const sueno = esNoche(new Date(ahora).getHours()) ? SUENO_DE_NOCHE : 1;
    if (quieto >= TIEMPOS.dormidoMs * sueno) return pasar(m, "dormido", ahora);
    const agotado = quieto >= TIEMPOS.cansadoMs * sueno || m.ps < TIEMPOS.psBajo;
    if (agotado && m.estado === "paseando") return pasar(m, "cansado", ahora);
    if (!agotado && m.estado === "cansado") return pasar(m, "paseando", ahora);
  }
  return m;
}

export function transicion(m: Memoria, e: Evento, ahora: number): Memoria {
  if (e.tipo === "contexto") return { ...m, ps: Math.max(0, Math.min(100, 100 - e.usado)) };
  if (e.tipo === "tests") return { ...m, testsFallando: e.resultado === "fallo" };
  if (m.estado === "guardandose") return m;

  switch (e.tipo) {
    case "guardar":
      return pasar(m, "guardandose", ahora);
    case "llamado":
      if (
        m.estado === "trabajando" ||
        m.estado === "pidiendo_permiso" ||
        m.estado === "saliendo" ||
        m.estado === "error"
      ) {
        return { ...m, ultimaInteraccion: ahora };
      }
      return pasar(m, "escuchando", ahora, { ultimaInteraccion: ahora });
    case "cancelado":
      return m.estado === "escuchando" ? pasar(m, "paseando", ahora) : m;
    case "orden_enviada":
      return pasar(m, "trabajando", ahora, { ultimaInteraccion: ahora, pregunta: false });
    case "permiso_pedido":
      return pasar(m, "pidiendo_permiso", ahora);
    case "permiso_resuelto":
      return m.estado === "pidiendo_permiso"
        ? pasar(m, "trabajando", ahora, { ultimaInteraccion: ahora })
        : m;
    case "turno_ok":
      return pasar(m, "termino", ahora, { pregunta: e.pregunta, ultimaInteraccion: ahora });
    case "turno_error":
      return pasar(m, "error", ahora);
    case "reintento":
      if (m.estado !== "error") return m;
      return pasar(m, e.conOrden ? "trabajando" : "paseando", ahora, { ultimaInteraccion: ahora });
    case "tic":
      return porTiempo(m, ahora);
  }
}

export function alterados(m: Memoria): Alterado[] {
  const lista: Alterado[] = [];
  if (m.estado === "error") lista.push("confundido");
  if (m.estado === "pidiendo_permiso") lista.push("paralizado");
  if (m.estado === "dormido") lista.push("dormido");
  if (m.testsFallando) lista.push("envenenado");
  return lista;
}
