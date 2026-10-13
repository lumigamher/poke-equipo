import type { VistaPokemon } from "@compartido/tipos";
import { ESTADOS } from "@compartido/tipos";
import { describe, expect, it } from "vitest";
import {
  botonesActivos,
  burbujaAMostrar,
  colorPS,
  completarComando,
  datosFicha,
  debeMostrarse,
  debeSoltarFoco,
  ETIQUETAS,
  etiquetaChip,
  GRACIA_PERMISO_MS,
  hayTexto,
  MAX_SUGERENCIAS,
  posicionBurbuja,
  sugerenciasPara,
} from "./burbuja-logica";

const base: VistaPokemon = {
  id: "p1",
  nombre: "Pikachu",
  especie: 25,
  estado: "paseando",
  desde: 0,
  alterados: [],
  ps: 100,
  burbuja: { tipo: "respuesta", texto: "Listo." },
  permiso: null,
  actividad: null,
  microfono: true,
  borrador: null,
  ultimaRespuesta: null,
};

describe("debeMostrarse", () => {
  it("se muestra sola cuando el Pokémon tiene algo que decir", () => {
    for (const estado of ["escuchando", "pidiendo_permiso", "termino", "esperando", "error"] as const) {
      expect(debeMostrarse({ ...base, estado }, false)).toBe(true);
    }
  });

  it("paseando, trabajando o dormido solo se muestra si la persona la fijó con un clic", () => {
    for (const estado of ["paseando", "trabajando", "dormido", "cansado"] as const) {
      expect(debeMostrarse({ ...base, estado }, false)).toBe(false);
      expect(debeMostrarse({ ...base, estado }, true)).toBe(true);
    }
  });

  it("un aviso se muestra solo en cualquier estado menos guardándose", () => {
    const aviso = { tipo: "aviso", texto: "Te oí. Faltan 3." } as const;
    for (const estado of ESTADOS.filter((e) => e !== "guardandose")) {
      expect(debeMostrarse({ ...base, estado, burbuja: aviso }, false)).toBe(true);
    }
    expect(debeMostrarse({ ...base, estado: "guardandose", burbuja: aviso }, false)).toBe(false);
  });

  it("un borrador pendiente se muestra solo, también mientras trabaja", () => {
    const escucha = { tipo: "escucha", texto: "corre los tests" } as const;
    for (const estado of ["paseando", "trabajando", "cansado", "dormido", "escuchando"] as const) {
      expect(debeMostrarse({ ...base, estado, burbuja: escucha, borrador: 1 }, false)).toBe(true);
    }
    expect(debeMostrarse({ ...base, estado: "guardandose", burbuja: escucha, borrador: 1 }, false)).toBe(
      false,
    );
  });

  it("una respuesta o una escucha sin borrador no se muestran solas mientras pasea o trabaja", () => {
    expect(
      debeMostrarse({ ...base, estado: "trabajando", burbuja: { tipo: "escucha", texto: "x" } }, false),
    ).toBe(false);
    expect(debeMostrarse({ ...base, estado: "paseando" }, false)).toBe(false);
  });

  it("un aviso sin texto no se dibuja", () => {
    expect(debeMostrarse({ ...base, burbuja: { tipo: "aviso", texto: "  " } }, false)).toBe(false);
  });

  it("un permiso pendiente siempre se muestra", () => {
    const permiso = { id: "t1", herramienta: "Bash", detalle: "rm" };
    expect(debeMostrarse({ ...base, estado: "trabajando", burbuja: null, permiso }, false)).toBe(true);
  });

  it("un permiso pendiente se muestra aunque el Pokémon se esté guardando", () => {
    const permiso = { id: "t1", herramienta: "Bash", detalle: "rm" };
    expect(debeMostrarse({ ...base, estado: "guardandose", burbuja: null, permiso }, false)).toBe(true);
  });

  it("sin burbuja ni permiso, fijada muestra el cuadro para escribir", () => {
    expect(debeMostrarse({ ...base, burbuja: null }, false)).toBe(false);
    expect(debeMostrarse({ ...base, burbuja: null }, true)).toBe(true);
  });

  it("guardándose no muestra nada", () => {
    expect(debeMostrarse({ ...base, estado: "guardandose" }, true)).toBe(false);
  });
});

describe("colorPS", () => {
  it("cambia en 50 y en 20", () => {
    expect(colorPS(100)).toBe("bien");
    expect(colorPS(51)).toBe("bien");
    expect(colorPS(50)).toBe("medio");
    expect(colorPS(20)).toBe("medio");
    expect(colorPS(19)).toBe("bajo");
    expect(colorPS(0)).toBe("bajo");
  });
});

describe("ETIQUETAS", () => {
  it("hay una etiqueta corta para cada estado alterado", () => {
    expect(ETIQUETAS).toEqual({ confundido: "CNF", paralizado: "PAR", envenenado: "ENV", dormido: "DOR" });
  });
});

describe("botonesActivos", () => {
  it("espera la gracia antes de activar los botones", () => {
    expect(GRACIA_PERMISO_MS).toBe(800);
    expect(botonesActivos(1000, 1000)).toBe(false);
    expect(botonesActivos(1000, 1799)).toBe(false);
    expect(botonesActivos(1000, 1800)).toBe(true);
  });
});

describe("posicionBurbuja", () => {
  it("centrada en el Pokémon cuando cabe", () => {
    expect(posicionBurbuja(500, 320, 1000)).toBe(340);
  });
  it("se pega al borde izquierdo", () => {
    expect(posicionBurbuja(80, 320, 1000)).toBe(8);
  });
  it("se pega al borde derecho", () => {
    expect(posicionBurbuja(950, 320, 1000)).toBe(1000 - 320 - 8);
  });
  it("si la ventana es más angosta que la burbuja devuelve el margen", () => {
    expect(posicionBurbuja(100, 320, 300)).toBe(8);
  });
});

describe("hayTexto", () => {
  it("ignora textos vacíos o de espacios", () => {
    expect(hayTexto("")).toBe(false);
    expect(hayTexto("  \n ")).toBe(false);
    expect(hayTexto("hola")).toBe(true);
  });
});

describe("burbujaAMostrar", () => {
  it("la burbuja viva manda sobre la última respuesta", () => {
    const viva = { tipo: "escucha", texto: "Te escucho." } as const;
    expect(burbujaAMostrar({ ...base, burbuja: viva, ultimaRespuesta: "antes" }, true)).toBe(viva);
  });

  it("fijada y sin burbuja viva, muestra la última respuesta como respuesta", () => {
    expect(burbujaAMostrar({ ...base, burbuja: null, ultimaRespuesta: "Todo bien." }, true)).toEqual({
      tipo: "respuesta",
      texto: "Todo bien.",
    });
  });

  it("sin fijar, sin respuesta anterior o con un permiso a la vista no inventa nada", () => {
    expect(burbujaAMostrar({ ...base, burbuja: null, ultimaRespuesta: "Todo bien." }, false)).toBeNull();
    expect(burbujaAMostrar({ ...base, burbuja: null, ultimaRespuesta: null }, true)).toBeNull();
    const permiso = { id: "t1", herramienta: "Bash", detalle: "rm" };
    expect(
      burbujaAMostrar({ ...base, burbuja: null, permiso, ultimaRespuesta: "Todo bien." }, true),
    ).toBeNull();
  });
});

describe("sugerencias de comandos", () => {
  const lista = [
    { nombre: "model", descripcion: "", argumento: "<modelo>" },
    { nombre: "reiniciar", descripcion: "", argumento: "" },
    { nombre: "review", descripcion: "", argumento: "" },
    { nombre: "compact", descripcion: "", argumento: "" },
  ];

  it("filtra por el comienzo del nombre, sin importar mayúsculas", () => {
    expect(sugerenciasPara("/re", lista).map((c) => c.nombre)).toEqual(["reiniciar", "review"]);
    expect(sugerenciasPara("/RE", lista).map((c) => c.nombre)).toEqual(["reiniciar", "review"]);
    expect(sugerenciasPara("/", lista)).toHaveLength(4);
  });

  it("no sugiere sin barra ni cuando ya se escribe el argumento", () => {
    expect(sugerenciasPara("re", lista)).toEqual([]);
    expect(sugerenciasPara("/model ", lista)).toEqual([]);
  });

  it("no pasa del tope", () => {
    const muchos = Array.from({ length: 20 }, (_, i) => ({
      nombre: `c${i}`,
      descripcion: "",
      argumento: "",
    }));
    expect(sugerenciasPara("/c", muchos)).toHaveLength(MAX_SUGERENCIAS);
  });

  it("al completar deja espacio solo si el comando espera un argumento", () => {
    expect(completarComando(lista[0])).toBe("/model ");
    expect(completarComando(lista[1])).toBe("/reiniciar");
  });
});

describe("debeSoltarFoco", () => {
  const campoA = { nombre: "campo de A" };
  const campoB = { nombre: "campo de B" };

  it("suelta el foco si el campo que se va es el que lo tiene", () => {
    expect(debeSoltarFoco(campoA, campoA)).toBe(true);
  });

  it("no se lo quita a otra burbuja: cerrar la de A mientras se escribe en la de B", () => {
    expect(debeSoltarFoco(campoA, campoB)).toBe(false);
  });

  it("no hace nada si el campo ya no existe o nadie tiene el foco", () => {
    expect(debeSoltarFoco(null, campoA)).toBe(false);
    expect(debeSoltarFoco(campoA, null)).toBe(false);
    expect(debeSoltarFoco(null, null)).toBe(false);
  });
});

describe("etiquetaChip", () => {
  it("con permiso dice que pide permiso; su aria-label empieza por el texto visible (WCAG 2.5.3)", () => {
    const e = etiquetaChip({
      ...base,
      estado: "pidiendo_permiso",
      permiso: { id: "x", herramienta: "Bash", detalle: "ls" },
    });
    expect(e.indicador).toBe("pide permiso");
    expect(e.aria).toBe("Pikachu pide permiso. Estado: pidiendo permiso. Abrir su burbuja");
  });

  it("con una respuesta dice que habla", () => {
    const e = etiquetaChip({ ...base, estado: "termino" });
    expect(e.indicador).toBe("habla");
    expect(e.estado).toBe("terminó");
    expect(e.aria).toBe("Pikachu habla. Estado: terminó. Abrir su burbuja");
  });

  it("sin permiso ni respuesta, solo el estado", () => {
    const e = etiquetaChip({ ...base, estado: "escuchando", burbuja: { tipo: "escucha", texto: "x" } });
    expect(e.indicador).toBe("");
    expect(e.aria).toBe("Pikachu escuchando. Abrir su burbuja");
  });

  it("todos los estados tienen texto legible y sin guiones bajos", () => {
    for (const estado of ESTADOS) expect(etiquetaChip({ ...base, estado }).estado).not.toMatch(/_|^$/);
  });
});

describe("datosFicha", () => {
  it("con el nombre de su especie solo muestra proyecto y modelo", () => {
    expect(datosFicha({ ...base, proyecto: "acme", modelo: "sonnet" })).toEqual(["acme", "sonnet"]);
  });

  it("con nombre propio la ficha sigue mostrando la especie", () => {
    expect(
      datosFicha({ ...base, nombre: "Rayo", especieNombre: "Pikachu", proyecto: "acme", modelo: "sonnet" }),
    ).toEqual(["Pikachu", "acme", "sonnet"]);
  });
});
