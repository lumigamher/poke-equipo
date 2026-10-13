import { describe, expect, it } from "vitest";
import {
  actualizarApertura,
  burbujaAbierta,
  elegirBurbuja,
  marcarAbierta,
  SIN_APERTURA,
} from "./burbuja-abierta";
import type { VistaPokemon } from "./tipos";

const v = (id: string, extra: Partial<VistaPokemon> = {}): VistaPokemon =>
  ({
    id,
    nombre: id,
    especie: 25,
    estado: "paseando",
    desde: 0,
    alterados: [],
    ps: 100,
    burbuja: null,
    permiso: null,
    actividad: null,
    microfono: true,
    borrador: null,
    afinando: false,
    ultimaRespuesta: null,
    ...extra,
  }) as VistaPokemon;

const perm = (id = "x") => ({ id, herramienta: "Bash", detalle: "ls" });
const respuesta = (texto = "y") => ({ tipo: "respuesta", texto }) as const;

describe("burbujaAbierta", () => {
  it("sin nadie con burbuja, ninguna se abre", () => {
    expect(burbujaAbierta([v("A"), v("B")], null)).toBeNull();
  });

  it("nunca hay dos abiertas: con dos respuestas gana la más reciente", () => {
    const vs = [
      v("A", { estado: "termino", burbuja: respuesta("x"), desde: 100 }),
      v("B", { estado: "termino", burbuja: respuesta("y"), desde: 200 }),
    ];
    expect(burbujaAbierta(vs, null)).toBe("B");
  });

  it("un permiso pendiente gana a una respuesta, aunque la respuesta sea más reciente", () => {
    const vs = [
      v("A", { estado: "pidiendo_permiso", permiso: perm(), desde: 100 }),
      v("B", { estado: "termino", burbuja: respuesta(), desde: 300 }),
    ];
    expect(burbujaAbierta(vs, null)).toBe("A");
  });

  it("con dos permisos gana el más antiguo", () => {
    const vs = [
      v("A", { estado: "pidiendo_permiso", permiso: perm(), desde: 200 }),
      v("B", { estado: "pidiendo_permiso", permiso: perm(), desde: 100 }),
    ];
    expect(burbujaAbierta(vs, null)).toBe("B");
  });

  it("un chip elegido por la persona gana sobre todo lo demás", () => {
    const vs = [
      v("A", { estado: "pidiendo_permiso", permiso: perm(), desde: 100 }),
      v("B", { estado: "termino", burbuja: respuesta(), desde: 300 }),
    ];
    expect(burbujaAbierta(vs, "B")).toBe("B");
  });

  it("un id fijado que ya no existe no abre nada", () => {
    expect(burbujaAbierta([v("A")], "Z")).toBeNull();
  });

  it("una respuesta vieja que ya no se muestra sola (paseando) no se abre ni tapa a otra", () => {
    const vs = [
      v("A", { estado: "paseando", burbuja: respuesta(), desde: 900 }),
      v("B", { estado: "escuchando", burbuja: { tipo: "escucha", texto: "hola" }, desde: 100 }),
    ];
    expect(burbujaAbierta(vs, null)).toBe("B");
    expect(burbujaAbierta([vs[0]], null)).toBeNull();
  });
});

describe("marcarAbierta", () => {
  it("marca exactamente una abierta y el resto cerradas, sin tocar las vistas que recibe", () => {
    const vs = [v("A", { estado: "pidiendo_permiso", permiso: perm() }), v("B")];
    const marcadas = marcarAbierta(vs, null);
    expect(marcadas.map((x) => [x.id, x.abierta])).toEqual([
      ["A", true],
      ["B", false],
    ]);
    expect(vs[0].abierta).toBeUndefined();
  });

  it("solo la abierta conserva el registro en vivo; las demás no lo mandan", () => {
    const registro = { entradas: [{ id: 1, tipo: "accion" as const, texto: "x" }], omitido: false };
    const vs = [v("A", { estado: "pidiendo_permiso", permiso: perm(), registro }), v("B", { registro })];
    const marcadas = marcarAbierta(vs, null);
    expect(marcadas[0].registro).toEqual(registro);
    expect("registro" in marcadas[1]).toBe(false);
  });

  it("sin nada que abrir, todas cerradas", () => {
    expect(marcarAbierta([v("A"), v("B")], null).map((x) => x.abierta)).toEqual([false, false]);
  });
});

describe("apertura: cuándo se suelta la fijada (C25)", () => {
  it("elegir fija; elegir otra vez el mismo la suelta", () => {
    const vs = [v("A"), v("B", { estado: "termino", burbuja: respuesta() })];
    const a = elegirBurbuja(actualizarApertura(SIN_APERTURA, vs), "A", vs);
    expect(a.fijada).toBe("A");
    expect(elegirBurbuja(a, "A", vs).fijada).toBeNull();
  });

  it("elegir un id que no está, o que se está guardando, no fija nada", () => {
    const vs = [v("A", { estado: "guardandose" })];
    expect(elegirBurbuja(SIN_APERTURA, "Z", vs).fijada).toBeNull();
    expect(elegirBurbuja(SIN_APERTURA, "A", vs).fijada).toBeNull();
  });

  it("un permiso nuevo en cualquier Pokémon suelta la fijada: un chip fijado no tapa un permiso nuevo", () => {
    const antes = [v("A"), v("B", { estado: "termino", burbuja: respuesta() })];
    let a = elegirBurbuja(actualizarApertura(SIN_APERTURA, antes), "B", antes);
    const despues = [v("A", { estado: "pidiendo_permiso", permiso: perm("P1") }), antes[1]];
    a = actualizarApertura(a, despues);
    expect(a.fijada).toBeNull();
    expect(burbujaAbierta(despues, a.fijada)).toBe("A");
  });

  it("un permiso que ya estaba no suelta la fijada: la persona puede pasar a otro chip con un permiso pendiente", () => {
    const vs = [
      v("A", { estado: "pidiendo_permiso", permiso: perm("P1") }),
      v("B", { estado: "termino", burbuja: respuesta() }),
    ];
    let a = actualizarApertura(SIN_APERTURA, vs);
    a = elegirBurbuja(a, "B", vs);
    a = actualizarApertura(a, vs);
    expect(a.fijada).toBe("B");
  });

  it("el siguiente permiso del mismo Pokémon es un permiso nuevo y también la suelta", () => {
    const uno = [v("A", { permiso: perm("P1") }), v("B", { estado: "termino", burbuja: respuesta() })];
    let a = elegirBurbuja(actualizarApertura(SIN_APERTURA, uno), "B", uno);
    a = actualizarApertura(a, [v("A", { permiso: perm("P2") }), uno[1]]);
    expect(a.fijada).toBeNull();
  });

  it("si el fijado deja de existir o se empieza a guardar, se suelta", () => {
    const vs = [v("A"), v("B", { estado: "termino", burbuja: respuesta() })];
    const a = elegirBurbuja(actualizarApertura(SIN_APERTURA, vs), "B", vs);
    expect(actualizarApertura(a, [v("A")]).fijada).toBeNull();
    expect(actualizarApertura(a, [v("A"), v("B", { estado: "guardandose" })]).fijada).toBeNull();
  });

  it("si el fijado tenía burbuja o permiso y se queda sin nada, se suelta", () => {
    const vs = [v("A"), v("B", { estado: "termino", burbuja: respuesta() })];
    const a = elegirBurbuja(actualizarApertura(SIN_APERTURA, vs), "B", vs);
    expect(actualizarApertura(a, [v("A"), v("B")]).fijada).toBeNull();
  });

  it("un clic sobre uno sin burbuja lo fija (abre su última respuesta o el campo para escribirle) hasta otro clic", () => {
    const vs = [v("A", { ultimaRespuesta: "hecho" }), v("B")];
    let a = elegirBurbuja(actualizarApertura(SIN_APERTURA, vs), "A", vs);
    a = actualizarApertura(a, vs);
    expect(a.fijada).toBe("A");
    expect(burbujaAbierta(vs, a.fijada)).toBe("A");
    // La persona le escribe: sale una burbuja; cuando se va, la fijada se suelta.
    a = actualizarApertura(a, [
      v("A", { estado: "escuchando", burbuja: { tipo: "escucha", texto: "x" } }),
      vs[1],
    ]);
    expect(a.fijada).toBe("A");
    a = actualizarApertura(a, [v("A", { estado: "trabajando" }), vs[1]]);
    expect(a.fijada).toBeNull();
  });

  it("es idempotente: evaluar dos veces lo mismo no cambia nada", () => {
    const vs = [v("A", { permiso: perm("P1") }), v("B", { estado: "termino", burbuja: respuesta() })];
    let a = actualizarApertura(SIN_APERTURA, vs);
    a = elegirBurbuja(a, "B", vs);
    const b = actualizarApertura(actualizarApertura(a, vs), vs);
    expect(b.fijada).toBe("B");
  });
});

describe("burbujaAbierta: lo transcrito siempre se ve (I1)", () => {
  const escucha = { tipo: "escucha", texto: "borra la rama vieja" } as const;

  it("un borrador vigente gana a un permiso pendiente", () => {
    const vs = [
      v("A", { estado: "pidiendo_permiso", permiso: perm(), desde: 100 }),
      v("B", { estado: "escuchando", borrador: 1, burbuja: escucha, desde: 300 }),
    ];
    expect(burbujaAbierta(vs, null)).toBe("B");
  });

  it("un borrador vigente gana a la fijada", () => {
    const vs = [v("A", { ultimaRespuesta: "x" }), v("B", { estado: "escuchando", borrador: 1, desde: 300 })];
    expect(burbujaAbierta(vs, "A")).toBe("B");
  });

  it("con dos borradores gana el de id más alto (el más reciente), no el `desde` del estado ni el orden", () => {
    // B abrió su borrador después (id 7) pero su estado es más viejo y va primero en la lista.
    const vs = [
      v("B", { estado: "escuchando", borrador: 7, desde: 100 }),
      v("A", { estado: "escuchando", borrador: 3, desde: 300 }),
    ];
    expect(burbujaAbierta(vs, null)).toBe("B");
    expect(burbujaAbierta([vs[1], vs[0]], null)).toBe("B");
  });

  it("cuando el borrador sale, vuelve el permiso", () => {
    const vs = [
      v("A", { estado: "pidiendo_permiso", permiso: perm(), desde: 100 }),
      v("B", { estado: "trabajando", desde: 400 }),
    ];
    expect(burbujaAbierta(vs, null)).toBe("A");
  });

  it("un borrador nuevo suelta la fijada; uno que ya estaba, no", () => {
    const antes = [v("A", { ultimaRespuesta: "x" }), v("B")];
    let a = elegirBurbuja(actualizarApertura(SIN_APERTURA, antes), "A", antes);
    const conBorrador = [antes[0], v("B", { estado: "escuchando", borrador: 1 })];
    a = actualizarApertura(a, conBorrador);
    expect(a.fijada).toBeNull();
    a = elegirBurbuja(a, "A", conBorrador);
    expect(actualizarApertura(a, conBorrador).fijada).toBe("A");
  });
});
