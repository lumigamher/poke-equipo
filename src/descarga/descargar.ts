import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";

/** Por qué falló una descarga, para decirle a la persona qué hacer. */
export type TipoErrorDescarga = "red" | "http" | "integridad" | "disco" | "cancelada";

export class ErrorDescarga extends Error {
  readonly tipo: TipoErrorDescarga;
  /** Código HTTP, en los errores de tipo "http". */
  readonly estado?: number;
  constructor(tipo: TipoErrorDescarga, mensaje: string, opciones?: { cause?: unknown; estado?: number }) {
    super(mensaje, opciones);
    this.name = "ErrorDescarga";
    this.tipo = tipo;
    if (opciones?.estado !== undefined) this.estado = opciones.estado;
  }
}

export interface OpcionesDescarga {
  url: string;
  destino: string;
  /** Tamaño exacto esperado en bytes (de la cabecera Content-Length verificada con HEAD). */
  bytes: number;
  /** SHA-256 en hexadecimal (64 caracteres). Obligatorio: ninguna descarga se acepta solo por tamaño. */
  sha256: string;
  /** Bytes que ya hay en disco del archivo (se llama al empezar, con lo reanudado, y en cada trozo). */
  alProgreso?: (bytesActuales: number) => void;
  señal?: AbortSignal;
  /** Para pruebas. */
  fetch?: typeof fetch;
}

const tamañoDe = async (ruta: string): Promise<number | null> => {
  try {
    return (await stat(ruta)).size;
  } catch {
    return null;
  }
};

export async function sha256De(ruta: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(ruta), hash);
  return hash.digest("hex");
}

/** Comprueba tamaño y, si lo hay, SHA-256. Devuelve el motivo del fallo o null si todo cuadra. */
export async function verificarArchivo(ruta: string, bytes: number, sha256?: string): Promise<string | null> {
  const real = await tamañoDe(ruta);
  if (real === null) return "no existe";
  if (real !== bytes) return `pesa ${real} bytes y debía pesar ${bytes}`;
  if (sha256 && (await sha256De(ruta)) !== sha256.toLowerCase()) return "su huella SHA-256 no coincide";
  return null;
}

/**
 * Baja `url` a `destino` de forma reanudable: lo recibido se queda en `destino.parcial`; si la descarga se corta
 * (o se cancela) la siguiente llamada continúa con una petición `Range`. Al terminar verifica tamaño (y SHA-256 si
 * se da) y solo entonces renombra: `destino` existe únicamente si está completo y verificado.
 */
export async function descargarArchivo(o: OpcionesDescarga): Promise<void> {
  if (typeof o.sha256 !== "string" || !/^[0-9a-fA-F]{64}$/.test(o.sha256))
    throw new ErrorDescarga(
      "integridad",
      "Falta la huella SHA-256 (64 hexadecimales) de la descarga; no se baja sin ella.",
    );
  const traer = o.fetch ?? fetch;
  const parcial = `${o.destino}.parcial`;
  await mkdir(dirname(o.destino), { recursive: true });

  // Ya estaba entero y bueno de una vez anterior.
  if ((await verificarArchivo(o.destino, o.bytes, o.sha256)) === null) {
    o.alProgreso?.(o.bytes);
    return;
  }
  await rm(o.destino, { force: true });

  for (let intento = 0; intento < 2; intento++) {
    let previo = (await tamañoDe(parcial)) ?? 0;
    if (previo > o.bytes) {
      await rm(parcial, { force: true });
      previo = 0;
    }
    if (previo < o.bytes) {
      const reiniciar = await traerTrozo(traer, o, parcial, previo);
      // 416 o un servidor que no entiende Range: se empieza de cero una sola vez.
      if (reiniciar) {
        await rm(parcial, { force: true });
        continue;
      }
    }
    const fallo = await verificarArchivo(parcial, o.bytes, o.sha256);
    if (fallo) {
      await rm(parcial, { force: true });
      throw new ErrorDescarga(
        "integridad",
        `El archivo bajado está dañado (${fallo}). Se borró; vuelve a intentarlo.`,
      );
    }
    await rename(parcial, o.destino);
    o.alProgreso?.(o.bytes);
    return;
  }
  throw new ErrorDescarga("http", "El servidor no permite reanudar la descarga. Vuelve a intentarlo.");
}

/** Pide desde `previo` y escribe a `parcial`. Devuelve true si hay que reiniciar de cero. */
async function traerTrozo(
  traer: typeof fetch,
  o: OpcionesDescarga,
  parcial: string,
  previo: number,
): Promise<boolean> {
  if (o.señal?.aborted) throw new ErrorDescarga("cancelada", "Descarga cancelada.");
  let r: Response;
  try {
    r = await traer(o.url, {
      headers: previo > 0 ? { Range: `bytes=${previo}-` } : {},
      signal: o.señal,
      redirect: "follow",
    });
  } catch (e) {
    throw errorDeRed(e, o);
  }
  if (r.status === 416) {
    await r.body?.cancel();
    return true;
  }
  if (!r.ok || !r.body) {
    await r.body?.cancel();
    throw new ErrorDescarga("http", `El servidor contestó ${r.status} al pedir ${nombreDe(o.url)}.`, {
      estado: r.status,
    });
  }
  // 200 a una petición con Range: mandó el archivo entero, así que se reescribe desde el principio.
  const añadir = previo > 0 && r.status === 206;
  let hecho = añadir ? previo : 0;
  o.alProgreso?.(hecho);
  const salida = createWriteStream(parcial, { flags: añadir ? "a" : "w" });
  // Un fallo de escritura (disco lleno, permisos) llega como evento: se guarda y se revisa en cada vuelta.
  let falloDisco: Error | null = null;
  salida.on("error", (e) => {
    falloDisco = e;
  });
  const errorDeDisco = (e: Error) =>
    new ErrorDescarga("disco", `No se pudo escribir en el disco: ${e.message}`, { cause: e });
  const cerrar = () =>
    new Promise<void>((res) => {
      if (salida.closed) return res();
      salida.once("close", () => res());
      salida.end();
    });
  const lector = r.body.getReader();
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      if (falloDisco) throw errorDeDisco(falloDisco);
      if (!salida.write(value))
        await new Promise<void>((res) => {
          const seguir = () => {
            salida.off("drain", seguir);
            salida.off("error", seguir);
            res();
          };
          salida.once("drain", seguir);
          salida.once("error", seguir);
        });
      if (falloDisco) throw errorDeDisco(falloDisco);
      hecho += value.byteLength;
      o.alProgreso?.(hecho);
    }
  } catch (e) {
    await lector.cancel().catch(() => {});
    // Se espera al cierre para que el archivo parcial quede completo en disco antes de devolver el error.
    await cerrar();
    throw e instanceof ErrorDescarga ? e : errorDeRed(e, o);
  }
  await cerrar();
  if (falloDisco) throw errorDeDisco(falloDisco);
  return false;
}

const nombreDe = (url: string): string => decodeURIComponent(url.split("/").pop() ?? url);

function errorDeRed(e: unknown, o: OpcionesDescarga): ErrorDescarga {
  if (o.señal?.aborted) return new ErrorDescarga("cancelada", "Descarga cancelada.", { cause: e });
  const causa = (e as { cause?: { code?: string } })?.cause?.code ?? (e as { code?: string })?.code;
  const detalle = causa ? ` (${causa})` : "";
  return new ErrorDescarga(
    "red",
    `Se cortó la conexión bajando ${nombreDe(o.url)}${detalle}. Lo ya bajado se conserva y se reanuda.`,
    { cause: e },
  );
}
