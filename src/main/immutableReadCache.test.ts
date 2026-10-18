import path from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  estimateRetainedBytes,
  ImmutableReadCache,
  immutableRepoKey,
  isFullObjectId,
  observeInterruptions,
  readRepoFingerprint,
  repoFingerprintPaths,
  trackProcessInterruptions,
  type ImmutableReadKey
} from "./immutableReadCache";
import type { ProcessResult, ProcessRunner } from "./processRunner";

const sha1 = "a".repeat(40);
const sha256 = "b".repeat(64);
const repoKey = "/repo";

function key(overrides: Partial<ImmutableReadKey> = {}): ImmutableReadKey {
  return { repoKey, kind: "commit-details", hash: sha1, ...overrides };
}

function counter<T>(value: T, cacheable = true) {
  return vi.fn(async () => ({ value, cacheable }));
}

describe("ImmutableReadCache", () => {
  it("accepts only full SHA-1 and SHA-256 object ids", () => {
    expect(isFullObjectId(sha1)).toBe(true);
    expect(isFullObjectId(sha256)).toBe(true);
    expect(isFullObjectId(sha1.toUpperCase())).toBe(true);
    expect(isFullObjectId("a".repeat(39))).toBe(false);
    expect(isFullObjectId("a".repeat(41))).toBe(false);
    expect(isFullObjectId("HEAD")).toBe(false);
    expect(isFullObjectId(`${"a".repeat(39)}g`)).toBe(false);
  });

  it("reuses a cached value and does not cache abbreviated ids or unknown fingerprints", async () => {
    const cache = new ImmutableReadCache();
    const loader = counter({ subject: "cached" });
    await cache.read(key(), "fp", loader);
    await expect(cache.read(key({ hash: sha1.toUpperCase() }), "fp", loader)).resolves.toEqual({ subject: "cached" });
    expect(loader).toHaveBeenCalledTimes(1);

    const abbreviated = counter("short");
    await cache.read(key({ hash: "abcdef1" }), "fp", abbreviated);
    await cache.read(key({ hash: "abcdef1" }), "fp", abbreviated);
    expect(abbreviated).toHaveBeenCalledTimes(2);

    const unfingerprinted = counter("unknown");
    await cache.read(key({ hash: sha256 }), null, unfingerprinted);
    await cache.read(key({ hash: sha256 }), null, unfingerprinted);
    expect(unfingerprinted).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(1);
  });

  it("separates entries by repository, kind, hash, and request parts", async () => {
    const cache = new ImmutableReadCache();
    const keys = [
      key(),
      key({ repoKey: "/other" }),
      key({ kind: "blame" }),
      key({ hash: sha256 }),
      key({ kind: "commit-file-diff", parts: ["a.txt", ""] }),
      key({ kind: "commit-file-diff", parts: ["a.txt", "old.txt"] }),
      key({ kind: "commit-file-diff", parts: ["a.txt\0old.txt"] })
    ];
    for (const [index, entry] of keys.entries()) {
      await expect(cache.read(entry, "fp", counter(index))).resolves.toBe(index);
    }
    for (const [index, entry] of keys.entries()) {
      await expect(cache.read(entry, "fp", counter(-1))).resolves.toBe(index);
    }
  });

  it("never retains failures, non-cacheable results, or interrupted loads", async () => {
    const cache = new ImmutableReadCache();
    const failing = vi.fn(async () => { throw new Error("fatal: bad object"); });
    await expect(cache.read(key(), "fp", failing)).rejects.toThrow("fatal: bad object");
    await expect(cache.read(key(), "fp", failing)).rejects.toThrow("fatal: bad object");
    expect(failing).toHaveBeenCalledTimes(2);

    const fallback = counter("lfs-missing", false);
    await cache.read(key({ kind: "image" }), "fp", fallback);
    await cache.read(key({ kind: "image" }), "fp", fallback);
    expect(fallback).toHaveBeenCalledTimes(2);

    const runner = trackProcessInterruptions({
      run: async (): Promise<ProcessResult> => ({ exitCode: -1, stdout: "", stderr: "", error: "Command was cancelled.", terminationReason: "aborted" })
    });
    const interrupted = vi.fn(async () => {
      await runner.run("git", ["show"]);
      return { value: "partial", cacheable: true };
    });
    await cache.read(key({ kind: "blame" }), "fp", interrupted);
    await cache.read(key({ kind: "blame" }), "fp", interrupted);
    expect(interrupted).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(0);
  });

  it("caches output-limit truncation because it is deterministic", async () => {
    const cache = new ImmutableReadCache();
    const runner = trackProcessInterruptions({
      run: async (): Promise<ProcessResult> => ({ exitCode: 0, stdout: "x", stderr: "", terminationReason: "outputLimit", stdoutTruncated: true })
    });
    const loader = vi.fn(async () => {
      await runner.run("git", ["show"]);
      return { value: "truncated", cacheable: true };
    });
    await cache.read(key(), "fp", loader);
    await cache.read(key(), "fp", loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("evicts least recently used entries to stay within the byte budget", async () => {
    const value = "x".repeat(1000);
    const entryBytes = estimateRetainedBytes(value);
    const cache = new ImmutableReadCache({ maxBytes: entryBytes * 3 + 1000, maxEntryBytes: entryBytes * 2 });
    const [h1, h2, h3, h4] = ["1", "2", "3", "4"].map((digit) => digit.repeat(40)) as [string, string, string, string];
    for (const hash of [h1, h2, h3]) await cache.read(key({ hash }), "fp", counter(value));
    // Touch the oldest entry so the second one becomes least recently used.
    await cache.read(key({ hash: h1 }), "fp", counter("unused"));
    await cache.read(key({ hash: h4 }), "fp", counter(value));

    expect(cache.size).toBe(3);
    expect(cache.bytes).toBeLessThanOrEqual(entryBytes * 3 + 1000);
    const reload = counter(value);
    await cache.read(key({ hash: h2 }), "fp", reload);
    expect(reload).toHaveBeenCalledTimes(1);
    const kept = counter(value);
    await cache.read(key({ hash: h4 }), "fp", kept);
    expect(kept).not.toHaveBeenCalled();
  });

  it("does not retain an entry larger than the per-entry limit", async () => {
    const cache = new ImmutableReadCache({ maxBytes: 10_000, maxEntryBytes: 2_000 });
    const loader = counter("x".repeat(5_000));
    await cache.read(key(), "fp", loader);
    await cache.read(key(), "fp", loader);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(cache.bytes).toBe(0);
  });

  it("drops a repository's entries when its fingerprint changes, without touching other repositories", async () => {
    const cache = new ImmutableReadCache();
    await cache.read(key(), "fp-1", counter("old"));
    await cache.read(key({ repoKey: "/other" }), "fp-1", counter("other"));
    await expect(cache.read(key(), "fp-2", counter("new"))).resolves.toBe("new");
    await expect(cache.read(key({ repoKey: "/other" }), "fp-1", counter("reloaded"))).resolves.toBe("other");
    cache.clearRepo("/other");
    await expect(cache.read(key({ repoKey: "/other" }), "fp-1", counter("reloaded"))).resolves.toBe("reloaded");
  });

  it("discards a load that finishes after the fingerprint changed", async () => {
    const cache = new ImmutableReadCache();
    let release: () => void = () => undefined;
    const slow = cache.read(key(), "fp-1", async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return { value: "stale", cacheable: true };
    });
    await cache.read(key({ hash: sha256 }), "fp-2", counter("fresh"));
    release();
    await expect(slow).resolves.toBe("stale");
    const reload = counter("current");
    await expect(cache.read(key(), "fp-2", reload)).resolves.toBe("current");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight load between concurrent readers", async () => {
    const cache = new ImmutableReadCache();
    let release: () => void = () => undefined;
    const loader = vi.fn(async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return { value: "shared", cacheable: true };
    });
    const first = cache.read(key(), "fp", loader);
    const second = cache.read(key(), "fp", loader);
    await Promise.resolve();
    release();
    await expect(Promise.all([first, second])).resolves.toEqual(["shared", "shared"]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("retries for a joined reader when the shared load was cancelled by another request", async () => {
    const cache = new ImmutableReadCache();
    const results: ProcessResult[] = [
      { exitCode: -1, stdout: "", stderr: "", error: "Command was cancelled.", terminationReason: "aborted" },
      { exitCode: 0, stdout: "details", stderr: "", terminationReason: "exited" }
    ];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const runner = trackProcessInterruptions({
      run: async () => {
        await gate;
        return results.shift()!;
      }
    });
    const loader = async () => {
      const result = await runner.run("git", ["show"]);
      if (result.exitCode !== 0) throw new Error(result.error);
      return { value: result.stdout, cacheable: true };
    };
    const cancelled = cache.read(key(), "fp", loader);
    const joined = cache.read(key(), "fp", loader);
    release();
    await expect(cancelled).rejects.toThrow("Command was cancelled.");
    await expect(joined).resolves.toBe("details");
    await expect(cache.read(key(), "fp", counter("unused"))).resolves.toBe("details");
  });

  it("propagates interruptions to enclosing observations", async () => {
    const runner = trackProcessInterruptions({
      run: async (): Promise<ProcessResult> => ({ exitCode: -1, stdout: "", stderr: "", terminationReason: "timedOut" })
    });
    const outer = await observeInterruptions(async () => {
      const inner = await observeInterruptions(() => runner.run("git", ["blame"]));
      return inner.interrupted;
    });
    expect(outer).toEqual({ ok: true, value: true, interrupted: true });
    await expect(observeInterruptions(async () => "plain")).resolves.toEqual({ ok: true, value: "plain", interrupted: false });
  });

  it("follows the wrapped runner's binary capability", async () => {
    const base: ProcessRunner = { run: vi.fn() };
    const tracked = trackProcessInterruptions(base);
    expect(tracked.runBinary).toBeUndefined();
    base.runBinary = vi.fn(async () => ({ exitCode: 0, stdout: new Uint8Array([1]), stderr: "" }));
    await expect(tracked.runBinary?.("git", ["show"], { maxBytes: 1 })).resolves.toMatchObject({ exitCode: 0 });
  });
});

describe("estimateRetainedBytes", () => {
  it("counts strings as UTF-16, binary data by length, and shared objects once", () => {
    expect(estimateRetainedBytes("abcd")).toBe(16 + 8);
    expect(estimateRetainedBytes(new Uint8Array(1000))).toBe(1064);
    const shared = { text: "x".repeat(100) };
    const once = estimateRetainedBytes([shared]);
    expect(estimateRetainedBytes([shared, shared])).toBe(once + 8);
    expect(estimateRetainedBytes({ files: [{ path: "a" }] })).toBeGreaterThan(estimateRetainedBytes({ files: [] }));
  });
});

describe("repository fingerprints", () => {
  const paths = { topLevel: "/repo", gitDir: "/repo/.git/worktrees/w", commonDir: "/repo/.git" };

  it("tracks mailmap, attributes, config, grafts, and replacement refs", () => {
    const files = repoFingerprintPaths(paths, { XDG_CONFIG_HOME: "/xdg" }, "/home/user");
    expect(files).toEqual(expect.arrayContaining([
      path.join("/repo", ".mailmap"),
      path.join("/repo", ".gitattributes"),
      path.join("/repo/.git", "config"),
      path.join("/repo/.git/worktrees/w", "config.worktree"),
      path.join("/repo/.git", "info", "attributes"),
      path.join("/repo/.git", "info", "grafts"),
      path.join("/repo/.git", "refs", "replace"),
      path.join("/repo/.git", "packed-refs"),
      path.join("/repo/.git", "reftable", "tables.list"),
      path.join("/home/user", ".gitconfig"),
      path.join("/xdg", "git", "config"),
      path.join("/xdg", "git", "attributes")
    ]));
    expect(repoFingerprintPaths(paths, { GIT_CONFIG_GLOBAL: "/custom/global" }, "/home/user"))
      .toEqual(expect.arrayContaining(["/custom/global"]));
    expect(repoFingerprintPaths(paths, { GIT_CONFIG_GLOBAL: "/custom/global" }, "/home/user"))
      .not.toContain(path.join("/home/user", ".gitconfig"));
  });

  it("changes when a tracked file appears, changes, or disappears", async () => {
    const stats = new Map<string, { mtimeMs: number; ctimeMs: number; size: number; ino: number }>();
    const stat = async (filePath: string) => {
      const value = stats.get(filePath);
      if (!value) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return value;
    };
    const files = ["/repo/.mailmap", "/repo/.git/config"];
    stats.set("/repo/.git/config", { mtimeMs: 1, ctimeMs: 1, size: 10, ino: 1 });
    const initial = await readRepoFingerprint(files, stat);
    expect(await readRepoFingerprint(files, stat)).toBe(initial);
    stats.set("/repo/.mailmap", { mtimeMs: 2, ctimeMs: 2, size: 5, ino: 2 });
    const added = await readRepoFingerprint(files, stat);
    expect(added).not.toBe(initial);
    stats.set("/repo/.mailmap", { mtimeMs: 3, ctimeMs: 3, size: 5, ino: 2 });
    expect(await readRepoFingerprint(files, stat)).not.toBe(added);
    stats.delete("/repo/.mailmap");
    expect(await readRepoFingerprint(files, stat)).toBe(initial);
  });

  it("normalizes repository keys", () => {
    expect(immutableRepoKey("relative/repo")).toBeNull();
    expect(immutableRepoKey(`${path.resolve("/repo")}${path.sep}`)).toBe(immutableRepoKey(path.resolve("/repo")));
  });
});
