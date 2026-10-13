import { join } from "node:path";
import { app } from "electron";
import { rutasDeDatos } from "../descarga/raiz";

const raiz = app.getAppPath();
/** Modelos y sprites: la raíz del repo en desarrollo; empaquetada, una carpeta en userData (src/descarga/raiz.ts). */
const datos = rutasDeDatos({ empaquetada: app.isPackaged, repo: raiz, userData: app.getPath("userData") });

export const RUTAS = {
  datos: datos.raiz,
  modelos: datos.modelos,
  assets: datos.assets,
  /** Viaja dentro de la app (en el asar, solo lectura). */
  config: join(raiz, "config"),
  base: () => join(app.getPath("userData"), "equipo.sqlite"),
};
