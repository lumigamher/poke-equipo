import type { Pokemon } from "@compartido/tipos";
import { describe, expect, it } from "vitest";
import { afinar, type Contexto, type Decision, decidir } from "../entrenador/entrenador";
import type { Frase } from "../oido/transcriptor";
import type { EventoSesion, OpcionesSesion, Sesion } from "../sesion/sesion";
import { BORRADOR_MS, Controlador, PRECISO_MAX_MS, VOZ_SIN_TROZO_MS } from "./controlador";
import { resolverEspecie, resolverExacta } from "./especie-oida";
import { CATALOGO, type Especie } from "./especies";
import { type ControladorFrases, crearManejadorFrases } from "./frases";
import { crearGuardiaPermiso } from "./guardia-permiso";

const T = 100_000;

/** Reloj falso: `programar` y `avanzar`, en pasos (una tarea nueva cuenta desde el instante en que se programa). */
function relojFalso() {
  let t = 0;
  const tareas: { en: number; fn: () => void; viva: boolean }[] = [];
  return {
    ahora: () => t,
    programar(fn: () => void, ms: number) {
      const tarea = { en: t + ms, fn, viva: true };
      tareas.push(tarea);
      return () => {
        tarea.viva = false;
      };
    },
    avanzar(ms: number) {
      t += ms;
      for (const tarea of [...tareas])
        if (tarea.viva && tarea.en <= t) {
          tarea.viva = false;
          tarea.fn();
        }
    },
  };
}

/** Deja correr todas las continuaciones de promesas pendientes. */
const vaciar = () => new Promise<void>((r) => setImmediate(r));

/** Una promesa que se resuelve o rechaza a mano. */
function diferida<T>() {
  let resolver!: (v: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

type Preciso = string | Promise<string> | (() => Promise<string>);

/** Arma una frase cuyo paso preciso cuenta cuántas veces se pidió. */
function fabricaFrases() {
  const llamadas = { n: 0 };
  const frase = (
    rapido: string,
    inicioMs: number | null,
    preciso: Preciso = rapido,
    duracionMs?: number,
  ): Frase => ({
    rapido,
    duracionMs,
    preciso: () => {
      llamadas.n += 1;
      if (typeof preciso === "function") return preciso();
      return Promise.resolve(preciso);
    },
    inicioMs,
  });
  return { frase, llamadas };
}

/**
 * Un controlador falso con dos Pokémon (Pikachu p1 y Charmander p2), cada uno con su cola de permisos; registra lo
 * que le llega. La guardia es la real. `instancia(id)` devuelve una ficha por Pokémon que cambia al guardarlo,
 * al sacarlo otra vez o al cambiar el controlador.
 */
function montar(opciones: { especies?: Especie[] } = {}) {
  const { especies } = opciones;
  const guardia = crearGuardiaPermiso();
  const reloj = relojFalso();
  const nombres: Record<string, string> = { p1: "Pikachu", p2: "Charmander" };
  const colas: Record<string, string[]> = { p1: [], p2: [] };
  const fichas: Record<string, object | null> = { p1: {}, p2: {} };
  /** Respuestas aplicadas: [permitir, pokemonId, permisoId]. */
  const respuestas: [boolean, string, string][] = [];
  /** Toda llamada a responderPermisoDe, se aplique o no. */
  const intentos: [boolean, string, string][] = [];
  const ejecutados: Decision[] = [];
  const avisos: string[] = [];
  const presentes = () => Object.keys(colas).filter((id) => fichas[id] !== null);
  const c: ControladorFrases = {
    contexto: (): Contexto => ({
      candidatos: presentes().map((id) => ({ id, nombre: nombres[id], apodos: [] })),
      permisosDe: presentes()
        .filter((id) => colas[id].length > 0)
        .map((id) => ({ id, permisoId: colas[id][0] })),
      borradoresDe: [],
      escuchandoA: null,
      altaDe: null,
    }),
    ejecutar: (d: Decision) => {
      if (d.tipo === "permiso") throw new Error("la voz no debe usar el camino sin id");
      ejecutados.push(d);
    },
    instancia: (id: string) => fichas[id] ?? null,
    responderPermisoDe: (permitir: boolean, pokemonId: string, permisoId: string) => {
      intentos.push([permitir, pokemonId, permisoId]);
      // Como el controlador real: solo responde a la cabeza de la cola de ESE Pokémon, y si sigue en pantalla.
      if (fichas[pokemonId] == null || colas[pokemonId]?.[0] !== permisoId) return;
      colas[pokemonId].shift();
      respuestas.push([permitir, pokemonId, permisoId]);
    },
    abrirBorrador: () => null,
    continuarBorrador: () => null,
    voz: () => {},
  };
  let actual: ControladorFrases | null = c;
  const manejar = crearManejadorFrases({
    decidir,
    afinar,
    guardia,
    controlador: () => actual,
    programar: reloj.programar,
    aviso: (mensaje) => avisos.push(mensaje),
    especieOida: especies ? (oido) => resolverEspecie(oido, especies) : undefined,
    especieExacta: especies ? (oido) => resolverExacta(oido, especies) : undefined,
  });
  /** Publica a la guardia lo que hay a la vista, como `alCambiar`. */
  /** Pokémon cuyo permiso sigue en cola pero no se ve (p. ej. quedó en chip): la guardia no lo cuenta. */
  const ocultos = new Set<string>();
  const publicar = (ahora: number) =>
    guardia.alVista(
      presentes().map((id) => ({
        id,
        permiso: colas[id][0] && !ocultos.has(id) ? { id: colas[id][0] } : null,
      })),
      ahora,
    );
  /** Un permiso entra a la cola de ese Pokémon. */
  const mostrar = (permisoId: string, ahora: number, pokemonId = "p1") => {
    colas[pokemonId].push(permisoId);
    publicar(ahora);
  };
  /** Un clic resuelve la cabeza de la cola de ese Pokémon. */
  const avanzar = (ahora: number, pokemonId = "p1") => {
    colas[pokemonId].shift();
    publicar(ahora);
  };
  return {
    manejar,
    mostrar,
    avanzar,
    /** La cola de Pikachu. */
    permisos: colas.p1,
    colas,
    respuestas,
    intentos,
    ejecutados,
    reloj,
    avisos,
    ...fabricaFrases(),
    /** Otro controlador: las fichas de todos cambian. */
    cambiarControlador: () => {
      for (const id of Object.keys(fichas)) fichas[id] = {};
      actual = { ...c };
    },
    /** El permiso de ese Pokémon deja de verse (true) o vuelve a verse (false) sin salir de la cola. */
    ocultar: (pokemonId: string, oculto: boolean, ahora: number) => {
      if (oculto) ocultos.add(pokemonId);
      else ocultos.delete(pokemonId);
      publicar(ahora);
    },
    /** El Pokémon vuelve a su pokébola: sus permisos se niegan y deja de estar en pantalla. */
    guardar: (pokemonId: string, ahora: number) => {
      colas[pokemonId].length = 0;
      fichas[pokemonId] = null;
      publicar(ahora);
    },
    /** El Pokémon sale otra vez: una instancia nueva con la misma id. */
    sacar: (pokemonId: string, ahora: number) => {
      fichas[pokemonId] = {};
      publicar(ahora);
    },
  };
}

describe("frases y permisos", () => {
  it("(a) una frase que empezó 100 ms después de mostrarse no responde y el permiso sigue pendiente", async () => {
    const m = montar();
    m.mostrar("A", T);
    m.manejar(m.frase("dale", T + 100));
    await vaciar();
    expect(m.intentos).toEqual([]);
    expect(m.permisos).toEqual(["A"]);
    expect(m.ejecutados).toEqual([]);
    expect(m.llamadas.n).toBe(0);
  });

  it("(a') un no que empezó antes de 800 ms tampoco niega", () => {
    const m = montar();
    m.mostrar("A", T);
    m.manejar(m.frase("no", T + 100));
    expect(m.intentos).toEqual([]);
    expect(m.permisos).toEqual(["A"]);
  });

  it("(b) con 900 ms de margen responde una vez, con el id del Pokémon y del permiso", async () => {
    const m = montar();
    m.mostrar("A", T);
    m.manejar(m.frase("dale", T + 900));
    await vaciar();
    expect(m.respuestas).toEqual([[true, "p1", "A"]]);
    expect(m.intentos).toHaveLength(1);
  });

  it("(c) A respondido con un clic y B mostrado a T+500: una frase de T+300 no responde B", async () => {
    const m = montar();
    m.mostrar("A", T);
    m.mostrar("B", T);
    m.avanzar(T + 500); // clic en A: ahora se ve B
    expect(m.permisos).toEqual(["B"]);
    m.manejar(m.frase("sí, dale", T + 300));
    await vaciar();
    expect(m.intentos).toEqual([]);
    expect(m.permisos).toEqual(["B"]);
    m.manejar(m.frase("dale", T + 500 + 800));
    await vaciar();
    expect(m.respuestas).toEqual([[true, "p1", "B"]]);
  });

  it("(d) sin hora de inicio no responde", async () => {
    const m = montar();
    m.mostrar("A", T);
    m.manejar(m.frase("dale", null));
    await vaciar();
    expect(m.intentos).toEqual([]);
    expect(m.permisos).toEqual(["A"]);
  });

  describe("aprobar por voz exige las dos transcripciones", () => {
    it("rápido dale y preciso dale: se aprueba una vez, con el id, y solo cuando llega el preciso", async () => {
      const m = montar();
      const d = diferida<string>();
      m.mostrar("A", T);
      m.manejar(m.frase("dale", T + 900, d.promesa));
      await vaciar();
      expect(m.intentos).toEqual([]); // el paso preciso aún no llega
      d.resolver("dale");
      await vaciar();
      expect(m.respuestas).toEqual([[true, "p1", "A"]]);
      expect(m.llamadas.n).toBe(1);
    });

    it("rápido dale y preciso 'vale la pena': no se hace nada", async () => {
      const m = montar();
      m.mostrar("A", T);
      m.manejar(m.frase("dale", T + 900, "vale la pena"));
      await vaciar();
      expect(m.intentos).toEqual([]);
      expect(m.permisos).toEqual(["A"]);
    });

    it("rápido dale y preciso no: no se aprueba (ni se niega con el preciso)", async () => {
      const m = montar();
      m.mostrar("A", T);
      m.manejar(m.frase("dale", T + 900, "no"));
      await vaciar();
      expect(m.intentos).toEqual([]);
      expect(m.permisos).toEqual(["A"]);
    });

    it("rápido dale y preciso vacío: no se cae al texto rápido", async () => {
      const m = montar();
      m.mostrar("A", T);
      m.manejar(m.frase("dale", T + 900, ""));
      await vaciar();
      expect(m.intentos).toEqual([]);
    });

    it("rápido dale y el paso preciso rechaza: no se cae al texto rápido, no se hace nada", async () => {
      const m = montar();
      const d = diferida<string>();
      m.mostrar("A", T);
      m.manejar(m.frase("dale", T + 900, d.promesa));
      d.rechazar(new Error("sherpa"));
      await vaciar();
      expect(m.intentos).toEqual([]);
      expect(m.permisos).toEqual(["A"]);
      expect(m.avisos).toHaveLength(1);
    });

    it("rápido dale y el paso preciso lanza al pedirse: tampoco se aprueba", async () => {
      const m = montar();
      m.mostrar("A", T);
      m.manejar(
        m.frase("dale", T + 900, () => {
          throw new Error("sherpa");
        }),
      );
      await vaciar();
      expect(m.intentos).toEqual([]);
      expect(m.avisos).toHaveLength(1);
    });

    it("rápido dale y el preciso no llega en PRECISO_MAX_MS: no se aprueba, ni aunque llegue después", async () => {
      const m = montar();
      const d = diferida<string>();
      m.mostrar("A", T);
      m.manejar(m.frase("dale", T + 900, d.promesa));
      m.reloj.avanzar(PRECISO_MAX_MS - 1);
      m.reloj.avanzar(1);
      await vaciar();
      expect(m.intentos).toEqual([]);
      d.resolver("dale");
      await vaciar();
      expect(m.intentos).toEqual([]);
      expect(m.permisos).toEqual(["A"]);
    });

    it("rápido no: se niega al instante, sin pedir el paso preciso", () => {
      const m = montar();
      m.mostrar("A", T);
      m.manejar(m.frase("no", T + 900, "vale la pena"));
      expect(m.respuestas).toEqual([[false, "p1", "A"]]); // sin esperar ni una microtarea
      expect(m.llamadas.n).toBe(0);
    });

    it("si el permiso cambia mientras se espera el preciso, no se aprueba el nuevo", async () => {
      const m = montar();
      const d = diferida<string>();
      m.mostrar("A", T);
      m.manejar(m.frase("dale", T + 900, d.promesa));
      m.avanzar(T + 950); // un clic resuelve A mientras corre el paso preciso
      m.mostrar("B", T + 950);
      d.resolver("dale");
      await vaciar();
      expect(m.intentos).toEqual([]);
      expect(m.permisos).toEqual(["B"]);
    });

    it("un id de permiso viejo no aprueba el nuevo aunque el nuevo lleve tiempo a la vista", async () => {
      const m = montar();
      const d = diferida<string>();
      m.mostrar("A", T);
      m.manejar(m.frase("dale", T + 900, d.promesa));
      m.avanzar(T - 5_000); // A resuelto y B a la vista "desde antes": la guardia daría B por bueno
      m.mostrar("B", T - 5_000);
      d.resolver("dale");
      await vaciar();
      expect(m.intentos).toEqual([]);
      expect(m.permisos).toEqual(["B"]);
    });

    it("si el permiso desapareció mientras se espera el preciso, no se hace nada", async () => {
      const m = montar();
      const d = diferida<string>();
      m.mostrar("A", T);
      m.manejar(m.frase("dale", T + 900, d.promesa));
      m.avanzar(T + 950);
      d.resolver("dale");
      await vaciar();
      expect(m.intentos).toEqual([]);
    });

    it("si cambió el controlador mientras se espera, no se aprueba", async () => {
      const m = montar();
      const d = diferida<string>();
      m.mostrar("A", T);
      m.manejar(m.frase("dale", T + 900, d.promesa));
      m.cambiarControlador();
      d.resolver("dale");
      await vaciar();
      expect(m.intentos).toEqual([]);
      expect(m.permisos).toEqual(["A"]);
    });

    it("si el Pokémon se guardó mientras se decidía, la respuesta de voz se descarta", async () => {
      const m = montar();
      const d = diferida<string>();
      m.mostrar("A", T);
      m.manejar(m.frase("dale", T + 900, d.promesa));
      m.guardar("p1", T + 950);
      d.resolver("dale");
      await vaciar();
      expect(m.intentos).toEqual([]);
    });

    it("si el Pokémon se guardó y volvió a salir (otra instancia, mismo id y permiso), no se aprueba", async () => {
      const m = montar();
      const d = diferida<string>();
      m.mostrar("A", T);
      m.manejar(m.frase("dale", T + 900, d.promesa));
      m.guardar("p1", T + 950);
      m.sacar("p1", T + 960);
      // Misma hora de antes para aislar la comprobación de instancia: la guardia, sola, lo daría por bueno.
      m.mostrar("A", T);
      d.resolver("dale");
      await vaciar();
      expect(m.intentos).toEqual([]);
      expect(m.permisos).toEqual(["A"]);
    });

    it("si el permiso dejó de verse y volvió mientras se espera el preciso, cuenta desde que volvió", async () => {
      const m = montar();
      const d = diferida<string>();
      m.mostrar("A", T);
      m.manejar(m.frase("dale", T + 900, d.promesa));
      m.ocultar("p1", true, T + 950);
      m.ocultar("p1", false, T + 1_000); // la frase empezó antes de volver a verlo
      d.resolver("dale");
      await vaciar();
      expect(m.intentos).toEqual([]);
      expect(m.permisos).toEqual(["A"]);
    });

    it("si el preciso nombra a otro Pokémon, no se aprueba ni el de la primera decisión ni el del nombrado", async () => {
      const m = montar();
      const d = diferida<string>();
      m.mostrar("A", T);
      m.manejar(m.frase("dale", T + 900, d.promesa)); // solo A a la vista: el rápido decide p1/A
      m.mostrar("B", T - 5_000, "p2");
      d.resolver("Charmander, dale");
      await vaciar();
      expect(m.intentos).toEqual([]);
      expect(m.colas).toEqual({ p1: ["A"], p2: ["B"] });
    });
  });

  describe("dos Pokémon con permiso a la vista", () => {
    it("un sí sin nombre no aprueba ninguno y no pide el preciso", async () => {
      const m = montar();
      m.mostrar("A", T, "p1");
      m.mostrar("B", T, "p2");
      m.manejar(m.frase("dale", T + 900));
      await vaciar();
      expect(m.intentos).toEqual([]);
      expect(m.llamadas.n).toBe(0);
      expect(m.colas).toEqual({ p1: ["A"], p2: ["B"] });
    });

    it("un no sin nombre tampoco niega ninguno", () => {
      const m = montar();
      m.mostrar("A", T, "p1");
      m.mostrar("B", T, "p2");
      m.manejar(m.frase("no", T + 900));
      expect(m.intentos).toEqual([]);
    });

    it("'Charmander, sí' aprueba solo el de Charmander, con su id", async () => {
      const m = montar();
      m.mostrar("A", T, "p1");
      m.mostrar("B", T, "p2");
      m.manejar(m.frase("Charmander, sí", T + 900));
      await vaciar();
      expect(m.respuestas).toEqual([[true, "p2", "B"]]);
      expect(m.colas).toEqual({ p1: ["A"], p2: [] });
    });

    it("el permiso de Charmander pide su propio margen aunque el de Pikachu ya lleve tiempo", async () => {
      const m = montar();
      m.mostrar("A", T, "p1");
      m.mostrar("B", T + 5_000, "p2");
      m.manejar(m.frase("Charmander, sí", T + 5_100));
      await vaciar();
      expect(m.intentos).toEqual([]);
      m.manejar(m.frase("Pikachu, sí", T + 5_100));
      await vaciar();
      expect(m.respuestas).toEqual([[true, "p1", "A"]]);
    });
  });

  it("una frase descartada no se convierte en orden ni en atención", async () => {
    const m = montar();
    m.mostrar("A", T);
    m.manejar(m.frase("Pikachu, sí", T + 10));
    await vaciar();
    expect(m.ejecutados).toEqual([]);
    expect(m.llamadas.n).toBe(0);
  });
});

describe("llamar y guardar esperan al paso preciso", () => {
  it("'Pikachu, vuelve': muestra que oyó al instante y guarda cuando el preciso dice lo mismo", async () => {
    const m = montar();
    const d = diferida<string>();
    m.manejar(m.frase("Pikachu, vuelve", T, d.promesa));
    expect(m.ejecutados).toEqual([{ tipo: "atencion", id: "p1" }]);
    d.resolver("Pikachu, vuelve.");
    await vaciar();
    expect(m.ejecutados).toEqual([
      { tipo: "atencion", id: "p1" },
      { tipo: "guardar", id: "p1" },
    ]);
  });

  it("solo el preciso dice guardar: rápido 'Pikachu' y preciso 'Pikachu, vete' lo guarda", async () => {
    const m = montar();
    m.manejar(m.frase("Pikachu", T, "Pikachu, vete"));
    expect(m.ejecutados).toEqual([{ tipo: "atencion", id: "p1" }]);
    await vaciar();
    expect(m.ejecutados).toEqual([
      { tipo: "atencion", id: "p1" },
      { tipo: "guardar", id: "p1" },
    ]);
  });

  it("si el preciso entendió otra cosa, no se guarda", async () => {
    const m = montar();
    m.manejar(m.frase("Pikachu, vuelve", T, "Pikachu, revisa el login"));
    await vaciar();
    expect(m.ejecutados.filter((e) => e.tipo === "llamar" && e.nombreEspecie !== "")).toEqual([]);
  });

  it("si el preciso nombra a otro Pokémon, no se guarda a ninguno", async () => {
    const m = montar();
    m.manejar(m.frase("Pikachu, vuelve", T, "Charmander, vuelve"));
    await vaciar();
    expect(m.ejecutados.filter((e) => e.tipo === "llamar" && e.nombreEspecie !== "")).toEqual([]);
  });

  it("si el preciso falla o no llega, no se guarda", async () => {
    const m = montar();
    const d = diferida<string>();
    m.manejar(m.frase("Pikachu, vuelve", T, () => Promise.reject(new Error("sherpa"))));
    m.manejar(m.frase("Charmander, vuelve", T, d.promesa));
    m.reloj.avanzar(PRECISO_MAX_MS);
    await vaciar();
    d.resolver("Charmander, vuelve");
    await vaciar();
    expect(m.ejecutados).toEqual([
      { tipo: "atencion", id: "p1" },
      { tipo: "atencion", id: "p2" },
    ]);
    expect(m.avisos).toHaveLength(2);
  });

  it("'Pikachu, llama a Bulbasaur para…' llama con el encargo del preciso si la especie coincide", async () => {
    const m = montar();
    m.manejar(
      m.frase(
        "Pikachu, llama a bulbasaur para que revise el login",
        T,
        "Pikachu, llama a Bulbasaur para que revise el Login.",
      ),
    );
    expect(m.ejecutados).toEqual([{ tipo: "atencion", id: "p1" }]);
    await vaciar();
    expect(m.ejecutados).toEqual([
      { tipo: "atencion", id: "p1" },
      { tipo: "llamar", id: "p1", nombreEspecie: "bulbasaur", encargo: "que revise el Login." },
    ]);
  });

  it("el preciso tuerce el nombre ('Tarmander'): se llama a la especie que oyó el rápido", async () => {
    const m = montar({ especies: CATALOGO });
    m.manejar(m.frase("Pikachu, llama a Charmander", T, "Pikachu yama Tarmander."));
    await vaciar();
    expect(m.ejecutados).toEqual([
      { tipo: "atencion", id: "p1" },
      { tipo: "llamar", id: "p1", nombreEspecie: "Charmander", encargo: "" },
    ]);
  });

  it("el rápido tuerce el nombre ('Skittle') y el preciso lo escribe bien: se llama a Squirtle", async () => {
    const m = montar({ especies: CATALOGO });
    m.manejar(
      m.frase("Pikachu, llama a Skittle para que revise", T, "Pikachu, llama a Squirtle para que revise."),
    );
    await vaciar();
    expect(m.ejecutados.at(-1)).toEqual({
      tipo: "llamar",
      id: "p1",
      nombreEspecie: "Squirtle",
      encargo: "que revise.",
    });
  });

  it("el rápido reconoce la especie y el preciso sale torcido sin forma de llamada: se llama igual", async () => {
    // Caso real de la persona: rápido "Pikachu ya más cuarto", preciso "que hay Pikachu jamás corto".
    const m = montar({ especies: CATALOGO });
    m.manejar(m.frase("Pikachu ya más cuarto.", T, "que hay Pikachu jamás corto"));
    await vaciar();
    expect(m.ejecutados).toEqual([
      { tipo: "atencion", id: "p1" },
      { tipo: "llamar", id: "p1", nombreEspecie: "Squirtle", encargo: "" },
    ]);
  });

  it("una llamada sin encargo cuya especie se reconoce sale al instante, sin esperar al preciso", () => {
    const m = montar({ especies: CATALOGO });
    const d = diferida<string>();
    m.manejar(m.frase("Pikachu, por favor llama a Escuela.", T, d.promesa));
    // El preciso ni siquiera ha contestado.
    expect(m.ejecutados).toEqual([
      { tipo: "atencion", id: "p1" },
      { tipo: "llamar", id: "p1", nombreEspecie: "Squirtle", encargo: "" },
    ]);
  });

  it("con encargo, la llamada sí espera al preciso: si nombra a OTRO Pokémon, no sale", async () => {
    const m = montar({ especies: CATALOGO });
    m.manejar(m.frase("Pikachu, llama a Squirtle para que revise", T, "Charmander, revisa el login"));
    await vaciar();
    expect(m.ejecutados.some((e) => e.tipo === "llamar")).toBe(false);
  });

  it("sin especie reconocible en el rápido, un preciso torcido no llama a nadie", async () => {
    const m = montar({ especies: CATALOGO });
    m.manejar(m.frase("Pikachu, llama a Carlos", T, "Pikachu, jamás corto"));
    await vaciar();
    expect(m.ejecutados.some((e) => e.tipo === "llamar")).toBe(false);
  });

  it("con encargo, si las dos transcripciones apuntan a especies distintas, no se llama a nadie", async () => {
    const m = montar({ especies: CATALOGO });
    m.manejar(
      m.frase("Pikachu, llama a Bulbasaur para que revise", T, "Pikachu, llama a Squirtle para que revise"),
    );
    await vaciar();
    expect(m.ejecutados.filter((e) => e.tipo === "llamar" && e.nombreEspecie !== "")).toEqual([]);
  });

  it("si ninguna de las dos se parece a una especie, no se llama a nadie", async () => {
    const m = montar({ especies: CATALOGO });
    m.manejar(m.frase("Pikachu, llama a Carlos", T, "Pikachu, llama a Carlos"));
    await vaciar();
    expect(m.ejecutados.filter((e) => e.tipo === "llamar" && e.nombreEspecie !== "")).toEqual([]);
  });

  it("si el preciso oyó otra especie, no se llama a nadie", async () => {
    const m = montar();
    m.manejar(m.frase("Pikachu, llama a bulbasaur", T, "Pikachu, llama a Squirtle"));
    await vaciar();
    expect(m.ejecutados.filter((e) => e.tipo === "llamar" && e.nombreEspecie !== "")).toEqual([]);
  });

  it("sin acuerdo entre las dos transcripciones, la llamada sale vacía: el Pokémon avisa que no entendió", async () => {
    const m = montar({ especies: CATALOGO });
    m.manejar(
      m.frase("Pikachu, llama a Bulbasaur para que revise", T, "Pikachu, llama a Squirtle para que revise"),
    );
    await vaciar();
    expect(m.ejecutados).toContainEqual({
      tipo: "llamar",
      id: "p1",
      nombreEspecie: "",
      encargo: "que revise",
    });
  });

  it("palabras corrientes tras «llama a» no crean un Pokémon al instante (solo coinciden de forma aproximada)", () => {
    const palabras = [
      "Karina",
      "mamá",
      "Laura",
      "master",
      "unix",
      "seda",
      "golden",
      "mago",
      "París",
      "Sandra",
    ];
    for (const w of palabras) {
      const m = montar({ especies: CATALOGO });
      m.manejar(m.frase(`Pikachu, llama a ${w}`, T, new Promise<string>(() => {})));
      expect(
        m.ejecutados.filter((e) => e.tipo === "llamar"),
        w,
      ).toEqual([]);
    }
  });

  it("una palabra solo aproximada, dicha igual en las dos transcripciones, tampoco llama: llega tal cual para sugerir", async () => {
    for (const w of ["Karina", "Laura", "mamá"]) {
      const m = montar({ especies: CATALOGO });
      m.manejar(m.frase(`Pikachu, llama a ${w}`, T, `Pikachu, llama a ${w}`));
      await vaciar();
      const llamadas = m.ejecutados.filter((e) => e.tipo === "llamar");
      expect(llamadas, w).toHaveLength(1);
      // Nunca con el nombre de una especie resuelto: el Pokémon la sugiere (o avisa que no entendió), no la crea.
      const nombre = (llamadas[0] as { nombreEspecie: string }).nombreEspecie;
      expect(resolverExacta(nombre, CATALOGO), w).toBeNull();
    }
  });

  it("con una palabra corriente, un rápido aproximado y un preciso que no la lee igual no crea a nadie", async () => {
    const m = montar({ especies: CATALOGO });
    m.manejar(m.frase("Pikachu, llama a Karina", T, "Pikachu, jamás corto"));
    await vaciar();
    expect(m.ejecutados.filter((e) => e.tipo === "llamar")).toEqual([]);
  });

  it("los nombres reales siguen saliendo al instante, también con variante curada", () => {
    for (const w of ["Squirtle", "escuirtel", "Charmander", "Mew"]) {
      const m = montar({ especies: CATALOGO });
      m.manejar(m.frase(`Pikachu, llama a ${w}`, T, new Promise<string>(() => {})));
      expect(
        m.ejecutados.filter((e) => e.tipo === "llamar"),
        w,
      ).toHaveLength(1);
    }
  });

  it("si el Pokémon se guardó mientras se esperaba el preciso, no se ejecuta", async () => {
    const m = montar();
    const d = diferida<string>();
    m.manejar(m.frase("Pikachu, llama a bulbasaur", T, d.promesa));
    m.guardar("p1", T + 100);
    d.resolver("Pikachu, llama a bulbasaur");
    await vaciar();
    expect(m.ejecutados.filter((e) => e.tipo === "llamar" && e.nombreEspecie !== "")).toEqual([]);
  });

  it("una frase posterior gana: el preciso tardío de la llamada ya no hace nada", async () => {
    const m = montar();
    const d = diferida<string>();
    m.manejar(m.frase("Pikachu, vuelve", T, d.promesa));
    m.manejar(m.frase("Pikachu", T + 500, diferida<string>().promesa));
    d.resolver("Pikachu, vuelve");
    await vaciar();
    expect(m.ejecutados).toEqual([
      { tipo: "atencion", id: "p1" },
      { tipo: "atencion", id: "p1" },
    ]);
  });

  it("una frase a OTRO Pokémon no descarta el guardar ni el llamar pendiente (la época es por Pokémon)", async () => {
    const m = montar();
    const vuelve = diferida<string>();
    const llama = diferida<string>();
    m.manejar(m.frase("Pikachu, vuelve", T, vuelve.promesa));
    // Una frase a Charmander mientras el guardar de Pikachu espera su preciso.
    m.manejar(m.frase("Charmander", T + 200, diferida<string>().promesa));
    vuelve.resolver("Pikachu, vuelve");
    await vaciar();
    m.manejar(m.frase("Charmander, llama a bulbasaur", T + 400, llama.promesa));
    // Y una a Pikachu mientras el llamar de Charmander espera el suyo.
    m.manejar(m.frase("Pikachu", T + 600, diferida<string>().promesa));
    llama.resolver("Charmander, llama a bulbasaur");
    await vaciar();
    expect(m.ejecutados).toEqual([
      { tipo: "atencion", id: "p1" },
      { tipo: "atencion", id: "p2" },
      { tipo: "guardar", id: "p1" },
      { tipo: "atencion", id: "p2" },
      { tipo: "atencion", id: "p1" },
      { tipo: "llamar", id: "p2", nombreEspecie: "bulbasaur", encargo: "" },
    ]);
  });
});

class SesionFalsa implements Sesion {
  enviados: string[] = [];
  permisos: [string, boolean][] = [];
  private fn: ((e: EventoSesion) => void) | null = null;
  constructor(public opciones: OpcionesSesion) {}
  enviar(t: string) {
    this.enviados.push(t);
  }
  resolverPermiso(id: string, permitir: boolean) {
    this.permisos.push([id, permitir]);
  }
  cerrar() {}
  alEvento(fn: (e: EventoSesion) => void) {
    this.fn = fn;
  }
  emitir(e: EventoSesion) {
    this.fn?.(e);
  }
}

const pikachu: Pokemon = {
  id: "p1",
  nombre: "Pikachu",
  especie: 25,
  voz: "voz-a",
  velocidad: 1.1,
  carpeta: "/tmp/proyecto",
  sessionId: null,
  apodos: [],
  tareas: 0,
  activo: true,
};

/** El Controlador real con la tubería de frases real; falsos solo la sesión y el reloj. */
function montarOrdenes() {
  const reloj = relojFalso();
  let sesion: SesionFalsa | null = null;
  const c = new Controlador({
    pokemon: pikachu,
    rol: "rol",
    equipo: { guardarSesion: () => {}, sumarTarea: () => {}, guardarApodos: () => {} },
    crearSesion: (o) => {
      sesion = new SesionFalsa(o);
      return sesion;
    },
    voz: { decir: async () => {}, callar: () => {} },
    reloj,
    alCambiar: () => {},
    alSonar: () => {},
    alGuardado: () => {},
  });
  c.iniciar();
  reloj.avanzar(10_000);
  c.tic();
  const avisos: string[] = [];
  let actual: ControladorFrases | null = c;
  const manejar = crearManejadorFrases({
    decidir,
    afinar,
    guardia: crearGuardiaPermiso(),
    controlador: () => actual,
    programar: reloj.programar,
    aviso: (mensaje) => avisos.push(mensaje),
  });
  return {
    c,
    reloj,
    manejar,
    avisos,
    sesion: () => sesion as unknown as SesionFalsa,
    quitarControlador: () => {
      actual = null;
    },
    ...fabricaFrases(),
  };
}

describe("órdenes: lo que ves es lo que se envía (el preciso no se pide ni reemplaza nada)", () => {
  it("muestra el borrador con el texto rápido y NO pide el paso preciso", () => {
    const m = montarOrdenes();
    m.manejar(m.frase("Pikachu, corre los tes", T, new Promise<string>(() => {})));
    expect(m.llamadas.n).toBe(0);
    expect(m.c.vista()).toMatchObject({
      burbuja: { tipo: "escucha", texto: "corre los tes" },
      borrador: expect.any(Number),
    });
    expect(m.sesion().enviados).toEqual([]);
  });

  it("sale justo al cerrarse la ventana con el texto rápido", () => {
    const m = montarOrdenes();
    m.manejar(m.frase("Pikachu, corre los tests", T));
    m.reloj.avanzar(BORRADOR_MS - 1);
    expect(m.sesion().enviados).toEqual([]);
    m.reloj.avanzar(1);
    expect(m.sesion().enviados).toEqual(["corre los tests"]);
    expect(m.c.vista().borrador).toBeNull();
  });

  it("'sonnet' y 'opus' bien escritos por el rápido son lo que se envía, aunque el preciso diga otra cosa", async () => {
    const m = montarOrdenes();
    const d = diferida<string>();
    m.manejar(m.frase("Pikachu, cambia a sonnet y luego a opus", T, d.promesa));
    d.resolver("Pikachu, cambia a sonet y luego a opús");
    await vaciar();
    expect(m.c.vista().burbuja).toEqual({ tipo: "escucha", texto: "cambia a sonnet y luego a opus" });
    m.reloj.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual(["cambia a sonnet y luego a opus"]);
    expect(m.llamadas.n).toBe(0);
  });

  it("atento (sin nombre en el trozo): sale al cerrarse la ventana con el rápido y sin pedir el preciso", async () => {
    const m = montarOrdenes();
    m.manejar(m.frase("Pikachu", T)); // lo deja atento: la siguiente frase sin nombre es una orden
    await vaciar();
    const antes = m.llamadas.n;
    m.manejar(m.frase("revisa el deploy", T + 5000, new Promise<string>(() => {})));
    expect(m.c.vista().burbuja).toEqual({ tipo: "escucha", texto: "revisa el deploy" });
    m.reloj.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual(["revisa el deploy"]);
    expect(m.llamadas.n).toBe(antes);
  });

  it("orden con nombre de más de 6 s: también sale con el rápido a la ventana, sin preciso", () => {
    const m = montarOrdenes();
    m.manejar(m.frase("Pikachu, revisa el deploy de acme", T, new Promise<string>(() => {}), 9000));
    m.reloj.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual(["revisa el deploy de acme"]);
    expect(m.llamadas.n).toBe(0);
  });

  it("sin duración conocida da igual: sale con el rápido a la ventana", () => {
    const m = montarOrdenes();
    m.manejar(m.frase("Pikachu, revisa el deploy", T, new Promise<string>(() => {})));
    m.reloj.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual(["revisa el deploy"]);
  });

  it("con voz en curso al cerrarse la ventana, retiene; al callar sale con el rápido", () => {
    const m = montarOrdenes();
    m.manejar(m.frase("Pikachu, corre los tests", T));
    m.c.voz(true);
    m.reloj.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual([]);
    m.c.voz(false);
    m.reloj.avanzar(VOZ_SIN_TROZO_MS);
    expect(m.sesion().enviados).toEqual(["corre los tests"]);
  });

  it("cancelar durante la ventana: no se envía nada", async () => {
    const m = montarOrdenes();
    m.manejar(m.frase("Pikachu, borra todo", T));
    m.reloj.avanzar(BORRADOR_MS / 2);
    m.manejar(m.frase("cancela", T + 300));
    expect(m.c.vista()).toMatchObject({ borrador: null, burbuja: null });
    await vaciar();
    m.reloj.avanzar(BORRADOR_MS * 4);
    expect(m.sesion().enviados).toEqual([]);
  });

  it("una segunda orden mientras la primera espera: solo sale la segunda", () => {
    const m = montarOrdenes();
    m.manejar(m.frase("Pikachu, primera orden", T));
    m.reloj.avanzar(BORRADOR_MS / 2);
    m.manejar(m.frase("Pikachu, segunda orden", T + 300));
    expect(m.c.vista().burbuja).toEqual({ tipo: "escucha", texto: "segunda orden" });
    m.reloj.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual(["segunda orden"]);
  });

  it("un permiso que llega durante la ventana descarta el borrador", () => {
    const m = montarOrdenes();
    m.manejar(m.frase("Pikachu, borra todo", T));
    m.sesion().emitir({ tipo: "permiso", id: "A", herramienta: "Bash", detalle: "rm" });
    m.reloj.avanzar(BORRADOR_MS + PRECISO_MAX_MS);
    expect(m.sesion().enviados).toEqual([]);
    expect(m.sesion().permisos).toEqual([]);
    expect(m.c.vista().permiso).toMatchObject({ id: "A" });
  });
});

describe("atención y alta con el paso preciso asíncrono", () => {
  it("una atención muestra 'Te escucho.' al instante y, si el preciso trae una orden, la deja en borrador", async () => {
    const m = montarOrdenes();
    const d = diferida<string>();
    m.manejar(m.frase("Pikachu", T, d.promesa));
    expect(m.c.vista().burbuja).toEqual({ tipo: "escucha", texto: "Te escucho." });
    d.resolver("Pikachu, corre los tests");
    await vaciar();
    expect(m.c.vista()).toMatchObject({
      burbuja: { texto: "corre los tests" },
      borrador: expect.any(Number),
    });
    m.reloj.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual(["corre los tests"]);
  });

  it("si el preciso de una atención falla, se queda en 'Te escucho.'", async () => {
    const m = montarOrdenes();
    const d = diferida<string>();
    m.manejar(m.frase("Pikachu", T, d.promesa));
    d.rechazar(new Error("sherpa"));
    await vaciar();
    expect(m.c.vista().burbuja).toEqual({ tipo: "escucha", texto: "Te escucho." });
    expect(m.avisos).toHaveLength(1);
  });

  it("el resultado tardío de una atención no pisa una orden que llegó después", async () => {
    const m = montarOrdenes();
    const d = diferida<string>();
    m.manejar(m.frase("Pikachu", T, d.promesa));
    m.manejar(m.frase("Pikachu, revisa el deploy", T + 500, "Pikachu, revisa el deploy"));
    await vaciar();
    d.resolver("Pikachu, corre los tests");
    await vaciar();
    m.reloj.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual(["revisa el deploy"]);
  });

  it("el alta junta el rápido y el preciso cuando este llega, y sin controlador no hace nada", async () => {
    const m = montarOrdenes();
    m.c.iniciarAlta();
    const d = diferida<string>();
    m.manejar(m.frase("Pikacho.", T, d.promesa));
    expect(m.c.contexto().altaDe).toBe("p1");
    d.resolver("Pikachu.");
    await vaciar();
    m.quitarControlador();
    const e = diferida<string>();
    m.manejar(m.frase("Pikacho.", T, e.promesa));
    e.resolver("Pikachu.");
    await vaciar();
    expect(m.c.vista().burbuja?.texto).toContain("Faltan 4");
  });

  it("el alta con el preciso caído usa solo el rápido", async () => {
    const m = montarOrdenes();
    m.c.iniciarAlta();
    const d = diferida<string>();
    m.manejar(m.frase("Pikacho.", T, d.promesa));
    d.rechazar(new Error("sherpa"));
    await vaciar();
    expect(m.c.vista().burbuja?.texto).toContain("Faltan 4");
    expect(m.avisos).toHaveLength(1);
  });
});

describe("continuar un borrador con la segunda mitad de la frase", () => {
  it("la segunda mitad sin nombre se pega al borrador y sale UNA sola orden con los textos rápidos, sin preciso", async () => {
    const m = montarOrdenes();
    m.manejar(m.frase("Pikachu, revisa el deploy", T, new Promise<string>(() => {})));
    m.reloj.avanzar(BORRADOR_MS / 2);
    m.manejar(m.frase("de acme y corre los tests", T + 2000, new Promise<string>(() => {})));
    expect(m.c.vista().burbuja).toEqual({
      tipo: "escucha",
      texto: "revisa el deploy de acme y corre los tests",
    });
    expect(m.llamadas.n).toBe(0);
    await vaciar();
    m.reloj.avanzar(BORRADOR_MS - 1);
    expect(m.sesion().enviados).toEqual([]);
    m.reloj.avanzar(1);
    expect(m.sesion().enviados).toEqual(["revisa el deploy de acme y corre los tests"]);
  });

  it("una continuación larga (> 6 s) también usa el rápido", async () => {
    const m = montarOrdenes();
    m.manejar(m.frase("Pikachu, revisa el deploy", T));
    await vaciar();
    m.manejar(
      m.frase("y luego corre todos los tests del proyecto", T + 100, new Promise<string>(() => {}), 9000),
    );
    m.reloj.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual(["revisa el deploy y luego corre todos los tests del proyecto"]);
    expect(m.llamadas.n).toBe(0);
  });

  it("si dice el nombre, es una orden nueva que reemplaza al borrador, no una continuación", async () => {
    const m = montarOrdenes();
    m.manejar(m.frase("Pikachu, revisa el deploy", T));
    await vaciar();
    m.manejar(m.frase("Pikachu, mejor corre los tests", T + 100));
    await vaciar();
    expect(m.c.vista().burbuja).toEqual({ tipo: "escucha", texto: "mejor corre los tests" });
    m.reloj.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual(["mejor corre los tests"]);
  });

  it("con un permiso a la vista no se pega nada y nada se envía", async () => {
    const m = montarOrdenes();
    m.manejar(m.frase("Pikachu, revisa el deploy", T));
    await vaciar();
    m.sesion().emitir({ tipo: "permiso", id: "A", herramienta: "Bash", detalle: "rm" });
    m.manejar(m.frase("y borra todo", T + 100));
    await vaciar();
    m.reloj.avanzar(BORRADOR_MS + PRECISO_MAX_MS * 2);
    expect(m.sesion().enviados).toEqual([]);
    expect(m.sesion().permisos).toEqual([]);
    expect(m.c.vista().permiso).toMatchObject({ id: "A" });
  });

  it("sin borrador vigente (ya salió), la frase sin nombre no se pega a nada", async () => {
    const m = montarOrdenes();
    m.manejar(m.frase("Pikachu, revisa el deploy", T));
    await vaciar();
    m.reloj.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual(["revisa el deploy"]);
    m.manejar(m.frase("y los tests", T + 100));
    await vaciar();
    expect(m.sesion().enviados).toEqual(["revisa el deploy"]);
  });
});

describe("lo que SÍ espera al preciso: permisos, y lo que no resolvió destinatario", () => {
  it("el rápido solo oyó el nombre: queda 'Te escucho.' y el preciso lo rescata si trae una orden", async () => {
    const m = montarOrdenes();
    m.manejar(m.frase("Pikachu", T, "Pikachu, corre los tests"));
    expect(m.c.vista().burbuja).toEqual({ tipo: "escucha", texto: "Te escucho." });
    await vaciar();
    expect(m.llamadas.n).toBe(1);
    expect(m.c.vista().burbuja).toEqual({ tipo: "escucha", texto: "corre los tests" });
    m.reloj.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual(["corre los tests"]);
  });

  it("REGLA DURA: una respuesta de permiso nunca se salta el preciso aunque sea corta y con nombre", async () => {
    const m = montar();
    m.mostrar("perm1", T - 1000);
    const d = diferida<string>();
    m.manejar(m.frase("Pikachu, sí", T, d.promesa, 1000));
    expect(m.llamadas.n).toBe(1);
    await vaciar();
    expect(m.respuestas).toEqual([]);
    d.resolver("Pikachu, sí.");
    await vaciar();
    expect(m.respuestas).toEqual([[true, "p1", "perm1"]]);
  });

  it("REGLA DURA: si el preciso no confirma, el permiso no se aprueba aunque el rápido sea corto", async () => {
    const m = montar();
    m.mostrar("perm1", T - 1000);
    m.manejar(m.frase("sí", T, "no", 800));
    await vaciar();
    expect(m.llamadas.n).toBe(1);
    expect(m.respuestas).toEqual([]);
  });

  it("REGLA DURA: la ventana de envío corta no aplica a permisos: sin preciso, ni BORRADOR_MS ni el tope lo aprueban", async () => {
    const m = montar();
    m.mostrar("perm1", T - 1000);
    m.manejar(m.frase("Pikachu, sí", T, new Promise<string>(() => {}), 800));
    m.reloj.avanzar(BORRADOR_MS);
    await vaciar();
    expect(m.respuestas).toEqual([]);
    m.reloj.avanzar(PRECISO_MAX_MS * 2);
    await vaciar();
    expect(m.respuestas).toEqual([]);
  });
});
