import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "vite";

// Cada build produz um SW com identidade própria, inclusive quando o código
// da aplicação muda mas o arquivo public/sw.js permanece igual.
function versionedPwaWorker() {
  return {
    name: "evolusystem-pwa-build-version",
    apply: "build" as const,
    closeBundle() {
      const swPath = path.resolve(import.meta.dirname, "dist/sw.js");
      const source = readFileSync(swPath, "utf8");
      if (!source.includes("__EVOLUSYSTEM_BUILD_ID__")) {
        throw new Error("Marcador de versão do service worker ausente");
      }
      const buildId = (
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.GITHUB_SHA ||
        Date.now().toString(36)
      ).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
      writeFileSync(swPath, source.replaceAll("__EVOLUSYSTEM_BUILD_ID__", buildId));
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    versionedPwaWorker(),
  ],
  resolve: {
    alias: {
      // Ajusta os atalhos para a nova posição das pastas na raiz
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  // IMPORTANTE: Não deve haver a linha "root: 'client'" aqui
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: true, 
  },
});
