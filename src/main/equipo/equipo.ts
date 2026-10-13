import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { leerModelo } from "@compartido/modelos";
import type { Intercambio, Pokemon } from "@compartido/tipos";
import type { FichaPokedex } from "../pokemon/pokedex";

export type DatosNuevos = Pick<Pokemon, "nombre" | "especie" | "voz" | "velocidad" | "carpeta" | "modelo">;

interface Fila {
  id: string;
  nombre: string;
  especie: number;
  voz: string;
  velocidad: number;
  carpeta: string;
  session_id: string | null;
  apodos: string;
  tareas: number;
  activo: number;
  shiny?: number;
  medallas?: number;
  modelo?: string | null;
}

const aPokemon = (f: Fila): Pokemon => ({
  id: f.id,
  nombre: f.nombre,
  especie: f.especie,
  voz: f.voz,
  velocidad: f.velocidad,
  carpeta: f.carpeta,
  sessionId: f.session_id,
  apodos: JSON.parse(f.apodos) as string[],
  tareas: f.tareas,
  activo: f.activo === 1,
  shiny: f.shiny === 1,
  medallas: f.medallas ?? 0,
  modelo: leerModelo(f.modelo),
});

export class Equipo {
  private db: DatabaseSync;

  constructor(ruta: string) {
    this.db = new DatabaseSync(ruta);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pokemon (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        especie INTEGER NOT NULL,
        voz TEXT NOT NULL,
        velocidad REAL NOT NULL,
        carpeta TEXT NOT NULL,
        session_id TEXT,
        apodos TEXT NOT NULL DEFAULT '[]',
        tareas INTEGER NOT NULL DEFAULT 0,
        creado INTEGER NOT NULL,
        activo INTEGER NOT NULL DEFAULT 1
      )
    `);
    this.migrar();
    this.migrarJuego();
  }

  /** Etapa 3: shiny por Pokémon, el historial de tareas (la Pokédex) y las medallas. */
  private migrarJuego(): void {
    const columnas = this.db.prepare("PRAGMA table_info(pokemon)").all() as { name: string }[];
    if (!columnas.some((c) => c.name === "shiny")) {
      this.db.exec("ALTER TABLE pokemon ADD COLUMN shiny INTEGER NOT NULL DEFAULT 0");
    }
    // Modelo propio: nulo = el de su tipo (config/tipos.json). Las bases anteriores quedan con nulo, sin perder nada.
    if (!columnas.some((c) => c.name === "modelo")) {
      this.db.exec("ALTER TABLE pokemon ADD COLUMN modelo TEXT");
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tarea (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pokemon_id TEXT NOT NULL,
        carpeta TEXT NOT NULL,
        orden TEXT NOT NULL,
        inicio INTEGER NOT NULL,
        fin INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS medalla (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pokemon_id TEXT NOT NULL,
        texto TEXT NOT NULL,
        cuando INTEGER NOT NULL
      );
    `);
    const deTarea = this.db.prepare("PRAGMA table_info(tarea)").all() as { name: string }[];
    if (!deTarea.some((c) => c.name === "respuesta")) {
      this.db.exec("ALTER TABLE tarea ADD COLUMN respuesta TEXT NOT NULL DEFAULT ''");
    }
  }

  /** Bases anteriores a `activo`: la columna nace con 1 y, como la app mostraba solo el primero, los demás pasan al PC. */
  private migrar(): void {
    const columnas = this.db.prepare("PRAGMA table_info(pokemon)").all() as { name: string }[];
    if (columnas.some((c) => c.name === "activo")) return;
    this.db.exec("BEGIN");
    try {
      this.db.exec("ALTER TABLE pokemon ADD COLUMN activo INTEGER NOT NULL DEFAULT 1");
      this.db.exec(
        "UPDATE pokemon SET activo = 0 WHERE id <> (SELECT id FROM pokemon ORDER BY creado LIMIT 1)",
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private filas(where: string, ...params: (string | number)[]): Pokemon[] {
    return (
      this.db
        .prepare(
          `SELECT pokemon.*, (SELECT COUNT(*) FROM medalla WHERE pokemon_id = pokemon.id) AS medallas FROM pokemon ${where} ORDER BY creado`,
        )
        .all(...params) as unknown as Fila[]
    ).map(aPokemon);
  }

  todos(): Pokemon[] {
    return this.filas("");
  }

  activos(): Pokemon[] {
    return this.filas("WHERE activo = 1");
  }

  contarActivos(): number {
    const f = this.db.prepare("SELECT COUNT(*) AS n FROM pokemon WHERE activo = 1").get() as { n: number };
    return f.n;
  }

  buscarPorEspecie(especie: number): Pokemon | null {
    return this.filas("WHERE especie = ?", especie)[0] ?? null;
  }

  activar(id: string): void {
    this.db.prepare("UPDATE pokemon SET activo = 1 WHERE id = ?").run(id);
  }

  desactivar(id: string): void {
    this.db.prepare("UPDATE pokemon SET activo = 0 WHERE id = ?").run(id);
  }

  crear(d: DatosNuevos): Pokemon {
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO pokemon (id, nombre, especie, voz, velocidad, carpeta, creado, activo, modelo) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)",
      )
      .run(id, d.nombre, d.especie, d.voz, d.velocidad, d.carpeta, Date.now(), d.modelo ?? null);
    return { id, ...d, modelo: leerModelo(d.modelo), sessionId: null, apodos: [], tareas: 0, activo: true };
  }

  obtener(id: string): Pokemon | null {
    return this.filas("WHERE id = ?", id)[0] ?? null;
  }

  guardarSesion(id: string, sessionId: string | null): void {
    this.db.prepare("UPDATE pokemon SET session_id = ? WHERE id = ?").run(sessionId, id);
  }

  /** Su modelo propio; null = vuelve al de su tipo. */
  guardarModelo(id: string, modelo: string | null): void {
    this.db.prepare("UPDATE pokemon SET modelo = ? WHERE id = ?").run(modelo, id);
  }

  guardarApodos(id: string, apodos: string[]): void {
    this.db.prepare("UPDATE pokemon SET apodos = ? WHERE id = ?").run(JSON.stringify(apodos), id);
  }

  sumarTarea(id: string): void {
    this.db.prepare("UPDATE pokemon SET tareas = tareas + 1 WHERE id = ?").run(id);
  }

  cambiarCarpeta(id: string, carpeta: string): void {
    this.db.prepare("UPDATE pokemon SET carpeta = ?, session_id = NULL WHERE id = ?").run(carpeta, id);
  }

  /**
   * Otra especie con su nombre y su voz; los apodos eran del nombre viejo y se borran. La conversación sigue.
   * `conservarApodos`: la evolución de uno con nombre propio (el mismo nombre sigue valiendo, con lo que ya se aprendió).
   */
  cambiarEspecie(
    id: string,
    especie: number,
    nombre: string,
    voz: string,
    velocidad: number,
    conservarApodos = false,
  ): void {
    const apodos = conservarApodos ? "apodos" : "'[]'";
    this.db
      .prepare(
        `UPDATE pokemon SET especie = ?, nombre = ?, apodos = ${apodos}, voz = ?, velocidad = ? WHERE id = ?`,
      )
      .run(especie, nombre, voz, velocidad, id);
  }

  /** Le pone otro nombre propio: los apodos eran del nombre viejo y se borran; sesión, historial y voz siguen. */
  renombrar(id: string, nombre: string): void {
    this.db.prepare("UPDATE pokemon SET nombre = ?, apodos = '[]' WHERE id = ?").run(nombre, id);
  }

  /** Una tarea terminada entra a la Pokédex. */
  registrarTarea(t: {
    pokemonId: string;
    carpeta: string;
    orden: string;
    inicio: number;
    fin: number;
    /** Lo que respondió: con ella el intercambio se puede volver a leer en el historial. */
    respuesta?: string;
  }): void {
    this.db
      .prepare(
        "INSERT INTO tarea (pokemon_id, carpeta, orden, inicio, fin, respuesta) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(t.pokemonId, t.carpeta, t.orden, t.inicio, t.fin, t.respuesta ?? "");
  }

  /** Los últimos intercambios de un Pokémon, del más reciente al más viejo. */
  historial(pokemonId: string, cuantos = 12): Intercambio[] {
    return this.db
      .prepare(
        "SELECT orden, respuesta, fin FROM tarea WHERE pokemon_id = ? ORDER BY fin DESC, id DESC LIMIT ?",
      )
      .all(pokemonId, cuantos) as unknown as Intercambio[];
  }

  marcarShiny(id: string): void {
    this.db.prepare("UPDATE pokemon SET shiny = 1 WHERE id = ?").run(id);
  }

  darMedalla(id: string, texto: string, cuando: number): void {
    this.db
      .prepare("INSERT INTO medalla (pokemon_id, texto, cuando) VALUES (?, ?, ?)")
      .run(id, texto, cuando);
  }

  /** Una ficha por Pokémon (en pantalla o en el PC), con sus tres últimas tareas y sus medallas. */
  pokedex(): FichaPokedex[] {
    return this.todos().map((p) => {
      const total = this.db
        .prepare("SELECT COALESCE(SUM(fin - inicio), 0) AS ms FROM tarea WHERE pokemon_id = ?")
        .get(p.id) as { ms: number };
      const ultimas = this.db
        .prepare(
          "SELECT orden, carpeta, fin FROM tarea WHERE pokemon_id = ? ORDER BY fin DESC, id DESC LIMIT 3",
        )
        .all(p.id) as unknown as { orden: string; carpeta: string; fin: number }[];
      const medallas = this.db
        .prepare("SELECT texto FROM medalla WHERE pokemon_id = ? ORDER BY cuando DESC, id DESC")
        .all(p.id) as unknown as { texto: string }[];
      return {
        nombre: p.nombre,
        especie: p.especie,
        shiny: p.shiny === true,
        tareas: p.tareas,
        ms: total.ms,
        medallas: medallas.map((m) => m.texto),
        ultimas,
      };
    });
  }

  cerrar(): void {
    this.db.close();
  }
}
