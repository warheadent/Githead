import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/vite-plugin", () => ({ sentryVitePlugin: vi.fn((options) => options) }));

async function loadConfig(env = {}) {
  vi.resetModules();
  for (const name of ["GITHEAD_SOURCEMAP", "SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"]) {
    vi.stubEnv(name, env[name] ?? "");
  }
  return import("../sentry.vite.ts");
}

afterEach(() => vi.unstubAllEnvs());

describe("build cache and source map policy", () => {
  it("caches local bundles without generating source maps by default", async () => {
    const config = await loadConfig();
    expect(config.buildSourceMaps).toBe(false);
    expect(config.bundleTaskOptions.cache).toBe(true);
    expect(config.createSentryVitePlugin("dist/**/*.map").disable).toBe(true);
  });

  it("supports cached local debug maps", async () => {
    const config = await loadConfig({ GITHEAD_SOURCEMAP: "1" });
    expect(config.buildSourceMaps).toBe(true);
    expect(config.bundleTaskOptions.cache).toBe(true);
    expect(config.bundleTaskOptions.env).toContain("GITHEAD_SOURCEMAP");
  });

  it("always generates maps and bypasses the cache for Sentry uploads", async () => {
    const config = await loadConfig({
      GITHEAD_SOURCEMAP: "0",
      SENTRY_AUTH_TOKEN: "test-token",
      SENTRY_ORG: "test-org",
      SENTRY_PROJECT: "test-project"
    });
    expect(config.buildSourceMaps).toBe(true);
    expect(config.bundleTaskOptions.cache).toBe(false);
    expect(config.createSentryVitePlugin("dist/**/*.map").disable).toBe(false);
    expect(config.bundleTaskOptions.untrackedEnv).toContain("SENTRY_AUTH_TOKEN");
  });

  it("keeps incomplete upload configuration local and fingerprints embedded Sentry settings", async () => {
    const config = await loadConfig({ SENTRY_AUTH_TOKEN: "test-token" });
    expect(config.buildSourceMaps).toBe(false);
    expect(config.bundleTaskOptions.cache).toBe(true);
    expect(config.bundleTaskOptions.env).toEqual(expect.arrayContaining([
      "SENTRY_DSN", "SENTRY_ENVIRONMENT", "SENTRY_RELEASE", "SENTRY_ORG", "SENTRY_PROJECT"
    ]));
  });
});
