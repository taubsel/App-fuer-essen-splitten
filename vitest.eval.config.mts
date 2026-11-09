import { defineConfig, loadEnv } from "vite";
import path from "node:path";

// Prüft die ECHTE KI (OpenAI) mit Beispiel-Bon, -Nachrichten und -Foto.
// Aufruf: npm run eval:ai   (liest .env.local; braucht OPENAI_API_KEY mit Guthaben)
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    include: ["src/**/*.eval.ts"],
    environment: "node",
    testTimeout: 180_000,
    env: { ...loadEnv(mode, process.cwd(), ""), AI_MOCK: "0" },
  },
}));
