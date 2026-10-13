import { ErrorDescarga } from "./descargar.ts";
import type { Paso } from "./pasos.ts";

export interface DepsGestor {
  /** El paso que baja a esa especie. */
  pasoDe(especie: number): Paso;
  /** Se llama cuando una especie terminó de bajarse (ya está en disco). */
  alListo?(especie: number): void;
  aviso?(mensaje: string, error?: unknown): void;
}

export interface Gestor {
  /** Pone en cola, sin prisa, lo que falte de estas especies (las ya hechas se saltan). */
  segundoPlano(especies: number[]): void;
  /** Baja esta especie ya (antes que la cola de fondo). Resuelve true si quedó disponible. */
  pedir(especie: number): Promise<boolean>;
  /** Corta lo que corra y vacía la cola de fondo (la app se cierra). */
  detener(): void;
}

interface Pedido {
  especie: number;
  resolver: (ok: boolean) => void;
}

/**
 * Una sola descarga de especie a la vez (dos escribiendo los mismos archivos se pisarían): primero lo que se pidió
 * con `pedir`, luego la cola de fondo. Si el fondo falla por red o servidor se detiene (no se insiste con 150 pedidos
 * sin conexión); el próximo arranque, o un `pedir`, lo retoma.
 */
export function crearGestor(deps: DepsGestor): Gestor {
  const urgentes: Pedido[] = [];
  const fondo: number[] = [];
  const esperando = new Map<number, Promise<boolean>>();
  let enCurso: { especie: number; control: AbortController } | null = null;
  let trabajando = false;
  let detenido = false;
  const aviso = deps.aviso ?? (() => {});
  /** Especies que el servidor dice que no existen (404/410): no se vuelven a intentar en esta sesión. */
  const inexistentes = new Set<number>();

  async function bajar(especie: number): Promise<boolean> {
    if (inexistentes.has(especie)) return false;
    const paso = deps.pasoDe(especie);
    if (await paso.completo()) return true;
    const control = new AbortController();
    enCurso = { especie, control };
    try {
      await paso.ejecutar({ alBytes: () => {}, señal: control.signal });
      deps.alListo?.(especie);
      return true;
    } finally {
      enCurso = null;
    }
  }

  async function bucle(): Promise<void> {
    if (trabajando) return;
    trabajando = true;
    try {
      while (!detenido) {
        const pedido = urgentes.shift();
        const especie = pedido?.especie ?? fondo.shift();
        if (especie === undefined) break;
        try {
          const ok = await bajar(especie);
          pedido?.resolver(ok);
        } catch (e) {
          aviso(`No se pudo bajar la especie ${especie}.`, e);
          pedido?.resolver(false);
          if (e instanceof ErrorDescarga && e.tipo === "http" && (e.estado === 404 || e.estado === 410)) {
            // Esa especie no existe en la fuente: se marca y se sigue con las demás.
            inexistentes.add(especie);
          } else if (!pedido && e instanceof ErrorDescarga && (e.tipo === "red" || e.tipo === "http")) {
            // Sin red o servidor caído: el fondo no insiste (lo retomará el próximo arranque).
            fondo.length = 0;
            aviso("La bajada en segundo plano se detiene hasta el próximo arranque.");
          }
        } finally {
          esperando.delete(especie);
        }
      }
    } finally {
      trabajando = false;
    }
  }

  return {
    segundoPlano(especies) {
      detenido = false;
      for (const e of especies) if (!fondo.includes(e) && !esperando.has(e)) fondo.push(e);
      void bucle();
    },
    pedir(especie) {
      detenido = false;
      const previa = esperando.get(especie);
      if (previa) return previa;
      const promesa = new Promise<boolean>((resolver) => {
        // Si estaba en la cola de fondo, se saca de ahí: ahora es urgente.
        const i = fondo.indexOf(especie);
        if (i >= 0) fondo.splice(i, 1);
        urgentes.push({ especie, resolver });
      });
      esperando.set(especie, promesa);
      void bucle();
      return promesa;
    },
    detener() {
      detenido = true;
      fondo.length = 0;
      for (const p of urgentes.splice(0)) p.resolver(false);
      enCurso?.control.abort();
    },
  };
}
