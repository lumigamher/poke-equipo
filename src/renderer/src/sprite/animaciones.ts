import type { DatosAnim, Estado } from "@compartido/tipos";

/** `frente-*` es de tres cuartos: mira hacia un lado sin dar la espalda ni esconder la cara. */
export type Direccion = "derecha" | "izquierda" | "frente" | "frente-derecha" | "frente-izquierda";

export interface Pose {
  anim: string;
  bucle: boolean;
  /** Mira al frente en vez de hacia donde camina. */
  frente: boolean;
  /** Píxeles que avanza por cuadro de pantalla; 0 si no camina. */
  paso: number;
}

export const POSES: Record<Estado, Pose> = {
  saliendo: { anim: "Hop", bucle: false, frente: true, paso: 0 },
  paseando: { anim: "Walk", bucle: true, frente: false, paso: 0.8 },
  escuchando: { anim: "Nod", bucle: true, frente: true, paso: 0 },
  trabajando: { anim: "Charge", bucle: true, frente: true, paso: 0 },
  pidiendo_permiso: { anim: "Hop", bucle: true, frente: true, paso: 0 },
  termino: { anim: "Pose", bucle: true, frente: true, paso: 0 },
  esperando: { anim: "Idle", bucle: true, frente: true, paso: 0 },
  cansado: { anim: "Walk", bucle: true, frente: false, paso: 0.3 },
  dormido: { anim: "Sleep", bucle: true, frente: true, paso: 0 },
  error: { anim: "Pain", bucle: true, frente: true, paso: 0 },
  guardandose: { anim: "Hop", bucle: false, frente: true, paso: 0 },
};

/** Lo que hace en su sitio cuando su estado es de caminar pero no se desplaza: lo mismo que al esperar. */
const REPOSO: Pose = POSES.esperando;

/**
 * La pose de su estado, salvo que sea de caminar y no se esté desplazando (la persona lo dejó quieto, o algo lo tiene
 * parado): entonces reposa.
 */
export function poseDe(estado: Estado, quieto: boolean): Pose {
  const pose = POSES[estado];
  return quieto && pose.paso > 0 ? REPOSO : pose;
}

/** Qué usar cuando la especie no trae la animación pedida (Psyduck y Snorlax traen pocas), antes de caer en Idle. */
const ALTERNAS: Record<string, string[]> = {
  Pain: ["Hurt"],
  Pose: ["Hop"],
  Nod: ["Idle"],
  Wake: ["Hop"],
  HitGround: ["Trip", "Hurt"],
};

export function elegirAnim(pose: Pose, disponibles: Record<string, DatosAnim>): string | null {
  for (const nombre of [pose.anim, ...(ALTERNAS[pose.anim] ?? []), "Idle", "Walk"]) {
    if (disponibles[nombre]) return nombre;
  }
  return Object.keys(disponibles)[0] ?? null;
}

/** Tic de animación (1/60 s) que corresponde al instante `ahoraMs`; no depende de cuántos cuadros pinta la pantalla. */
export function ticEn(ahoraMs: number, inicioMs: number): number {
  return Math.max(0, Math.floor(((ahoraMs - inicioMs) * 60) / 1000));
}

/** Las duraciones vienen en tics de 1/60 de segundo. */
export function cuadroEn(d: DatosAnim, tic: number, bucle: boolean): number {
  const total = d.duraciones.reduce((s, n) => s + n, 0);
  if (total === 0) return 0;
  let t = bucle ? tic % total : Math.min(tic, total - 1);
  for (let i = 0; i < d.duraciones.length; i++) {
    if (t < d.duraciones[i]) return i;
    t -= d.duraciones[i];
  }
  return d.duraciones.length - 1;
}

export function filaPara(d: DatosAnim, dir: Direccion): number {
  if (d.filas < 8) return 0;
  // Orden de las hojas PMD: abajo, abajo-derecha, derecha, arriba-derecha, arriba, arriba-izquierda, izquierda, abajo-izquierda.
  if (dir === "frente-derecha") return 1;
  if (dir === "derecha") return 2;
  if (dir === "izquierda") return 6;
  if (dir === "frente-izquierda") return 7;
  return 0;
}

/** Filas totalmente transparentes al pie de una región (varios cuadros lado a lado); 0 si está vacía. */
export function margenInferior(alfa: Uint8ClampedArray | number[], ancho: number, alto: number): number {
  for (let y = alto - 1; y >= 0; y--) {
    for (let x = 0; x < ancho; x++) if (alfa[y * ancho + x] > 0) return alto - 1 - y;
  }
  return 0;
}

/** Filas totalmente transparentes arriba de una región (varios cuadros lado a lado); 0 si está vacía. */
export function margenSuperior(alfa: Uint8ClampedArray | number[], ancho: number, alto: number): number {
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) if (alfa[y * ancho + x] > 0) return y;
  }
  return 0;
}

const TIC_MS = 1000 / 60;

/** Un paso del paseo. `paso` son píxeles por 1/60 s; `ancho` es el recorrido caminable. */
export function avanzar(
  x: number,
  sentido: 1 | -1,
  paso: number,
  dtMs: number,
  ancho: number,
): { x: number; sentido: 1 | -1 } {
  if (ancho <= 0) return { x: 0, sentido };
  const dt = Math.min(Math.max(dtMs, 0), 100);
  const siguiente = x + sentido * paso * (dt / TIC_MS);
  if (siguiente >= ancho) return { x: ancho, sentido: -1 };
  if (siguiente <= 0) return { x: 0, sentido: 1 };
  return { x: siguiente, sentido };
}

/**
 * Al pasar el cursor por encima solo se detiene y espera, tranquilo, a ver si le escriben o le hablan: nada de
 * saltos ni vueltas (a la persona le resultaban bruscos y al azar).
 */
export const REACCIONES = ["Idle"];
/** Lo que hace solo al pasear, de vez en cuando: gestos calmados, de poco movimiento. Sin giros ni volteretas. */
export const TRAVESURAS = ["Pose", "Nod", "Idle", "DeepBreath", "Laying"];

/**
 * Elige al azar entre las opciones que la especie tiene, sin repetir la anterior (salvo que no haya otra).
 * null si no hay ninguna disponible.
 */
export function elegirSinRepetir(
  opciones: string[],
  disponibles: Record<string, DatosAnim>,
  anterior: string | null,
  azar: () => number,
): string | null {
  const validas = opciones.filter((o) => disponibles[o]);
  if (validas.length === 0) return null;
  const otras = validas.length > 1 ? validas.filter((o) => o !== anterior) : validas;
  return otras[Math.min(otras.length - 1, Math.floor(azar() * otras.length))];
}

/** Colgado del cursor: perder el equilibrio es lo que más se lee como "me llevan en el aire"; Hurt es el comodín. */
export const COLGADO = ["LostBalance", "Cringe", "Hurt"];
/** Al soltarlo: cae de costado, o tropieza, o se queja (la caída de 300 ms con rebote es del CSS). */
export const ATERRIZAJE = ["HitGround", "Trip", "Hurt"];

/**
 * La animación de estar colgado mientras la persona lo arrastra, o null si debe quedarse con la suya (no está en el aire,
 * trabaja o se guarda, pide menos movimiento o la especie no trae ninguna).
 */
export function animColgado(
  estado: Estado,
  alzado: boolean,
  reducido: boolean,
  disponibles: Record<string, DatosAnim>,
): string | null {
  if (!alzado || reducido || estado === "trabajando" || estado === "guardandose") return null;
  return COLGADO.find((n) => disponibles[n]) ?? null;
}
