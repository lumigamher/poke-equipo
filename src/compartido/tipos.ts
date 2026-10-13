import type { InicialVista } from "./inicial";
import type { AccionPreparacion, EstadoPreparacion } from "./preparacion";
import type { VistaRegistro } from "./registro-vivo";

export const ESTADOS = [
  "saliendo",
  "paseando",
  "escuchando",
  "trabajando",
  "pidiendo_permiso",
  "termino",
  "esperando",
  "cansado",
  "dormido",
  "error",
  "guardandose",
] as const;
export type Estado = (typeof ESTADOS)[number];

export type Alterado = "confundido" | "paralizado" | "envenenado" | "dormido";

export interface Burbuja {
  tipo: "escucha" | "respuesta" | "error" | "aviso";
  texto: string;
}

export interface PermisoPendiente {
  id: string;
  herramienta: string;
  detalle: string;
}

/** Lo que el Escenario necesita para dibujar al Pokémon. */
export const ACTIVIDADES = [
  "programando",
  "pensando",
  "planeando",
  "leyendo",
  "buscando",
  "ejecutando",
  "probando",
  "explorando",
  "delegando",
  "publicando",
  "herramienta",
  "respondiendo",
] as const;
export type Actividad = (typeof ACTIVIDADES)[number];

export interface ActividadVista {
  tipo: Actividad;
  /** Verbo corto en español que se muestra sobre el Pokémon. */
  verbo: string;
}

/** Un subagente del Pokémon, dibujado como un Pokémon ayudante a su lado mientras trabaja. */
export interface AyudanteVista {
  id: string;
  especie: number;
  /** Lo que le encargaron, en pocas palabras; vacío si no se sabe. */
  encargo: string;
  actividad: ActividadVista | null;
  /** Lo último que pensó o está ejecutando, en una línea. */
  detalle?: string;
}

export interface VistaPokemon {
  id: string;
  nombre: string;
  especie: number;
  /** El nombre de su especie, solo si la persona le puso uno propio distinto (la ficha muestra las dos). */
  especieNombre?: string;
  /** Está aprendiendo cómo suena su nombre (alta por voz): el recorrido espera a que termine. */
  alta?: boolean;
  estado: Estado;
  /** Marca de tiempo (ms) en que entró al estado actual. */
  desde: number;
  alterados: Alterado[];
  /** Puntos de salud: contexto restante de la sesión, de 0 a 100. */
  ps: number;
  burbuja: Burbuja | null;
  permiso: PermisoPendiente | null;
  /** Qué hace Claude Code ahora mismo; solo mientras el estado es `trabajando`. */
  actividad: ActividadVista | null;
  /** Lo último que pensó, dijo o está ejecutando, en una línea; solo mientras trabaja. */
  pensamiento?: string;
  /** Cuántas herramientas ha usado en la tarea en curso: se ve que avanza. */
  pasos?: number;
  /** La lista de tareas que Claude Code lleva en esta tarea, con lo hecho y lo que falta. */
  pendientes?: { texto: string; estado: "pendiente" | "en_curso" | "hecha" }[];
  /**
   * Todo lo que hace en la tarea en curso (y en la última, hasta la siguiente orden): lo que dice y piensa, acciones.
   * Acotado (ver `registro-vivo`). Solo viaja en la vista de la burbuja abierta.
   */
  registro?: VistaRegistro;
  /** En qué carpeta trabaja (solo el nombre) y con qué modelo. */
  proyecto?: string;
  modelo?: string;
  /** Cuánto va usado del límite de la sesión del plan (ventana de 5 horas), de 0 a 100, y cuándo se reinicia. */
  limite?: { usado: number; reinicia?: string };
  /** Respondió algo que la persona todavía no ha abierto. Lo marca el equipo. */
  sinLeer?: boolean;
  /** La persona le pidió quedarse quieto donde está (no pasea). Lo marca el proceso principal. */
  quieto?: boolean;
  /** Texto más grande en burbujas y rótulos (preferencia de la persona, igual para todos). */
  textoGrande?: boolean;
  /** La persona aún no ha hecho (o pidió repetir) el recorrido de la primera vez. Lo marca el proceso principal. */
  recorrido?: boolean;
  /** Brillante: usa los sprites shiny de su especie. */
  shiny?: boolean;
  /** Medallas que le ha dado la persona. */
  medallas?: number;
  /**
   * Está en un combate de revisión: el retador revisa el último trabajo del defensor. Lo marca el equipo. Al
   * terminar, `resultado` dice quién ganó (el veredicto) durante unos segundos.
   */
  combate?: { rivalId: string; papel: "retador" | "defensor"; resultado?: "gana" | "pierde" };
  /** Sus subagentes en curso (pueden seguir de fondo después de que él responde). Opcional para no tocar las vistas de las pruebas. */
  ayudantes?: AyudanteVista[];
  microfono: boolean;
  /** La persona pausó la escucha; opcional para no tocar las vistas de las pruebas. */
  oidoPausado?: boolean;
  /**
   * Id (IdBorrador) de la orden hablada que espera su plazo para enviarse (se puede ver y cancelar); null si no hay.
   * Sale de un contador compartido por todo el equipo y siempre creciente: mayor = abierto después.
   */
  borrador: number | null;
  /** Texto completo de la última respuesta de Claude Code; solo en memoria. */
  ultimaRespuesta: string | null;
  /**
   * Su burbuja es LA abierta (como mucho una). La marca el proceso principal con `burbujaAbierta` antes de enviar;
   * el renderer solo la lee. Sin marcar (undefined) cuenta como cerrada: la voz no responde su permiso.
   */
  abierta?: boolean;
}

/** Un Pokémon tal como se guarda en la base. */
export interface Pokemon {
  id: string;
  nombre: string;
  especie: number;
  /** Carpeta del modelo de voz dentro de models/. */
  voz: string;
  velocidad: number;
  carpeta: string;
  sessionId: string | null;
  apodos: string[];
  tareas: number;
  /** true = en pantalla; false = guardado en el PC de Bill. */
  activo: boolean;
  /** Brillante: terminó una tarea con las pruebas en verde a la primera. */
  shiny?: boolean;
  /** Medallas que le ha dado la persona. */
  medallas?: number;
  /** Su modelo propio (elegido en el laboratorio, el menú o con /model); nulo = el de su tipo. */
  modelo?: string | null;
}

export interface Audio {
  muestras: Float32Array;
  frecuencia: number;
}

export interface DatosAnim {
  ancho: number;
  alto: number;
  duraciones: number[];
  filas: number;
  /** Cuadro en que un ataque conecta; solo lo traen las animaciones de ataque. */
  golpe?: number;
}

export const CANALES = {
  /** Lleva `VistaPokemon[]`: una por Pokémon en pantalla (vacía si no hay ninguno). */
  vista: "poke:vista",
  anims: "poke:anims",
  audioEntrada: "poke:audio-entrada",
  microfonoEstado: "poke:microfono-estado",
  microfonoOrden: "poke:microfono-orden",
  reproducir: "poke:reproducir",
  detener: "poke:detener",
  reproduccionFin: "poke:reproduccion-fin",
  sonar: "poke:sonar",
  ignorarMouse: "poke:ignorar-mouse",
  clic: "poke:clic",
  menu: "poke:menu",
  permiso: "poke:permiso",
  reintentar: "poke:reintentar",
  escribir: "poke:escribir",
  enfocar: "poke:enfocar",
  pedirVista: "poke:pedir-vista",
  comandos: "poke:comandos",
  /** Lleva `{ pokemonId }`: la persona eligió la burbuja de ese Pokémon (su chip o un clic sobre él). */
  elegir: "poke:elegir",
  /** Lleva `{ pokemonId }`: detener la tarea en curso de ese Pokémon. Nunca aprueba nada. */
  detenerTarea: "poke:detener-tarea",
  /** Pide (`{ pokemonId }`) los últimos intercambios de ese Pokémon. */
  historial: "poke:historial",
  /** Lleva un `EstadoOido`: qué está haciendo el oído ahora mismo. */
  oido: "poke:oido",
  /** Lleva un texto para copiar al portapapeles. */
  copiar: "poke:copiar",
  /** Lleva "fin" (terminó o saltó el recorrido) o "repetir" (lo pide otra vez desde la ayuda). */
  recorrido: "poke:recorrido",
  /** Main → renderer: lleva una `OrdenLaboratorio` (abrir, volver a la elección o cerrar el laboratorio de la primera vez). */
  laboratorio: "poke:laboratorio",
  /** Renderer → main: pide que le reenvíe la orden vigente del laboratorio (por si salió antes de que escuchara). */
  pedirLaboratorio: "poke:pedir-laboratorio",
  /** Renderer → main: lleva una `RespuestaLaboratorio` (la especie elegida, o salir). */
  inicial: "poke:inicial",
  /** Renderer → main: el laboratorio ya está pintado y a la vista (solo entonces la ventana toma el ratón). */
  labListo: "poke:lab-listo",
  /** Renderer → main: el laboratorio falló al dibujarse; main suelta la ventana. */
  labFallo: "poke:lab-fallo",
  /** Renderer → main: lleva `{ especie, eleccion? }` de una especie de la Pokédex del laboratorio que aún no está bajada; main la baja con prioridad. */
  pedirEspecie: "poke:pedir-especie",
  /** Main → renderer: lleva una `Llegada` (`{ especie, ok }`): esa especie terminó de bajarse o no se pudo. */
  especieLab: "poke:especie-lab",
  /** Main → renderer: lleva `{ pokemonId, texto }`, lo que se escribe de entrada en el campo de esa burbuja. */
  prellenar: "poke:prellenar",
  /** Main → renderer: terminó una carga; que vuelva a enviar su valor actual de captura del ratón. */
  reenviarCaptura: "poke:reenviar-captura",
  /** Renderer → main: lleva `{ pokemonId }`; salta el alta de voz de ese Pokémon (no aprende nada). */
  saltarAlta: "poke:saltar-alta",
  /** Main → renderer de la pantalla de preparación: lleva un `EstadoPreparacion`. */
  preparacion: "poke:preparacion",
  /** Renderer → main: pide el estado vigente de la preparación (por si salió antes de que escuchara). */
  pedirPreparacion: "poke:pedir-preparacion",
  /** Renderer → main: lleva una `AccionPreparacion` ("empezar", "cancelar" o "salir"). */
  accionPreparacion: "poke:accion-preparacion",
} as const;

/** Lo que el laboratorio necesita para validar el nombre mientras se escribe (main lo vuelve a comprobar al recibirlo). */
export interface NombresLab {
  /** Palabras de mando, modelos y glosario (ver `palabrasReservadas`). */
  reservadas: string[];
  /** Las de permiso y mando (ver `palabrasDeMando`). */
  mando: string[];
  /** Todas las especies del catálogo: el laboratorio quita la elegida (su nombre se puede dejar). */
  especies: { especie: number; nombre: string }[];
}

/** Lo que main le pide al laboratorio de la primera vez. `abrir` trae los Pokémon que se ofrecen. */
export type OrdenLaboratorio =
  | {
      tipo: "abrir";
      iniciales: InicialVista[];
      /** Las 151 de la Pokédex de Kanto (el huevo de pascua), estén o no bajadas; vacía = sin esa opción. */
      otras: InicialVista[];
      /** Las especies (de las cuatro y de `otras`) que ya tienen sus hojas y su grito en disco al abrir. */
      listas: number[];
      nombres: NombresLab;
    }
  | { tipo: "volver" }
  /** Ya eligió y dio la carpeta: la tarjeta final queda a la vista, sin recibir clics, mientras carga el equipo. */
  | { tipo: "preparando" }
  | { tipo: "cerrar" };

/** Lo que el laboratorio le dice a main: la especie elegida con su nombre (main pide la carpeta) o cerrar la app. */
export type RespuestaLaboratorio =
  | { tipo: "elegida"; especie: number; nombre: string; modelo: string }
  | { tipo: "salir" };

/** Un comando con barra que se puede escribir en la burbuja. */
export interface ComandoVista {
  nombre: string;
  descripcion: string;
  argumento: string;
}

/** Qué hace el oído: espera un nombre, oye voz, la está transcribiendo o está en dictado. */
export type EstadoOido = "atento" | "oyendo" | "transcribiendo" | "dictando";

/** Un intercambio guardado: lo que la persona pidió y lo que el Pokémon respondió. */
export interface Intercambio {
  orden: string;
  respuesta: string;
  /** Cuándo terminó (ms). */
  fin: number;
}

/** Lo que el preload expone al Escenario como `window.poke`. */
export interface PuentePoke {
  alVista(fn: (vistas: VistaPokemon[]) => void): void;
  /** Pide la vista actual; main responde por el canal de la vista. Evita perder la primera. */
  pedirVista(): void;
  anims(especie: number): Promise<Record<string, DatosAnim>>;
  /** `t`: Date.now() sellado dentro del worklet de audio al completarse el bloque de 100 ms. */
  audioEntrada(bloque: { muestras: Float32Array; t: number }): void;
  microfonoEstado(disponible: boolean): void;
  alMicrofonoOrden(fn: (encendido: boolean) => void): void;
  alReproducir(fn: (a: { id: number; muestras: Float32Array; frecuencia: number }) => void): void;
  alDetener(fn: () => void): void;
  reproduccionFin(id: number): void;
  alSonar(fn: (url: string) => void): void;
  ignorarMouse(ignorar: boolean): void;
  clic(): void;
  menu(pokemonId: string): void;
  /** Responde el permiso `permisoId` de ESE Pokémon; un clic nunca responde el de otro. */
  permiso(pokemonId: string, permisoId: string, permitir: boolean): void;
  reintentar(pokemonId: string): void;
  escribir(pokemonId: string, texto: string): void;
  enfocar(enfocar: boolean): void;
  /** Los comandos con barra disponibles para ese Pokémon (los de la app y los de Claude Code). */
  comandos(pokemonId: string): Promise<ComandoVista[]>;
  /** Detiene la tarea en curso de ese Pokémon; la conversación sigue. */
  detener(pokemonId: string): void;
  /** Los últimos intercambios de ese Pokémon, del más reciente al más viejo. */
  historial(pokemonId: string): Promise<Intercambio[]>;
  alOido(fn: (estado: EstadoOido) => void): void;
  copiar(texto: string): void;
  /** Cierra el recorrido de la primera vez ("fin") o lo vuelve a empezar ("repetir"). */
  recorrido(accion: "fin" | "repetir"): void;
  /** Laboratorio de la primera vez: escucha las órdenes de main, pide la vigente y responde con la elección. */
  alLaboratorio(fn: (orden: OrdenLaboratorio) => void): void;
  pedirLaboratorio(): void;
  inicial(respuesta: RespuestaLaboratorio): void;
  /** Pide que main baje ya esta especie de la Pokédex (si falta). Main solo acepta las que ofrece. */
  pedirEspecie(especie: number, eleccion: boolean): void;
  /** Main avisa de que una especie terminó de bajarse o no se pudo (llega al laboratorio abierto, sin recargar). */
  alEspecieLab(fn: (llegada: unknown) => void): void;
  /** El laboratorio ya se ve (main le da entonces el ratón y el teclado). */
  labListo(): void;
  /** El laboratorio falló al dibujarse: main suelta la ventana. */
  labFallo(): void;
  /** Pide que la burbuja de ese Pokémon sea la abierta (o la suelta si ya lo era). Decide el proceso principal. */
  elegir(pokemonId: string): void;
  /** Salta el alta de voz (el Pokémon aprendiendo cómo suena su nombre). */
  saltarAlta(pokemonId: string): void;
  /** Pantalla "Preparando a tu equipo": escucha los estados, pide el vigente y manda lo que la persona decide. */
  alPreparacion(fn: (estado: EstadoPreparacion) => void): void;
  pedirPreparacion(): void;
  accionPreparacion(accion: AccionPreparacion): void;
  /** Main pide dejar escrito un texto en el campo de esa burbuja (p. ej. "/nombre " desde "Cambiar nombre…"). */
  /** Main terminó una carga y olvidó lo pedido: hay que volver a enviar `ignorarMouse` con el valor actual. */
  alReenviarCaptura(fn: () => void): () => void;
  alPrellenar(fn: (p: { pokemonId: string; texto: string }) => void): void;
}
