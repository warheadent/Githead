import type { Plugin } from "vite-plus";
import tsconfig from "./tsconfig.json";
import baseTsconfig from "./tsconfig.base.json";

export function testModuleCachePlugin(): Plugin {
  return {
    name: "githead:test-module-cache",
    configureVitest({ defineCacheKeyGenerator }) {
      defineCacheKeyGenerator(({ id, environment }) => {
        // Tailwind output also depends on classes in other source files.
        if (/\.(?:css|scss|sass|less|styl|stylus)(?:\?|$)/i.test(id)) return false;

        // Vitest fingerprints config source, but not runtime defines or the
        // TypeScript settings used to transform each module.
        return JSON.stringify({ define: environment.config.define, tsconfig, baseTsconfig });
      });
    }
  };
}
