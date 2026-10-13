import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { Equipo } from "./equipo";

const datos = {
  nombre: "Pikachu",
  especie: 25,
  voz: "vits-piper-es_MX-claude-high-int8",
  velocidad: 1.1,
  carpeta: "/tmp/proyecto",
};

describe("Equipo", () => {
  it("crea un Pokémon con valores iniciales", () => {
    const equipo = new Equipo(":memory:");
    const p = equipo.crear(datos);
    expect(p).toMatchObject({ ...datos, sessionId: null, apodos: [], tareas: 0 });
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("vacío no tiene activos", () => {
    expect(new Equipo(":memory:").activos()).toEqual([]);
    expect(new Equipo(":memory:").obtener("no-existe")).toBeNull();
  });

  it("guarda sesión, apodos y tareas", () => {
    const equipo = new Equipo(":memory:");
    const { id } = equipo.crear(datos);
    equipo.guardarSesion(id, "sesion-1");
    equipo.guardarApodos(id, ["picachu", "pikacho"]);
    equipo.sumarTarea(id);
    equipo.sumarTarea(id);
    expect(equipo.obtener(id)).toMatchObject({
      sessionId: "sesion-1",
      apodos: ["picachu", "pikacho"],
      tareas: 2,
    });
  });

  it("cambiar de carpeta olvida la sesión, que estaba amarrada a la carpeta anterior", () => {
    const equipo = new Equipo(":memory:");
    const { id } = equipo.crear(datos);
    equipo.guardarSesion(id, "sesion-1");
    equipo.cambiarCarpeta(id, "/tmp/otro");
    expect(equipo.obtener(id)).toMatchObject({ carpeta: "/tmp/otro", sessionId: null });
  });

  it("cambiar de especie cambia el nombre, borra los apodos del nombre viejo y conserva la conversación", () => {
    const equipo = new Equipo(":memory:");
    const { id } = equipo.crear(datos);
    equipo.guardarSesion(id, "sesion-1");
    equipo.guardarApodos(id, ["picachu"]);
    equipo.cambiarEspecie(id, 4, "Charmander", "voz-nueva", 1.05);
    expect(equipo.obtener(id)).toMatchObject({
      especie: 4,
      nombre: "Charmander",
      apodos: [],
      sessionId: "sesion-1",
    });
  });

  it("cambiar de especie guarda la voz y la velocidad nuevas, sin tocar a los demás", () => {
    const equipo = new Equipo(":memory:");
    const { id } = equipo.crear(datos);
    const otro = equipo.crear({ ...datos, nombre: "Squirtle", especie: 7 });
    equipo.cambiarEspecie(id, 4, "Charmander", "voz-nueva", 1.15);
    expect(equipo.obtener(id)).toMatchObject({ especie: 4, voz: "voz-nueva", velocidad: 1.15 });
    expect(equipo.obtener(otro.id)).toMatchObject({ especie: 7, voz: datos.voz, velocidad: datos.velocidad });
  });

  it("renombrar cambia el nombre, borra los apodos del viejo y conserva sesión, especie, voz, tareas e historial", () => {
    const equipo = new Equipo(":memory:");
    const { id } = equipo.crear(datos);
    equipo.guardarSesion(id, "sesion-1");
    equipo.guardarApodos(id, ["picachu"]);
    equipo.sumarTarea(id);
    equipo.registrarTarea({
      pokemonId: id,
      carpeta: "/tmp/proyecto",
      orden: "haz algo",
      inicio: 1,
      fin: 2,
      respuesta: "hecho",
    });
    equipo.renombrar(id, "Rayo");
    expect(equipo.obtener(id)).toMatchObject({
      nombre: "Rayo",
      especie: 25,
      apodos: [],
      sessionId: "sesion-1",
      voz: datos.voz,
      tareas: 1,
    });
    expect(equipo.historial(id)).toHaveLength(1);
  });

  it("renombrar solo toca a ese Pokémon", () => {
    const equipo = new Equipo(":memory:");
    const { id } = equipo.crear(datos);
    const otro = equipo.crear({ ...datos, nombre: "Squirtle", especie: 7 });
    equipo.guardarApodos(otro.id, ["squirrel"]);
    equipo.renombrar(id, "Rayo");
    expect(equipo.obtener(otro.id)).toMatchObject({ nombre: "Squirtle", apodos: ["squirrel"] });
  });

  it("al evolucionar con nombre propio se puede conservar el nombre y sus apodos", () => {
    const equipo = new Equipo(":memory:");
    const { id } = equipo.crear({ ...datos, nombre: "Rayo" });
    equipo.guardarApodos(id, ["rallo"]);
    equipo.cambiarEspecie(id, 26, "Rayo", "voz-nueva", 1, true);
    expect(equipo.obtener(id)).toMatchObject({ especie: 26, nombre: "Rayo", apodos: ["rallo"] });
  });

  it("los datos sobreviven a cerrar y abrir la base", () => {
    const ruta = join(mkdtempSync(join(tmpdir(), "poke-equipo-")), "equipo.sqlite");
    const uno = new Equipo(ruta);
    const { id } = uno.crear(datos);
    uno.guardarSesion(id, "sesion-9");
    uno.cerrar();
    const dos = new Equipo(ruta);
    expect(dos.activos()[0]).toMatchObject({ id, nombre: "Pikachu", sessionId: "sesion-9" });
  });
});

describe("Equipo — activos y guardados", () => {
  it("un Pokémon nuevo nace activo", () => {
    const equipo = new Equipo(":memory:");
    expect(equipo.crear(datos).activo).toBe(true);
    expect(equipo.activos()).toHaveLength(1);
    expect(equipo.todos().filter((p) => !p.activo)).toHaveLength(0);
  });

  it("desactivar lo manda al PC y activar lo saca, conservando la sesión", () => {
    const equipo = new Equipo(":memory:");
    const { id } = equipo.crear(datos);
    equipo.guardarSesion(id, "sesion-1");
    equipo.desactivar(id);
    expect(
      equipo
        .todos()
        .filter((p) => !p.activo)
        .map((p) => p.id),
    ).toEqual([id]);
    expect(equipo.contarActivos()).toBe(0);
    equipo.activar(id);
    expect(equipo.obtener(id)).toMatchObject({ activo: true, sessionId: "sesion-1" });
  });

  it("buscarPorEspecie encuentra al Pokémon de esa especie, activo o guardado", () => {
    const equipo = new Equipo(":memory:");
    const { id } = equipo.crear({ ...datos, nombre: "Charmander", especie: 4 });
    equipo.desactivar(id);
    expect(equipo.buscarPorEspecie(4)?.id).toBe(id);
    expect(equipo.buscarPorEspecie(7)).toBeNull();
  });

  it("el modelo propio nace nulo (el de su tipo), se guarda, se cambia y se vuelve a nulo", () => {
    const equipo = new Equipo(":memory:");
    const a = equipo.crear(datos);
    const b = equipo.crear({ ...datos, especie: 4, nombre: "Charmander" });
    expect(a.modelo).toBeNull();
    expect(equipo.obtener(a.id)?.modelo).toBeNull();
    equipo.guardarModelo(a.id, "haiku");
    expect(equipo.obtener(a.id)?.modelo).toBe("haiku");
    // Solo toca a ese Pokémon.
    expect(equipo.obtener(b.id)?.modelo).toBeNull();
    equipo.guardarModelo(a.id, "opus");
    expect(equipo.obtener(a.id)?.modelo).toBe("opus");
    equipo.guardarModelo(a.id, null);
    expect(equipo.obtener(a.id)?.modelo).toBeNull();
  });

  it("un valor desconocido en la base cuenta como nulo (cae al del tipo); fable se respeta", () => {
    const equipo = new Equipo(":memory:");
    const a = equipo.crear(datos);
    equipo.guardarModelo(a.id, "modelo-raro");
    expect(equipo.obtener(a.id)?.modelo).toBeNull();
    equipo.guardarModelo(a.id, "fable");
    expect(equipo.obtener(a.id)?.modelo).toBe("fable");
  });

  it("cambiar de especie no toca el modelo propio", () => {
    const equipo = new Equipo(":memory:");
    const a = equipo.crear({ ...datos, modelo: "haiku" });
    equipo.cambiarEspecie(a.id, 26, "Raichu", "v", 1);
    expect(equipo.obtener(a.id)?.modelo).toBe("haiku");
  });

  it("crear con modelo propio lo guarda", () => {
    const equipo = new Equipo(":memory:");
    const p = equipo.crear({ ...datos, modelo: "opus" });
    expect(p.modelo).toBe("opus");
    expect(equipo.obtener(p.id)?.modelo).toBe("opus");
  });

  it("migra una base sin columna modelo: no pierde nada, queda nulo y abrirla otra vez no rompe", () => {
    const dir = mkdtempSync(join(tmpdir(), "equipo-"));
    const ruta = join(dir, "equipo.sqlite");
    const vieja = new DatabaseSync(ruta);
    vieja.exec(`CREATE TABLE pokemon (
      id TEXT PRIMARY KEY, nombre TEXT NOT NULL, especie INTEGER NOT NULL, voz TEXT NOT NULL,
      velocidad REAL NOT NULL, carpeta TEXT NOT NULL, session_id TEXT,
      apodos TEXT NOT NULL DEFAULT '[]', tareas INTEGER NOT NULL DEFAULT 0, creado INTEGER NOT NULL,
      activo INTEGER NOT NULL DEFAULT 1, shiny INTEGER NOT NULL DEFAULT 0)`);
    vieja
      .prepare("INSERT INTO pokemon VALUES ('u1','Pikachu',25,'v',1.1,'/p','sesion-vieja','[]',3,1,1,1)")
      .run();
    vieja.close();

    const equipo = new Equipo(ruta);
    expect(equipo.obtener("u1")).toMatchObject({
      nombre: "Pikachu",
      sessionId: "sesion-vieja",
      tareas: 3,
      shiny: true,
      modelo: null,
    });
    equipo.guardarModelo("u1", "haiku");
    equipo.cerrar();
    const otra = new Equipo(ruta);
    expect(otra.obtener("u1")?.modelo).toBe("haiku");
    otra.cerrar();
  });

  it("migra una base vieja sin columna activo: la fila existente queda activa y conserva sus datos", () => {
    const dir = mkdtempSync(join(tmpdir(), "equipo-"));
    const ruta = join(dir, "equipo.sqlite");
    const vieja = new DatabaseSync(ruta);
    vieja.exec(`CREATE TABLE pokemon (
      id TEXT PRIMARY KEY, nombre TEXT NOT NULL, especie INTEGER NOT NULL, voz TEXT NOT NULL,
      velocidad REAL NOT NULL, carpeta TEXT NOT NULL, session_id TEXT,
      apodos TEXT NOT NULL DEFAULT '[]', tareas INTEGER NOT NULL DEFAULT 0, creado INTEGER NOT NULL)`);
    vieja
      .prepare("INSERT INTO pokemon VALUES ('u1','Pikachu',25,'v',1.1,'/p','sesion-vieja','[]',0,1)")
      .run();
    vieja.close();

    const equipo = new Equipo(ruta);
    expect(equipo.activos()[0]).toMatchObject({
      id: "u1",
      nombre: "Pikachu",
      voz: "v",
      sessionId: "sesion-vieja",
      activo: true,
    });
    equipo.cerrar();

    // Abrir de nuevo no vuelve a migrar ni pierde datos.
    const otra = new Equipo(ruta);
    expect(otra.activos()[0]).toMatchObject({
      id: "u1",
      nombre: "Pikachu",
      sessionId: "sesion-vieja",
      activo: true,
    });
    otra.cerrar();
    expect(existsSync(ruta)).toBe(true);
  });

  it("migra una base vieja con varias filas: solo queda activo el más antiguo, que es el que hoy sale en pantalla", () => {
    const dir = mkdtempSync(join(tmpdir(), "equipo-"));
    const ruta = join(dir, "equipo.sqlite");
    const vieja = new DatabaseSync(ruta);
    vieja.exec(`CREATE TABLE pokemon (
      id TEXT PRIMARY KEY, nombre TEXT NOT NULL, especie INTEGER NOT NULL, voz TEXT NOT NULL,
      velocidad REAL NOT NULL, carpeta TEXT NOT NULL, session_id TEXT,
      apodos TEXT NOT NULL DEFAULT '[]', tareas INTEGER NOT NULL DEFAULT 0, creado INTEGER NOT NULL)`);
    vieja.prepare("INSERT INTO pokemon VALUES ('u2','Charmander',4,'v',1,'/p',NULL,'[]',0,2)").run();
    vieja.prepare("INSERT INTO pokemon VALUES ('u1','Pikachu',25,'v',1,'/p',NULL,'[]',0,1)").run();
    vieja.close();

    const equipo = new Equipo(ruta);
    expect(equipo.activos().map((p) => p.id)).toEqual(["u1"]);
    expect(
      equipo
        .todos()
        .filter((p) => !p.activo)
        .map((p) => p.id),
    ).toEqual(["u2"]);
    equipo.cerrar();
  });
});

describe("Equipo: historial", () => {
  it("devuelve los últimos intercambios de ese Pokémon, del más reciente al más viejo", () => {
    const equipo = new Equipo(":memory:");
    const p = equipo.crear({ nombre: "Pikachu", especie: 25, voz: "v", velocidad: 1, carpeta: "/x" });
    const otro = equipo.crear({ nombre: "Eevee", especie: 133, voz: "v", velocidad: 1, carpeta: "/x" });
    equipo.registrarTarea({
      pokemonId: p.id,
      carpeta: "/x",
      orden: "uno",
      inicio: 1,
      fin: 10,
      respuesta: "R1",
    });
    equipo.registrarTarea({
      pokemonId: p.id,
      carpeta: "/x",
      orden: "dos",
      inicio: 11,
      fin: 20,
      respuesta: "R2",
    });
    equipo.registrarTarea({ pokemonId: otro.id, carpeta: "/x", orden: "ajena", inicio: 1, fin: 30 });
    expect(equipo.historial(p.id)).toEqual([
      { orden: "dos", respuesta: "R2", fin: 20 },
      { orden: "uno", respuesta: "R1", fin: 10 },
    ]);
    expect(equipo.historial(p.id, 1)).toHaveLength(1);
    expect(equipo.historial(otro.id)).toEqual([{ orden: "ajena", respuesta: "", fin: 30 }]);
  });
});

describe("Equipo: Pokédex, shiny y medallas", () => {
  it("guarda tareas, medallas y shiny, y los devuelve en la ficha de cada Pokémon", () => {
    const equipo = new Equipo(":memory:");
    const p = equipo.crear({ nombre: "Pikachu", especie: 25, voz: "v", velocidad: 1, carpeta: "/x/acme" });
    expect(equipo.obtener(p.id)).toMatchObject({ shiny: false, medallas: 0 });
    equipo.sumarTarea(p.id);
    equipo.registrarTarea({ pokemonId: p.id, carpeta: "/x/acme", orden: "uno", inicio: 1000, fin: 61_000 });
    equipo.registrarTarea({
      pokemonId: p.id,
      carpeta: "/x/acme",
      orden: "dos",
      inicio: 70_000,
      fin: 190_000,
    });
    equipo.darMedalla(p.id, "Acme en producción", 200_000);
    equipo.marcarShiny(p.id);
    expect(equipo.obtener(p.id)).toMatchObject({ shiny: true, medallas: 1 });
    expect(equipo.todos()[0]).toMatchObject({ shiny: true, medallas: 1 });
    expect(equipo.pokedex()).toEqual([
      {
        nombre: "Pikachu",
        especie: 25,
        shiny: true,
        tareas: 1,
        ms: 180_000,
        medallas: ["Acme en producción"],
        ultimas: [
          { orden: "dos", carpeta: "/x/acme", fin: 190_000 },
          { orden: "uno", carpeta: "/x/acme", fin: 61_000 },
        ],
      },
    ]);
  });
});
