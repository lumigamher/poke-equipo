import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { politicaCsp } from "./src/compartido/csp";

export default defineConfig({
  main: { resolve: { alias: { "@compartido": resolve("src/compartido") } } },
  preload: {
    resolve: { alias: { "@compartido": resolve("src/compartido") } },
    // Dos preloads: el de la escena y el mínimo de la ventana de preparación (que corre con sandbox).
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/preload/index.ts"),
          preparacion: resolve("src/preload/preparacion.ts"),
        },
      },
    },
  },
  renderer: {
    resolve: { alias: { "@compartido": resolve("src/compartido") } },
    plugins: [
      react(),
      {
        // Inserta la CSP en el HTML: estricta al empaquetar, con lo mínimo extra para Vite en desarrollo.
        name: "poke-csp",
        transformIndexHtml(html, contexto) {
          const meta = `<meta http-equiv="Content-Security-Policy" content="${politicaCsp({ dev: contexto.server !== undefined })}" />`;
          return html.replace("</title>", `</title>\n    ${meta}`);
        },
      },
    ],
  },
});
