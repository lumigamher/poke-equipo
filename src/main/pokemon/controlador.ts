import { basename } from "node:path";
import { crearLimitador } from "@compartido/limitador";
import { esModeloGuardable, nombreModelo } from "@compartido/modelos";
import { esPalabraDeMando } from "@compartido/nombre";
import { RegistroVivo } from "@compartido/registro-vivo";
import { suenaIgual } from "@compartido/sonido";
import type {
  Actividad,
  ActividadVista,
  AyudanteVista,
  Burbuja,
  ComandoVista,
  PermisoPendiente,
  Pokemon,
  VistaPokemon,
} from "@compartido/tipos";
import type { Contexto, Decision } from "../entrenador/entrenador";
import { aprenderApodos, normalizar } from "../oido/nombres";
import type { Pendiente } from "../sesion/pendientes";
import { separarResumen } from "../sesion/resumen";
import type { EventoSesion, FabricaSesion, Sesion } from "../sesion/sesion";
import { accionLegible, sinVoz } from "./accion-legible";
import { ACTIVIDAD_MS, clasificar, elegirVerbo } from "./actividad";
import { especieAyudante, MAX_AYUDANTES } from "./ayudantes";
import { COMANDOS_LOCALES, leerComando, unirComandos } from "./comandos";
import { CATALOGO, type Especie, elegirEspecie } from "./especies";
import { alterados, type Evento, inicial, type Memoria, TIEMPOS, transicion } from "./maquina";
import { type FichaPokedex, ganaShiny, textoPokedex } from "./pokedex";
import { leerMovimiento, type Movimiento, textoMovimientos } from "./tipos";

export interface Reloj {
  ahora(): number;
  /** Devuelve una función que cancela la tarea. */
  programar(fn: () => void, ms: number): () => void;
}

export interface Dependencias {
  pokemon: Pokemon;
  rol: string;
  equipo: {
    guardarSesion(id: string, sessionId: string | null): void;
    sumarTarea(id: string): void;
    guardarApodos(id: string, apodos: string[]): void;
    /** Etapa 3 (opcionales para no tocar las bases de prueba): Pokédex, shiny y medallas. */
    registrarTarea?(t: {
      pokemonId: string;
      carpeta: string;
      orden: string;
      inicio: number;
      fin: number;
      respuesta?: string;
    }): void;
    marcarShiny?(id: string): void;
    darMedalla?(id: string, texto: string, cuando: number): void;
    pokedex?(): FichaPokedex[];
    /** Guarda su modelo propio (null = el de su tipo): lo que se cambia con /model o el menú sobrevive a reiniciar. */
    guardarModelo?(id: string, modelo: string | null): void;
  };
  crearSesion: FabricaSesion;
  voz: { decir(texto: string, voz: string, velocidad: number): Promise<void>; callar(): void };
  reloj: Reloj;
  /** Azar para elegir el verbo de cada actividad; por defecto `Math.random`. */
  azar?: () => number;
  /**
   * Fuente de ids de borrador. El equipo pasa una común a todos sus Pokémon para que dos nunca compartan el mismo
   * `IdBorrador`; por defecto, un contador propio.
   */
  idBorrador?: () => number;
  alCambiar(v: VistaPokemon): void;
  alSonar(): void;
  alGuardado(): void;
  /** Palabras de mando que el alta no debe aprender como variante del nombre (ver `palabrasReservadas`). */
  reservadas?: string[];
  /** Nombres, apodos y especies de los demás del equipo: el alta tampoco aprende nada que suene a ellos. */
  ajenos?(): string[];
  /** Pide apagar la escucha (la vuelve a encender el atajo, la barra de menú o el clic derecho). */
  alDejarDeEscuchar?(): void;
  /** Modelo de su sesión: el propio si lo tiene y, si no, el de su tipo; sin él, el de la sesión por defecto. */
  modelo?: string;
  /** Se resolvió un cambio de modelo (bien o mal): la barra de menú se rehace para no dejar un radio que no se aplicó. */
  alResolverModelo?(): void;
  /** Sus cuatro movimientos: «usa …» envía el comando de ese movimiento. */
  movimientos?: Movimiento[];
  /** Especies con sprites bajados. */
  especiesDisponibles?(): Especie[];
  /** Guarda la nueva especie y la saca (el Pokémon actual vuelve a su pokébola y sale el otro). */
  alCambiarEspecie?(e: Especie): void;
}

/** Cuánto puede estar un ayudante sin dar señales antes de darlo por terminado. */
export const AYUDANTE_MUDO_MS = 5 * 60_000;

/** El atajo global que pausa y reanuda la escucha; se anuncia tal cual al pausar. */
export const ATAJO_ESCUCHA = "Control + Opción + Espacio";
/** Cuánto se espera el cierre de un turno detenido antes de dejar de esperarlo. */
export const DETENIDA_MAX_MS = 8000;
/** Tecla del dictado (respaldo de la voz): la misma lo abre y lo envía. */
export const ATAJO_DICTADO = "Control+Alt+D";
export const ATAJO_DICTADO_TEXTO = "Control + Opción + D";

const PEDIR_PAUSA =
  /^(deja de escuchar(me)?|para de escuchar(me)?|ya no (me )?escuches|no me escuches|deja de oir(me)?)$/;

/** True si el texto entero (sin nombre ni puntuación) pide dejar de escuchar. */
export function pidePausa(texto: string): boolean {
  return PEDIR_PAUSA.test(normalizar(texto).trim());
}

/**
 * Ventana de envío: cuenta desde que el segmentador ENTREGA el trozo (el VAD ya vio `SILENCIO_FIN_FRASE_S` de silencio
 * tras la voz real) y el texto rápido se muestra; no desde el último sonido. Si al cerrarse hay voz en curso (o un
 * trozo transcribiéndose) el borrador no sale: se retiene (ver `voz`, `transcribiendo`). Presupuesto del fin real de
 * la voz al envío: `SILENCIO_FIN_FRASE_S` (tiempos-voz.ts, 0,5) + ≈0,25 s medidos (bloque de 100 ms + paso rápido) + esta ventana
 * (0,75) ≈ 1,5 s. Antes: 0,6 + 0,25 + 2,5 ≈ 3,4 s. La voz que se reanuda se detecta tras `minSpeechDuration`
 * (`VOZ_MINIMA_S`, tiempos-voz.ts), así que una pausa de hasta ≈1,0 s dentro de la frase se pega en vez de cortarla.
 */
export const BORRADOR_MS = 750;
/**
 * Tope del paso preciso, solo para lo que aún lo exige (permisos, apodos, llamar, guardar, atención): la orden hablada
 * ya no lo espera, sale con el texto rápido. Lo aplica `frases.ts` desde que se oyó la frase.
 */
export const PRECISO_MAX_MS = 8000;
/**
 * Con el borrador retenido, la voz calla: se espera esto antes de enviar por si llega un trozo. Cuenta desde que
 * `voz(false)` llega. El trozo entregado por el VAD llega en ese mismo bloque y `transcribiendo(true)` sigue en el acto,
 * así que un trozo real nunca depende de este plazo (queda retenido por `transcribiendo` hasta tener su texto);
 * si no llega ninguno (tos, ruido de menos de 0,3 s), la orden sale a los 0,5 s en vez de 1,5 s.
 */
export const VOZ_SIN_TROZO_MS = 500;
/** Tope de la retención: voz de fondo que no calla (un video, otra conversación) no deja la orden colgada. */
export const RETENCION_MAX_MS = 10_000;
/** Una orden junta a lo sumo estas partes: más que eso ya no es una frase con pausas sino otra conversación. */
export const MAX_PARTES = 4;
/** Cada cuánto, como mucho, se publica el texto que se va escribiendo (10 por segundo). */
export const VIVO_MS = 100;
/** El alta del menú ("Enseñarle mi voz"): cinco muestras, para afinar un nombre que ya se oye mal. */
export const ALTA_FRASES = 5;
/**
 * El alta que sigue a bautizar (o renombrar): tres. Es un nombre recién elegido y pensado para oírse bien, y
 * `aprenderApodos` ya acepta una variante que se repite (2 de 3) o que se parece mucho al nombre; cinco muestras
 * son unos 25 s hablándole a un Pokémon que casi no conoces. Si aun así falla, "Enseñarle mi voz" hace las cinco.
 */
export const ALTA_FRASES_BAUTIZO = 3;
const CUANTAS = ["", "una", "dos", "tres", "cuatro", "cinco"];
export const ALTA_MS = 30_000;
/** Un aviso se borra solo pasado este tiempo, para que no tape al Pokémon para siempre. */
export const AVISO_MS = 8000;

/** Identifica un borrador abierto con `abrirBorrador`; deja de valer cuando ese borrador se envía o se descarta. */
export type IdBorrador = number;

/** Un trozo de la orden: cada pausa larga al hablar abre una parte nueva. El texto es siempre el del paso rápido. */
interface ParteBorrador {
  texto: string;
}

interface BorradorPendiente {
  id: IdBorrador;
  /** La primera es la de `abrirBorrador`; las demás, las continuaciones. */
  partes: ParteBorrador[];
  /** El plazo pasó con voz en curso: se espera a que calle (y a una posible continuación) antes de enviar. */
  reteniendo: boolean;
  /** Hora (reloj del controlador) en que empezó la retención actual. */
  retenidoDesde: number;
}

const textoDe = (p: BorradorPendiente): string => p.partes.map((x) => x.texto).join(" ");

/** Hasta cuántos nombres caben en un aviso: con la Pokédex entera la burbuja no es una lista. */
const MAX_NOMBRES_AVISO = 12;

/** «Puedo llamar a: A, B, C y 140 más.» (todos si son pocos). */
export function listaDeEspecies(nombres: string[]): string {
  if (nombres.length <= MAX_NOMBRES_AVISO) return `Puedo llamar a: ${nombres.join(", ")}.`;
  return `Puedo llamar a: ${nombres.slice(0, MAX_NOMBRES_AVISO).join(", ")} y ${nombres.length - MAX_NOMBRES_AVISO} más.`;
}

export class Controlador {
  private m: Memoria;
  private sesion: Sesion | null = null;
  private sessionId: string | null;
  private apodos: string[];
  private burbuja: Burbuja | null = null;
  private permisos: PermisoPendiente[] = [];
  private guardado = false;
  /** Identidad de esta instancia para la tubería de frases; otra instancia del mismo Pokémon tiene otra. */
  private readonly ficha: object = {};
  private cancelarBorrador: (() => void) | null = null;
  private pendiente: BorradorPendiente | null = null;
  private borradores = 0;
  /** Hay voz en curso en el micrófono (el segmentador ya empezó una frase y no la ha entregado). */
  private hablando = false;
  /** Hay un trozo ya entregado por el segmentador pero aún sin texto rápido: también puede ser una continuación. */
  private transcribiendoAhora = false;
  private ultimaOrden: string | null = null;
  /** Cuándo salió la orden del turno en curso, y cómo le fue a las pruebas que corrió en él. */
  private ordenDesde = 0;
  private testsTurno = { paso: false, fallo: false };
  private shiny = false;
  private medallas = 0;
  private curando = false;
  private altaRestantes = 0;
  private altaTextos: string[] = [];
  private cancelarAlta: (() => void) | null = null;
  private microfono = true;
  private oidoPausado = false;
  private actividad: ActividadVista | null = null;
  private actividadDesde = 0;
  private actividadPendiente: Actividad | null = null;
  private cancelarActividad: (() => void) | null = null;
  /** Subagentes en curso, en el orden en que salieron. */
  private ayudantes = new Map<string, AyudanteVista>();
  private ayudantesVistos = 0;
  /** Última señal de vida de cada ayudante: uno que calla demasiado se da por terminado. */
  private ayudanteVivo = new Map<string, number>();
  private cancelarAviso: (() => void) | null = null;
  private ultimaRespuesta: string | null = null;
  /** Lo último que pensó o hizo en la tarea en curso; se borra con cada orden nueva. */
  private pensamiento: string | null = null;
  private pasos = 0;
  /** Todo lo que dice, piensa y hace en la tarea en curso (acotado); se borra con cada orden nueva. */
  private registro = new RegistroVivo();
  /** El texto que se va escribiendo llega a pedacitos: se publica como mucho {@link VIVO_MS} una vez. */
  private publicarVivo: ReturnType<typeof crearLimitador>;
  /** La lista de tareas que Claude Code lleva en la tarea en curso. */
  private pendientes: Pendiente[] = [];
  /** Con qué modelo corre ahora (cambia con /model). */
  private modeloActual: string | null = null;
  /** La persona detuvo la tarea: el cierre de ese turno (respuesta o error) ya no se muestra. */
  private detenida = false;
  /** Lo último que se supo del límite de la sesión del plan. */
  private limite: { usado: number; reinicia?: string } | null = null;
  private cancelarDetenida: (() => void) | null = null;
  /** Número de la respuesta cuyo resumen aún se está diciendo; null si ya terminó de hablar. */
  private hablandoRespuesta: number | null = null;
  private respuestas = 0;
  /** La sesión actual se abrió retomando una conversación y aún no ha dicho `iniciada`. */
  private retomando = false;
  /** Fallos seguidos al retomar la misma conversación antes de que diga `iniciada`. */
  private fallosAlRetomar = 0;

  constructor(private d: Dependencias) {
    this.m = inicial(d.reloj.ahora());
    this.publicarVivo = crearLimitador(d.reloj, VIVO_MS, () => this.publicar());
    this.sessionId = d.pokemon.sessionId;
    this.apodos = [...d.pokemon.apodos];
    this.shiny = d.pokemon.shiny === true;
    this.medallas = d.pokemon.medallas ?? 0;
  }

  /** El nombre de su especie si le pusieron uno propio distinto; null si se llama como su especie. */
  private nombreEspecie(): string | null {
    const e = CATALOGO.find((x) => x.especie === this.d.pokemon.especie)?.nombre;
    return e && normalizar(e) !== normalizar(this.d.pokemon.nombre) ? e : null;
  }

  private get id(): string {
    return this.d.pokemon.id;
  }

  /**
   * Aviso que no es una respuesta de Claude (p. ej. equipo lleno): va a la burbuja y se ve en la vista. Con un
   * permiso a la vista no hace nada: la burbuja del permiso no se tapa.
   */
  avisar(texto: string): void {
    if (this.guardado || this.permisos.length > 0) return;
    this.ponerAviso(texto);
    this.publicar();
  }

  /** Su último trabajo, cuando sale de nuevo siendo el mismo (evolución): así un combate todavía tiene qué revisar. */
  recordar(respuesta: string | null): void {
    if (respuesta === null || this.ultimaRespuesta !== null) return;
    this.ultimaRespuesta = respuesta;
    this.publicar();
  }

  iniciar(): void {
    this.abrirSesion();
    this.d.alSonar();
    this.publicar();
  }

  contexto(): Contexto {
    const atento = this.m.estado === "escuchando" && !this.cancelarBorrador;
    const permiso = this.permisos[0];
    return {
      candidatos: [
        {
          id: this.id,
          nombre: this.d.pokemon.nombre,
          apodos: this.apodos,
          // Con nombre propio sigue respondiendo al de su especie ("Pikachu" además de "Rayo").
          alias: this.nombreEspecie() === null ? [] : [this.nombreEspecie() as string],
        },
      ],
      permisosDe: permiso ? [{ id: this.id, permisoId: permiso.id }] : [],
      borradoresDe: this.cancelarBorrador ? [this.id] : [],
      // Sin nombre solo vale justo después de llamarlo ("Pikachu" … "revisa el deploy"); tras una respuesta no:
      // con el micrófono siempre abierto, la conversación de fondo entraba como orden.
      escuchandoA: atento ? this.id : null,
      altaDe: this.altaRestantes > 0 ? this.id : null,
    };
  }

  ejecutar(d: Decision): void {
    if (this.guardado || d.tipo === "ignorar" || d.id !== this.id) return;
    if (d.tipo === "orden") this.orden(d.texto);
    else if (d.tipo === "atencion") this.atender();
    else if (d.tipo === "cancelar") this.cancelar();
    else if (d.tipo === "alta") this.aprender(d.texto, d.rapido);
    else if (d.tipo === "guardar") this.guardar();
    // `llamar` lo resuelve el equipo (saca a otro Pokémon): aquí no hace nada.
    // Un permiso nunca se responde por aquí: solo con `responderPermisoDe` (clic o voz, con los dos ids).
  }

  orden(texto: string, inmediata = false): void {
    if (this.guardado) return;
    if (pidePausa(texto)) {
      this.dejarDeEscuchar();
      return;
    }
    if (!this.sesion || this.permisos.length > 0) return;
    if (normalizar(texto).includes("centro pokemon")) {
      this.curar();
      return;
    }
    this.descartarBorrador();
    if (inmediata) {
      this.enviar(texto);
      return;
    }
    this.abrir(texto);
  }

  /**
   * Muestra de inmediato una orden con el texto rápido y arranca la ventana de envío (BORRADOR_MS): lo que se ve es lo
   * que se envía, sin esperar al paso preciso. Devuelve el asa del borrador, o null si no se abrió (otro Pokémon,
   * guardado, permiso a la vista o "Centro Pokémon").
   */
  abrirBorrador(id: string, texto: string): IdBorrador | null {
    if (this.guardado || id !== this.id) return null;
    if (pidePausa(texto)) {
      this.dejarDeEscuchar();
      return null;
    }
    if (!this.sesion || this.permisos.length > 0) return null;
    if (normalizar(texto).includes("centro pokemon")) {
      this.curar();
      return null;
    }
    this.d.voz.callar();
    return this.abrir(texto);
  }

  private abrir(texto: string): IdBorrador {
    this.descartarBorrador();
    const id = this.d.idBorrador ? this.d.idBorrador() : ++this.borradores;
    this.pendiente = {
      id,
      partes: [{ texto }],
      reteniendo: false,
      retenidoDesde: 0,
    };
    this.aplicar({ tipo: "llamado" });
    this.burbuja = { tipo: "escucha", texto };
    this.cancelarBorrador = this.d.reloj.programar(() => this.vencioBorrador(id), BORRADOR_MS);
    this.publicar();
    return id;
  }

  /** Pasó la ventana del borrador: sale ya, o espera (con tope) a que calle la voz en curso. */
  private vencioBorrador(id: IdBorrador): void {
    const p = this.pendiente;
    if (!p || p.id !== id) return;
    // Con voz en curso lo dicho es solo la primera mitad: no sale hasta que la voz calle y no llegue más.
    if (this.hayActividad()) {
      p.reteniendo = true;
      p.retenidoDesde = this.d.reloj.ahora();
      this.retenerConTope(p);
      return;
    }
    this.salir(p);
  }

  /** Mientras hay voz, solo corre el tope de la retención; al llegar, sale lo que haya. */
  private retenerConTope(p: BorradorPendiente): void {
    const resta = Math.max(0, p.retenidoDesde + RETENCION_MAX_MS - this.d.reloj.ahora());
    const id = p.id;
    this.cancelarBorrador = this.d.reloj.programar(() => {
      if (this.pendiente?.id === id) this.salir(this.pendiente);
    }, resta);
  }

  /** La ventana y la retención ya pasaron: sale lo que se ve. */
  private salir(p: BorradorPendiente): void {
    p.reteniendo = false;
    this.enviar(textoDe(p));
  }

  /** Voz en curso o un trozo aún por transcribir: en ambos casos puede venir una continuación. */
  private hayActividad(): boolean {
    return this.hablando || this.transcribiendoAhora;
  }

  /** El segmentador avisa si hay voz en curso; si calla con un borrador retenido, da VOZ_SIN_TROZO_MS (0,5 s) a que llegue un trozo. */
  voz(hablando: boolean): void {
    this.hablando = hablando;
    this.alCambiarActividad();
  }

  /**
   * El oído avisa si hay trozos entregados por el segmentador esperando su texto rápido. Hasta que llega no se sabe
   * si es una continuación: cuenta como voz, para que la ventana no cierre justo en ese hueco.
   */
  transcribiendo(activo: boolean): void {
    this.transcribiendoAhora = activo;
    const p = this.pendiente;
    // Los trozos entregan su texto antes de este aviso: si ninguno se pegó (p.reteniendo sigue puesto), eran vacíos
    // y no hay continuación en camino; no se espera VOZ_SIN_TROZO_MS por ellos.
    if (!activo && !this.guardado && p?.reteniendo && !this.hablando) {
      this.cancelarBorrador?.();
      this.salir(p);
      return;
    }
    this.alCambiarActividad();
  }

  private alCambiarActividad(): void {
    const p = this.pendiente;
    if (this.guardado || !p || !p.reteniendo) return;
    this.cancelarBorrador?.();
    if (this.hayActividad()) {
      this.retenerConTope(p);
      return;
    }
    const id = p.id;
    this.cancelarBorrador = this.d.reloj.programar(() => {
      if (this.pendiente?.id === id) this.salir(this.pendiente);
    }, VOZ_SIN_TROZO_MS);
  }

  /**
   * Pega al borrador vigente de ese Pokémon la continuación de la frase (llegó sin nombre tras una pausa): suma
   * una parte con su texto rápido y reinicia la ventana. Devuelve el asa de la parte, o null si no hay
   * borrador vigente (guardado, otro Pokémon, permiso a la vista o "Centro Pokémon").
   */
  continuarBorrador(id: string, texto: string): { borrador: IdBorrador; parte: number } | null {
    const p = this.pendiente;
    if (this.guardado || !p || id !== this.id || this.permisos.length > 0) return null;
    if (p.partes.length >= MAX_PARTES) return null;
    p.partes.push({ texto });
    if (normalizar(textoDe(p)).includes("centro pokemon")) {
      this.curar();
      return null;
    }
    this.cancelarBorrador?.();
    p.reteniendo = false;
    this.aplicar({ tipo: "llamado" });
    this.burbuja = { tipo: "escucha", texto: textoDe(p) };
    this.cancelarBorrador = this.d.reloj.programar(() => this.vencioBorrador(p.id), BORRADOR_MS);
    this.publicar();
    return { borrador: p.id, parte: p.partes.length - 1 };
  }

  private descartarBorrador(): void {
    this.cancelarBorrador?.();
    this.cancelarBorrador = null;
    this.pendiente = null;
  }

  /** Cierra la sesión caída y abre una nueva sobre la misma conversación. */
  private reabrir(): void {
    this.sesion?.cerrar();
    this.abrirSesion();
    this.curando = false;
  }

  /** Descarta el borrador si lo hay; si no, calla al Pokémon. */
  cancelar(): void {
    if (this.guardado) return;
    if (!this.cancelarBorrador) {
      this.d.voz.callar();
      return;
    }
    this.descartarBorrador();
    this.burbuja = null;
    this.aplicar({ tipo: "cancelado" });
    this.publicar();
  }

  /** Identidad de esta instancia si `id` es este Pokémon y sigue en pantalla; null si es otro o ya se guardó. */
  instancia(id: string): object | null {
    return this.guardado || id !== this.id ? null : this.ficha;
  }

  /**
   * ÚNICA entrada pública para responder un permiso (voz y clic, siempre a través de EquipoActivo): responde solo si
   * `pokemonId` es este Pokémon y `permisoId` el permiso que se está viendo.
   */
  responderPermisoDe(permitir: boolean, pokemonId: string, permisoId: string): void {
    if (pokemonId !== this.id) return;
    this.responderPermiso(permitir, permisoId);
  }

  /** Responde solo si `id` es el del permiso que se está viendo; no existe respuesta sin id. Privado: ver arriba. */
  private responderPermiso(permitir: boolean, id: string): void {
    const cabeza = this.permisos[0];
    if (this.guardado || !cabeza || !this.sesion) return;
    if (id !== cabeza.id) return;
    this.sesion.resolverPermiso(cabeza.id, permitir);
    this.permisos.shift();
    if (this.permisos.length > 0) {
      this.burbuja = this.burbujaPermiso(this.permisos[0]);
    } else {
      this.burbuja = null;
      this.aplicar({ tipo: "permiso_resuelto" });
    }
    this.publicar();
  }

  reintentar(): void {
    if (this.guardado || this.m.estado !== "error") return;
    this.descartarBorrador();
    const pendiente = this.curando ? null : this.ultimaOrden;
    this.reabrir();
    if (pendiente) this.sesion?.enviar(pendiente);
    this.burbuja = null;
    this.aplicar({ tipo: "reintento", conOrden: pendiente !== null });
    this.publicar();
  }

  /** Centro Pokémon: compacta la conversación para recuperar PS. */
  curar(): void {
    if (this.guardado || !this.sesion || this.permisos.length > 0) return;
    this.descartarBorrador();
    if (this.m.estado === "error") this.reabrir();
    this.curando = true;
    this.ponerAviso("Voy al Centro Pokémon. Ya vuelvo.");
    this.sesion.enviar("/compact");
    this.aplicar({ tipo: "orden_enviada" });
    this.publicar();
  }

  /** Texto escrito en la burbuja: los comandos con barra que atiende la app van aparte; el resto es una orden. */
  comando(texto: string): void {
    const c = leerComando(texto);
    if (!c) {
      this.orden(texto, true);
      return;
    }
    if (c.tipo === "claude") {
      this.orden(c.texto, true);
      return;
    }
    if (this.guardado || !this.sesion) return;
    if (c.tipo === "reiniciar") {
      this.reiniciarSesion();
      return;
    }
    if (c.tipo === "especie") {
      this.cambiarEspecie(c.valor);
      return;
    }
    if (c.tipo === "movimientos") {
      if (this.permisos.length > 0) return;
      this.burbuja = { tipo: "respuesta", texto: textoMovimientos(this.d.movimientos ?? []) };
      this.publicar();
      return;
    }
    if (c.tipo === "pokedex") {
      if (this.permisos.length > 0) return;
      this.burbuja = { tipo: "respuesta", texto: textoPokedex(this.d.equipo.pokedex?.() ?? []) };
      this.publicar();
      return;
    }
    if (c.tipo === "medalla") {
      if (this.permisos.length > 0) return;
      if (!c.texto) {
        this.ponerAviso("Dime por qué: /medalla desplegué Acme a producción.");
      } else {
        this.d.equipo.darMedalla?.(this.id, c.texto, this.d.reloj.ahora());
        this.medallas += 1;
        this.ponerAviso(`¡Medalla ganada! ${c.texto}`);
        this.d.alSonar();
      }
      this.publicar();
      return;
    }
    if (!c.modelo) {
      this.ponerAviso("Dime cuál: /model opus, /model sonnet, /model haiku o /model fable.");
      this.publicar();
      return;
    }
    this.cambiarModelo(c.modelo);
  }

  /**
   * Cambia el modelo de la sesión en curso (/model y el menú) y, si el SDK lo acepta, lo guarda como modelo propio de
   * este Pokémon: al reiniciar la app sigue con él. Si falla, no se guarda nada.
   */
  cambiarModelo(modelo: string): void {
    if (this.guardado || !this.sesion) return;
    const sesion = this.sesion;
    const cambiar = sesion.cambiarModelo?.(modelo) ?? Promise.reject(new Error("sin cambio de modelo"));
    cambiar.then(
      () => {
        // Una elección explícita se guarda siempre (aunque coincida con el tipo); un id desconocido, solo en la sesión viva.
        const guardable = esModeloGuardable(modelo);
        if (this.sesion === sesion) {
          this.modeloActual = modelo;
          if (guardable) this.d.equipo.guardarModelo?.(this.id, modelo);
          this.publicar();
        }
        this.avisoDeSesion(
          sesion,
          guardable
            ? `Listo, ahora uso ${nombreModelo(modelo)}.`
            : `Ahora uso ${modelo}, solo para esta sesión; no lo guardo porque no lo conozco.`,
        );
        this.d.alResolverModelo?.();
      },
      () => {
        this.avisoDeSesion(sesion, `No pude cambiar a ${modelo}.`);
        this.d.alResolverModelo?.();
      },
    );
  }

  /** Con qué modelo corre ahora (el cambiado con /model o el menú, o el del arranque); null si no se fijó ninguno. */
  modelo(): string | null {
    return this.modeloActual ?? this.d.modelo ?? null;
  }

  /**
   * Detiene la tarea en curso: niega lo que estuviera pidiendo (nunca aprueba), interrumpe el turno y queda libre
   * para otra orden. La conversación sigue. No hace nada si no está trabajando ni pidiendo permiso.
   */
  detener(): void {
    if (this.guardado || !this.sesion) return;
    if (this.m.estado !== "trabajando" && this.m.estado !== "pidiendo_permiso") return;
    this.negarPermisos();
    this.sesion.interrumpir?.();
    this.detenida = true;
    this.publicarVivo.cancelar();
    this.cancelarDetenida?.();
    // Si el cierre del turno detenido nunca llega, la marca no se queda esperando la respuesta de otra orden.
    this.cancelarDetenida = this.d.reloj.programar(() => {
      this.cancelarDetenida = null;
      this.detenida = false;
    }, DETENIDA_MAX_MS);
    this.d.voz.callar();
    this.aplicar({ tipo: "turno_ok", pregunta: false });
    this.ponerAviso("Detenido. Dime qué sigue.");
    this.publicar();
  }

  /** True si este cierre de turno es el de la tarea que la persona detuvo: se traga y la marca se limpia. */
  private cierreDeDetenida(): boolean {
    if (!this.detenida) return false;
    this.detenida = false;
    this.cancelarDetenida?.();
    this.cancelarDetenida = null;
    return true;
  }

  /** Un aviso que llega tarde solo se muestra si la sesión que lo pidió sigue siendo la actual. */
  private avisoDeSesion(sesion: Sesion, texto: string): void {
    if (this.guardado || this.sesion !== sesion || this.permisos.length > 0) return;
    this.ponerAviso(texto);
    this.publicar();
  }

  /** Vuelve a su pokébola y sale otra especie; la conversación con Claude Code sigue. */
  private cambiarEspecie(valor: string): void {
    if (this.permisos.length > 0) return;
    if (this.m.estado === "trabajando") {
      this.ponerAviso("Estoy trabajando: cambio cuando termine.");
      this.publicar();
      return;
    }
    const disponibles = this.d.especiesDisponibles?.() ?? [];
    const r = elegirEspecie(valor, disponibles, this.d.pokemon.especie, this.d.azar ?? Math.random);
    if (r.tipo === "aproximada") {
      this.ponerAviso(`No conozco a «${valor.trim()}». ¿Quisiste decir ${r.sugerida.nombre}?`);
      this.publicar();
      return;
    }
    if (r.tipo === "desconocida") {
      this.ponerAviso(
        r.disponibles.length > 0
          ? `${listaDeEspecies(r.disponibles.map((e) => e.nombre))} Escribe /pokemon y el nombre o el número.`
          : "No hay otros Pokémon bajados.",
      );
      this.publicar();
      return;
    }
    if (r.especie.especie === this.d.pokemon.especie) {
      this.ponerAviso(`Ya soy ${r.especie.nombre}.`);
      this.publicar();
      return;
    }
    this.ponerAviso(`¡${this.d.pokemon.nombre}, regresa! ¡Adelante, ${r.especie.nombre}!`);
    this.publicar();
    this.d.alCambiarEspecie?.(r.especie);
  }

  /** Cierra la sesión y abre otra sobre la misma conversación; nunca a medio trabajo ni con un permiso pendiente. */
  private reiniciarSesion(): void {
    if (this.permisos.length > 0) return;
    if (this.m.estado === "trabajando") {
      this.ponerAviso("Estoy trabajando: reinicio cuando termine.");
      this.publicar();
      return;
    }
    this.descartarBorrador();
    this.reabrir();
    this.ponerAviso("Reinicié la sesión y retomé la conversación.");
    this.publicar();
  }

  /** Los comandos que se pueden escribir: los de la app y los que ofrece Claude Code en esta sesión. */
  async comandos(): Promise<ComandoVista[]> {
    let sdk: ComandoVista[] = [];
    try {
      sdk = (await this.sesion?.comandos?.()) ?? [];
    } catch {
      // Sin la lista del SDK se ofrecen solo los de la app.
    }
    return unirComandos(COMANDOS_LOCALES, sdk);
  }

  iniciarAlta(frases = ALTA_FRASES): void {
    if (this.guardado) return;
    this.cancelarAlta?.();
    this.altaRestantes = frases;
    this.altaTextos = [];
    this.ponerAviso(
      `Di "${this.d.pokemon.nombre}" ${CUANTAS[frases] ?? String(frases)} veces, con una pausa entre cada una.`,
    );
    this.cancelarAlta = this.d.reloj.programar(() => this.terminarAlta(), ALTA_MS);
    this.publicar();
  }

  /** Termina el alta sin aprender nada (el botón «Saltar» o la escucha que se apagó): quita su aviso y su marca. */
  saltarAlta(): void {
    if (this.guardado || this.altaRestantes <= 0) return;
    this.cancelarAlta?.();
    this.cancelarAlta = null;
    this.altaRestantes = 0;
    this.altaTextos = [];
    this.cancelarAviso?.();
    this.cancelarAviso = null;
    if (this.burbuja?.tipo === "aviso") this.burbuja = null;
    this.publicar();
  }

  guardar(): void {
    if (!this.sesion || this.m.estado === "guardandose") return;
    this.descartarBorrador();
    this.cancelarAlta?.();
    this.cancelarAviso?.();
    this.cancelarAviso = null;
    this.altaRestantes = 0;
    this.d.voz.callar();
    this.negarPermisos();
    this.soltarActividad();
    this.burbuja = null;
    this.guardado = true;
    this.publicarVivo.cancelar();
    this.aplicar({ tipo: "guardar" });
    this.d.alCambiar(this.vista());
    this.d.reloj.programar(() => {
      this.sesion?.cerrar();
      this.sesion = null;
      this.d.alGuardado();
    }, TIEMPOS.guardarMs);
  }

  /**
   * Salir de la app: cierra la sesión ya, niega lo pendiente y descarta el borrador, sin animación y sin avisar
   * `alGuardado` (el Pokémon sigue activo en la base y vuelve al abrir). Si ya se estaba guardando, ese guardado
   * sigue su curso.
   */
  cerrarSesion(): void {
    this.descartarBorrador();
    this.cancelarAlta?.();
    this.cancelarAlta = null;
    this.cancelarAviso?.();
    this.cancelarAviso = null;
    this.altaRestantes = 0;
    this.soltarActividad();
    this.negarPermisos();
    this.guardado = true;
    this.publicarVivo.cancelar();
    this.sesion?.cerrar();
    this.sesion = null;
  }

  tic(): void {
    this.retirarAyudantesMudos();
    if (this.guardado) return;
    // Mientras sigue diciendo el resumen de su respuesta, el Pokémon no sale de `termino`.
    if (this.m.estado === "termino" && this.hablandoRespuesta !== null) return;
    // Con un borrador pendiente (esperando la voz o a que se cierre la ventana) no se baja a `paseando` ni se borra la burbuja.
    if (this.cancelarBorrador !== null && this.m.estado === "escuchando") return;
    const antes = this.m;
    this.aplicar({ tipo: "tic" });
    if (this.m !== antes) {
      if (this.m.estado === "paseando" && this.burbuja?.tipo === "escucha") this.burbuja = null;
      this.publicar();
    }
  }

  /** Lo pidió la persona: se descarta lo que se venía oyendo, se apaga el oído y se avisa cómo volver. */
  private dejarDeEscuchar(): void {
    this.descartarBorrador();
    this.d.alDejarDeEscuchar?.();
    this.ponerAviso(`Dejo de escuchar. Para volver: ${ATAJO_ESCUCHA}, o clic derecho.`);
    this.publicar();
  }

  /** El oído está en pausa (por la persona): la vista lo muestra junto a la barra de PS. */
  pausarOido(pausado: boolean): void {
    this.oidoPausado = pausado;
    this.publicar();
  }

  ponerMicrofono(disponible: boolean): void {
    this.microfono = disponible;
    this.publicar();
  }

  vista(): VistaPokemon {
    return {
      id: this.id,
      nombre: this.d.pokemon.nombre,
      especie: this.d.pokemon.especie,
      ...(this.nombreEspecie() ? { especieNombre: this.nombreEspecie() as string } : {}),
      alta: this.altaRestantes > 0,
      estado: this.m.estado,
      desde: this.m.desde,
      alterados: alterados(this.m),
      ps: this.m.ps,
      burbuja: this.burbuja,
      permiso: this.permisos[0] ?? null,
      actividad: this.m.estado === "trabajando" ? this.actividad : null,
      ...(this.m.estado === "trabajando" && this.pensamiento ? { pensamiento: this.pensamiento } : {}),
      ...(this.m.estado === "trabajando" && this.pasos > 0 ? { pasos: this.pasos } : {}),
      ...(this.registro.vacio ? {} : { registro: this.registro.vista() }),
      ...(this.m.estado === "trabajando" && this.pendientes.length > 0
        ? { pendientes: this.pendientes }
        : {}),
      proyecto: basename(this.d.pokemon.carpeta),
      ...(this.limite ? { limite: this.limite } : {}),
      ...(this.modelo() ? { modelo: this.modelo() as string } : {}),
      shiny: this.shiny,
      medallas: this.medallas,
      ayudantes: [...this.ayudantes.values()].slice(0, MAX_AYUDANTES),
      microfono: this.microfono,
      oidoPausado: this.oidoPausado,
      borrador: this.cancelarBorrador !== null && this.pendiente ? this.pendiente.id : null,
      ultimaRespuesta: this.ultimaRespuesta,
    };
  }

  private burbujaPermiso(p: PermisoPendiente): Burbuja {
    return { tipo: "aviso", texto: `¿Me dejas usar ${p.herramienta}?` };
  }

  /** Pone un aviso y reinicia sus AVISO_MS: se borra solo, salvo que haya algo más importante a la vista. */
  private ponerAviso(texto: string): void {
    this.burbuja = { tipo: "aviso", texto };
    this.cancelarAviso?.();
    this.cancelarAviso = this.d.reloj.programar(() => {
      this.cancelarAviso = null;
      if (this.guardado || this.burbuja?.tipo !== "aviso") return;
      // Con un error o un permiso a la vista, o a media alta, la burbuja no se toca.
      if (this.m.estado === "error" || this.permisos.length > 0 || this.altaRestantes > 0) return;
      this.burbuja = null;
      this.publicar();
    }, AVISO_MS);
  }

  /** Un permiso nunca se aprueba por tiempo, cierre o error: todos los pendientes se niegan. */
  private negarPermisos(): void {
    for (const p of this.permisos) this.sesion?.resolverPermiso(p.id, false);
    this.permisos = [];
  }

  private atender(): void {
    if (this.guardado) return;
    this.d.voz.callar();
    this.aplicar({ tipo: "llamado" });
    this.burbuja = { tipo: "escucha", texto: "Te escucho." };
    this.publicar();
  }

  /**
   * `rapido`: lo que la transcripción rápida oyó; `texto` puede traer además la forma precisa. Una frase de más
   * de dos palabras es charla de fondo, no el nombre: ni cuenta ni se guarda.
   */
  private aprender(texto: string, rapido?: string): void {
    if (this.altaRestantes <= 0) return;
    if (
      normalizar(rapido ?? texto)
        .split(" ")
        .filter(Boolean).length > 2
    )
      return;
    this.altaTextos.push(texto);
    this.altaRestantes -= 1;
    if (this.altaRestantes === 0) {
      this.terminarAlta();
      return;
    }
    this.ponerAviso(`Te oí. Faltan ${this.altaRestantes}.`);
    this.publicar();
  }

  private terminarAlta(): void {
    this.cancelarAlta?.();
    this.cancelarAlta = null;
    this.altaRestantes = 0;
    // Con un error o un permiso a la vista, el alta termina en silencio y no pisa la burbuja.
    const callado = this.m.estado === "error" || this.permisos.length > 0;
    if (this.altaTextos.length === 0) {
      if (callado) return;
      const texto = "No te escuché decir mi nombre. Intentémoslo otra vez cuando quieras.";
      this.ponerAviso(texto);
      this.publicar();
      void this.d.voz.decir(texto, this.d.pokemon.voz, this.d.pokemon.velocidad);
      return;
    }
    // Lo que se oye una o dos veces no puede volverse una palabra de mando ni el nombre de otro del equipo.
    const ajenos = this.d.ajenos?.() ?? [];
    const nuevos = aprenderApodos(
      this.d.pokemon.nombre,
      this.altaTextos,
      8,
      (v) => esPalabraDeMando(v, this.d.reservadas ?? []) || ajenos.some((a) => suenaIgual(v, a)),
    ).filter((a) => !this.apodos.includes(a));
    this.apodos = [...this.apodos, ...nuevos];
    this.d.equipo.guardarApodos(this.id, this.apodos);
    if (callado) return;
    this.ponerAviso(
      nuevos.length > 0
        ? `Listo. Ahora también respondo a: ${nuevos.join(", ")}.`
        : "Listo. Ya te entiendo bien por mi nombre.",
    );
    this.publicar();
  }

  private abrirSesion(): void {
    const sesion = this.d.crearSesion({
      carpeta: this.d.pokemon.carpeta,
      sessionId: this.sessionId,
      rol: this.d.rol,
      // El efectivo de ahora, no el del arranque: tras /model, /reiniciar o reabrir la sesión nueva sigue con él.
      ...(this.modelo() ? { modelo: this.modelo() as string } : {}),
    });
    this.sesion = sesion;
    this.retomando = this.sessionId !== null;
    sesion.alEvento((e) => {
      if (this.sesion === sesion && !this.guardado) this.deSesion(e);
    });
  }

  private enviar(texto: string): void {
    this.cancelarBorrador?.();
    this.cancelarBorrador = null;
    this.pendiente = null;
    if (this.guardado || this.permisos.length > 0) return;
    if (this.m.estado === "error") this.reabrir();
    // «usa lanzallamas»: sale el comando del movimiento, no las palabras.
    texto = leerMovimiento(texto, this.d.movimientos ?? []) ?? texto;
    this.ultimaOrden = texto;
    this.pensamiento = null;
    this.pasos = 0;
    this.registro.limpiar();
    this.pendientes = [];
    this.ordenDesde = this.d.reloj.ahora();
    this.testsTurno = { paso: false, fallo: false };
    this.curando = false;
    this.sesion?.enviar(texto);
    this.burbuja = { tipo: "escucha", texto };
    this.aplicar({ tipo: "orden_enviada" });
    this.publicar();
  }

  private deSesion(e: EventoSesion): void {
    const { voz, velocidad } = this.d.pokemon;
    switch (e.tipo) {
      case "iniciada":
        this.retomando = false;
        this.fallosAlRetomar = 0;
        this.sessionId = e.sessionId;
        this.d.equipo.guardarSesion(this.id, e.sessionId);
        return;
      case "tests":
        if (e.resultado === "paso") this.testsTurno.paso = true;
        else this.testsTurno.fallo = true;
        this.aplicar(e);
        this.publicar();
        return;
      case "permiso":
        // Un permiso pasa por delante de cualquier borrador: ya no saldría, así que no se queda a la vista.
        if (this.permisos.length === 0) this.descartarBorrador();
        this.permisos.push({ id: e.id, herramienta: e.herramienta, detalle: e.detalle });
        if (this.permisos.length === 1) {
          this.burbuja = this.burbujaPermiso(this.permisos[0]);
          this.aplicar({ tipo: "permiso_pedido" });
          this.publicar();
          void this.d.voz.decir("Necesito tu permiso.", voz, velocidad);
        }
        return;
      case "flujo":
        // Lo que dice y piensa, tal como lo va escribiendo: solo al registro de la burbuja (no se lee en voz alta).
        // Tras Detener, lo que siga llegando de ese turno ya no entra al registro.
        if (this.guardado || this.detenida) return;
        if (e.ayudante !== undefined) {
          const n = [...this.ayudantes.keys()].indexOf(e.ayudante) + 1;
          const dicho = sinVoz(e.texto).replace(/\s+/g, " ").trim();
          if (!dicho) return;
          const corto = dicho.length > 400 ? `${dicho.slice(0, 399)}…` : dicho;
          this.registro.poner(e.clave, "ayudante", `${n > 0 ? `Ayudante ${n}` : "Ayudante"}: ${corto}`);
        } else {
          this.registro.poner(e.clave, e.clase, e.clase === "texto" ? sinVoz(e.texto) : e.texto);
        }
        this.publicarVivo.pedir();
        return;
      case "actividad":
        if (e.ayudante === undefined && e.clase === "herramienta" && !this.guardado && !this.detenida) {
          this.registro.accion(accionLegible(e.herramienta ?? "", e.completo ?? e.detalle));
        }
        // Lo que piensa se ve al instante, sin esperar el turno del verbo.
        if (e.ayudante === undefined && e.detalle && e.detalle !== this.pensamiento && !this.guardado) {
          this.pensamiento = e.detalle;
          if (this.m.estado === "trabajando") this.publicar();
        }
        if (e.ayudante === undefined && e.clase === "herramienta") this.pasos += 1;
        if (e.ayudante === undefined) this.alActividad(clasificar(e));
        else this.alActividadAyudante(e.ayudante, clasificar(e), e.detalle);
        return;
      case "ayudante":
        if (e.fase === "fin") {
          if (this.ayudantes.delete(e.id)) this.publicar();
        } else if (!this.ayudantes.has(e.id) && !this.guardado) {
          this.ayudantes.set(e.id, {
            id: e.id,
            especie: especieAyudante(this.ayudantesVistos++, this.d.pokemon.especie),
            encargo: e.encargo ?? "",
            actividad: null,
          });
          this.ayudanteVivo.set(e.id, this.d.reloj.ahora());
          this.publicar();
        }
        return;
      case "limite":
        this.limite = { usado: e.usado, ...(e.reinicia ? { reinicia: e.reinicia } : {}) };
        this.publicar();
        return;
      case "pendientes":
        this.pendientes = e.lista;
        if (this.m.estado === "trabajando") this.publicar();
        return;
      case "error":
        if (this.cierreDeDetenida()) return;
        // Un permiso pendiente nunca se aprueba por un error: se niega explícitamente.
        this.descartarBorrador();
        this.negarPermisos();
        if (this.retomando) this.fallosAlRetomar += 1;
        // La conversación solo se suelta si Claude Code dice que no existe o si falla dos veces seguidas al
        // retomarla: un tropiezo pasajero (carpeta sin montar, actualización a medias) no debe perderla.
        if (this.retomando && (/no conversation found/i.test(e.mensaje) || this.fallosAlRetomar >= 2)) {
          this.retomando = false;
          this.fallosAlRetomar = 0;
          this.sessionId = null;
          this.d.equipo.guardarSesion(this.id, null);
          this.burbuja = {
            tipo: "error",
            texto: "No pude retomar la conversación anterior. Empezamos una nueva.",
          };
        } else {
          this.burbuja = { tipo: "error", texto: e.mensaje };
        }
        this.aplicar({ tipo: "turno_error" });
        this.publicar();
        return;
      case "respuesta": {
        // Ningún permiso sobrevive al turno que lo pidió: si no, la cola obsoleta bloquearía toda orden.
        this.negarPermisos();
        this.aplicar({ tipo: "contexto", usado: e.contextoUsado });
        if (this.cierreDeDetenida()) {
          this.publicar();
          return;
        }
        if (this.curando) {
          this.curando = false;
          this.ponerAviso("Ya volví del Centro Pokémon, con energía.");
          this.aplicar({ tipo: "turno_ok", pregunta: false });
          this.publicar();
          return;
        }
        const { detalle, voz: resumen } = separarResumen(e.texto);
        this.registro.quitarUltimoTexto(detalle);
        this.publicarVivo.cancelar();
        this.burbuja = { tipo: "respuesta", texto: detalle };
        this.ultimaRespuesta = detalle;
        this.aplicar({ tipo: "turno_ok", pregunta: /\?\s*$/.test(detalle) });
        this.d.equipo.sumarTarea(this.id);
        this.cerrarTarea();
        this.d.alSonar();
        this.publicar();
        const numero = ++this.respuestas;
        this.hablandoRespuesta = numero;
        // Pase lo que pase con la voz (termina, la callan o falla), `termino` deja de retenerse.
        const alTerminar = () => {
          if (this.hablandoRespuesta === numero) this.hablandoRespuesta = null;
        };
        void this.d.voz
          .decir(resumen, voz, velocidad)
          .catch(() => {})
          .finally(() => {
            alTerminar();
            this.tic();
          });
        return;
      }
    }
  }

  private aplicar(e: Evento): void {
    const antes = this.m.estado;
    this.m = transicion(this.m, e, this.d.reloj.ahora());
    if (antes === this.m.estado) return;
    this.soltarActividad();
    // Los ayudantes NO se van al cambiar de estado: un subagente de fondo sigue después de que su Pokémon responde.
    // Se van con su aviso de fin, con un error de la sesión o al guardarse.
    if (this.m.estado === "guardandose" || this.m.estado === "error") this.ayudantes.clear();
    // Cada entrada a `trabajando` arranca pensando, sin pasar por el límite de un segundo.
    this.actividad =
      this.m.estado === "trabajando"
        ? { tipo: "pensando", verbo: elegirVerbo("pensando", this.azar()) }
        : null;
    this.actividadDesde = this.d.reloj.ahora();
  }

  private azar(): () => number {
    return this.d.azar ?? Math.random;
  }

  private ponerActividad(tipo: Actividad): void {
    if (this.actividad?.tipo === tipo) return;
    this.actividad = { tipo, verbo: elegirVerbo(tipo, this.azar()) };
    this.actividadDesde = this.d.reloj.ahora();
    this.publicar();
  }

  /** Un cambio visible por ventana de `ACTIVIDAD_MS`: lo que llega dentro se junta y gana lo último. */
  private alActividad(tipo: Actividad): void {
    if (this.guardado || this.m.estado !== "trabajando") return;
    const falta = this.actividadDesde + ACTIVIDAD_MS - this.d.reloj.ahora();
    if (falta <= 0 && !this.cancelarActividad) {
      this.ponerActividad(tipo);
      return;
    }
    this.actividadPendiente = tipo;
    if (this.cancelarActividad) return;
    this.cancelarActividad = this.d.reloj.programar(
      () => {
        this.cancelarActividad = null;
        const pendiente = this.actividadPendiente;
        this.actividadPendiente = null;
        if (pendiente && !this.guardado && this.m.estado === "trabajando") this.ponerActividad(pendiente);
      },
      Math.max(1, falta),
    );
  }

  /**
   * Un subagente de fondo solo termina con su aviso; si ese aviso nunca llega, no se queda dibujado para siempre:
   * tras AYUDANTE_MUDO_MS sin dar señales se retira.
   */
  private retirarAyudantesMudos(): void {
    const ahora = this.d.reloj.ahora();
    let cambio = false;
    for (const id of [...this.ayudantes.keys()]) {
      if (ahora - (this.ayudanteVivo.get(id) ?? ahora) < AYUDANTE_MUDO_MS) continue;
      this.ayudantes.delete(id);
      cambio = true;
    }
    for (const id of [...this.ayudanteVivo.keys()]) if (!this.ayudantes.has(id)) this.ayudanteVivo.delete(id);
    if (cambio) this.publicar();
  }

  /** Lo que hace un subagente: cambia su rótulo solo cuando cambia de tipo de actividad. */
  private alActividadAyudante(id: string, tipo: Actividad, detalle?: string): void {
    const ayudante = this.ayudantes.get(id);
    if (ayudante) this.ayudanteVivo.set(id, this.d.reloj.ahora());
    if (!ayudante) return;
    const mismoVerbo = ayudante.actividad?.tipo === tipo;
    const nuevoDetalle = detalle ?? ayudante.detalle;
    if (mismoVerbo && nuevoDetalle === ayudante.detalle) return;
    this.ayudantes.set(id, {
      ...ayudante,
      actividad: mismoVerbo ? ayudante.actividad : { tipo, verbo: elegirVerbo(tipo, this.azar()) },
      ...(nuevoDetalle ? { detalle: nuevoDetalle } : {}),
    });
    this.publicar();
  }

  /** La tarea que acaba de terminar entra a la Pokédex; con las pruebas en verde a la primera, se vuelve shiny. */
  private cerrarTarea(): void {
    if (this.ultimaOrden !== null) {
      this.d.equipo.registrarTarea?.({
        pokemonId: this.id,
        carpeta: this.d.pokemon.carpeta,
        orden: this.ultimaOrden,
        inicio: this.ordenDesde,
        fin: this.d.reloj.ahora(),
        respuesta: this.ultimaRespuesta ?? "",
      });
    }
    if (!this.shiny && ganaShiny(this.testsTurno)) {
      this.shiny = true;
      this.d.equipo.marcarShiny?.(this.id);
    }
    this.testsTurno = { paso: false, fallo: false };
  }

  private soltarActividad(): void {
    this.cancelarActividad?.();
    this.cancelarActividad = null;
    this.actividadPendiente = null;
  }

  private publicar(): void {
    if (this.guardado) return;
    this.d.alCambiar(this.vista());
  }
}
