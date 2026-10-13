import {
  type Apertura,
  actualizarApertura,
  elegirBurbuja,
  marcarAbierta,
  SIN_APERTURA,
} from "@compartido/burbuja-abierta";
import { esModeloElegible } from "@compartido/modelos";
import { type ContextoNombre, validarNombre } from "@compartido/nombre";
import type { ComandoVista, Pokemon, VistaPokemon } from "@compartido/tipos";
import { type Contexto, type Decision, palabrasDeMando, palabrasReservadas } from "../entrenador/entrenador";
import type { Equipo } from "../equipo/equipo";
import type { Candidato } from "../oido/nombres";
import { normalizar, sinChoques } from "../oido/nombres";
import { encargoCombate, leerVeredicto, RESULTADO_MS, type Veredicto } from "./combate";
import { ALTA_FRASES_BAUTIZO, type Controlador, type IdBorrador } from "./controlador";
import { buscarMiembro, resolverEspecie, resolverExacta } from "./especie-oida";
import { CATALOGO, type Especie, elegirEspecie } from "./especies";
import { evolucionPara } from "./evolucion";
import type { ControladorFrases } from "./frases";
import { leerLlamada } from "./llamada";
import { type FichaPokedex, resumenManana } from "./pokedex";
import { type ConfigVoces, elegirVoz } from "./voces";

/** Pokémon en pantalla a la vez, como mucho. */
export const TOPE_EQUIPO = 6;
/** Al arrancar, los activos salen uno tras otro con esta separación. */
export const ESCALONADO_MS = 1200;

export type ResultadoLlamada =
  | { tipo: "ok"; id: string }
  | { tipo: "lleno" }
  | { tipo: "ya_en_pantalla"; id: string }
  /** El de esa especie está volviendo a su pokébola: hay que esperar a que termine. */
  | { tipo: "guardandose"; id: string }
  | { tipo: "especie_desconocida"; nombre: string }
  /** El que llama, o el guardado que se quiere sacar, no existe (o no está vivo en pantalla). */
  | { tipo: "no_existe"; id: string };

/** Al llamar no hay sorteo: "azar" no es una especie (el azar es solo de /pokemon). */
const SIN_AZAR = new Set(["azar", "random", "sorpresa"]);

export interface EnlaceEquipo {
  /** Lo llama el controlador al terminar de guardarse. */
  alGuardado(): void;
  /** Lo llama el controlador en cada cambio de su vista. */
  alCambiar(): void;
}

export interface DependenciasEquipo {
  equipo: Pick<
    Equipo,
    | "todos"
    | "activos"
    | "contarActivos"
    | "buscarPorEspecie"
    | "activar"
    | "desactivar"
    | "crear"
    | "obtener"
  > & {
    cambiarEspecie(
      id: string,
      especie: number,
      nombre: string,
      voz: string,
      velocidad: number,
      conservarApodos?: boolean,
    ): void;
    renombrar(id: string, nombre: string): void;
    cambiarCarpeta(id: string, carpeta: string): void;
    /** La Pokédex; opcional para no tocar las bases de prueba. */
    pokedex?(): FichaPokedex[];
  };
  /** La hora actual; por defecto `Date.now`. */
  ahora?(): number;
  /** Crea el Controlador de un Pokémon con las dependencias de la app (sesión, voz, reloj) y lo une al enlace. */
  crearControlador(p: Pokemon, enlace: EnlaceEquipo): Controlador;
  especiesDisponibles(): Especie[];
  /**
   * Alguien pide una especie del catálogo que aún no está bajada: si el nombre es de una, empieza a bajarla y devuelve
   * su nombre y una promesa (true = quedó disponible); si no es de ninguna, null. La llamada sigue sola al llegar.
   */
  alFaltarEspecie?(nombre: string): { nombre: string; lista: Promise<boolean> } | null;
  voces: ConfigVoces;
  /** Programa una tarea; devuelve la función que la cancela. */
  programar(fn: () => void, ms: number): () => void;
  /**
   * Publica la lista completa de vistas (cada cambio de cualquier Pokémon, y cada vez que la persona elige una burbuja),
   * con `abierta` ya marcado en como mucho una.
   */
  alCambiarEquipo(vistas: VistaPokemon[]): void;
  azar?(): number;
  /** Glosario y movimientos: palabras que un nombre propio tampoco puede ser (ver `palabrasReservadas`). */
  reservadas?: string[];
  /** Las de permiso y mando entre las reservadas (ver `palabrasDeMando`). */
  mando?: string[];
}

/** Lo que pasó con una llamada, en una frase para quien la pidió (Claude Code, por la herramienta del equipo). */
export function textoLlamada(r: ResultadoLlamada, especie: string): string {
  switch (r.tipo) {
    case "ok":
      return `Listo: ${especie} salió y recibió el encargo, si lo había. Trabaja en su propia sesión; no hagas tú su tarea.`;
    case "ya_en_pantalla":
      return `${especie} ya estaba en pantalla; si había encargo, se le pasó.`;
    case "lleno":
      return "El equipo está lleno (seis en pantalla). Hay que guardar a alguno antes de llamar a otro.";
    case "guardandose":
      return `${especie} está volviendo a su pokébola. Inténtalo de nuevo en unos segundos.`;
    case "especie_desconocida":
      return `No hay ningún Pokémon llamado ${r.nombre} en el catálogo.`;
    case "no_existe":
      return "No se pudo: el Pokémon que llama ya no está en pantalla.";
  }
}

interface Entrada {
  pokemon: Pokemon;
  c: Controlador;
}

/**
 * Los Pokémon en pantalla (hasta TOPE_EQUIPO), cada uno con su Controlador. Enruta por id todo lo que la tubería
 * de frases y la interfaz le piden. Un permiso solo se responde reenviando `responderPermisoDe` al Pokémon de ese
 * id; guardar o cerrar solo niegan.
 */
export class EquipoActivo implements ControladorFrases {
  /** Quién tiene una respuesta sin abrir, y la última respuesta que la persona ya vio de cada uno. */
  private sinLeer = new Set<string>();
  private leido = new Map<string, string | null>();
  /** Pokémon en pantalla, en orden de llegada; uno que se está guardando sigue aquí hasta `alGuardado`. */
  private mapa = new Map<string, Entrada>();
  /** Encargos que un Pokémon le pasó a otro, por el id del que lo recibió. */
  private encargos = new Map<string, { deId: string; empezo: boolean }>();
  /** Combates de revisión en curso, por el id del retador. */
  private combates = new Map<
    string,
    { rivalId: string; empezo: boolean; resultado: Veredicto | "nadie" | null }
  >();
  /** Lo que se hace al terminar de guardar (volver a sacarlo tras cambiar de especie o de carpeta). */
  private tras = new Map<string, () => void>();
  /** Último Pokémon al que la persona le habló por su nombre; solo cuenta mientras él mismo siga atento. */
  private ultimoLlamado: string | null = null;
  private arrancado = false;
  private cerrado = false;
  /** Quién hace el alta de voz al salir (recién bautizado o renombrado): arranca antes de la primera vista. */
  private altaAlSalir = new Set<string>();
  /** Los que están en un alta del bautizo (la del menú no cuenta). */
  private altasDelBautizo = new Set<string>();
  /** Cancelan las salidas escalonadas del arranque que aún no ocurrieron. */
  private pendientesArranque: (() => void)[] = [];
  private pausado = false;
  private microfono = true;
  /** Qué burbuja eligió la persona y lo necesario para soltarla (C25). Solo la tocan `publicar()` y `elegir()`. */
  private apertura: Apertura = SIN_APERTURA;

  constructor(private d: DependenciasEquipo) {}

  /** Saca los activos de la base (como mucho TOPE_EQUIPO), uno por uno, escalonados. Solo la primera vez. */
  arrancar(): void {
    if (this.arrancado) return;
    this.arrancado = true;
    this.pendientesArranque = this.d.equipo
      .activos()
      .slice(0, TOPE_EQUIPO)
      .map((p, i) =>
        this.d.programar(() => {
          // El primero de la mañana cuenta en qué quedó cada uno.
          if (!this.sacar(p.id) || i > 0) return;
          const resumen = resumenManana(this.d.equipo.pokedex?.() ?? [], (this.d.ahora ?? Date.now)());
          if (resumen) this.mapa.get(p.id)?.c.avisar(resumen);
        }, i * ESCALONADO_MS),
      );
  }

  /**
   * Saca (o retoma) un Pokémon de la base y lo pone en pantalla; nunca dos de la misma especie. Devuelve true solo si
   * lo puso en pantalla ahora (false: cerrado, ya estaba, no existe o su especie está ocupada).
   */
  private sacar(id: string): boolean {
    if (this.cerrado || this.mapa.has(id)) return false;
    const p = this.d.equipo.obtener(id);
    if (!p || this.ocupanteDe(p.especie) !== null) return false;
    this.d.equipo.activar(id);
    const pokemon: Pokemon = { ...p, activo: true };
    const c = this.d.crearControlador(pokemon, {
      alGuardado: () => this.alGuardado(id),
      alCambiar: () => this.publicar(),
    });
    this.mapa.set(id, { pokemon, c });
    if (!this.microfono) c.ponerMicrofono(false);
    if (this.pausado) c.pausarOido(true);
    c.iniciar();
    // Antes del primer `publicar`: el recorrido ya sabe que hay un alta en curso y no se adelanta con sus avisos.
    this.arrancarAltasPendientes();
    this.publicar();
    return true;
  }

  /** El Pokémon `id` si está en pantalla y no se está guardando ni cerrado. */
  private viva(id: string): Entrada | undefined {
    const e = this.mapa.get(id);
    if (!e || this.tras.has(id) || e.c.instancia(id) === null) return undefined;
    return e;
  }

  private vivas(): Entrada[] {
    return [...this.mapa.entries()].filter(([id]) => this.viva(id)).map(([, e]) => e);
  }

  /** El id del Pokémon de esa especie que ya está en el mapa (en pantalla o guardándose), o null. */
  private ocupanteDe(especie: number): string | null {
    for (const [id, e] of this.mapa) if (e.pokemon.especie === especie) return id;
    return null;
  }

  /** Por qué no sale otro: el que está ya se ve, o se está guardando. */
  private yaEsta(id: string): ResultadoLlamada {
    return this.viva(id) ? { tipo: "ya_en_pantalla", id } : { tipo: "guardandose", id };
  }

  /** En pantalla más los activos que aún no salieron (arranque escalonado en curso). */
  private ocupados(): number {
    return Math.max(this.mapa.size, this.d.equipo.contarActivos());
  }

  llamar(callerId: string, nombreEspecie: string, encargo: string, yaPedida = false): ResultadoLlamada {
    const quien = this.viva(callerId);
    if (!quien) return { tipo: "no_existe", id: callerId };
    if (nombreEspecie.trim() === "") {
      // Las dos transcripciones no se pusieron de acuerdo en a quién llamar: no se crea a nadie.
      quien.c.avisar("No entendí a quién llamar. Dilo otra vez.");
      return { tipo: "especie_desconocida", nombre: nombreEspecie };
    }
    if (SIN_AZAR.has(normalizar(nombreEspecie).trim())) {
      quien.c.avisar(`No tengo a ${nombreEspecie} bajado.`);
      return { tipo: "especie_desconocida", nombre: nombreEspecie };
    }
    // Por su nombre propio (o un apodo aprendido): es alguien del equipo, en pantalla o guardado.
    const miembro = buscarMiembro(nombreEspecie, this.candidatosDelEquipo());
    const eleccion = miembro
      ? null
      : elegirEspecie(nombreEspecie, this.d.especiesDisponibles(), -1, this.d.azar ?? Math.random);
    if (!miembro && eleccion?.tipo !== "especie" && !yaPedida) {
      const faltante = this.d.alFaltarEspecie?.(nombreEspecie);
      if (faltante) {
        quien.c.avisar(`Bajando a ${faltante.nombre}; saldrá en cuanto termine.`);
        void faltante.lista.then((ok) => {
          if (ok) this.llamar(callerId, nombreEspecie, encargo, true);
          else
            this.viva(callerId)?.c.avisar(
              `No pude bajar a ${faltante.nombre}. Revisa tu conexión y vuelve a pedirlo.`,
            );
        });
        return { tipo: "especie_desconocida", nombre: nombreEspecie };
      }
    }
    if (!miembro && eleccion?.tipo === "aproximada") {
      quien.c.avisar(`No conozco a «${nombreEspecie}». ¿Quisiste decir ${eleccion.sugerida.nombre}?`);
      return { tipo: "especie_desconocida", nombre: nombreEspecie };
    }
    if (!miembro && eleccion?.tipo !== "especie") {
      quien.c.avisar(`No tengo a ${nombreEspecie} bajado.`);
      return { tipo: "especie_desconocida", nombre: nombreEspecie };
    }
    const especie = miembro
      ? { especie: this.d.equipo.obtener(miembro.id)?.especie ?? -1, nombre: miembro.nombre }
      : (eleccion as { especie: Especie }).especie;
    const existente = miembro
      ? this.d.equipo.obtener(miembro.id)
      : this.d.equipo.buscarPorEspecie(especie.especie);
    const r = existente
      ? this.sacarGuardado(existente.id)
      : this.ocupados() >= TOPE_EQUIPO
        ? ({ tipo: "lleno" } as const)
        : this.crearYSacar(especie, quien);
    switch (r.tipo) {
      case "ok":
        if (encargo) this.pasarEncargo(quien, r.id, encargo);
        break;
      case "lleno":
        quien.c.avisar(`El equipo está lleno (${TOPE_EQUIPO}). Guarda uno antes.`);
        break;
      case "ya_en_pantalla":
        // Ya está aquí: con encargo se le pasa (así un Pokémon le da trabajo a otro); sin encargo, solo se avisa.
        if (encargo && r.id !== callerId && this.viva(r.id)) this.pasarEncargo(quien, r.id, encargo);
        else quien.c.avisar(`${especie.nombre} ya está en pantalla.`);
        break;
      case "guardandose":
        quien.c.avisar(`${especie.nombre} se está guardando.`);
        break;
      case "especie_desconocida":
      case "no_existe":
        // sacarGuardado de uno que está en la base no da ninguno de estos; crearYSacar ya avisó si no pudo.
        break;
      default:
        r satisfies never;
    }
    return r;
  }

  /**
   * Se hablan: uno le pasa un encargo a otro. El que lo pasa lo dice en su burbuja y, cuando el otro termina, avisa
   * que ya está.
   */
  private pasarEncargo(de: Entrada, paraId: string, encargo: string): void {
    const para = this.viva(paraId);
    if (!para) return;
    para.c.ejecutar({ tipo: "orden", id: paraId, texto: encargo });
    const corto = encargo.length > 70 ? `${encargo.slice(0, 69)}…` : encargo;
    de.c.avisar(`Le pasé a ${para.pokemon.nombre}: ${corto}`);
    this.encargos.set(paraId, { deId: de.pokemon.id, empezo: false });
  }

  /** Avisa al que pasó un encargo cuando el otro lo termina. */
  private seguirEncargos(): void {
    for (const [paraId, e] of this.encargos) {
      const para = this.viva(paraId);
      if (!para) {
        this.encargos.delete(paraId);
        continue;
      }
      const estado = para.c.vista().estado;
      if (estado === "trabajando" || estado === "pidiendo_permiso") {
        e.empezo = true;
        continue;
      }
      if (!e.empezo) continue;
      this.encargos.delete(paraId);
      this.viva(e.deId)?.c.avisar(
        estado === "error"
          ? `${para.pokemon.nombre} tuvo un error con lo que le pasé.`
          : `${para.pokemon.nombre} terminó lo que le pasé.`,
      );
    }
  }

  /**
   * "Saca el equipo Acme": pone en pantalla a los guardados que trabajan en ese proyecto (por el nombre de su
   * carpeta), hasta llenar el equipo. Devuelve en una frase qué pasó.
   */
  sacarEquipo(proyecto: string): string {
    const plano = normalizar(proyecto).trim();
    if (!plano) return "Dime de qué proyecto: /equipo acme";
    const delProyecto = this.d.equipo
      .todos()
      .filter((p) => normalizar(p.carpeta.split("/").filter(Boolean).at(-1) ?? "").includes(plano));
    if (delProyecto.length === 0) return `Ningún Pokémon ha trabajado en un proyecto llamado ${proyecto}.`;
    const sacados: string[] = [];
    const yaEstaban: string[] = [];
    let sinCupo = 0;
    for (const p of delProyecto) {
      if (this.mapa.has(p.id)) yaEstaban.push(p.nombre);
      else if (this.ocupados() >= TOPE_EQUIPO) sinCupo += 1;
      else if (this.sacar(p.id)) sacados.push(p.nombre);
    }
    const partes = [
      sacados.length > 0 ? `Salieron: ${sacados.join(", ")}.` : "",
      yaEstaban.length > 0 ? `Ya estaban: ${yaEstaban.join(", ")}.` : "",
      sinCupo > 0 ? `${sinCupo} no cupieron: el equipo está lleno.` : "",
    ].filter(Boolean);
    return partes.join(" ");
  }

  /**
   * Crea un Pokémon nuevo de esa especie en la carpeta de quien lo llama y lo saca. Si la especie sigue ocupada en el
   * mapa (p. ej. el que está cambiando de especie aún no termina de guardarse) no crea nada; si aun así no sale, la
   * fila nueva se desactiva (nunca queda un activo fantasma) y se avisa.
   */
  private crearYSacar(especie: Especie, quien: Entrada): ResultadoLlamada {
    const ocupante = this.ocupanteDe(especie.especie);
    if (ocupante !== null) return this.yaEsta(ocupante);
    const voz = this.vozPara(especie.especie, null);
    const nuevo = this.d.equipo.crear({
      nombre: especie.nombre,
      especie: especie.especie,
      voz: voz.voz,
      velocidad: voz.velocidad,
      carpeta: quien.pokemon.carpeta,
    });
    if (!this.sacar(nuevo.id)) {
      this.d.equipo.desactivar(nuevo.id);
      quien.c.avisar(`No pude sacar a ${especie.nombre}.`);
      return { tipo: "no_existe", id: nuevo.id };
    }
    return { tipo: "ok", id: nuevo.id };
  }

  /**
   * Saca un Pokémon guardado (retoma su conversación), respetando el tope y una sola instancia por especie. Tras
   * `cerrar()` no saca a nadie.
   */
  sacarGuardado(id: string): ResultadoLlamada {
    if (this.cerrado) return { tipo: "no_existe", id };
    const p = this.d.equipo.obtener(id);
    if (!p) return { tipo: "no_existe", id };
    const ocupante = this.mapa.has(id) ? id : this.ocupanteDe(p.especie);
    if (ocupante !== null) return this.yaEsta(ocupante);
    // Un activo que aún no salió en el arranque ya cuenta en `ocupados`: no se le cobra dos veces.
    if (!p.activo && this.ocupados() >= TOPE_EQUIPO) return { tipo: "lleno" };
    return this.sacar(id) ? { tipo: "ok", id } : { tipo: "no_existe", id };
  }

  /** Voz para una especie según las que suenan en pantalla, sin contar al Pokémon `excepto`. */
  private vozPara(especie: number, excepto: string | null) {
    const enUso = [...this.mapa.entries()]
      .filter(([id]) => id !== excepto)
      .map(([, e]) => ({ voz: e.pokemon.voz, velocidad: e.pokemon.velocidad }));
    return elegirVoz(especie, enUso, this.d.voces);
  }

  /** "Vuelve" y /guardar: vuelve a su pokébola y sale del mapa al terminar. */
  guardar(id: string): void {
    this.viva(id)?.c.guardar();
  }

  /** /pokemon: vuelve a su pokébola y sale como otra especie, con la misma conversación. */
  cambiarEspecie(id: string, especie: Especie): void {
    const entrada = this.viva(id);
    if (!entrada) return;
    // Una instancia por especie: si ya hay otro de esa especie, en pantalla o en el PC, se llama a ese.
    const otro = this.d.equipo.todos().find((p) => p.especie === especie.especie && p.id !== id);
    if (otro) {
      entrada.c.avisar(
        this.mapa.has(otro.id)
          ? `${especie.nombre} ya está en pantalla.`
          : `Ya tienes a ${especie.nombre} en el PC. Llámalo.`,
      );
      return;
    }
    const voz = this.vozPara(especie.especie, id);
    const actual = this.d.equipo.obtener(id);
    // Con nombre propio sigue llamándose así (y con lo que ya se le aprendió), como al evolucionar.
    const propio = actual !== null && this.conNombrePropio(actual);
    this.guardarYVolver(entrada, () =>
      propio
        ? this.d.equipo.cambiarEspecie(id, especie.especie, actual.nombre, voz.voz, voz.velocidad, true)
        : this.d.equipo.cambiarEspecie(id, especie.especie, especie.nombre, voz.voz, voz.velocidad),
    );
  }

  /** El Pokémon recién bautizado hará el alta de voz (tres frases) en cuanto salga y se le pueda oír. */
  pedirAltaAlSalir(id: string): void {
    this.altaAlSalir.add(id);
  }

  /**
   * Arranca las altas pendientes de los que ya están en pantalla, solo si hay micrófono y la escucha no está
   * pausada: sin poder oír, el alta pediría 30 s de «di tu nombre» a nadie. Se llama al salir, al volver el
   * micrófono y al reanudar la escucha.
   */
  private arrancarAltasPendientes(): void {
    if (!this.microfono || this.pausado) return;
    for (const id of [...this.altaAlSalir]) {
      const e = this.viva(id);
      if (!e) continue;
      this.altaAlSalir.delete(id);
      this.altasDelBautizo.add(id);
      e.c.iniciarAlta(ALTA_FRASES_BAUTIZO);
    }
  }

  /**
   * El micrófono se fue o la escucha se pausó en medio de un alta del bautizo: se suspende y se retoma al volver.
   * (El alta del menú, «Enseñarle mi voz», la pidió la persona aquí y ahora: esa se deja como está.)
   */
  private suspenderAltas(): void {
    for (const id of this.altasDelBautizo) {
      const e = this.viva(id);
      if (e?.c.vista().alta) {
        e.c.saltarAlta();
        this.altaAlSalir.add(id);
      } else this.altasDelBautizo.delete(id);
    }
  }

  /** Botón «Saltar» del alta: la termina sin aprender nada y no se vuelve a pedir. */
  saltarAlta(id: string): void {
    this.altaAlSalir.delete(id);
    this.altasDelBautizo.delete(id);
    this.viva(id)?.c.saltarAlta();
  }

  /** Todos los del equipo (en pantalla o guardados) con su nombre, apodos y, si tienen nombre propio, su especie. */
  candidatosDelEquipo(): Candidato[] {
    return this.d.equipo.todos().map((p) => {
      const especie = CATALOGO.find((x) => x.especie === p.especie)?.nombre;
      const propio = especie !== undefined && normalizar(especie) !== normalizar(p.nombre);
      return { id: p.id, nombre: p.nombre, apodos: p.apodos, alias: propio ? [especie] : [] };
    });
  }

  /** Nombres, apodos y especies de todos los demás del equipo: lo que el alta de `id` no debe aprender. */
  nombresAjenos(id: string): string[] {
    return this.candidatosDelEquipo()
      .filter((c) => c.id !== id)
      .flatMap((c) => [c.nombre, ...c.apodos, ...(c.alias ?? [])]);
  }

  /** ¿Tiene un nombre propio distinto del de su especie? */
  private conNombrePropio(p: Pokemon): boolean {
    const especie = CATALOGO.find((x) => x.especie === p.especie)?.nombre;
    return especie !== undefined && normalizar(especie) !== normalizar(p.nombre);
  }

  /** "Cambiar nombre…" del menú: deja abierta (sin cerrarla si ya lo estaba) la burbuja de ese Pokémon. */
  abrirParaNombre(id: string): boolean {
    if (!this.viva(id)) return false;
    if (this.abierta() !== id) this.elegir(id);
    return true;
  }

  private contextoNombre(id: string, especie: number): ContextoNombre {
    return {
      reservadas: this.d.reservadas ?? palabrasReservadas(),
      mando: this.d.mando ?? palabrasDeMando(),
      especies: CATALOGO.filter((e) => e.especie !== especie).map((e) => e.nombre),
      especiesEquipo: this.d.equipo
        .todos()
        .filter((p) => p.id !== id)
        .flatMap((p) => CATALOGO.find((e) => e.especie === p.especie)?.nombre ?? []),
      propia: CATALOGO.find((e) => e.especie === especie)?.nombre,
      otros: this.d.equipo
        .todos()
        .filter((p) => p.id !== id)
        .map((p) => ({ nombre: p.nombre, apodos: p.apodos })),
    };
  }

  /**
   * `/nombre <nuevo>`: le pone otro nombre propio. Vuelve a su pokébola y sale con el nombre nuevo: los apodos del
   * viejo se borran, la conversación y el historial siguen, y el alta de voz se repite al salir. Nunca a media tarea
   * ni con un permiso a la vista (no toca ninguno).
   */
  renombrar(id: string, texto: string): void {
    const e = this.viva(id);
    if (!e) return;
    const estado = e.c.vista();
    if (estado.permiso || estado.estado === "trabajando" || estado.estado === "pidiendo_permiso") {
      e.c.avisar("Estoy ocupado: cámbiame el nombre cuando termine.");
      return;
    }
    if (!texto.trim()) {
      e.c.avisar("Dime el nombre nuevo: /nombre Rayo");
      return;
    }
    const actual = this.d.equipo.obtener(id);
    if (!actual) return;
    const r = validarNombre(texto, this.contextoNombre(id, actual.especie));
    if (!r.ok) {
      e.c.avisar(r.motivo);
      return;
    }
    if (r.nombre === actual.nombre) {
      e.c.avisar("Ya me llamo así.");
      return;
    }
    const delaEspecie = CATALOGO.find((x) => x.especie === actual.especie)?.nombre;
    // Con el nombre de su especie ya se le entiende: el alta es para un nombre que la voz no conoce.
    if (!delaEspecie || normalizar(delaEspecie) !== normalizar(r.nombre)) this.altaAlSalir.add(id);
    this.guardarYVolver(e, () => this.d.equipo.renombrar(id, r.nombre));
  }

  /** "Cambiar de proyecto": vuelve a su pokébola y sale en la carpeta nueva. */
  cambiarCarpeta(id: string, carpeta: string): void {
    const entrada = this.viva(id);
    if (!entrada) return;
    this.guardarYVolver(entrada, () => this.d.equipo.cambiarCarpeta(id, carpeta));
  }

  /**
   * Empieza a guardarlo (el controlador deja de escribir en la base), aplica el cambio y, al terminar de
   * guardarse, lo vuelve a sacar con los datos nuevos.
   */
  private guardarYVolver(entrada: Entrada, cambio: () => void): void {
    const id = entrada.pokemon.id;
    entrada.c.guardar();
    cambio();
    this.tras.set(id, () => this.sacar(id));
  }

  /** Lo llama el controlador cuando termina de guardarse. */
  private alGuardado(id: string): void {
    this.mapa.delete(id);
    // Tras cerrar la app no se toca la base: el que estaba en pantalla vuelve al abrir.
    if (!this.cerrado) this.d.equipo.desactivar(id);
    if (this.ultimoLlamado === id) this.ultimoLlamado = null;
    const despues = this.tras.get(id);
    this.tras.delete(id);
    this.publicar();
    despues?.();
  }

  /**
   * Las vistas de todos, con `abierta` marcado: main es la AUTORIDAD de qué burbuja está abierta (Ruling T12/C24).
   * Pura: lee la apertura tal como quedó en la última publicación, sin tocarla. Todo cambio de un Pokémon publica, así
   * que coincide con lo último que vieron la guardia y el Escenario.
   */
  vistas(): VistaPokemon[] {
    return this.conSinLeer(marcarAbierta(this.crudas(), this.apertura.fijada));
  }

  /**
   * Marca `sinLeer` al que respondió algo que la persona aún no ha abierto: la marca se queda hasta que abra su burbuja,
   * aunque el chip de la respuesta ya se haya ido.
   */
  private conSinLeer(vistas: VistaPokemon[]): VistaPokemon[] {
    return vistas.map((v) => {
      if (v.abierta) {
        this.leido.set(v.id, v.ultimaRespuesta);
        this.sinLeer.delete(v.id);
      } else if (v.ultimaRespuesta !== null && this.leido.get(v.id) !== v.ultimaRespuesta) {
        this.sinLeer.add(v.id);
      }
      return this.sinLeer.has(v.id) ? { ...v, sinLeer: true } : v;
    });
  }

  private crudas(): VistaPokemon[] {
    return this.conCombates([...this.mapa.values()].map((e) => e.c.vista()));
  }

  /** El id de la burbuja abierta ahora mismo, o null si no hay ninguna. */
  abierta(): string | null {
    return this.vistas().find((v) => v.abierta)?.id ?? null;
  }

  /**
   * La persona eligió la burbuja de `id` (su chip, o un clic sobre él): queda abierta hasta que la suelte con otro clic, elija
   * otra o la suelte la regla (C25). Solo para un Pokémon vivo. Republica: la guardia de voz empieza a contar su
   * permiso desde ahora y deja de contar el de la que se cerró.
   */
  elegir(id: string): void {
    if (!this.viva(id)) return;
    const crudas = this.crudas();
    this.apertura = elegirBurbuja(actualizarApertura(this.apertura, crudas), id, crudas);
    this.publicar();
  }

  /**
   * Pone al día la apertura (la fijada se suelta con un permiso o un borrador nuevos, o cuando el fijado se queda sin
   * nada) y publica las vistas marcadas. La llama cada cambio de un Pokémon y también index.ts cuando el Escenario
   * pide la vista.
   */
  publicar(): void {
    this.seguirCombates();
    this.seguirEncargos();
    this.apertura = actualizarApertura(this.apertura, this.crudas());
    this.d.alCambiarEquipo(this.vistas());
  }

  /** Texto escrito en la burbuja del Pokémon `id`: /llamar y /guardar los atiende el equipo; el resto, él. */
  comando(id: string, texto: string): void {
    const e = this.viva(id);
    if (!e) return;
    const t = texto.trim();
    if (/^\/guardar(?:\s|$)/i.test(t)) {
      this.guardar(id);
      return;
    }
    const nombre = /^\/nombre(?:\s+([\s\S]*))?$/i.exec(t);
    if (nombre) {
      this.renombrar(id, nombre[1] ?? "");
      return;
    }
    const delEquipo = /^\/equipo(?:\s+([\s\S]*))?$/i.exec(t);
    if (delEquipo) {
      e.c.avisar(this.sacarEquipo(delEquipo[1] ?? ""));
      return;
    }
    const reto = /^\/combate(?:\s+(\S+))?\s*$/i.exec(t);
    if (reto) {
      this.combate(id, reto[1] ?? "");
      return;
    }
    const llamada = /^\/llamar(?:\s+(\S+)(?:\s+([\s\S]*))?)?$/i.exec(t);
    if (llamada) {
      if (!llamada[1]) {
        e.c.avisar("Dime a quién: /llamar charmander");
        return;
      }
      this.llamar(id, llamada[1], (llamada[2] ?? "").trim());
      return;
    }
    // "llama a escuela para que…" escrito tal cual: si el nombre es de una especie disponible, se llama aquí
    // mismo, sin depender de que Claude Code decida usar su herramienta.
    const dicha = t.startsWith("/") ? null : leerLlamada(t);
    if (dicha) {
      // Antes que el catálogo: alguien del equipo con ese nombre propio (o apodo) es a quien se llama.
      if (buscarMiembro(dicha.nombreEspecie, this.candidatosDelEquipo())) {
        this.llamar(id, dicha.nombreEspecie, dicha.encargo);
        return;
      }
      const disponibles = this.d.especiesDisponibles();
      if (resolverExacta(dicha.nombreEspecie, disponibles)) {
        this.llamar(id, dicha.nombreEspecie, dicha.encargo);
        return;
      }
      // Solo se le parece ("llama a Karina" ~ Kakuna): no se crea a nadie, se sugiere.
      const parecida = resolverEspecie(dicha.nombreEspecie, disponibles);
      if (parecida) {
        e.c.avisar(`No conozco a «${dicha.nombreEspecie}». ¿Quisiste decir ${parecida.nombre}?`);
        return;
      }
    }
    e.c.comando(texto);
  }

  /**
   * Combate de revisión: el Pokémon `retadorId` revisa el último trabajo del rival (otro que esté en pantalla, por
   * su nombre). Se ve como batalla mientras revisa y el veredicto que deja escrito decide quién gana. Devuelve true
   * si el combate empezó.
   */
  combate(retadorId: string, nombreRival: string): boolean {
    const retador = this.viva(retadorId);
    if (!retador) return false;
    const otros = [...this.mapa.values()].filter(
      (e) => e.pokemon.id !== retadorId && this.viva(e.pokemon.id),
    );
    const rival = nombreRival
      ? otros.find(
          (e) =>
            resolverEspecie(nombreRival, [{ especie: e.pokemon.especie, nombre: e.pokemon.nombre }]) !== null,
        )
      : otros.length === 1
        ? otros[0]
        : undefined;
    if (!rival) {
      retador.c.avisar(
        otros.length === 0
          ? "Para un combate necesito a otro Pokémon en pantalla."
          : `Dime contra quién: /combate ${otros[0].pokemon.nombre.toLowerCase()}`,
      );
      return false;
    }
    if (this.enCombate(retadorId) || this.enCombate(rival.pokemon.id)) {
      retador.c.avisar("Ya hay un combate en curso con uno de los dos.");
      return false;
    }
    const respuesta = rival.c.vista().ultimaRespuesta;
    if (!respuesta) {
      retador.c.avisar(`${rival.pokemon.nombre} todavía no ha hecho nada que revisar.`);
      return false;
    }
    const estado = retador.c.vista().estado;
    if (estado === "trabajando" || estado === "pidiendo_permiso") {
      retador.c.avisar("Termino lo que estoy haciendo y me retas de nuevo.");
      return false;
    }
    this.combates.set(retadorId, { rivalId: rival.pokemon.id, empezo: false, resultado: null });
    retador.c.ejecutar({
      tipo: "orden",
      id: retadorId,
      texto: encargoCombate({ nombre: rival.pokemon.nombre, carpeta: rival.pokemon.carpeta, respuesta }),
    });
    this.publicar();
    return true;
  }

  private enCombate(id: string): boolean {
    return [...this.combates].some(([retador, c]) => retador === id || c.rivalId === id);
  }

  /**
   * Sigue cada combate con lo último que publicó el retador: empieza cuando se pone a trabajar y termina cuando
   * deja de hacerlo; entonces se lee el veredicto y el final queda a la vista RESULTADO_MS. Si alguno de los dos ya
   * no está, el combate se acaba sin ganador.
   */
  private seguirCombates(): void {
    for (const [retadorId, c] of this.combates) {
      const retador = this.viva(retadorId);
      if (!retador || !this.viva(c.rivalId)) {
        this.combates.delete(retadorId);
        continue;
      }
      if (c.resultado !== null) continue;
      const vista = retador.c.vista();
      const ocupado = vista.estado === "trabajando" || vista.estado === "pidiendo_permiso";
      if (ocupado) {
        c.empezo = true;
        continue;
      }
      if (!c.empezo) continue;
      c.resultado = vista.estado === "error" ? "nadie" : (leerVeredicto(vista.ultimaRespuesta) ?? "nadie");
      this.d.programar(() => {
        if (this.combates.get(retadorId) === c) {
          this.combates.delete(retadorId);
          this.publicar();
        }
      }, RESULTADO_MS);
    }
  }

  /** Marca en las vistas quién combate con quién y, al final, quién ganó. */
  private conCombates(vistas: VistaPokemon[]): VistaPokemon[] {
    if (this.combates.size === 0) return vistas;
    return vistas.map((v) => {
      for (const [retadorId, c] of this.combates) {
        const papel = v.id === retadorId ? "retador" : v.id === c.rivalId ? "defensor" : null;
        if (papel === null) continue;
        // Aprobado: el trabajo del defensor aguantó y gana él. Rechazado: gana el retador.
        const ganaDefensor = c.resultado === "aprobado";
        const resultado =
          c.resultado === null || c.resultado === "nadie"
            ? undefined
            : (papel === "defensor") === ganaDefensor
              ? ("gana" as const)
              : ("pierde" as const);
        return {
          ...v,
          combate: {
            rivalId: papel === "retador" ? c.rivalId : retadorId,
            papel,
            ...(resultado ? { resultado } : {}),
          },
        };
      }
      return v;
    });
  }

  /** Botón "Reintentar" de la burbuja del Pokémon `id`. */
  reintentar(id: string): void {
    this.viva(id)?.c.reintentar();
  }

  /** Detiene la tarea en curso del Pokémon `id`. Nunca aprueba nada. */
  detener(id: string): void {
    this.viva(id)?.c.detener();
  }

  /** Con qué modelo corre ahora el Pokémon `id` (el de su ficha), o null si no está vivo en pantalla. */
  modeloDe(id: string): string | null {
    return this.viva(id)?.c.modelo() ?? null;
  }

  /**
   * Menú «Modelo»: lo aplica a la sesión de ese Pokémon como `/model` y lo deja guardado. Solo los de la lista y solo
   * si está vivo en pantalla. No toca permisos.
   */
  cambiarModelo(id: string, modelo: string): boolean {
    const e = this.viva(id);
    if (!e || !esModeloElegible(modelo)) return false;
    e.c.cambiarModelo(modelo);
    return true;
  }

  /** Menú del Pokémon `id`: "Enseñarle mi voz". Solo si está vivo en pantalla. */
  iniciarAlta(id: string): void {
    this.viva(id)?.c.iniciarAlta();
  }

  /** Menú del Pokémon `id`: "Llevar al Centro Pokémon". Solo si está vivo en pantalla. */
  curar(id: string): void {
    this.viva(id)?.c.curar();
  }

  /** Un aviso en la burbuja del Pokémon `id` (p. ej. desde la barra de menú). Solo si está vivo en pantalla. */
  avisar(id: string, texto: string): void {
    this.viva(id)?.c.avisar(texto);
  }

  /** Comandos que se pueden escribir en la burbuja del Pokémon `id`; ninguno si no está vivo en pantalla. */
  async comandos(id: string): Promise<ComandoVista[]> {
    return (await this.viva(id)?.c.comandos()) ?? [];
  }

  /**
   * Escape: cancela el borrador que se ve, el de la burbuja abierta (la misma regla que la dibuja). Si la abierta no
   * tiene borrador, el de id más alto (el más reciente; el contador es compartido y creciente).
   */
  cancelarBorradorActual(): void {
    const conBorrador = this.vivas().filter((e) => e.c.vista().borrador !== null);
    const abierta = this.abierta();
    const visible = conBorrador.find((e) => e.pokemon.id === abierta);
    const masReciente = conBorrador.sort(
      (a, b) => (b.c.vista().borrador ?? 0) - (a.c.vista().borrador ?? 0),
    )[0];
    (visible ?? masReciente)?.c.cancelar();
  }

  hayBorrador(): boolean {
    return this.vivas().some((e) => e.c.vista().borrador !== null);
  }

  pausarOido(pausado: boolean): void {
    this.pausado = pausado;
    for (const e of this.mapa.values()) e.c.pausarOido(pausado);
    if (pausado) this.suspenderAltas();
    else this.arrancarAltasPendientes();
  }

  ponerMicrofono(disponible: boolean): void {
    this.microfono = disponible;
    for (const e of this.mapa.values()) e.c.ponerMicrofono(disponible);
    if (!disponible) this.suspenderAltas();
    else this.arrancarAltasPendientes();
  }

  tic(): void {
    for (const e of this.mapa.values()) e.c.tic();
    this.evolucionar();
  }

  /**
   * Evolución: el que ya terminó las tareas que pide su especie vuelve a su pokébola y sale evolucionado, con su
   * conversación intacta. Solo cuando anda libre (no interrumpe un trabajo, un permiso ni una respuesta), uno por
   * vez, y nunca si ya existe otro de la especie nueva o no están sus sprites.
   */
  private evolucionar(): void {
    const libres = [...this.mapa.values()].filter((e) => {
      const estado = e.c.vista().estado;
      const id = e.pokemon.id;
      return this.viva(id) && !this.enCombate(id) && (estado === "paseando" || estado === "esperando");
    });
    if (libres.length === 0) return;
    const todos = this.d.equipo.todos();
    for (const entrada of libres) {
      const id = entrada.pokemon.id;
      const actual = todos.find((p) => p.id === id);
      if (!actual) continue;
      const destino = evolucionPara(actual.especie, actual.tareas);
      if (destino === null || todos.some((p) => p.especie === destino)) continue;
      const especie = this.d.especiesDisponibles().find((e) => e.especie === destino);
      if (!especie) continue;
      const voz = this.vozPara(especie.especie, id);
      const antes = actual.nombre;
      const trabajo = entrada.c.vista().ultimaRespuesta ?? null;
      // Con nombre propio sigue llamándose así (y con lo que ya se le aprendió); si no, toma el de la especie nueva.
      const propio = this.conNombrePropio(actual);
      entrada.c.guardar();
      if (propio) this.d.equipo.cambiarEspecie(id, especie.especie, antes, voz.voz, voz.velocidad, true);
      else this.d.equipo.cambiarEspecie(id, especie.especie, especie.nombre, voz.voz, voz.velocidad);
      this.tras.set(id, () => {
        if (!this.sacar(id)) return;
        const nuevo = this.mapa.get(id)?.c;
        nuevo?.recordar(trabajo);
        nuevo?.avisar(`¡${antes} evolucionó a ${especie.nombre}!`);
      });
      return;
    }
  }

  /**
   * Salir de la app: cierra la sesión de todos (niega lo pendiente) sin guardarlos, para que al abrir vuelvan los
   * mismos con su conversación. El que se estaba guardando sin volver a salir ("vuelve" justo antes de salir) se
   * desactiva ya en la base: la app no espera a que termine y, si no, reaparecería al abrir. El que se guarda para
   * volver a salir (cambio de especie o de carpeta) sigue activo.
   */
  cerrar(): void {
    // Una segunda llamada vería a todos ya cerrados (instancia null) y los desactivaría: solo la primera cuenta.
    if (this.cerrado) return;
    for (const [id, e] of this.mapa) {
      if (!this.tras.has(id) && e.c.instancia(id) === null) this.d.equipo.desactivar(id);
    }
    this.cerrado = true;
    for (const cancelar of this.pendientesArranque) cancelar();
    this.pendientesArranque = [];
    for (const e of this.mapa.values()) e.c.cerrarSesion();
  }

  // --- ControladorFrases: todo enrutado por id ---

  contexto(): Contexto {
    const todos = this.vivas().map((e) => e.c.contexto());
    // Sin nombre solo vale justo después de llamarlo: el último llamado, y solo si él mismo sigue atento.
    const ultimo = this.ultimoLlamado ? this.viva(this.ultimoLlamado) : undefined;
    const atento = ultimo?.c.contexto().escuchandoA === this.ultimoLlamado ? this.ultimoLlamado : null;
    return {
      candidatos: sinChoques(todos.flatMap((c) => c.candidatos)),
      permisosDe: todos.flatMap((c) => c.permisosDe),
      borradoresDe: todos.flatMap((c) => c.borradoresDe),
      escuchandoA: atento,
      altaDe: todos.find((c) => c.altaDe)?.altaDe ?? null,
    };
  }

  /** Nunca responde permisos: el controlador los ignora en `ejecutar` y aquí no hay otro camino. */
  ejecutar(d: Decision): void {
    if (d.tipo === "ignorar") return;
    if (d.tipo === "llamar") {
      this.llamar(d.id, d.nombreEspecie, d.encargo);
      return;
    }
    if (d.tipo === "guardar") {
      this.guardar(d.id);
      return;
    }
    const e = this.viva(d.id);
    if (!e) return;
    if (d.tipo === "atencion" || d.tipo === "orden") this.ultimoLlamado = d.id;
    e.c.ejecutar(d);
  }

  responderPermisoDe(permitir: boolean, pokemonId: string, permisoId: string): void {
    this.viva(pokemonId)?.c.responderPermisoDe(permitir, pokemonId, permisoId);
  }

  /**
   * Camino del clic: responde solo si la burbuja de `pokemonId` es la abierta (el bloque del permiso solo se dibuja
   * ahí), y después el controlador comprueba que `permisoId` es el que tiene a la vista.
   */
  responderPermisoConClic(permitir: boolean, pokemonId: string, permisoId: string): void {
    if (this.abierta() !== pokemonId) return;
    this.responderPermisoDe(permitir, pokemonId, permisoId);
  }

  instancia(id: string): object | null {
    return this.viva(id)?.c.instancia(id) ?? null;
  }

  abrirBorrador(id: string, texto: string): IdBorrador | null {
    const e = this.viva(id);
    if (!e) return null;
    this.ultimoLlamado = id;
    return e.c.abrirBorrador(id, texto);
  }

  continuarBorrador(id: string, texto: string): { borrador: IdBorrador; parte: number } | null {
    const e = this.viva(id);
    if (!e) return null;
    this.ultimoLlamado = id;
    return e.c.continuarBorrador(id, texto);
  }

  voz(hablando: boolean): void {
    for (const e of this.mapa.values()) e.c.voz(hablando);
  }

  transcribiendo(activo: boolean): void {
    for (const e of this.mapa.values()) e.c.transcribiendo(activo);
  }
}
