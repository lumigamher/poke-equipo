export interface ConfigVoces {
  conjunto: string[];
  especies: Record<string, { voz: string; velocidad: number }>;
}

export interface UsoVoz {
  voz: string;
  velocidad: number;
}

const VELOCIDAD_MIN = 0.8;
const VELOCIDAD_MAX = 1.3;

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Comprueba `config/voces.json` al cargarlo: conjunto no vacío de textos, cada voz instalada (`instalada(voz)`,
 * su carpeta en models/) y cada especie con una voz del conjunto y una velocidad numérica. Lanza un Error que dice
 * qué arreglar; si no, devuelve la config tipada.
 */
export function validarConfigVoces(dato: unknown, instalada: (voz: string) => boolean): ConfigVoces {
  if (!esObjeto(dato)) throw new Error("voces.json: debe ser un objeto con conjunto y especies");
  const { conjunto, especies } = dato;
  if (!Array.isArray(conjunto) || !conjunto.every((v) => typeof v === "string" && v !== "")) {
    throw new Error("voces.json: conjunto debe ser una lista de nombres de voz");
  }
  if (conjunto.length === 0) throw new Error("voces.json: el conjunto de voces está vacío");
  for (const voz of conjunto) {
    if (!instalada(voz)) throw new Error(`voces.json: la voz ${voz} no está instalada en models/`);
  }
  if (!esObjeto(especies))
    throw new Error("voces.json: especies debe ser un objeto {especie: {voz, velocidad}}");
  const salida: ConfigVoces["especies"] = {};
  for (const [especie, e] of Object.entries(especies)) {
    if (!esObjeto(e)) throw new Error(`voces.json: la especie ${especie} debe ser {voz, velocidad}`);
    if (typeof e.voz !== "string" || e.voz === "") {
      throw new Error(`voces.json: la especie ${especie} no tiene voz (falta o no es un nombre)`);
    }
    if (!conjunto.includes(e.voz)) {
      throw new Error(`voces.json: la especie ${especie} usa la voz ${e.voz}, que no está en el conjunto`);
    }
    if (
      typeof e.velocidad !== "number" ||
      !Number.isFinite(e.velocidad) ||
      e.velocidad < VELOCIDAD_MIN ||
      e.velocidad > VELOCIDAD_MAX
    ) {
      throw new Error(
        `voces.json: la especie ${especie} necesita una velocidad numérica entre 0,8 y 1,3 (tiene ${String(e.velocidad)})`,
      );
    }
    salida[especie] = { voz: e.voz, velocidad: e.velocidad };
  }
  return { conjunto: [...conjunto], especies: salida };
}

const PASO_VELOCIDAD = 0.15;
const PASOS_MAX = 10;

const redondea = (v: number) => Math.round(v * 100) / 100;

/**
 * Voz para una especie que se va a sacar.
 * Prefiere su voz base; si ya suena en el equipo, la primera libre del conjunto.
 * Si no queda ninguna libre, repite la voz menos usada con una velocidad que no tenga ya,
 * probando base, base+0,15, base-0,15, base+0,30... dentro de [0,8; 1,3].
 * Si ninguna velocidad sirve, devuelve la base de la especie y lo marca como repetida.
 */
export function elegirVoz(
  especie: number,
  enUso: UsoVoz[],
  cfg: ConfigVoces,
): { voz: string; velocidad: number; repetida: boolean } {
  if (cfg.conjunto.length === 0) {
    throw new Error("voces.json: el conjunto de voces está vacío");
  }

  const entrada = cfg.especies[String(especie)];
  const base =
    entrada && cfg.conjunto.includes(entrada.voz) ? entrada : { voz: cfg.conjunto[0], velocidad: 1 };

  const vocesEnUso = new Set(enUso.map((u) => u.voz));
  if (!vocesEnUso.has(base.voz)) {
    return { voz: base.voz, velocidad: base.velocidad, repetida: false };
  }

  const libre = cfg.conjunto.find((v) => !vocesEnUso.has(v));
  if (libre !== undefined) {
    return { voz: libre, velocidad: base.velocidad, repetida: false };
  }

  let menos = cfg.conjunto[0];
  let minUsos = Number.POSITIVE_INFINITY;
  for (const v of cfg.conjunto) {
    const usos = enUso.filter((u) => u.voz === v).length;
    if (usos < minUsos) {
      minUsos = usos;
      menos = v;
    }
  }

  const usadas = new Set(enUso.filter((u) => u.voz === menos).map((u) => redondea(u.velocidad)));
  const candidatas: number[] = [base.velocidad];
  for (let k = 1; k <= PASOS_MAX; k++) {
    candidatas.push(base.velocidad + k * PASO_VELOCIDAD, base.velocidad - k * PASO_VELOCIDAD);
  }
  for (const c of candidatas) {
    const v = redondea(c);
    if (v >= VELOCIDAD_MIN && v <= VELOCIDAD_MAX && !usadas.has(v)) {
      return { voz: menos, velocidad: v, repetida: true };
    }
  }
  return { voz: menos, velocidad: base.velocidad, repetida: true };
}
