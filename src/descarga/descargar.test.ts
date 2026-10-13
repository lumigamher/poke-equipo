import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { descargarArchivo as descargar, ErrorDescarga, type OpcionesDescarga } from "./descargar";

const CONTENIDO = randomBytes(300_000);
const SHA = createHash("sha256").update(CONTENIDO).digest("hex");

let servidor: Server;
let base = "";
/** Peticiones recibidas: la cabecera Range de cada una. */
let rangos: (string | undefined)[] = [];
/** Modo del servidor para cada prueba. */
let modo: "normal" | "corta" | "sinrange" | "error500" = "normal";
const cortarEn = 100_000;

beforeAll(async () => {
  servidor = createServer((req, res) => {
    rangos.push(req.headers.range);
    if (modo === "error500") {
      res.writeHead(500).end();
      return;
    }
    if (req.url === "/redirigido.bin") {
      res.writeHead(302, { Location: "/archivo.bin" }).end();
      return;
    }
    const m = /bytes=(\d+)-/.exec(req.headers.range ?? "");
    const desde = m && modo !== "sinrange" ? Number(m[1]) : 0;
    if (desde >= CONTENIDO.length) {
      res.writeHead(416).end();
      return;
    }
    const cuerpo = CONTENIDO.subarray(desde);
    if (m && modo !== "sinrange") {
      res.writeHead(206, {
        "Content-Length": cuerpo.length,
        "Content-Range": `bytes ${desde}-${CONTENIDO.length - 1}/${CONTENIDO.length}`,
      });
    } else res.writeHead(200, { "Content-Length": cuerpo.length });
    if (modo === "corta" && desde === 0) {
      // Manda un trozo y rompe la conexión a mitad.
      res.write(cuerpo.subarray(0, cortarEn));
      setTimeout(() => res.destroy(), 20);
      return;
    }
    res.end(cuerpo);
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
afterAll(() => {
  servidor.close();
});

const carpetas: string[] = [];
const temporal = () => {
  const d = mkdtempSync(join(tmpdir(), "poke-descarga-"));
  carpetas.push(d);
  return d;
};
afterEach(() => {
  modo = "normal";
  rangos = [];
  for (const c of carpetas.splice(0)) rmSync(c, { recursive: true, force: true });
});

/** Todas las pruebas bajan con la huella buena salvo que digan otra cosa. */
const bajar = (o: Omit<OpcionesDescarga, "sha256"> & { sha256?: string }) => descargar({ sha256: SHA, ...o });

const url = () => `${base}/archivo.bin`;

describe("descargarArchivo", () => {
  it("baja el archivo, lo verifica y no deja parcial", async () => {
    const destino = join(temporal(), "a.bin");
    const vistos: number[] = [];
    await bajar({
      url: url(),
      destino,
      bytes: CONTENIDO.length,
      sha256: SHA,
      alProgreso: (b) => vistos.push(b),
    });
    expect(readFileSync(destino).equals(CONTENIDO)).toBe(true);
    expect(existsSync(`${destino}.parcial`)).toBe(false);
    expect(vistos.at(-1)).toBe(CONTENIDO.length);
    expect(vistos).toEqual([...vistos].sort((a, b) => a - b));
  });

  it("si ya está completo y verificado no vuelve a pedir nada", async () => {
    const destino = join(temporal(), "a.bin");
    writeFileSync(destino, CONTENIDO);
    await bajar({ url: url(), destino, bytes: CONTENIDO.length, sha256: SHA });
    expect(rangos).toEqual([]);
  });

  it("reanuda con Range desde lo que había bajado antes", async () => {
    const destino = join(temporal(), "a.bin");
    writeFileSync(`${destino}.parcial`, CONTENIDO.subarray(0, 120_000));
    const vistos: number[] = [];
    await bajar({
      url: url(),
      destino,
      bytes: CONTENIDO.length,
      sha256: SHA,
      alProgreso: (b) => vistos.push(b),
    });
    expect(rangos).toEqual(["bytes=120000-"]);
    expect(readFileSync(destino).equals(CONTENIDO)).toBe(true);
    // El progreso arranca en lo ya bajado, no en cero.
    expect(vistos[0]).toBe(120_000);
  });

  it("una conexión cortada deja el parcial, avisa como error de red y la siguiente llamada continúa", async () => {
    const destino = join(temporal(), "a.bin");
    modo = "corta";
    await expect(bajar({ url: url(), destino, bytes: CONTENIDO.length, sha256: SHA })).rejects.toMatchObject({
      tipo: "red",
    });
    expect(existsSync(destino)).toBe(false);
    const parcial = statSync(`${destino}.parcial`).size;
    expect(parcial).toBeGreaterThan(0);
    expect(parcial).toBeLessThan(CONTENIDO.length);

    modo = "normal";
    rangos = [];
    await bajar({ url: url(), destino, bytes: CONTENIDO.length, sha256: SHA });
    expect(rangos).toEqual([`bytes=${parcial}-`]);
    expect(readFileSync(destino).equals(CONTENIDO)).toBe(true);
  });

  it("si el servidor ignora Range y manda todo con 200, reescribe desde el principio", async () => {
    const destino = join(temporal(), "a.bin");
    writeFileSync(`${destino}.parcial`, CONTENIDO.subarray(0, 50_000));
    modo = "sinrange";
    await bajar({ url: url(), destino, bytes: CONTENIDO.length, sha256: SHA });
    expect(readFileSync(destino).equals(CONTENIDO)).toBe(true);
  });

  it("un parcial más grande que el archivo se descarta y se baja de cero", async () => {
    const destino = join(temporal(), "a.bin");
    writeFileSync(`${destino}.parcial`, Buffer.alloc(CONTENIDO.length + 10));
    await bajar({ url: url(), destino, bytes: CONTENIDO.length, sha256: SHA });
    expect(rangos).toEqual([undefined]);
    expect(readFileSync(destino).equals(CONTENIDO)).toBe(true);
  });

  it("un parcial del tamaño justo pero dañado falla por integridad y se borra", async () => {
    const destino = join(temporal(), "a.bin");
    writeFileSync(`${destino}.parcial`, Buffer.alloc(CONTENIDO.length, 7));
    await expect(bajar({ url: url(), destino, bytes: CONTENIDO.length, sha256: SHA })).rejects.toMatchObject({
      tipo: "integridad",
    });
    expect(existsSync(`${destino}.parcial`)).toBe(false);
    expect(existsSync(destino)).toBe(false);
  });

  it("si lo bajado pesa distinto de lo esperado falla por integridad", async () => {
    const destino = join(temporal(), "a.bin");
    await expect(bajar({ url: url(), destino, bytes: CONTENIDO.length - 5 })).rejects.toMatchObject({
      tipo: "integridad",
    });
    expect(existsSync(destino)).toBe(false);
  });

  it.each([
    ["ausente", undefined],
    ["vacía", ""],
    ["corta", "abc123"],
    ["con letras fuera de hexadecimal", `${"z".repeat(64)}`],
    ["de 63", "a".repeat(63)],
    ["de 65", "a".repeat(65)],
  ])("una huella %s se rechaza antes de pedir nada", async (_c, sha) => {
    const destino = join(temporal(), "a.bin");
    await expect(
      descargar({ url: url(), destino, bytes: CONTENIDO.length, sha256: sha as unknown as string }),
    ).rejects.toMatchObject({ tipo: "integridad" });
    expect(rangos).toEqual([]);
    expect(existsSync(destino)).toBe(false);
  });

  it("un 500 es un error http con el código en el mensaje", async () => {
    modo = "error500";
    const destino = join(temporal(), "a.bin");
    const e = await bajar({ url: url(), destino, bytes: CONTENIDO.length }).catch((x) => x);
    expect(e).toBeInstanceOf(ErrorDescarga);
    expect(e.tipo).toBe("http");
    expect(e.message).toContain("500");
  });

  it("sin servidor (red caída) es un error de red", async () => {
    const destino = join(temporal(), "a.bin");
    await expect(bajar({ url: "http://127.0.0.1:1/x.bin", destino, bytes: 10 })).rejects.toMatchObject({
      tipo: "red",
    });
  });

  it("sigue una redirección (como la de GitHub a su CDN) y al reanudar vuelve a mandar Range", async () => {
    const destino = join(temporal(), "a.bin");
    writeFileSync(`${destino}.parcial`, CONTENIDO.subarray(0, 70_000));
    await bajar({
      url: `${base}/redirigido.bin`,
      destino,
      bytes: CONTENIDO.length,
      sha256: SHA,
    });
    expect(rangos).toEqual(["bytes=70000-", "bytes=70000-"]);
    expect(readFileSync(destino).equals(CONTENIDO)).toBe(true);
  });

  it("si no se puede escribir en el disco el error es de disco, con aviso de qué hacer", async () => {
    const destino = join(temporal(), "a.bin");
    // El parcial es una carpeta: abrirlo para escribir falla igual que un disco lleno o sin permisos.
    mkdirSync(`${destino}.parcial`);
    const e = await bajar({ url: url(), destino, bytes: CONTENIDO.length }).catch((x) => x);
    expect(e).toBeInstanceOf(ErrorDescarga);
    expect(e.tipo).toBe("disco");
    expect(existsSync(destino)).toBe(false);
  });

  it("cancelar con la señal conserva el parcial y avisa como cancelada", async () => {
    const destino = join(temporal(), "a.bin");
    const control = new AbortController();
    await expect(
      bajar({
        url: url(),
        destino,
        bytes: CONTENIDO.length,
        señal: control.signal,
        alProgreso: (b) => {
          if (b > 0) control.abort();
        },
      }),
    ).rejects.toMatchObject({ tipo: "cancelada" });
    expect(existsSync(destino)).toBe(false);
  });
});
