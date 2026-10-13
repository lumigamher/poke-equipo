// Preload mínimo de la ventana "Preparando a tu equipo": solo los tres canales de la preparación. Así esa ventana
// (la única que habla con internet por medio de main) corre con sandbox y no ve nada del resto de la app.
// Con sandbox un preload no puede cargar trozos compartidos (`./chunks/…`), así que este archivo no importa nada
// que no sea de tipos o de electron: los nombres de canal van aquí y una prueba comprueba que son los de CANALES.
import type { EstadoPreparacion } from "@compartido/preparacion";
import { contextBridge, ipcRenderer } from "electron";

export const CANALES_PREPARACION = {
  preparacion: "poke:preparacion",
  pedirPreparacion: "poke:pedir-preparacion",
  accionPreparacion: "poke:accion-preparacion",
} as const;

contextBridge.exposeInMainWorld("poke", {
  alPreparacion: (fn: (estado: EstadoPreparacion) => void) => {
    ipcRenderer.on(CANALES_PREPARACION.preparacion, (_e, estado: EstadoPreparacion) => fn(estado));
  },
  pedirPreparacion: () => ipcRenderer.send(CANALES_PREPARACION.pedirPreparacion),
  accionPreparacion: (accion: string) => ipcRenderer.send(CANALES_PREPARACION.accionPreparacion, accion),
});
