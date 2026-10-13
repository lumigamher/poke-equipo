// Empaquetado de Poke Equipo con electron-builder. Se usa con `bun run dist:mac` (ver docs/INSTALAR.md).
//
// Firma: sin certificado el .dmg sale con firma ad-hoc (`identity: "-"`): hace falta al menos eso para que Apple
// Silicon ejecute el binario, pero macOS lo marca "de desarrollador no identificado" y hay que abrirlo con
// clic derecho > Abrir (ver docs/INSTALAR.md). Con certificado de Apple basta con exportar estas variables
// de entorno (NADA de esto va en el repo):
//   CSC_LINK / CSC_KEY_PASSWORD        certificado "Developer ID Application" (.p12 en base64 o ruta) y su clave
//   CSC_NAME                           alternativa: nombre del certificado ya instalado en el llavero
//   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID        notarización con Apple ID
//   APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER           notarización con llave de API de App Store Connect
//   APPLE_KEYCHAIN, APPLE_KEYCHAIN_PROFILE                      notarización con perfil de llavero (notarytool)
import { copyFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const env = process.env;

/**
 * La app se arma y se firma en una carpeta de trabajo FUERA del repo (por omisión, la temporal del sistema) y al
 * final el .dmg y el .zip se copian a dist/. Motivo: si el repo vive en una carpeta sincronizada con iCloud
 * (~/Documents, ~/Desktop), el servicio de archivos le pega a cada carpeta de la app atributos (com.apple.FinderInfo,
 * com.apple.fileprovider.*) en cuanto se crea, y `codesign` falla con "resource fork, Finder information, or
 * similar detritus not allowed". POKE_STAGING cambia esa carpeta de trabajo.
 */
const trabajo = env.POKE_STAGING || join(tmpdir(), "poke-equipo-build");

/** Deja los instaladores terminados en dist/ (dentro del repo, carpeta ignorada). */
async function copiarADist(resultado) {
  const destino = join(resultado.configuration.projectDir ?? process.cwd(), "dist");
  await mkdir(destino, { recursive: true });
  for (const ruta of resultado.artifactPaths) await copyFile(ruta, join(destino, basename(ruta)));
  return [];
}

/** Arquitectura del instalador (la fijan los scripts dist:mac*). Los binarios nativos de la contraria se dejan fuera. */
const arch = env.POKE_ARCH || process.arch;
const contraria = arch === "arm64" ? "x64" : "arm64";

const hayCertificado = Boolean(env.CSC_LINK || env.CSC_NAME);
const hayNotarizacion = Boolean(
  (env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID) ||
    (env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER) ||
    (env.APPLE_KEYCHAIN && env.APPLE_KEYCHAIN_PROFILE),
);

/** @type {import("electron-builder").Configuration} */
export default {
  appId: "com.lumigamher.pokeequipo",
  productName: "Poke Equipo",
  copyright: "Poke Equipo",
  // Electron nombra la carpeta de datos por package.json: en desarrollo "poke-equipo" (la base de quien desarrolla),
  // en la app instalada "Poke Equipo" (~/Library/Application Support/Poke Equipo): no comparten base ni datos.
  extraMetadata: { productName: "Poke Equipo" },
  // Fuses de Electron (se fijan en el binario al empaquetar): sin ELECTRON_RUN_AS_NODE, sin NODE_OPTIONS ni
  // --inspect, y la app solo carga código desde su app.asar, con su integridad validada. No hace falta runAsNode: la
  // voz usa utilityProcess y el ejecutable de Claude se lanza directo. grantFileProtocolExtraPrivileges queda en su
  // valor por defecto (activo) porque la ventana carga su renderer con file://.
  electronFuses: {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    onlyLoadAppFromAsar: true,
    enableEmbeddedAsarIntegrityValidation: true,
  },
  directories: { output: trabajo, buildResources: "build" },
  // Lo que viaja dentro de la app: el código compilado y config/. Ni modelos ni sprites ni gritos (no son nuestros
  // y pesan: se bajan en el equipo de cada persona, ver src/descarga).
  files: [
    "out/**",
    "config/**",
    "package.json",
    "!**/*.map",
    `!node_modules/@anthropic-ai/claude-agent-sdk-darwin-${contraria}/**`,
    `!node_modules/sherpa-onnx-darwin-${contraria}/**`,
  ],
  asar: true,
  // Solo sale del asar lo que tiene que ejecutarse o cargarse como binario: los .node y .dylib de sherpa-onnx +
  // onnxruntime (las dylibs se buscan junto al .node) y el ejecutable de Claude Code que trae el SDK. Los .js se
  // quedan dentro del asar, protegidos por su validación de integridad.
  asarUnpack: [
    "node_modules/sherpa-onnx-*/**/*.node",
    "node_modules/sherpa-onnx-*/**/*.dylib",
    "node_modules/@anthropic-ai/claude-agent-sdk-*/claude",
  ],
  // sherpa-onnx-node y el SDK ya traen sus binarios compilados: no hay nada que recompilar.
  npmRebuild: false,
  buildDependenciesFromSource: false,
  electronLanguages: ["es", "en"],
  afterAllArtifactBuild: copiarADist,
  artifactName: "Poke-Equipo-${version}-${arch}.${ext}",
  mac: {
    category: "public.app-category.developer-tools",
    target: ["dmg", "zip"],
    // Ícono propio (la pokébola pixel-art de la app): se regenera con `bun run icono`.
    icon: "build/icon.icns",
    identity: hayCertificado ? undefined : "-",
    hardenedRuntime: hayCertificado,
    gatekeeperAssess: false,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
    notarize: hayCertificado && hayNotarizacion,
    extendInfo: {
      NSMicrophoneUsageDescription: "Poke Equipo usa el micrófono para oír tus órdenes habladas.",
    },
  },
  dmg: { title: "Poke Equipo ${version}" },
};
