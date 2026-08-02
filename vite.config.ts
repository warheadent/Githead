import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
  root: ".",
  base: "./",
  plugins: lazyPlugins(() => [
    react({}),
    tailwindcss()
  ]) ?? [],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: "index.html"
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173
  },
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "scripts/**/*.test.mjs"
    ]
  },
  check: {
    fmt: false
  }
});
