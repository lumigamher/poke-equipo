import type { Pokemon, VistaPokemon } from "@compartido/tipos";
import { describe, expect, it } from "vitest";
import type { Decision } from "../entrenador/entrenador";
import { RESULTADO_MS } from "./combate";
import {
  type DependenciasEquipo,
  type EnlaceEquipo,
  EquipoActivo,
  ESCALONADO_MS,
  TOPE_EQUIPO,
} from "./equipo-activo";
import type { ConfigVoces } from "./voces";

const CFG: ConfigVoces = {
  conjunto: ["A", "B", "C", "D", "E"],
  especies: {
    "4": { voz: "A", velocidad: 1 },
    "7": { voz: "B", velocidad: 1 },
    "25": { voz: "C", velocidad: 1.1 },
  },
};

const ESPECIES = [
  { especie: 4, nombre: "Charmander" },
  { especie: 7, nombre: "Squirtle" },
  { especie: 25, nombre: "Pikachu" },
  { especie: 5, nombre: "Charmeleon" },
];

/** Controlador de prueba: registra lo que recibe, no abre sesiones y se guarda solo cuando la prueba lo dice. */
function falso(p: Pokemon, enlace: EnlaceEquipo) {
  const log: string[] = [];
  const estado = {
    guardando: false,
    cerrado: false,
    escuchando: false,
    permiso: null as string | null,
    borrador: null as number | null,
    alta: false,
    alias: [] as string[],
    /** Lo que muestra su vista (para la regla de la burbuja abierta). */
    estadoVista: "paseando" as VistaPokemon["estado"],
    desde: 0,
    burbuja: null as VistaPokemon["burbuja"],
    ultimaRespuesta: null as string | null,
  };
  const ficha = {};
  const vivo = () => !estado.guardando && !estado.cerrado;
  return {
    log,
    estado,
    enlace,
    pokemon: p,
    iniciar: () => log.push("iniciar"),
    avisar: (t: string) => log.push(`aviso:${t}`),
    recordar: (t: string | null) => {
      if (t !== null) log.push(`recordar:${t}`);
    },
    guardar: () => {
      log.push("guardar");
      if (estado.permiso) log.push(`permiso:${estado.permiso}:false`);
      estado.permiso = null;
      estado.guardando = true;
    },
    cerrarSesion: () => {
      log.push("cerrarSesion");
      estado.cerrado = true;
    },
    ejecutar: (d: Decision) => {
      log.push(`ejecutar:${d.tipo}:${"texto" in d ? d.texto : ""}`);
      if (d.tipo === "atencion") estado.escuchando = true;
    },
    contexto: () => ({
      candidatos: [{ id: p.id, nombre: p.nombre, apodos: [], alias: estado.alias }],
      permisosDe: estado.permiso ? [{ id: p.id, permisoId: estado.permiso }] : [],
      borradoresDe: estado.borrador !== null ? [p.id] : [],
      escuchandoA: estado.escuchando ? p.id : null,
      altaDe: estado.alta ? p.id : null,
    }),
    vista: () =>
      ({
        id: p.id,
        nombre: p.nombre,
        borrador: estado.borrador,
        estado: estado.guardando ? "guardandose" : estado.estadoVista,
        desde: estado.desde,
        burbuja: estado.burbuja,
        alta: estado.alta,
        ultimaRespuesta: estado.ultimaRespuesta,
        permiso: estado.permiso ? { id: estado.permiso, herramienta: "Bash", detalle: "ls" } : null,
      }) as VistaPokemon,
    instancia: (id: string) => (vivo() && id === p.id ? ficha : null),
    responderPermisoDe: (permitir: boolean, pokemonId: string, permisoId: string) => {
      log.push(`responderPermisoDe:${permitir}:${pokemonId}:${permisoId}`);
    },
    abrirBorrador: (id: string, texto: string) => {
      log.push(`abrirBorrador:${texto}`);
      if (id !== p.id) return null;
      estado.borrador = 100 + Number(p.especie);
      return estado.borrador;
    },
    continuarBorrador: (id: string, texto: string) => {
      log.push(`continuarBorrador:${texto}`);
      return id === p.id && estado.borrador !== null ? { borrador: estado.borrador, parte: 1 } : null;
    },
    voz: (hablando: boolean) => log.push(`voz:${hablando}`),
    transcribiendo: (activo: boolean) => log.push(`transcribiendo:${activo}`),
    tic: () => log.push("tic"),
    ponerMicrofono: (disponible: boolean) => log.push(`microfono:${disponible}`),
    pausarOido: (pausado: boolean) => log.push(`pausado:${pausado}`),
    cancelar: () => {
      log.push("cancelar");
      estado.borrador = null;
    },
    comando: (texto: string) => log.push(`comando:${texto}`),
    cambiarModelo: (modelo: string) => log.push(`cambiarModelo:${modelo}`),
    modelo: () => null as string | null,
    reintentar: () => log.push("reintentar"),
    iniciarAlta: (frases?: number) => {
      log.push(`iniciarAlta:${frases ?? "menu"}`);
      estado.alta = true;
    },
    saltarAlta: () => {
      log.push("saltarAlta");
      estado.alta = false;
    },
    curar: () => log.push("curar"),
    comandos: async () => [{ nombre: `de-${p.id}`, descripcion: "", argumento: "" }],
  };
}

type Falso = ReturnType<typeof falso>;
type Fila = { id: string; nombre: string; especie: number; carpeta: string };

function montar(
  activos: Fila[] = [],
  opciones: {
    programarDiferido?: boolean;
    /** Las especies "bajadas"; por omisión ESPECIES. La prueba puede añadir una al terminar una descarga. */
    especies?: { especie: number; nombre: string }[];
    alFaltarEspecie?: DependenciasEquipo["alFaltarEspecie"];
  } = {},
) {
  const bd = new Map<string, Pokemon>();
  for (const a of activos)
    bd.set(a.id, {
      ...a,
      voz: "A",
      velocidad: 1,
      sessionId: null,
      apodos: [],
      tareas: 0,
      activo: true,
    });
  const llamadasEquipo: string[] = [];
  const equipo = {
    todos: () => [...bd.values()],
    activos: () => [...bd.values()].filter((p) => p.activo),
    contarActivos: () => [...bd.values()].filter((p) => p.activo).length,
    buscarPorEspecie: (e: number) => [...bd.values()].find((p) => p.especie === e) ?? null,
    activar: (id: string) => {
      const p = bd.get(id);
      if (p) p.activo = true;
    },
    desactivar: (id: string) => {
      const p = bd.get(id);
      if (p) p.activo = false;
    },
    crear: (d: { nombre: string; especie: number; voz: string; velocidad: number; carpeta: string }) => {
      const p: Pokemon = {
        id: `id-${bd.size + 1}`,
        ...d,
        sessionId: null,
        apodos: [],
        tareas: 0,
        activo: true,
      };
      bd.set(p.id, p);
      return p;
    },
    obtener: (id: string) => {
      const p = bd.get(id);
      return p ? { ...p } : null;
    },
    cambiarEspecie: (
      id: string,
      especie: number,
      nombre: string,
      voz: string,
      velocidad: number,
      conservarApodos?: boolean,
    ) => {
      llamadasEquipo.push(
        `cambiarEspecie:${id}:${especie}:${nombre}:${voz}:${velocidad}${conservarApodos ? ":conserva" : ""}`,
      );
      const p = bd.get(id);
      if (p)
        Object.assign(p, { especie, nombre, voz, velocidad, ...(conservarApodos ? {} : { apodos: [] }) });
    },
    renombrar: (id: string, nombre: string) => {
      llamadasEquipo.push(`renombrar:${id}:${nombre}`);
      const p = bd.get(id);
      if (p) Object.assign(p, { nombre, apodos: [] });
    },
    cambiarCarpeta: (id: string, carpeta: string) => {
      llamadasEquipo.push(`cambiarCarpeta:${id}:${carpeta}`);
      const p = bd.get(id);
      if (p) Object.assign(p, { carpeta, sessionId: null });
    },
  };
  /** Cada controlador creado, en orden; `vivos` guarda el último de cada id. */
  const todos: Falso[] = [];
  const vivos = new Map<string, Falso>();
  const tareas: { ms: number; fn: () => void; viva: boolean }[] = [];
  const publicadas: VistaPokemon[][] = [];
  const deps: DependenciasEquipo = {
    equipo,
    crearControlador: (p, enlace) => {
      const c = falso(p, enlace);
      todos.push(c);
      vivos.set(p.id, c);
      return c as never;
    },
    especiesDisponibles: () => opciones.especies ?? ESPECIES,
    alFaltarEspecie: opciones.alFaltarEspecie,
    voces: CFG,
    programar: (fn, ms) => {
      const t = { ms, fn, viva: true };
      if (!opciones.programarDiferido) {
        fn();
        return () => {};
      }
      tareas.push(t);
      return () => {
        t.viva = false;
      };
    },
    alCambiarEquipo: (v) => publicadas.push(v),
  };
  /** Corre las tareas diferidas hasta `ms`. */
  const correr = (ms: number) => {
    for (const t of tareas)
      if (t.viva && t.ms <= ms) {
        t.viva = false;
        t.fn();
      }
  };
  /** El controlador de `id` termina su animación de guardado. */
  const terminarGuardado = (id: string) => vivos.get(id)?.enlace.alGuardado();
  return {
    equipo: new EquipoActivo(deps),
    /** La base de prueba, para dejar un Pokémon guardado antes de arrancar. */
    equipoBase: equipo,
    c: (id: string) => vivos.get(id) as Falso,
    todos,
    bd,
    llamadasEquipo,
    publicadas,
    tareas,
    correr,
    terminarGuardado,
  };
}

const PIKA: Fila = { id: "p", nombre: "Pikachu", especie: 25, carpeta: "/acme" };
const CHAR: Fila = { id: "c", nombre: "Charmander", especie: 4, carpeta: "/p" };

describe("EquipoActivo: arrancar", () => {
  it("saca los activos escalonados, uno por uno, y no saca los guardados", () => {
    const m = montar([PIKA, CHAR, { id: "s", nombre: "Squirtle", especie: 7, carpeta: "/p" }], {
      programarDiferido: true,
    });
    m.equipoBase.desactivar("s");
    m.equipo.arrancar();
    expect(m.tareas.map((t) => t.ms)).toEqual([0, ESCALONADO_MS]);
    m.correr(0);
    expect(m.equipo.vistas().map((v) => v.id)).toEqual(["p"]);
    m.correr(ESCALONADO_MS);
    expect(m.equipo.vistas().map((v) => v.id)).toEqual(["p", "c"]);
    expect(m.c("p").log).toContain("iniciar");
  });

  it("es idempotente: una segunda llamada no saca a nadie otra vez", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.arrancar();
    expect(m.todos).toHaveLength(2);
  });
});

describe("EquipoActivo: llamar", () => {
  it("saca una especie nueva en la carpeta del que llama, con voz libre, y le pasa el encargo", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    const r = m.equipo.llamar("p", "charmander", "que revise los tests");
    expect(r.tipo).toBe("ok");
    const id = (r as { id: string }).id;
    expect(m.bd.get(id)).toMatchObject({ especie: 4, nombre: "Charmander", carpeta: "/acme" });
    // Pikachu usa "A" (la base de Charmander): Charmander toma la primera libre.
    expect(m.bd.get(id)?.voz).toBe("B");
    expect(m.c(id).log).toEqual(["iniciar", "ejecutar:orden:que revise los tests"]);
    expect(m.equipo.vistas().map((v) => v.id)).toEqual(["p", id]);
  });

  it("sin encargo no manda ninguna orden", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    const r = m.equipo.llamar("p", "squirtle", "");
    expect(m.c((r as { id: string }).id).log).toEqual(["iniciar"]);
  });

  it("con seis en pantalla rechaza la llamada y avisa al que llamó", () => {
    const activos = Array.from({ length: TOPE_EQUIPO }, (_, i) => ({
      id: `x${i}`,
      nombre: `N${i}`,
      especie: 1000 + i,
      carpeta: "/p",
    }));
    const m = montar(activos);
    m.equipo.arrancar();
    expect(m.equipo.llamar("x0", "squirtle", "")).toEqual({ tipo: "lleno" });
    expect(m.c("x0").log).toContain("aviso:El equipo está lleno (6). Guarda uno antes.");
    expect(m.bd.size).toBe(TOPE_EQUIPO);
  });

  it("cuenta también los activos que aún no salieron (arranque escalonado en curso)", () => {
    const activos = Array.from({ length: TOPE_EQUIPO }, (_, i) => ({
      id: `x${i}`,
      nombre: `N${i}`,
      especie: 1000 + i,
      carpeta: "/p",
    }));
    const m = montar(activos, { programarDiferido: true });
    m.equipo.arrancar();
    m.correr(0);
    expect(m.equipo.vistas()).toHaveLength(1);
    expect(m.equipo.llamar("x0", "squirtle", "").tipo).toBe("lleno");
  });

  it("una especie que ya está en pantalla no se duplica y se avisa al que llamó", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    expect(m.equipo.llamar("p", "charmander", "")).toEqual({ tipo: "ya_en_pantalla", id: "c" });
    expect(m.c("p").log).toContain("aviso:Charmander ya está en pantalla.");
    expect(m.todos).toHaveLength(2);
  });

  it("una especie que no está bajada se rechaza por la especie, sin tocar el equipo", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    expect(m.equipo.llamar("p", "mewtwo", "")).toEqual({ tipo: "especie_desconocida", nombre: "mewtwo" });
    expect(m.c("p").log).toContain("aviso:No tengo a mewtwo bajado.");
    expect(m.bd.size).toBe(1);
  });

  describe("especie que aún no se ha bajado", () => {
    const sinMewtwo = () => ({ especies: [...ESPECIES] });

    it("se pide la descarga, se avisa en la burbuja y al llegar la llamada sigue sola con su encargo", async () => {
      const o = sinMewtwo();
      let terminar!: (ok: boolean) => void;
      const lista = new Promise<boolean>((r) => {
        terminar = r;
      });
      const pedidas: string[] = [];
      const m = montar([PIKA], {
        ...o,
        alFaltarEspecie: (nombre) => {
          pedidas.push(nombre);
          return nombre === "mewtwo" ? { nombre: "Mewtwo", lista } : null;
        },
      });
      m.equipo.arrancar();
      expect(m.equipo.llamar("p", "mewtwo", "revisa")).toEqual({
        tipo: "especie_desconocida",
        nombre: "mewtwo",
      });
      expect(m.c("p").log).toContain("aviso:Bajando a Mewtwo; saldrá en cuanto termine.");
      expect(m.bd.size).toBe(1);

      o.especies.push({ especie: 150, nombre: "Mewtwo" });
      terminar(true);
      await lista;
      await Promise.resolve();
      expect(m.bd.size).toBe(2);
      // Una sola petición: al reintentar no vuelve a pedir.
      expect(pedidas).toEqual(["mewtwo"]);
    });

    it("si la descarga falla avisa sin crear a nadie", async () => {
      const m = montar([PIKA], {
        ...sinMewtwo(),
        alFaltarEspecie: () => ({ nombre: "Mewtwo", lista: Promise.resolve(false) }),
      });
      m.equipo.arrancar();
      m.equipo.llamar("p", "mewtwo", "");
      await Promise.resolve();
      await Promise.resolve();
      expect(m.c("p").log).toContain("aviso:No pude bajar a Mewtwo. Revisa tu conexión y vuelve a pedirlo.");
      expect(m.bd.size).toBe(1);
    });

    it("sin el hook (o con nombre que no es del catálogo) sigue el rechazo de siempre", () => {
      const m = montar([PIKA], { ...sinMewtwo(), alFaltarEspecie: () => null });
      m.equipo.arrancar();
      expect(m.equipo.llamar("p", "mewtwo", "").tipo).toBe("especie_desconocida");
      expect(m.c("p").log).toContain("aviso:No tengo a mewtwo bajado.");
    });
  });

  it("si el que llama no está en pantalla no pasa nada", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    expect(m.equipo.llamar("nadie", "charmander", "")).toEqual({ tipo: "no_existe", id: "nadie" });
    expect(m.bd.size).toBe(1);
  });

  it("una especie guardada se saca retomando su conversación (no crea otra) y recibe el encargo", () => {
    const m = montar([PIKA, CHAR]);
    m.equipoBase.desactivar("c");
    m.equipo.arrancar();
    expect(m.equipo.llamar("p", "charmander", "revisa")).toEqual({ tipo: "ok", id: "c" });
    expect(m.bd.size).toBe(2);
    expect(m.bd.get("c")?.activo).toBe(true);
    expect(m.bd.get("c")?.carpeta).toBe("/p");
    expect(m.c("c").log).toEqual(["iniciar", "ejecutar:orden:revisa"]);
  });

  it("los avisos solo van a instancias vivas: el que se está guardando no llama", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    m.equipo.guardar("p");
    expect(m.equipo.llamar("p", "mewtwo", "")).toEqual({ tipo: "no_existe", id: "p" });
    expect(m.c("p").log.some((l) => l.startsWith("aviso:"))).toBe(false);
  });
});

describe("EquipoActivo: guardar", () => {
  it("guardar pide al controlador que se guarde; al terminar sale del mapa y queda inactivo en la base", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.guardar("c");
    expect(m.c("c").log).toContain("guardar");
    // Mientras se guarda sigue en el mapa (se ve la animación), pero ya no es una instancia para la voz.
    expect(m.equipo.vistas().map((v) => v.id)).toEqual(["p", "c"]);
    expect(m.equipo.instancia("c")).toBeNull();
    m.terminarGuardado("c");
    expect(m.equipo.vistas().map((v) => v.id)).toEqual(["p"]);
    expect(m.bd.get("c")?.activo).toBe(false);
    expect(m.publicadas.at(-1)?.map((v) => v.id)).toEqual(["p"]);
  });

  it("guardar un id que no está en pantalla no hace nada", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    m.equipo.guardar("nadie");
    expect(m.c("p").log).toEqual(["iniciar"]);
  });

  it("tras guardar, llamar a la misma especie la saca otra vez como instancia nueva", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    const antes = m.equipo.instancia("c");
    m.equipo.guardar("c");
    m.terminarGuardado("c");
    expect(m.equipo.llamar("p", "charmander", "")).toEqual({ tipo: "ok", id: "c" });
    expect(m.equipo.instancia("c")).not.toBeNull();
    expect(m.equipo.instancia("c")).not.toBe(antes);
  });

  it("ejecutar(guardar) con un permiso a la vista lo niega, nunca lo aprueba", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    m.c("p").estado.permiso = "t1";
    m.equipo.ejecutar({ tipo: "guardar", id: "p" });
    expect(m.c("p").log).toContain("permiso:t1:false");
    expect(m.c("p").log.some((l) => l.startsWith("responderPermisoDe:true"))).toBe(false);
  });

  it("el comando /guardar guarda al Pokémon de la burbuja donde se escribió", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.comando("c", "/guardar");
    expect(m.c("c").log).toContain("guardar");
    expect(m.c("p").log).not.toContain("guardar");
    expect(m.c("c").log.some((l) => l.startsWith("comando:"))).toBe(false);
  });
});

describe("EquipoActivo: se hablan y equipos por proyecto", () => {
  it("llamar con encargo a uno que ya está en pantalla le pasa el encargo y lo dice", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.llamar("p", "charmander", "revisa el login");
    expect(m.c("c").log).toContain("ejecutar:orden:revisa el login");
    expect(m.c("p").log).toContain("aviso:Le pasé a Charmander: revisa el login");
  });

  it("cuando el otro termina, el que pasó el encargo avisa", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.llamar("p", "charmander", "revisa el login");
    m.equipo.publicar();
    expect(m.c("p").log.filter((l) => l.includes("terminó"))).toEqual([]);
    Object.assign(m.c("c").estado, { estadoVista: "trabajando" });
    m.equipo.publicar();
    Object.assign(m.c("c").estado, { estadoVista: "termino" });
    m.equipo.publicar();
    expect(m.c("p").log).toContain("aviso:Charmander terminó lo que le pasé.");
    m.equipo.publicar();
    expect(m.c("p").log.filter((l) => l.includes("terminó"))).toHaveLength(1);
  });

  it("/equipo saca a los guardados de ese proyecto y dice quién salió", () => {
    const m = montar([PIKA, CHAR]);
    const char = m.bd.get("c");
    if (char) Object.assign(char, { activo: false, carpeta: "/Users/ana/Documents/Acme-Motors" });
    m.equipo.arrancar();
    expect(m.equipo.sacarEquipo("acme")).toBe("Salieron: Charmander. Ya estaban: Pikachu.");
    expect(m.equipo.vistas().map((v) => v.id)).toEqual(["p", "c"]);
    expect(m.equipo.sacarEquipo("otro")).toContain("Ningún Pokémon");
    expect(m.equipo.sacarEquipo("  ")).toContain("Dime de qué proyecto");
  });
});

describe("EquipoActivo: combate de revisión", () => {
  function listos() {
    const m = montar([PIKA, CHAR], { programarDiferido: true });
    m.equipo.arrancar();
    m.correr(10_000);
    m.c("c").estado.ultimaRespuesta = "Arreglé el login.";
    return m;
  }
  const combateDe = (m: ReturnType<typeof montar>, id: string) =>
    m.equipo.vistas().find((v) => v.id === id)?.combate;

  it("/combate manda al retador a revisar el trabajo del rival y marca a los dos", () => {
    const m = listos();
    m.equipo.comando("p", "/combate charmander");
    const orden = m.c("p").log.find((l) => l.startsWith("ejecutar:orden:"));
    expect(orden).toContain("contra Charmander");
    expect(orden).toContain("«Arreglé el login.»");
    expect(combateDe(m, "p")).toEqual({ rivalId: "c", papel: "retador" });
    expect(combateDe(m, "c")).toEqual({ rivalId: "p", papel: "defensor" });
  });

  it("rechazado: gana el retador; el final se ve unos segundos y luego se borra", () => {
    const m = listos();
    m.equipo.comando("p", "/combate charmander");
    Object.assign(m.c("p").estado, { estadoVista: "trabajando" });
    m.equipo.publicar();
    expect(combateDe(m, "p")?.resultado).toBeUndefined();
    Object.assign(m.c("p").estado, {
      estadoVista: "termino",
      ultimaRespuesta: "Hay un bug.\nVEREDICTO: RECHAZADO",
    });
    m.equipo.publicar();
    expect(combateDe(m, "p")?.resultado).toBe("gana");
    expect(combateDe(m, "c")?.resultado).toBe("pierde");
    m.correr(RESULTADO_MS);
    expect(combateDe(m, "p")).toBeUndefined();
    expect(combateDe(m, "c")).toBeUndefined();
  });

  it("aprobado: gana el defensor, su trabajo aguantó", () => {
    const m = listos();
    m.equipo.comando("p", "/combate");
    Object.assign(m.c("p").estado, { estadoVista: "trabajando" });
    m.equipo.publicar();
    Object.assign(m.c("p").estado, { estadoVista: "termino", ultimaRespuesta: "VEREDICTO: APROBADO" });
    m.equipo.publicar();
    expect(combateDe(m, "c")?.resultado).toBe("gana");
    expect(combateDe(m, "p")?.resultado).toBe("pierde");
  });

  it("sin veredicto o con error no gana nadie", () => {
    const m = listos();
    m.equipo.comando("p", "/combate charmander");
    Object.assign(m.c("p").estado, { estadoVista: "trabajando" });
    m.equipo.publicar();
    Object.assign(m.c("p").estado, { estadoVista: "error", ultimaRespuesta: "VEREDICTO: RECHAZADO" });
    m.equipo.publicar();
    expect(combateDe(m, "p")).toEqual({ rivalId: "c", papel: "retador" });
  });

  it("no empieza sin rival, sin trabajo que revisar o con el retador ocupado", () => {
    const m = listos();
    m.equipo.comando("p", "/combate squirtle");
    m.c("c").estado.ultimaRespuesta = null;
    m.equipo.comando("p", "/combate charmander");
    m.c("c").estado.ultimaRespuesta = "algo";
    Object.assign(m.c("p").estado, { estadoVista: "trabajando" });
    m.equipo.comando("p", "/combate charmander");
    expect(m.c("p").log.filter((l) => l.startsWith("ejecutar:orden:"))).toEqual([]);
    expect(m.c("p").log.filter((l) => l.startsWith("aviso:"))).toHaveLength(3);
    expect(combateDe(m, "p")).toBeUndefined();
  });

  it("si el rival se guarda a mitad del combate, se acaba sin ganador", () => {
    const m = listos();
    m.equipo.comando("p", "/combate charmander");
    m.equipo.guardar("c");
    m.equipo.publicar();
    expect(combateDe(m, "p")).toBeUndefined();
  });
});

describe("EquipoActivo: evolución", () => {
  const conTareas = (m: ReturnType<typeof montar>, id: string, tareas: number) => {
    const p = m.bd.get(id);
    if (p) p.tareas = tareas;
  };

  it("al llegar a sus tareas, el que anda libre vuelve a la pokébola y sale evolucionado, y lo anuncia", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    conTareas(m, "c", 14);
    m.equipo.tic();
    expect(m.llamadasEquipo).toEqual([]);
    conTareas(m, "c", 15);
    const viejo = m.c("c");
    viejo.estado.ultimaRespuesta = "Arreglé el login.";
    m.equipo.tic();
    expect(viejo.log).toContain("guardar");
    expect(m.llamadasEquipo).toEqual([expect.stringMatching(/^cambiarEspecie:c:5:Charmeleon:/)]);
    m.terminarGuardado("c");
    // Su último trabajo sale con él: un combate todavía tiene qué revisar.
    expect(m.c("c").log).toContain("recordar:Arreglé el login.");
    expect(m.c("c").pokemon).toMatchObject({ especie: 5, nombre: "Charmeleon", activo: true });
    expect(m.c("c").log).toContain("aviso:¡Charmander evolucionó a Charmeleon!");
    // Ya evolucionado, otro tic no hace nada más.
    m.equipo.tic();
    expect(m.llamadasEquipo).toHaveLength(1);
  });

  it("no interrumpe: trabajando o pidiendo permiso no evoluciona", () => {
    const m = montar([CHAR]);
    m.equipo.arrancar();
    conTareas(m, "c", 99);
    for (const estadoVista of ["trabajando", "pidiendo_permiso", "termino", "escuchando"] as const) {
      Object.assign(m.c("c").estado, { estadoVista });
      m.equipo.tic();
    }
    expect(m.llamadasEquipo).toEqual([]);
  });

  it("si ya existe uno de la especie nueva, se queda como está", () => {
    const m = montar([CHAR, { id: "x", nombre: "Charmeleon", especie: 5, carpeta: "/p" }]);
    m.equipo.arrancar();
    conTareas(m, "c", 99);
    m.equipo.tic();
    expect(m.llamadasEquipo).toEqual([]);
  });
});

describe("EquipoActivo: cambiar de especie o de carpeta", () => {
  it("cambiarEspecie guarda, cambia la especie con una voz libre y lo vuelve a sacar con el mismo id", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    const viejo = m.c("p");
    m.equipo.cambiarEspecie("p", { especie: 7, nombre: "Squirtle" });
    expect(viejo.log).toContain("guardar");
    // Charmander usa "A"; la base de Squirtle es "B", libre (la de Pikachu, que se va, no cuenta).
    expect(m.llamadasEquipo).toEqual(["cambiarEspecie:p:7:Squirtle:B:1"]);
    expect(m.equipo.instancia("p")).toBeNull();
    m.terminarGuardado("p");
    const nuevo = m.c("p");
    expect(nuevo).not.toBe(viejo);
    expect(nuevo.pokemon).toMatchObject({ especie: 7, nombre: "Squirtle", activo: true });
    expect(nuevo.log).toEqual(["iniciar"]);
    expect(m.equipo.vistas().map((v) => v.id)).toEqual(["c", "p"]);
    expect(m.bd.get("p")?.activo).toBe(true);
  });

  it("cambiarEspecie a una especie que ya está en pantalla avisa y no hace nada", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.cambiarEspecie("p", { especie: 4, nombre: "Charmander" });
    expect(m.c("p").log).toContain("aviso:Charmander ya está en pantalla.");
    expect(m.c("p").log).not.toContain("guardar");
    expect(m.llamadasEquipo).toEqual([]);
  });

  it("cambiarCarpeta guarda, cambia la carpeta y lo vuelve a sacar en la nueva", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    const viejo = m.c("p");
    m.equipo.cambiarCarpeta("p", "/otra");
    expect(viejo.log).toContain("guardar");
    expect(m.llamadasEquipo).toEqual(["cambiarCarpeta:p:/otra"]);
    m.terminarGuardado("p");
    expect(m.c("p")).not.toBe(viejo);
    expect(m.c("p").pokemon.carpeta).toBe("/otra");
    expect(m.equipo.vistas().map((v) => v.id)).toEqual(["p"]);
  });

  it("llamar a la especie vieja mientras cambia de especie no deja una fila fantasma ni devuelve ok", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    // Pikachu se está guardando para salir como Squirtle: la base ya dice Squirtle, pero Pikachu sigue en el mapa.
    m.equipo.cambiarEspecie("p", { especie: 7, nombre: "Squirtle" });
    const filasAntes = m.bd.size;
    const r = m.equipo.llamar("c", "pikachu", "revisa el login");
    expect(r).toEqual({ tipo: "guardandose", id: "p" });
    expect(m.bd.size).toBe(filasAntes);
    expect([...m.bd.values()].filter((p) => p.activo && p.especie === 25)).toEqual([]);
    expect(m.c("c").log).toContain("aviso:Pikachu se está guardando.");
    // Al terminar, sale Squirtle con el mismo id y no hay ningún Pikachu de más.
    m.terminarGuardado("p");
    expect(m.equipo.vistas().map((v) => v.id)).toEqual(["c", "p"]);
    expect(m.c("p").pokemon.especie).toBe(7);
  });

  it("cambiar uno que ya se está guardando no hace nada", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    m.equipo.guardar("p");
    m.equipo.cambiarCarpeta("p", "/otra");
    m.equipo.cambiarEspecie("p", { especie: 7, nombre: "Squirtle" });
    expect(m.llamadasEquipo).toEqual([]);
    m.terminarGuardado("p");
    expect(m.equipo.vistas()).toEqual([]);
  });
});

describe("EquipoActivo: sacarGuardado", () => {
  it("saca un guardado retomando su conversación", () => {
    const m = montar([PIKA, CHAR]);
    m.equipoBase.desactivar("c");
    m.equipo.arrancar();
    expect(m.equipo.sacarGuardado("c")).toEqual({ tipo: "ok", id: "c" });
    expect(m.equipo.vistas().map((v) => v.id)).toEqual(["p", "c"]);
    expect(m.bd.get("c")?.activo).toBe(true);
  });

  it("respeta el tope, el ya en pantalla y los ids que no existen", () => {
    const activos = Array.from({ length: TOPE_EQUIPO }, (_, i) => ({
      id: `x${i}`,
      nombre: `N${i}`,
      especie: 1000 + i,
      carpeta: "/p",
    }));
    const m = montar([...activos, CHAR]);
    m.equipoBase.desactivar("c");
    m.equipo.arrancar();
    expect(m.equipo.sacarGuardado("c")).toEqual({ tipo: "lleno" });
    expect(m.bd.get("c")?.activo).toBe(false);
    expect(m.equipo.sacarGuardado("x1")).toEqual({ tipo: "ya_en_pantalla", id: "x1" });
    expect(m.equipo.sacarGuardado("nadie")).toEqual({ tipo: "no_existe", id: "nadie" });
  });
});

describe("EquipoActivo: enrutado por id", () => {
  it("contexto() junta candidatos, permisos, borradores y alta de todos los activos", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.c("c").estado.permiso = "t1";
    m.c("p").estado.borrador = 7;
    m.c("p").estado.alta = true;
    const ctx = m.equipo.contexto();
    expect(ctx.candidatos.map((c) => c.id).sort()).toEqual(["c", "p"]);
    expect(ctx.permisosDe).toEqual([{ id: "c", permisoId: "t1" }]);
    expect(ctx.borradoresDe).toEqual(["p"]);
    expect(ctx.altaDe).toBe("p");
  });

  it("el que se está guardando no aparece en contexto()", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.guardar("c");
    expect(m.equipo.contexto().candidatos.map((c) => c.id)).toEqual(["p"]);
  });

  it("una decisión se ejecuta solo en el Pokémon de su id", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.ejecutar({ tipo: "orden", id: "c", texto: "hola" });
    expect(m.c("c").log).toContain("ejecutar:orden:hola");
    expect(m.c("p").log.some((l) => l.startsWith("ejecutar:orden"))).toBe(false);
  });

  it("ejecutar(llamar) llama desde el Pokémon de su id", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    m.equipo.ejecutar({ tipo: "llamar", id: "p", nombreEspecie: "squirtle", encargo: "mira" });
    expect(m.equipo.vistas()).toHaveLength(2);
    expect(m.todos[1].log).toContain("ejecutar:orden:mira");
  });

  it("los permisos van solo por responderPermisoDe, al Pokémon de ese id", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.responderPermisoDe(true, "c", "t1");
    expect(m.c("c").log).toContain("responderPermisoDe:true:c:t1");
    expect(m.c("p").log.some((l) => l.startsWith("responderPermisoDe"))).toBe(false);
    m.equipo.responderPermisoDe(true, "nadie", "t1");
    expect(m.todos.flatMap((c) => c.log).filter((l) => l.startsWith("responderPermisoDe"))).toHaveLength(1);
  });

  it("un permiso no se responde a un Pokémon que se está guardando", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    m.equipo.guardar("p");
    m.equipo.responderPermisoDe(true, "p", "t1");
    expect(m.c("p").log.some((l) => l.startsWith("responderPermisoDe"))).toBe(false);
  });

  it("instancia(id) es la del controlador vivo; null si no está o si se está guardando", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    expect(m.equipo.instancia("p")).toBe(m.c("p").instancia("p"));
    expect(m.equipo.instancia("nadie")).toBeNull();
  });

  it("los borradores van al Pokémon que los tiene", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    const h = m.equipo.abrirBorrador("c", "revisa");
    expect(h).toBe(104);
    expect(m.equipo.continuarBorrador("c", "y el login")).toEqual({ borrador: 104, parte: 1 });
    expect(m.c("c").log).toEqual(["iniciar", "abrirBorrador:revisa", "continuarBorrador:y el login"]);
    expect(m.c("p").log).toEqual(["iniciar"]);
  });

  it("cancelarBorradorActual cancela el borrador más reciente a la vista; hayBorrador lo dice", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    expect(m.equipo.hayBorrador()).toBe(false);
    m.c("p").estado.borrador = 1;
    m.c("c").estado.borrador = 2;
    expect(m.equipo.hayBorrador()).toBe(true);
    m.equipo.cancelarBorradorActual();
    expect(m.c("c").log).toContain("cancelar");
    expect(m.c("p").log).not.toContain("cancelar");
  });

  it("Escape cancela el borrador que se ve (id más alto), aunque el orden del mapa sea el contrario", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    // Pikachu va primero en el mapa pero abrió su borrador después (id mayor): es el que se ve.
    m.c("p").estado.borrador = 9;
    m.c("c").estado.borrador = 3;
    expect(m.equipo.abierta()).toBe("p");
    m.equipo.cancelarBorradorActual();
    expect(m.c("p").log).toContain("cancelar");
    expect(m.c("c").log).not.toContain("cancelar");
    // Ahora se ve el de Charmander, y el siguiente Escape cancela ese.
    expect(m.equipo.abierta()).toBe("c");
    m.equipo.cancelarBorradorActual();
    expect(m.c("c").log).toContain("cancelar");
  });

  it("transcribiendo llega a todos los Pokémon", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.transcribiendo(true);
    m.equipo.transcribiendo(false);
    for (const id of ["p", "c"]) {
      expect(m.c(id).log).toEqual(["iniciar", "transcribiendo:true", "transcribiendo:false"]);
    }
  });

  it("voz, tic, micrófono y oído llegan a todos; los que salen después heredan micrófono y oído", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    m.equipo.voz(true);
    m.equipo.tic();
    m.equipo.ponerMicrofono(false);
    m.equipo.pausarOido(true);
    expect(m.c("p").log).toEqual(["iniciar", "voz:true", "tic", "microfono:false", "pausado:true"]);
    const r = m.equipo.llamar("p", "squirtle", "");
    expect(m.c((r as { id: string }).id).log).toEqual(["microfono:false", "pausado:true", "iniciar"]);
  });

  it("los comandos se enrutan a la burbuja del id; /llamar llama desde ese Pokémon", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.comando("c", "/model opus");
    expect(m.c("c").log).toContain("comando:/model opus");
    m.equipo.comando("p", "/llamar Squirtle que revise el Login.");
    const nuevo = m.todos[2];
    expect(nuevo.pokemon.carpeta).toBe("/acme");
    expect(nuevo.log).toContain("ejecutar:orden:que revise el Login.");
    m.equipo.comando("p", "/llamar");
    expect(m.c("p").log).toContain("aviso:Dime a quién: /llamar charmander");
  });

  it("'llama a escuirtel' escrito, solo aproximado, no crea a nadie: sugiere la especie", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    m.equipo.comando("p", "llama a escuirtel para que revise el Login.");
    expect(m.todos).toHaveLength(1);
    expect(m.c("p").log).toContain("aviso:No conozco a «escuirtel». ¿Quisiste decir Squirtle?");
  });

  it("'llama a Laura…' escrito trae al miembro del equipo con ese nombre, antes de mirar el catálogo", () => {
    const m = montar([PIKA, { id: "l", nombre: "Laura", especie: 4, carpeta: "/p" }]);
    m.equipo.arrancar();
    m.equipo.comando("p", "llama a Laura para que revise el Login.");
    expect(m.c("p").log.some((l) => l.startsWith("comando:"))).toBe(false);
    expect(m.c("p").log.some((l) => l.includes("No conozco"))).toBe(false);
    expect(m.c("l").log).toContain("ejecutar:orden:que revise el Login.");
  });

  it("llamar con una palabra solo aproximada no crea a nadie y sugiere", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    expect(m.equipo.llamar("p", "escuirtel", "")).toMatchObject({ tipo: "especie_desconocida" });
    expect(m.todos).toHaveLength(1);
    expect(m.c("p").log).toContain("aviso:No conozco a «escuirtel». ¿Quisiste decir Squirtle?");
  });

  it("'llama a squirtle para que…' escrito llama aquí mismo; una orden normal sigue yendo al Pokémon", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    m.equipo.comando("p", "llama a squirtle para que revise el Login.");
    const nuevo = m.todos[1];
    expect(nuevo.pokemon.nombre).toBe("Squirtle");
    expect(nuevo.log).toContain("ejecutar:orden:que revise el Login.");
    m.equipo.comando("p", "llama la función de pago");
    expect(m.c("p").log).toContain("comando:llama la función de pago");
    // Un nombre que no es de ninguna especie se le deja a Claude Code.
    m.equipo.comando("p", "llama a Andrés para que confirme");
    expect(m.c("p").log).toContain("comando:llama a Andrés para que confirme");
  });
});

describe("EquipoActivo: respuestas sin leer", () => {
  it("quien respondió sin que la persona lo abriera queda marcado hasta que abre su burbuja", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    const de = (id: string) => m.equipo.vistas().find((v) => v.id === id);
    expect(de("c")?.sinLeer).toBeUndefined();
    m.c("c").estado.ultimaRespuesta = "Arreglé el login.";
    expect(de("c")?.sinLeer).toBe(true);
    expect(de("p")?.sinLeer).toBeUndefined();
    m.equipo.elegir("c");
    expect(de("c")).toMatchObject({ abierta: true });
    expect(de("c")?.sinLeer).toBeUndefined();
    // Cerrada otra vez con la misma respuesta ya vista: no vuelve a marcarse.
    m.equipo.elegir("c");
    expect(de("c")?.sinLeer).toBeUndefined();
  });
});

describe("EquipoActivo: escuchandoA (sin nombre solo justo después de llamarlo)", () => {
  it("es el último llamado mientras él mismo siga atento", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.ejecutar({ tipo: "atencion", id: "p" });
    expect(m.equipo.contexto().escuchandoA).toBe("p");
    m.equipo.ejecutar({ tipo: "atencion", id: "c" });
    // Los dos están atentos en su propio contexto, pero solo cuenta el último.
    expect(m.equipo.contexto().escuchandoA).toBe("c");
  });

  it("si el último llamado ya no está atento, es null aunque otro lo siga", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.ejecutar({ tipo: "atencion", id: "p" });
    m.equipo.abrirBorrador("c", "revisa");
    expect(m.equipo.contexto().escuchandoA).toBeNull();
    m.equipo.ejecutar({ tipo: "atencion", id: "c" });
    m.c("c").estado.escuchando = false;
    expect(m.equipo.contexto().escuchandoA).toBeNull();
  });

  it("guardar al último llamado lo saca de escuchandoA", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    m.equipo.ejecutar({ tipo: "atencion", id: "p" });
    m.equipo.guardar("p");
    expect(m.equipo.contexto().escuchandoA).toBeNull();
  });
});

describe("EquipoActivo: cerrar", () => {
  it("cierra la sesión de todos sin guardarlos: siguen activos en la base", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.cerrar();
    expect(m.c("p").log).toContain("cerrarSesion");
    expect(m.c("c").log).toContain("cerrarSesion");
    expect(m.c("p").log).not.toContain("guardar");
    expect(m.bd.get("p")?.activo).toBe(true);
    expect(m.bd.get("c")?.activo).toBe(true);
  });

  it("cancela los que faltaban por salir en el arranque escalonado", () => {
    const m = montar([PIKA, CHAR], { programarDiferido: true });
    m.equipo.arrancar();
    m.correr(0);
    m.equipo.cerrar();
    m.correr(ESCALONADO_MS);
    expect(m.todos).toHaveLength(1);
  });
});

describe("EquipoActivo: una instancia por especie (ronda de arreglos 1)", () => {
  it("de punta a punta: con Charmander guardado, /pokemon charmander se rechaza y llamarlo saca a ese mismo", () => {
    const m = montar([PIKA, CHAR]);
    m.equipoBase.desactivar("c");
    m.equipo.arrancar();
    m.equipo.cambiarEspecie("p", { especie: 4, nombre: "Charmander" });
    expect(m.c("p").log).toContain("aviso:Ya tienes a Charmander en el PC. Llámalo.");
    expect(m.c("p").log).not.toContain("guardar");
    expect(m.llamadasEquipo).toEqual([]);
    expect(m.equipo.llamar("p", "charmander", "")).toEqual({ tipo: "ok", id: "c" });
    expect(m.equipo.vistas().map((v) => v.id)).toEqual(["p", "c"]);
    expect([...m.bd.values()].filter((p) => p.especie === 4)).toHaveLength(1);
  });

  it("con dos de la misma especie ya en la base, sacar el segundo se rechaza", () => {
    const m = montar([CHAR, { id: "c2", nombre: "Charmander", especie: 4, carpeta: "/q" }]);
    m.equipoBase.desactivar("c2");
    m.equipo.arrancar();
    expect(m.equipo.sacarGuardado("c2")).toEqual({ tipo: "ya_en_pantalla", id: "c" });
    expect(m.equipo.vistas().map((v) => v.id)).toEqual(["c"]);
    expect(m.bd.get("c2")?.activo).toBe(false);
  });

  it("al arrancar con dos activos de la misma especie solo sale el primero", () => {
    const m = montar([CHAR, { id: "c2", nombre: "Charmander", especie: 4, carpeta: "/q" }]);
    m.equipo.arrancar();
    expect(m.equipo.vistas().map((v) => v.id)).toEqual(["c"]);
  });
});

describe("EquipoActivo: cierres y guardados en curso (ronda de arreglos 1)", () => {
  it("un 'vuelve' justo antes de salir lo deja en el PC: cerrar lo desactiva aunque no termine de guardarse", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.guardar("p");
    m.equipo.cerrar();
    // La app sale sin esperar a que termine la animación: al abrir no debe reaparecer.
    expect(m.bd.get("p")?.activo).toBe(false);
    // El que estaba en pantalla sin guardarse sigue activo y vuelve al abrir.
    expect(m.bd.get("c")?.activo).toBe(true);
    // Si el guardado termina después, tampoco toca la base; y cerrar dos veces no desactiva a los demás.
    m.terminarGuardado("p");
    m.equipo.cerrar();
    expect(m.bd.get("p")?.activo).toBe(false);
    expect(m.bd.get("c")?.activo).toBe(true);
  });

  it("al cerrar, el que se está guardando para volver a salir (cambio de especie o carpeta) sigue activo", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    m.equipo.cambiarCarpeta("p", "/otra");
    m.equipo.cerrar();
    m.terminarGuardado("p");
    expect(m.bd.get("p")?.activo).toBe(true);
  });

  it("tras cerrar, sacarGuardado no saca a nadie", () => {
    const m = montar([PIKA, CHAR]);
    m.equipoBase.desactivar("c");
    m.equipo.arrancar();
    m.equipo.cerrar();
    expect(m.equipo.sacarGuardado("c")).toEqual({ tipo: "no_existe", id: "c" });
    expect(m.todos).toHaveLength(1);
  });

  it("mientras uno se guarda, llamarlo o sacarlo avisa que se está guardando", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.guardar("c");
    expect(m.equipo.llamar("p", "charmander", "")).toEqual({ tipo: "guardandose", id: "c" });
    expect(m.c("p").log).toContain("aviso:Charmander se está guardando.");
    expect(m.c("p").log.some((l) => l.includes("ya está en pantalla"))).toBe(false);
    expect(m.equipo.sacarGuardado("c")).toEqual({ tipo: "guardandose", id: "c" });
  });

  it("arrancar saca como mucho TOPE_EQUIPO aunque la base tenga más activos", () => {
    const activos = Array.from({ length: TOPE_EQUIPO + 2 }, (_, i) => ({
      id: `x${i}`,
      nombre: `N${i}`,
      especie: 1000 + i,
      carpeta: "/p",
    }));
    const m = montar(activos);
    m.equipo.arrancar();
    expect(m.equipo.vistas()).toHaveLength(TOPE_EQUIPO);
  });

  it("llamar no usa azar: azar, random y sorpresa son especies desconocidas", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    for (const nombre of ["azar", "Random", "sorpresa"]) {
      expect(m.equipo.llamar("p", nombre, "")).toEqual({ tipo: "especie_desconocida", nombre });
    }
    expect(m.bd.size).toBe(1);
  });

  it("/guardar con texto detrás también guarda", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    m.equipo.comando("p", "/guardar ya por hoy");
    expect(m.c("p").log).toContain("guardar");
    expect(m.c("p").log.some((l) => l.startsWith("comando:"))).toBe(false);
  });
});

describe("EquipoActivo: reintentar y comandos", () => {
  it("reintentar llega solo al Pokémon de ese id", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.reintentar("c");
    expect(m.c("c").log).toContain("reintentar");
    expect(m.c("p").log).not.toContain("reintentar");
  });

  it("comandos devuelve los del Pokémon de ese id", async () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    expect((await m.equipo.comandos("c")).map((c) => c.nombre)).toEqual(["de-c"]);
    expect((await m.equipo.comandos("p")).map((c) => c.nombre)).toEqual(["de-p"]);
  });

  it("con un id que no está en pantalla o que se está guardando no hace nada y no hay comandos", async () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    expect(await m.equipo.comandos("nadie")).toEqual([]);
    m.equipo.reintentar("nadie");
    m.equipo.guardar("p");
    m.equipo.reintentar("p");
    expect(m.c("p").log).not.toContain("reintentar");
    expect(await m.equipo.comandos("p")).toEqual([]);
  });
});

describe("EquipoActivo: menú del Pokémon (alta de voz, Centro Pokémon, avisos)", () => {
  it("iniciarAlta llega solo al Pokémon de ese id", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.iniciarAlta("c");
    expect(m.c("c").log).toContain("iniciarAlta:menu");
    expect(m.c("p").log).not.toContain("iniciarAlta:menu");
  });

  it("curar llega solo al Pokémon de ese id", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.curar("p");
    expect(m.c("p").log).toContain("curar");
    expect(m.c("c").log).not.toContain("curar");
  });

  it("avisar llega solo al Pokémon de ese id", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.avisar("p", "Hola");
    expect(m.c("p").log).toContain("aviso:Hola");
    expect(m.c("c").log.some((l) => l.startsWith("aviso:"))).toBe(false);
  });

  it("con un id que no está en pantalla o que se está guardando no hace nada", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    m.equipo.iniciarAlta("nadie");
    m.equipo.curar("nadie");
    m.equipo.avisar("nadie", "x");
    m.equipo.guardar("p");
    m.equipo.iniciarAlta("p");
    m.equipo.curar("p");
    m.equipo.avisar("p", "x");
    expect(m.c("p").log).not.toContain("iniciarAlta:menu");
    expect(m.c("p").log).not.toContain("curar");
    expect(m.c("p").log).not.toContain("aviso:x");
  });

  it("ninguno de los tres responde un permiso a la vista", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    m.c("p").estado.permiso = "perm-1";
    m.equipo.iniciarAlta("p");
    m.equipo.curar("p");
    m.equipo.avisar("p", "x");
    expect(m.c("p").log.some((l) => l.startsWith("responderPermisoDe"))).toBe(false);
  });
});

describe("EquipoActivo: una sola burbuja abierta (main es la autoridad)", () => {
  /** El Pokémon `id` pide el permiso `permiso` en el instante `desde` y publica. */
  const pedir = (m: ReturnType<typeof montar>, id: string, permiso: string, desde: number) => {
    Object.assign(m.c(id).estado, { permiso, estadoVista: "pidiendo_permiso", desde });
    m.c(id).enlace.alCambiar();
  };
  const abiertas = (vs: VistaPokemon[] | undefined) => (vs ?? []).filter((v) => v.abierta).map((v) => v.id);

  it("cada publicación marca como mucho una abierta: con dos permisos, la del más antiguo", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    expect(abiertas(m.publicadas.at(-1))).toEqual([]);
    pedir(m, "c", "X", 100);
    pedir(m, "p", "Y", 200);
    expect(abiertas(m.publicadas.at(-1))).toEqual(["c"]);
    expect(m.publicadas.at(-1)?.map((v) => v.abierta)).toEqual([false, true]);
    expect(m.equipo.abierta()).toBe("c");
  });

  it("elegir(id) fija esa burbuja y publica; elegirla otra vez la suelta", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    pedir(m, "c", "X", 100);
    pedir(m, "p", "Y", 200);
    const antes = m.publicadas.length;
    m.equipo.elegir("p");
    expect(m.publicadas.length).toBe(antes + 1);
    expect(abiertas(m.publicadas.at(-1))).toEqual(["p"]);
    m.equipo.elegir("p");
    expect(abiertas(m.publicadas.at(-1))).toEqual(["c"]);
  });

  it("elegir un id que no está vivo no publica ni cambia nada", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    pedir(m, "c", "X", 100);
    m.equipo.guardar("p");
    const antes = m.publicadas.length;
    m.equipo.elegir("p");
    m.equipo.elegir("nadie");
    expect(m.publicadas.length).toBe(antes);
    expect(m.equipo.abierta()).toBe("c");
  });

  it("un permiso nuevo suelta la fijada: el chip elegido no tapa el permiso", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.elegir("p");
    expect(m.equipo.abierta()).toBe("p");
    pedir(m, "c", "X", 100);
    expect(abiertas(m.publicadas.at(-1))).toEqual(["c"]);
  });

  it("un clic solo responde el permiso de la burbuja abierta; el de un chip no", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    pedir(m, "c", "X", 100);
    pedir(m, "p", "Y", 200);
    m.equipo.responderPermisoConClic(true, "p", "Y");
    expect(m.c("p").log.some((l) => l.startsWith("responderPermisoDe"))).toBe(false);
    m.equipo.responderPermisoConClic(false, "c", "X");
    expect(m.c("c").log).toContain("responderPermisoDe:false:c:X");
    m.equipo.elegir("p");
    m.equipo.responderPermisoConClic(true, "p", "Y");
    expect(m.c("p").log).toContain("responderPermisoDe:true:p:Y");
  });

  it("vistas() es pura: no suelta ni fija nada; solo publicar() y elegir() ponen al día la apertura", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.elegir("p");
    // Charmander pide un permiso sin publicar todavía: leer las vistas no suelta la fijada.
    Object.assign(m.c("c").estado, { permiso: "X", estadoVista: "pidiendo_permiso", desde: 100 });
    expect(abiertas(m.equipo.vistas())).toEqual(["p"]);
    expect(abiertas(m.equipo.vistas())).toEqual(["p"]);
    m.equipo.publicar();
    expect(abiertas(m.publicadas.at(-1))).toEqual(["c"]);
    expect(abiertas(m.equipo.vistas())).toEqual(["c"]);
  });

  it("un borrador nuevo se abre por encima del permiso", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    pedir(m, "p", "Y", 100);
    Object.assign(m.c("c").estado, { borrador: 7, estadoVista: "escuchando", desde: 300 });
    m.c("c").enlace.alCambiar();
    expect(abiertas(m.publicadas.at(-1))).toEqual(["c"]);
    // El borrador sale: vuelve el permiso.
    Object.assign(m.c("c").estado, { borrador: null, estadoVista: "trabajando", desde: 400 });
    m.c("c").enlace.alCambiar();
    expect(abiertas(m.publicadas.at(-1))).toEqual(["p"]);
  });

  it("un borrador nuevo suelta la fijada: cuando sale, no vuelve la fijada vieja", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    m.equipo.elegir("p"); // fijado sin nada: sigue fijado hasta otro clic
    expect(abiertas(m.publicadas.at(-1))).toEqual(["p"]);
    Object.assign(m.c("c").estado, { borrador: 7, estadoVista: "escuchando", desde: 300 });
    m.c("c").enlace.alCambiar();
    expect(abiertas(m.publicadas.at(-1))).toEqual(["c"]);
    Object.assign(m.c("c").estado, {
      borrador: null,
      estadoVista: "termino",
      desde: 400,
      burbuja: { tipo: "respuesta", texto: "hecho" },
    });
    m.c("c").enlace.alCambiar();
    expect(abiertas(m.publicadas.at(-1))).toEqual(["c"]);
  });
});

describe("EquipoActivo: nombre propio", () => {
  const fila = (m: ReturnType<typeof montar>, id: string) => m.bd.get(id) as Pokemon;
  const nombrar = (m: ReturnType<typeof montar>, id: string, texto: string) => m.equipo.comando(id, texto);
  const avisos = (m: ReturnType<typeof montar>, id: string) =>
    m.c(id).log.filter((l) => l.startsWith("aviso:"));

  it("/nombre guarda, renombra (borra apodos), lo vuelve a sacar con el mismo id y rehace el alta", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    fila(m, "p").apodos = ["picachu"];
    fila(m, "p").sessionId = "sesion-1";
    const viejo = m.c("p");
    nombrar(m, "p", "/nombre rayo");
    expect(viejo.log).toContain("guardar");
    expect(m.llamadasEquipo).toEqual(["renombrar:p:Rayo"]);
    expect(m.bd.get("p")).toMatchObject({ nombre: "Rayo", apodos: [], sessionId: "sesion-1", especie: 25 });
    m.terminarGuardado("p");
    expect(m.c("p")).not.toBe(viejo);
    expect(m.c("p").pokemon).toMatchObject({ nombre: "Rayo", activo: true });
    expect(m.c("p").log).toEqual(["iniciar", "iniciarAlta:3"]);
    // El alta del otro no se toca.
    expect(m.c("c").log).not.toContain("iniciarAlta:3");
  });

  it("volver al nombre de la especie renombra pero no pide alta (ya se entiende)", () => {
    const m = montar([{ ...PIKA, nombre: "Rayo" }]);
    m.equipo.arrancar();
    nombrar(m, "p", "/nombre Pikachu");
    expect(m.llamadasEquipo).toEqual(["renombrar:p:Pikachu"]);
    m.terminarGuardado("p");
    expect(m.c("p").log).toEqual(["iniciar"]);
  });

  it("un nombre inválido avisa el motivo y no cambia nada", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    for (const t of ["/nombre sí", "/nombre Rayo Veloz", "/nombre R2", "/nombre Squirtle", "/nombre Claude"])
      nombrar(m, "p", t);
    expect(avisos(m, "p")).toHaveLength(5);
    expect(m.llamadasEquipo).toEqual([]);
    expect(m.c("p").log).not.toContain("guardar");
  });

  it("no deja el nombre de otro miembro del equipo ni uno que suene igual", () => {
    const m = montar([PIKA, { ...CHAR, nombre: "Chispa" }]);
    m.equipo.arrancar();
    nombrar(m, "p", "/nombre Chispa");
    nombrar(m, "p", "/nombre chíspas");
    expect(avisos(m, "p")).toEqual([expect.stringContaining("Chispa"), expect.stringContaining("Chispa")]);
    expect(m.llamadasEquipo).toEqual([]);
  });

  it("también cuenta el que está guardado en el PC", () => {
    const m = montar([PIKA, { ...CHAR, nombre: "Chispa" }]);
    m.equipoBase.desactivar("c");
    m.equipo.arrancar();
    nombrar(m, "p", "/nombre Chispa");
    expect(m.llamadasEquipo).toEqual([]);
  });

  it("sin nombre pide uno; el mismo nombre no hace nada", () => {
    const m = montar([{ ...PIKA, nombre: "Rayo" }]);
    m.equipo.arrancar();
    nombrar(m, "p", "/nombre");
    nombrar(m, "p", "/nombre RAYO");
    expect(avisos(m, "p")).toEqual([
      expect.stringContaining("/nombre"),
      expect.stringContaining("Ya me llamo así"),
    ]);
    expect(m.llamadasEquipo).toEqual([]);
  });

  it("trabajando o con un permiso a la vista espera: no se renombra a media tarea", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    m.c("p").estado.estadoVista = "trabajando";
    nombrar(m, "p", "/nombre Rayo");
    m.c("p").estado.estadoVista = "paseando";
    m.c("p").estado.permiso = "perm-1";
    nombrar(m, "p", "/nombre Rayo");
    expect(avisos(m, "p")).toHaveLength(2);
    expect(m.llamadasEquipo).toEqual([]);
    expect(m.c("p").log).not.toContain("guardar");
    // El permiso sigue sin responderse.
    expect(m.c("p").log.some((l) => l.startsWith("responderPermisoDe"))).toBe(false);
  });

  it("pedirAltaAlSalir: el Pokémon bautizado en el laboratorio hace el alta al salir, antes de la primera vista", () => {
    const m = montar([{ ...PIKA, nombre: "Rayo" }, CHAR]);
    m.equipo.pedirAltaAlSalir("p");
    m.equipo.arrancar();
    expect(m.c("p").log).toEqual(["iniciar", "iniciarAlta:3"]);
    expect(m.c("c").log).toEqual(["iniciar"]);
  });

  it("el menú abre la burbuja de ese Pokémon una sola vez y devuelve true", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    expect(m.equipo.abrirParaNombre("p")).toBe(true);
    expect(m.equipo.abierta()).toBe("p");
    // Si ya estaba abierta no se cierra con un segundo clic.
    expect(m.equipo.abrirParaNombre("p")).toBe(true);
    expect(m.equipo.abierta()).toBe("p");
    expect(m.equipo.abrirParaNombre("nadie")).toBe(false);
  });

  it("el menú «Modelo» aplica uno de la lista al Pokémon de ese id y rechaza lo demás", () => {
    const m = montar([PIKA, CHAR]);
    m.equipo.arrancar();
    expect(m.equipo.cambiarModelo("c", "haiku")).toBe(true);
    expect(m.c("c").log).toContain("cambiarModelo:haiku");
    expect(m.c("p").log).not.toContain("cambiarModelo:haiku");
    expect(m.equipo.cambiarModelo("c", "gpt")).toBe(false);
    expect(m.equipo.cambiarModelo("c", "fable")).toBe(false);
    expect(m.equipo.cambiarModelo("nadie", "opus")).toBe(false);
    expect(m.c("c").log.filter((l) => l.startsWith("cambiarModelo:"))).toEqual(["cambiarModelo:haiku"]);
  });

  it("evolucionar con nombre propio lo conserva (y sus apodos); con el de la especie, cambia como siempre", () => {
    const m = montar([{ ...CHAR, nombre: "Chispa" }]);
    m.equipo.arrancar();
    fila(m, "c").tareas = 15;
    m.equipo.tic();
    expect(m.llamadasEquipo).toEqual([expect.stringMatching(/^cambiarEspecie:c:5:Chispa:.*:conserva$/)]);
    m.terminarGuardado("c");
    expect(m.c("c").log).toContain("aviso:¡Chispa evolucionó a Charmeleon!");
  });

  it("contexto: el nombre de especie de uno no secuestra el nombre propio de otro", () => {
    const m = montar([
      { id: "a", nombre: "Charmanda", especie: 25, carpeta: "/x" },
      { id: "b", nombre: "Zeta", especie: 4, carpeta: "/x" },
    ]);
    m.equipo.arrancar();
    m.c("a").estado.alias = ["Pikachu"];
    m.c("b").estado.alias = ["Charmander"];
    const cands = m.equipo.contexto().candidatos;
    expect(cands.find((c) => c.id === "a")?.alias).toEqual(["Pikachu"]);
    expect(cands.find((c) => c.id === "b")?.alias).toEqual([]);
  });
});

describe("EquipoActivo: /pokemon y evolución conservan el nombre propio", () => {
  it("/pokemon en uno con nombre propio lo conserva (y sus apodos); con el de la especie cambia al nuevo", () => {
    const m = montar([{ ...PIKA, nombre: "Rayo" }]);
    m.equipo.arrancar();
    m.equipo.cambiarEspecie("p", { especie: 7, nombre: "Squirtle" });
    expect(m.llamadasEquipo).toEqual(["cambiarEspecie:p:7:Rayo:B:1:conserva"]);
    m.terminarGuardado("p");
    expect(m.c("p").pokemon).toMatchObject({ especie: 7, nombre: "Rayo" });
    expect(m.c("p").log).toEqual(["iniciar"]);
  });
});

describe("EquipoActivo: el alta del bautizo espera a que se pueda oír", () => {
  const conAlta = (opciones: { mic?: boolean; pausa?: boolean } = {}) => {
    const m = montar([{ ...PIKA, nombre: "Rayo" }]);
    if (opciones.mic === false) m.equipo.ponerMicrofono(false);
    if (opciones.pausa) m.equipo.pausarOido(true);
    m.equipo.pedirAltaAlSalir("p");
    m.equipo.arrancar();
    return m;
  };

  it("sin micrófono no empieza; cuando el micrófono vuelve, sí", () => {
    const m = conAlta({ mic: false });
    expect(m.c("p").log).not.toContain("iniciarAlta:3");
    m.equipo.ponerMicrofono(true);
    expect(m.c("p").log).toContain("iniciarAlta:3");
  });

  it("con la escucha pausada no empieza; al reanudar, sí, una sola vez", () => {
    const m = conAlta({ pausa: true });
    expect(m.c("p").log).not.toContain("iniciarAlta:3");
    m.equipo.pausarOido(false);
    m.equipo.pausarOido(false);
    expect(m.c("p").log.filter((l) => l === "iniciarAlta:3")).toHaveLength(1);
  });

  it("si el micrófono se pierde en medio del alta, se suspende y se retoma al volver", () => {
    const m = conAlta();
    expect(m.c("p").log).toContain("iniciarAlta:3");
    m.equipo.ponerMicrofono(false);
    expect(m.c("p").log).toContain("saltarAlta");
    m.equipo.ponerMicrofono(true);
    expect(m.c("p").log.filter((l) => l === "iniciarAlta:3")).toHaveLength(2);
  });

  it("«Saltar» termina el alta y no se vuelve a pedir", () => {
    const m = conAlta();
    m.equipo.saltarAlta("p");
    expect(m.c("p").log).toContain("saltarAlta");
    m.equipo.ponerMicrofono(false);
    m.equipo.ponerMicrofono(true);
    expect(m.c("p").log.filter((l) => l === "iniciarAlta:3")).toHaveLength(1);
  });

  it("el alta de «Enseñarle mi voz» del menú no se toca con el micrófono", () => {
    const m = montar([PIKA]);
    m.equipo.arrancar();
    m.equipo.iniciarAlta("p");
    m.equipo.ponerMicrofono(false);
    expect(m.c("p").log).not.toContain("saltarAlta");
  });
});

describe("EquipoActivo: llamar por el nombre propio", () => {
  const equipo = () => {
    const m = montar([CHAR, { ...PIKA, nombre: "Rayo" }]);
    m.equipoBase.desactivar("p");
    fila(m, "p").apodos = ["rallo"];
    m.equipo.arrancar();
    return m;
  };
  const fila = (m: ReturnType<typeof montar>, id: string) => m.bd.get(id) as Pokemon;

  it("saca a un guardado por su nombre propio, por un apodo o por el nombre de su especie", () => {
    for (const dicho of ["Rayo", "rallo", "pikachu"]) {
      const m = equipo();
      expect(m.equipo.llamar("c", dicho, "revisa"), dicho).toEqual({ tipo: "ok", id: "p" });
      expect(m.c("p").pokemon.nombre).toBe("Rayo");
      expect(m.todos.filter((c) => c.pokemon.especie === 25)).toHaveLength(1);
    }
  });

  it("no crea uno nuevo de esa especie: es el mismo Pokémon", () => {
    const m = equipo();
    const filas = m.bd.size;
    m.equipo.llamar("c", "rayo", "");
    expect(m.bd.size).toBe(filas);
  });

  it("si ya está en pantalla le pasa el encargo", () => {
    const m = equipo();
    m.equipo.llamar("c", "Rayo", "");
    const r = m.equipo.llamar("c", "Rayo", "revisa el login");
    expect(r).toEqual({ tipo: "ya_en_pantalla", id: "p" });
    expect(m.c("p").log).toContain("ejecutar:orden:revisa el login");
  });

  it("candidatosDelEquipo lista a todos, con el alias de su especie si tienen nombre propio", () => {
    const m = equipo();
    expect(m.equipo.candidatosDelEquipo()).toEqual([
      { id: "c", nombre: "Charmander", apodos: [], alias: [] },
      { id: "p", nombre: "Rayo", apodos: ["rallo"], alias: ["Pikachu"] },
    ]);
  });

  it("nombresAjenos: nombres, apodos y especies de los demás, no los propios", () => {
    const m = equipo();
    expect(m.equipo.nombresAjenos("c")).toEqual(expect.arrayContaining(["Rayo", "rallo", "Pikachu"]));
    expect(m.equipo.nombresAjenos("c")).not.toContain("Charmander");
  });
});
