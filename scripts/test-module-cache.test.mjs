import { describe, expect, it } from "vite-plus/test";
import { testModuleCachePlugin } from "../test-cache.vite";

function cacheKey(id, define) {
  let generate;
  testModuleCachePlugin().configureVitest({
    defineCacheKeyGenerator(callback) { generate = callback; }
  });
  return generate({ id, environment: { config: { define } } });
}

describe("test module cache invalidation", () => {
  it("reuses unchanged test defines and invalidates changed embedded settings", () => {
    const define = { __APP_VERSION__: '"0.60.2"', __SENTRY_ENABLED__: "false" };
    const key = cacheKey("/src/renderer/App.tsx", define);
    expect(cacheKey("/src/renderer/App.tsx", { ...define })).toBe(key);
    expect(cacheKey("/src/renderer/App.tsx", { ...define, __SENTRY_ENABLED__: "true" })).not.toBe(key);
    expect(cacheKey("/src/renderer/App.tsx", { ...define, __APP_VERSION__: '"0.61.0"' })).not.toBe(key);
  });

  it.each(["/src/renderer/styles.css", "/src/renderer/styles.css?direct", "/src/theme.scss"])(
    "transforms %s again because its output can depend on other files",
    (id) => { expect(cacheKey(id, {})).toBe(false); }
  );
});
