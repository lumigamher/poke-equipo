import { describe, expect, it } from "vitest";
import {
  activaCeremonia,
  aplicarLlegada,
  bolaParaElFoco,
  type Efecto,
  ESTADO_INICIAL,
  type EstadoLab,
  type Evento,
  estadoEspecie,
  llegadasIniciales,
  quitarFallo,
  reducir,
  validarLlegada,
} from "./laboratorio";

const TOTAL = 4;
const correr = (eventos: Evento[], desde: EstadoLab = ESTADO_INICIAL) => {
  let estado = desde;
  const efectos: Efecto[] = [];
  for (const e of eventos) {
    const r = reducir(estado, e, TOTAL);
    estado = r.estado;
    if (r.efecto) efectos.push(r.efecto);
  }
  return { estado, efectos };
};
const ESPECIES = [1, 4, 7, 25];

describe("laboratorio: máquina de pasos", () => {
  it("empieza eligiendo, sin nadie enfocado", () => {
    expect(ESTADO_INICIAL).toEqual({
      paso: "elegir",
      enfocada: null,
      asomada: null,
      elegida: null,
      avisoSalir: false,
      nombre: null,
      modelo: null,
      pokedex: false,
      filtro: "",
      otra: null,
      descarga: "lista",
    });
  });

  it("enfocar o pasar el cursor asoma a ese Pokémon; las flechas dan la vuelta", () => {
    expect(correr([{ tipo: "enfocar", indice: 2 }]).estado.enfocada).toBe(2);
    expect(correr([{ tipo: "mover", delta: 1 }]).estado.enfocada).toBe(0);
    expect(correr([{ tipo: "mover", delta: -1 }]).estado.enfocada).toBe(3);
    expect(
      correr([
        { tipo: "enfocar", indice: 3 },
        { tipo: "mover", delta: 1 },
      ]).estado.enfocada,
    ).toBe(0);
    expect(
      correr([
        { tipo: "enfocar", indice: 0 },
        { tipo: "mover", delta: -1 },
      ]).estado.enfocada,
    ).toBe(3);
  });

  it("el cursor solo asoma: no marca la pokébola ni borra el aviso de salir", () => {
    const r = correr([{ tipo: "escape" }, { tipo: "asomar", indice: 2 }]);
    expect(r.estado).toMatchObject({ asomada: 2, enfocada: null, avisoSalir: true });
    const f = correr([
      { tipo: "enfocar", indice: 1 },
      { tipo: "asomar", indice: 3 },
    ]);
    expect(f.estado).toMatchObject({ enfocada: 1, asomada: 3 });
    expect(correr([{ tipo: "asomar", indice: 9 }]).estado.asomada).toBeNull();
  });

  it("ignora un índice fuera de la lista", () => {
    expect(correr([{ tipo: "enfocar", indice: 9 }]).estado.enfocada).toBeNull();
    expect(correr([{ tipo: "escoger", indice: -1 }]).estado.paso).toBe("elegir");
  });

  it("escoger pide confirmación; Volver regresa a elegir sin perder el enfocado", () => {
    const a = correr([{ tipo: "escoger", indice: 1 }]);
    expect(a.estado).toMatchObject({ paso: "confirmar", elegida: 1, enfocada: 1 });
    const b = correr([{ tipo: "volver" }], a.estado);
    expect(b.estado).toMatchObject({ paso: "elegir", elegida: null, enfocada: 1 });
  });

  it("Escape en la confirmación es Volver, no salir", () => {
    const r = correr([{ tipo: "escoger", indice: 1 }, { tipo: "escape" }]);
    expect(r.estado.paso).toBe("elegir");
    expect(r.efectos).toEqual([]);
  });

  it("confirmar abre la ceremonia; al terminar (o al saltarla) pide el nombre, sin pedir aún la carpeta", () => {
    const base = [{ tipo: "escoger", indice: 3 }, { tipo: "confirmar" }] as Evento[];
    const c = correr(base);
    expect(c.estado.paso).toBe("ceremonia");
    expect(c.efectos).toEqual([]);
    for (const fin of [{ tipo: "ceremoniaTerminada" }, { tipo: "saltar" }] as Evento[]) {
      const r = correr([fin], c.estado);
      expect(r.estado).toMatchObject({ paso: "nombre", elegida: 3 });
      expect(r.efectos).toEqual([]);
    }
  });

  it("Escape durante la ceremonia la salta y llega al nombre", () => {
    const r = correr([{ tipo: "escoger", indice: 0 }, { tipo: "confirmar" }, { tipo: "escape" }]);
    expect(r.estado.paso).toBe("nombre");
    expect(r.efectos).toEqual([]);
  });

  const hastaNombre = (indice = 3): EstadoLab =>
    correr([{ tipo: "escoger", indice }, { tipo: "confirmar" }, { tipo: "saltar" }]).estado;

  it("nombrar pasa al modelo (sin avisar a main todavía) con el del tipo preseleccionado", () => {
    const r = correr([{ tipo: "nombrar", nombre: "Rayo", modeloInicial: "opus" }], hastaNombre(3));
    expect(r.estado).toMatchObject({ paso: "modelo", nombre: "Rayo", modelo: "opus", elegida: 3 });
    expect(r.efectos).toEqual([]);
  });

  it("sin modelo de tipo (o uno fuera de la lista) se preselecciona sonnet", () => {
    expect(correr([{ tipo: "nombrar", nombre: "Rayo" }], hastaNombre(3)).estado.modelo).toBe("sonnet");
    const raro = correr([{ tipo: "nombrar", nombre: "Rayo", modeloInicial: "fable" }], hastaNombre(3));
    expect(raro.estado.modelo).toBe("sonnet");
  });

  const hastaModelo = (indice = 3, modeloInicial = "sonnet"): EstadoLab =>
    correr([{ tipo: "nombrar", nombre: "Rayo", modeloInicial }], hastaNombre(indice)).estado;

  it("modelar manda la especie con el nombre y el modelo elegidos y pasa a la carpeta", () => {
    const r = correr([{ tipo: "modelar" }], hastaModelo(3, "opus"));
    expect(r.estado.paso).toBe("carpeta");
    expect(r.efectos).toEqual([{ tipo: "elegida", especie: ESPECIES[3], nombre: "Rayo", modelo: "opus" }]);
  });

  it("dejar el nombre de la especie también es nombrar: sale con ese nombre", () => {
    const e = correr([{ tipo: "nombrar", nombre: "Pikachu" }], hastaNombre(3)).estado;
    const r = correr([{ tipo: "modelar" }], e);
    expect(r.efectos).toEqual([{ tipo: "elegida", especie: 25, nombre: "Pikachu", modelo: "sonnet" }]);
  });

  it("en el modelo, las flechas dan la vuelta y escoger marca uno de la lista", () => {
    const e = hastaModelo(3, "sonnet");
    expect(correr([{ tipo: "mover", delta: 1 }], e).estado.modelo).toBe("opus");
    expect(correr([{ tipo: "mover", delta: -1 }], e).estado.modelo).toBe("haiku");
    expect(
      correr(
        [
          { tipo: "mover", delta: 1 },
          { tipo: "mover", delta: 1 },
        ],
        e,
      ).estado.modelo,
    ).toBe("haiku");
    expect(correr([{ tipo: "escogerModelo", modelo: "haiku" }], e).estado.modelo).toBe("haiku");
    expect(correr([{ tipo: "escogerModelo", modelo: "gpt" }], e).estado).toEqual(e);
    const r = correr([{ tipo: "escogerModelo", modelo: "haiku" }, { tipo: "modelar" }], e);
    expect(r.efectos).toEqual([{ tipo: "elegida", especie: 25, nombre: "Rayo", modelo: "haiku" }]);
  });

  it("Atrás (Volver o Escape) en el modelo regresa al nombre, conservando nombre y modelo", () => {
    const e = correr([{ tipo: "mover", delta: 1 }], hastaModelo(2)).estado;
    for (const atras of [{ tipo: "volver" }, { tipo: "escape" }] as Evento[]) {
      const r = correr([atras], e);
      expect(r.estado).toMatchObject({ paso: "nombre", elegida: 2, nombre: "Rayo", modelo: "opus" });
      expect(r.efectos).toEqual([]);
    }
    // Y al volver a dejar el nombre, el modelo que ya se había marcado sigue marcado.
    const otra = correr(
      [{ tipo: "volver" }, { tipo: "nombrar", nombre: "Rayito", modeloInicial: "haiku" }],
      e,
    );
    expect(otra.estado).toMatchObject({ paso: "modelo", nombre: "Rayito", modelo: "opus" });
  });

  it("en el modelo no se cierra la app ni se atiende lo de otros pasos", () => {
    const e = hastaModelo(1);
    const r = correr(
      [{ tipo: "salir" }, { tipo: "saltar" }, { tipo: "ceremoniaTerminada" }, { tipo: "escoger", indice: 0 }],
      e,
    );
    expect(r.estado).toEqual(e);
    expect(r.efectos).toEqual([]);
  });

  it("modelar fuera del paso del modelo no hace nada", () => {
    expect(correr([{ tipo: "modelar" }], hastaNombre(1)).efectos).toEqual([]);
    expect(correr([{ tipo: "modelar" }]).estado).toEqual(ESTADO_INICIAL);
  });

  it("Atrás (Volver o Escape) en el nombre regresa a elegir, sin la elección y con ese Pokémon enfocado", () => {
    for (const atras of [{ tipo: "volver" }, { tipo: "escape" }] as Evento[]) {
      const r = correr([atras], hastaNombre(2));
      expect(r.estado).toMatchObject({
        paso: "elegir",
        elegida: null,
        enfocada: 2,
        avisoSalir: false,
        nombre: null,
        modelo: null,
      });
      expect(r.efectos).toEqual([]);
    }
  });

  it("en el nombre no se cierra la app ni se atiende lo de otros pasos", () => {
    const e = hastaNombre(1);
    const r = correr(
      [{ tipo: "salir" }, { tipo: "saltar" }, { tipo: "ceremoniaTerminada" }, { tipo: "escoger", indice: 0 }],
      e,
    );
    expect(r.estado).toEqual(e);
    expect(r.efectos).toEqual([]);
  });

  it("un nombre que no es texto (lo que llegue torcido) no avanza", () => {
    const e = hastaNombre(1);
    const r = correr([{ tipo: "nombrar", nombre: undefined as unknown as string }], e);
    expect(r.estado).toEqual(e);
    expect(r.efectos).toEqual([]);
  });

  it("la elección sale a main una sola vez aunque lleguen dos eventos de fin y dos de nombre", () => {
    const r = correr([
      { tipo: "escoger", indice: 2 },
      { tipo: "confirmar" },
      { tipo: "ceremoniaTerminada" },
      { tipo: "saltar" },
      { tipo: "ceremoniaTerminada" },
      { tipo: "nombrar", nombre: "Gota" },
      { tipo: "nombrar", nombre: "Otra" },
      { tipo: "modelar" },
      { tipo: "modelar" },
    ]);
    expect(r.efectos).toEqual([{ tipo: "elegida", especie: 7, nombre: "Gota", modelo: "sonnet" }]);
  });

  it("carpeta cancelada: vuelve al laboratorio con ese Pokémon enfocado, y se puede elegir otro", () => {
    const enCarpeta = correr([{ tipo: "modelar" }], hastaModelo(2)).estado;
    const atras = correr([{ tipo: "carpetaCancelada" }], enCarpeta);
    expect(atras.estado).toEqual({
      paso: "elegir",
      enfocada: 2,
      asomada: 2,
      elegida: null,
      avisoSalir: false,
      nombre: null,
      modelo: null,
      pokedex: false,
      filtro: "",
      otra: null,
      descarga: "lista",
    });
    const otra = correr(
      [
        { tipo: "escoger", indice: 0 },
        { tipo: "confirmar" },
        { tipo: "saltar" },
        { tipo: "nombrar", nombre: "Hoja", modeloInicial: "haiku" },
        { tipo: "modelar" },
      ],
      atras.estado,
    );
    expect(otra.efectos).toEqual([{ tipo: "elegida", especie: 1, nombre: "Hoja", modelo: "haiku" }]);
  });

  it("mientras se pide la carpeta no se atiende nada (ni Escape ni clics ni otro nombre)", () => {
    const enCarpeta = correr([{ tipo: "modelar" }], hastaModelo(2)).estado;
    const r = correr(
      [
        { tipo: "escape" },
        { tipo: "escoger", indice: 0 },
        { tipo: "volver" },
        { tipo: "salir" },
        { tipo: "nombrar", nombre: "Otro" },
        { tipo: "modelar" },
        { tipo: "mover", delta: 1 },
        { tipo: "escogerModelo", modelo: "opus" },
      ],
      enCarpeta,
    );
    expect(r.estado).toEqual(enCarpeta);
    expect(r.efectos).toEqual([]);
  });

  it("Escape dos veces seguidas en la elección cierra la app; otra acción entre medias borra el aviso", () => {
    const uno = correr([{ tipo: "escape" }]);
    expect(uno.estado.avisoSalir).toBe(true);
    expect(uno.efectos).toEqual([]);
    const dos = correr([{ tipo: "escape" }], uno.estado);
    expect(dos.estado.paso).toBe("salir");
    expect(dos.efectos).toEqual([{ tipo: "salir" }]);
    const roto = correr([{ tipo: "escape" }, { tipo: "enfocar", indice: 1 }, { tipo: "escape" }]);
    expect(roto.estado.avisoSalir).toBe(true);
    expect(roto.estado.paso).toBe("elegir");
    expect(roto.efectos).toEqual([]);
  });

  it("el botón Salir cierra la app desde la elección y desde la confirmación", () => {
    expect(correr([{ tipo: "salir" }]).efectos).toEqual([{ tipo: "salir" }]);
    expect(correr([{ tipo: "escoger", indice: 0 }, { tipo: "salir" }]).efectos).toEqual([{ tipo: "salir" }]);
  });

  it("Salir no corta la ceremonia: ahí solo se salta", () => {
    const r = correr([{ tipo: "escoger", indice: 0 }, { tipo: "confirmar" }, { tipo: "salir" }]);
    expect(r.estado.paso).toBe("ceremonia");
    expect(r.efectos).toEqual([]);
  });

  it("eventos que no tocan en ese paso se ignoran", () => {
    expect(correr([{ tipo: "confirmar" }]).estado).toEqual(ESTADO_INICIAL);
    expect(correr([{ tipo: "volver" }]).estado).toEqual(ESTADO_INICIAL);
    expect(correr([{ tipo: "carpetaCancelada" }]).estado).toEqual(ESTADO_INICIAL);
    expect(correr([{ tipo: "ceremoniaTerminada" }]).estado).toEqual(ESTADO_INICIAL);
  });

  it("la escena de la ceremonia se muestra en los pasos ceremonia, nombre, modelo y carpeta", () => {
    expect(activaCeremonia("ceremonia")).toBe(true);
    expect(activaCeremonia("nombre")).toBe(true);
    expect(activaCeremonia("modelo")).toBe(true);
    expect(activaCeremonia("carpeta")).toBe(true);
    expect(activaCeremonia("elegir")).toBe(false);
    expect(activaCeremonia("confirmar")).toBe(false);
  });
});

describe("laboratorio: Pokédex de Kanto (el huevo de pascua)", () => {
  const abierta = (filtro?: string) =>
    correr([{ tipo: "abrirPokedex", ...(filtro ? { filtro } : {}) }]).estado;
  const hastaModelo = () =>
    correr([
      { tipo: "abrirPokedex" },
      { tipo: "escogerOtra", especie: 150 },
      { tipo: "confirmar" },
      { tipo: "ceremoniaTerminada" },
      { tipo: "nombrar", nombre: "Mewtwo", modeloInicial: "opus" },
    ]);

  it("se abre y se cierra sin tocar lo demás; el atajo trae lo escrito", () => {
    expect(abierta()).toMatchObject({ paso: "elegir", pokedex: true, filtro: "" });
    expect(abierta("150").filtro).toBe("150");
    expect(correr([{ tipo: "abrirPokedex" }, { tipo: "cerrarPokedex" }]).estado).toEqual(ESTADO_INICIAL);
  });

  it("solo se abre al elegir; en otros pasos se ignora", () => {
    const confirmando = correr([{ tipo: "escoger", indice: 0 }]).estado;
    expect(correr([{ tipo: "abrirPokedex" }], confirmando).estado).toEqual(confirmando);
  });

  it("filtrar solo cuenta con la Pokédex abierta y se recorta", () => {
    expect(correr([{ tipo: "filtrar", texto: "pi" }]).estado.filtro).toBe("");
    expect(correr([{ tipo: "abrirPokedex" }, { tipo: "filtrar", texto: "pi" }]).estado.filtro).toBe("pi");
    expect(
      correr([{ tipo: "abrirPokedex" }, { tipo: "filtrar", texto: "x".repeat(100) }]).estado.filtro,
    ).toHaveLength(24);
  });

  it("con ella abierta, Escape la cierra y no cuenta para salir; el segundo sí avisa", () => {
    const r = correr([{ tipo: "abrirPokedex" }, { tipo: "escape" }]);
    expect(r.estado).toEqual(ESTADO_INICIAL);
    expect(r.efectos).toEqual([]);
    expect(correr([{ tipo: "escape" }], r.estado).estado.avisoSalir).toBe(true);
  });

  it("las pokébolas y sus flechas no actúan mientras está abierta", () => {
    const base = abierta();
    expect(correr([{ tipo: "escoger", indice: 1 }], base).estado).toEqual(base);
    expect(correr([{ tipo: "mover", delta: 1 }], base).estado).toEqual(base);
  });

  it("escoger a alguien lo lleva a confirmar, sin marcar ninguna pokébola", () => {
    const r = correr([{ tipo: "abrirPokedex" }, { tipo: "escogerOtra", especie: 150 }]);
    expect(r.estado).toMatchObject({ paso: "confirmar", otra: 150, elegida: null, enfocada: null });
  });

  it("no se escoge con la Pokédex cerrada ni con un número que no vale", () => {
    expect(correr([{ tipo: "escogerOtra", especie: 150 }]).estado).toEqual(ESTADO_INICIAL);
    const base = abierta();
    for (const especie of [0, -3, 1.5, Number.NaN]) {
      expect(correr([{ tipo: "escogerOtra", especie }], base).estado, String(especie)).toEqual(base);
    }
  });

  it("el flujo normal sigue: confirmar, ceremonia, nombre, modelo y carpeta; el efecto lleva su especie", () => {
    const hasta = hastaModelo();
    expect(hasta.estado).toMatchObject({ paso: "modelo", nombre: "Mewtwo", modelo: "opus", otra: 150 });
    const fin = correr([{ tipo: "modelar" }], hasta.estado);
    expect(fin.estado.paso).toBe("carpeta");
    expect(fin.efectos).toEqual([{ tipo: "elegida", especie: 150, nombre: "Mewtwo", modelo: "opus" }]);
  });

  it("Atrás (confirmar o nombre) vuelve a la Pokédex, con su búsqueda", () => {
    const antes = [
      { tipo: "abrirPokedex", filtro: "mew" },
      { tipo: "escogerOtra", especie: 151 },
    ] satisfies Evento[];
    const conf = correr([...antes, { tipo: "volver" }]).estado;
    expect(conf).toMatchObject({ paso: "elegir", pokedex: true, filtro: "mew", otra: null, elegida: null });
    const nombre = correr([...antes, { tipo: "confirmar" }, { tipo: "saltar" }, { tipo: "volver" }]).estado;
    expect(nombre).toMatchObject({ paso: "elegir", pokedex: true, filtro: "mew", otra: null });
  });

  it("si se cancela la carpeta vuelve a la Pokédex; desde las pokébolas, como antes", () => {
    const enCarpeta = correr([{ tipo: "modelar" }], hastaModelo().estado).estado;
    const atras = correr([{ tipo: "carpetaCancelada" }], enCarpeta).estado;
    expect(atras).toMatchObject({ paso: "elegir", pokedex: true, otra: null, elegida: null, nombre: null });
    // Las cuatro pokébolas no cambian.
    expect(correr([{ tipo: "carpetaCancelada" }]).estado).toEqual(ESTADO_INICIAL);
  });

  it("elegir una de las cuatro después de pasar por la Pokédex sigue mandando su especie", () => {
    const r = correr([
      { tipo: "abrirPokedex" },
      { tipo: "cerrarPokedex" },
      { tipo: "escoger", indice: 3 },
      { tipo: "confirmar" },
      { tipo: "saltar" },
      { tipo: "nombrar", nombre: "Pika", modeloInicial: "sonnet" },
      { tipo: "modelar" },
    ]);
    expect(r.efectos).toEqual([{ tipo: "elegida", especie: 25, nombre: "Pika", modelo: "sonnet" }]);
  });

  it("salir cierra la app aunque la Pokédex esté abierta", () => {
    expect(correr([{ tipo: "abrirPokedex" }, { tipo: "salir" }]).efectos).toEqual([{ tipo: "salir" }]);
  });
});

describe("bolaParaElFoco: las flechas llevan el foco a la bola nueva", () => {
  it("al elegir, con una bola enfocada y el foco en el cuerpo, el título o una bola, el foco va a esa bola", () => {
    for (const donde of ["cuerpo", "titulo", "bola"] as const)
      expect(bolaParaElFoco("elegir", 2, donde), donde).toBe(2);
  });

  it("el cursor solo asoma: si el foco está en otra cosa (Salir), no se le quita", () => {
    expect(bolaParaElFoco("elegir", 2, "otro")).toBeNull();
  });

  it("sin bola enfocada o fuera de la elección no mueve nada (así Enter no elige otra)", () => {
    expect(bolaParaElFoco("elegir", null, "bola")).toBeNull();
    for (const paso of ["confirmar", "ceremonia", "nombre", "modelo", "carpeta"] as const)
      expect(bolaParaElFoco(paso, 1, "bola"), paso).toBeNull();
  });

  it("las flechas de verdad: tras mover, la bola que debe tener el foco es la nueva", () => {
    const r = correr([
      { tipo: "enfocar", indice: 1 },
      { tipo: "mover", delta: 1 },
    ]);
    expect(bolaParaElFoco(r.estado.paso, r.estado.enfocada, "bola")).toBe(2);
  });
});

describe("laboratorio: especies de Kanto que todavía no llegaron", () => {
  const enPokedex = (...eventos: Evento[]) => correr([{ tipo: "abrirPokedex" }, ...eventos]);

  it("el estado inicial no espera descarga", () => {
    expect(ESTADO_INICIAL.descarga).toBe("lista");
  });

  it("elegir a alguien ya bajado (o sin decir nada) deja confirmar de una vez", () => {
    for (const lista of [true, undefined]) {
      const r = enPokedex({ tipo: "escogerOtra", especie: 150, lista }, { tipo: "confirmar" });
      expect(r.estado, String(lista)).toMatchObject({ paso: "ceremonia", otra: 150, descarga: "lista" });
    }
  });

  it("elegir a alguien que aún no está pone la descarga en curso y NO deja pasar a la ceremonia", () => {
    const e = enPokedex({ tipo: "escogerOtra", especie: 150, lista: false });
    expect(e.estado).toMatchObject({ paso: "confirmar", otra: 150, descarga: "bajando" });
    const r = correr([{ tipo: "confirmar" }], e.estado);
    expect(r.estado).toEqual(e.estado);
    expect(r.efectos).toEqual([]);
  });

  it("cuando llega la elegida se puede confirmar", () => {
    const e = enPokedex(
      { tipo: "escogerOtra", especie: 150, lista: false },
      { tipo: "llegada", especie: 150, ok: true },
    );
    expect(e.estado.descarga).toBe("lista");
    expect(correr([{ tipo: "confirmar" }], e.estado).estado.paso).toBe("ceremonia");
  });

  it("si la descarga falla queda en fallo, sigue sin dejar pasar, y Reintentar la vuelve a poner en curso", () => {
    const f = enPokedex(
      { tipo: "escogerOtra", especie: 150, lista: false },
      { tipo: "llegada", especie: 150, ok: false },
    );
    expect(f.estado.descarga).toBe("fallo");
    expect(correr([{ tipo: "confirmar" }], f.estado).estado.paso).toBe("confirmar");
    const r = correr([{ tipo: "reintentar" }], f.estado);
    expect(r.estado.descarga).toBe("bajando");
    expect(correr([{ tipo: "llegada", especie: 150, ok: true }], r.estado).estado.descarga).toBe("lista");
  });

  it("lo que llega de otra especie, o fuera de tiempo, no toca a la elegida", () => {
    const e = enPokedex({ tipo: "escogerOtra", especie: 150, lista: false });
    expect(correr([{ tipo: "llegada", especie: 149, ok: true }], e.estado).estado).toEqual(e.estado);
    expect(correr([{ tipo: "llegada", especie: 149, ok: false }], e.estado).estado).toEqual(e.estado);
    // Una llegada vieja con fallo no tumba a una que ya está lista.
    const lista = enPokedex({ tipo: "escogerOtra", especie: 150, lista: true });
    expect(correr([{ tipo: "llegada", especie: 150, ok: false }], lista.estado).estado).toEqual(lista.estado);
    // Reintentar sin fallo no hace nada.
    expect(correr([{ tipo: "reintentar" }], e.estado).estado).toEqual(e.estado);
  });

  it("Volver desde una pendiente regresa a la Pokédex y olvida la descarga", () => {
    const e = enPokedex({ tipo: "escogerOtra", especie: 150, lista: false }, { tipo: "volver" });
    expect(e.estado).toMatchObject({ paso: "elegir", pokedex: true, otra: null, descarga: "lista" });
  });

  it("las llegadas durante la elección o la ceremonia no cambian nada", () => {
    expect(correr([{ tipo: "llegada", especie: 150, ok: true }]).estado).toEqual(ESTADO_INICIAL);
    const c = correr([{ tipo: "escoger", indice: 1 }, { tipo: "confirmar" }]).estado;
    expect(correr([{ tipo: "llegada", especie: 4, ok: false }], c).estado).toEqual(c);
  });

  it("validarLlegada solo acepta una especie entera y el estado conocido", () => {
    expect(validarLlegada({ especie: 25, ok: true })).toEqual({ especie: 25, ok: true });
    expect(validarLlegada({ especie: 25, ok: false })).toEqual({ especie: 25, ok: false });
    for (const malo of [
      null,
      3,
      "x",
      [],
      {},
      { especie: "25", ok: true },
      { especie: 2.5, ok: true },
      { especie: 0, ok: true },
      { especie: 25 },
      { especie: 25, ok: "si" },
    ])
      expect(validarLlegada(malo), JSON.stringify(malo)).toBeNull();
  });
});

describe("laboratorio: qué especies ya llegaron", () => {
  it("al abrir, las listas son las que main dice y ninguna falló", () => {
    const l = llegadasIniciales([1, 4, 25]);
    expect(estadoEspecie(l, 25)).toBe("lista");
    expect(estadoEspecie(l, 150)).toBe("bajando");
  });

  it("una llegada marca la especie lista (sin tocar las demás); un fallo la marca fallida", () => {
    const l0 = llegadasIniciales([1]);
    const l1 = aplicarLlegada(l0, { especie: 150, ok: true });
    expect(estadoEspecie(l1, 150)).toBe("lista");
    expect(estadoEspecie(l1, 149)).toBe("bajando");
    const l2 = aplicarLlegada(l1, { especie: 149, ok: false });
    expect(estadoEspecie(l2, 149)).toBe("fallo");
    // Un fallo es autoritativo (main lo manda cuando faltan archivos): saca a una lista, también si es una inicial.
    expect(estadoEspecie(aplicarLlegada(l2, { especie: 150, ok: false }), 150)).toBe("fallo");
    expect(estadoEspecie(aplicarLlegada(l2, { especie: 1, ok: false }), 1)).toBe("fallo");
    const inicialFallida = aplicarLlegada(l2, { especie: 1, ok: false });
    expect(estadoEspecie(aplicarLlegada(inicialFallida, { especie: 1, ok: true }), 1)).toBe("lista");
  });

  it("si la fallida llega después (reintento), deja de estar fallida", () => {
    const f = aplicarLlegada(llegadasIniciales([]), { especie: 7, ok: false });
    expect(estadoEspecie(aplicarLlegada(f, { especie: 7, ok: true }), 7)).toBe("lista");
  });

  it("reintentar quita el fallo y vuelve a 'bajando'", () => {
    const f = aplicarLlegada(llegadasIniciales([]), { especie: 7, ok: false });
    expect(estadoEspecie(quitarFallo(f, 7), 7)).toBe("bajando");
  });

  it("si nada cambia devuelve el mismo objeto (no re-dibuja 151 veces sin motivo)", () => {
    const l = llegadasIniciales([1]);
    expect(aplicarLlegada(l, { especie: 1, ok: true })).toBe(l);
    const f = aplicarLlegada(l, { especie: 9, ok: false });
    expect(aplicarLlegada(f, { especie: 9, ok: false })).toBe(f);
    expect(quitarFallo(l, 5)).toBe(l);
  });
});
