import { ESTADOS } from "@compartido/tipos";
import { describe, expect, it } from "vitest";
import {
  ATERRIZAJE,
  animColgado,
  avanzar,
  cuadroEn,
  elegirAnim,
  elegirSinRepetir,
  filaPara,
  margenInferior,
  margenSuperior,
  POSES,
  ticEn,
} from "./animaciones";

const walk = { ancho: 32, alto: 40, duraciones: [8, 10, 8, 10], filas: 8 };
const sleep = { ancho: 32, alto: 40, duraciones: [30, 35], filas: 1 };

describe("cuadroEn", () => {
  it("avanza según la duración de cada cuadro", () => {
    expect(cuadroEn(walk, 0, true)).toBe(0);
    expect(cuadroEn(walk, 7, true)).toBe(0);
    expect(cuadroEn(walk, 8, true)).toBe(1);
    expect(cuadroEn(walk, 18, true)).toBe(2);
    expect(cuadroEn(walk, 35, true)).toBe(3);
  });

  it("en bucle vuelve a empezar", () => {
    expect(cuadroEn(walk, 36, true)).toBe(0);
    expect(cuadroEn(walk, 36 + 9, true)).toBe(1);
  });

  it("sin bucle se queda en el último cuadro", () => {
    expect(cuadroEn(walk, 500, false)).toBe(3);
  });

  it("sin duraciones devuelve el cuadro 0", () => {
    expect(cuadroEn({ ...walk, duraciones: [] }, 10, true)).toBe(0);
  });
});

describe("filaPara", () => {
  it("usa la fila de cada dirección en hojas de ocho filas", () => {
    expect(filaPara(walk, "frente")).toBe(0);
    expect(filaPara(walk, "derecha")).toBe(2);
    expect(filaPara(walk, "izquierda")).toBe(6);
  });

  it("de tres cuartos: abajo a la derecha es la 1 y abajo a la izquierda la 7", () => {
    expect(filaPara(walk, "frente-derecha")).toBe(1);
    expect(filaPara(walk, "frente-izquierda")).toBe(7);
  });

  it("en hojas de una fila siempre es la 0", () => {
    expect(filaPara(sleep, "izquierda")).toBe(0);
  });
});

describe("POSES y elegirAnim", () => {
  it("hay una pose para cada estado", () => {
    for (const estado of ESTADOS) expect(POSES[estado]).toBeDefined();
  });

  it("solo camina paseando y cansado, y cansado va más lento", () => {
    const caminan = ESTADOS.filter((e) => POSES[e].paso > 0);
    expect([...caminan].sort()).toEqual(["cansado", "paseando"]);
    expect(POSES.cansado.paso).toBeLessThan(POSES.paseando.paso);
  });

  it("usa la animación de la pose si existe", () => {
    expect(elegirAnim(POSES.dormido, { Sleep: sleep, Walk: walk })).toBe("Sleep");
  });

  it("si falta, cae a Idle, luego a Walk, luego a la que haya", () => {
    expect(elegirAnim(POSES.dormido, { Idle: walk, Walk: walk })).toBe("Idle");
    expect(elegirAnim(POSES.dormido, { Walk: walk })).toBe("Walk");
    expect(elegirAnim(POSES.dormido, { Hop: walk })).toBe("Hop");
    expect(elegirAnim(POSES.dormido, {})).toBeNull();
  });
});

describe("margenInferior", () => {
  const region = (ancho: number, alto: number, opacos: [number, number][]) => {
    const a = new Uint8ClampedArray(ancho * alto);
    for (const [x, y] of opacos) a[y * ancho + x] = 255;
    return a;
  };

  it("con un píxel opaco en la última fila es 0", () => {
    expect(margenInferior(region(4, 5, [[1, 4]]), 4, 5)).toBe(0);
  });

  it("cuenta las filas transparentes de abajo", () => {
    expect(margenInferior(region(4, 10, [[2, 6]]), 4, 10)).toBe(3);
  });

  it("totalmente transparente devuelve 0", () => {
    expect(margenInferior(region(4, 5, []), 4, 5)).toBe(0);
  });

  it("con varios cuadros lado a lado toma el píxel más bajo de todos", () => {
    expect(
      margenInferior(
        region(12, 8, [
          [1, 2],
          [9, 5],
        ]),
        12,
        8,
      ),
    ).toBe(2);
  });
});

describe("avanzar", () => {
  const T = 1000 / 60;
  it("avanza a la derecha según el tiempo", () => {
    expect(avanzar(10, 1, 0.8, T, 500)).toEqual({ x: 10.8, sentido: 1 });
    expect(avanzar(10, 1, 0.8, 2 * T, 500).x).toBeCloseTo(11.6);
  });

  it("rebota en el borde derecho y vuelve mirando a la izquierda", () => {
    expect(avanzar(499.5, 1, 0.8, T, 500)).toEqual({ x: 500, sentido: -1 });
  });

  it("rebota en 0", () => {
    expect(avanzar(0.5, -1, 0.8, T, 500)).toEqual({ x: 0, sentido: 1 });
  });

  it("con paso 0 no se mueve", () => {
    expect(avanzar(10, 1, 0, T, 500)).toEqual({ x: 10, sentido: 1 });
  });

  it("recorta dt a 100 ms", () => {
    expect(avanzar(0, 1, 1, 5000, 500).x).toBeCloseTo(6);
  });

  it("con ancho <= 0 se queda en 0", () => {
    expect(avanzar(30, 1, 0.8, T, 0)).toEqual({ x: 0, sentido: 1 });
    expect(avanzar(30, -1, 0.8, T, -5).x).toBe(0);
  });
});

describe("ticEn", () => {
  it("cuenta tics de 1/60 s desde el inicio de la animación, sin depender de la tasa de pantalla", () => {
    expect(ticEn(100, 100)).toBe(0);
    expect(ticEn(116, 100)).toBe(0);
    expect(ticEn(117, 100)).toBe(1);
    expect(ticEn(1100, 100)).toBe(60);
  });

  it("un reloj un poco anterior al inicio no da tics negativos", () => {
    expect(ticEn(95, 100)).toBe(0);
  });

  it("a 120 Hz y a 60 Hz el mismo instante da el mismo tic", () => {
    const a120 = Array.from({ length: 121 }, (_, i) => ticEn(i * (1000 / 120), 0)).at(-1);
    const a60 = Array.from({ length: 61 }, (_, i) => ticEn(i * (1000 / 60), 0)).at(-1);
    expect(a120).toBe(a60);
  });
});

describe("margenSuperior", () => {
  const region = (ancho: number, alto: number, opacos: [number, number][]) => {
    const a = new Uint8ClampedArray(ancho * alto);
    for (const [x, y] of opacos) a[y * ancho + x] = 255;
    return a;
  };

  it("un píxel opaco en la primera fila da 0", () => {
    expect(margenSuperior(region(4, 5, [[1, 0]]), 4, 5)).toBe(0);
  });

  it("cuenta las filas transparentes de arriba, con el píxel más alto de todos los cuadros", () => {
    expect(
      margenSuperior(
        region(8, 10, [
          [1, 6],
          [6, 3],
        ]),
        8,
        10,
      ),
    ).toBe(3);
  });

  it("totalmente transparente devuelve 0", () => {
    expect(margenSuperior(region(4, 5, []), 4, 5)).toBe(0);
  });
});

describe("elegirSinRepetir", () => {
  const d = { ancho: 32, alto: 40, duraciones: [8], filas: 8 };
  const disp = { Pose: d, Hop: d, Nod: d };

  it("nunca repite la anterior mientras haya otra", () => {
    for (const azar of [0, 0.34, 0.67, 0.99]) {
      expect(elegirSinRepetir(["Pose", "Hop", "Nod"], disp, "Hop", () => azar)).not.toBe("Hop");
    }
  });

  it("solo elige las que la especie tiene", () => {
    expect(elegirSinRepetir(["Rotate", "Pose"], disp, null, () => 0.99)).toBe("Pose");
  });

  it("con una sola opción la repite, y sin ninguna devuelve null", () => {
    expect(elegirSinRepetir(["Pose"], disp, "Pose", () => 0.5)).toBe("Pose");
    expect(elegirSinRepetir(["Rotate"], disp, null, () => 0.5)).toBeNull();
  });

  it("en una racha larga no hay dos seguidas iguales", () => {
    let anterior: string | null = null;
    let semilla = 7;
    const azar = () => {
      semilla = (semilla * 9301 + 49297) % 233280;
      return semilla / 233280;
    };
    for (let i = 0; i < 200; i++) {
      const nueva = elegirSinRepetir(["Pose", "Hop", "Nod"], disp, anterior, azar);
      expect(nueva).not.toBe(anterior);
      anterior = nueva;
    }
  });
});

describe("animColgado", () => {
  const dato = { ancho: 32, alto: 40, duraciones: [8], filas: 1 };
  const solo = (...n: string[]) => Object.fromEntries(n.map((x) => [x, dato]));
  it("prefiere perder el equilibrio, luego encogerse y al final el quejido", () => {
    expect(animColgado("paseando", true, false, solo("Hurt", "Cringe", "LostBalance"))).toBe("LostBalance");
    expect(animColgado("paseando", true, false, solo("Hurt", "Cringe"))).toBe("Cringe");
    expect(animColgado("esperando", true, false, solo("Hurt", "Idle"))).toBe("Hurt");
  });
  it("sin ninguna de ellas no cambia nada", () => {
    expect(animColgado("paseando", true, false, solo("Idle", "Walk"))).toBeNull();
  });
  it("solo mientras está en el aire", () => {
    expect(animColgado("paseando", false, false, solo("Hurt"))).toBeNull();
  });
  it("con movimiento reducido no se menea", () => {
    expect(animColgado("paseando", true, true, solo("Hurt"))).toBeNull();
  });
  it("trabajando y guardándose no cambian de pose", () => {
    expect(animColgado("trabajando", true, false, solo("Hurt"))).toBeNull();
    expect(animColgado("guardandose", true, false, solo("Hurt"))).toBeNull();
  });
  it("el aterrizaje cae primero de costado y se queja si no puede", () => {
    expect(ATERRIZAJE).toEqual(["HitGround", "Trip", "Hurt"]);
  });
});
