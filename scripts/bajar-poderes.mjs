// Uso: node scripts/bajar-poderes.mjs
// Baja los efectos de ataque ya animados de PMD: Origins (audinowho/DumpAsset) y los deja como hojas PNG.
// La lógica vive en src/descarga/pokemon.ts: la misma que usa la app al prepararse.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bajarPoderes } from "../src/descarga/pokemon.ts";

const assets = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "pokemon");
await bajarPoderes({ assets, aviso: (m) => console.log(m) });
console.log(`Listo en ${join(assets, "poderes")}`);
