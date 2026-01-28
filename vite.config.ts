import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(), 
    tailwindcss()
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