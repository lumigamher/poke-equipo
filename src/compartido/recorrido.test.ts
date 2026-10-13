import { describe, expect, it } from "vitest";
import {
  atras,
  clicDerecho,
  cumplido,
  type EstadoRecorrido,
  iniciar,
  irA,
  moverA,
  type Niveles,
  observar,
  PASOS,
  pasoCumplido,
  type Senales,
} from "./recorrido";

const base: Senales = {
  vistas: [{ abierta: false, estado: "paseando", ultimaRespuesta: null }],
  oido: "atento",
  trabajo: false,
  dicto: false,
  menu: false,
};
const con = (cambio: Partial<Senales>): Senales => ({ ...base, ...cambio });
const vista = (v: Partial<Senales["vistas"][number]>) => [{ ...base.vistas[0], ...v }];

describe("recorrido de la primera vez", () => {
  it("cada paso avanza con lo que la persona hace de verdad", () => {
    expect(pasoCumplido("abrir", base)).toBe(false);
    expect(pasoCumplido("abrir", con({ vistas: vista({ abierta: true }) }))).toBe(true);
    expect(pasoCumplido("ordenar", con({ vistas: vista({ estado: "trabajando" }) }))).toBe(true);
    expect(pasoCumplido("menu", con({ menu: true }))).toBe(true);
  });

  it("'mirar' espera a que haya trabajado y terminado; un permiso pendiente todavía es trabajo", () => {
    expect(pasoCumplido("mirar", base)).toBe(false);
    expect(pasoCumplido("mirar", con({ trabajo: true, vistas: vista({ estado: "trabajando" }) }))).toBe(
      false,
    );
    expect(pasoCumplido("mirar", con({ trabajo: true, vistas: vista({ estado: "pidiendo_permiso" }) }))).toBe(
      false,
    );
    expect(pasoCumplido("mirar", con({ trabajo: true, vistas: vista({ estado: "termino" }) }))).toBe(true);
  });

  it("'dictar' se cumple al cerrar el dictado, no al abrirlo; el último paso lo cierra la persona", () => {
    expect(pasoCumplido("dictar", con({ dicto: true, oido: "dictando" }))).toBe(false);
    expect(pasoCumplido("dictar", con({ dicto: true, oido: "atento" }))).toBe(true);
    expect(pasoCumplido("fin", con({ menu: true, dicto: true, trabajo: true }))).toBe(false);
  });

  it("todos los pasos menos el último dicen qué hacer", () => {
    expect(PASOS.at(-1)?.id).toBe("fin");
    for (const p of PASOS.slice(0, -1)) expect(p.haz).not.toBe("");
  });
});

const quieto: Niveles = { abierta: false, ocupado: false, dictando: false };
const vs = (n: Partial<Niveles>) => [
  {
    abierta: n.abierta ?? false,
    estado: n.ocupado ? ("trabajando" as const) : ("paseando" as const),
    ultimaRespuesta: null,
  },
];
/** Aplica lo que se ve ahora y dice si el paso actual se daría por cumplido. */
const ve = (e: EstadoRecorrido, n: Partial<Niveles>) => {
  const oido = n.dictando ? ("dictando" as const) : ("atento" as const);
  const s = observar(e, vs(n), oido);
  return { e: s, ok: cumplido(s, vs(n), oido) };
};
const id = (e: EstadoRecorrido) => PASOS[e.paso].id;

describe("recorrido: estado y Atrás", () => {
  it("clic derecho fuera del paso del menú no se guarda para después (el salto del paso 1 al 5)", () => {
    let e = iniciar(quieto);
    e = clicDerecho(e); // paso 1 "abrir"
    expect(e.menu).toBe(false);
    // aunque se llegue al paso del menú por Siguiente, no queda cumplido por ese clic
    e = irA(
      e,
      PASOS.findIndex((p) => p.id === "menu"),
      quieto,
      "avance",
    );
    expect(cumplido(e, vs({}), "atento")).toBe(false);
    expect(cumplido(clicDerecho(e), vs({}), "atento")).toBe(true);
  });

  it("lo que ya estaba hecho al entrar a un paso no lo cumple (burbuja abierta, trabajo en curso)", () => {
    const abierta = { ...quieto, abierta: true };
    let e = irA(iniciar(quieto), 1, abierta, "avance");
    expect(id(e)).toBe("ordenar");
    // Atrás a "abrir" con la burbuja todavía abierta: no avanza solo
    e = atras(e, abierta);
    expect(id(e)).toBe("abrir");
    expect(ve(e, { abierta: true }).ok).toBe(false);
    // cerrarla y abrirla de nuevo sí lo cumple
    e = ve(e, {}).e;
    expect(ve(e, { abierta: true }).ok).toBe(true);
  });

  it("'ordenar' al que se vuelve con trabajo en curso no avanza solo", () => {
    const trabajando = { ...quieto, abierta: true, ocupado: true };
    const e = atras(irA(iniciar(quieto), 2, trabajando, "avance"), trabajando);
    expect(id(e)).toBe("ordenar");
    expect(ve(e, trabajando).ok).toBe(false);
  });

  it("al volver a 'mirar' o 'dictar' hay que repetir la acción", () => {
    let e = irA(iniciar(quieto), 3, quieto, "avance"); // dictar
    e = ve(e, { dictando: true }).e;
    expect(ve(e, {}).ok).toBe(true);
    e = atras(irA(e, 4, quieto, "avance"), quieto); // vuelve a dictar
    expect(id(e)).toBe("dictar");
    expect(ve(e, {}).ok).toBe(false);
    e = atras(e, quieto); // mirar
    expect(id(e)).toBe("mirar");
    expect(ve(e, {}).ok).toBe(false);
  });

  it("hacia delante, lo que ya estaba en marcha sí cuenta (trabajo que sigue al pasar a 'mirar')", () => {
    const trabajando = { ...quieto, abierta: true, ocupado: true };
    let e = irA(iniciar(quieto), 2, trabajando, "avance");
    expect(id(e)).toBe("mirar");
    e = ve(e, trabajando).e;
    expect(ve(e, { abierta: true }).ok).toBe(true);
  });

  it("Atrás en el primer paso se queda y en el último vuelve al de antes", () => {
    const e = iniciar(quieto);
    expect(atras(e, quieto).paso).toBe(0);
    expect(atras(irA(e, PASOS.length - 1, quieto, "avance"), quieto).paso).toBe(PASOS.length - 2);
  });
});

describe("recorrido: respiro de 900 ms", () => {
  it("el trabajo que arranca durante el respiro cuenta para 'mirar'", () => {
    const e = irA(iniciar(quieto), 1, { ...quieto, abierta: true }, "avance"); // ordenar, ya cumplido
    // al vencer el respiro ya hay algo trabajando: se entra a 'mirar' con eso
    const m = moverA(e, 2, vs({ abierta: true, ocupado: true }), "atento", "avance");
    expect(id(m)).toBe("mirar");
    expect(m.trabajo).toBe(true);
    expect(cumplido(m, vs({ abierta: true }), "atento")).toBe(true);
  });

  it("el dictado que arranca durante el respiro cuenta para 'dictar'", () => {
    const e = irA(iniciar(quieto), 2, quieto, "avance");
    const d = moverA(e, 3, vs({}), "dictando", "avance");
    expect(id(d)).toBe("dictar");
    expect(d.dicto).toBe(true);
    expect(cumplido(d, vs({}), "atento")).toBe(true);
  });

  it("Atrás con trabajo ya en marcha: al terminar no avanza solo; trabajo NUEVO sí cuenta", () => {
    const trabajando = { ...quieto, abierta: true, ocupado: true };
    let e = moverA(irA(iniciar(quieto), 3, quieto, "avance"), 2, vs(trabajando), "atento", "atras");
    expect(id(e)).toBe("mirar");
    expect(e.trabajo).toBe(false);
    e = ve(e, trabajando).e;
    const fin = ve(e, { abierta: true }); // el viejo trabajo termina
    expect(fin.ok).toBe(false);
    e = ve(fin.e, trabajando).e; // empieza uno nuevo
    expect(ve(e, { abierta: true }).ok).toBe(true);
  });

  it("Atrás con dictado ya abierto: al cerrarlo no avanza solo; dictado NUEVO sí cuenta", () => {
    let e = moverA(irA(iniciar(quieto), 4, quieto, "avance"), 3, vs({}), "dictando", "atras");
    expect(id(e)).toBe("dictar");
    expect(e.dicto).toBe(false);
    expect(ve(e, {}).ok).toBe(false);
    e = ve(e, {}).e;
    e = ve(e, { dictando: true }).e;
    expect(ve(e, {}).ok).toBe(true);
  });
});

describe("recorrido y alta de voz del nombre", () => {
  const conAlta = (n: Partial<Niveles>, alta: boolean) => [{ ...vs(n)[0], alta }];

  it("mientras el Pokémon aprende su nombre, ningún paso se cumple por los avisos del alta", () => {
    // Paso 1 "abrir": el aviso del alta ("Di Rayo tres veces…") abre su burbuja sin que la persona haga clic.
    const e = iniciar(quieto);
    const vistas = conAlta({ abierta: true }, true);
    expect(cumplido(e, vistas, "atento")).toBe(false);
    const visto = observar(e, vistas, "atento");
    expect(cumplido(visto, vistas, "atento")).toBe(false);
  });

  it("al acabar el alta, el aviso que sigue a la vista cuenta como 'de antes' y el paso no avanza solo", () => {
    let e = iniciar(quieto);
    // Durante el alta: aviso abierto.
    e = observar(e, conAlta({ abierta: true }, true), "atento");
    // Termina el alta y el aviso final ("Listo…") aún se ve ocho segundos.
    const fin = conAlta({ abierta: true }, false);
    e = observar(e, fin, "atento");
    expect(cumplido(e, fin, "atento")).toBe(false);
    // Se borra el aviso: nada se cumple.
    const sinAviso = conAlta({ abierta: false }, false);
    e = observar(e, sinAviso, "atento");
    expect(cumplido(e, sinAviso, "atento")).toBe(false);
    // La persona abre la burbuja de verdad: ahora sí.
    const abre = conAlta({ abierta: true }, false);
    e = observar(e, abre, "atento");
    expect(cumplido(e, abre, "atento")).toBe(true);
  });

  it("un renombrado a mitad del recorrido pausa igual: el paso en que iba no se cumple solo", () => {
    const menu = irA(
      iniciar(quieto),
      PASOS.findIndex((p) => p.id === "menu"),
      quieto,
      "avance",
    );
    const durante = conAlta({}, true);
    expect(cumplido(clicDerecho(menu), durante, "atento")).toBe(false);
  });

  it("sin alta todo sigue igual", () => {
    const e = iniciar(quieto);
    expect(cumplido(e, conAlta({ abierta: true }, false), "atento")).toBe(true);
  });
});

describe("textos del recorrido con nombre propio", () => {
  it("usan el nombre elegido", () => {
    expect(PASOS[0].texto("Rayo")).toContain("Soy Rayo");
    expect(PASOS[1].texto("Rayo")).toContain("«Rayo, dime");
  });

  it("el último paso sugiere a otro que no sea la propia especie, aunque el nombre sea otro", () => {
    // Squirtle bautizado "Gota": "llama a Squirtle" sería llamarse a sí mismo.
    const texto = PASOS.at(-1)?.texto("Gota", "Charmander") ?? "";
    expect(texto).toContain("«Gota, llama a Charmander»");
    // Sin el dato de la especie se sigue sugiriendo según el nombre (el comportamiento de antes).
    expect(PASOS.at(-1)?.texto("Squirtle")).toContain("llama a Charmander");
  });
});
