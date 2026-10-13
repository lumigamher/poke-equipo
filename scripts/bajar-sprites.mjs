// Uso: node scripts/bajar-sprites.mjs [numero de la Pokédex]   (25 = Pikachu)
// La lógica vive en src/descarga/pokemon.ts: la misma que usa la app al prepararse. Reutiliza lo ya bajado.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bajarEspecie, especieValida } from "../src/descarga/pokemon.ts";

const especie = Number(process.argv[2] ?? 25);
if (!especieValida(especie)) {
  console.error("Uso: node scripts/bajar-sprites.mjs [número de la Pokédex, entero de 1 a 9999]");
  process.exit(1);
}
const assets = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "pokemon");

const r = await bajarEspecie({ assets, especie, aviso: (m) => console.warn(m) });
console.log(
  `${String(especie).padStart(4, "0")}: ${r.anims} animaciones, ${r.shiny} shiny. Omitidas: ${r.omitidas.join(", ") || "ninguna"}.`,
);
console.log(`Listo en ${r.destino}`);
