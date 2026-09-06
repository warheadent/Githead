import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";
import {
  createSentryVitePlugin,
  buildSourceMaps,
  bundleTaskOptions,
  sentryBuildConfig
} from "./sentry.vite";

const taskInputs = [{ auto: true }, "!dist/**", "!release/**", "!artifacts/**", "!**/*.log"];

export default defineConfig({
  run: {
    tasks: {
      "types:main": { command: "tsc --noEmit -p tsconfig.electron.json", input: taskInputs, output: [] },
      "types:renderer": { command: "tsc --noEmit -p tsconfig.json", input: taskInputs, output: [] },
      "types:tests": { command: "tsc --noEmit -p tsconfig.tests.json", input: taskInputs, output: [] },
      "bundle:main": {
        ...bundleTaskOptions,
        ...(bundleTaskOptions.cache ? { input: taskInputs } : {}),
        command: "vp build --config vite.main.config.ts"
      },
      "bundle:renderer": {
        ...bundleTaskOptions,
        ...(bundleTaskOptions.cache ? { input: taskInputs } : {}),
        command: "vp build"
      }
    }
  },
  root: ".",
  base: "./",
  define: {
    __SENTRY_ENABLED__: JSON.stringify(Boolean(sentryBuildConfig.dsn))
  },
  plugins: lazyPlugins(() => [
    react({}),
    tailwindcss(),
    createSentryVitePlugin("dist/renderer/**/*.map")
  ]) ?? [],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
    sourcemap: buildSourceMaps,
    reportCompressedSize: false,
    rollupOptions: {
      input: {
        app: path.resolve(__dirname, "index.html"),
        "workspace-trust": path.resolve(__dirname, "workspace-trust.html")
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173
  },
  test: {
    environment: "node",
    maxWorkers: 1,
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
