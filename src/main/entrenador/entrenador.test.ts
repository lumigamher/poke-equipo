import { readFileSync } from "node:fs";
import { join } from "node:path";
import { esPalabraDeMando, validarNombre } from "@compartido/nombre";
import { describe, expect, it } from "vitest";
import { leerLlamada } from "../pokemon/llamada";
import { afinar, type Contexto, decidir, palabrasDeMando, palabrasReservadas } from "./entrenador";

const base: Contexto = {
  candidatos: [{ id: "p1", nombre: "Pikachu", apodos: ["picachu"] }],
  permisosDe: [],
  borradoresDe: [],
  escuchandoA: null,
  altaDe: null,
};
const con = (extra: Partial<Contexto>): Contexto => ({ ...base, ...extra });

describe("decidir", () => {
  it("nombre más orden es una orden", () => {
    expect(decidir("Pikachu, revisa el deploy.", base)).toEqual({
      tipo: "orden",
      id: "p1",
      texto: "revisa el deploy.",
    });
  });

  it("solo el nombre pide atención", () => {
    expect(decidir("Pikachu.", base)).toEqual({ tipo: "atencion", id: "p1" });
  });

  it("sin nombre y sin nadie escuchando, se ignora", () => {
    expect(decidir("Revisa el deploy.", base)).toEqual({ tipo: "ignorar" });
  });

  it("sin nombre pero con un Pokémon escuchando, es una orden para él", () => {
    expect(decidir("Y corre los tests.", con({ escuchandoA: "p1" }))).toEqual({
      tipo: "orden",
      id: "p1",
      texto: "Y corre los tests.",
    });
  });

  it("con permiso pendiente, sí y no lo resuelven", () => {
    expect(decidir("Sí.", con({ permisosDe: [{ id: "p1", permisoId: "perm" }] }))).toEqual({
      tipo: "permiso",
      id: "p1",
      permisoId: "perm",
      permitir: true,
    });
    expect(decidir("Dale, hazlo.", con({ permisosDe: [{ id: "p1", permisoId: "perm" }] }))).toEqual({
      tipo: "permiso",
      id: "p1",
      permisoId: "perm",
      permitir: true,
    });
    expect(decidir("No.", con({ permisosDe: [{ id: "p1", permisoId: "perm" }] }))).toEqual({
      tipo: "permiso",
      id: "p1",
      permisoId: "perm",
      permitir: false,
    });
    expect(decidir("Pikachu, sí.", con({ permisosDe: [{ id: "p1", permisoId: "perm" }] }))).toEqual({
      tipo: "permiso",
      id: "p1",
      permisoId: "perm",
      permitir: true,
    });
  });

  it("muletillas como claro o listo no aprueban ni niegan un permiso", () => {
    expect(decidir("Claro.", con({ permisosDe: [{ id: "p1", permisoId: "perm" }] }))).toEqual({
      tipo: "ignorar",
    });
    expect(decidir("Listo.", con({ permisosDe: [{ id: "p1", permisoId: "perm" }] }))).toEqual({
      tipo: "ignorar",
    });
  });

  describe("respuesta a un permiso: todas las palabras deben ser de respuesta", () => {
    const pend = con({ permisosDe: [{ id: "p1", permisoId: "perm" }] });
    const ninguna = { tipo: "ignorar" } as const;
    it.each([
      "Sí, pero espera",
      "Si quieres",
      "Si eso funciona",
      "Dale tiempo",
      "Si no",
      "para mañana",
      "para eso no",
    ])("%s no decide nada", (frase) => {
      expect(decidir(frase, pend)).toEqual(ninguna);
    });
    it.each(["Sí", "Sí, por favor", "Dale, hazlo", "Sí, dale", "Ya, hazlo"])("%s aprueba", (frase) => {
      expect(decidir(frase, pend)).toEqual({ tipo: "permiso", id: "p1", permisoId: "perm", permitir: true });
    });
    it.each(["No", "No, gracias", "No, eso no", "Para", "Detente ya"])("%s niega", (frase) => {
      expect(decidir(frase, pend)).toEqual({ tipo: "permiso", id: "p1", permisoId: "perm", permitir: false });
    });
    it("con el nombre delante, solo una respuesta pura cuenta", () => {
      expect(decidir("Pikachu, sí", pend)).toEqual({
        tipo: "permiso",
        id: "p1",
        permisoId: "perm",
        permitir: true,
      });
      expect(decidir("Pikachu, sí pero espera", pend)).toEqual({
        tipo: "orden",
        id: "p1",
        texto: "sí pero espera",
      });
    });
  });

  // Review Focus 2
  it("sin permiso pendiente, un sí suelto no hace nada", () => {
    expect(decidir("Sí.", base)).toEqual({ tipo: "ignorar" });
    expect(decidir("No.", base)).toEqual({ tipo: "ignorar" });
  });

  it("un sí dentro de una frase larga no aprueba el permiso", () => {
    expect(
      decidir(
        "Sí, pero primero revisa qué archivos toca.",
        con({ permisosDe: [{ id: "p1", permisoId: "perm" }] }),
      ),
    ).toEqual({
      tipo: "ignorar",
    });
    expect(
      decidir("No sé si eso está bien, la verdad.", con({ permisosDe: [{ id: "p1", permisoId: "perm" }] })),
    ).toEqual({
      tipo: "ignorar",
    });
  });

  it("con borrador a la vista, cancela lo descarta", () => {
    expect(decidir("Cancela.", con({ borradoresDe: ["p1"] }))).toEqual({ tipo: "cancelar", id: "p1" });
    expect(decidir("Pikachu, cancela eso.", con({ borradoresDe: ["p1"] }))).toEqual({
      tipo: "cancelar",
      id: "p1",
    });
  });

  it("sin borrador, cancela dicho con nombre es una orden normal", () => {
    expect(decidir("Pikachu, cancela eso.", base)).toEqual({
      tipo: "orden",
      id: "p1",
      texto: "cancela eso.",
    });
  });

  it("durante el alta todo lo oído va a aprender apodos", () => {
    expect(decidir("Picachú.", con({ altaDe: "p1" }))).toEqual({ tipo: "alta", id: "p1", texto: "Picachú." });
  });
});

describe("afinar", () => {
  const orden = { tipo: "orden", id: "p1", texto: "corre usted." } as const;

  it("reemplaza el texto de la orden por el preciso, sin el nombre", () => {
    expect(afinar(orden, "Pikachu, corre los tests.", base)).toEqual({
      tipo: "orden",
      id: "p1",
      texto: "corre los tests.",
    });
  });

  it("acepta apodos sobre el texto preciso", () => {
    expect(afinar(orden, "Picachu, corre los tests.", base)).toEqual({
      tipo: "orden",
      id: "p1",
      texto: "corre los tests.",
    });
  });

  it("si el preciso no trae el nombre reconocible, manda el texto preciso completo", () => {
    expect(afinar(orden, "Y corre los tests.", base)).toEqual({
      tipo: "orden",
      id: "p1",
      texto: "Y corre los tests.",
    });
  });

  it("si el preciso sale vacío, conserva la orden rápida", () => {
    expect(afinar(orden, "  ", base)).toEqual(orden);
  });

  it("una atención sigue siendo atención si el preciso tampoco trae orden", () => {
    expect(afinar({ tipo: "atencion", id: "p1" }, "Pikachu.", base)).toEqual({ tipo: "atencion", id: "p1" });
  });

  it("una atención se vuelve orden si el preciso sí oyó la orden", () => {
    expect(afinar({ tipo: "atencion", id: "p1" }, "Pikachu, hola.", base)).toEqual({
      tipo: "orden",
      id: "p1",
      texto: "hola.",
    });
  });

  it("no toca las demás decisiones", () => {
    const permiso = { tipo: "permiso", id: "p1", permisoId: "perm", permitir: true } as const;
    expect(afinar(permiso, "lo que sea", base)).toBe(permiso);
  });
});

describe("decidir: continuar un borrador", () => {
  it("una frase sin nombre con un borrador a la vista continúa ese borrador", () => {
    expect(decidir("de acme y corre los tests", con({ borradoresDe: ["p1"], escuchandoA: "p1" }))).toEqual({
      tipo: "continuar",
      id: "p1",
      texto: "de acme y corre los tests",
    });
  });

  it("con un borrador a la vista y sin nadie escuchando también continúa", () => {
    expect(decidir("y los tests", con({ borradoresDe: ["p1"] }))).toMatchObject({
      tipo: "continuar",
      id: "p1",
    });
  });

  it("si trae el nombre, sigue siendo una orden nueva o una atención", () => {
    expect(decidir("Pikachu, otra cosa", con({ borradoresDe: ["p1"] }))).toEqual({
      tipo: "orden",
      id: "p1",
      texto: "otra cosa",
    });
    expect(decidir("Pikachu", con({ borradoresDe: ["p1"] }))).toEqual({ tipo: "atencion", id: "p1" });
  });

  it("cancelar sigue cancelando el borrador, no se pega a él", () => {
    expect(decidir("cancela", con({ borradoresDe: ["p1"] }))).toEqual({ tipo: "cancelar", id: "p1" });
  });

  it("con un permiso a la vista nunca devuelve continuar", () => {
    for (const frase of ["de acme y corre los tests", "dale", "Pikachu dale", "no", "hola"]) {
      const d = decidir(
        frase,
        con({ permisosDe: [{ id: "p1", permisoId: "perm" }], borradoresDe: ["p1"], escuchandoA: "p1" }),
      );
      expect(d.tipo).not.toBe("continuar");
    }
    expect(
      decidir("de acme", con({ permisosDe: [{ id: "p1", permisoId: "perm" }], borradoresDe: ["p1"] })),
    ).toEqual({ tipo: "ignorar" });
  });

  it("afinar deja continuar tal cual", () => {
    const previa = { tipo: "continuar", id: "p1", texto: "x" } as const;
    expect(afinar(previa, "Pikachu otra", base)).toBe(previa);
  });
});

const pika = { id: "p", nombre: "Pikachu", apodos: [] };
const char = { id: "c", nombre: "Charmander", apodos: [] };
const baseEquipo: Contexto = {
  candidatos: [pika, char],
  permisosDe: [],
  borradoresDe: [],
  escuchandoA: null,
  altaDe: null,
};

describe("decidir con varios Pokémon", () => {
  it("enruta la orden al Pokémon nombrado al principio", () => {
    expect(decidir("Charmander, revisa los tests", baseEquipo)).toEqual({
      tipo: "orden",
      id: "c",
      texto: "revisa los tests",
    });
  });

  it("un nombre en medio de la frase no activa a nadie", () => {
    expect(decidir("ayer vi a Charmander en la tele", baseEquipo)).toEqual({ tipo: "ignorar" });
  });

  it("una palabra parecida corta no despierta a Pikachu", () => {
    expect(decidir("pica el tomate en cubitos", baseEquipo)).toEqual({ tipo: "ignorar" });
  });

  it("un 'sí' sin nombre sin permiso pendiente no aprueba nada", () => {
    expect(decidir("sí", baseEquipo)).toEqual({ tipo: "ignorar" });
  });

  it("un 'sí' sin nombre con DOS permisos a la vista no aprueba ninguno", () => {
    const ctx = {
      ...baseEquipo,
      permisosDe: [
        { id: "p", permisoId: "x1" },
        { id: "c", permisoId: "x2" },
      ],
    };
    expect(decidir("sí", ctx)).toEqual({ tipo: "ignorar" });
    expect(decidir("no", ctx)).toEqual({ tipo: "ignorar" });
  });

  it("con dos permisos, el 'sí' nombrado aprueba solo el de ese Pokémon", () => {
    const ctx = {
      ...baseEquipo,
      permisosDe: [
        { id: "p", permisoId: "x1" },
        { id: "c", permisoId: "x2" },
      ],
    };
    expect(decidir("Charmander sí", ctx)).toEqual({
      tipo: "permiso",
      id: "c",
      permisoId: "x2",
      permitir: true,
    });
  });

  it("un 'sí' sin nombre con UN permiso a la vista aprueba ese permiso", () => {
    const ctx = { ...baseEquipo, permisosDe: [{ id: "p", permisoId: "x1" }] };
    expect(decidir("sí", ctx)).toEqual({ tipo: "permiso", id: "p", permisoId: "x1", permitir: true });
  });

  it("un 'sí' nombrado de un Pokémon sin permiso no aprueba el de otro", () => {
    const ctx = { ...baseEquipo, permisosDe: [{ id: "p", permisoId: "x1" }] };
    expect(decidir("Charmander sí", ctx)).toEqual({
      tipo: "orden",
      id: "c",
      texto: "sí",
    });
  });

  it("'sí, pero primero revisa' no aprueba aunque haya permiso", () => {
    const ctx = { ...baseEquipo, permisosDe: [{ id: "p", permisoId: "x1" }] };
    expect(decidir("sí, pero primero revisa", ctx).tipo).not.toBe("permiso");
  });

  it("sin nombre solo vale justo después de llamarlo (escuchandoA)", () => {
    expect(decidir("revisa el deploy", { ...baseEquipo, escuchandoA: "c" })).toEqual({
      tipo: "orden",
      id: "c",
      texto: "revisa el deploy",
    });
    expect(decidir("revisa el deploy", baseEquipo)).toEqual({ tipo: "ignorar" });
  });

  it("'cancela' sin nombre cancela el único borrador abierto", () => {
    const ctx = { ...baseEquipo, borradoresDe: ["p"] };
    expect(decidir("cancela", ctx)).toEqual({ tipo: "cancelar", id: "p" });
  });

  it("con dos borradores, 'cancela' sin nombre no cancela ninguno y con nombre solo el suyo", () => {
    const ctx = { ...baseEquipo, borradoresDe: ["p", "c"] };
    expect(decidir("cancela", ctx)).toEqual({ tipo: "ignorar" });
    expect(decidir("Charmander, cancela", ctx)).toEqual({ tipo: "cancelar", id: "c" });
  });

  it("con dos borradores, un texto sin nombre no se pega a ninguno", () => {
    const ctx = { ...baseEquipo, borradoresDe: ["p", "c"] };
    expect(decidir("y también la otra parte", ctx)).toEqual({ tipo: "ignorar" });
  });

  it("con un borrador, la continuación sin nombre se pega a ese borrador", () => {
    const ctx = { ...baseEquipo, borradoresDe: ["c"] };
    expect(decidir("y luego sube los cambios", ctx)).toEqual({
      tipo: "continuar",
      id: "c",
      texto: "y luego sube los cambios",
    });
  });

  it("con el borrador de Pikachu y Charmander recién llamado, la frase sin nombre va a Charmander", () => {
    const ctx = { ...baseEquipo, borradoresDe: ["p"], escuchandoA: "c" };
    expect(decidir("corre los tests", ctx)).toEqual({ tipo: "orden", id: "c", texto: "corre los tests" });
  });

  it("con el permiso de Pikachu a la vista, la continuación sin nombre se pega al borrador de Charmander", () => {
    const permiso = [{ id: "p", permisoId: "x1" }];
    for (const escuchandoA of [null, "c"]) {
      const ctx = { ...baseEquipo, borradoresDe: ["c"], permisosDe: permiso, escuchandoA };
      expect(decidir("…de pruebas feature-x", ctx)).toEqual({
        tipo: "continuar",
        id: "c",
        texto: "…de pruebas feature-x",
      });
    }
  });

  it("con el permiso de Pikachu y el borrador de Charmander, la continuación nunca abre un camino a aprobar", () => {
    const ctx = {
      ...baseEquipo,
      borradoresDe: ["c"],
      permisosDe: [{ id: "p", permisoId: "x1" }],
      escuchandoA: "c",
    };
    // Un "sí" o "no" corto sigue entrando antes por la rama del permiso (y lo filtra después la guardia).
    expect(decidir("sí", ctx)).toEqual({ tipo: "permiso", id: "p", permisoId: "x1", permitir: true });
    expect(decidir("no", ctx)).toEqual({ tipo: "permiso", id: "p", permisoId: "x1", permitir: false });
    // Lo demás se pega al borrador de Charmander: nunca es una respuesta al permiso de Pikachu.
    for (const frase of ["sí, pero espera", "si quieres", "dale con los tests", "de pruebas feature-x"]) {
      const d = decidir(frase, ctx);
      expect(d).toEqual({ tipo: "continuar", id: "c", texto: frase });
    }
    // Con dos permisos, un "sí" o "no" sin nombre no aprueba ni niega nada, ni se pega al borrador como orden.
    const dos = { ...ctx, permisosDe: [...ctx.permisosDe, { id: "x", permisoId: "x2" }] };
    expect(decidir("sí", dos)).toEqual({ tipo: "ignorar" });
    expect(decidir("no", dos)).toEqual({ tipo: "ignorar" });
    // El dueño del borrador con su propio permiso a la vista sigue sin continuar.
    const propio = { ...ctx, permisosDe: [{ id: "c", permisoId: "x3" }] };
    expect(decidir("de pruebas feature-x", propio).tipo).not.toBe("continuar");
  });

  it("con un permiso a la vista de otro, el recién llamado no recibe frases sin nombre", () => {
    const ctx = { ...baseEquipo, escuchandoA: "c", permisosDe: [{ id: "p", permisoId: "x1" }] };
    expect(decidir("revisa el deploy", ctx)).toEqual({ tipo: "ignorar" });
  });

  it("con dos permisos, 'Charmander, no' niega solo el de Charmander", () => {
    const ctx = {
      ...baseEquipo,
      permisosDe: [
        { id: "p", permisoId: "x1" },
        { id: "c", permisoId: "x2" },
      ],
    };
    expect(decidir("Charmander, no", ctx)).toEqual({
      tipo: "permiso",
      id: "c",
      permisoId: "x2",
      permitir: false,
    });
  });

  it("el alta de voz tiene prioridad sobre todo", () => {
    expect(decidir("Pikachu", { ...baseEquipo, altaDe: "p" })).toEqual({
      tipo: "alta",
      id: "p",
      texto: "Pikachu",
    });
  });
});

describe("decidir: llamar y guardar", () => {
  it("'Pikachu, llama a Charmander para…' es una llamada de Pikachu", () => {
    expect(decidir("Pikachu, llama a Charmander para que revise los tests", baseEquipo)).toEqual({
      tipo: "llamar",
      id: "p",
      nombreEspecie: "charmander",
      encargo: "que revise los tests",
    });
  });

  it("el encargo llega tal como se dijo: rutas, mayúsculas y puntuación", () => {
    expect(
      decidir("Pikachu, llama a Charmander para revise src/main/Index.ts, por favor", baseEquipo),
    ).toEqual({
      tipo: "llamar",
      id: "p",
      nombreEspecie: "charmander",
      encargo: "revise src/main/Index.ts, por favor",
    });
  });

  it("'Charmander, vuelve' guarda a Charmander", () => {
    expect(decidir("Charmander, vuelve", baseEquipo)).toEqual({ tipo: "guardar", id: "c" });
    expect(decidir("Charmander, vete.", baseEquipo)).toEqual({ tipo: "guardar", id: "c" });
  });

  it("'vuelve a correr los tests' es una orden, no un guardado", () => {
    expect(decidir("Charmander, vuelve a correr los tests", baseEquipo)).toEqual({
      tipo: "orden",
      id: "c",
      texto: "vuelve a correr los tests",
    });
  });

  it("frases reales de la persona, tal como las escribió el transcriptor rápido", () => {
    expect(decidir("Okay, Pikachu ya más cuarto.", baseEquipo)).toEqual({
      tipo: "llamar",
      id: "p",
      nombreEspecie: "cuarto",
      encargo: "",
    });
    expect(decidir("Necesito que llames a Square.", { ...baseEquipo, escuchandoA: "c" })).toEqual({
      tipo: "llamar",
      id: "c",
      nombreEspecie: "square",
      encargo: "",
    });
  });

  it("tras llamar a alguien sin orden, 'llama a X' sin nombre también llama", () => {
    expect(decidir("llama a Squirtle", { ...baseEquipo, escuchandoA: "p" })).toEqual({
      tipo: "llamar",
      id: "p",
      nombreEspecie: "squirtle",
      encargo: "",
    });
  });

  it("sin nombre y sin nadie escuchando, 'llama a X' se ignora", () => {
    expect(decidir("llama a Squirtle", baseEquipo)).toEqual({ tipo: "ignorar" });
  });

  it("el nombre fuera de las dos primeras palabras no activa la llamada", () => {
    expect(decidir("oye tú Pikachu, llama a Squirtle", baseEquipo)).toEqual({ tipo: "ignorar" });
  });

  it("afinar rehace una orden como llamada con el texto preciso", () => {
    const previa = { tipo: "orden", id: "p", texto: "llama a charmanda" } as const;
    expect(afinar(previa, "Llama a Charmander para que mire el Log.", baseEquipo)).toEqual({
      tipo: "llamar",
      id: "p",
      nombreEspecie: "charmander",
      encargo: "que mire el Log.",
    });
  });
});

describe("palabrasReservadas: lo que un nombre no puede ser", () => {
  const reservadas = palabrasReservadas(["Acme", "pull request"], ["Impactrueno", "Golpe certero"]);
  const esReservada = (n: string) => !validarNombre(n, { reservadas, especies: [], otros: [] }).ok;

  it("cubre cada palabra con la que se responde a un permiso, se cancela o se niega", () => {
    for (const p of [
      "si",
      "dale",
      "hazlo",
      "hagale",
      "apruebo",
      "aprobado",
      "no",
      "niega",
      "negado",
      "para",
      "detente",
      "cancela",
      "cancelar",
      "cancelalo",
      "olvidalo",
      "olvida",
      "por",
      "favor",
      "pues",
      "ya",
      "eso",
      "gracias",
    ])
      expect(esReservada(p), p).toBe(true);
  });

  it("cubre guardar, llamar, usar un movimiento y dejar de escuchar", () => {
    for (const p of [
      "vuelve",
      "vete",
      "guardate",
      "llama",
      "llamar",
      "yama",
      "trae",
      "saca",
      "usa",
      "utiliza",
      "haz",
      "deja",
      "escuchar",
    ])
      expect(esReservada(p), p).toBe(true);
  });

  it("cada verbo de llamar de verdad dispara una llamada (la lista no se desfasa)", () => {
    for (const v of ["llama", "llamar", "llames", "llamame", "yama", "yamar"])
      expect(leerLlamada(`${v} a squirtle`), v).not.toBeNull();
    for (const v of ["trae", "traeme", "traigas", "saca", "sacame", "saques"])
      expect(leerLlamada(`${v} a squirtle`), v).not.toBeNull();
  });

  it("cubre los modelos, el glosario y los movimientos", () => {
    for (const p of ["Claude", "Sonnet", "Opus", "Haiku", "Fable", "Acme", "Impactrueno", "Golpe"])
      expect(esReservada(p), p).toBe(true);
  });

  it("un nombre normal no se toca", () => {
    expect(esReservada("Rayo")).toBe(false);
    expect(esReservada("Chispa")).toBe(false);
  });

  it('ningún nombre reservado puede quedar como llamado: el "sí" de un permiso no lo secuestra', () => {
    // Aunque alguien se saltara el validador, "sí" solo nunca aprueba por el nombre: depende de la guardia y del
    // paso preciso. Aquí se fija lo que `decidir` hace con un Pokémon que se llamara "Dale".
    const raro = con({
      candidatos: [{ id: "p1", nombre: "Dale", apodos: [] }],
      permisosDe: [{ id: "p1", permisoId: "perm-1" }],
    });
    expect(decidir("Dale", raro)).not.toMatchObject({ tipo: "permiso", permitir: true });
  });
});

describe("decidir con nombre propio", () => {
  const rayo = con({ candidatos: [{ id: "p1", nombre: "Rayo", apodos: ["rallo"], alias: ["Pikachu"] }] });

  it("el nombre nuevo, su variante aprendida y el de la especie dirigen la orden al mismo Pokémon", () => {
    for (const dicho of ["Rayo, revisa el deploy.", "Rallo, revisa el deploy.", "Pikachu, revisa el deploy."])
      expect(decidir(dicho, rayo), dicho).toEqual({ tipo: "orden", id: "p1", texto: "revisa el deploy." });
  });

  it("lo que no es su nombre ni su especie se ignora", () => {
    expect(decidir("Squirtle, revisa el deploy.", rayo)).toEqual({ tipo: "ignorar" });
  });

  it("durante el alta todo es del alta, también un «sí»: no aprueba nada aunque haya un permiso a la vista", () => {
    const ctx = con({
      candidatos: rayo.candidatos,
      altaDe: "p1",
      permisosDe: [{ id: "p1", permisoId: "perm-1" }],
    });
    expect(decidir("sí", ctx)).toMatchObject({ tipo: "alta", id: "p1" });
    expect(decidir("Rayo, sí", ctx)).toMatchObject({ tipo: "alta" });
  });
});

describe("decidir durante el alta de otro Pokémon", () => {
  const dos = con({
    candidatos: [
      { id: "p1", nombre: "Rayo", apodos: [] },
      { id: "p2", nombre: "Chispa", apodos: [] },
    ],
    altaDe: "p1",
  });

  it("negar un permiso de otro Pokémon sigue funcionando (el alta no se lo traga)", () => {
    const ctx = { ...dos, permisosDe: [{ id: "p2", permisoId: "perm-2" }] };
    expect(decidir("no", ctx)).toEqual({ tipo: "permiso", id: "p2", permisoId: "perm-2", permitir: false });
    expect(decidir("Chispa, para", ctx)).toEqual({
      tipo: "permiso",
      id: "p2",
      permisoId: "perm-2",
      permitir: false,
    });
  });

  it("aprobar durante el alta es imposible: «sí» y «dale» son frases del alta", () => {
    const ctx = { ...dos, permisosDe: [{ id: "p2", permisoId: "perm-2" }] };
    for (const dicho of ["sí", "Chispa, dale", "hazlo"])
      expect(decidir(dicho, ctx), dicho).toMatchObject({ tipo: "alta", id: "p1" });
  });

  it("cancelar el borrador de otro también pasa; lo demás es del alta", () => {
    const ctx = { ...dos, borradoresDe: ["p2"] };
    expect(decidir("cancela", ctx)).toEqual({ tipo: "cancelar", id: "p2" });
    expect(decidir("Rayo", ctx)).toMatchObject({ tipo: "alta" });
  });

  it("un «no» sin permiso a la vista es del alta", () => {
    expect(decidir("no", dos)).toMatchObject({ tipo: "alta" });
  });
});

describe("validarNombre con la lista real de reservadas", () => {
  const glosario = JSON.parse(
    readFileSync(join(__dirname, "../../../config/glosario.json"), "utf8"),
  ) as string[];
  const ctx = {
    reservadas: palabrasReservadas(glosario, ["Impactrueno", "Golpe certero", "Vistazo", "Descanso"]),
    mando: palabrasDeMando(),
    especies: ["Bulbasaur", "Charmander", "Squirtle", "Pichu", "Raichu", "Eevee", "Mewtwo"],
    otros: [],
  };
  const vale = (n: string) => validarNombre(n, ctx).ok;

  it("nombres corrientes valen (también los que se parecen a una palabra común)", () => {
    for (const n of [
      "Rayo",
      "Chispa",
      "Gota",
      "Tito",
      "Leo",
      "Sol",
      "Nube",
      "Toby",
      "Rocky",
      "Zeus",
      "Bruno",
      "Rex",
      "Luna",
      "Max",
      "Kira",
      "Coco",
      "Lola",
      "Mia",
      "Kai",
      "Lia",
      "Ana",
      "Ari",
      "Nala",
      "Mora",
      "Bola",
      "Hero",
      "Fuego",
      "Trueno",
      "Sasha",
      "Rin",
      "Ron",
    ])
      expect(vale(n), n).toBe(true);
  });

  it("se rechazan las que la transcripción escribe como una palabra de permiso o de mando", () => {
    // «Noa» y «Noe»: la «o» final se pierde al hablar y «no» se transcribe así; «Ash» suena igual que «haz» (haz X).
    for (const n of [
      "Ci",
      "Zi",
      "Sy",
      "Sii",
      "Zii",
      "Noo",
      "Si",
      "No",
      "Noa",
      "Noe",
      "Ash",
      "Para",
      "Llama",
      "Vuelve",
      "Usa",
    ])
      expect(vale(n), n).toBe(false);
  });

  it("se rechazan las palabras con que se empieza una frase y los modelos", () => {
    for (const n of ["Bueno", "Pero", "Mira", "Hola", "Listo", "Sonnet", "Opus", "Claude", "Haiku"])
      expect(vale(n), n).toBe(false);
  });

  it("el filtro del alta (esPalabraDeMando) sigue descartando «hazlo» y «llama»", () => {
    expect(esPalabraDeMando("hazlo", ctx.reservadas, ctx.mando)).toBe(true);
    expect(esPalabraDeMando("llama", ctx.reservadas, ctx.mando)).toBe(true);
    expect(esPalabraDeMando("rallo", ctx.reservadas, ctx.mando)).toBe(false);
  });
});
