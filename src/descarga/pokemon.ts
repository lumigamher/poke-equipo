import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { ErrorDescarga } from "./descargar.ts";
import type { Paso } from "./pasos.ts";

/**
 * Sprites (PMDCollab/SpriteCollab, CC BY-NC 4.0), gritos (PokeAPI/cries) y efectos de ataque (PMD Origins,
 * audinowho/DumpAsset). Los usan `scripts/bajar-sprites.mjs`, `scripts/bajar-poderes.mjs` y la propia app.
 * Nada de esto se versiona ni viaja en el instalador: se baja en el equipo de cada persona.
 */
export const ORIGEN_SPRITES = "https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite";
export const ORIGEN_GRITOS = "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest";
export const ORIGEN_PODERES = "https://raw.githubusercontent.com/audinowho/DumpAsset/master/Content/Particle";
export const FUENTE_SPRITES = "github.com/PMDCollab/SpriteCollab y PokeAPI/cries";
export const FUENTE_PODERES = "github.com/audinowho/DumpAsset";

/** Peso aproximado de una especie con todas sus hojas y su grito (medido en Kanto: unos 600 KB). */
export const BYTES_ESTIMADOS_ESPECIE = 650_000;
/** Peso aproximado de los nueve efectos de ataque. */
export const BYTES_ESTIMADOS_PODERES = 100_000;

export const NECESARIAS = ["Walk", "Idle", "Sleep", "Hop", "Charge", "Pose", "Nod", "Pain"];

export const EFECTOS: readonly string[] = [
  ["Shock_Wave", "Spark"],
  ["Ember", "Fire_Fang_Hit"],
  ["Bubbles_Blue", "Weather_Ball_Water"],
  ["Razor_Leaf", "Leaf_Storm_Hit"],
  ["Charm_Heart", "Sparkle_RSE"],
  ["Shadow_Ball", "Shadow_Sneak_Hit"],
  ["Confuse_Ray", "Psycho_Shift_Hit"],
  ["Aura_Sphere", "Force_Palm_Hit"],
  ["Swift_Star", "Hit_Neutral"],
].flat();

/** Número de la Pokédex aceptable: entero positivo con tope razonable (SpriteCollab no pasa de ~1300). */
export const especieValida = (especie: unknown): especie is number =>
  typeof especie === "number" && Number.isInteger(especie) && especie >= 1 && especie <= 9999;

export const carpetaDeEspecie = (especie: number): string => {
  if (!especieValida(especie))
    throw new Error(`La especie debe ser un entero entre 1 y 9999 (llegó ${especie}).`);
  return String(especie).padStart(4, "0");
};

/**
 * Los nombres de animación vienen de un XML remoto y acaban en una ruta y en una URL: solo letras, números y
 * guion bajo (los de SpriteCollab son "Walk", "Idle", "Hop"…). Cualquier otra cosa se omite.
 */
export const NOMBRE_ANIMACION = /^[A-Za-z0-9_]+$/;

/** Ruta bajo `base`; lanza si resolverla se saldría de ahí (defensa en profundidad además del filtro de nombres). */
export function rutaDentro(base: string, ...partes: string[]): string {
  const raiz = resolve(base);
  const ruta = resolve(raiz, ...partes);
  if (!ruta.startsWith(raiz + sep)) throw new Error(`Ruta fuera de ${raiz}: ${partes.join("/")}`);
  return ruta;
}

/** Cuántos archivos de una misma especie se piden a la vez. */
const HOJAS_A_LA_VEZ = 6;

/** Corre `fn` sobre cada elemento con hasta `limite` a la vez; al primer fallo no arranca más y lo relanza. */
async function enParalelo<T>(
  items: readonly T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<void>,
): Promise<void> {
  let siguiente = 0;
  let fallo: { error: unknown } | null = null;
  const trabajador = async () => {
    while (!fallo) {
      const i = siguiente++;
      if (i >= items.length) return;
      try {
        await fn(items[i], i);
      } catch (error) {
        fallo ??= { error };
        return;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador));
  if (fallo) throw (fallo as { error: unknown }).error;
}

/** Ningún archivo de sprites, grito o poder pasa de unos cientos de KB; más de esto es un servidor raro o hostil. */
export const TOPE_ARCHIVO = 5 * 1024 * 1024;

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Un PNG de verdad: firma de 8 bytes y cabecera IHDR completa (el alto se lee de los bytes 20 a 23). */
export const esPng = (b: Buffer): boolean => b.length >= 33 && b.subarray(0, 8).equals(FIRMA_PNG);
/**
 * Un grito de verdad: Ogg ("OggS") o MP3 (etiqueta "ID3" o sincronía de trama MPEG). En PokeAPI/cries casi todos son
 * Ogg, pero alguno (el de Pikachu) es un MP3 con extensión .ogg; el reproductor lo abre por contenido, no por nombre.
 */
export const esAudio = (b: Buffer): boolean => {
  if (b.length < 4) return false;
  const inicio = b.subarray(0, 4).toString("latin1");
  if (inicio === "OggS" || inicio.startsWith("ID3")) return true;
  return b[0] === 0xff && (b[1] & 0xe0) === 0xe0;
};

/** Cómo pide cada archivo: devuelve los bytes o lanza. Inyectable para probar sin red. */
export type Traer = (url: string, señal?: AbortSignal) => Promise<Buffer>;

export const traerConFetch: Traer = async (url, señal) => {
  let r: Response;
  try {
    r = await fetch(url, { signal: señal });
  } catch (e) {
    if (señal?.aborted) throw new ErrorDescarga("cancelada", "Descarga cancelada.", { cause: e });
    throw new ErrorDescarga("red", `Sin conexión bajando ${url.split("/").pop()}.`, { cause: e });
  }
  if (!r.ok) throw new ErrorDescarga("http", `${r.status} al bajar ${url}`, { estado: r.status });
  const declarado = Number(r.headers.get("content-length"));
  if (declarado > TOPE_ARCHIVO) {
    await r.body?.cancel();
    throw new ErrorDescarga(
      "integridad",
      `${url.split("/").pop()} pesa más de lo razonable (${declarado} bytes).`,
    );
  }
  // Se lee por trozos para cortar en el tope aunque el servidor no declare el tamaño.
  const trozos: Uint8Array[] = [];
  let total = 0;
  try {
    const lector = r.body?.getReader();
    for (;;) {
      const leido = await lector?.read();
      if (!leido || leido.done) break;
      total += leido.value.byteLength;
      if (total > TOPE_ARCHIVO) {
        await lector?.cancel();
        throw new ErrorDescarga("integridad", `${url.split("/").pop()} pesa más de lo razonable.`);
      }
      trozos.push(leido.value);
    }
  } catch (e) {
    if (e instanceof ErrorDescarga) throw e;
    if (señal?.aborted) throw new ErrorDescarga("cancelada", "Descarga cancelada.", { cause: e });
    throw new ErrorDescarga("red", `Se cortó la conexión bajando ${url.split("/").pop()}.`, { cause: e });
  }
  return Buffer.concat(trozos);
};

export interface AnimCruda {
  copiaDe: string | null;
  ancho: number;
  alto: number;
  duraciones: number[];
  golpe: number | null;
}

/** Lee el AnimData.xml de SpriteCollab. */
export function parsearAnimData(xml: string): Map<string, AnimCruda> {
  const crudas = new Map<string, AnimCruda>();
  for (const [, cuerpo] of xml.matchAll(/<Anim>([\s\S]*?)<\/Anim>/g)) {
    const campo = (n: string) => cuerpo.match(new RegExp(`<${n}>(.*?)</${n}>`))?.[1];
    const nombre = campo("Name");
    if (nombre === undefined) continue;
    crudas.set(nombre, {
      copiaDe: campo("CopyOf") ?? null,
      ancho: Number(campo("FrameWidth")),
      alto: Number(campo("FrameHeight")),
      duraciones: [...cuerpo.matchAll(/<Duration>(\d+)<\/Duration>/g)].map((m) => Number(m[1])),
      // Cuadro en que un ataque conecta: ahí sale el poder.
      golpe: campo("HitFrame") === undefined ? null : Number(campo("HitFrame")),
    });
  }
  return crudas;
}

const existe = async (ruta: string): Promise<boolean> => {
  try {
    return (await stat(ruta)).isFile();
  } catch {
    return false;
  }
};

/** Escribe sin dejar a medias: un archivo que existe está entero (la reanudación por archivo depende de esto). */
async function escribirAtomico(base: string, ruta: string, datos: Buffer | string): Promise<void> {
  rutaDentro(base, ruta);
  const temporal = `${ruta}.parcial`;
  await writeFile(temporal, datos);
  await rename(temporal, ruta);
}

export interface OpcionesEspecie {
  /** assets/pokemon. */
  assets: string;
  especie: number;
  traer?: Traer;
  /** Avisos (hojas opcionales que faltan); por omisión se callan. */
  aviso?: (mensaje: string) => void;
  /** Cuántos archivos van de cuántos (el total se conoce tras leer AnimData.xml). */
  alProgreso?: (hechos: number, total: number) => void;
  señal?: AbortSignal;
}

export interface ResultadoEspecie {
  anims: number;
  shiny: number;
  omitidas: string[];
  destino: string;
}

/** Una especie lista para dibujar: `anims.json` es lo último que se escribe y marca que está completa. */
export async function especieCompleta(assets: string, especie: number): Promise<boolean> {
  const dir = join(assets, carpetaDeEspecie(especie));
  return (await existe(join(dir, "anims.json"))) && (await existe(join(dir, "grito.ogg")));
}

/** Baja hojas, shiny, grito y créditos de una especie. Lo que ya está en disco se reutiliza (reanudable). */
export async function bajarEspecie(o: OpcionesEspecie): Promise<ResultadoEspecie> {
  const traer = o.traer ?? traerConFetch;
  const aviso = o.aviso ?? (() => {});
  const dex = carpetaDeEspecie(o.especie);
  const SPRITES = `${ORIGEN_SPRITES}/${dex}`;
  const GRITO = `${ORIGEN_GRITOS}/${o.especie}.ogg`;
  const destino = rutaDentro(o.assets, dex);
  await mkdir(join(destino, "shiny"), { recursive: true });

  /** Si el archivo ya existe en disco lo reutiliza en vez de volver a bajarlo. */
  const obtener = async (archivo: string, url: string, valido: (b: Buffer) => boolean): Promise<Buffer> => {
    const ruta = rutaDentro(destino, archivo);
    if (await existe(ruta)) return readFile(ruta);
    const datos = await traer(url, o.señal);
    // Un archivo inválido o enorme no se guarda: la hoja cuenta como no bajada.
    if (datos.length > TOPE_ARCHIVO || !valido(datos))
      throw new ErrorDescarga("integridad", `${archivo} no es un archivo válido; se descarta.`);
    await escribirAtomico(destino, ruta, datos);
    return datos;
  };

  const crudas = parsearAnimData((await traer(`${SPRITES}/AnimData.xml`, o.señal)).toString("utf8"));
  // Todo lo que la especie trae, además de las necesarias: si alguna hoja da 404 se omite con un aviso.
  const opcionales = [...crudas.keys()].filter((n) => !NECESARIAS.includes(n));
  const nombres = [...NECESARIAS, ...opcionales];
  // Cada hoja cuenta como un archivo (la shiny es opcional y no entra en la cuenta); más el grito.
  const total = nombres.length + 1;
  let hechos = 0;
  const avanzar = () => o.alProgreso?.(++hechos, total);
  o.alProgreso?.(0, total);

  interface Hoja {
    entrada?: Record<string, unknown>;
    shiny?: boolean;
    omitida?: boolean;
  }
  const hojas: Hoja[] = nombres.map(() => ({}));
  // Varias hojas a la vez: son decenas de archivos pequeños y de uno en uno el primer arranque tardaría minutos.
  await enParalelo(nombres, HOJAS_A_LA_VEZ, async (nombre, i) => {
    const opcional = opcionales.includes(nombre);
    let fuente = nombre;
    let dato = crudas.get(nombre);
    if (!NOMBRE_ANIMACION.test(nombre) || (dato?.copiaDe && !NOMBRE_ANIMACION.test(dato.copiaDe))) {
      aviso(`Se omite una animación con nombre no válido: ${JSON.stringify(nombre).slice(0, 60)}.`);
      hojas[i].omitida = true;
      avanzar();
      return;
    }
    if (dato?.copiaDe) {
      fuente = dato.copiaDe;
      dato = crudas.get(fuente);
    }
    if (!dato?.ancho) {
      aviso(`Esta especie no tiene la animación ${nombre}; se usará otra.`);
      if (opcional) hojas[i].omitida = true;
      avanzar();
      return;
    }
    let png: Buffer;
    try {
      png = await obtener(`${nombre}-Anim.png`, `${SPRITES}/${fuente}-Anim.png`, esPng);
    } catch (error) {
      if (!opcional || (error instanceof ErrorDescarga && error.tipo === "cancelada")) throw error;
      aviso(`No se pudo bajar la animación opcional ${nombre} (${(error as Error).message}); se omite.`);
      hojas[i].omitida = true;
      avanzar();
      return;
    }
    // Alto de la imagen: bytes 20 a 23 de la cabecera PNG.
    const filas = png.readUInt32BE(20) / dato.alto;
    const entrada: Record<string, unknown> = {
      ancho: dato.ancho,
      alto: dato.alto,
      duraciones: dato.duraciones,
      filas,
    };
    if (dato.golpe !== null && dato.golpe < dato.duraciones.length) entrada.golpe = dato.golpe;
    hojas[i].entrada = entrada;
    // La versión shiny de la misma hoja (forma 0000, variante 0001); si no existe, el shiny usa la normal.
    try {
      await obtener(join("shiny", `${nombre}-Anim.png`), `${SPRITES}/0000/0001/${fuente}-Anim.png`, esPng);
      hojas[i].shiny = true;
    } catch (error) {
      if (error instanceof ErrorDescarga && error.tipo === "cancelada") throw error;
      // Sin hoja shiny para esta animación.
    }
    avanzar();
  });
  // El orden de anims.json es el de AnimData, no el de llegada.
  // Sin prototipo: un <Name>__proto__</Name> es una clave más, no toca Object.prototype.
  const anims: Record<string, Record<string, unknown>> = Object.create(null);
  const omitidas: string[] = [];
  let shinys = 0;
  for (const [i, nombre] of nombres.entries()) {
    const h = hojas[i];
    if (h.entrada) anims[nombre] = h.entrada;
    if (h.omitida) omitidas.push(nombre);
    if (h.shiny) shinys += 1;
  }
  if (!anims.Walk && !anims.Idle) throw new Error("Sin Walk ni Idle no hay cómo dibujar esta especie.");

  await obtener("grito.ogg", GRITO, esAudio);
  avanzar();
  const creditos = await traer(`${SPRITES}/credits.txt`, o.señal).catch((e) => {
    if (e instanceof ErrorDescarga && e.tipo === "cancelada") throw e;
    return Buffer.from("sin archivo de créditos");
  });
  await escribirAtomico(
    destino,
    join(destino, "CREDITOS.txt"),
    `Sprites: PMDCollab/SpriteCollab, licencia CC BY-NC 4.0. Autores:\n${creditos.toString("utf8")}\nGrito: PokeAPI/cries, © The Pokémon Company.\n`,
  );
  // Al final: con anims.json la especie cuenta como disponible.
  await escribirAtomico(destino, join(destino, "anims.json"), `${JSON.stringify(anims, null, 2)}\n`);
  return { anims: Object.keys(anims).length, shiny: shinys, omitidas, destino };
}

export interface OpcionesPoderes {
  assets: string;
  traer?: Traer;
  alProgreso?: (hechos: number, total: number) => void;
  aviso?: (mensaje: string) => void;
  señal?: AbortSignal;
}

export async function poderesCompletos(assets: string): Promise<boolean> {
  const dir = join(assets, "poderes");
  if (!(await existe(join(dir, "poderes.json")))) return false;
  for (const n of EFECTOS) if (!(await existe(join(dir, `${n}.png`)))) return false;
  return true;
}

/**
 * Los efectos de ataque ya animados de PMD: Origins. Cada .dir es: largo del PNG (8 bytes), el PNG, y cuatro
 * enteros: ancho y alto del cuadro, tipo de giro y cuadros. Se guardan como hojas PNG más `poderes.json`.
 */
export async function bajarPoderes(
  o: OpcionesPoderes,
): Promise<Record<string, { ancho: number; alto: number; cuadros: number }>> {
  const traer = o.traer ?? traerConFetch;
  const destino = rutaDentro(o.assets, "poderes");
  await mkdir(destino, { recursive: true });
  const medidas: { ancho: number; alto: number; cuadros: number }[] = [];
  let hechos = 0;
  o.alProgreso?.(0, EFECTOS.length);
  await enParalelo(EFECTOS, HOJAS_A_LA_VEZ, async (nombre, i) => {
    const b = await traer(`${ORIGEN_PODERES}/${nombre}.dir`, o.señal);
    if (b.length < 8 || b.length > TOPE_ARCHIVO) throw new Error(`${nombre}: tamaño inválido.`);
    const largo = Number(b.readBigInt64LE(0));
    if (largo < 33 || 8 + largo + 16 > b.length || !esPng(b.subarray(8, 8 + largo)))
      throw new Error(`${nombre}: el efecto no trae un PNG válido.`);
    const cola = b.subarray(8 + largo);
    if (cola.readInt32LE(8) !== 0)
      throw new Error(`${nombre} trae varias direcciones; se esperaba una sola fila`);
    await escribirAtomico(destino, join(destino, `${nombre}.png`), b.subarray(8, 8 + largo));
    medidas[i] = { ancho: cola.readInt32LE(0), alto: cola.readInt32LE(4), cuadros: cola.readInt32LE(12) };
    o.aviso?.(`${nombre}: ${medidas[i].cuadros} cuadros de ${medidas[i].ancho}x${medidas[i].alto}`);
    o.alProgreso?.(++hechos, EFECTOS.length);
  });
  // El orden de poderes.json es el de la lista, no el de llegada.
  const datos: Record<string, { ancho: number; alto: number; cuadros: number }> = Object.create(null);
  for (const [i, nombre] of EFECTOS.entries()) datos[nombre] = medidas[i];
  await escribirAtomico(
    destino,
    join(destino, "CREDITOS.txt"),
    "Efectos de ataque: Pokémon Mystery Dungeon: Origins (audinowho/DumpAsset, Content/Particle).\nGráficos originales © Nintendo / Spike Chunsoft / The Pokémon Company. Uso personal, no se distribuye.\n",
  );
  await escribirAtomico(destino, join(destino, "poderes.json"), `${JSON.stringify(datos, null, 2)}\n`);
  return datos;
}

/** Pasos de la preparación para el ejecutor genérico. */
export function pasoDePoderes(assets: string, traer?: Traer): Paso {
  return {
    id: "poderes",
    etiqueta: "Efectos de ataque",
    fuente: FUENTE_PODERES,
    bytes: BYTES_ESTIMADOS_PODERES,
    completo: () => poderesCompletos(assets),
    async ejecutar({ alBytes, señal }) {
      await bajarPoderes({
        assets,
        traer,
        señal,
        alProgreso: (h, t) => alBytes(Math.round((h / t) * BYTES_ESTIMADOS_PODERES)),
      });
    },
  };
}

export function pasoDeEspecie(assets: string, especie: number, nombre: string, traer?: Traer): Paso {
  return {
    id: `especie-${especie}`,
    etiqueta: nombre,
    fuente: FUENTE_SPRITES,
    bytes: BYTES_ESTIMADOS_ESPECIE,
    completo: () => especieCompleta(assets, especie),
    async ejecutar({ alBytes, señal }) {
      await bajarEspecie({
        assets,
        especie,
        traer,
        señal,
        alProgreso: (h, t) => alBytes(Math.round((h / t) * BYTES_ESTIMADOS_ESPECIE)),
      });
    },
  };
}
