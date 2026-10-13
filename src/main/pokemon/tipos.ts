import { TIPOS, type Tipo, tipoDe } from "@compartido/tipo-especie";

export interface Movimiento {
  nombre: string;
  /** Lo que se le envía a Claude Code: un comando con barra o una instrucción. */
  comando: string;
}

/** Lo que el tipo le da a un Pokémon: su modelo, su especialidad (va al rol) y su movimiento propio. */
export interface DatosTipo {
  modelo: string;
  especialidad: string;
  movimiento: Movimiento;
}

export type ConfigTipos = Record<Tipo, DatosTipo>;

const MODELOS = new Set(["opus", "sonnet", "haiku", "fable"]);

/** Valida config/tipos.json: cada tipo con un modelo conocido, su especialidad y su movimiento. Lanza si falta algo. */
export function validarConfigTipos(crudo: unknown): ConfigTipos {
  const c = (crudo ?? {}) as Record<string, Partial<DatosTipo> | undefined>;
  for (const t of TIPOS) {
    const d = c[t];
    if (!d || typeof d.modelo !== "string" || !MODELOS.has(d.modelo)) {
      throw new Error(`config/tipos.json: el tipo ${t} necesita un modelo (opus, sonnet, haiku o fable).`);
    }
    if (typeof d.especialidad !== "string" || !d.movimiento?.nombre || !d.movimiento.comando) {
      throw new Error(`config/tipos.json: al tipo ${t} le falta la especialidad o el movimiento.`);
    }
  }
  return c as ConfigTipos;
}

/** Los tres movimientos que tienen todos, además del propio de su tipo. */
const COMUNES: Movimiento[] = [
  { nombre: "Golpe certero", comando: "Corre lint, typecheck y pruebas, y dime qué falló." },
  { nombre: "Vistazo", comando: "Resume en cinco líneas en qué vamos y qué falta." },
  { nombre: "Descanso", comando: "/compact" },
];

/** Los cuatro movimientos de una especie: el de su tipo y los tres comunes. */
export function movimientosDe(especie: number, config: ConfigTipos): Movimiento[] {
  return [config[tipoDe(especie)].movimiento, ...COMUNES];
}

/** Los nombres de todos los movimientos que existen (los de cada tipo y los comunes): un nombre propio no puede serlos. */
export function nombresDeMovimientos(config: ConfigTipos): string[] {
  return [...new Set([...TIPOS.map((t) => config[t].movimiento.nombre), ...COMUNES.map((m) => m.nombre)])];
}

const plano = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * "usa lanzallamas" (dicho o escrito) → el comando de ese movimiento, con lo que venga después pegado detrás
 * ("usa impactrueno dónde se valida el token"). Null si el texto no pide un movimiento de la lista.
 */
export function leerMovimiento(texto: string, movimientos: Movimiento[]): string | null {
  const t = plano(texto);
  const cuerpo = /^(?:usa|utiliza|haz) (.+)$/.exec(t)?.[1];
  if (!cuerpo) return null;
  for (const m of movimientos) {
    const nombre = plano(m.nombre);
    if (cuerpo !== nombre && !cuerpo.startsWith(`${nombre} `)) continue;
    const resto = cuerpo.slice(nombre.length).trim();
    return resto && !m.comando.startsWith("/") ? `${m.comando} ${resto}` : m.comando;
  }
  return null;
}

/** La lista de movimientos como texto para la burbuja. */
export function textoMovimientos(movimientos: Movimiento[]): string {
  return ["Movimientos (di o escribe «usa …»):", ...movimientos.map((m) => `${m.nombre}: ${m.comando}`)].join(
    "\n",
  );
}
