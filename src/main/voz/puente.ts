import { CANALES } from "@compartido/tipos";
import { type BrowserWindow, ipcMain } from "electron";
import type { Reproductor } from "./voz";

/** El audio suena en el Escenario; aquí se espera a que avise que terminó. Nunca queda una promesa colgada. */
export function crearReproductor(win: BrowserWindow): Reproductor {
  let consecutivo = 0;
  const pendientes = new Map<number, () => void>();
  const soltar = (id: number) => {
    const resolver = pendientes.get(id);
    pendientes.delete(id);
    resolver?.();
  };
  const soltarTodos = () => {
    for (const id of [...pendientes.keys()]) soltar(id);
  };
  const enviar = (canal: string, datos?: unknown): boolean => {
    if (win.isDestroyed()) return false;
    try {
      win.webContents.send(canal, datos);
      return true;
    } catch {
      return false;
    }
  };

  ipcMain.on(CANALES.reproduccionFin, (_e, id: unknown) => {
    if (typeof id === "number") soltar(id);
  });
  win.once("closed", soltarTodos);

  return {
    reproducir(a) {
      consecutivo += 1;
      const id = consecutivo;
      return new Promise<void>((resolver) => {
        const temporizador = setTimeout(
          () => soltar(id),
          // Si el Escenario nunca avisa, no se deja el micrófono cerrado para siempre.
          (a.muestras.length / a.frecuencia) * 1000 + 3000,
        );
        pendientes.set(id, () => {
          clearTimeout(temporizador);
          resolver();
        });
        if (!enviar(CANALES.reproducir, { id, muestras: a.muestras, frecuencia: a.frecuencia })) soltar(id);
      });
    },
    detener() {
      enviar(CANALES.detener);
      soltarTodos();
    },
  };
}
