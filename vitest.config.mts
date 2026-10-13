import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@compartido": resolve("src/compartido") } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
