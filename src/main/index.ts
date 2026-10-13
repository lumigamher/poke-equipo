import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { inicialesVista, otrasVista } from "@compartido/inicial";
import { modeloEfectivo } from "@compartido/modelos";
import { validarNombre } from "@compartido/nombre";
import { tipoDe } from "@compartido/tipo-especie";
import { CANALES, type OrdenLaboratorio, type VistaPokemon } from "@compartido/tipos";
import { app, clipboard, dialog, globalShortcut, ipcMain, Menu, session, systemPreferences } from "electron";
import { crearGestor } from "../descarga/gestor";
import type { ModeloRemoto } from "../descarga/modelos";
import { crearBandeja, crearBandejaSalir } from "./bandeja";
import { entradasBandeja, submenuModelo } from "./bandeja-plantilla";
import {
  crearEntrada,
  crearPuertaLab,
  type EmisorWeb,
  registrarPrevios,
  vigilarPrimeraVez,
  vigilarRespuesta,
} from "./canales-previos";
import { type DepsDialogo, elegirCarpeta } from "./dialogo-carpeta";
import { palabrasDeMando, palabrasReservadas } from "./entrenador/entrenador";
import { type DatosNuevos, Equipo } from "./equipo/equipo";
import { validarBloqueAudio } from "./oido/bloque-audio";
import { normalizar as normalizarNombre } from "./oido/nombres";
import { crearClientePreciso } from "./oido/preciso";
import { lanzarProcesoPreciso } from "./oido/preciso-electron";
import { crearSegmentador } from "./oido/sherpa";
import type { ModeloTranscriptor } from "./oido/transcriptor";
import { especiesDeFondo, pasoDeEspecieCatalogo, pasosMinimos } from "./pasos-arranque";
import { crearCableadoVoz } from "./pokemon/cableado-voz";
import {
  ATAJO_DICTADO,
  ATAJO_DICTADO_TEXTO,
  ATAJO_ESCUCHA,
  Controlador,
  type Reloj,
} from "./pokemon/controlador";
import { EquipoActivo, textoLlamada } from "./pokemon/equipo-activo";
import { resolverExacta } from "./pokemon/especie-oida";
import { CATALOGO } from "./pokemon/especies";
import { validarRespuestaPermiso } from "./pokemon/guardia-permiso";
import { movimientosDe, nombresDeMovimientos, validarConfigTipos } from "./pokemon/tipos";
import { elegirVoz, validarConfigVoces } from "./pokemon/voces";
import { alternarQuieto, guardarPreferencias, leerPreferencias, type Preferencias } from "./preferencias";
import { prepararPrimerArranque, traerPreparacionAlFrente } from "./preparacion-ventana";
import { primeraVez, type RespuestaLab, validarPedidoEspecie, validarRespuestaLab } from "./primera-vez";
import { atenderRecursos, carpetaEspecie, especieEnDisco, leerAnims, registrarEsquema } from "./recursos";
import { RUTAS } from "./rutas";
import { SesionClaude } from "./sesion/claude";
import { diagnosticarClaude, mensajeDeDiagnostico, rutaClaudeIncluido } from "./sesion/claude-incluido";
import { hayCredencialesClaudeReal } from "./sesion/credenciales";
import { ampliarPath } from "./sesion/entorno";
import { construirRol } from "./sesion/resumen";
import { apartarEscena, crearVentana } from "./ventana";
import { crearReproductor } from "./voz/puente";
import { crearSintetizador } from "./voz/sherpa";
import { Voz } from "./voz/voz";

// El esquema poke:// se registra antes de que la app esté lista.
registrarEsquema();

/** Mientras la pantalla de preparación se abre y se cierra no hay otra ventana: eso no es "cerraron todo". */
let preparando = false;

const TIC_MS = 500;
/** Plazo máximo de la tarjeta "se une a tu equipo" mientras carga el equipo. */
const PLAZO_DESPEDIDA_MS = 20_000;
/** Cuánto se espera el aviso de "laboratorio a la vista" antes de dejarlo registrado. */
const ESPERA_LABORATORIO_MS = 15_000;

const leer = <T>(archivo: string): T => JSON.parse(readFileSync(join(RUTAS.config, archivo), "utf8")) as T;

/** Términos propios de quien usa la app; si el archivo falta o no es una lista de textos, se ignora. */
function leerGlosarioPersonal(ruta: string): string[] {
  try {
    const datos: unknown = JSON.parse(readFileSync(ruta, "utf8"));
    return Array.isArray(datos)
      ? datos.filter((t): t is string => typeof t === "string" && t.trim() !== "")
      : [];
  } catch {
    return [];
  }
}

/** Reloj real. Guarda las tareas pendientes para poder cancelarlas todas al salir. */
const pendientes = new Set<() => void>();
const reloj: Reloj = {
  ahora: () => Date.now(),
  programar(fn, ms) {
    const cancelar = () => {
      clearTimeout(t);
      pendientes.delete(cancelar);
    };
    const t = setTimeout(() => {
      pendientes.delete(cancelar);
      fn();
    }, ms);
    pendientes.add(cancelar);
    return cancelar;
  },
};
/** Un solo contador de borradores para todo el proceso: el id de un borrador dice de qué Pokémon es. */
let siguienteBorrador = 0;
const idBorradorCompartido = () => ++siguienteBorrador;

const esTexto = (v: unknown): v is string => typeof v === "string";
/** El id de Pokémon de un payload IPC `{ pokemonId, ... }`, o null si no viene como texto no vacío. */
const pokemonIdDe = (dato: unknown): string | null => {
  if (typeof dato !== "object" || dato === null || Array.isArray(dato)) return null;
  const { pokemonId } = dato as Record<string, unknown>;
  return typeof pokemonId === "string" && pokemonId !== "" ? pokemonId : null;
};

// Una sola instancia por carpeta de datos (el candado lo guarda Electron en userData): dos copias abrirían la misma
// base y dos juegos de micrófono y atajos. La segunda sale y la primera trae su ventana al frente. El banco de pruebas
// usa un --user-data-dir propio, así que no choca con la app de quien desarrolla.
if (app.requestSingleInstanceLock()) {
  app.on("second-instance", traerPreparacionAlFrente);
  app.whenReady().then(arrancar).catch(fallar);
} else {
  app.quit();
}

/**
 * Solo en desarrollo (nunca empaquetada): POKE_MODELOS_MANIFIESTO=<archivo.json> cambia la lista de modelos por la
 * del archivo, para probar la pantalla de preparación contra un servidor local con archivos pequeños.
 */
function modelosDePrueba(): ModeloRemoto[] | undefined {
  const archivo = process.env.POKE_MODELOS_MANIFIESTO;
  if (app.isPackaged || !archivo) return undefined;
  return JSON.parse(readFileSync(archivo, "utf8")) as ModeloRemoto[];
}

/**
 * Antes de abrir nada: ¿hay motor de Claude Code y una sesión iniciada? Si no, un aviso con lo que hay que hacer.
 * Solo avisa (se puede continuar): sin sesión la voz y el laboratorio funcionan, y el error de cada Pokémon lo dice.
 * En desarrollo solo se mira la sesión (el ejecutable lo busca el SDK).
 */
async function avisarSiFaltaClaude(ejecutable: string | undefined): Promise<void> {
  const ruta = ejecutable ?? "claude";
  const d = await diagnosticarClaude({
    ruta,
    existe: (r) => (ejecutable ? existsSync(r) : true),
    hayCredenciales: hayCredencialesClaudeReal,
  });
  if (d.tipo === "ok") return;
  console.warn(`Claude Code: ${d.tipo}`);
  // "No volver a mostrar" vale solo para la falta de sesión; si falta el motor, siempre se avisa.
  const rutaPrefs = join(app.getPath("userData"), "preferencias.json");
  const prefs = leerPreferencias(rutaPrefs);
  if (d.tipo === "sin_sesion" && prefs.ocultarAvisoSesion) return;
  const m = mensajeDeDiagnostico(d);
  app.focus({ steal: true });
  const { response, checkboxChecked } = await dialog.showMessageBox({
    type: "warning",
    title: "Poke Equipo",
    message: m.titulo,
    detail: m.detalle,
    buttons: ["Continuar de todos modos", "Salir"],
    defaultId: d.tipo === "sin_ejecutable" ? 1 : 0,
    cancelId: 1,
    noLink: true,
    ...(d.tipo === "sin_sesion" ? { checkboxLabel: "No volver a mostrar este aviso" } : {}),
  });
  if (d.tipo === "sin_sesion" && checkboxChecked) {
    try {
      guardarPreferencias(rutaPrefs, { ...prefs, ocultarAvisoSesion: true });
    } catch (e) {
      console.warn("No se pudo guardar la preferencia del aviso:", e);
    }
  }
  if (response === 1) {
    app.quit();
    await new Promise<void>(() => {});
  }
}

function fallar(e: unknown): void {
  const mensaje = e instanceof Error ? e.message : String(e);
  console.error("Poke Equipo no pudo arrancar:", e);
  dialog.showErrorBox("Poke Equipo no pudo arrancar", mensaje);
  app.quit();
}

async function arrancar(): Promise<void> {
  app.dock?.hide();
  atenderRecursos();
  // Solo se concede el micrófono; cualquier otro permiso del navegador se niega.
  session.defaultSession.setPermissionRequestHandler((_wc, permiso, responder) =>
    responder(permiso === "media"),
  );
  session.defaultSession.setPermissionCheckHandler((_wc, permiso) => permiso === "media");
  // Antes de todo lo demás: si faltan modelos o los assets mínimos, una pantalla los explica y los baja.
  preparando = true;
  const preparado = await prepararPrimerArranque(pasosMinimos(RUTAS, modelosDePrueba()), RUTAS.datos);
  preparando = false;
  if (preparado === "salir") {
    app.quit();
    return;
  }
  // Instalada: el motor de Claude Code que trae el SDK vive fuera del asar y se le pasa por ruta; en desarrollo el
  // SDK encuentra el suyo. Si falta el motor o no hay sesión iniciada, se explica aquí en vez de fallar mudo luego.
  if (app.isPackaged) process.env.PATH = ampliarPath(process.env.PATH, homedir());
  const ejecutableClaude = app.isPackaged
    ? rutaClaudeIncluido({
        plataforma: process.platform,
        arch: process.arch,
        raizModulos: join(process.resourcesPath, "app.asar.unpacked", "node_modules"),
      })
    : undefined;
  await avisarSiFaltaClaude(ejecutableClaude);
  if (process.platform === "darwin") {
    const concedido = await systemPreferences.askForMediaAccess("microphone");
    console.info(`Permiso de micrófono de macOS: ${concedido ? "concedido" : "negado"}`);
  }

  const modelos = leer<{ rapido: ModeloTranscriptor; preciso: ModeloTranscriptor }>("transcriptor.json");
  // Glosario del repo + uno personal opcional (lista JSON de textos) en la carpeta de datos de la app.
  const glosario = [
    ...leer<string[]>("glosario.json"),
    ...leerGlosarioPersonal(join(app.getPath("userData"), "glosario.json")),
  ];
  // Una voz mal escrita o sin bajar se avisa al arrancar, no cuando un Pokémon intenta hablar.
  const tipos = validarConfigTipos(leer<unknown>("tipos.json"));
  const voces = validarConfigVoces(leer<unknown>("voces.json"), (v) => existsSync(join(RUTAS.modelos, v)));
  const equipo = new Equipo(RUTAS.base());
  // Lo que un nombre propio no puede ser: palabras de mando, modelos, glosario y movimientos.
  const reservadas = palabrasReservadas(glosario, nombresDeMovimientos(tipos));
  const mando = palabrasDeMando();
  // La ventana se crea antes de la primera vez: el laboratorio es la propia escena. La carga puede terminar mientras
  // La persona escoge; se anota para arrancar a los Pokémon cuando por fin existan.
  const win = crearVentana();
  let cargada = false;
  win.webContents.once("did-finish-load", () => {
    cargada = true;
  });
  const depsDialogo: DepsDialogo = {
    apartarEscena: () => apartarEscena(win),
    traerAlFrente: () => app.focus({ steal: true }),
    abrir: (o) => dialog.showOpenDialog(o),
  };

  let micDisponible = true;
  /** El recién bautizado en el laboratorio: hace el alta de voz al salir (ver `EquipoActivo.pedirAltaAlSalir`). */
  let altaInicial: string | null = null;
  let equipoActivo: EquipoActivo | null = null;
  const entrada = crearEntrada(win);
  // La ventana solo toma el ratón en la primera vez cuando el renderer avisa de que el laboratorio se ve; si no,
  // el escritorio sigue usable.
  const puerta = crearPuertaLab({
    entrada,
    programar: reloj.programar,
    aviso: (m) => console.warn(m),
    esperaMs: ESPERA_LABORATORIO_MS,
  });
  win.webContents.on("did-start-loading", () => {
    entrada.alEmpezarCarga();
    puerta.alEmpezarCarga();
  });
  // Un renderer caído no puede soltar el ratón: la ventana, que cubre el escritorio, se queda ignorándolo.
  win.webContents.on("render-process-gone", () => entrada.alEmpezarCarga());
  vigilarRespuesta(win as unknown as EmisorWeb, {
    olvidarCaptura: () => entrada.alEmpezarCarga(),
    reenviarCaptura: () => {
      if (!win.isDestroyed()) win.webContents.send(CANALES.reenviarCaptura);
    },
  });
  // Tras la carga la ventana vuelve a ignorar el ratón (ventana.ts): en el laboratorio se le devuelve.
  win.webContents.on("did-finish-load", () => {
    entrada.alCargar();
    // Main olvidó lo pedido por el renderer anterior: el nuevo vuelve a decir si captura.
    win.webContents.send(CANALES.reenviarCaptura);
  });

  // El laboratorio de la primera vez: main manda órdenes por CANALES.laboratorio y espera la respuesta por CANALES.inicial.
  let ordenLab: OrdenLaboratorio | null = null;
  let alResponderLab: ((r: RespuestaLab) => void) | null = null;
  let abrirLab: OrdenLaboratorio | null = null;
  /** Las especies ofrecidas que ya están completas en disco ahora mismo (se vuelve a mirar en cada "abrir", también al recargar). */
  let listasLab: () => number[] = () => [];
  /** El laboratorio está a la vista: solo entonces se le avisa de lo que va llegando. */
  let labAbierto = false;
  /** Pedir bajar una especie desde el laboratorio; solo existe mientras dura la primera vez. */
  let alPedirLab: ((dato: unknown) => void) | null = null;
  const avisarLlegada = (especie: number, ok: boolean) => {
    if (labAbierto && !win.isDestroyed()) win.webContents.send(CANALES.especieLab, { especie, ok });
  };
  const mandarOrdenLab = () => {
    // Una recarga del renderer durante el diálogo de carpeta (orden "volver") reabre el laboratorio.
    const orden = ordenLab?.tipo === "volver" ? abrirLab : ordenLab;
    if (orden && !win.isDestroyed())
      win.webContents.send(
        CANALES.laboratorio,
        orden.tipo === "abrir" ? { ...orden, listas: listasLab() } : orden,
      );
  };
  // Tras la primera vez la tarjeta final sigue a la vista hasta que el equipo está en pantalla (o pasa el plazo).
  let despedidaPendiente = false;
  const cerrarDespedida = () => {
    if (!despedidaPendiente) return;
    despedidaPendiente = false;
    ordenLab = { tipo: "cerrar" };
    mandarOrdenLab();
  };
  // Todo lo que el renderer usa al montarse y durante el laboratorio se registra ANTES de esperar la elección.
  registrarPrevios(ipcMain, {
    entrada,
    anims: leerAnims,
    alMicrofono: (disponible) => {
      micDisponible = disponible;
      console.info(`Micrófono del Escenario: ${disponible ? "abierto" : "no disponible"}`);
      equipoActivo?.ponerMicrofono(disponible);
    },
    alPedirLaboratorio: mandarOrdenLab,
    alInicial: (dato) => {
      const r = validarRespuestaLab(dato);
      const responder = alResponderLab;
      // Solo cuenta mientras se espera la elección: durante el diálogo de carpeta no se atiende nada.
      if (!r || !responder) return;
      alResponderLab = null;
      responder(r);
    },
    alLabListo: () => puerta.listo(),
    alLabFallo: () => {
      console.warn("El laboratorio falló al dibujarse: la ventana queda libre.");
      puerta.fallo();
    },
    alPedirEspecie: (dato) => alPedirLab?.(dato),
    // Solo el marco principal de la propia ventana (no un subframe ni otra página).
    esRemitente: (e) => (e as { senderFrame?: unknown }).senderFrame === win.webContents.mainFrame,
  });

  // Sprites de las demás especies: en cuanto termina la preparación empiezan a bajar en segundo plano (en la primera
  // vez, mientras la persona mira el laboratorio) y, de inmediato, cualquiera que se pida.
  const gestor = crearGestor({
    pasoDe: (especie) => pasoDeEspecieCatalogo(RUTAS, especie),
    alListo: (especie) => {
      console.info(`Especie ${especie} bajada.`);
      avisarLlegada(especie, true);
    },
    aviso: (mensaje, error) => console.warn(mensaje, error ?? ""),
  });
  // Salir (también desde el laboratorio) aborta la descarga en curso.
  app.on("will-quit", () => gestor.detener());
  // `segundoPlano` no duplica la cola: llamarlo otra vez retoma el fondo si se había detenido por falta de red.
  const iniciarFondo = () => gestor.segundoPlano(especiesDeFondo());

  /** Las especies con sus sprites bajados (assets/pokemon/<dex>/anims.json): las únicas que se pueden sacar. */
  const especiesDisponibles = () =>
    CATALOGO.filter((e) => existsSync(join(RUTAS.assets, carpetaEspecie(e.especie), "anims.json")));

  // La pregunta de carpeta es solo para la primera vez: con alguien en la base (activo o guardado) no se pregunta.
  if (equipo.todos().length === 0) {
    const respaldo = leer<Omit<DatosNuevos, "carpeta" | "nombre" | "especie">>("pokemon-inicial.json");
    const iniciales = inicialesVista(tipos);
    // La Pokédex de Kanto del laboratorio (huevo de pascua): siempre las 151, estén o no bajadas todavía (las que
    // faltan llegan en segundo plano o a demanda). Lo que el renderer responda se valida contra esta misma lista
    // (`primeraVez` no cree lo que llega por IPC) y, al crear, se comprueba además que sus assets estén completos.
    const otras = otrasVista(tipos, CATALOGO);
    const ofrecidas = [...iniciales, ...otras.filter((o) => !iniciales.some((i) => i.especie === o.especie))];
    const especiesOfrecidas = ofrecidas.map((o) => o.especie);
    listasLab = () => especiesOfrecidas.filter(especieEnDisco);
    alPedirLab = (dato) => {
      const pedido = validarPedidoEspecie(dato, especiesOfrecidas);
      if (pedido === null) return;
      const { especie } = pedido;
      if (especieEnDisco(especie)) return avisarLlegada(especie, true);
      // `pedir` comparte la descarga con la cola de fondo; al terminar se avisa del resultado (también si falló).
      void gestor
        .pedir(especie, pedido.eleccion ? "eleccion" : "marca")
        .then((ok) => avisarLlegada(especie, ok && especieEnDisco(especie)));
    };
    iniciarFondo();
    // Salir desde la barra de menú desde el primer momento, y vigilar que la pantalla no muera con la ventana tomada.
    const bandejaSalir = crearBandejaSalir();
    let primeraVezActiva = true;
    vigilarPrimeraVez(win.webContents as unknown as EmisorWeb, {
      activa: () => primeraVezActiva,
      alFallar: (motivo) => {
        primeraVezActiva = false;
        puerta.cerrar();
        equipo.cerrar();
        fallar(new Error(motivo));
      },
    });
    const nuevo = await primeraVez({
      iniciales: ofrecidas,
      mostrar: (o) => {
        labAbierto = o.tipo !== "cerrar";
        if (o.tipo === "volver" && o.fallo !== undefined) avisarLlegada(o.fallo, false);
        if (o.tipo === "abrir") {
          abrirLab = {
            tipo: "abrir",
            iniciales,
            otras,
            listas: [],
            nombres: {
              reservadas,
              mando,
              especies: CATALOGO.map((e) => ({ especie: e.especie, nombre: e.nombre })),
            },
          };
          puerta.abrir();
        } else if (o.tipo === "volver") puerta.volver();
        else puerta.cerrar();
        // Al cerrar, la tarjeta final se queda (sin clics) hasta que el equipo esté en pantalla.
        ordenLab =
          o.tipo === "abrir" ? abrirLab : o.tipo === "cerrar" ? { tipo: "preparando" } : { tipo: "volver" };
        // "volver" llega al renderer tal cual; en una recarga se manda "abrir".
        if (o.tipo === "volver" && ordenLab) win.webContents.send(CANALES.laboratorio, ordenLab);
        else mandarOrdenLab();
      },
      asegurar: async (especie) => {
        if (especieEnDisco(especie)) return true;
        // Con prioridad y sin esperar a la cola de fondo; si no llega (sin red, 404) vuelve al laboratorio.
        return (await gestor.pedir(especie, "eleccion")) && especieEnDisco(especie);
      },
      esperar: () => new Promise<RespuestaLab>((resolver) => (alResponderLab = resolver)),
      elegirCarpeta: (titulo) => {
        // Con el diálogo abierto la escena no recibe ratón ni foco (un clic no puede subirla sobre él).
        puerta.carpeta();
        return elegirCarpeta(depsDialogo, titulo);
      },
      // Lo que llega por IPC no se cree: el nombre se vuelve a validar aquí (nadie más en el equipo todavía).
      nombreValido: (especie, nombre) => {
        const r = validarNombre(nombre, {
          reservadas,
          mando,
          especies: CATALOGO.filter((e) => e.especie !== especie).map((e) => e.nombre),
          propia: CATALOGO.find((e) => e.especie === especie)?.nombre,
          otros: equipo.todos().map((p) => ({ nombre: p.nombre, apodos: p.apodos })),
        });
        return r.ok ? r.nombre : null;
      },
      datosDe: (especie) => {
        try {
          const { voz, velocidad } = elegirVoz(especie, [], voces);
          return { voz, velocidad };
        } catch (e) {
          // Respaldo: la voz de Pikachu de pokemon-inicial.json.
          console.warn("No se pudo elegir la voz de la especie; se usa la de respaldo:", e);
          return { voz: respaldo.voz, velocidad: respaldo.velocidad };
        }
      },
    });
    primeraVezActiva = false;
    alPedirLab = null;
    labAbierto = false;
    bandejaSalir.quitar();
    if (!nuevo) {
      // Sin elegir ni carpeta no hay dónde trabajar: no se adivina una.
      equipo.cerrar();
      app.quit();
      return;
    }
    const creado = equipo.crear(nuevo);
    // Con un nombre propio el Pokémon aprende cómo suena apenas sale (con el nombre de la especie ya se le entiende).
    if (
      normalizarNombre(nuevo.nombre) !==
      normalizarNombre(ofrecidas.find((i) => i.especie === nuevo.especie)?.nombre ?? nuevo.nombre)
    )
      altaInicial = creado.id;
    despedidaPendiente = true;
  }

  console.info("Cargando modelos de voz…");
  let hablando = false;
  let mudo = false;
  let micEncendido = true;
  let escapeActivo = false;

  /** Escape: descarta el borrador más reciente; sin borrador, calla a quien esté hablando (como en la etapa 1). */
  const alEscape = () => {
    if (equipoActivo?.hayBorrador()) equipoActivo.cancelarBorradorActual();
    else voz.callar();
  };
  /** Escape es global solo mientras hay algo que cancelar, para no quitárselo a las demás apps. */
  const ponerEscape = () => {
    const hace = equipoActivo !== null && (hablando || equipoActivo.hayBorrador());
    if (hace && !escapeActivo) escapeActivo = globalShortcut.register("Escape", alEscape);
    if (!hace && escapeActivo) {
      globalShortcut.unregister("Escape");
      escapeActivo = false;
    }
  };

  // El modelo preciso es lento (más que el audio mismo): corre en otro proceso para no congelar la app.
  // Si uno de los dos procesos se cae, se relanza solo; si sigue cayéndose, queda apagado y se avisa una vez, sin
  // ventanas: prender otra vez el micrófono lo reintenta (ver ponerEscucha).
  const alOidoCaido = () =>
    avisarDesdeBandeja(
      "Se me cayó el oído y no te estoy oyendo. Apaga y prende el micrófono para reintentar.",
    );
  const preciso = crearClientePreciso({
    lanzar: () => lanzarProcesoPreciso(modelos.preciso, RUTAS.modelos),
    ahora: () => Date.now(),
    aviso: (mensaje, e) => (e === undefined ? console.warn(mensaje) : console.warn(mensaje, e)),
    nombre: "preciso",
    alCaido: alOidoCaido,
  });
  // El rápido también corre aparte: con la máquina cargada tarda segundos y congelaba los menús y el clic derecho.
  const rapido = crearClientePreciso({
    lanzar: () => lanzarProcesoPreciso(modelos.rapido, RUTAS.modelos, "poke-rapido"),
    ahora: () => Date.now(),
    aviso: (mensaje, e) => (e === undefined ? console.warn(mensaje) : console.warn(mensaje, e)),
    nombre: "rápido",
    alCaido: alOidoCaido,
  });
  const { oido, alVista, alSonarVoz, dictar, terminarDictado, dictandoA } = crearCableadoVoz({
    segmentador: crearSegmentador(RUTAS.modelos),
    rapido,
    preciso,
    controlador: () => equipoActivo,
    ahora: () => Date.now(),
    programar: reloj.programar,
    aviso: (mensaje, e) => (e === undefined ? console.warn(mensaje) : console.warn(mensaje, e)),
    registrar: (linea) => console.info(linea),
    // Se llama más tarde, con cada frase: `especiesDisponibles` ya existe para entonces.
    especies: () => especiesDisponibles(),
    // "Llama a Rayo": también se llama por el nombre propio (o un apodo) de alguien del equipo.
    miembros: () => equipoActivo?.candidatosDelEquipo() ?? [],
    // POKE_OIDO_TEXTO=1 escribe en el registro lo que oye cada transcripción; apagado, no se guarda texto.
    depurar: process.env.POKE_OIDO_TEXTO === "1" ? (linea) => console.info(linea) : undefined,
    // Dictado con tecla: mientras dura se ve lo que va oyendo; al cerrar entra como texto escrito en su burbuja.
    alOido: (estado) => enviar(CANALES.oido, estado),
    alDictado: (id, texto, final) => {
      const a = equipoActivo;
      if (!a) return;
      if (!final) a.avisar(id, `Dictando…${texto ? ` ${texto}` : ""} (${ATAJO_DICTADO_TEXTO} para enviar)`);
      else if (texto) a.comando(id, texto);
      else a.avisar(id, "No te oí nada.");
    },
  });
  console.info("Modelos cargados.");
  // Mientras un Pokémon habla el micrófono está cerrado: no se oye a sí mismo.
  const voz = new Voz(crearSintetizador(RUTAS.modelos), crearReproductor(win), (h) => {
    hablando = h;
    alSonarVoz(h);
    ponerEscape();
  });

  /** Los vivos en pantalla, y el resto de la base para sacar (también con 0 en pantalla). */
  const entradas = () => {
    const a = equipoActivo;
    if (!a) return entradasBandeja(equipo.todos(), [], () => false);
    return entradasBandeja(equipo.todos(), a.vistas(), (id) => a.instancia(id) !== null);
  };
  /**
   * Un aviso de la barra de menú va al Pokémon de la burbuja abierta o, si no hay, al primero vivo; sin nadie en
   * pantalla, solo al registro.
   */
  const avisarDesdeBandeja = (texto: string) => {
    console.info(`Bandeja: ${texto}`);
    const a = equipoActivo;
    if (!a) return;
    const vistas = a.vistas();
    const destino = vistas.find((v) => v.abierta) ?? vistas.find((v) => a.instancia(v.id) !== null);
    if (destino) a.avisar(destino.id, texto);
  };
  const sacarDesdeBandeja = (id: string) => {
    const p = equipo.obtener(id);
    if (!p || !equipoActivo) return;
    const r = equipoActivo.sacarGuardado(id);
    switch (r.tipo) {
      case "ok":
        break;
      case "lleno":
        avisarDesdeBandeja(`No sale ${p.nombre}: el equipo está lleno. Guarda uno antes.`);
        break;
      case "ya_en_pantalla":
        avisarDesdeBandeja(`${p.nombre} ya está en pantalla.`);
        break;
      case "guardandose":
        avisarDesdeBandeja(`${p.nombre} se está guardando. Pídelo otra vez cuando termine.`);
        break;
      case "no_existe":
      case "especie_desconocida":
        console.warn(`Bandeja: no se pudo sacar a ${p.nombre} (${r.tipo}).`);
        break;
      default:
        r satisfies never;
    }
  };
  /** "Cambiar de proyecto…": elige carpeta y lo vuelve a sacar ahí. Solo guarda y niega; nunca aprueba. */
  const cambiarProyecto = async (id: string) => {
    const carpeta = await elegirCarpeta(depsDialogo);
    // cambiarCarpeta no hace nada si entretanto se guardó.
    if (carpeta) equipoActivo?.cambiarCarpeta(id, carpeta);
  };
  const bandeja = crearBandeja({
    microfono: () => micEncendido,
    alMicrofono: (encendido) => ponerEscucha(encendido),
    equipo: entradas,
    alGuardar: (id) => equipoActivo?.guardar(id),
    alSacar: sacarDesdeBandeja,
    alCambiarProyecto: (id) =>
      void cambiarProyecto(id).catch((e) => console.warn("No se pudo cambiar de proyecto:", e)),
    alCambiarNombre: (id) => cambiarNombre(id),
    modeloDe: (id) => equipoActivo?.modeloDe(id) ?? null,
    alCambiarModelo: (id, modelo) => void equipoActivo?.cambiarModelo(id, modelo),
  });

  /** «Cambiar nombre…» (clic derecho y barra de menú): deja la burbuja abierta con «/nombre » escrito y enfocado. */
  function cambiarNombre(id: string): void {
    if (!equipoActivo?.abrirParaNombre(id)) return;
    enviar(CANALES.prellenar, { pokemonId: id, texto: "/nombre " });
  }

  /** Única puerta para pausar o reanudar la escucha: barra de menú, clic derecho, atajo global y voz. */
  function ponerEscucha(encendido: boolean): void {
    micEncendido = encendido;
    // Prender el micrófono también levanta un oído que quedó caído. Solo relanza el proceso: no reenvía audio.
    if (encendido) {
      rapido.reintentar();
      preciso.reintentar();
    }
    oido.silenciar("usuario", !encendido);
    if (!win.isDestroyed()) win.webContents.send(CANALES.microfonoOrden, encendido);
    equipoActivo?.pausarOido(!encendido);
    bandeja.actualizar();
  }
  // Pausar y reanudar desde cualquier app, sin buscar el menú.
  if (!globalShortcut.register("Control+Alt+Space", () => ponerEscucha(!micEncendido))) {
    console.warn(`No se pudo registrar el atajo ${ATAJO_ESCUCHA}: otra app lo usa.`);
  }
  /**
   * Respaldo de la voz: una tecla abre el dictado y la misma lo cierra y lo envía, sin decir el nombre ni depender
   * de las pausas. Va al Pokémon de la burbuja abierta; si no hay, al que estaba atento; si no, al primero vivo.
   */
  const alternarDictado = () => {
    const a = equipoActivo;
    if (!a) return;
    if (dictandoA() !== null) {
      terminarDictado();
      return;
    }
    const vistas = a.vistas();
    const destino =
      a.abierta() ?? a.contexto().escuchandoA ?? vistas.find((v) => a.instancia(v.id) !== null)?.id ?? null;
    if (destino === null) return;
    if (!micEncendido) ponerEscucha(true);
    voz.callar();
    dictar(destino);
  };
  if (!globalShortcut.register(ATAJO_DICTADO, alternarDictado)) {
    console.warn(`No se pudo registrar el atajo ${ATAJO_DICTADO_TEXTO}: otra app lo usa.`);
  }

  const enviar = (canal: string, dato: unknown) => {
    if (!win.isDestroyed()) win.webContents.send(canal, dato);
  };
  const rutaPreferencias = join(dirname(RUTAS.base()), "preferencias.json");
  let preferencias = leerPreferencias(rutaPreferencias);
  const cambiarPreferencias = (nuevas: Preferencias) => {
    preferencias = nuevas;
    try {
      guardarPreferencias(rutaPreferencias, nuevas);
    } catch (e) {
      console.warn("No se pudieron guardar las preferencias:", e);
    }
    equipoActivo?.publicar();
  };

  // Con los modelos cargados, el resto del catálogo se baja sin molestar (si algo falla, lo retoma el próximo arranque).
  // En la primera vez ya empezó antes de abrir el laboratorio.
  iniciarFondo();
  /** Una especie del catálogo que se nombró exacta y aún no está en disco: se baja y la llamada sigue al llegar. */
  const alFaltarEspecie = (nombre: string) => {
    const e = resolverExacta(nombre, CATALOGO);
    if (!e || especiesDisponibles().some((d) => d.especie === e.especie)) return null;
    return {
      nombre: e.nombre,
      lista: gestor.pedir(e.especie).then(() => especiesDisponibles().some((d) => d.especie === e.especie)),
    };
  };

  /** Qué lista la bandeja, para no rehacer su menú en cada cambio de estado. */
  let firmaBandeja = "";
  const activo = new EquipoActivo({
    equipo,
    voces,
    programar: reloj.programar,
    especiesDisponibles,
    alFaltarEspecie,
    reservadas,
    mando,
    alCambiarEquipo: (vistas: VistaPokemon[]) => {
      // Las vistas llegan con `abierta` marcado por EquipoActivo (la autoridad): la guardia de voz se queda solo con
      // la abierta y el Escenario recibe la lista completa y dibuja la abierta o un chip según esa marca.
      alVista(vistas);
      // Lo que la persona ajustó desde el menú viaja con cada vista: quién se queda quieto y el tamaño del texto.
      enviar(
        CANALES.vista,
        vistas.map((v) => ({
          ...v,
          ...(preferencias.quietos.includes(v.id) ? { quieto: true } : {}),
          ...(preferencias.textoGrande ? { textoGrande: true } : {}),
          ...(preferencias.recorridoHecho ? {} : { recorrido: true }),
        })),
      );
      if (vistas.length > 0) cerrarDespedida();
      ponerEscape();
      const firma = entradas()
        // El modelo entra en la firma: la barra marca el efectivo al armarse, así que cambia al cambiarlo.
        .map((e) => `${e.id}:${e.nombre}:${e.activo}:${equipoActivo?.modeloDe(e.id) ?? ""}`)
        .join("|");
      if (firma !== firmaBandeja) {
        firmaBandeja = firma;
        bandeja.actualizar();
      }
    },
    crearControlador: (pokemon, enlace) =>
      new Controlador({
        pokemon,
        rol: construirRol(
          pokemon.nombre,
          glosario,
          especiesDisponibles().map((e) => e.nombre),
          tipos[tipoDe(pokemon.especie)].especialidad,
          equipo.todos().map((p) => ({
            nombre: p.nombre,
            especie: CATALOGO.find((e) => e.especie === p.especie)?.nombre ?? p.nombre,
          })),
        ),
        // Su modelo propio manda; sin él (nulo), el de su tipo (config/tipos.json). El tipo fija también los movimientos.
        modelo: modeloEfectivo(pokemon.modelo, tipos[tipoDe(pokemon.especie)].modelo),
        alResolverModelo: () => bandeja.actualizar(),
        movimientos: movimientosDe(pokemon.especie, tipos),
        // El alta no aprende nada que suene a una palabra de mando ni al nombre de otro del equipo.
        reservadas,
        ajenos: () => equipoActivo?.nombresAjenos(pokemon.id) ?? [],
        equipo,
        // SesionClaude arma sola su entorno limpio (sin ANTHROPIC_API_KEY ni CLAUDE*).
        crearSesion: (o) =>
          new SesionClaude(
            {
              ...o,
              // Respaldo de la voz: si la orden de llamar a otro le llega a Claude Code como texto, él mismo lo llama.
              herramientas: {
                llamar: (especie, encargo) =>
                  textoLlamada(
                    equipoActivo?.llamar(pokemon.id, especie, encargo) ?? {
                      tipo: "no_existe",
                      id: pokemon.id,
                    },
                    especie,
                  ),
                sacarEquipo: (proyecto) =>
                  equipoActivo?.sacarEquipo(proyecto) ?? "El equipo todavía no está listo.",
              },
            },
            { ejecutable: ejecutableClaude },
          ),
        voz: {
          // Cada Pokémon calla solo lo suyo: no corta ni descarta lo que otro tenía en fila.
          decir: (texto, v, velocidad) =>
            mudo ? Promise.resolve() : voz.decir(texto, v, velocidad, pokemon.id),
          callar: () => voz.callar(pokemon.id),
        },
        reloj,
        alCambiar: () => enlace.alCambiar(),
        alSonar: () => enviar(CANALES.sonar, `poke://assets/${carpetaEspecie(pokemon.especie)}/grito.ogg`),
        alDejarDeEscuchar: () => ponerEscucha(false),
        especiesDisponibles,
        // /pokemon: el equipo decide (una instancia por especie, voz libre) y lo vuelve a sacar.
        alCambiarEspecie: (e) => equipoActivo?.cambiarEspecie(pokemon.id, e),
        alGuardado: () => enlace.alGuardado(),
        idBorrador: idBorradorCompartido,
      }),
  });
  equipoActivo = activo;
  if (altaInicial) activo.pedirAltaAlSalir(altaInicial);
  // Respaldo: si el equipo no llega a publicarse, la tarjeta no se queda para siempre.
  reloj.programar(cerrarDespedida, PLAZO_DESPEDIDA_MS);
  // El micrófono y la pausa valen para todos, también para los que salgan después.
  activo.ponerMicrofono(micDisponible);
  activo.pausarOido(!micEncendido);
  bandeja.actualizar();

  // Una sola vez (arrancar es idempotente): los activos salen cuando el Escenario ya cargó.
  if (cargada) activo.arrancar();
  else win.webContents.once("did-finish-load", () => activo.arrancar());
  const intervalo = setInterval(() => activo.tic(), TIC_MS);

  // La primera vista puede salir antes de que el Escenario se suscriba: la pide cuando ya escucha.
  // Republica (pone al día la apertura): la guardia y el Escenario ven lo mismo.
  ipcMain.on(CANALES.pedirVista, () => activo.publicar());
  let avisoAudio = false;
  let avisoHora = false;
  ipcMain.on(CANALES.audioEntrada, (_e, bloque: unknown) => {
    const b = validarBloqueAudio(bloque, Date.now());
    if ("rechazado" in b) {
      if (!avisoAudio) {
        avisoAudio = true;
        console.warn("Audio de entrada con un tipo inesperado:", b.tipo);
      }
      return;
    }
    if (b.aviso && !avisoHora) {
      avisoHora = true;
      console.warn(b.aviso);
    }
    try {
      // Sin hora válida el audio se transcribe igual, pero la frase queda sin hora de inicio y no responde permisos.
      oido.recibir(b.muestras, b.t);
    } catch (e) {
      // Un fallo de sherpa no debe tumbar la app ni dejar al Pokémon a medias.
      console.warn("Oído: falló al procesar el audio:", e);
      try {
        oido.descartar();
      } catch {
        // Sin más que hacer: el siguiente bloque vuelve a intentar.
      }
    }
  });
  // Un clic en la escena calla a todos.
  ipcMain.on(CANALES.clic, () => voz.callar());
  ipcMain.on(CANALES.permiso, (_e, r: unknown) => {
    // Solo se acepta { permitir, pokemonId, permisoId }; lo demás se ignora (nunca se aprueba solo).
    // Solo vale para la burbuja abierta (el bloque del permiso solo se dibuja ahí), llega solo al Pokémon de ese id, y
    // él comprueba que el permiso es el que tiene a la vista.
    const resp = validarRespuestaPermiso(r);
    if (!resp) return;
    activo.responderPermisoConClic(resp.permitir, resp.pokemonId, resp.permisoId);
  });
  // La persona eligió una burbuja (su chip o un clic sobre el Pokémon): main la fija y republica. Nunca responde nada.
  ipcMain.on(CANALES.elegir, (_e, dato: unknown) => {
    const id = pokemonIdDe(dato);
    if (id !== null) activo.elegir(id);
  });
  ipcMain.on(CANALES.saltarAlta, (_e, dato: unknown) => {
    const id = pokemonIdDe(dato);
    if (id !== null) activo.saltarAlta(id);
  });
  ipcMain.on(CANALES.reintentar, (_e, dato: unknown) => {
    const id = pokemonIdDe(dato);
    if (id !== null) activo.reintentar(id);
  });
  ipcMain.on(CANALES.escribir, (_e, dato: unknown) => {
    const id = pokemonIdDe(dato);
    if (id === null) return;
    const { texto } = dato as { texto?: unknown };
    if (esTexto(texto) && texto.trim() !== "") activo.comando(id, texto);
  });
  ipcMain.on(CANALES.recorrido, (_e, accion: unknown) => {
    if (accion !== "fin" && accion !== "repetir") return;
    cambiarPreferencias({ ...preferencias, recorridoHecho: accion === "fin" });
  });
  ipcMain.on(CANALES.copiar, (_e, texto: unknown) => {
    if (esTexto(texto) && texto !== "") clipboard.writeText(texto);
  });
  ipcMain.on(CANALES.detenerTarea, (_e, dato: unknown) => {
    const id = pokemonIdDe(dato);
    if (id !== null) activo.detener(id);
  });
  ipcMain.handle(CANALES.historial, (_e, dato: unknown) => {
    const id = pokemonIdDe(dato);
    return id === null ? [] : equipo.historial(id);
  });
  ipcMain.handle(CANALES.comandos, (_e, dato: unknown) => {
    const id = pokemonIdDe(dato);
    return id === null ? [] : activo.comandos(id);
  });
  // Clic derecho: el menú del Pokémon de ese id, solo si está vivo (el Escenario los dibuja a todos). Ninguna opción
  // aprueba.
  ipcMain.on(CANALES.menu, (_e, dato: unknown) => {
    const id = pokemonIdDe(dato);
    if (id === null || activo.instancia(id) === null) return;
    Menu.buildFromTemplate([
      {
        label: micEncendido ? "Dejar de escuchar" : "Volver a escuchar",
        accelerator: "Control+Alt+Space",
        click: () => ponerEscucha(!micEncendido),
      },
      { type: "separator" },
      { label: "Detener lo que hace", click: () => activo.detener(id) },
      { label: "Guardar en la pokébola", click: () => activo.guardar(id) },
      {
        label: "Cambiar de proyecto…",
        click: () =>
          void cambiarProyecto(id).catch((e) => console.warn("No se pudo cambiar de proyecto:", e)),
      },
      { type: "separator" },
      {
        label: "Quedarse quieto aquí",
        type: "checkbox",
        checked: preferencias.quietos.includes(id),
        click: () => cambiarPreferencias(alternarQuieto(preferencias, id)),
      },
      {
        // Global: el tamaño del texto es el mismo para todos.
        label: "Texto grande",
        type: "checkbox",
        checked: preferencias.textoGrande,
        click: (item) => cambiarPreferencias({ ...preferencias, textoGrande: item.checked }),
      },
      { type: "separator" },
      {
        // Deja la burbuja abierta con "/nombre " escrito y el cursor listo: ahí se escribe el nombre nuevo.
        label: "Cambiar nombre…",
        click: () => cambiarNombre(id),
      },
      // Los tres modelos como radios, el efectivo marcado: cambia la sesión como /model y queda guardado.
      submenuModelo(activo.modeloDe(id), (modelo) => void activo.cambiarModelo(id, modelo)),
      { label: "Enseñarle mi voz", click: () => activo.iniciarAlta(id) },
      { label: "Llevar al Centro Pokémon", click: () => activo.curar(id) },
      {
        // Global (Ruling T10 g): calla y silencia a todos.
        label: "Silenciar su voz",
        type: "checkbox",
        checked: mudo,
        click: (item) => {
          mudo = item.checked;
          if (mudo) voz.callar();
        },
      },
    ]).popup({ window: win });
  });

  app.on("will-quit", () => {
    clearInterval(intervalo);
    gestor.detener();
    for (const cancelar of [...pendientes]) cancelar();
    globalShortcut.unregisterAll();
    // Cerrar la sesión de todos niega todo permiso pendiente: salir nunca aprueba nada. No los guarda: vuelven al abrir.
    activo.cerrar();
    preciso.cerrar();
    rapido.cerrar();
    equipo.cerrar();
  });
}

app.on("window-all-closed", () => {
  if (!preparando) app.quit();
});
