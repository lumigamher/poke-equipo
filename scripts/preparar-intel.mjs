// Uso: node scripts/preparar-intel.mjs
// Para armar el .dmg de Intel desde un Mac de Apple Silicon (o al revés) hacen falta los binarios nativos de la otra
// arquitectura, que npm/bun no instalan porque no son los de esta máquina: el ejecutable de Claude Code del SDK y
// sherpa-onnx. Este script los baja del registro de npm, pero SOLO la versión que fija bun.lock y solo si el
// archivo bajado tiene exactamente el sha512 que bun.lock registra (si no, aborta sin instalar nada).
// electron-builder.config.mjs deja fuera de cada instalador los de la arquitectura contraria.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const lock = readFileSync(join(raiz, "bun.lock"), "utf8");

/** Versión e integridad que fija bun.lock para un paquete; aborta si no está. */
function delLock(nombre) {
  const escapado = nombre.replace(/[/@.-]/g, "\\$&");
  const m = new RegExp(`"${escapado}": \\["${escapado}@([^"]+)", "", \\{[^}]*\\}, "(sha512-[^"]+)"\\]`).exec(
    lock,
  );
  if (!m)
    throw new Error(`${nombre} no está en bun.lock con su sha512: corre "bun install" y vuelve a intentar.`);
  return { version: m[1], integridad: m[2] };
}

const necesarios = ["@anthropic-ai/claude-agent-sdk-darwin-x64", "sherpa-onnx-darwin-x64"];
const trabajo = mkdtempSync(join(tmpdir(), "poke-intel-"));
try {
  for (const nombre of necesarios) {
    const { version, integridad } = delLock(nombre);
    const destino = join(raiz, "node_modules", nombre);
    const instalada = existsSync(join(destino, "package.json"))
      ? JSON.parse(readFileSync(join(destino, "package.json"), "utf8")).version
      : null;
    if (instalada === version) {
      console.log(`${nombre}@${version} ya está.`);
      continue;
    }
    if (instalada) console.log(`${nombre}: hay ${instalada} y el lock pide ${version}; se reemplaza.`);
    console.log(`Bajando ${nombre}@${version}…`);
    const salida = execFileSync("npm", ["pack", `${nombre}@${version}`, "--silent"], {
      cwd: trabajo,
      encoding: "utf8",
    });
    const tgz = join(trabajo, salida.trim().split("\n").pop());
    const real = `sha512-${createHash("sha512").update(readFileSync(tgz)).digest("base64")}`;
    if (real !== integridad)
      throw new Error(`${nombre}@${version}: el sha512 del paquete bajado no coincide con bun.lock.`);
    const carpeta = join(trabajo, nombre.replace("/", "__"));
    mkdirSync(carpeta, { recursive: true });
    execFileSync("/usr/bin/tar", ["-xzf", tgz, "-C", carpeta]);
    const nuevo = JSON.parse(readFileSync(join(carpeta, "package", "package.json"), "utf8"));
    if (nuevo.version !== version)
      throw new Error(`${nombre}: la versión del paquete (${nuevo.version}) no es ${version}.`);
    rmSync(destino, { recursive: true, force: true });
    mkdirSync(dirname(destino), { recursive: true });
    renameSync(join(carpeta, "package"), destino);
  }
  console.log("Listo para armar el instalador de Intel.");
} finally {
  rmSync(trabajo, { recursive: true, force: true });
}
