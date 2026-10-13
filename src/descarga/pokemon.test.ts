import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ErrorDescarga } from "./descargar";
import {
  bajarEspecie,
  bajarPoderes,
  carpetaDeEspecie,
  EFECTOS,
  esAudio,
  esPng,
  especieCompleta,
  NECESARIAS,
  parsearAnimData,
  pasoDeEspecie,
  poderesCompletos,
  TOPE_ARCHIVO,
  type Traer,
  traerConFetch,
} from "./pokemon";

const carpetas: string[] = [];
const temporal = () => {
  const d = mkdtempSync(join(tmpdir(), "poke-assets-"));
  carpetas.push(d);
  return d;
};
afterEach(() => {
  for (const c of carpetas.splice(0)) rmSync(c, { recursive: true, force: true });
});

const anim = (nombre: string, extra = "") =>
  `<Anim><Name>${nombre}</Name><FrameWidth>32</FrameWidth><FrameHeight>40</FrameHeight><Durations><Duration>4</Duration><Duration>6</Duration></Durations>${extra}</Anim>`;
const xml = (...partes: string[]) => `<AnimData><Anims>${partes.join("")}</Anims></AnimData>`;

/** PNG falso: solo importa el alto, en los bytes 20 a 23. */
const png = (alto: number) => {
  const b = Buffer.alloc(40);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(alto, 20);
  return b;
};

/** Un servidor de mentira: sirve AnimData con las 8 necesarias y una extra, y cuenta los pedidos. */
function falsoSpriteCollab(opciones: { fallar?: (url: string) => boolean } = {}) {
  const pedidos: string[] = [];
  const datos = xml(...NECESARIAS.map((n) => anim(n)), anim("Attack", "<HitFrame>1</HitFrame>"));
  const traer: Traer = async (url) => {
    pedidos.push(url);
    if (opciones.fallar?.(url)) throw new ErrorDescarga("red", "sin red");
    if (url.endsWith("AnimData.xml")) return Buffer.from(datos);
    if (url.endsWith("credits.txt")) return Buffer.from("autor: alguien");
    if (url.endsWith(".ogg")) return Buffer.from("OggS");
    if (url.includes("/0000/0001/") && url.includes("Sleep")) throw new ErrorDescarga("http", "404");
    return png(80);
  };
  return { traer, pedidos };
}

describe("parsearAnimData", () => {
  it("lee tamaños, duraciones, copias y cuadro de golpe", () => {
    const m = parsearAnimData(
      xml(
        anim("Walk"),
        anim("Attack", "<HitFrame>1</HitFrame>"),
        "<Anim><Name>Hurt</Name><CopyOf>Pain</CopyOf></Anim>",
      ),
    );
    expect(m.get("Walk")).toMatchObject({ ancho: 32, alto: 40, duraciones: [4, 6], golpe: null });
    expect(m.get("Attack")?.golpe).toBe(1);
    expect(m.get("Hurt")?.copiaDe).toBe("Pain");
  });
});

describe("bajarEspecie", () => {
  it("baja hojas, shiny, grito y créditos, y deja anims.json al final", async () => {
    const assets = temporal();
    const { traer } = falsoSpriteCollab();
    const avances: [number, number][] = [];
    const r = await bajarEspecie({ assets, especie: 25, traer, alProgreso: (h, t) => avances.push([h, t]) });
    expect(carpetaDeEspecie(25)).toBe("0025");
    expect(r.anims).toBe(9);
    expect(r.shiny).toBe(8); // Sleep no tiene shiny
    expect(existsSync(join(assets, "0025", "grito.ogg"))).toBe(true);
    const anims = JSON.parse(readFileSync(join(assets, "0025", "anims.json"), "utf8"));
    expect(anims.Walk).toEqual({ ancho: 32, alto: 40, duraciones: [4, 6], filas: 2 });
    expect(anims.Attack.golpe).toBe(1);
    expect(await especieCompleta(assets, 25)).toBe(true);
    // El progreso llega hasta el total (9 hojas + grito).
    expect(avances.at(-1)).toEqual([10, 10]);
  });

  it("si se corta no queda anims.json, y al repetir solo pide lo que faltaba", async () => {
    const assets = temporal();
    const corta = falsoSpriteCollab({ fallar: (u) => u.endsWith("/Pose-Anim.png") });
    await expect(bajarEspecie({ assets, especie: 25, traer: corta.traer })).rejects.toMatchObject({
      tipo: "red",
    });
    expect(await especieCompleta(assets, 25)).toBe(false);
    expect(existsSync(join(assets, "0025", "anims.json"))).toBe(false);
    // No queda ninguna hoja a medias.
    expect(existsSync(join(assets, "0025", "Pose-Anim.png.parcial"))).toBe(false);

    const entera = falsoSpriteCollab();
    await bajarEspecie({ assets, especie: 25, traer: entera.traer });
    const hojas = entera.pedidos.filter((u) => u.endsWith("-Anim.png") && !u.includes("/0000/0001/"));
    // Walk, Idle, Sleep, Hop y Charge ya estaban de la primera vez.
    expect(hojas.some((u) => u.endsWith("/Walk-Anim.png"))).toBe(false);
    expect(hojas.some((u) => u.endsWith("/Pose-Anim.png"))).toBe(true);
    expect(await especieCompleta(assets, 25)).toBe(true);
  });

  it("una hoja opcional que falla se omite; una necesaria que falla detiene todo", async () => {
    const assets = temporal();
    const opcional = falsoSpriteCollab({ fallar: (u) => u.endsWith("/Attack-Anim.png") });
    const r = await bajarEspecie({ assets, especie: 4, traer: opcional.traer });
    expect(r.omitidas).toEqual(["Attack"]);
  });

  it("una cancelación no se disfraza de hoja opcional omitida", async () => {
    const assets = temporal();
    const t: Traer = async (url) => {
      if (url.endsWith("/Attack-Anim.png")) throw new ErrorDescarga("cancelada", "x");
      return falsoSpriteCollab().traer(url);
    };
    await expect(bajarEspecie({ assets, especie: 4, traer: t })).rejects.toMatchObject({ tipo: "cancelada" });
  });
});

describe("bajarEspecie con datos remotos hostiles", () => {
  /** Servidor de mentira cuyo AnimData trae `extra` además de las 8 necesarias. */
  const conExtra = (extra: string) => {
    const pedidos: string[] = [];
    const traer: Traer = async (url) => {
      pedidos.push(url);
      if (url.endsWith("AnimData.xml")) return Buffer.from(xml(...NECESARIAS.map((n) => anim(n)), extra));
      if (url.endsWith(".ogg")) return Buffer.from("OggS");
      if (url.endsWith("credits.txt")) return Buffer.from("x");
      return png(80);
    };
    return { traer, pedidos };
  };

  it("un <Name> con ../ no escribe fuera de la carpeta de la especie ni se pide a la URL", async () => {
    const assets = temporal();
    const { traer, pedidos } = conExtra(anim("../../../FUERA"));
    const avisos: string[] = [];
    const r = await bajarEspecie({ assets, especie: 25, traer, aviso: (m) => avisos.push(m) });
    expect(existsSync(join(assets, "FUERA-Anim.png"))).toBe(false);
    expect(existsSync(join(assets, "..", "FUERA-Anim.png"))).toBe(false);
    expect(pedidos.some((u) => u.includes(".."))).toBe(false);
    expect(r.omitidas).toContain("../../../FUERA");
    expect(avisos.some((a) => a.includes("nombre no válido"))).toBe(true);
  });

  it.each([
    ["barra", "a/b"],
    ["barra invertida", "a\\b"],
    ["punto", "a.b"],
    ["vacío", ""],
    ["espacio", "a b"],
    ["porcentaje", "%2e%2e"],
  ])("el nombre con %s se omite", async (_c, nombre) => {
    const assets = temporal();
    const { traer, pedidos } = conExtra(anim(nombre));
    const r = await bajarEspecie({ assets, especie: 25, traer });
    expect(r.omitidas).toContain(nombre);
    expect(pedidos.filter((u) => u.includes("Anim.png")).length).toBe(8 * 2);
  });

  it("un <CopyOf> con ../ se omite y no sale a pedir esa URL", async () => {
    const assets = temporal();
    const hostil = `<Anim><Name>Hostil</Name><CopyOf>../../x</CopyOf></Anim>`;
    const { traer, pedidos } = conExtra(hostil);
    const r = await bajarEspecie({ assets, especie: 25, traer });
    expect(r.omitidas).toContain("Hostil");
    expect(pedidos.some((u) => u.includes(".."))).toBe(false);
  });

  it.each([0, -1, 1.5, Number.NaN, 100_000, Number.POSITIVE_INFINITY])(
    "la especie %s no es válida",
    async (n) => {
      const { traer, pedidos } = conExtra("");
      await expect(bajarEspecie({ assets: temporal(), especie: n, traer })).rejects.toThrow(/especie/i);
      expect(pedidos).toEqual([]);
    },
  );
});

describe("contenido de lo bajado", () => {
  const servidor = (cambiar: (url: string) => Buffer | null) => {
    const traer: Traer = async (url) => {
      const raro = cambiar(url);
      if (raro) return raro;
      if (url.endsWith("AnimData.xml"))
        return Buffer.from(xml(...NECESARIAS.map((n) => anim(n)), anim("Extra")));
      if (url.endsWith(".ogg")) return Buffer.from("OggS....");
      if (url.endsWith("credits.txt")) return Buffer.from("x");
      return png(80);
    };
    return traer;
  };
  const html = Buffer.from("<html><body>404: Not Found</body></html>");

  it("una hoja necesaria que no es PNG falla y no se guarda", async () => {
    const assets = temporal();
    const traer = servidor((u) => (u.endsWith("/Walk-Anim.png") ? html : null));
    await expect(bajarEspecie({ assets, especie: 25, traer })).rejects.toMatchObject({ tipo: "integridad" });
    expect(existsSync(join(assets, "0025", "Walk-Anim.png"))).toBe(false);
    expect(existsSync(join(assets, "0025", "anims.json"))).toBe(false);
  });

  it("una hoja opcional que no es PNG se omite y no se guarda", async () => {
    const assets = temporal();
    const traer = servidor((u) => (u.endsWith("/Extra-Anim.png") ? html : null));
    const r = await bajarEspecie({ assets, especie: 25, traer });
    expect(r.omitidas).toEqual(["Extra"]);
    expect(existsSync(join(assets, "0025", "Extra-Anim.png"))).toBe(false);
  });

  it("un shiny que no es PNG no se guarda (el shiny usa la hoja normal)", async () => {
    const assets = temporal();
    const traer = servidor((u) => (u.includes("/0000/0001/Idle-Anim.png") ? html : null));
    const r = await bajarEspecie({ assets, especie: 25, traer });
    expect(existsSync(join(assets, "0025", "shiny", "Idle-Anim.png"))).toBe(false);
    expect(r.shiny).toBe(8);
  });

  it("un grito que no es Ogg falla y no se guarda", async () => {
    const assets = temporal();
    const traer = servidor((u) => (u.endsWith(".ogg") ? html : null));
    await expect(bajarEspecie({ assets, especie: 25, traer })).rejects.toMatchObject({ tipo: "integridad" });
    expect(existsSync(join(assets, "0025", "grito.ogg"))).toBe(false);
    expect(await especieCompleta(assets, 25)).toBe(false);
  });

  it("un archivo de más de 5 MB se descarta aunque sea un PNG", async () => {
    const assets = temporal();
    const enorme = Buffer.concat([png(80), Buffer.alloc(TOPE_ARCHIVO)]);
    const traer = servidor((u) => (u.endsWith("/Idle-Anim.png") ? enorme : null));
    await expect(bajarEspecie({ assets, especie: 25, traer })).rejects.toMatchObject({ tipo: "integridad" });
    expect(existsSync(join(assets, "0025", "Idle-Anim.png"))).toBe(false);
  });

  it("un <Name>__proto__ queda como una clave más y no contamina Object.prototype", async () => {
    const assets = temporal();
    const traer: Traer = async (url) => {
      if (url.endsWith("AnimData.xml"))
        return Buffer.from(xml(...NECESARIAS.map((n) => anim(n)), anim("__proto__")));
      if (url.endsWith(".ogg")) return Buffer.from("OggS....");
      if (url.endsWith("credits.txt")) return Buffer.from("x");
      return png(80);
    };
    await bajarEspecie({ assets, especie: 25, traer });
    const texto = readFileSync(join(assets, "0025", "anims.json"), "utf8");
    expect(texto).toContain('"__proto__"');
    expect(({} as Record<string, unknown>).ancho).toBeUndefined();
    expect(Object.keys(Object.prototype)).toEqual([]);
  });

  it("esPng y esAudio miran la firma, no la extensión", () => {
    expect(esPng(png(1))).toBe(true);
    expect(esPng(html)).toBe(false);
    expect(esPng(Buffer.alloc(0))).toBe(false);
    expect(esAudio(Buffer.from("OggS"))).toBe(true);
    // El grito de Pikachu en PokeAPI/cries es un MP3 llamado .ogg: trama MPEG (ff fb) o etiqueta ID3.
    expect(esAudio(Buffer.from([0xff, 0xfb, 0x94, 0xc4]))).toBe(true);
    expect(esAudio(Buffer.from("ID3\u0004"))).toBe(true);
    expect(esAudio(Buffer.from("RIFF"))).toBe(false);
    expect(esAudio(html)).toBe(false);
    expect(esAudio(Buffer.alloc(0))).toBe(false);
  });
});

describe("traerConFetch con un servidor real", () => {
  it("corta un cuerpo de más de 5 MB aunque no declare su tamaño", async () => {
    const { createServer } = await import("node:http");
    const srv = createServer((_q, res) => {
      res.writeHead(200); // sin Content-Length: chunked
      res.write(Buffer.alloc(TOPE_ARCHIVO + 1000));
      res.end();
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    const { port } = srv.address() as { port: number };
    try {
      await expect(traerConFetch(`http://127.0.0.1:${port}/x`)).rejects.toMatchObject({ tipo: "integridad" });
    } finally {
      srv.close();
    }
  });

  it("rechaza por la cabecera Content-Length sin leer el cuerpo", async () => {
    const { createServer } = await import("node:http");
    const srv = createServer((_q, res) => {
      res.writeHead(200, { "Content-Length": TOPE_ARCHIVO + 1 });
      res.end(Buffer.alloc(10)); // se corta, pero ya se había rechazado
      res.destroy();
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    const { port } = srv.address() as { port: number };
    try {
      await expect(traerConFetch(`http://127.0.0.1:${port}/x`)).rejects.toMatchObject({ tipo: "integridad" });
    } finally {
      srv.close();
    }
  });

  it("un cuerpo normal pasa entero", async () => {
    const { createServer } = await import("node:http");
    const srv = createServer((_q, res) => res.end("hola"));
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    const { port } = srv.address() as { port: number };
    try {
      expect((await traerConFetch(`http://127.0.0.1:${port}/x`)).toString()).toBe("hola");
    } finally {
      srv.close();
    }
  });
});

describe("bajarPoderes", () => {
  const dir = (alto: number, cuadros: number) => {
    const imagen = png(alto);
    const cabeza = Buffer.alloc(8);
    cabeza.writeBigInt64LE(BigInt(imagen.length));
    const cola = Buffer.alloc(16);
    cola.writeInt32LE(24, 0);
    cola.writeInt32LE(alto, 4);
    cola.writeInt32LE(0, 8);
    cola.writeInt32LE(cuadros, 12);
    return Buffer.concat([cabeza, imagen, cola]);
  };

  it("baja los nueve efectos (dos hojas por efecto) y escribe poderes.json al final", async () => {
    const assets = temporal();
    expect(await poderesCompletos(assets)).toBe(false);
    await bajarPoderes({ assets, traer: async () => dir(32, 5) });
    expect(await poderesCompletos(assets)).toBe(true);
    const json = JSON.parse(readFileSync(join(assets, "poderes", "poderes.json"), "utf8"));
    expect(Object.keys(json)).toEqual([...EFECTOS]);
    expect(json.Spark).toEqual({ ancho: 24, alto: 32, cuadros: 5 });
  });
});

describe("poderes inválidos", () => {
  it("un efecto cuyo PNG no es PNG se rechaza y no se guarda poderes.json", async () => {
    const assets = temporal();
    const cabeza = Buffer.alloc(8);
    const falso = Buffer.alloc(60, 1);
    cabeza.writeBigInt64LE(BigInt(40));
    await expect(bajarPoderes({ assets, traer: async () => Buffer.concat([cabeza, falso]) })).rejects.toThrow(
      /PNG/,
    );
    expect(existsSync(join(assets, "poderes", "poderes.json"))).toBe(false);
  });
});

describe("pasoDeEspecie", () => {
  it("completo() solo es verdadero con la especie entera", async () => {
    const assets = temporal();
    const paso = pasoDeEspecie(assets, 25, "Pikachu", falsoSpriteCollab().traer);
    expect(await paso.completo()).toBe(false);
    await paso.ejecutar({ alBytes: () => {} });
    expect(await paso.completo()).toBe(true);
  });
});
