import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MODELOS_REQUERIDOS, type ModeloRemoto, pasosDeModelos } from "./modelos";
import { ejecutarPasos, pasosPendientes } from "./pasos";

let servidor: Server;
let base = "";
let raiz = "";
let bajados: (string | undefined)[] = [];
let archivoTar: Buffer;
let archivoSuelto: Buffer;
let archivoEnlace: Buffer;

beforeAll(async () => {
  raiz = mkdtempSync(join(tmpdir(), "poke-modelos-"));
  // Un paquete falso con la misma forma que los de sherpa: <id>/archivos.
  const origen = join(raiz, "origen", "voz-falsa");
  mkdirSync(join(origen, "espeak-ng-data"), { recursive: true });
  writeFileSync(join(origen, "voz.onnx"), Buffer.alloc(5000, 3));
  writeFileSync(join(origen, "tokens.txt"), "abc");
  writeFileSync(join(origen, "espeak-ng-data", "phontab"), "x");
  execFileSync("tar", ["-cjf", join(raiz, "voz-falsa.tar.bz2"), "-C", join(raiz, "origen"), "voz-falsa"]);
  archivoTar = readFileSync(join(raiz, "voz-falsa.tar.bz2"));
  archivoSuelto = Buffer.alloc(2000, 9);
  // Un paquete hostil: el archivo esperado es un enlace simbólico que apunta fuera.
  const hostil = join(raiz, "origen", "voz-enlace");
  mkdirSync(hostil, { recursive: true });
  symlinkSync("/etc/hosts", join(hostil, "voz.onnx"));
  execFileSync("tar", ["-cjf", join(raiz, "voz-enlace.tar.bz2"), "-C", join(raiz, "origen"), "voz-enlace"]);
  archivoEnlace = readFileSync(join(raiz, "voz-enlace.tar.bz2"));
  servidor = createServer((req, res) => {
    bajados.push(req.headers.range);
    const cuerpo =
      req.url === "/voz-falsa.tar.bz2"
        ? archivoTar
        : req.url === "/vad.onnx"
          ? archivoSuelto
          : req.url === "/voz-enlace.tar.bz2"
            ? archivoEnlace
            : null;
    if (!cuerpo) {
      res.writeHead(404).end();
      return;
    }
    const m = /bytes=(\d+)-/.exec(req.headers.range ?? "");
    const desde = m ? Number(m[1]) : 0;
    res.writeHead(m ? 206 : 200, { "Content-Length": cuerpo.length - desde });
    res.end(cuerpo.subarray(desde));
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
afterAll(() => {
  servidor.close();
  rmSync(raiz, { recursive: true, force: true });
});

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const lista = (): ModeloRemoto[] => [
  {
    id: "vad.onnx",
    etiqueta: "VAD",
    url: `${base}/vad.onnx`,
    bytes: archivoSuelto.length,
    sha256: sha(archivoSuelto),
    formato: "archivo",
    requeridos: [{ ruta: "vad.onnx", bytes: archivoSuelto.length }],
  },
  {
    id: "voz-falsa",
    etiqueta: "Voz",
    url: `${base}/voz-falsa.tar.bz2`,
    bytes: archivoTar.length,
    sha256: sha(archivoTar),
    formato: "tar.bz2",
    requeridos: [
      { ruta: "voz-falsa/voz.onnx", bytes: 5000 },
      { ruta: "voz-falsa/tokens.txt", bytes: 3 },
      { ruta: "voz-falsa/espeak-ng-data/phontab" },
    ],
  },
];

describe("lista oficial de modelos", () => {
  it("son los 8 que carga la app: VAD, Parakeet, Whisper turbo y 5 voces", () => {
    expect(MODELOS_REQUERIDOS.map((m) => m.id)).toEqual([
      "silero_vad.onnx",
      "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8",
      "sherpa-onnx-whisper-turbo",
      "vits-piper-es_MX-claude-high-int8",
      "vits-piper-es_ES-davefx-medium-int8",
      "vits-piper-es_ES-sharvard-medium-int8",
      "vits-piper-es_MX-ald-medium-int8",
      "vits-piper-es_AR-daniela-high-int8",
    ]);
  });

  it("todas las voces de config/voces.json están en la lista", () => {
    const voces = JSON.parse(readFileSync(join(__dirname, "../../config/voces.json"), "utf8")) as {
      conjunto: string[];
    };
    for (const v of voces.conjunto) expect(MODELOS_REQUERIDOS.some((m) => m.id === v)).toBe(true);
  });

  it("el oído rápido y el preciso de config/transcriptor.json están en la lista", () => {
    const t = JSON.parse(readFileSync(join(__dirname, "../../config/transcriptor.json"), "utf8")) as Record<
      string,
      string
    >;
    const carpeta = {
      parakeet: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8",
      "whisper-turbo": "sherpa-onnx-whisper-turbo",
    };
    expect(MODELOS_REQUERIDOS.some((m) => m.id === carpeta[t.rapido as keyof typeof carpeta])).toBe(true);
    expect(MODELOS_REQUERIDOS.some((m) => m.id === carpeta[t.preciso as keyof typeof carpeta])).toBe(true);
  });

  it("todo se baja por https desde el proyecto k2-fsa/sherpa-onnx y el total ronda 1,17 GB", () => {
    for (const m of MODELOS_REQUERIDOS)
      expect(m.url.startsWith("https://github.com/k2-fsa/sherpa-onnx/releases/download/")).toBe(true);
    expect(MODELOS_REQUERIDOS.reduce((t, m) => t + m.bytes, 0)).toBe(1_173_822_522);
  });
});

describe("integridad de la lista", () => {
  it("ningún modelo se verifica solo por tamaño: los 8 traen SHA-256", () => {
    for (const m of MODELOS_REQUERIDOS) expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("pasosDeModelos contra un servidor local", () => {
  it("un paquete con enlaces simbólicos se rechaza y no se coloca nada", async () => {
    const dir = join(raiz, "models-enlace");
    const hostil: ModeloRemoto = {
      id: "voz-enlace",
      etiqueta: "Hostil",
      url: `${base}/voz-enlace.tar.bz2`,
      bytes: archivoEnlace.length,
      sha256: sha(archivoEnlace),
      formato: "tar.bz2",
      requeridos: [{ ruta: "voz-enlace/voz.onnx" }],
    };
    await expect(ejecutarPasos(pasosDeModelos({ dirModelos: dir, modelos: [hostil] }))).rejects.toMatchObject(
      {
        tipo: "integridad",
      },
    );
    expect(existsSync(join(dir, "voz-enlace"))).toBe(false);
  });

  it("un enlace simbólico en el sitio de un archivo requerido no cuenta como presente", async () => {
    const dir = join(raiz, "models-enlace2");
    mkdirSync(join(dir, "x"), { recursive: true });
    symlinkSync("/etc/hosts", join(dir, "x", "voz.onnx"));
    const { requeridosPresentes } = await import("./modelos");
    expect(await requeridosPresentes(dir, [{ ruta: "x/voz.onnx" }])).toBe(false);
  });

  it("baja, verifica, descomprime, coloca y limpia; luego ya no hay nada pendiente", async () => {
    const dir = join(raiz, "models1");
    const pasos = pasosDeModelos({ dirModelos: dir, modelos: lista() });
    expect((await pasosPendientes(pasos)).length).toBe(2);
    await ejecutarPasos(pasos);
    expect(readFileSync(join(dir, "vad.onnx")).length).toBe(2000);
    expect(readFileSync(join(dir, "voz-falsa", "tokens.txt"), "utf8")).toBe("abc");
    expect(readdirSync(join(dir, ".descargas"))).toEqual([]);
    expect((await pasosPendientes(pasos)).length).toBe(0);
  });

  it("un paquete cuyo contenido no es el esperado falla y no deja nada a medias", async () => {
    const dir = join(raiz, "models2");
    const malo = lista().map((m) =>
      m.id === "voz-falsa" ? { ...m, requeridos: [{ ruta: "voz-falsa/otro.onnx", bytes: 1 }] } : m,
    );
    await expect(ejecutarPasos(pasosDeModelos({ dirModelos: dir, modelos: malo }))).rejects.toMatchObject({
      tipo: "integridad",
    });
    expect(existsSync(join(dir, "voz-falsa"))).toBe(false);
  });

  it("si la carpeta ya existe a medias se completa sin borrar lo que había", async () => {
    const dir = join(raiz, "models3");
    mkdirSync(join(dir, "voz-falsa"), { recursive: true });
    writeFileSync(join(dir, "voz-falsa", "mio.txt"), "no me borres");
    await ejecutarPasos(pasosDeModelos({ dirModelos: dir, modelos: lista() }));
    expect(readFileSync(join(dir, "voz-falsa", "mio.txt"), "utf8")).toBe("no me borres");
    expect(existsSync(join(dir, "voz-falsa", "voz.onnx"))).toBe(true);
  });

  it("reanuda el paquete desde un parcial", async () => {
    const dir = join(raiz, "models4");
    mkdirSync(join(dir, ".descargas"), { recursive: true });
    writeFileSync(join(dir, ".descargas", "voz-falsa.tar.bz2.parcial"), archivoTar.subarray(0, 100));
    bajados = [];
    await ejecutarPasos(pasosDeModelos({ dirModelos: dir, modelos: lista() }));
    expect(bajados).toContain("bytes=100-");
    expect(existsSync(join(dir, "voz-falsa", "voz.onnx"))).toBe(true);
  });
});
