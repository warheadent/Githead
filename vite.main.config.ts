import { builtinModules } from "node:module";
import path from "node:path";
import { defineConfig } from "vite-plus";
import { createSentryVitePlugin, sentryBuildConfig } from "./sentry.vite";

const nodeModules = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`)
]);

export default defineConfig({
  plugins: [createSentryVitePlugin("dist/main/**/*.map")],
  define: {
    "process.env": "process.env",
    __SENTRY_DSN__: JSON.stringify(sentryBuildConfig.dsn),
    __SENTRY_ENVIRONMENT__: JSON.stringify(sentryBuildConfig.environment),
    __SENTRY_RELEASE__: JSON.stringify(sentryBuildConfig.release)
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
      external: (id) =>
        id === "electron" || id === "electron-updater" || id.startsWith("@sentry/") || nodeModules.has(id),
      output: {
        format: "cjs",
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js"
      }
    }
  }
});
