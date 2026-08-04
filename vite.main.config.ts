import { builtinModules } from "node:module";
import path from "node:path";
import { defineConfig } from "vite-plus";

const nodeModules = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`)
]);

export default defineConfig({
  define: {
    "process.env": "process.env"
  },
  build: {
    target: "node22",
    outDir: "dist/main/main",
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "src/main/main.ts"),
        preload: path.resolve(__dirname, "src/main/preload.ts")
      },
      external: (id) => id === "electron" || id === "electron-updater" || nodeModules.has(id),
      output: {
        format: "cjs",
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js"
      }
    }
  }
});
