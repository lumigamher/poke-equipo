import type { Estado, VistaPokemon } from "./tipos";

/** Estados en los que el Pokémon tiene algo que decir y su burbuja se muestra sin que la persona la pida. */
const HABLA_SOLO: Estado[] = ["escuchando", "pidiendo_permiso", "termino", "esperando", "error", "saliendo"];

/** Tiene una orden hablada a la vista, aún sin enviar. Tolera vistas incompletas (sin `borrador`). */
export function tieneBorrador(vista: VistaPokemon): boolean {
  return typeof vista.borrador === "number";
}

/** Una burbuja de puro espacio en blanco no se dibuja. */
export function hayTexto(texto: string): boolean {
  return texto.trim().length > 0;
}

/**
 * ¿La burbuja de este Pokémon tiene algo que mostrar? `fijada`: la persona la pidió (es la abierta por su clic), y entonces
 * se muestra en cualquier estado menos guardándose. Tolera vistas incompletas (las de las pruebas de main).
 */
export function debeMostrarse(vista: VistaPokemon, fijada: boolean): boolean {
  // Un permiso pendiente nunca puede quedar invisible, ni siquiera guardándose.
  if (vista.permiso) return true;
  if (vista.estado === "guardandose") return false;
  if (fijada) return true;
  // Un borrador pendiente y los avisos (alta de voz, Centro Pokémon) se ven en cualquier estado.
  if (tieneBorrador(vista)) return true;
  const burbuja = vista.burbuja;
  if (!burbuja) return false;
  if (burbuja.tipo === "aviso") return hayTexto(burbuja.texto);
  return hayTexto(burbuja.texto) && HABLA_SOLO.includes(vista.estado);
}

/**
 * Qué burbuja va abierta en el escenario. Regla:
 * 1) La del borrador vigente más reciente, por su id (contador compartido y creciente, no el `desde` del estado):
 *    lo transcrito siempre se ve antes de enviarse (Ruling T12/I1), y Escape cancela justo ese.
 * 2) Si no, la que la persona eligió (chip o clic): la fijada.
 * 3) Si no, la del Pokémon con permiso pendiente más antiguo (un permiso no se puede contestar cerrado).
 * 4) Si no, la que tiene algo que decir más reciente (por `desde` del estado, mayor = más reciente).
 * Un permiso desplazado por un borrador vuelve a chip y, al reabrirse, la guardia lo sella de nuevo (falla cerrado).
 * El resto se muestra como chip con nombre y estado. Nunca hay más de una burbuja abierta.
 *
 * La calcula SOLO el proceso principal (es la autoridad: la guardia de voz cuenta solo el permiso de la abierta) y la
 * envía marcada en `VistaPokemon.abierta`; el renderer no la recalcula.
 */
export function burbujaAbierta(vistas: readonly VistaPokemon[], fijada: string | null): string | null {
  const conBorrador = vistas.filter(tieneBorrador).sort((a, b) => (b.borrador ?? 0) - (a.borrador ?? 0));
  if (conBorrador[0]) return conBorrador[0].id;
  if (fijada !== null && vistas.some((v) => v.id === fijada)) return fijada;
  const conPermiso = vistas.filter((v) => v.permiso).sort((a, b) => a.desde - b.desde);
  if (conPermiso[0]) return conPermiso[0].id;
  const conBurbuja = vistas.filter((v) => debeMostrarse(v, false)).sort((a, b) => b.desde - a.desde);
  return conBurbuja[0]?.id ?? null;
}

/**
 * Copia las vistas con `abierta` marcado: true en exactamente una (o en ninguna), false en el resto. Solo la abierta
 * conserva su `registro` (el registro en vivo pesa y solo se lee en la burbuja abierta): así el resto no lo manda por IPC.
 */
export function marcarAbierta(vistas: readonly VistaPokemon[], fijada: string | null): VistaPokemon[] {
  const abierta = burbujaAbierta(vistas, fijada);
  return vistas.map((v) => {
    if (v.id === abierta) return { ...v, abierta: true };
    const { registro: _registro, ...resto } = v;
    return { ...resto, abierta: false };
  });
}

/**
 * Lo que main recuerda entre publicaciones para decidir la fijada: cuál eligió la persona, si el fijado tenía burbuja o
 * permiso la última vez, qué permisos (Pokémon + permiso) ya se habían visto y quiénes tenían un borrador.
 */
export interface Apertura {
  fijada: string | null;
  tenia: boolean;
  permisos: ReadonlySet<string>;
  borradores: ReadonlySet<string>;
}

export const SIN_APERTURA: Apertura = Object.freeze({
  fijada: null,
  tenia: false,
  permisos: new Set<string>(),
  borradores: new Set<string>(),
});

const tieneAlgo = (v: VistaPokemon) => Boolean(v.permiso) || Boolean(v.burbuja);
const clavePermiso = (v: VistaPokemon) => (v.permiso ? `${v.id}\u0000${v.permiso.id}` : null);

/**
 * Pone la apertura al día con las vistas de ahora (C25). La fijada se suelta cuando:
 * - aparece un permiso nuevo en cualquier Pokémon (un chip fijado nunca tapa un permiso nuevo);
 * - aparece un borrador nuevo en cualquier Pokémon (cuando sale, no vuelve la fijada vieja);
 * - el fijado deja de existir o se empieza a guardar;
 * - el fijado tenía burbuja o permiso y se quedó sin nada.
 * Uno fijado sin nada (un clic para leer su última respuesta o escribirle) sigue fijado hasta que algo de lo anterior
 * pase o la persona vuelva a hacer clic. Es idempotente.
 */
export function actualizarApertura(a: Apertura, vistas: readonly VistaPokemon[]): Apertura {
  const permisos = new Set<string>();
  const borradores = new Set<string>();
  let nuevo = false;
  for (const v of vistas) {
    if (tieneBorrador(v)) {
      borradores.add(v.id);
      if (!a.borradores.has(v.id)) nuevo = true;
    }
    const k = clavePermiso(v);
    if (k === null) continue;
    permisos.add(k);
    if (!a.permisos.has(k)) nuevo = true;
  }
  if (a.fijada === null) return { fijada: null, tenia: false, permisos, borradores };
  const fijado = vistas.find((v) => v.id === a.fijada);
  const ahora = fijado ? tieneAlgo(fijado) : false;
  if (nuevo || !fijado || fijado.estado === "guardandose" || (a.tenia && !ahora))
    return { fijada: null, tenia: false, permisos, borradores };
  return { fijada: a.fijada, tenia: ahora, permisos, borradores };
}

/**
 * La persona eligió el Pokémon `id` (su chip o un clic sobre él): queda fijado. Si ya lo estaba, se suelta (un segundo clic
 * cierra lo que abrió el primero). Un id que no está, o que se está guardando, no cambia nada. `a` ya al día con
 * `vistas`.
 */
export function elegirBurbuja(a: Apertura, id: string, vistas: readonly VistaPokemon[]): Apertura {
  const v = vistas.find((x) => x.id === id);
  if (!v || v.estado === "guardandose") return a;
  if (a.fijada === id) return { ...a, fijada: null, tenia: false };
  return { ...a, fijada: id, tenia: tieneAlgo(v) };
}
