import { basename } from "node:path";
import type { Pokemon, VistaPokemon } from "@compartido/tipos";
import { describe, expect, it } from "vitest";
import { afinar, decidir } from "../entrenador/entrenador";
import { SILENCIO_FIN_FRASE_S } from "../oido/tiempos-voz";
import type { Frase } from "../oido/transcriptor";
import type { EventoSesion, OpcionesSesion, Sesion } from "../sesion/sesion";
import { ACTIVIDAD_MS, VERBOS } from "./actividad";
import {
  ALTA_FRASES,
  ALTA_FRASES_BAUTIZO,
  ALTA_MS,
  AVISO_MS,
  AYUDANTE_MUDO_MS,
  BORRADOR_MS,
  Controlador,
  type Dependencias,
  MAX_PARTES,
  PRECISO_MAX_MS,
  RETENCION_MAX_MS,
  VOZ_SIN_TROZO_MS,
} from "./controlador";
import { crearManejadorFrases } from "./frases";
import { TIEMPOS } from "./maquina";

class SesionFalsa implements Sesion {
  enviados: string[] = [];
  permisos: [string, boolean][] = [];
  cerrada = false;
  private fn: ((e: EventoSesion) => void) | null = null;
  constructor(public opciones: OpcionesSesion) {}
  enviar(t: string) {
    this.enviados.push(t);
  }
  resolverPermiso(id: string, permitir: boolean) {
    this.permisos.push([id, permitir]);
  }
  cerrar() {
    this.cerrada = true;
  }
  alEvento(fn: (e: EventoSesion) => void) {
    this.fn = fn;
  }
  emitir(e: EventoSesion) {
    this.fn?.(e);
  }
  modelos: string[] = [];
  falloModelo: Error | null = null;
  async cambiarModelo(modelo: string) {
    if (this.falloModelo) throw this.falloModelo;
    this.modelos.push(modelo);
  }
  async comandos() {
    return [{ nombre: "compact", descripcion: "Compacta", argumento: "" }];
  }
}

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

const pikachu: Pokemon = {
  id: "p1",
  nombre: "Pikachu",
  especie: 25,
  voz: "voz-a",
  velocidad: 1.1,
  carpeta: "/tmp/proyecto",
  sessionId: "sesion-vieja",
  apodos: ["picachu"],
  tareas: 0,
  activo: true,
};
const microtareas = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

function montar(
  opciones: {
    azar?: () => number;
    decir?: (texto: string) => Promise<void>;
    idBorrador?: () => number;
    movimientos?: Dependencias["movimientos"];
    pokemon?: Pokemon;
    reservadas?: string[];
    ajenos?: () => string[];
    modelo?: string;
    alResolverModelo?: () => void;
  } = {},
) {
  const reloj = relojFalso();
  const sesiones: SesionFalsa[] = [];
  const dichos: string[] = [];
  const vistas: VistaPokemon[] = [];
  const guardado = {
    sesion: [] as (string | null)[],
    tareas: 0,
    apodos: [] as string[][],
    callado: 0,
    sonado: 0,
    guardados: 0,
    pausas: 0,
    especies: [] as string[],
  };
  /** La base de prueba; una prueba puede añadirle lo de la etapa 3 (Pokédex, shiny, medallas). */
  const modelosGuardados: [string, string | null][] = [];
  const equipo: Dependencias["equipo"] = {
    guardarModelo: (id, modelo) => {
      modelosGuardados.push([id, modelo]);
    },
    guardarSesion: (_id, s) => {
      guardado.sesion.push(s);
    },
    sumarTarea: () => {
      guardado.tareas += 1;
    },
    guardarApodos: (_id, a) => {
      guardado.apodos.push(a);
    },
  };
  const c = new Controlador({
    pokemon: opciones.pokemon ?? pikachu,
    rol: "rol de prueba",
    equipo,
    crearSesion: (o) => {
      const s = new SesionFalsa(o);
      sesiones.push(s);
      return s;
    },
    voz: {
      decir: async (texto) => {
        dichos.push(texto);
        await opciones.decir?.(texto);
      },
      callar: () => {
        guardado.callado += 1;
      },
    },
    reloj,
    azar: opciones.azar,
    idBorrador: opciones.idBorrador,
    movimientos: opciones.movimientos,
    reservadas: opciones.reservadas,
    ajenos: opciones.ajenos,
    modelo: opciones.modelo,
    alResolverModelo: opciones.alResolverModelo,
    alCambiar: (v) => vistas.push(v),
    alSonar: () => {
      guardado.sonado += 1;
    },
    alGuardado: () => {
      guardado.guardados += 1;
    },
    alDejarDeEscuchar: () => {
      guardado.pausas += 1;
    },
    especiesDisponibles: () => [
      { especie: 25, nombre: "Pikachu" },
      { especie: 4, nombre: "Charmander" },
    ],
    alCambiarEspecie: (e) => {
      guardado.especies.push(e.nombre);
    },
  });
  c.iniciar();
  reloj.avanzar(TIEMPOS.salirMs);
  c.tic();
  return {
    equipo,
    c,
    reloj,
    sesiones,
    dichos,
    vistas,
    guardado,
    guardados: modelosGuardados,
    sesion: () => sesiones.at(-1) as SesionFalsa,
  };
}

describe("Controlador", () => {
  it("al iniciar retoma la sesión guardada, suena el grito y sale de la pokébola", () => {
    const m = montar();
    expect(m.sesiones[0].opciones).toEqual({
      carpeta: "/tmp/proyecto",
      sessionId: "sesion-vieja",
      rol: "rol de prueba",
    });
    expect(m.guardado.sonado).toBe(1);
    expect(m.vistas[0].estado).toBe("saliendo");
    expect(m.c.vista().estado).toBe("paseando");
  });

  it("guarda el identificador de sesión cuando llega", () => {
    const m = montar();
    m.sesion().emitir({ tipo: "iniciada", sessionId: "sesion-nueva" });
    expect(m.guardado.sesion).toEqual(["sesion-nueva"]);
  });

  it("muestra la orden como borrador y la envía al vencer el plazo", () => {
    const m = montar();
    m.c.ejecutar({ tipo: "orden", id: "p1", texto: "revisa el deploy" });
    expect(m.c.vista()).toMatchObject({
      estado: "escuchando",
      burbuja: { tipo: "escucha", texto: "revisa el deploy" },
    });
    expect(m.c.contexto().borradoresDe).toEqual(["p1"]);
    expect(m.sesion().enviados).toEqual([]);
    m.reloj.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual(["revisa el deploy"]);
    expect(m.c.vista().estado).toBe("trabajando");
    expect(m.c.contexto().borradoresDe).toEqual([]);
  });

  it("cancelar descarta el borrador y no envía nada", () => {
    const m = montar();
    m.c.ejecutar({ tipo: "orden", id: "p1", texto: "borra todo" });
    m.c.ejecutar({ tipo: "cancelar", id: "p1" });
    m.reloj.avanzar(BORRADOR_MS * 2);
    expect(m.sesion().enviados).toEqual([]);
    expect(m.c.vista()).toMatchObject({ estado: "paseando", burbuja: null });
  });

  it("una orden escrita sale de inmediato", () => {
    const m = montar();
    m.c.orden("hola", true);
    expect(m.sesion().enviados).toEqual(["hola"]);
  });

  it("al responder muestra el detalle, dice el resumen, cuenta la tarea y actualiza los PS", async () => {
    const m = montar();
    m.c.orden("revisa", true);
    m.sesion().emitir({
      tipo: "respuesta",
      texto: "Todo bien en 3 archivos.\nVOZ: Todo está bien.",
      contextoUsado: 30,
    });
    expect(m.c.vista()).toMatchObject({
      estado: "termino",
      ps: 70,
      burbuja: { tipo: "respuesta", texto: "Todo bien en 3 archivos." },
    });
    expect(m.dichos).toEqual(["Todo está bien."]);
    expect(m.guardado.tareas).toBe(1);
    expect(m.guardado.sonado).toBe(2);
    await microtareas();
    // Tras responder no queda escuchando sin nombre: con el micrófono siempre abierto, la conversación de fondo
    // entraba como orden. Para seguirle hablando hay que llamarlo.
    expect(m.c.contexto().escuchandoA).toBeNull();
  });

  it("pide el permiso en burbuja y voz, y lo resuelve", () => {
    const m = montar();
    m.c.orden("borra el build", true);
    m.sesion().emitir({ tipo: "permiso", id: "t1", herramienta: "Bash", detalle: "rm -rf dist" });
    expect(m.c.vista()).toMatchObject({
      estado: "pidiendo_permiso",
      alterados: ["paralizado"],
      permiso: { id: "t1", herramienta: "Bash", detalle: "rm -rf dist" },
    });
    expect(m.c.contexto().permisosDe).toEqual([{ id: "p1", permisoId: "t1" }]);
    expect(m.dichos).toEqual(["Necesito tu permiso."]);
    // Una decisión de permiso que llega por `ejecutar` no hace nada, aunque traiga el id del permiso.
    m.c.ejecutar({ tipo: "permiso", id: "p1", permisoId: "t1", permitir: true });
    expect(m.sesion().permisos).toEqual([]);
    expect(m.c.vista().permiso).toMatchObject({ id: "t1" });
    m.c.responderPermisoDe(true, "p1", "t1");
    expect(m.sesion().permisos).toEqual([["t1", true]]);
    expect(m.c.vista()).toMatchObject({ estado: "trabajando", permiso: null });
  });

  it("con dos permisos en cola, el contexto solo muestra el que está a la vista", () => {
    const m = montar();
    m.c.orden("borra", true);
    m.sesion().emitir({ tipo: "permiso", id: "t1", herramienta: "Bash", detalle: "rm" });
    m.sesion().emitir({ tipo: "permiso", id: "t2", herramienta: "Write", detalle: "x" });
    expect(m.c.contexto().permisosDe).toEqual([{ id: "p1", permisoId: "t1" }]);
    m.c.responderPermisoDe(true, "p1", "t1");
    expect(m.c.contexto().permisosDe).toEqual([{ id: "p1", permisoId: "t2" }]);
  });

  it("un permiso pendiente no se resuelve solo con el paso del tiempo", () => {
    const m = montar();
    m.c.orden("borra", true);
    m.sesion().emitir({ tipo: "permiso", id: "t1", herramienta: "Bash", detalle: "rm" });
    m.reloj.avanzar(24 * 3600_000);
    m.c.tic();
    expect(m.sesion().permisos).toEqual([]);
    expect(m.c.vista().estado).toBe("pidiendo_permiso");
  });

  // Review Focus 4
  it("si la sesión falla con un permiso pendiente, queda en error y nada queda aprobado", () => {
    const m = montar();
    m.sesion().emitir({ tipo: "iniciada", sessionId: "sesion-vieja" });
    m.c.orden("borra", true);
    m.sesion().emitir({ tipo: "permiso", id: "t1", herramienta: "Bash", detalle: "rm" });
    m.sesion().emitir({ tipo: "error", mensaje: "se cayó" });
    expect(m.sesion().permisos).toEqual([["t1", false]]);
    expect(m.c.vista()).toMatchObject({
      estado: "error",
      alterados: ["confundido"],
      permiso: null,
      burbuja: { tipo: "error", texto: "se cayó" },
    });
    expect(m.sesion().permisos.filter(([, ok]) => ok)).toEqual([]);
    m.c.ejecutar({ tipo: "permiso", id: "p1", permisoId: "t1", permitir: true });
    m.c.responderPermisoDe(true, "p1", "t1");
    expect(m.sesion().permisos.filter(([, ok]) => ok)).toEqual([]);
  });

  it("una respuesta que llega con un permiso pendiente lo niega y el Pokémon vuelve a aceptar órdenes", () => {
    const m = montar();
    m.c.orden("borra", true);
    m.sesion().emitir({ tipo: "permiso", id: "t1", herramienta: "Bash", detalle: "rm" });
    m.sesion().emitir({ tipo: "permiso", id: "t2", herramienta: "Write", detalle: "x" });
    m.sesion().emitir({ tipo: "respuesta", texto: "listo\nVOZ: listo", contextoUsado: 10 });
    expect(m.sesion().permisos).toEqual([
      ["t1", false],
      ["t2", false],
    ]);
    expect(m.sesion().permisos.filter(([, ok]) => ok)).toEqual([]);
    expect(m.c.vista().permiso).toBeNull();
    expect(m.c.contexto().permisosDe).toEqual([]);
    m.c.orden("sigue", true);
    expect(m.sesion().enviados).toEqual(["borra", "sigue"]);
  });

  it("guardarlo con un permiso pendiente lo niega y cierra la sesión", () => {
    const m = montar();
    m.c.orden("borra", true);
    m.sesion().emitir({ tipo: "permiso", id: "t1", herramienta: "Bash", detalle: "rm" });
    m.c.guardar();
    expect(m.sesion().permisos).toEqual([["t1", false]]);
    expect(m.c.vista().estado).toBe("guardandose");
    m.reloj.avanzar(TIEMPOS.guardarMs);
    expect(m.sesion().cerrada).toBe(true);
    expect(m.guardado.guardados).toBe(1);
  });

  it("después de guardarse ignora lo que llegue de la sesión", () => {
    const m = montar();
    const sesion = m.sesion();
    m.c.guardar();
    m.reloj.avanzar(TIEMPOS.guardarMs);
    sesion.emitir({ tipo: "respuesta", texto: "tarde\nVOZ: tarde", contextoUsado: 10 });
    expect(m.dichos).toEqual([]);
    expect(m.guardado.tareas).toBe(0);
  });

  it("reintentar abre una sesión nueva sobre la misma conversación y reenvía la última orden", () => {
    const m = montar();
    m.sesion().emitir({ tipo: "iniciada", sessionId: "sesion-2" });
    m.c.orden("revisa", true);
    m.sesion().emitir({ tipo: "error", mensaje: "se cayó" });
    m.c.reintentar();
    expect(m.sesiones).toHaveLength(2);
    expect(m.sesiones[0].cerrada).toBe(true);
    expect(m.sesiones[1].opciones.sessionId).toBe("sesion-2");
    expect(m.sesiones[1].enviados).toEqual(["revisa"]);
    expect(m.c.vista().estado).toBe("trabajando");
  });

  it("los tests fallando lo envenenan hasta que pasen", () => {
    const m = montar();
    m.sesion().emitir({ tipo: "tests", resultado: "fallo" });
    expect(m.c.vista().alterados).toEqual(["envenenado"]);
    m.sesion().emitir({ tipo: "tests", resultado: "paso" });
    expect(m.c.vista().alterados).toEqual([]);
  });

  it("pedir el Centro Pokémon compacta la conversación", () => {
    const m = montar();
    m.c.ejecutar({ tipo: "orden", id: "p1", texto: "Ve al centro Pokémon." });
    expect(m.sesion().enviados).toEqual(["/compact"]);
    m.sesion().emitir({ tipo: "respuesta", texto: "", contextoUsado: 5 });
    expect(m.c.vista()).toMatchObject({ ps: 95, burbuja: { tipo: "aviso" } });
    expect(m.guardado.tareas).toBe(0);
  });

  it("la atención lo deja escuchando y calla lo que estuviera diciendo", () => {
    const m = montar();
    m.c.ejecutar({ tipo: "atencion", id: "p1" });
    expect(m.c.vista().estado).toBe("escuchando");
    expect(m.c.contexto().escuchandoA).toBe("p1");
    expect(m.guardado.callado).toBe(1);
  });

  /** Dice una frase como en producción: oído -> entrenador -> controlador (rápido + preciso en el alta). */
  async function oir(m: ReturnType<typeof montar>, rapido: string, preciso = rapido) {
    const f: Frase = { rapido, preciso: async () => preciso, inicioMs: null };
    crearManejadorFrases({
      decidir,
      afinar,
      guardia: { puedeResponder: () => false },
      controlador: () => m.c,
      programar: () => () => {},
      aviso: () => {},
    })(f);
    await new Promise((r) => setImmediate(r));
  }

  it("el alta aprende apodos y los guarda sin perder los que ya tenía", async () => {
    const m = montar();
    m.c.iniciarAlta();
    expect(m.c.contexto().altaDe).toBe("p1");
    for (let i = 0; i < ALTA_FRASES; i++) await oir(m, "Pikacho.", "Pikachu.");
    expect(m.c.contexto().altaDe).toBeNull();
    expect(m.guardado.apodos).toEqual([["picachu", "pikacho"]]);
    expect(m.c.contexto().candidatos[0].apodos).toEqual(["picachu", "pikacho"]);
  });

  it("durante el alta, las frases largas (charla de fondo) no cuentan ni enseñan nada", async () => {
    const m = montar();
    m.c.iniciarAlta();
    await oir(m, "entonces fuimos al mercado y compramos fruta");
    await oir(m, "entonces dijo que no venía");
    // Las dos frases largas no gastaron ninguna de las cinco: el alta sigue abierta.
    expect(m.c.contexto().altaDe).toBe("p1");
    expect(m.c.vista().burbuja?.texto).toContain("cinco veces");
    for (let i = 0; i < ALTA_FRASES; i++) await oir(m, "Pikacho.", "Pikachu.");
    expect(m.guardado.apodos).toEqual([["picachu", "pikacho"]]);
  });

  it("dos frases cortas con una palabra lejana repetida no enseñan nada", async () => {
    const m = montar();
    m.c.iniciarAlta();
    await oir(m, "entonces");
    await oir(m, "entonces");
    m.reloj.avanzar(ALTA_MS);
    expect(m.guardado.apodos).toEqual([["picachu"]]);
    expect(m.c.contexto().candidatos[0].apodos).toEqual(["picachu"]);
  });

  it("las órdenes normales durante el alta no se usan para aprender apodos", () => {
    const m = montar();
    m.c.iniciarAlta();
    m.c.orden("pikacha pikacha pikacha pikacha pikacha pikacha", true);
    m.c.ejecutar({ tipo: "alta", id: "p1", texto: "Pikacho." });
    m.reloj.avanzar(30_000);
    expect(m.guardado.apodos).toEqual([["picachu", "pikacho"]]);
  });

  it("fuera del alta, las frases repetidas no enseñan nada", () => {
    const m = montar();
    for (let i = 0; i < 6; i++) m.c.ejecutar({ tipo: "alta", id: "p1", texto: "Pikacho." });
    for (let i = 0; i < 6; i++) m.c.orden("pikacho pikacho", true);
    m.reloj.avanzar(60_000);
    expect(m.guardado.apodos).toEqual([]);
  });

  it("un evento de actividad de la sesión no cambia nada", () => {
    const m = montar();
    m.c.orden("revisa", true);
    const antes = m.c.vista();
    m.sesion().emitir({ tipo: "actividad", clase: "pensando" });
    expect(m.c.vista()).toEqual(antes);
  });

  it("la vista informa si hay micrófono", () => {
    const m = montar();
    m.c.ponerMicrofono(false);
    expect(m.c.vista().microfono).toBe(false);
  });

  describe("ventana de guardado", () => {
    it("una respuesta dentro de la ventana no cuenta tarea, no suena y no habla", () => {
      const m = montar();
      m.c.orden("revisa", true);
      const sonado = m.guardado.sonado;
      m.c.guardar();
      m.sesion().emitir({ tipo: "respuesta", texto: "listo\nVOZ: listo", contextoUsado: 10 });
      expect(m.guardado.tareas).toBe(0);
      expect(m.guardado.sonado).toBe(sonado);
      expect(m.dichos).toEqual([]);
    });

    it("un permiso dentro de la ventana no queda pendiente ni se reenvía", () => {
      const m = montar();
      m.c.guardar();
      m.sesion().emitir({ tipo: "permiso", id: "t9", herramienta: "Bash", detalle: "rm" });
      expect(m.c.vista().permiso).toBeNull();
      m.c.responderPermisoDe(true, "p1", "t9");
      expect(m.sesion().permisos).toEqual([]);
    });

    it("las órdenes, inmediatas o en borrador, no se envían", () => {
      const m = montar();
      m.c.guardar();
      m.c.orden("x", true);
      m.c.orden("y");
      m.c.ejecutar({ tipo: "orden", id: "p1", texto: "z" });
      m.c.curar();
      m.reloj.avanzar(BORRADOR_MS);
      expect(m.sesion().enviados).toEqual([]);
    });

    it("un borrador armado antes de guardar nunca se envía", () => {
      const m = montar();
      m.c.orden("z");
      m.c.guardar();
      m.reloj.avanzar(BORRADOR_MS * 2);
      expect(m.sesion().enviados).toEqual([]);
    });

    it("iniciar el alta o atender no hacen nada", () => {
      const m = montar();
      m.c.guardar();
      m.c.iniciarAlta();
      m.c.ejecutar({ tipo: "atencion", id: "p1" });
      expect(m.c.contexto().altaDe).toBeNull();
      expect(m.c.vista().estado).toBe("guardandose");
      expect(m.c.vista().burbuja).toBeNull();
    });

    it("no se publica ninguna vista después de alGuardado", () => {
      const m = montar();
      m.c.guardar();
      m.reloj.avanzar(TIEMPOS.guardarMs);
      expect(m.guardado.guardados).toBe(1);
      const n = m.vistas.length;
      m.c.ponerMicrofono(false);
      m.c.tic();
      m.sesion().emitir({ tipo: "tests", resultado: "fallo" });
      expect(m.vistas).toHaveLength(n);
    });
  });

  describe("errores y órdenes", () => {
    it("un borrador pendiente cuando llega el error nunca se envía", () => {
      const m = montar();
      m.c.orden("x");
      m.sesion().emitir({ tipo: "error", mensaje: "se cayó" });
      m.reloj.avanzar(BORRADOR_MS * 2);
      expect(m.sesion().enviados).toEqual([]);
    });

    it("en error, una orden reabre la sesión guardada y se envía a la nueva", () => {
      const m = montar();
      m.sesion().emitir({ tipo: "iniciada", sessionId: "sesion-2" });
      m.sesion().emitir({ tipo: "error", mensaje: "se cayó" });
      m.c.orden("revisa", true);
      expect(m.sesiones).toHaveLength(2);
      expect(m.sesiones[1].opciones.sessionId).toBe("sesion-2");
      expect(m.sesiones[0].enviados).toEqual([]);
      expect(m.sesiones[1].enviados).toEqual(["revisa"]);
      expect(m.c.vista().estado).toBe("trabajando");
      m.sesiones[1].emitir({ tipo: "respuesta", texto: "ok\nVOZ: ok", contextoUsado: 10 });
      expect(m.c.vista().estado).toBe("termino");
      expect(m.guardado.tareas).toBe(1);
    });

    it("en error, una orden en borrador también pasa por la sesión nueva", () => {
      const m = montar();
      m.sesion().emitir({ tipo: "error", mensaje: "se cayó" });
      m.c.orden("revisa");
      m.reloj.avanzar(BORRADOR_MS);
      expect(m.sesiones).toHaveLength(2);
      expect(m.sesiones[0].enviados).toEqual([]);
      expect(m.sesiones[1].enviados).toEqual(["revisa"]);
    });

    it("en error, el Centro Pokémon reabre la sesión y compacta en la nueva", () => {
      const m = montar();
      m.sesion().emitir({ tipo: "error", mensaje: "se cayó" });
      m.c.curar();
      expect(m.sesiones).toHaveLength(2);
      expect(m.sesiones[0].enviados).toEqual([]);
      expect(m.sesiones[1].enviados).toEqual(["/compact"]);
    });

    it("reintentar con un borrador pendiente envía la orden una vez y el borrador no dispara", () => {
      const m = montar();
      m.c.orden("revisa", true);
      m.sesion().emitir({ tipo: "error", mensaje: "se cayó" });
      m.c.orden("otra");
      m.c.reintentar();
      m.reloj.avanzar(BORRADOR_MS * 2);
      expect(m.sesiones[1].enviados).toEqual(["revisa"]);
    });

    it("el Centro Pokémon con un borrador pendiente solo envía el compactado y no cuenta tarea", () => {
      const m = montar();
      m.c.orden("hola");
      m.c.orden("ve al centro pokemon");
      m.reloj.avanzar(BORRADOR_MS * 2);
      expect(m.sesion().enviados).toEqual(["/compact"]);
      m.sesion().emitir({ tipo: "respuesta", texto: "", contextoUsado: 5 });
      expect(m.guardado.tareas).toBe(0);
    });
  });

  describe("permisos", () => {
    it("con un permiso pendiente las órdenes se ignoran", () => {
      const m = montar();
      m.c.orden("borra", true);
      m.sesion().emitir({ tipo: "permiso", id: "t1", herramienta: "Bash", detalle: "rm" });
      const antes = m.c.vista();
      m.c.orden("otra cosa");
      m.c.orden("otra cosa", true);
      m.c.ejecutar({ tipo: "orden", id: "p1", texto: "otra cosa" });
      m.reloj.avanzar(BORRADOR_MS * 2);
      expect(m.c.vista()).toEqual(antes);
      expect(m.sesion().enviados).toEqual(["borra"]);
    });

    function conDos() {
      const m = montar();
      m.c.orden("borra", true);
      m.sesion().emitir({ tipo: "permiso", id: "t1", herramienta: "Bash", detalle: "rm a" });
      m.sesion().emitir({ tipo: "permiso", id: "t2", herramienta: "Write", detalle: "b" });
      return m;
    }

    it("los permisos forman una cola: se muestra el primero y se resuelven en orden", () => {
      const m = conDos();
      expect(m.c.vista().permiso).toMatchObject({ id: "t1" });
      m.c.responderPermisoDe(true, "p1", "t1");
      expect(m.sesion().permisos).toEqual([["t1", true]]);
      expect(m.c.vista()).toMatchObject({ estado: "pidiendo_permiso", permiso: { id: "t2" } });
      m.c.responderPermisoDe(false, "p1", "t2");
      expect(m.sesion().permisos).toEqual([
        ["t1", true],
        ["t2", false],
      ]);
      expect(m.c.vista()).toMatchObject({ estado: "trabajando", permiso: null });
    });

    it("responder con un id que no es el de la cabeza no hace nada", () => {
      const m = conDos();
      m.c.responderPermisoDe(true, "p1", "t2");
      expect(m.sesion().permisos).toEqual([]);
      expect(m.c.vista().permiso).toMatchObject({ id: "t1" });
      m.c.responderPermisoDe(true, "p1", "t1");
      expect(m.sesion().permisos).toEqual([["t1", true]]);
      expect(m.c.vista().permiso).toMatchObject({ id: "t2" });
      m.c.responderPermisoDe(true, "p1", "t1");
      expect(m.sesion().permisos).toEqual([["t1", true]]);
      expect(m.c.vista().permiso).toMatchObject({ id: "t2" });
    });

    it("una respuesta de voz con el id de un permiso que ya no es la cabeza no hace nada", () => {
      const m = conDos();
      m.c.responderPermisoDe(false, "p1", "t1"); // la cabeza pasa a ser t2
      m.c.responderPermisoDe(true, "p1", "t1"); // respuesta de voz atrasada, aún con el id viejo
      expect(m.sesion().permisos).toEqual([["t1", false]]);
      expect(m.c.vista().permiso).toMatchObject({ id: "t2" });
    });

    it("un error niega todos los permisos en cola", () => {
      const m = conDos();
      m.sesion().emitir({ tipo: "error", mensaje: "se cayó" });
      expect(m.sesion().permisos).toEqual([
        ["t1", false],
        ["t2", false],
      ]);
    });

    it("guardar niega todos los permisos en cola", () => {
      const m = conDos();
      m.c.guardar();
      expect(m.sesion().permisos).toEqual([
        ["t1", false],
        ["t2", false],
      ]);
    });

    it("responderPermisoDe responde solo si el Pokémon es él y el permiso es la cabeza", () => {
      const m = conDos();
      m.c.responderPermisoDe(true, "otro", "t1"); // otro Pokémon
      m.c.responderPermisoDe(true, "t1", "p1"); // argumentos cruzados
      m.c.responderPermisoDe(true, "p1", "t2"); // no es la cabeza
      expect(m.sesion().permisos).toEqual([]);
      expect(m.c.vista().permiso).toMatchObject({ id: "t1" });
      m.c.responderPermisoDe(true, "p1", "t1");
      expect(m.sesion().permisos).toEqual([["t1", true]]);
      m.c.responderPermisoDe(false, "p1", "t1"); // id viejo: ya no es la cabeza
      expect(m.sesion().permisos).toEqual([["t1", true]]);
      expect(m.c.vista().permiso).toMatchObject({ id: "t2" });
    });

    it("instancia(id) es estable para su id, null para otro id y null una vez guardado", () => {
      const m = conDos();
      const ficha = m.c.instancia("p1");
      expect(ficha).not.toBeNull();
      expect(m.c.instancia("p1")).toBe(ficha);
      expect(m.c.instancia("otro")).toBeNull();
      m.c.guardar();
      expect(m.c.instancia("p1")).toBeNull();
      m.c.responderPermisoDe(true, "p1", "t1");
      expect(m.sesion().permisos).toEqual([
        ["t1", false],
        ["t2", false],
      ]);
    });
  });

  describe("alta sin frases", () => {
    it("si no oyó nada no guarda apodos y lo dice", () => {
      const m = montar();
      m.c.iniciarAlta();
      m.reloj.avanzar(ALTA_MS);
      const msg = "No te escuché decir mi nombre. Intentémoslo otra vez cuando quieras.";
      expect(m.guardado.apodos).toEqual([]);
      expect(m.c.vista().burbuja).toEqual({ tipo: "aviso", texto: msg });
      expect(m.dichos).toEqual([msg]);
    });

    it("si hay un permiso pendiente al terminar la ventana no toca la burbuja", () => {
      const m = montar();
      m.c.orden("borra", true);
      m.c.iniciarAlta();
      m.sesion().emitir({ tipo: "permiso", id: "t1", herramienta: "Bash", detalle: "rm" });
      const burbuja = m.c.vista().burbuja;
      m.reloj.avanzar(ALTA_MS);
      expect(m.c.vista().burbuja).toEqual(burbuja);
      expect(m.c.vista().permiso).toMatchObject({ id: "t1" });
      expect(m.dichos).toEqual(["Necesito tu permiso."]);
    });

    it("si hay un error al terminar la ventana no pisa la burbuja de error", () => {
      const m = montar();
      m.sesion().emitir({ tipo: "iniciada", sessionId: "sesion-vieja" });
      m.c.iniciarAlta();
      m.c.ejecutar({ tipo: "alta", id: "p1", texto: "Pikacho." });
      m.sesion().emitir({ tipo: "error", mensaje: "se cayó" });
      m.reloj.avanzar(ALTA_MS);
      expect(m.c.vista().burbuja).toEqual({ tipo: "error", texto: "se cayó" });
      expect(m.guardado.apodos).toHaveLength(1);
    });
  });
});

describe("actividades", () => {
  const herramienta = (nombre: string, detalle?: string): EventoSesion => ({
    tipo: "actividad",
    clase: "herramienta",
    herramienta: nombre,
    detalle,
  });

  function trabajando(opciones: { azar?: () => number } = {}) {
    const m = montar(opciones);
    m.c.orden("haz algo", true);
    return m;
  }

  it("detener: niega el permiso pendiente, interrumpe el turno, queda libre y se traga el cierre de ese turno", () => {
    const m = trabajando();
    let interrupciones = 0;
    Object.assign(m.sesion(), {
      interrumpir: () => {
        interrupciones += 1;
      },
    });
    m.sesion().emitir({ tipo: "permiso", id: "t1", herramienta: "Bash", detalle: "rm -rf dist" });
    m.c.detener();
    expect(interrupciones).toBe(1);
    // Nunca aprueba: el permiso que estaba a la vista se niega.
    expect(m.sesion().permisos).toEqual([["t1", false]]);
    expect(m.c.vista()).toMatchObject({
      permiso: null,
      burbuja: { tipo: "aviso", texto: "Detenido. Dime qué sigue." },
    });
    expect(m.c.vista().estado).not.toBe("trabajando");
    // El cierre del turno detenido no se muestra ni cuenta como tarea.
    m.sesion().emitir({ tipo: "respuesta", texto: "Me interrumpieron.", contextoUsado: 10 });
    expect(m.c.vista().ultimaRespuesta).toBeNull();
    // La siguiente orden sí se responde normal.
    m.c.orden("otra cosa", true);
    m.sesion().emitir({ tipo: "respuesta", texto: "Hecho.", contextoUsado: 12 });
    expect(m.c.vista().ultimaRespuesta).toBe("Hecho.");
  });

  it("detener sin tarea en curso no hace nada", () => {
    const m = montar();
    const antes = m.vistas.length;
    m.c.detener();
    expect(m.vistas.length).toBe(antes);
  });

  it("muestra la lista de tareas de Claude Code mientras trabaja, y el proyecto y el modelo siempre", () => {
    const m = trabajando();
    expect(m.c.vista().proyecto).toBe(basename(m.c.vista().proyecto ?? ""));
    m.sesion().emitir({
      tipo: "pendientes",
      lista: [
        { texto: "Leer el login", estado: "hecha" },
        { texto: "Arreglarlo", estado: "en_curso" },
      ],
    });
    expect(m.vistas.at(-1)?.pendientes).toHaveLength(2);
    m.sesion().emitir({ tipo: "respuesta", texto: "Listo.", contextoUsado: 0 });
    expect(m.c.vista().pendientes).toBeUndefined();
    m.c.orden("otra", true);
    expect(m.c.vista().pendientes).toBeUndefined();
  });

  it("un subagente sale como ayudante con su encargo, muestra lo que hace y se va al terminar", () => {
    const m = trabajando();
    m.sesion().emitir({ tipo: "ayudante", id: "t1", fase: "inicio", encargo: "Revisar tests" });
    expect(m.vistas.at(-1)?.ayudantes).toEqual([
      { id: "t1", especie: expect.any(Number), encargo: "Revisar tests", actividad: null },
    ]);
    expect(m.vistas.at(-1)?.ayudantes?.[0].especie).not.toBe(m.c.vista().especie);
    m.sesion().emitir({ ...herramienta("Read"), ayudante: "t1" } as EventoSesion);
    expect(m.vistas.at(-1)?.ayudantes?.[0].actividad?.tipo).toBe("leyendo");
    // Lo que hace el ayudante no es la actividad de su Pokémon.
    expect(m.vistas.at(-1)?.actividad?.tipo).toBe("pensando");
    m.sesion().emitir({ tipo: "ayudante", id: "t1", fase: "fin" });
    expect(m.vistas.at(-1)?.ayudantes).toEqual([]);
  });

  it("un ayudante de fondo sigue a la vista después de que su Pokémon responde", () => {
    const m = trabajando();
    m.sesion().emitir({ tipo: "ayudante", id: "t1", fase: "inicio" });
    m.sesion().emitir({ tipo: "respuesta", texto: "Ya lo lancé.", contextoUsado: 10 });
    expect(m.c.vista().estado).not.toBe("trabajando");
    expect(m.c.vista().ayudantes).toHaveLength(1);
    m.sesion().emitir({ tipo: "ayudante", id: "t1", fase: "fin" });
    expect(m.c.vista().ayudantes).toEqual([]);
  });

  it("un ayudante que no da señales en cinco minutos se retira solo", () => {
    const m = trabajando();
    m.sesion().emitir({ tipo: "ayudante", id: "t1", fase: "inicio" });
    m.reloj.avanzar(AYUDANTE_MUDO_MS - 1000);
    m.sesion().emitir({ ...herramienta("Read"), ayudante: "t1" } as EventoSesion);
    m.reloj.avanzar(AYUDANTE_MUDO_MS - 1000);
    m.c.tic();
    expect(m.c.vista().ayudantes).toHaveLength(1);
    m.reloj.avanzar(2000);
    m.c.tic();
    expect(m.c.vista().ayudantes).toEqual([]);
  });

  it("un error de la sesión se lleva a los ayudantes", () => {
    const m = trabajando();
    m.sesion().emitir({ tipo: "ayudante", id: "t1", fase: "inicio" });
    m.sesion().emitir({ tipo: "error", mensaje: "se cayó" });
    expect(m.c.vista().ayudantes).toEqual([]);
  });

  it("al enviar una orden empieza pensando", () => {
    const m = trabajando();
    expect(m.c.vista().estado).toBe("trabajando");
    expect(m.c.vista().actividad?.tipo).toBe("pensando");
    expect(m.vistas.at(-1)?.actividad?.tipo).toBe("pensando");
  });

  it("una herramienta pasado el segundo se publica con su verbo", () => {
    const m = trabajando();
    m.reloj.avanzar(ACTIVIDAD_MS + 1);
    m.sesion().emitir(herramienta("Edit"));
    const v = m.vistas.at(-1);
    expect(v?.actividad?.tipo).toBe("programando");
    expect(VERBOS.programando).toContain(v?.actividad?.verbo);
  });

  it("una ráfaga se junta y gana la última al cumplirse el segundo", () => {
    const m = trabajando();
    m.reloj.avanzar(ACTIVIDAD_MS + 1);
    m.sesion().emitir(herramienta("Edit"));
    const publicadas = m.vistas.length;
    m.sesion().emitir(herramienta("Read"));
    m.sesion().emitir(herramienta("Grep"));
    m.sesion().emitir(herramienta("Bash", "bun run test"));
    // El verbo espera su turno; lo que hace (el comando) se ve ya.
    expect(m.vistas.length).toBe(publicadas + 1);
    expect(m.vistas.at(-1)?.pensamiento).toBe("bun run test");
    expect(m.vistas.at(-1)?.actividad?.tipo).not.toBe("probando");
    m.reloj.avanzar(ACTIVIDAD_MS);
    expect(m.vistas.length).toBe(publicadas + 2);
    expect(m.vistas.at(-1)?.actividad?.tipo).toBe("probando");
  });

  it("cuenta los pasos de la tarea y muestra lo último que hizo; una orden nueva empieza de cero", () => {
    const m = trabajando();
    m.sesion().emitir(herramienta("Read", "src/login.ts"));
    m.sesion().emitir(herramienta("Bash", "bun run test"));
    expect(m.c.vista()).toMatchObject({ pasos: 2, pensamiento: "bun run test" });
    m.sesion().emitir({ tipo: "respuesta", texto: "Listo.", contextoUsado: 0 });
    expect(m.c.vista().pasos).toBeUndefined();
    expect(m.c.vista().pensamiento).toBeUndefined();
  });

  it("la misma actividad repetida no publica ni cambia el verbo", () => {
    const m = trabajando();
    m.reloj.avanzar(ACTIVIDAD_MS + 1);
    m.sesion().emitir(herramienta("Edit"));
    const verbo = m.c.vista().actividad?.verbo;
    const publicadas = m.vistas.length;
    m.reloj.avanzar(ACTIVIDAD_MS + 1);
    m.sesion().emitir(herramienta("Write"));
    m.reloj.avanzar(ACTIVIDAD_MS * 3);
    expect(m.vistas.length).toBe(publicadas);
    expect(m.c.vista().actividad?.verbo).toBe(verbo);
  });

  it("con un cambio pendiente, la respuesta apaga la actividad y no queda nada programado", () => {
    const m = trabajando();
    m.reloj.avanzar(ACTIVIDAD_MS + 1);
    m.sesion().emitir(herramienta("Edit"));
    m.sesion().emitir(herramienta("Read"));
    m.sesion().emitir({ tipo: "respuesta", texto: "Listo.", contextoUsado: 10 });
    expect(m.c.vista().actividad).toBeNull();
    const publicadas = m.vistas.length;
    m.reloj.avanzar(ACTIVIDAD_MS * 2);
    expect(m.vistas.length).toBe(publicadas);
  });

  it("un permiso apaga la actividad y al resolverlo vuelve una", () => {
    const m = trabajando();
    m.reloj.avanzar(ACTIVIDAD_MS + 1);
    m.sesion().emitir(herramienta("Edit"));
    m.sesion().emitir(herramienta("Read"));
    m.sesion().emitir({ tipo: "permiso", id: "t1", herramienta: "Bash", detalle: "ls" });
    expect(m.c.vista()).toMatchObject({ estado: "pidiendo_permiso", actividad: null });
    const publicadas = m.vistas.length;
    m.reloj.avanzar(ACTIVIDAD_MS * 2);
    expect(m.vistas.length).toBe(publicadas);
    expect(m.c.vista().actividad).toBeNull();
    m.c.responderPermisoDe(true, "p1", "t1");
    expect(m.c.vista().estado).toBe("trabajando");
    expect(m.c.vista().actividad?.tipo).toBe("pensando");
  });

  it("fuera de trabajando un evento de actividad no hace nada", () => {
    const m = montar();
    expect(m.c.vista().estado).toBe("paseando");
    const publicadas = m.vistas.length;
    m.sesion().emitir(herramienta("Edit"));
    m.reloj.avanzar(ACTIVIDAD_MS * 2);
    expect(m.vistas.length).toBe(publicadas);
    expect(m.c.vista().actividad).toBeNull();

    const e = trabajando();
    e.sesion().emitir({ tipo: "error", mensaje: "se cayó" });
    const antes = e.vistas.length;
    e.sesion().emitir(herramienta("Edit"));
    e.reloj.avanzar(ACTIVIDAD_MS * 2);
    expect(e.vistas.length).toBe(antes);
    expect(e.c.vista()).toMatchObject({ estado: "error", actividad: null });
  });

  it("tras guardar no se publica nada más", () => {
    const m = trabajando();
    m.reloj.avanzar(ACTIVIDAD_MS + 1);
    m.sesion().emitir(herramienta("Edit"));
    m.sesion().emitir(herramienta("Read"));
    m.c.guardar();
    const publicadas = m.vistas.length;
    m.sesion().emitir(herramienta("Grep"));
    m.reloj.avanzar(ACTIVIDAD_MS * 2);
    expect(m.vistas.length).toBe(publicadas);
  });

  it("el verbo sale del azar inyectado", () => {
    const m = trabajando({ azar: () => 0 });
    m.reloj.avanzar(ACTIVIDAD_MS + 1);
    m.sesion().emitir(herramienta("Edit"));
    expect(m.c.vista().actividad?.verbo).toBe(VERBOS.programando[0]);
  });

  it("volver a trabajar reinicia en pensando y una actividad previa no se arrastra", () => {
    const m = trabajando();
    m.reloj.avanzar(ACTIVIDAD_MS + 1);
    m.sesion().emitir(herramienta("Edit"));
    m.sesion().emitir({ tipo: "error", mensaje: "se cayó" });
    m.c.reintentar();
    expect(m.c.vista()).toMatchObject({ estado: "trabajando", actividad: { tipo: "pensando" } });
  });

  it("un evento dentro de la primera ventana se aplica al cumplirse ACTIVIDAD_MS", () => {
    const m = trabajando();
    m.reloj.avanzar(ACTIVIDAD_MS - 100);
    m.sesion().emitir(herramienta("Edit"));
    expect(m.c.vista().actividad?.tipo).toBe("pensando");
    m.reloj.avanzar(99);
    expect(m.c.vista().actividad?.tipo).toBe("pensando");
    m.reloj.avanzar(1);
    expect(m.c.vista().actividad?.tipo).toBe("programando");
  });

  it("un permiso aprobado dentro del segundo no deja que reviva el cambio pendiente", () => {
    const m = trabajando();
    m.reloj.avanzar(ACTIVIDAD_MS + 1);
    m.sesion().emitir(herramienta("Edit"));
    m.sesion().emitir(herramienta("Read"));
    m.sesion().emitir({ tipo: "permiso", id: "t1", herramienta: "Bash", detalle: "ls" });
    m.c.responderPermisoDe(true, "p1", "t1");
    expect(m.c.vista().actividad?.tipo).toBe("pensando");
    m.reloj.avanzar(ACTIVIDAD_MS - 1);
    expect(m.c.vista().actividad?.tipo).toBe("pensando");
    m.reloj.avanzar(ACTIVIDAD_MS);
    expect(m.c.vista().actividad?.tipo).toBe("pensando");
  });
});

describe("avisos y borradores a la vista", () => {
  it("el borrador de una orden hablada se anuncia en la vista mientras está pendiente", () => {
    const m = montar();
    expect(m.c.vista().borrador).toBeNull();
    m.c.orden("revisa el deploy");
    expect(m.c.vista().borrador).toEqual(expect.any(Number));
    m.reloj.avanzar(BORRADOR_MS);
    expect(m.c.vista().borrador).toBeNull();
  });

  it("un borrador cancelado deja de anunciarse", () => {
    const m = montar();
    m.c.orden("borra todo");
    m.c.cancelar();
    expect(m.c.vista().borrador).toBeNull();
  });

  it("un borrador mientras trabaja también se anuncia (para poder verlo y cancelarlo)", () => {
    const m = montar();
    m.c.orden("primero", true);
    expect(m.c.vista().estado).toBe("trabajando");
    m.c.orden("segundo");
    expect(m.c.vista()).toMatchObject({ estado: "trabajando", borrador: expect.any(Number) });
  });

  it("un aviso se borra solo a los 8 s", () => {
    const m = montar();
    m.c.curar();
    expect(m.c.vista().burbuja).toMatchObject({ tipo: "aviso" });
    m.reloj.avanzar(AVISO_MS - 1);
    expect(m.c.vista().burbuja).toMatchObject({ tipo: "aviso" });
    const publicadas = m.vistas.length;
    m.reloj.avanzar(1);
    expect(m.c.vista().burbuja).toBeNull();
    expect(m.vistas.length).toBe(publicadas + 1);
  });

  it("cada aviso nuevo reinicia los 8 s", () => {
    const m = montar();
    m.c.curar();
    m.reloj.avanzar(5000);
    m.c.curar();
    m.reloj.avanzar(AVISO_MS - 1);
    expect(m.c.vista().burbuja).toMatchObject({ tipo: "aviso" });
    m.reloj.avanzar(1);
    expect(m.c.vista().burbuja).toBeNull();
  });

  it("no borra una burbuja de otro tipo que llegó después del aviso", () => {
    const m = montar();
    m.c.curar();
    m.sesion().emitir({ tipo: "respuesta", texto: "", contextoUsado: 5 });
    m.c.orden("sigue", true);
    expect(m.c.vista().burbuja).toEqual({ tipo: "escucha", texto: "sigue" });
    m.reloj.avanzar(AVISO_MS * 2);
    expect(m.c.vista().burbuja).toEqual({ tipo: "escucha", texto: "sigue" });
  });

  it("no borra la burbuja de error", () => {
    const m = montar();
    m.sesion().emitir({ tipo: "iniciada", sessionId: "sesion-vieja" });
    m.c.curar();
    m.sesion().emitir({ tipo: "error", mensaje: "se cayó" });
    m.reloj.avanzar(AVISO_MS * 2);
    expect(m.c.vista()).toMatchObject({ estado: "error", burbuja: { tipo: "error", texto: "se cayó" } });
  });

  it("no borra la pregunta de un permiso pendiente", () => {
    const m = montar();
    m.c.curar();
    m.sesion().emitir({ tipo: "permiso", id: "t1", herramienta: "Bash", detalle: "ls" });
    const antes = m.c.vista();
    m.reloj.avanzar(AVISO_MS * 2);
    expect(m.c.vista()).toEqual(antes);
    expect(m.c.vista().permiso).toMatchObject({ id: "t1" });
  });

  it("las burbujas del alta se quedan durante toda la ventana y el resultado se borra a los 8 s", () => {
    const m = montar();
    m.c.iniciarAlta();
    expect(m.c.vista().burbuja).toMatchObject({ tipo: "aviso" });
    m.reloj.avanzar(AVISO_MS + 1000);
    expect(m.c.vista().burbuja).toMatchObject({
      tipo: "aviso",
      texto: expect.stringContaining("cinco veces"),
    });
    m.c.ejecutar({ tipo: "alta", id: "p1", texto: "Pikacho. Pikachu." });
    expect(m.c.vista().burbuja?.texto).toBe("Te oí. Faltan 4.");
    m.reloj.avanzar(AVISO_MS + 1000);
    expect(m.c.vista().burbuja?.texto).toBe("Te oí. Faltan 4.");
    m.reloj.avanzar(ALTA_MS);
    expect(m.c.vista().burbuja?.texto).toContain("Ahora también respondo a");
    m.reloj.avanzar(AVISO_MS);
    expect(m.c.vista().burbuja).toBeNull();
  });
});

describe("nombre propio", () => {
  const rayo: Pokemon = { ...pikachu, nombre: "Rayo", apodos: [] };

  it("responde a su nombre propio y al de su especie; la vista dice cuál es la especie", () => {
    const m = montar({ pokemon: rayo });
    expect(m.c.contexto().candidatos[0]).toMatchObject({ nombre: "Rayo", alias: ["Pikachu"] });
    expect(m.c.vista()).toMatchObject({ nombre: "Rayo", especieNombre: "Pikachu" });
  });

  it("con el nombre de la especie no hay alias ni especieNombre", () => {
    const m = montar();
    expect(m.c.contexto().candidatos[0].alias ?? []).toEqual([]);
    expect(m.c.vista().especieNombre).toBeUndefined();
  });

  it("el alta pide el número de frases que se le diga y lo dice con palabras", () => {
    const m = montar({ pokemon: rayo });
    m.c.iniciarAlta(ALTA_FRASES_BAUTIZO);
    expect(m.c.vista().burbuja?.texto).toBe('Di "Rayo" tres veces, con una pausa entre cada una.');
    expect(m.c.vista().alta).toBe(true);
  });

  it("el alta del bautizo termina con tres frases y aprende cómo se oye el nombre nuevo", async () => {
    const m = montar({ pokemon: rayo });
    m.c.iniciarAlta(ALTA_FRASES_BAUTIZO);
    const f = (rapido: string): Frase => ({ rapido, preciso: async () => rapido, inicioMs: null });
    const manejar = crearManejadorFrases({
      decidir,
      afinar,
      guardia: { puedeResponder: () => false },
      controlador: () => m.c,
      programar: () => () => {},
      aviso: () => {},
    });
    for (let i = 0; i < ALTA_FRASES_BAUTIZO; i++) {
      manejar(f("Rallo."));
      await new Promise((r) => setImmediate(r));
    }
    expect(m.c.contexto().altaDe).toBeNull();
    expect(m.c.vista().alta).toBe(false);
    expect(m.guardado.apodos).toEqual([["rallo"]]);
  });

  const decirVarias = async (m: ReturnType<typeof montar>, frases: string[]) => {
    const manejar = crearManejadorFrases({
      decidir,
      afinar,
      guardia: { puedeResponder: () => false },
      controlador: () => m.c,
      programar: () => () => {},
      aviso: () => {},
    });
    for (const rapido of frases) {
      manejar({ rapido, preciso: async () => rapido, inicioMs: null });
      await new Promise((r) => setImmediate(r));
    }
  };

  it("el alta no aprende una variante que suena a una palabra de mando (Halo no aprende «hazlo»)", async () => {
    const halo: Pokemon = { ...pikachu, nombre: "Halo", apodos: [] };
    const m = montar({ pokemon: halo, reservadas: ["hazlo", "llama"] });
    m.c.iniciarAlta(ALTA_FRASES_BAUTIZO);
    await decirVarias(m, ["Hazlo.", "Hazlo.", "Halo."]);
    expect(m.guardado.apodos).toEqual([[]]);
    expect(m.c.contexto().candidatos[0].apodos).toEqual([]);
  });

  it("el alta no aprende una variante que suena al nombre de otro del equipo", async () => {
    const llaves: Pokemon = { ...pikachu, nombre: "Llaves", apodos: [] };
    const m = montar({ pokemon: llaves, ajenos: () => ["Yamas", "Squirtle"] });
    m.c.iniciarAlta(ALTA_FRASES_BAUTIZO);
    await decirVarias(m, ["Yamas.", "Yamas.", "Yaves."]);
    expect(m.guardado.apodos).toEqual([["yaves"]]);
  });

  it("saltar el alta la termina sin aprender nada, quita la marca y no deja el aviso", () => {
    const m = montar({ pokemon: rayo });
    m.c.iniciarAlta(ALTA_FRASES_BAUTIZO);
    m.c.saltarAlta();
    expect(m.c.contexto().altaDe).toBeNull();
    expect(m.c.vista().alta).toBe(false);
    expect(m.c.vista().burbuja).toBeNull();
    m.reloj.avanzar(ALTA_MS);
    expect(m.guardado.apodos).toEqual([]);
  });

  it("sin iniciar el alta, la vista no la marca; el alta normal sigue pidiendo cinco", () => {
    const m = montar({ pokemon: rayo });
    expect(m.c.vista().alta).toBeFalsy();
    m.c.iniciarAlta();
    expect(m.c.vista().burbuja?.texto).toContain("cinco veces");
  });
});

describe("última respuesta", () => {
  it("la vista conserva la última respuesta aunque otra burbuja la tape", () => {
    const m = montar();
    expect(m.c.vista().ultimaRespuesta).toBeNull();
    m.c.orden("revisa", true);
    m.sesion().emitir({
      tipo: "respuesta",
      texto: "Todo bien en 3 archivos.\nVOZ: Todo bien.",
      contextoUsado: 10,
    });
    m.reloj.avanzar(TIEMPOS.celebrarMs);
    m.c.ejecutar({ tipo: "atencion", id: "p1" });
    expect(m.c.vista().burbuja).toEqual({ tipo: "escucha", texto: "Te escucho." });
    expect(m.c.vista().ultimaRespuesta).toBe("Todo bien en 3 archivos.");
  });

  it("una respuesta nueva reemplaza a la anterior; el Centro Pokémon no la toca", () => {
    const m = montar();
    m.c.orden("a", true);
    m.sesion().emitir({ tipo: "respuesta", texto: "uno\nVOZ: uno", contextoUsado: 10 });
    m.c.curar();
    m.sesion().emitir({ tipo: "respuesta", texto: "", contextoUsado: 5 });
    expect(m.c.vista().ultimaRespuesta).toBe("uno");
    m.c.orden("b", true);
    m.sesion().emitir({ tipo: "respuesta", texto: "dos\nVOZ: dos", contextoUsado: 10 });
    expect(m.c.vista().ultimaRespuesta).toBe("dos");
  });

  function conVozPendiente() {
    let terminar: () => void = () => {};
    let falla: (e: Error) => void = () => {};
    const m = montar({
      decir: (texto) =>
        texto === "Todo bien."
          ? new Promise<void>((res, rej) => {
              terminar = res;
              falla = rej;
            })
          : Promise.resolve(),
    });
    m.c.orden("revisa", true);
    m.sesion().emitir({ tipo: "respuesta", texto: "Todo bien en 3.\nVOZ: Todo bien.", contextoUsado: 10 });
    return { m, terminar: () => terminar(), falla: (e: Error) => falla(e) };
  }

  it("mientras el Pokémon sigue hablando la respuesta no sale de termino, aunque pasen los 4 s", async () => {
    const { m, terminar } = conVozPendiente();
    await microtareas();
    m.reloj.avanzar(TIEMPOS.celebrarMs * 3);
    m.c.tic();
    expect(m.c.vista().estado).toBe("termino");
    terminar();
    await microtareas();
    expect(m.c.vista().estado).toBe("paseando");
  });

  it("si la voz ya terminó, termino dura sus 4 s", async () => {
    const m = montar();
    m.c.orden("revisa", true);
    m.sesion().emitir({ tipo: "respuesta", texto: "ok\nVOZ: ok", contextoUsado: 10 });
    await microtareas();
    m.reloj.avanzar(TIEMPOS.celebrarMs - 1);
    m.c.tic();
    expect(m.c.vista().estado).toBe("termino");
    m.reloj.avanzar(1);
    m.c.tic();
    expect(m.c.vista().estado).toBe("paseando");
  });

  it("si la voz termina antes de los 4 s, espera hasta los 4 s", async () => {
    const { m, terminar } = conVozPendiente();
    m.reloj.avanzar(1000);
    terminar();
    await microtareas();
    expect(m.c.vista().estado).toBe("termino");
    m.reloj.avanzar(TIEMPOS.celebrarMs);
    m.c.tic();
    expect(m.c.vista().estado).toBe("paseando");
  });

  it("si la voz falla no retiene el estado", async () => {
    const { m, falla } = conVozPendiente();
    m.reloj.avanzar(TIEMPOS.celebrarMs);
    falla(new Error("sin audio"));
    await microtareas();
    m.c.tic();
    expect(m.c.vista().estado).toBe("paseando");
  });
});

describe("sesión que no se puede retomar", () => {
  const textoRetomar = "No pude retomar la conversación anterior. Empezamos una nueva.";

  it("un error antes de iniciar con una sesión retomada olvida el id y la siguiente empieza de cero", () => {
    const m = montar();
    expect(m.sesion().opciones.sessionId).toBe("sesion-vieja");
    m.sesion().emitir({ tipo: "error", mensaje: "No conversation found" });
    expect(m.guardado.sesion).toEqual([null]);
    expect(m.c.vista()).toMatchObject({ estado: "error", burbuja: { tipo: "error", texto: textoRetomar } });
    m.c.reintentar();
    expect(m.sesiones).toHaveLength(2);
    expect(m.sesiones[1].opciones.sessionId).toBeNull();
  });

  it("una orden después de ese error también abre una sesión sin id", () => {
    const m = montar();
    m.sesion().emitir({ tipo: "error", mensaje: "No conversation found" });
    m.c.orden("sigue", true);
    expect(m.sesiones[1].opciones.sessionId).toBeNull();
    expect(m.sesiones[1].enviados).toEqual(["sigue"]);
  });

  it("un fallo distinto antes de iniciar conserva la conversación la primera vez y la suelta a la segunda", () => {
    const m = montar();
    m.sesion().emitir({ tipo: "error", mensaje: "no encontré la carpeta" });
    expect(m.guardado.sesion).toEqual([]);
    expect(m.c.vista().burbuja).toEqual({ tipo: "error", texto: "no encontré la carpeta" });
    m.c.reintentar();
    expect(m.sesiones[1].opciones.sessionId).toBe("sesion-vieja");
    m.sesiones[1].emitir({ tipo: "error", mensaje: "no encontré la carpeta" });
    expect(m.guardado.sesion).toEqual([null]);
    expect(m.c.vista().burbuja).toEqual({ tipo: "error", texto: textoRetomar });
    m.c.reintentar();
    expect(m.sesiones[2].opciones.sessionId).toBeNull();
  });

  it("si al reintentar la conversación sí retoma, el conteo de fallos vuelve a cero", () => {
    const m = montar();
    m.sesion().emitir({ tipo: "error", mensaje: "no encontré la carpeta" });
    m.c.reintentar();
    m.sesiones[1].emitir({ tipo: "iniciada", sessionId: "sesion-vieja" });
    m.sesiones[1].emitir({ tipo: "error", mensaje: "se cayó" });
    m.c.reintentar();
    m.sesiones[2].emitir({ tipo: "error", mensaje: "no encontré la carpeta" });
    expect(m.guardado.sesion).not.toContain(null);
  });

  it("un error después de iniciada conserva el id", () => {
    const m = montar();
    m.sesion().emitir({ tipo: "iniciada", sessionId: "sesion-2" });
    m.sesion().emitir({ tipo: "error", mensaje: "se cayó" });
    expect(m.guardado.sesion).toEqual(["sesion-2"]);
    expect(m.c.vista().burbuja).toEqual({ tipo: "error", texto: "se cayó" });
    m.c.reintentar();
    expect(m.sesiones[1].opciones.sessionId).toBe("sesion-2");
  });

  it("un error antes de iniciar en una sesión que no retomaba nada deja el mensaje tal cual", () => {
    const m = montar();
    m.sesion().emitir({ tipo: "error", mensaje: "No conversation found" });
    m.c.reintentar();
    expect(m.sesion().opciones.sessionId).toBeNull();
    m.sesion().emitir({ tipo: "error", mensaje: "sin red" });
    expect(m.guardado.sesion).toEqual([null]);
    expect(m.c.vista().burbuja).toEqual({ tipo: "error", texto: "sin red" });
  });
});

describe("borrador: lo que se ve es lo que se envía", () => {
  it("abrirBorrador muestra el texto rápido ya y devuelve un asa", () => {
    const m = montar();
    const h = m.c.abrirBorrador("p1", "corre los tes");
    expect(h).not.toBeNull();
    expect(m.c.vista()).toMatchObject({
      estado: "escuchando",
      burbuja: { tipo: "escucha", texto: "corre los tes" },
      borrador: expect.any(Number),
    });
    expect(m.c.contexto().borradoresDe).toEqual(["p1"]);
    expect(m.guardado.callado).toBe(1);
  });

  it("sale con el texto rápido, tal cual, al cerrarse la ventana", () => {
    const m = montar();
    m.c.abrirBorrador("p1", "usa sonnet y luego opus");
    m.reloj.avanzar(BORRADOR_MS - 1);
    expect(m.sesion().enviados).toEqual([]);
    m.reloj.avanzar(1);
    expect(m.sesion().enviados).toEqual(["usa sonnet y luego opus"]);
    expect(m.c.vista()).toMatchObject({ estado: "trabajando", borrador: null });
  });

  it("cancelar durante la ventana no envía nada", () => {
    const m = montar();
    m.c.abrirBorrador("p1", "borra todo");
    m.reloj.avanzar(BORRADOR_MS / 2);
    m.c.cancelar();
    expect(m.c.vista()).toMatchObject({ borrador: null, burbuja: null });
    m.reloj.avanzar(BORRADOR_MS * 4);
    expect(m.sesion().enviados).toEqual([]);
  });

  it("una orden nueva reemplaza la pendiente: la ventana vieja no envía la nueva antes de tiempo", () => {
    const m = montar();
    const h1 = m.c.abrirBorrador("p1", "primera") as number;
    m.reloj.avanzar(BORRADOR_MS / 2);
    const h2 = m.c.abrirBorrador("p1", "segunda") as number;
    expect(h2).not.toBe(h1);
    expect(m.c.vista()).toMatchObject({ burbuja: { texto: "segunda" }, borrador: h2 });
    m.reloj.avanzar(BORRADOR_MS / 2);
    expect(m.sesion().enviados).toEqual([]);
    m.reloj.avanzar(BORRADOR_MS / 2);
    expect(m.sesion().enviados).toEqual(["segunda"]);
  });

  it("un permiso que llega durante la ventana descarta el borrador", () => {
    const m = montar();
    m.c.abrirBorrador("p1", "borra todo");
    m.sesion().emitir({ tipo: "permiso", id: "A", herramienta: "Bash", detalle: "rm" });
    expect(m.c.vista()).toMatchObject({ borrador: null, permiso: { id: "A" } });
    m.reloj.avanzar(BORRADOR_MS * 4);
    expect(m.sesion().enviados).toEqual([]);
    expect(m.sesion().permisos).toEqual([]);
    expect(m.c.vista().permiso).toMatchObject({ id: "A" });
  });

  it("con un permiso a la vista no se abre ningún borrador", () => {
    const m = montar();
    m.sesion().emitir({ tipo: "permiso", id: "A", herramienta: "Bash", detalle: "rm" });
    expect(m.c.abrirBorrador("p1", "algo")).toBeNull();
  });

  it("guardar durante la ventana lo descarta: nunca se envía", () => {
    const m = montar();
    m.c.abrirBorrador("p1", "algo");
    m.c.guardar();
    m.reloj.avanzar(BORRADOR_MS * 4);
    expect(m.sesion().enviados).toEqual([]);
  });

  it("un error durante la ventana lo descarta: nunca se envía", () => {
    const m = montar();
    m.c.abrirBorrador("p1", "algo");
    m.sesion().emitir({ tipo: "error", mensaje: "se cayó" });
    expect(m.c.vista()).toMatchObject({ borrador: null });
    m.reloj.avanzar(BORRADOR_MS * 4);
    expect(m.sesiones.flatMap((s) => s.enviados)).toEqual([]);
  });

  it("guardado, o con otro id, no abre nada", () => {
    const m = montar();
    expect(m.c.abrirBorrador("otro", "x")).toBeNull();
    m.c.guardar();
    expect(m.c.abrirBorrador("p1", "x")).toBeNull();
  });

  it("'Centro Pokémon' dicho en el texto rápido cura al momento y no deja borrador", () => {
    const m = montar();
    expect(m.c.abrirBorrador("p1", "llévalo al centro pokémon")).toBeNull();
    expect(m.sesion().enviados).toEqual(["/compact"]);
    expect(m.c.vista().borrador).toBeNull();
  });
});

describe("borrador por partes: la frase que se partió por una pausa", () => {
  const abrir = (m: ReturnType<typeof montar>) => m.c.abrirBorrador("p1", "revisa el deploy") as number;

  it("(a) con voz en curso al cerrarse la ventana no sale; si la voz calla sin frase, sale a los 0,5 s", () => {
    const m = montar();
    abrir(m);
    m.c.voz(true);
    m.reloj.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual([]);
    m.reloj.avanzar(RETENCION_MAX_MS - 1);
    expect(m.sesion().enviados).toEqual([]);
    expect(m.c.vista().borrador).toEqual(expect.any(Number));
    m.c.voz(false);
    m.reloj.avanzar(VOZ_SIN_TROZO_MS - 1);
    expect(m.sesion().enviados).toEqual([]);
    m.reloj.avanzar(1);
    expect(m.sesion().enviados).toEqual(["revisa el deploy"]);
    expect(m.c.vista().borrador).toBeNull();
  });

  it("voz de fondo que no calla: el borrador no queda retenido más de RETENCION_MAX_MS", () => {
    const m = montar();
    abrir(m);
    m.c.voz(true);
    m.reloj.avanzar(BORRADOR_MS);
    m.reloj.avanzar(RETENCION_MAX_MS / 2);
    // Un parpadeo de la voz no reinicia el tope.
    m.c.voz(false);
    m.c.voz(true);
    m.reloj.avanzar(RETENCION_MAX_MS / 2 - 1);
    expect(m.sesion().enviados).toEqual([]);
    m.reloj.avanzar(1);
    expect(m.sesion().enviados).toEqual(["revisa el deploy"]);
  });

  it("una orden no junta más de MAX_PARTES partes: lo que sobra no se pega", () => {
    const m = montar();
    abrir(m);
    for (let i = 1; i < MAX_PARTES; i++) expect(m.c.continuarBorrador("p1", `parte ${i}`)).not.toBeNull();
    expect(m.c.continuarBorrador("p1", "de más")).toBeNull();
    expect(m.c.vista().burbuja).toMatchObject({ texto: expect.not.stringContaining("de más") });
  });

  it("(a) si la voz vuelve durante la espera de 0,5 s, sigue reteniendo", () => {
    const m = montar();
    abrir(m);
    m.c.voz(true);
    m.reloj.avanzar(BORRADOR_MS);
    m.c.voz(false);
    m.reloj.avanzar(VOZ_SIN_TROZO_MS - 100);
    m.c.voz(true);
    m.reloj.avanzar(VOZ_SIN_TROZO_MS * 3);
    expect(m.sesion().enviados).toEqual([]);
  });

  it("(b) con voz en curso llega la continuación: texto unido, sale BORRADOR_MS después de ella", () => {
    const m = montar();
    const h = abrir(m);
    m.c.voz(true);
    m.reloj.avanzar(BORRADOR_MS);
    m.c.voz(false);
    m.reloj.avanzar(300);
    const asa = m.c.continuarBorrador("p1", "de acme y corre los tests");
    expect(asa).toEqual({ borrador: h, parte: 1 });
    expect(m.c.vista()).toMatchObject({
      estado: "escuchando",
      borrador: expect.any(Number),
      burbuja: { tipo: "escucha", texto: "revisa el deploy de acme y corre los tests" },
    });
    // El temporizador de 0,5 s quedó cancelado.
    m.reloj.avanzar(BORRADOR_MS - 1);
    expect(m.sesion().enviados).toEqual([]);
    m.reloj.avanzar(1);
    expect(m.sesion().enviados).toEqual(["revisa el deploy de acme y corre los tests"]);
  });

  it("(c) una continuación sin retención también se pega, y reinicia la ventana", () => {
    const m = montar();
    const h = abrir(m);
    m.reloj.avanzar(BORRADOR_MS / 2);
    expect(m.c.continuarBorrador("p1", "y los tests")).toEqual({ borrador: h, parte: 1 });
    m.reloj.avanzar(BORRADOR_MS - 1);
    expect(m.sesion().enviados).toEqual([]);
    m.reloj.avanzar(1);
    expect(m.sesion().enviados).toEqual(["revisa el deploy y los tests"]);
  });

  it("(d) con un permiso a la vista no se pega nada, y un permiso que aparece descarta el borrador", () => {
    const m = montar();
    abrir(m);
    m.sesion().emitir({ tipo: "permiso", id: "A", herramienta: "Bash", detalle: "rm" });
    expect(m.c.continuarBorrador("p1", "y borra todo")).toBeNull();
    expect(m.c.vista().borrador).toBeNull();
    m.reloj.avanzar(BORRADOR_MS * 4);
    expect(m.sesion().enviados).toEqual([]);
    expect(m.sesion().permisos).toEqual([]);
    expect(m.c.vista().permiso).toMatchObject({ id: "A" });
  });

  it("(e) sin borrador, guardado u otro Pokémon: null", () => {
    const m = montar();
    expect(m.c.continuarBorrador("p1", "y los tests")).toBeNull();
    abrir(m);
    expect(m.c.continuarBorrador("otro", "y los tests")).toBeNull();
    m.c.guardar();
    expect(m.c.continuarBorrador("p1", "y los tests")).toBeNull();
  });

  it("'Centro Pokémon' dicho en la continuación cura y no deja borrador", () => {
    const m = montar();
    abrir(m);
    expect(m.c.continuarBorrador("p1", "y llévalo al centro pokémon")).toBeNull();
    expect(m.sesion().enviados).toEqual(["/compact"]);
    expect(m.c.vista().borrador).toBeNull();
  });

  it("cancelar y una orden nueva limpian la retención", () => {
    const m = montar();
    abrir(m);
    m.c.voz(true);
    m.reloj.avanzar(BORRADOR_MS);
    m.c.cancelar();
    m.c.voz(false);
    m.reloj.avanzar(VOZ_SIN_TROZO_MS * 2);
    expect(m.sesion().enviados).toEqual([]);
    expect(m.c.vista().borrador).toBeNull();
    m.c.abrirBorrador("p1", "nueva");
    m.reloj.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual(["nueva"]);
  });

  it("ejecutar ignora la decisión continuar: solo entra por frases.ts", () => {
    const m = montar();
    abrir(m);
    m.c.ejecutar({ tipo: "continuar", id: "p1", texto: "y los tests" });
    expect(m.c.vista().burbuja).toEqual({ tipo: "escucha", texto: "revisa el deploy" });
  });

  it("tic no baja a paseando ni borra la burbuja mientras hay un borrador retenido", () => {
    const m = montar();
    abrir(m);
    m.c.voz(true);
    for (let i = 0; i < 14; i++) {
      m.reloj.avanzar(500);
      m.c.tic();
    }
    expect(m.sesion().enviados).toEqual([]);
    expect(m.c.vista()).toMatchObject({
      estado: "escuchando",
      burbuja: { tipo: "escucha", texto: "revisa el deploy" },
    });
  });
});

describe("comandos con barra escritos en la burbuja", () => {
  it("un texto sin barra sigue siendo una orden inmediata", () => {
    const m = montar();
    m.c.comando("revisa el deploy");
    expect(m.sesion().enviados).toEqual(["revisa el deploy"]);
  });

  it("/compact y los demás de Claude Code se envían tal cual", () => {
    const m = montar();
    m.c.comando("/compact");
    expect(m.sesion().enviados).toEqual(["/compact"]);
  });

  it("/model opus cambia el modelo de la sesión y lo avisa, sin enviar mensaje", async () => {
    const m = montar();
    m.c.comando("/model opus");
    await microtareas();
    expect(m.sesion().modelos).toEqual(["opus"]);
    expect(m.sesion().enviados).toEqual([]);
    expect(m.c.vista().burbuja).toEqual({ tipo: "aviso", texto: "Listo, ahora uso Opus." });
  });

  it("/model guarda el modelo como propio del Pokémon, también si coincide con el de su tipo", async () => {
    const m = montar({ modelo: "sonnet" });
    m.c.comando("/model opus");
    await microtareas();
    expect(m.guardados).toEqual([[m.c.vista().id, "opus"]]);
    expect(m.c.vista().modelo).toBe("opus");
    m.c.comando("/model sonnet");
    await microtareas();
    expect(m.guardados.at(-1)).toEqual([m.c.vista().id, "sonnet"]);
    expect(m.c.vista().modelo).toBe("sonnet");
  });

  it("cambiarModelo (el menú) aplica a la sesión como /model, avisa y guarda", async () => {
    const m = montar({ modelo: "sonnet" });
    m.c.cambiarModelo("haiku");
    await microtareas();
    expect(m.sesion().modelos).toEqual(["haiku"]);
    expect(m.sesion().enviados).toEqual([]);
    expect(m.guardados).toEqual([[m.c.vista().id, "haiku"]]);
    expect(m.c.vista().burbuja).toEqual({ tipo: "aviso", texto: "Listo, ahora uso Haiku." });
    expect(m.c.vista().modelo).toBe("haiku");
  });

  it("si el cambio de modelo falla no se guarda nada y la ficha sigue con el de antes", async () => {
    const m = montar({ modelo: "sonnet" });
    m.sesion().falloModelo = new Error("x");
    m.c.cambiarModelo("opus");
    await microtareas();
    expect(m.guardados).toEqual([]);
    expect(m.c.vista().modelo).toBe("sonnet");
  });

  it("/model con un id conocido pero fuera del menú (fable) también se guarda", async () => {
    const m = montar({ modelo: "sonnet" });
    m.c.comando("/model fable");
    await microtareas();
    expect(m.guardados).toEqual([[m.c.vista().id, "fable"]]);
  });

  it("/model con un id desconocido cambia solo la sesión viva, no lo guarda y lo dice", async () => {
    const m = montar({ modelo: "sonnet" });
    m.c.comando("/model gpt-9");
    await microtareas();
    expect(m.sesion().modelos).toEqual(["gpt-9"]);
    expect(m.guardados).toEqual([]);
    expect(m.c.vista().burbuja?.texto).toMatch(/solo para esta sesión.*no lo guardo/i);
  });

  it("tras /model opus, /reiniciar crea la sesión nueva con opus", async () => {
    const m = montar({ modelo: "sonnet" });
    m.c.comando("/model opus");
    await microtareas();
    m.c.comando("/reiniciar");
    expect(m.sesiones).toHaveLength(2);
    expect(m.sesion().opciones.modelo).toBe("opus");
  });

  it("avisa que el cambio de modelo se resolvió, con éxito o con fallo (la barra se rehace)", async () => {
    const llamadas: string[] = [];
    const m = montar({ modelo: "sonnet", alResolverModelo: () => llamadas.push("r") });
    m.c.cambiarModelo("haiku");
    await microtareas();
    m.sesion().falloModelo = new Error("x");
    m.c.cambiarModelo("opus");
    await microtareas();
    expect(llamadas).toEqual(["r", "r"]);
  });

  it("modelo() es el efectivo, sin armar la vista", async () => {
    const m = montar({ modelo: "sonnet" });
    expect(m.c.modelo()).toBe("sonnet");
    m.c.cambiarModelo("opus");
    await microtareas();
    expect(m.c.modelo()).toBe("opus");
  });

  it("/model sin modelo explica cómo usarlo", () => {
    const m = montar();
    m.c.comando("/model");
    expect(m.sesion().modelos).toEqual([]);
    expect(m.c.vista().burbuja?.texto).toMatch(/\/model opus/);
  });

  it("si el cambio de modelo falla, lo dice", async () => {
    const m = montar();
    m.sesion().falloModelo = new Error("x");
    m.c.comando("/model gpt");
    await microtareas();
    expect(m.c.vista().burbuja).toEqual({ tipo: "aviso", texto: "No pude cambiar a gpt." });
  });

  it("/reiniciar cierra la sesión y abre otra que retoma la misma conversación", () => {
    const m = montar();
    m.sesion().emitir({ tipo: "iniciada", sessionId: "s-1" });
    const vieja = m.sesion();
    m.c.comando("/reiniciar");
    expect(vieja.cerrada).toBe(true);
    expect(m.sesiones).toHaveLength(2);
    expect(m.sesion().opciones.sessionId).toBe("s-1");
    expect(m.c.vista().burbuja?.texto).toMatch(/reinici/i);
  });

  it("/reiniciar no corta un trabajo en curso", () => {
    const m = montar();
    m.c.comando("revisa el deploy");
    m.c.comando("/reiniciar");
    expect(m.sesiones).toHaveLength(1);
    expect(m.sesion().cerrada).toBe(false);
  });

  it("/reiniciar con un permiso a la vista no hace nada: el permiso sigue pendiente", () => {
    const m = montar();
    m.c.comando("revisa el deploy");
    m.sesion().emitir({ tipo: "permiso", id: "t1", herramienta: "Bash", detalle: "ls" });
    m.c.comando("/reiniciar");
    expect(m.sesiones).toHaveLength(1);
    expect(m.sesion().permisos).toEqual([]);
    expect(m.c.vista().permiso?.id).toBe("t1");
  });

  it("la lista junta los comandos de la app y los de Claude Code", async () => {
    const m = montar();
    expect((await m.c.comandos()).map((c) => c.nombre)).toEqual([
      "model",
      "pokemon",
      "reiniciar",
      "movimientos",
      "pokedex",
      "medalla",
      "nombre",
      "llamar",
      "equipo",
      "combate",
      "guardar",
      "compact",
    ]);
  });
});

describe("Pokédex, shiny y medallas", () => {
  function conJuego() {
    const m = montar();
    const tareas: { orden: string; carpeta: string; inicio: number; fin: number }[] = [];
    const medallas: string[] = [];
    let shiny = 0;
    Object.assign(m.equipo, {
      registrarTarea: (t: (typeof tareas)[number]) => tareas.push(t),
      marcarShiny: () => {
        shiny += 1;
      },
      darMedalla: (_id: string, texto: string) => medallas.push(texto),
      pokedex: () => [
        { nombre: "Pikachu", especie: 25, shiny: false, tareas: 2, ms: 600_000, medallas, ultimas: [] },
      ],
    });
    return { m, tareas, medallas, shinys: () => shiny };
  }

  it("cada tarea terminada entra a la Pokédex con su orden y su duración", () => {
    const { m, tareas } = conJuego();
    m.c.orden("revisa el login", true);
    m.reloj.avanzar(90_000);
    m.sesion().emitir({ tipo: "respuesta", texto: "Listo.", contextoUsado: 10 });
    expect(tareas).toHaveLength(1);
    expect(tareas[0].orden).toBe("revisa el login");
    expect(tareas[0].fin - tareas[0].inicio).toBe(90_000);
  });

  it("pruebas en verde a la primera lo vuelven shiny; con un fallo en el turno, no", () => {
    const a = conJuego();
    a.m.c.orden("corre las pruebas", true);
    a.m.sesion().emitir({ tipo: "tests", resultado: "paso" });
    a.m.sesion().emitir({ tipo: "respuesta", texto: "Verde.", contextoUsado: 10 });
    expect(a.shinys()).toBe(1);
    expect(a.m.c.vista().shiny).toBe(true);

    const b = conJuego();
    b.m.c.orden("corre las pruebas", true);
    b.m.sesion().emitir({ tipo: "tests", resultado: "fallo" });
    b.m.sesion().emitir({ tipo: "tests", resultado: "paso" });
    b.m.sesion().emitir({ tipo: "respuesta", texto: "Verde al fin.", contextoUsado: 10 });
    expect(b.shinys()).toBe(0);
    expect(b.m.c.vista().shiny).toBe(false);
  });

  it("sin pruebas en el turno no hay shiny", () => {
    const { m, shinys } = conJuego();
    m.c.orden("explícame esto", true);
    m.sesion().emitir({ tipo: "respuesta", texto: "Es así.", contextoUsado: 10 });
    expect(shinys()).toBe(0);
  });

  it("/medalla con motivo la guarda y la cuenta; sin motivo solo explica", () => {
    const { m, medallas } = conJuego();
    m.c.comando("/medalla");
    expect(medallas).toEqual([]);
    m.c.comando("/medalla desplegué Acme a producción");
    expect(medallas).toEqual(["desplegué Acme a producción"]);
    expect(m.c.vista().medallas).toBe(1);
    expect(m.c.vista().burbuja?.texto).toContain("Medalla");
  });

  it("/pokedex muestra las fichas y no le manda nada a Claude", () => {
    const { m } = conJuego();
    const enviados = m.sesion().enviados.length;
    m.c.comando("/pokedex");
    expect(m.c.vista().burbuja?.texto).toContain("Pikachu · 2 tareas · 10 min");
    expect(m.sesion().enviados.length).toBe(enviados);
  });
});

describe("pausar la escucha", () => {
  it("'deja de escuchar' pausa el oído, avisa cómo volver y no se le manda a Claude", () => {
    const m = montar();
    m.c.comando("deja de escuchar");
    expect(m.guardado.pausas).toBe(1);
    expect(m.sesion().enviados).toEqual([]);
    expect(m.c.vista().burbuja?.texto).toMatch(/Control.*Opción.*Espacio/);
  });

  it("también por voz, como orden dirigida a él", () => {
    const m = montar();
    m.c.ejecutar({ tipo: "orden", id: "p1", texto: "no me escuches" });
    expect(m.guardado.pausas).toBe(1);
    m.reloj.avanzar(BORRADOR_MS * 4);
    expect(m.sesion().enviados).toEqual([]);
  });

  it("una orden que solo menciona escuchar sigue siendo una orden", () => {
    const m = montar();
    m.c.comando("revisa por qué el oído deja de escuchar a veces");
    expect(m.guardado.pausas).toBe(0);
    expect(m.sesion().enviados).toHaveLength(1);
  });

  it("la vista dice si el oído está en pausa", () => {
    const m = montar();
    expect(m.c.vista().oidoPausado).toBe(false);
    m.c.pausarOido(true);
    expect(m.c.vista().oidoPausado).toBe(true);
  });
});

describe("cambiar de especie", () => {
  it("/pokemon charmander pide el cambio y avisa", () => {
    const m = montar();
    m.c.comando("/pokemon charmander");
    expect(m.guardado.especies).toEqual(["Charmander"]);
    expect(m.c.vista().burbuja?.texto).toMatch(/Charmander/);
  });

  it("si no la conoce, dice cuáles hay y no cambia nada", () => {
    const m = montar();
    m.c.comando("/pokemon gengar");
    expect(m.guardado.especies).toEqual([]);
    expect(m.c.vista().burbuja?.texto).toMatch(/Pikachu.*Charmander|Charmander.*Pikachu/);
  });

  it("pedir la misma especie no hace nada más que decirlo", () => {
    const m = montar();
    m.c.comando("/pokemon pikachu");
    expect(m.guardado.especies).toEqual([]);
  });

  it("no cambia a medio trabajo ni con un permiso a la vista", () => {
    const m = montar();
    m.c.comando("revisa el deploy");
    m.c.comando("/pokemon charmander");
    m.sesion().emitir({ tipo: "permiso", id: "t1", herramienta: "Bash", detalle: "ls" });
    m.c.comando("/pokemon charmander");
    expect(m.guardado.especies).toEqual([]);
    expect(m.sesion().permisos).toEqual([]);
  });
});

describe("Controlador en un equipo", () => {
  it("avisar muestra la burbuja de aviso con el texto dado y publica la vista", () => {
    const m = montar();
    const antes = m.vistas.length;
    m.c.avisar("El equipo está lleno (6). Guarda uno antes.");
    expect(m.c.vista().burbuja).toEqual({
      tipo: "aviso",
      texto: "El equipo está lleno (6). Guarda uno antes.",
    });
    expect(m.vistas.length).toBe(antes + 1);
    expect(m.vistas.at(-1)?.burbuja).toEqual({
      tipo: "aviso",
      texto: "El equipo está lleno (6). Guarda uno antes.",
    });
  });

  it("dos controladores con un contador de borradores compartido nunca repiten id", () => {
    let n = 0;
    const siguiente = () => ++n;
    // `montar` ya llama `iniciar()`: cada controlador tiene su sesión y abre de verdad un borrador.
    const a = montar({ idBorrador: siguiente }).c;
    const b = montar({ idBorrador: siguiente }).c;
    const idA = a.abrirBorrador("p1", "revisa el deploy");
    const idB = b.abrirBorrador("p1", "revisa los tests");
    expect(idA).not.toBeNull();
    expect(idB).not.toBeNull();
    expect(idA).not.toBe(idB);
  });

  it("sin contador compartido, cada controlador cuenta sus borradores por su lado", () => {
    const m = montar();
    const uno = m.c.abrirBorrador("p1", "revisa el deploy");
    const dos = m.c.abrirBorrador("p1", "revisa los tests");
    expect(uno).not.toBeNull();
    expect(dos).not.toBe(uno);
  });

  it("contexto() devuelve el permiso y el borrador como listas de este Pokémon", () => {
    // Regresión: ya pasaba desde la Tarea 2.
    const m = montar();
    expect(m.c.contexto()).toMatchObject({ permisosDe: [], borradoresDe: [] });
  });

  it("ejecutar guardar lo guarda; para otro Pokémon no hace nada", () => {
    const m = montar();
    m.c.ejecutar({ tipo: "guardar", id: "p2" });
    expect(m.c.vista().estado).toBe("paseando");
    m.c.ejecutar({ tipo: "guardar", id: "p1" });
    expect(m.c.vista().estado).toBe("guardandose");
    m.reloj.avanzar(TIEMPOS.guardarMs);
    expect(m.guardado.guardados).toBe(1);
    expect(m.sesion().cerrada).toBe(true);
  });

  it("ejecutar guardar con un permiso a la vista lo niega, nunca lo aprueba", () => {
    const m = montar();
    m.c.orden("borra", true);
    m.sesion().emitir({ tipo: "permiso", id: "t1", herramienta: "Bash", detalle: "rm" });
    m.c.ejecutar({ tipo: "guardar", id: "p1" });
    expect(m.sesion().permisos).toEqual([["t1", false]]);
  });

  it("avisar con un permiso a la vista no pisa la burbuja del permiso", () => {
    const m = montar();
    m.c.orden("borra", true);
    m.sesion().emitir({ tipo: "permiso", id: "t1", herramienta: "Bash", detalle: "rm" });
    const antes = m.c.vista().burbuja;
    const publicadas = m.vistas.length;
    m.c.avisar("El equipo está lleno (6). Guarda uno antes.");
    expect(m.c.vista().burbuja).toEqual(antes);
    expect(m.vistas.length).toBe(publicadas);
  });

  it("cerrarSesion niega los permisos y cierra la sesión sin guardarlo ni avisar al equipo", () => {
    const m = montar();
    m.c.orden("borra", true);
    m.sesion().emitir({ tipo: "permiso", id: "t1", herramienta: "Bash", detalle: "rm" });
    m.c.cerrarSesion();
    expect(m.sesion().permisos).toEqual([["t1", false]]);
    expect(m.sesion().cerrada).toBe(true);
    expect(m.c.vista().estado).not.toBe("guardandose");
    expect(m.c.instancia("p1")).toBeNull();
    m.reloj.avanzar(TIEMPOS.guardarMs * 2);
    expect(m.guardado.guardados).toBe(0);
  });

  it("cerrarSesion descarta el borrador: nunca se envía", () => {
    const m = montar();
    m.c.abrirBorrador("p1", "revisa el deploy");
    m.c.cerrarSesion();
    m.reloj.avanzar(BORRADOR_MS + PRECISO_MAX_MS);
    expect(m.sesion().enviados).toEqual([]);
  });

  it("cerrarSesion durante el guardado cierra ya la sesión; el guardado sigue su curso", () => {
    const m = montar();
    m.c.guardar();
    m.c.cerrarSesion();
    expect(m.sesion().cerrada).toBe(true);
    m.reloj.avanzar(TIEMPOS.guardarMs);
    expect(m.guardado.guardados).toBe(1);
  });

  it("ejecutar llamar no hace nada en el controlador: lo resuelve el equipo", () => {
    const m = montar();
    const antes = m.c.vista();
    m.c.ejecutar({ tipo: "llamar", id: "p1", nombreEspecie: "charmander", encargo: "revisa el deploy" });
    expect(m.c.vista()).toEqual(antes);
    expect(m.sesion().enviados).toEqual([]);
  });
});

describe("movimientos en el controlador", () => {
  it("«usa <movimiento>» envía el comando del movimiento; /movimientos los lista sin enviar nada", () => {
    const m = montar({ movimientos: [{ nombre: "Lanzallamas", comando: "Prepara el despliegue." }] });
    m.c.comando("/movimientos");
    expect(m.c.vista().burbuja?.texto).toContain("Lanzallamas: Prepara el despliegue.");
    expect(m.sesion().enviados).toEqual([]);
    m.c.orden("usa lanzallamas", true);
    expect(m.sesion().enviados).toEqual(["Prepara el despliegue."]);
  });
});

describe("ventana de envío corta: lo que se espera tras el fin de la frase", () => {
  const abrir = (m: ReturnType<typeof montar>) => m.c.abrirBorrador("p1", "revisa el deploy") as number;

  it("el presupuesto fin de voz a envío queda fijado junto: VAD + paso rápido + ventana ≈ 1,5 s", () => {
    const pasoRapidoMs = 250;
    const total = SILENCIO_FIN_FRASE_S * 1000 + pasoRapidoMs + BORRADOR_MS;
    expect(SILENCIO_FIN_FRASE_S).toBe(0.5);
    expect(BORRADOR_MS).toBe(750);
    expect(total).toBeGreaterThanOrEqual(1300);
    expect(total).toBeLessThanOrEqual(1600);
  });

  it("la ventana es corta (< 1 s desde que el segmentador entrega el trozo)", () => {
    expect(BORRADOR_MS).toBeGreaterThanOrEqual(500);
    expect(BORRADOR_MS).toBeLessThanOrEqual(900);
  });

  it("una sola frase y silencio: sale justo al cerrarse la ventana, no antes", () => {
    const m = montar();
    abrir(m);
    m.reloj.avanzar(BORRADOR_MS - 1);
    expect(m.sesion().enviados).toEqual([]);
    m.reloj.avanzar(1);
    expect(m.sesion().enviados).toEqual(["revisa el deploy"]);
  });

  it("si vuelve a haber voz dentro de la ventana, no sale: espera a que calle y a la continuación", () => {
    const m = montar();
    const h = abrir(m);
    m.reloj.avanzar(BORRADOR_MS / 2);
    m.c.voz(true);
    m.reloj.avanzar(BORRADOR_MS * 3);
    expect(m.sesion().enviados).toEqual([]);
    m.c.voz(false);
    const asa = m.c.continuarBorrador("p1", "y corre los tests");
    expect(asa).toEqual({ borrador: h, parte: 1 });
    m.reloj.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual(["revisa el deploy y corre los tests"]);
  });

  it("un trozo todavía transcribiéndose al cerrarse la ventana cuenta como voz en curso", () => {
    const m = montar();
    abrir(m);
    m.c.transcribiendo(true);
    m.reloj.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual([]);
    expect(m.c.continuarBorrador("p1", "y corre los tests")).not.toBeNull();
    m.c.transcribiendo(false);
    expect(m.sesion().enviados).toEqual([]);
  });

  it("transcribiendo que termina sin traer frase (trozo vacío): sale al momento, sin esperar VOZ_SIN_TROZO_MS", () => {
    const m = montar();
    abrir(m);
    m.c.transcribiendo(true);
    m.reloj.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual([]);
    m.c.transcribiendo(false);
    expect(m.sesion().enviados).toEqual(["revisa el deploy"]);
  });

  it("transcribiendo que termina con voz todavía en curso sigue reteniendo", () => {
    const m = montar();
    abrir(m);
    m.c.voz(true);
    m.c.transcribiendo(true);
    m.reloj.avanzar(BORRADOR_MS);
    m.c.transcribiendo(false);
    expect(m.sesion().enviados).toEqual([]);
  });

  it("una voz que no calla no corta la orden, y el tope duro es RETENCION_MAX_MS", () => {
    const m = montar();
    abrir(m);
    m.c.voz(true);
    m.reloj.avanzar(BORRADOR_MS);
    m.reloj.avanzar(RETENCION_MAX_MS - 1);
    expect(m.sesion().enviados).toEqual([]);
    m.reloj.avanzar(1);
    expect(m.sesion().enviados).toEqual(["revisa el deploy"]);
  });

  it("si la voz vuelve después del envío, es una orden nueva: no se pega a la enviada", () => {
    const m = montar();
    abrir(m);
    m.reloj.avanzar(BORRADOR_MS);
    expect(m.sesion().enviados).toEqual(["revisa el deploy"]);
    m.c.voz(true);
    expect(m.c.continuarBorrador("p1", "y corre los tests")).toBeNull();
    expect(m.sesion().enviados).toEqual(["revisa el deploy"]);
  });
});

describe("Controlador: registro en vivo", () => {
  const flujo = (clave: string, texto: string, final = false) =>
    ({ tipo: "flujo", clave, clase: "texto", texto, final }) as const;

  it("junta lo que dice, piensa y hace, en orden y completo", () => {
    const m = montar();
    m.c.orden("revisa", true);
    m.sesion().emitir({
      tipo: "flujo",
      clave: "a:0",
      clase: "pensando",
      texto: "Debo mirar el archivo",
      final: true,
    });
    m.sesion().emitir({ tipo: "actividad", clase: "herramienta", herramienta: "Read", detalle: "/x/y/z.ts" });
    m.sesion().emitir(flujo("a:2", "Ya lo leí y sigo con la prueba"));
    const r = m.c.vista().registro;
    expect(r?.entradas.map((e) => [e.tipo, e.texto])).toEqual([
      ["pensando", "Debo mirar el archivo"],
      ["accion", "Leer el archivo z.ts"],
      ["texto", "Ya lo leí y sigo con la prueba"],
    ]);
  });

  it("el texto no se recorta como la nota corta: llega entero", () => {
    const m = montar();
    m.c.orden("revisa", true);
    const largo = "palabra ".repeat(100).trim();
    m.sesion().emitir(flujo("a:0", largo, true));
    expect(m.c.vista().registro?.entradas[0].texto).toBe(largo);
  });

  it("no deja la línea VOZ: en el registro", () => {
    const m = montar();
    m.c.orden("revisa", true);
    m.sesion().emitir(flujo("a:0", "Hecho.\nVOZ: terminé", true));
    expect(m.c.vista().registro?.entradas[0].texto).toBe("Hecho.");
    expect(m.dichos).not.toContain("terminé");
  });

  it("el texto que se va escribiendo se publica como mucho 10 veces por segundo", () => {
    const m = montar();
    m.c.orden("revisa", true);
    const antes = m.vistas.length;
    for (let i = 0; i < 100; i++) {
      m.sesion().emitir(flujo("a:0", "x".repeat(i + 1)));
      m.reloj.avanzar(10);
    }
    const publicadas = m.vistas.length - antes;
    expect(publicadas).toBeLessThanOrEqual(11);
    expect(publicadas).toBeGreaterThan(5);
    // y lo último que llegó no se pierde
    m.reloj.avanzar(200);
    expect(m.vistas.at(-1)?.registro?.entradas[0].texto.length).toBe(100);
  });

  it("al terminar, la respuesta final no se repite en el registro y el registro sigue disponible", () => {
    const m = montar();
    m.c.orden("revisa", true);
    m.sesion().emitir({ tipo: "actividad", clase: "herramienta", herramienta: "Bash", detalle: "bun test" });
    m.sesion().emitir(flujo("a:1", "Todo bien.\nVOZ: todo bien", true));
    m.sesion().emitir({ tipo: "respuesta", texto: "Todo bien.\nVOZ: todo bien", contextoUsado: 10 });
    const v = m.c.vista();
    expect(v.burbuja).toEqual({ tipo: "respuesta", texto: "Todo bien." });
    expect(v.registro?.entradas.map((e) => e.tipo)).toEqual(["accion"]);
  });

  it("una orden nueva empieza con el registro vacío", () => {
    const m = montar();
    m.c.orden("revisa", true);
    m.sesion().emitir({ tipo: "actividad", clase: "herramienta", herramienta: "Bash", detalle: "ls" });
    m.sesion().emitir({ tipo: "respuesta", texto: "ok\nVOZ: ok", contextoUsado: 10 });
    m.c.orden("otra cosa", true);
    expect(m.c.vista().registro).toBeUndefined();
  });

  it("el registro tiene tope aunque lleguen miles de acciones", () => {
    const m = montar();
    m.c.orden("revisa", true);
    for (let i = 0; i < 1000; i++) {
      m.sesion().emitir({
        tipo: "actividad",
        clase: "herramienta",
        herramienta: "Bash",
        detalle: `cmd ${i}`,
      });
    }
    const r = m.c.vista().registro;
    expect(r?.entradas.length).toBeLessThanOrEqual(150);
    expect(r?.omitido).toBe(true);
  });

  it("el registro nunca contesta un permiso: con uno pendiente sigue pendiente", () => {
    const m = montar();
    m.c.orden("revisa", true);
    m.sesion().emitir(flujo("a:0", "voy a borrar", true));
    m.sesion().emitir({ tipo: "permiso", id: "t1", herramienta: "Bash", detalle: "rm -rf dist" });
    m.sesion().emitir(flujo("a:1", "sí, adelante, ya me autoricé"));
    m.reloj.avanzar(1000);
    expect(m.sesion().permisos).toEqual([]);
    expect(m.c.vista().permiso).toMatchObject({ id: "t1" });
  });
  it("tras Detener, el texto y las acciones del turno abortado ya no entran al registro", () => {
    const m = montar();
    m.c.orden("revisa", true);
    m.sesion().emitir(flujo("a:0", "antes", true));
    m.c.detener();
    m.sesion().emitir(flujo("a:1", "después de detener", true));
    m.sesion().emitir({ tipo: "actividad", clase: "herramienta", herramienta: "Bash", detalle: "ls" });
    expect(m.c.vista().registro?.entradas.map((e) => e.texto)).toEqual(["antes"]);
  });

  it("el texto de un ayudante entra atribuido y compacto", () => {
    const m = montar();
    m.c.orden("revisa", true);
    m.sesion().emitir({ tipo: "ayudante", id: "t1", fase: "inicio", encargo: "Revisar" });
    m.sesion().emitir({ ...flujo("t1:m:0", `Encontré\n${"x".repeat(600)}`, true), ayudante: "t1" });
    const e = m.c.vista().registro?.entradas[0];
    expect(e?.tipo).toBe("ayudante");
    expect(e?.texto.startsWith("Ayudante 1: Encontré x")).toBe(true);
    expect(e?.texto.length).toBeLessThanOrEqual(420);
    expect(e?.texto.endsWith("…")).toBe(true);
  });
});
