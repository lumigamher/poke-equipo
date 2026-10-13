import type { Pokemon, VistaPokemon } from "@compartido/tipos";
import { describe, expect, it, vi } from "vitest";
import type { EventoSesion, OpcionesSesion, Sesion } from "../sesion/sesion";
import { Voz } from "../voz/voz";
import { crearCableadoVoz } from "./cableado-voz";
import { BORRADOR_MS, Controlador, VOZ_SIN_TROZO_MS } from "./controlador";
import { EquipoActivo, ESCALONADO_MS } from "./equipo-activo";
import { REACCION_MS } from "./guardia-permiso";
import { TIEMPOS } from "./maquina";

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

/** El Controlador, el manejador de frases, la guardia y el Oído reales; falsos solo el audio, la sesión y el reloj. */
function montar(opciones: { rapidoAsincrono?: boolean } = {}) {
  let t = 5_000_000;
  let sesion: SesionFalsa | null = null;
  let texto = "";
  let textoPreciso: string | null = null;
  let trozo = false;
  let alimentadas = 0;
  let enVoz = false;
  /** Con el rápido asíncrono: cada trozo espera a que el test lo libere. */
  const pendientes: (() => void)[] = [];
  const tareas: { en: number; fn: () => void; viva: boolean }[] = [];
  const programar = (fn: () => void, ms: number) => {
    const tarea = { en: t + ms, fn, viva: true };
    tareas.push(tarea);
    return () => {
      tarea.viva = false;
    };
  };
  const c = new Controlador({
    pokemon: pikachu,
    rol: "rol",
    equipo: { guardarSesion: () => {}, sumarTarea: () => {}, guardarApodos: () => {} },
    crearSesion: (o) => {
      sesion = new SesionFalsa(o);
      return sesion;
    },
    voz: { decir: async () => {}, callar: () => {} },
    reloj: { ahora: () => t, programar },
    // Un solo Pokémon: su burbuja es la abierta (como la marcaría EquipoActivo).
    alCambiar: (v: VistaPokemon) => cableado.alVista([{ ...v, abierta: true }]),
    alSonar: () => {},
    alGuardado: () => {},
  });
  const cableado = crearCableadoVoz({
    // Como sherpa: el inicio de un trozo se cuenta en muestras desde el último reinicio.
    segmentador: {
      alimentar: (m) => {
        const inicio = alimentadas;
        alimentadas += m.length;
        return trozo ? [{ muestras: new Float32Array(8000), inicio }] : [];
      },
      reiniciar: () => {
        alimentadas = 0;
      },
      hablando: () => enVoz,
    },
    rapido: opciones.rapidoAsincrono
      ? {
          transcribir: () => {
            const dicho = texto;
            return new Promise((r) => pendientes.push(() => r({ texto: dicho, esperaMs: 0, computoMs: 0 })));
          },
        }
      : { transcribir: () => texto },
    preciso: { transcribir: async () => ({ texto: textoPreciso ?? texto, esperaMs: 0, computoMs: 0 }) },
    controlador: () => c,
    ahora: () => t,
    programar,
    aviso: () => {},
  });
  c.iniciar();
  t += TIEMPOS.salirMs;
  c.tic();
  const vaciar = () => new Promise<void>((r) => setImmediate(r));
  /**
   * Dice `frase` empezando `desde` ms después de ahora: llega un bloque de 100 ms que termina
   * en `desde + 100` y el segmentador entrega un trozo que empieza en su primera muestra.
   */
  const decir = async (frase: string, desde: number, preciso: string | null = null) => {
    texto = frase;
    textoPreciso = preciso;
    trozo = true;
    enVoz = false; // el VAD entrega la frase en el mismo instante en que deja de detectar voz
    cableado.oido.recibir(new Float32Array(1600), t + desde + 100);
    trozo = false;
    await vaciar();
  };
  return {
    c,
    cableado,
    sesion: () => sesion as unknown as SesionFalsa,
    ahora: () => t,
    avanzar: (ms: number) => {
      const meta = t + ms;
      for (;;) {
        const proxima = tareas.filter((x) => x.viva && x.en <= meta).sort((a, b) => a.en - b.en)[0];
        if (!proxima) break;
        proxima.viva = false;
        t = Math.max(t, proxima.en);
        proxima.fn();
      }
      t = meta;
    },
    decir,
    /** Libera (en orden) los trozos que esperan su texto rápido. */
    liberar: async () => {
      for (const f of pendientes.splice(0)) f();
      await vaciar();
    },
    /** El segmentador detecta (o deja de detectar) voz sin haber entregado todavía la frase. */
    hablando: (valor: boolean) => {
      enVoz = valor;
      cableado.oido.recibir(new Float32Array(1600), t + 100);
    },
  };
}

describe("cableado de la voz con permisos", () => {
  it("una frase 100 ms después del permiso no lo aprueba; a los 900 ms lo aprueba una vez; B pide su propio margen", async () => {
    const m = montar();
    m.c.orden("corre los tests", true);
    m.avanzar(10);
    m.sesion().emitir({ tipo: "permiso", id: "A", herramienta: "Bash", detalle: "bun test" });
    m.sesion().emitir({ tipo: "permiso", id: "B", herramienta: "Write", detalle: "x.ts" });
    expect(m.c.vista().permiso).toMatchObject({ id: "A" });

    await m.decir("dale", 100);
    expect(m.sesion().permisos).toEqual([]);
    expect(m.c.vista().permiso).toMatchObject({ id: "A" });

    await m.decir("dale", REACCION_MS + 100);
    expect(m.sesion().permisos).toEqual([["A", true]]);
    // B se mostró recién al responder A: una frase que empezó antes no lo aprueba.
    expect(m.c.vista().permiso).toMatchObject({ id: "B" });
    m.avanzar(200);
    await m.decir("dale", -150);
    expect(m.sesion().permisos).toEqual([["A", true]]);
    await m.decir("dale", 100);
    expect(m.sesion().permisos).toEqual([["A", true]]);

    m.avanzar(REACCION_MS);
    await m.decir("dale", 0);
    expect(m.sesion().permisos).toEqual([
      ["A", true],
      ["B", true],
    ]);
  });

  it("un no por voz a tiempo niega, y el audio anterior a ver el permiso se descarta", async () => {
    const m = montar();
    m.c.orden("borra", true);
    m.sesion().emitir({ tipo: "permiso", id: "A", herramienta: "Bash", detalle: "rm" });
    await m.decir("no", REACCION_MS + 50);
    expect(m.sesion().permisos).toEqual([["A", false]]);
  });

  it("la aprobación por voz es asíncrona: solo cuenta si el preciso, que llega aparte, dice lo mismo", async () => {
    const m = montar();
    m.c.orden("corre los tests", true);
    m.sesion().emitir({ tipo: "permiso", id: "A", herramienta: "Bash", detalle: "bun test" });
    await m.decir("dale", REACCION_MS + 100, "vale la pena");
    expect(m.sesion().permisos).toEqual([]);
    expect(m.c.vista().permiso).toMatchObject({ id: "A" });
    await m.decir("dale", REACCION_MS + 100, "dale");
    expect(m.sesion().permisos).toEqual([["A", true]]);
  });
});

describe("cableado de la voz: qué descarta lo que se venía oyendo", () => {
  it("solo un permiso que aparece descarta; volver a publicarlo o contestarlo no", () => {
    const m = montarEquipo({ solo: true });
    const descartar = vi.spyOn(m.cableado.oido, "descartar");
    m.controladores.get(PIKA)?.orden("borra", true);
    expect(descartar).not.toHaveBeenCalled();
    m.sesiones.get(PIKA)?.emitir({ tipo: "permiso", id: "A", herramienta: "Bash", detalle: "rm" });
    expect(descartar).toHaveBeenCalledTimes(1);
    m.controladores.get(PIKA)?.tic(); // republica la misma vista
    m.equipo.publicar();
    expect(descartar).toHaveBeenCalledTimes(1);
    // Clic en la burbuja abierta, con los dos ids, por el mismo camino que index.ts: el permiso se va.
    m.equipo.responderPermisoConClic(false, PIKA, "A");
    expect(m.sesiones.get(PIKA)?.permisos).toEqual([["A", false]]);
    expect(descartar).toHaveBeenCalledTimes(1);
  });

  it("el permiso nuevo de un Pokémon en chip no descarta, y el de la burbuja abierta conserva su hora", async () => {
    const m = montar();
    const descartar = vi.spyOn(m.cableado.oido, "descartar");
    m.c.orden("borra", true);
    m.sesion().emitir({ tipo: "permiso", id: "A", herramienta: "Bash", detalle: "rm" });
    m.avanzar(REACCION_MS + 100);
    const otro = { id: "p2", permiso: { id: "B" }, abierta: false };
    // Solo cuenta la burbuja abierta: el de p2, en chip, cuenta recién cuando se abra.
    m.cableado.alVista([{ ...m.c.vista(), abierta: true }, otro]);
    expect(descartar).toHaveBeenCalledTimes(1);
    // Charmander no está en pantalla: el contexto solo tiene el permiso de Pikachu, que sigue valiendo.
    await m.decir("dale", 0);
    expect(m.sesion().permisos).toEqual([["A", true]]);
  });
});

describe("cableado de la voz con una frase partida por una pausa", () => {
  it("la primera mitad retenida por la voz en curso y la segunda se juntan en UNA sola orden", async () => {
    const m = montar();
    await m.decir("pikachu revisa el deploy", 0);
    expect(m.c.vista().burbuja).toEqual({ tipo: "escucha", texto: "revisa el deploy" });
    m.avanzar(500);
    m.hablando(true); // ya está diciendo la segunda mitad
    m.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual([]);
    expect(m.c.vista().borrador).toEqual(expect.any(Number));
    await m.decir("de acme y corre los tests", 0);
    expect(m.c.vista().burbuja).toEqual({
      tipo: "escucha",
      texto: "revisa el deploy de acme y corre los tests",
    });
    // La continuación reinicia la ventana: sale BORRADOR_MS después de ella, no antes.
    m.avanzar(BORRADOR_MS - 1);
    expect(m.sesion().enviados).toEqual([]);
    m.avanzar(1);
    expect(m.sesion().enviados).toEqual(["revisa el deploy de acme y corre los tests"]);
  });

  it("un trozo que aún se transcribe (rápido asíncrono) retiene el borrador: la continuación se pega", async () => {
    const m = montar({ rapidoAsincrono: true });
    await m.decir("pikachu revisa el deploy", 0);
    await m.liberar();
    expect(m.c.vista().burbuja).toEqual({ tipo: "escucha", texto: "revisa el deploy" });
    m.avanzar(BORRADOR_MS / 2);
    await m.decir("y corre los tests", 0);
    // La ventana se cierra mientras el trozo sigue en el proceso rápido: sin el aviso saldría la primera mitad sola.
    m.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual([]);
    await m.liberar();
    expect(m.c.vista().burbuja).toEqual({ tipo: "escucha", texto: "revisa el deploy y corre los tests" });
    m.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual(["revisa el deploy y corre los tests"]);
  });

  it("si la voz en curso no trae más frase, sale la primera mitad a los 0,5 s", async () => {
    const m = montar();
    await m.decir("pikachu revisa el deploy", 0);
    m.hablando(true);
    m.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual([]);
    m.hablando(false);
    m.avanzar(VOZ_SIN_TROZO_MS);
    expect(m.sesion().enviados).toEqual(["revisa el deploy"]);
  });

  it("con un permiso a la vista, lo que se oye no se pega a nada y no aprueba nada", async () => {
    const m = montar();
    await m.decir("pikachu revisa el deploy", 0);
    m.sesion().emitir({ tipo: "permiso", id: "A", herramienta: "Bash", detalle: "rm" });
    await m.decir("y borra todo", REACCION_MS + 100);
    m.avanzar(BORRADOR_MS * 4);
    expect(m.sesion().enviados).toEqual([]);
    expect(m.sesion().permisos).toEqual([]);
    expect(m.c.vista().permiso).toMatchObject({ id: "A" });
  });
});

/**
 * Dos Pokémon reales en un EquipoActivo real, con la guardia y la tubería de frases reales. EquipoActivo marca la
 * burbuja abierta y la guardia solo cuenta el permiso de esa: la voz no puede responder un permiso en chip.
 */
/** `solo`: solo Pikachu en la base (un único Pokémon, sin nada inyectado). */
/** Lo que el Controlador usa para hablar; `vozDe` permite darle a cada Pokémon la Voz real, como en index.ts. */
type VozControlador = { decir(texto: string, voz: string, velocidad: number): Promise<void>; callar(): void };

function montarEquipo({
  solo = false,
  vozDe,
}: {
  solo?: boolean;
  vozDe?: (id: string) => VozControlador;
} = {}) {
  let t = 7_000_000;
  const tareas: { en: number; fn: () => void; viva: boolean }[] = [];
  const programar = (fn: () => void, ms: number) => {
    const tarea = { en: t + ms, fn, viva: true };
    tareas.push(tarea);
    return () => {
      tarea.viva = false;
    };
  };
  const avanzar = (ms: number) => {
    const meta = t + ms;
    for (;;) {
      const proxima = tareas.filter((x) => x.viva && x.en <= meta).sort((a, b) => a.en - b.en)[0];
      if (!proxima) break;
      proxima.viva = false;
      t = Math.max(t, proxima.en);
      proxima.fn();
    }
    t = meta;
  };
  const charmander: Pokemon = { ...pikachu, id: "c1", nombre: "Charmander", especie: 4, voz: "voz-b" };
  const bd = new Map<string, Pokemon>([
    [pikachu.id, { ...pikachu }],
    ...(solo ? [] : ([[charmander.id, charmander]] as [string, Pokemon][])),
  ]);
  const sesiones = new Map<string, SesionFalsa>();
  const controladores = new Map<string, Controlador>();
  let texto = "";
  let trozo = false;
  let alimentadas = 0;
  let retener = false;
  const soltar: (() => void)[] = [];
  const equipo = new EquipoActivo({
    equipo: {
      todos: () => [...bd.values()],
      activos: () => [...bd.values()].filter((p) => p.activo),
      contarActivos: () => [...bd.values()].filter((p) => p.activo).length,
      buscarPorEspecie: (e) => [...bd.values()].find((p) => p.especie === e) ?? null,
      activar: (id) => {
        const p = bd.get(id);
        if (p) p.activo = true;
      },
      desactivar: (id) => {
        const p = bd.get(id);
        if (p) p.activo = false;
      },
      crear: () => {
        throw new Error("no se crea nadie en esta prueba");
      },
      obtener: (id) => {
        const p = bd.get(id);
        return p ? { ...p } : null;
      },
      cambiarEspecie: () => {},
      renombrar: () => {},
      cambiarCarpeta: () => {},
    },
    crearControlador: (pokemon, enlace) => {
      const c = new Controlador({
        pokemon,
        rol: "rol",
        equipo: { guardarSesion: () => {}, sumarTarea: () => {}, guardarApodos: () => {} },
        crearSesion: (o) => {
          const s = new SesionFalsa(o);
          sesiones.set(pokemon.id, s);
          return s;
        },
        voz: vozDe?.(pokemon.id) ?? { decir: async () => {}, callar: () => {} },
        reloj: { ahora: () => t, programar },
        alCambiar: () => enlace.alCambiar(),
        alSonar: () => {},
        alGuardado: () => enlace.alGuardado(),
      });
      controladores.set(pokemon.id, c);
      return c;
    },
    especiesDisponibles: () => [],
    voces: { conjunto: ["voz-a", "voz-b"], especies: {} },
    programar,
    // Como index.ts: el cableado recibe la lista completa, ya marcada, y la guardia se queda con la abierta.
    alCambiarEquipo: (vistas) => cableado.alVista(vistas),
  });
  const cableado = crearCableadoVoz({
    segmentador: {
      alimentar: (m) => {
        const inicio = alimentadas;
        alimentadas += m.length;
        return trozo ? [{ muestras: new Float32Array(8000), inicio }] : [];
      },
      reiniciar: () => {
        alimentadas = 0;
      },
      hablando: () => false,
    },
    rapido: { transcribir: () => texto },
    // Con `retener`, el texto preciso no llega hasta que la prueba llama `soltarPreciso()`.
    preciso: {
      transcribir: () => {
        const r = { texto, esperaMs: 0, computoMs: 0 };
        if (!retener) return Promise.resolve(r);
        return new Promise((ok) => {
          soltar.push(() => ok(r));
        });
      },
    },
    controlador: () => equipo,
    ahora: () => t,
    programar,
    aviso: () => {},
  });
  equipo.arrancar();
  avanzar(ESCALONADO_MS + TIEMPOS.salirMs);
  for (const c of controladores.values()) c.tic();
  const decir = async (frase: string, desde: number) => {
    texto = frase;
    trozo = true;
    cableado.oido.recibir(new Float32Array(1600), t + desde + 100);
    trozo = false;
    await new Promise<void>((r) => setImmediate(r));
  };
  return {
    equipo,
    cableado,
    sesiones,
    controladores,
    avanzar,
    decir,
    retenerPreciso: () => {
      retener = true;
    },
    soltarPreciso: async () => {
      for (const fn of soltar.splice(0)) fn();
      await new Promise<void>((r) => setImmediate(r));
    },
  };
}

const PIKA = "p1";
const CHAR = "c1";

describe("cableado de la voz: solo cuenta el permiso de la burbuja abierta (integración)", () => {
  /** Charmander pide X y, `entre` ms después, Pikachu pide Y. */
  const dosPermisos = (m: ReturnType<typeof montarEquipo>, entre = 50) => {
    m.controladores.get(CHAR)?.orden("corre los tests", true);
    m.controladores.get(PIKA)?.orden("borra la carpeta", true);
    m.sesiones.get(CHAR)?.emitir({ tipo: "permiso", id: "X", herramienta: "Bash", detalle: "bun test" });
    m.avanzar(entre);
    m.sesiones.get(PIKA)?.emitir({ tipo: "permiso", id: "Y", herramienta: "Bash", detalle: "rm -rf /" });
  };
  const abierta = (m: ReturnType<typeof montarEquipo>) =>
    m.equipo.vistas().find((v) => v.abierta)?.id ?? null;

  it("con dos permisos solo se aprueba el abierto; el del chip, ni nombrándolo; el siguiente cuenta desde que se abre", async () => {
    const m = montarEquipo();
    dosPermisos(m);
    expect(abierta(m)).toBe(CHAR);
    m.avanzar(REACCION_MS * 2);
    // Pikachu está en chip: ni nombrándolo, ni a destiempo.
    await m.decir("pikachu dale", 0);
    await m.decir("pikachu sí", REACCION_MS);
    expect(m.sesiones.get(PIKA)?.permisos).toEqual([]);
    // Con dos permisos pendientes, "dale" sin nombre es ambiguo: no aprueba nada.
    await m.decir("dale", 0);
    expect(m.sesiones.get(CHAR)?.permisos).toEqual([]);
    await m.decir("charmander dale", 0);
    expect(m.sesiones.get(CHAR)?.permisos).toEqual([["X", true]]);
    // Ahora se abre el de Pikachu: lleva pidiéndolo mucho más de REACCION_MS, pero cuenta desde que se abrió.
    expect(abierta(m)).toBe(PIKA);
    await m.decir("pikachu dale", 100);
    expect(m.sesiones.get(PIKA)?.permisos).toEqual([]);
    m.avanzar(REACCION_MS);
    await m.decir("pikachu dale", 0);
    expect(m.sesiones.get(PIKA)?.permisos).toEqual([["Y", true]]);
  });

  it("elegir el otro chip invalida el permiso que estaba abierto; el nuevo cuenta desde que se eligió", async () => {
    const m = montarEquipo();
    dosPermisos(m);
    m.avanzar(REACCION_MS * 2);
    m.equipo.elegir(PIKA);
    expect(abierta(m)).toBe(PIKA);
    // El de Charmander quedó en chip: ya no cuenta, aunque se viera mucho tiempo.
    await m.decir("charmander dale", REACCION_MS + 100);
    expect(m.sesiones.get(CHAR)?.permisos).toEqual([]);
    // El de Pikachu cuenta desde que se eligió, no desde que lo pidió.
    await m.decir("pikachu dale", 100);
    expect(m.sesiones.get(PIKA)?.permisos).toEqual([]);
    m.avanzar(REACCION_MS);
    await m.decir("pikachu dale", 0);
    expect(m.sesiones.get(PIKA)?.permisos).toEqual([["Y", true]]);
    expect(m.sesiones.get(CHAR)?.permisos).toEqual([]);
  });

  it("volver a abrir un permiso lo hace contar de cero: cerrarlo y abrirlo no deja aprobarlo a destiempo", async () => {
    const m = montarEquipo();
    dosPermisos(m);
    m.avanzar(REACCION_MS * 2);
    m.equipo.elegir(PIKA);
    m.avanzar(REACCION_MS * 2);
    m.equipo.elegir(PIKA); // la suelta: vuelve a abrirse el más antiguo, el de Charmander
    expect(abierta(m)).toBe(CHAR);
    await m.decir("charmander dale", 100);
    expect(m.sesiones.get(CHAR)?.permisos).toEqual([]);
    // Control positivo: pasado el margen desde que se reabrió, sí se aprueba.
    m.avanzar(REACCION_MS);
    await m.decir("charmander dale", 0);
    expect(m.sesiones.get(CHAR)?.permisos).toEqual([["X", true]]);
  });

  it("lo transcrito siempre se ve: el borrador de Charmander tapa el permiso de Pikachu, y un sí durante el borrador no lo aprueba", async () => {
    const m = montarEquipo();
    m.controladores.get(PIKA)?.orden("borra la carpeta", true);
    m.sesiones.get(PIKA)?.emitir({ tipo: "permiso", id: "Y", herramienta: "Bash", detalle: "rm -rf /" });
    expect(abierta(m)).toBe(PIKA);
    m.avanzar(REACCION_MS * 2);
    await m.decir("charmander borra la rama vieja", 0);
    // El borrador de Charmander se abre aunque haya un permiso pendiente: la persona ve lo que se va a enviar.
    expect(abierta(m)).toBe(CHAR);
    expect(m.equipo.vistas().find((v) => v.id === CHAR)?.borrador).toEqual(expect.any(Number));
    // Un sí a Pikachu ahora no cuenta: su permiso está en chip.
    await m.decir("dale", 100);
    await m.decir("pikachu sí", REACCION_MS);
    expect(m.sesiones.get(PIKA)?.permisos).toEqual([]);
    // El borrador sale; el permiso vuelve a abrirse y se sella otra vez desde ahora.
    m.avanzar(BORRADOR_MS);
    expect(m.sesiones.get(CHAR)?.enviados).toEqual(["borra la rama vieja"]);
    expect(abierta(m)).toBe(PIKA);
    await m.decir("pikachu dale", 100);
    expect(m.sesiones.get(PIKA)?.permisos).toEqual([]);
    m.avanzar(REACCION_MS);
    await m.decir("pikachu dale", 0);
    expect(m.sesiones.get(PIKA)?.permisos).toEqual([["Y", true]]);
  });

  it("con un solo Pokémon, sin nada inyectado, su permiso se abre y se responde por voz y con clic", async () => {
    const m = montarEquipo({ solo: true });
    expect(m.equipo.vistas().map((v) => v.id)).toEqual([PIKA]);
    m.controladores.get(PIKA)?.orden("corre los tests", true);
    m.sesiones.get(PIKA)?.emitir({ tipo: "permiso", id: "A", herramienta: "Bash", detalle: "bun test" });
    expect(abierta(m)).toBe(PIKA);
    await m.decir("dale", 100);
    expect(m.sesiones.get(PIKA)?.permisos).toEqual([]);
    m.avanzar(REACCION_MS);
    await m.decir("dale", 0);
    expect(m.sesiones.get(PIKA)?.permisos).toEqual([["A", true]]);
    // El siguiente, con clic (el clic no espera el margen de la voz; su gracia la pone el renderer).
    m.sesiones.get(PIKA)?.emitir({ tipo: "permiso", id: "B", herramienta: "Write", detalle: "x.ts" });
    m.equipo.responderPermisoConClic(true, PIKA, "B");
    expect(m.sesiones.get(PIKA)?.permisos).toEqual([
      ["A", true],
      ["B", true],
    ]);
  });

  it("un permiso nuevo suelta la fijada y se abre; se aprueba con su margen desde que se abrió", async () => {
    const m = montarEquipo();
    m.equipo.elegir(PIKA); // La persona abre a Pikachu con un clic
    expect(abierta(m)).toBe(PIKA);
    m.controladores.get(CHAR)?.orden("corre los tests", true);
    m.avanzar(REACCION_MS * 2);
    m.sesiones.get(CHAR)?.emitir({ tipo: "permiso", id: "X", herramienta: "Bash", detalle: "bun test" });
    expect(abierta(m)).toBe(CHAR);
    await m.decir("dale", 100);
    expect(m.sesiones.get(CHAR)?.permisos).toEqual([]);
    m.avanzar(REACCION_MS);
    await m.decir("dale", 0);
    expect(m.sesiones.get(CHAR)?.permisos).toEqual([["X", true]]);
  });

  it("si la persona cambia de burbuja mientras el texto preciso no llega, el permiso anterior ya no se aprueba", async () => {
    const m = montarEquipo();
    dosPermisos(m);
    m.avanzar(REACCION_MS * 2);
    m.retenerPreciso();
    await m.decir("charmander dale", 0);
    expect(m.sesiones.get(CHAR)?.permisos).toEqual([]);
    m.equipo.elegir(PIKA); // antes de que confirme el preciso
    await m.soltarPreciso();
    expect(m.sesiones.get(CHAR)?.permisos).toEqual([]);
    expect(m.sesiones.get(PIKA)?.permisos).toEqual([]);
  });

  it("un permiso en chip no se aprueba por voz aunque sea el único pendiente", async () => {
    const m = montarEquipo();
    m.controladores.get(CHAR)?.orden("corre los tests", true);
    m.sesiones.get(CHAR)?.emitir({ tipo: "permiso", id: "X", herramienta: "Bash", detalle: "rm -rf /" });
    m.avanzar(10);
    m.equipo.elegir(PIKA); // La persona abre a Pikachu: el permiso de Charmander pasa a chip
    expect(abierta(m)).toBe(PIKA);
    m.avanzar(REACCION_MS * 2);
    await m.decir("dale", REACCION_MS + 100);
    await m.decir("charmander dale", REACCION_MS + 100);
    expect(m.sesiones.get(CHAR)?.permisos).toEqual([]);
    expect(m.equipo.vistas().find((v) => v.id === CHAR)?.permiso).toMatchObject({ id: "X" });
  });

  it("cuando el del chip pasa a ser el abierto (el otro se guarda), cuenta desde ese momento", async () => {
    const m = montarEquipo();
    m.controladores.get(CHAR)?.orden("corre los tests", true);
    m.sesiones.get(CHAR)?.emitir({ tipo: "permiso", id: "X", herramienta: "Bash", detalle: "bun test" });
    m.avanzar(10);
    m.equipo.elegir(PIKA);
    m.avanzar(REACCION_MS * 2);
    // Pikachu vuelve a su pokébola: se suelta la fijada y se abre el permiso de Charmander.
    m.equipo.guardar(PIKA);
    expect(abierta(m)).toBe(CHAR);
    await m.decir("dale", 100);
    expect(m.sesiones.get(CHAR)?.permisos).toEqual([]);
    m.avanzar(REACCION_MS);
    await m.decir("dale", 0);
    expect(m.sesiones.get(CHAR)?.permisos).toEqual([["X", true]]);
  });
});

describe("cableado de la voz con varios Pokémon (integración, Review Focus 2, 3 y 5)", () => {
  const abierta = (m: ReturnType<typeof montarEquipo>) =>
    m.equipo.vistas().find((v) => v.abierta)?.id ?? null;

  it("'Charmander sí' con permiso solo en Pikachu no aprueba el de Pikachu; ese permiso sigue esperando a su dueño", async () => {
    const m = montarEquipo();
    m.controladores.get(PIKA)?.orden("borra la carpeta", true);
    m.sesiones.get(PIKA)?.emitir({ tipo: "permiso", id: "Y", herramienta: "Bash", detalle: "rm -rf /" });
    expect(abierta(m)).toBe(PIKA);
    m.avanzar(REACCION_MS * 2);
    await m.decir("charmander sí", 0);
    expect(m.sesiones.get(PIKA)?.permisos).toEqual([]);
    // El "sí" es una orden para Charmander (su borrador tapa el permiso y luego sale); el de Pikachu sigue sin responder.
    expect(abierta(m)).toBe(CHAR);
    m.avanzar(BORRADOR_MS + VOZ_SIN_TROZO_MS);
    expect(m.sesiones.get(CHAR)?.enviados).toEqual(["sí"]);
    expect(m.sesiones.get(PIKA)?.permisos).toEqual([]);
    expect(m.sesiones.get(CHAR)?.permisos).toEqual([]);
    expect(m.equipo.vistas().find((v) => v.id === PIKA)?.permiso).toMatchObject({ id: "Y" });
    // Control positivo: nombrando a su dueño, con su margen desde que (re)abrió, sí se aprueba.
    expect(abierta(m)).toBe(PIKA);
    m.avanzar(REACCION_MS);
    await m.decir("pikachu sí", 0);
    expect(m.sesiones.get(PIKA)?.permisos).toEqual([["Y", true]]);
  });

  it("dos Pokémon piden voz a la vez: suenan uno tras otro y el oído queda cerrado mientras suena cualquiera", async () => {
    const eventos: string[] = [];
    const hablaron = new WeakMap<object, string>();
    let terminar: (() => void) | null = null;
    // La Voz real de index.ts: una sola para todos, con el id del Pokémon como dueño.
    const voz = new Voz(
      {
        generar: (texto) => {
          const audio = { muestras: new Float32Array(1), frecuencia: 22050 };
          hablaron.set(audio, texto);
          return audio;
        },
      },
      {
        reproducir: (a) => {
          eventos.push(`inicio:${hablaron.get(a)}`);
          return new Promise<void>((ok) => {
            terminar = () => {
              eventos.push(`fin:${hablaron.get(a)}`);
              ok();
            };
          });
        },
        detener: () => terminar?.(),
      },
      (h) => m.cableado.alSonarVoz(h),
    );
    const m = montarEquipo({
      vozDe: (id) => ({
        decir: (texto, v, velocidad) => voz.decir(`${id}:${texto}`, v, velocidad, id),
        callar: () => voz.callar(id),
      }),
    });
    const vaciar = () => new Promise<void>((r) => setImmediate(r));
    const soltarFrase = async () => {
      const fn = terminar;
      terminar = null;
      fn?.();
      await vaciar();
    };
    // Los dos piden permiso casi a la vez (50 ms) y los dos dicen "Necesito tu permiso.".
    m.controladores.get(CHAR)?.orden("corre los tests", true);
    m.controladores.get(PIKA)?.orden("borra la carpeta", true);
    m.sesiones.get(CHAR)?.emitir({ tipo: "permiso", id: "X", herramienta: "Bash", detalle: "bun test" });
    m.avanzar(50);
    m.sesiones.get(PIKA)?.emitir({ tipo: "permiso", id: "Y", herramienta: "Bash", detalle: "rm -rf /" });
    await vaciar();
    expect(abierta(m)).toBe(CHAR);
    m.avanzar(REACCION_MS * 2);
    // Suena Charmander: el oído está cerrado y un "charmander dale" a tiempo no llega a nada.
    expect(eventos).toEqual(["inicio:c1:Necesito tu permiso."]);
    expect(m.cableado.oido.silenciado).toBe(true);
    await m.decir("charmander dale", 0);
    expect(m.sesiones.get(CHAR)?.permisos).toEqual([]);
    // Termina Charmander y empieza Pikachu sin solaparse; el oído sigue cerrado.
    await soltarFrase();
    expect(eventos).toEqual([
      "inicio:c1:Necesito tu permiso.",
      "fin:c1:Necesito tu permiso.",
      "inicio:p1:Necesito tu permiso.",
    ]);
    expect(m.cableado.oido.silenciado).toBe(true);
    await m.decir("charmander dale", 0);
    expect(m.sesiones.get(CHAR)?.permisos).toEqual([]);
    // Ya no suena nadie: el oído se abre y la misma frase sí aprueba (control positivo).
    await soltarFrase();
    expect(eventos.at(-1)).toBe("fin:p1:Necesito tu permiso.");
    expect(m.cableado.oido.silenciado).toBe(false);
    await m.decir("charmander dale", 0);
    expect(m.sesiones.get(CHAR)?.permisos).toEqual([["X", true]]);
    expect(m.sesiones.get(PIKA)?.permisos).toEqual([]);
  });
});
