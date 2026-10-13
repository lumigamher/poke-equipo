import { existsSync, readFileSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { DatosAnim } from "@compartido/tipos";
import { net, protocol } from "electron";
import { RUTAS } from "./rutas";

/** Debe llamarse antes de que la app esté lista. */
export function registrarEsquema(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "poke",
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
    },
  ]);
}

/** Sirve poke://assets/<dex>/<archivo> desde assets/pokemon/, sin dejar salir de esa carpeta. */
export function atenderRecursos(): void {
  protocol.handle("poke", (pedido) => {
    const url = new URL(pedido.url);
    let ruta: string;
    try {
      ruta = normalize(join(RUTAS.assets, decodeURIComponent(url.pathname)));
    } catch {
      return new Response("no encontrado", { status: 404 });
    }
    if (url.hostname !== "assets" || !ruta.startsWith(RUTAS.assets + sep) || !existsSync(ruta)) {
      return new Response("no encontrado", { status: 404 });
    }
    return net.fetch(pathToFileURL(ruta).toString()).then((r) => {
      const cabeceras = new Headers(r.headers);
      cabeceras.set("Access-Control-Allow-Origin", "*");
      return new Response(r.body, { status: r.status, headers: cabeceras });
    });
  });
}

export function carpetaEspecie(especie: number): string {
  return String(especie).padStart(4, "0");
}

export function leerAnims(especie: number): Record<string, DatosAnim> {
  if (!Number.isInteger(especie) || especie <= 0) return {};
  const archivo = join(RUTAS.assets, carpetaEspecie(especie), "anims.json");
  if (!existsSync(archivo)) return {};
  return JSON.parse(readFileSync(archivo, "utf8")) as Record<string, DatosAnim>;
}
