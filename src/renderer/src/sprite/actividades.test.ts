import { ACTIVIDADES, type DatosAnim } from "@compartido/tipos";
import { describe, expect, it } from "vitest";
import {
  celdasTexto,
  elegirDe,
  ladoObjeto,
  miradaHacia,
  OBJETOS,
  POSES_ACTIVIDAD,
  VAIVEN_ANCHO,
  vaiven,
} from "./actividades";

const d: DatosAnim = { ancho: 32, alto: 40, duraciones: [8, 8], filas: 8 };

describe("poses por actividad", () => {
  it("ninguna actividad usa hojas de una sola fila: en ellas el Pokémon sale de espaldas o sin cara", () => {
    for (const a of ACTIVIDADES) {
      for (const anim of POSES_ACTIVIDAD[a].anims)
        expect(["Sit", "LookUp", "Eat", "Sleep"]).not.toContain(anim);
    }
  });

  it("pensar no pone objeto: es la actividad más frecuente y no debe hacer aparecer y desaparecer cosas", () => {
    expect(POSES_ACTIVIDAD.pensando.objeto).toBeNull();
  });

  it("cada actividad tiene pose, y su última opción es una animación obligatoria", () => {
    const obligatorias = ["Walk", "Idle", "Sleep", "Hop", "Charge", "Pose", "Nod", "Pain"];
    for (const a of ACTIVIDADES) {
      const p = POSES_ACTIVIDAD[a];
      expect(p.anims.length).toBeGreaterThan(0);
      expect(obligatorias).toContain(p.anims.at(-1));
    }
  });

  it("elegirDe toma la primera disponible", () => {
    expect(elegirDe(["Sit", "Nod"], { Nod: d })).toBe("Nod");
    expect(elegirDe(["Sit", "Nod"], { Sit: d, Nod: d })).toBe("Sit");
    expect(elegirDe(["Sit"], { Walk: d })).toBe("Walk");
    expect(elegirDe(["Sit"], {})).toBeNull();
  });

  it("solo pensando va sin objeto", () => {
    for (const a of ACTIVIDADES) {
      if (a === "pensando") expect(POSES_ACTIVIDAD[a].objeto).toBeNull();
      else expect(POSES_ACTIVIDAD[a].objeto).not.toBeNull();
    }
  });
});

describe("objetos", () => {
  it("son rejillas rectangulares de hasta 16 x 16 con colores definidos", () => {
    for (const [nombre, o] of Object.entries(OBJETOS)) {
      expect(o.filas.length, nombre).toBeGreaterThan(0);
      expect(o.filas.length, nombre).toBeLessThanOrEqual(16);
      const ancho = o.filas[0].length;
      expect(ancho, nombre).toBeLessThanOrEqual(16);
      for (const fila of o.filas) {
        expect(fila.length, nombre).toBe(ancho);
        for (const c of fila) if (c !== ".") expect(o.colores[c], `${nombre}:${c}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("cada objeto usa a lo sumo 5 colores", () => {
    for (const [nombre, o] of Object.entries(OBJETOS)) {
      expect(Object.keys(o.colores).length, nombre).toBeLessThanOrEqual(5);
    }
  });

  it("todos los objetos de las poses existen", () => {
    for (const a of ACTIVIDADES) {
      const o = POSES_ACTIVIDAD[a].objeto;
      if (o) expect(OBJETOS[o], a).toBeDefined();
    }
  });
});

describe("vaiven", () => {
  it("empieza en un extremo mirando a la derecha y vuelve", () => {
    expect(vaiven(0)).toEqual({ dx: -VAIVEN_ANCHO, direccion: "derecha" });
    expect(vaiven(1500).dx).toBeCloseTo(VAIVEN_ANCHO);
    expect(vaiven(1600).direccion).toBe("izquierda");
    expect(vaiven(3000).dx).toBeCloseTo(-VAIVEN_ANCHO);
    expect(vaiven(3100).direccion).toBe("derecha");
  });
  it("nunca se sale del ancho", () => {
    for (let t = 0; t < 10_000; t += 137) expect(Math.abs(vaiven(t).dx)).toBeLessThanOrEqual(VAIVEN_ANCHO);
  });
});

describe("ladoObjeto", () => {
  it("en el medio va a la derecha", () => {
    expect(ladoObjeto(500, 1000, 140)).toBe("derecha");
  });
  it("cerca del borde derecho pasa a la izquierda", () => {
    expect(ladoObjeto(900, 1000, 140)).toBe("izquierda");
  });
  it("justo en el límite sigue a la derecha", () => {
    expect(ladoObjeto(860, 1000, 140)).toBe("derecha");
    expect(ladoObjeto(861, 1000, 140)).toBe("izquierda");
  });
  it("con la ventana más angosta que el espacio, derecha", () => {
    expect(ladoObjeto(50, 100, 140)).toBe("derecha");
  });
});

describe("trabajar sin temblar", () => {
  it("ninguna pose de trabajo usa Charge: a 2 tics por cuadro se ve como un temblor", () => {
    for (const a of ACTIVIDADES) expect(POSES_ACTIVIDAD[a].anims).not.toContain("Charge");
  });

  it("asentir va a menos de la mitad de velocidad", () => {
    for (const a of ACTIVIDADES) {
      const p = POSES_ACTIVIDAD[a];
      if (p.anims[0] === "Nod") expect(p.velocidad).toBeLessThanOrEqual(0.5);
    }
  });

  it("programar, ejecutar y responder miran al objeto", () => {
    for (const a of ["programando", "ejecutando", "respondiendo"] as const) {
      expect(POSES_ACTIVIDAD[a].mirarObjeto).toBe(true);
    }
  });

  it("mirar al objeto es de tres cuartos hacia su lado", () => {
    expect(miradaHacia("derecha")).toBe("frente-derecha");
    expect(miradaHacia("izquierda")).toBe("frente-izquierda");
  });
});

describe("celdasTexto", () => {
  it("la pantalla del computador escribe sus celdas de código en orden de lectura", () => {
    const celdas = celdasTexto("pc");
    expect(celdas.length).toBeGreaterThan(5);
    for (let i = 1; i < celdas.length; i++) {
      const [a, b] = [celdas[i - 1], celdas[i]];
      expect(a.y < b.y || (a.y === b.y && a.x < b.x)).toBe(true);
    }
    for (const c of celdas) expect(OBJETOS.pc.filas[c.y][c.x]).toBe("w");
  });

  it("los objetos sin texto no escriben nada", () => {
    expect(celdasTexto("pokebola")).toEqual([]);
  });
});
