import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    passWithNoTests: true,
    testTimeout: 30_000,
    // Abrir o PGlite com todo o SQL passa dos 10s padrão sob a suíte inteira em paralelo.
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      // `server-only` lança fora do Next; nos testes vira um módulo vazio.
      "server-only": path.resolve(__dirname, "tests/helpers/vazio.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
});
