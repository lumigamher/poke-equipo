import { join } from "node:path";
import { urlRendererDev } from "@compartido/mic-falso";
import { app, BrowserWindow, screen } from "electron";
import { endurecerVentana, origenDeDesarrollo, urlRendererDeDesarrollo } from "./ventanas-seguras";

/** Nivel y espacios de la escena: siempre encima de todo, también de las apps a pantalla completa. */
function fijarEncima(win: BrowserWindow): void {
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

/**
 * Baja la escena del nivel "screen-saver" mientras un diálogo del sistema está abierto (si no, se pinta encima de él)
 * y devuelve la función que la vuelve a poner exactamente como la deja `crearVentana`. No la oculta: el Pokémon sigue a la vista.
 */
export function apartarEscena(win: BrowserWindow): () => void {
  if (win.isDestroyed()) return () => {};
  win.setAlwaysOnTop(false);
  return () => {
    if (!win.isDestroyed()) fijarEncima(win);
  };
}

export function crearVentana(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    type: "panel",
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    fullscreenable: false,
    alwaysOnTop: true,
    show: false,
    // sandbox:false a propósito: el preload de la escena es el mismo de siempre (lo que ve el renderer ya está acotado
    // por contextBridge) y el micrófono/audio de la escena se probó así; la ventana que habla con la red (preparación)
    // sí corre con sandbox.
    webPreferences: { preload: join(__dirname, "../preload/index.js"), sandbox: false },
  });
  fijarEncima(win);
  const ignorar = () => win.setIgnoreMouseEvents(true, { forward: true });
  ignorar();
  win.webContents.on("did-finish-load", ignorar);
  win.once("ready-to-show", () => win.showInactive());
  // Solo en desarrollo (servidor de Vite): el banco de pruebas pide el micrófono falso con POKE_MIC_FALSO=1.
  const dev = urlRendererDeDesarrollo(app.isPackaged, process.env);
  endurecerVentana(win.webContents, { origenDev: origenDeDesarrollo(dev) });
  if (dev) win.loadURL(urlRendererDev(dev, process.env.POKE_MIC_FALSO));
  else win.loadFile(join(__dirname, "../renderer/index.html"));
  return win;
}
