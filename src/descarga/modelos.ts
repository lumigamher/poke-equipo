import { execFile } from "node:child_process";
import { cp, lstat, mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { descargarArchivo, ErrorDescarga } from "./descargar.ts";
import type { Paso } from "./pasos.ts";

const LANZAR = "https://github.com/k2-fsa/sherpa-onnx/releases/download";
export const FUENTE_MODELOS = "github.com/k2-fsa/sherpa-onnx (releases)";

/** Un archivo que la app abre de verdad; `bytes` es su tamaño exacto ya extraído. */
export interface ArchivoRequerido {
  /** Relativa a la carpeta de modelos. */
  ruta: string;
  bytes?: number;
}

export interface ModeloRemoto {
  /** Nombre de la carpeta en models/ (o del archivo suelto). */
  id: string;
  etiqueta: string;
  url: string;
  /** Peso exacto de lo que se baja (Content-Length verificado con HEAD). */
  bytes: number;
  /** SHA-256 del archivo que se baja (de la API de releases de GitHub, `digest`; el de whisper-turbo lo calculé yo). */
  sha256: string;
  formato: "archivo" | "tar.bz2";
  requeridos: ArchivoRequerido[];
}

const piper = (
  voz: string,
  etiqueta: string,
  bytes: number,
  sha256: string,
  onnx: number,
  tokens: number,
): ModeloRemoto => {
  const id = `vits-piper-${voz}-int8`;
  return {
    id,
    etiqueta,
    url: `${LANZAR}/tts-models/${id}.tar.bz2`,
    bytes,
    sha256,
    formato: "tar.bz2",
    requeridos: [
      { ruta: `${id}/${voz}.onnx`, bytes: onnx },
      { ruta: `${id}/tokens.txt`, bytes: tokens },
      { ruta: `${id}/espeak-ng-data/phontab` },
    ],
  };
};

/**
 * Los modelos que la app carga de verdad (src/main/oido/sherpa.ts, src/main/voz/sherpa.ts, config/transcriptor.json
 * y config/voces.json): el detector de voz, Parakeet (oído rápido), Whisper turbo (oído preciso) y las cinco voces
 * Piper. Kokoro, Whisper small, los zipformer y Nemotron que hay en models/ de desarrollo NO se usan.
 */
export const MODELOS_REQUERIDOS: readonly ModeloRemoto[] = [
  {
    id: "silero_vad.onnx",
    etiqueta: "Detector de voz",
    url: `${LANZAR}/asr-models/silero_vad.onnx`,
    bytes: 643_854,
    sha256: "9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6",
    formato: "archivo",
    requeridos: [{ ruta: "silero_vad.onnx", bytes: 643_854 }],
  },
  {
    id: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8",
    etiqueta: "Oído rápido (Parakeet)",
    url: `${LANZAR}/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2`,
    bytes: 487_170_055,
    sha256: "5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf",
    formato: "tar.bz2",
    requeridos: [
      { ruta: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/encoder.int8.onnx", bytes: 652_184_281 },
      { ruta: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/decoder.int8.onnx", bytes: 11_845_275 },
      { ruta: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/joiner.int8.onnx", bytes: 6_355_277 },
      { ruta: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/tokens.txt", bytes: 93_939 },
    ],
  },
  {
    id: "sherpa-onnx-whisper-turbo",
    etiqueta: "Oído preciso (Whisper turbo)",
    url: `${LANZAR}/asr-models/sherpa-onnx-whisper-turbo.tar.bz2`,
    bytes: 563_790_207,
    // La API de releases no publica su huella: la calculé yo bajando el paquete oficial una vez (2026-10-13).
    sha256: "b11acbbcd660b44a8e0df33724feb5aaa709cf65668f2823d59f656312544f22",
    formato: "tar.bz2",
    requeridos: [
      { ruta: "sherpa-onnx-whisper-turbo/turbo-encoder.int8.onnx", bytes: 674_716_297 },
      { ruta: "sherpa-onnx-whisper-turbo/turbo-decoder.int8.onnx", bytes: 361_080_764 },
      { ruta: "sherpa-onnx-whisper-turbo/turbo-tokens.txt", bytes: 816_730 },
    ],
  },
  piper(
    "es_MX-claude-high",
    "Voz Piper es_MX claude",
    21_216_685,
    "0f9fc9c07d2e17bdc0f5f33a657addae92085da85704cb86a861e59d32f3bbfa",
    18_304_617,
    940,
  ),
  piper(
    "es_ES-davefx-medium",
    "Voz Piper es_ES davefx",
    21_171_632,
    "8bb8ac1cefb727caec9bd9c6c3185c673c8b42c53bd29bb25d5a7715dac37125",
    18_579_718,
    907,
  ),
  piper(
    "es_ES-sharvard-medium",
    "Voz Piper es_ES sharvard",
    23_477_120,
    "bf5507cbdedea650365bd6175b3164a8ecca5847533ddf97afcba9d76ea599d1",
    21_992_219,
    921,
  ),
  piper(
    "es_MX-ald-medium",
    "Voz Piper es_MX ald",
    21_283_187,
    "447e82d080719409db08e54a4b6eec2e4b6ba850b98dcaf09d3fc67bf30ff692",
    18_579_723,
    921,
  ),
  piper(
    "es_AR-daniela-high",
    "Voz Piper es_AR daniela",
    35_069_782,
    "7218f0a119e4c16533ac187f71ab3019f2092f1594e43fef8392ae1f5b64abab",
    37_370_828,
    940,
  ),
];

/** true si cada archivo requerido existe (y pesa lo esperado, cuando se conoce) bajo `base`. */
export async function requeridosPresentes(base: string, requeridos: ArchivoRequerido[]): Promise<boolean> {
  for (const r of requeridos) {
    try {
      // lstat: un enlace simbólico no cuenta como archivo presente.
      const s = await lstat(join(base, r.ruta));
      if (!s.isFile() || (r.bytes !== undefined && s.size !== r.bytes)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

const ejecutarArchivo = promisify(execFile);
/** Ruta absoluta en macOS (no se busca `tar` en el PATH); en Windows 10+ `tar.exe` viene con el sistema. */
const TAR = process.platform === "darwin" ? "/usr/bin/tar" : "tar";

/**
 * true si lo extraído trae algo que no sea archivo o carpeta normal (enlaces simbólicos, dispositivos…): los paquetes
 * oficiales no los tienen y un enlace podría apuntar fuera de la carpeta de modelos.
 */
export async function traeEnlaces(dir: string): Promise<boolean> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink()) return true;
    if (e.isDirectory()) {
      if (await traeEnlaces(join(dir, e.name))) return true;
    } else if (!e.isFile()) return true;
  }
  return false;
}

/** Descomprime un .tar.bz2 con el `tar` del sistema (macOS y Windows 10+ traen bsdtar; Node no sabe bzip2). */
export async function extraerConTar(archivo: string, destino: string): Promise<void> {
  await mkdir(destino, { recursive: true });
  try {
    await ejecutarArchivo(TAR, ["-xjf", archivo, "-C", destino], { maxBuffer: 1 << 20 });
  } catch (e) {
    throw new ErrorDescarga(
      "integridad",
      `No se pudo descomprimir ${archivo.split("/").pop()}: ${(e as Error).message.split("\n")[0]}`,
      { cause: e },
    );
  }
}

export interface DepsModelos {
  /** Carpeta models/. */
  dirModelos: string;
  fetch?: typeof fetch;
  extraer?: (archivo: string, destino: string) => Promise<void>;
  /** Para pruebas: sustituye la lista oficial. */
  modelos?: readonly ModeloRemoto[];
}

/** Un paso por modelo. Baja reanudable → verifica → descomprime en un sitio de paso → verifica → coloca. */
export function pasosDeModelos(deps: DepsModelos): Paso[] {
  const extraer = deps.extraer ?? extraerConTar;
  const descargas = join(deps.dirModelos, ".descargas");
  return (deps.modelos ?? MODELOS_REQUERIDOS).map((m): Paso => {
    return {
      id: m.id,
      etiqueta: m.etiqueta,
      fuente: FUENTE_MODELOS,
      bytes: m.bytes,
      completo: () => requeridosPresentes(deps.dirModelos, m.requeridos),
      async ejecutar({ alBytes, señal }) {
        await mkdir(deps.dirModelos, { recursive: true });
        if (m.formato === "archivo") {
          await descargarArchivo({
            url: m.url,
            destino: join(deps.dirModelos, m.id),
            bytes: m.bytes,
            sha256: m.sha256,
            alProgreso: alBytes,
            señal,
            fetch: deps.fetch,
          });
          return;
        }
        const archivo = join(descargas, `${m.id}.tar.bz2`);
        await descargarArchivo({
          url: m.url,
          destino: archivo,
          bytes: m.bytes,
          sha256: m.sha256,
          alProgreso: alBytes,
          señal,
          fetch: deps.fetch,
        });
        const paso = join(descargas, `${m.id}.extraido`);
        await rm(paso, { recursive: true, force: true });
        await extraer(archivo, paso);
        if (!(await requeridosPresentes(paso, m.requeridos))) {
          // El archivo bajado estaba bien pero no trae lo esperado: se borra para no repetir el mismo error.
          await rm(paso, { recursive: true, force: true });
          await rm(archivo, { force: true });
          throw new ErrorDescarga(
            "integridad",
            `${m.etiqueta}: el paquete no trae los archivos esperados (¿cambió la fuente?).`,
          );
        }
        if (await traeEnlaces(paso)) {
          await rm(paso, { recursive: true, force: true });
          await rm(archivo, { force: true });
          throw new ErrorDescarga(
            "integridad",
            `${m.etiqueta}: el paquete trae enlaces simbólicos y se rechazó.`,
          );
        }
        // Se coloca sin borrar nada de lo que hubiera en esa carpeta (p. ej. el models/ de desarrollo).
        const final = join(deps.dirModelos, m.id);
        const origen = join(paso, m.id);
        try {
          await rename(origen, final);
        } catch {
          await cp(origen, final, { recursive: true, force: true });
        }
        await rm(paso, { recursive: true, force: true });
        await rm(archivo, { force: true });
      },
    };
  });
}
