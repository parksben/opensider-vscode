import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(root, "src/sidepanel"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@shared": path.join(root, "shared/index.ts"),
    },
  },
  base: "./",
  build: {
    outDir: path.join(root, "dist/panel"),
    emptyOutDir: true,
  },
});
