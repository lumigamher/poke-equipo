// Genera build/icon.icns a partir del dibujo pixel-art de la pokébola (src/compartido/pokebola-pixeles.ts, el mismo
// de la app). Sin dependencias: PNG escrito a mano con zlib + iconutil de macOS. Uso: `bun run icono`.
//   bun run icono -- --vista ruta.png     además guarda una vista previa PNG de 512 px
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { POKEBOLA_COLORES, POKEBOLA_FILAS } from "../src/compartido/pokebola-pixeles.ts";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAPEL = "#f7f2e4"; // --papel de estilos.css (fondo de las tarjetas)
const TINTA = "#26221c"; // --borde de estilos.css

// Geometría en un lienzo de 1024 (la rejilla de íconos de macOS: cuadrado de 824 con 100 de margen).
const L = 1024;
const MARGEN = 100;
const RADIO = 185;
const BORDE = 20;
const CELDA = 56; // píxel del dibujo: 10 columnas = 560
const ANCHO = POKEBOLA_FILAS[0].length;
const ALTO = POKEBOLA_FILAS.length;
const X0 = (L - ANCHO * CELDA) / 2;
const Y0 = (L - ALTO * CELDA) / 2;

const rgb = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
const colores = Object.fromEntries(Object.entries(POKEBOLA_COLORES).map(([k, v]) => [k, rgb(v)]));
const papel = rgb(PAPEL);
const tinta = rgb(TINTA);

/** ¿El punto cae dentro del cuadrado redondeado, encogido `inset`? */
function dentro(x, y, inset) {
  const a = MARGEN + inset;
  const b = L - MARGEN - inset;
  const r = Math.max(RADIO - inset, 0);
  if (x < a || x > b || y < a || y > b) return false;
  const cx = x < a + r ? a + r : x > b - r ? b - r : x;
  const cy = y < a + r ? a + r : y > b - r ? b - r : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Color RGBA de un punto del lienzo (0..1024): vecino más cercano, sin suavizado. */
function muestra(x, y) {
  if (!dentro(x, y, 0)) return [0, 0, 0, 0];
  if (!dentro(x, y, BORDE)) return [...tinta, 255];
  const cx = Math.floor((x - X0) / CELDA);
  const cy = Math.floor((y - Y0) / CELDA);
  if (cx >= 0 && cx < ANCHO && cy >= 0 && cy < ALTO) {
    const c = POKEBOLA_FILAS[cy][cx];
    if (c !== ".") return [...colores[c], 255];
  }
  return [...papel, 255];
}

/** Pinta el ícono a `n` px: cada píxel toma el punto central (vecino más cercano). Solo el contorno redondeado del
 * cuadrado se promedia (3x3) para que no quede escalonado; el dibujo de la pokébola queda nítido. */
function pintar(n) {
  const px = Buffer.alloc(n * n * 4);
  const k = L / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * k;
      const y = (j + 0.5) * k;
      let color = muestra(x, y);
      const contorno = !dentro(x, y, 0) || !dentro(x, y, BORDE);
      if (contorno && n >= 32) {
        let cov = 0;
        const suma = [0, 0, 0];
        for (let v = 0; v < 3; v++) {
          for (let u = 0; u < 3; u++) {
            const m = muestra((i + (u + 0.5) / 3) * k, (j + (v + 0.5) / 3) * k);
            if (m[3]) {
              cov++;
              for (let c = 0; c < 3; c++) suma[c] += m[c];
            }
          }
        }
        color = cov ? [...suma.map((s) => Math.round(s / cov)), Math.round((cov / 9) * 255)] : [0, 0, 0, 0];
      }
      px.set(color, (j * n + i) * 4);
    }
  }
  return px;
}

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function trozo(tipo, datos) {
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}
function png(n, rgba) {
  const cab = Buffer.alloc(13);
  cab.writeUInt32BE(n, 0);
  cab.writeUInt32BE(n, 4);
  cab.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
  const filas = Buffer.alloc(n * (n * 4 + 1));
  for (let y = 0; y < n; y++) rgba.copy(filas, y * (n * 4 + 1) + 1, y * n * 4, (y + 1) * n * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", cab),
    trozo("IDAT", deflateSync(filas, { level: 9 })),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

// Nombres que exige iconutil: tamaño base y @2x.
const CONJUNTO = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];

const iVista = process.argv.indexOf("--vista");
const vista = iVista > 0 ? process.argv[iVista + 1] : null;

const temporal = mkdtempSync(join(tmpdir(), "poke-icono-"));
try {
  const conjunto = join(temporal, "icon.iconset");
  mkdirSync(conjunto);
  const hechos = new Map();
  for (const [nombre, n] of CONJUNTO) {
    if (!hechos.has(n)) hechos.set(n, png(n, pintar(n)));
    writeFileSync(join(conjunto, nombre), hechos.get(n));
  }
  mkdirSync(join(raiz, "build"), { recursive: true });
  execFileSync("iconutil", ["-c", "icns", conjunto, "-o", join(raiz, "build", "icon.icns")]);
  console.log(`build/icon.icns listo (${[...hechos.keys()].join(", ")} px)`);
  if (vista) {
    writeFileSync(vista, hechos.get(512));
    console.log(`vista previa: ${vista}`);
  }
} finally {
  rmSync(temporal, { recursive: true, force: true });
}
