import { mkdir, statfs } from "node:fs/promises";
import { join } from "node:path";
import { validarAccionPreparacion } from "@compartido/preparacion";
import { CANALES } from "@compartido/tipos";
import { app, BrowserWindow, ipcMain } from "electron";
import type { Paso } from "../descarga/pasos";
import { crearPreparacion } from "./preparacion";
import { endurecerVentana, origenDeDesarrollo, urlRendererDeDesarrollo } from "./ventanas-seguras";

/** Cuánto se deja a la vista el "Listo" antes de cerrar la ventana. */
const DEJAR_LISTO_MS = 700;

/** Bytes libres en el volumen de `ruta` (sube hasta una carpeta que exista); null si no se puede saber. */
async function espacioLibre(ruta: string): Promise<number | null> {
  try {
    await mkdir(ruta, { recursive: true });
    const s = await statfs(ruta);
    return s.bavail * s.bsize;
  } catch {
    return null;
  }
}

/**
 * La pantalla "Preparando a tu equipo" en su propia ventana (normal, con foco): modelos de voz y assets mínimos.
 * Si no falta nada no abre nada y devuelve "listo". Devuelve "salir" si la persona la cierra sin terminar.
 * No toca permisos de Claude ni ventanas de la escena.
 */
export async function prepararPrimerArranque(
  pasos: Paso[],
  carpetaDatos: string,
): Promise<"listo" | "salir"> {
  let win: BrowserWindow | null = null;
  const prep = crearPreparacion({
    pasos,
    espacioLibre: () => espacioLibre(carpetaDatos),
    alEstado: (estado) => {
      if (!win) win = abrirVentana(() => prep.accion("salir"));
      if (!win.isDestroyed()) win.webContents.send(CANALES.preparacion, estado);
    },
  });

  const alAccion = (e: Electron.IpcMainEvent, dato: unknown) => {
    // Solo la ventana de preparación manda acciones.
    if (!win || e.sender !== win.webContents) return;
    const accion = validarAccionPreparacion(dato);
    if (accion) prep.accion(accion);
  };
  const alPedir = (e: Electron.IpcMainEvent) => {
    if (!win || e.sender !== win.webContents) return;
    const estado = prep.estado();
    if (estado) e.sender.send(CANALES.preparacion, estado);
  };
  ipcMain.on(CANALES.accionPreparacion, alAccion);
  ipcMain.on(CANALES.pedirPreparacion, alPedir);
  // La app vive sin icono en el Dock; mientras dura la preparación sí se ve, para que la ventana no parezca perdida.
  void app.dock?.show();
  try {
    const r = await prep.preparar();
    if (r === "listo" && win) await new Promise((res) => setTimeout(res, DEJAR_LISTO_MS));
    return r;
  } finally {
    ipcMain.removeListener(CANALES.accionPreparacion, alAccion);
    ipcMain.removeListener(CANALES.pedirPreparacion, alPedir);
    const w = win as BrowserWindow | null;
    if (w && !w.isDestroyed()) {
      w.removeAllListeners("closed");
      w.destroy();
    }
    app.dock?.hide();
  }
}

let ventanaActual: BrowserWindow | null = null;

/** Una segunda instancia de la app pide ver la ventana de preparación, si hay una abierta. */
export function traerPreparacionAlFrente(): void {
  const w = ventanaActual;
  if (!w || w.isDestroyed()) return;
  if (w.isMinimized()) w.restore();
  w.show();
  w.focus();
}

function abrirVentana(alCerrar: () => void): BrowserWindow {
  const w = new BrowserWindow({
    width: 520,
    height: 640,
    title: "Poke Equipo",
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: "#f7f2e4",
    show: false,
    // Con sandbox y su propio preload mínimo (src/preload/preparacion.ts): solo ve los tres canales de la preparación.
    webPreferences: { preload: join(__dirname, "../preload/preparacion.js"), sandbox: true },
  });
  ventanaActual = w;
  w.once("ready-to-show", () => {
    w.show();
    app.focus({ steal: true });
  });
  // Cerrarla a mano es renunciar: el arranque sigue sin modelos y decide qué hacer.
  w.on("closed", alCerrar);
  const dev = urlRendererDeDesarrollo(app.isPackaged, process.env);
  endurecerVentana(w.webContents, { origenDev: origenDeDesarrollo(dev) });
  if (dev) {
    const url = new URL(dev);
    url.searchParams.set("preparacion", "1");
    void w.loadURL(url.toString());
  } else void w.loadFile(join(__dirname, "../renderer/index.html"), { query: { preparacion: "1" } });
  return w;
}
