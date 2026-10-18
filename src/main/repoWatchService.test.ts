import { EventEmitter } from "node:events";
import type { WatchOptions } from "node:fs";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { IPC_CHANNELS } from "../shared/ipc";
import { RepoWatchService, type RepoWatchFactory, type RepoWatcherLike, type RepoWatchTarget } from "./repoWatchService";

class FakeWatcher extends EventEmitter implements RepoWatcherLike {
  close = vi.fn();

  constructor(
    readonly watchedPath: string,
    readonly options: WatchOptions,
    readonly listener: (eventType: string, filename: string | Buffer | null) => void
  ) {
    super();
  }

  override on(eventName: "error", listener: (error: Error) => void): this {
    super.on(eventName, listener);
    return this;
  }

  isIgnored(filename: string): boolean {
    const ignore = this.options.ignore;
    return typeof ignore === "function" ? ignore(filename) : false;
  }
}

interface WatchFixture {
  service: RepoWatchService;
  send: ReturnType<typeof vi.fn>;
  watchFactory: ReturnType<typeof vi.fn<RepoWatchFactory>>;
  isDirectory: ReturnType<typeof vi.fn<(absolutePath: string) => Promise<boolean>>>;
  watchers: FakeWatcher[];
  /** The live content watcher (the most recently created recursive repo-root watcher). */
  content(): FakeWatcher;
  metadata(watchedPath: string): FakeWatcher;
  emitChange(filename?: string | Buffer | null, eventType?: string): void;
}

const repoPath = "D:\\Repo";
const gitDir = "D:\\Repo\\.git";
const metadataTargets: RepoWatchTarget[] = [
  { path: repoPath, recursive: true, kind: "content" },
  { path: gitDir, recursive: false, kind: "metadata" },
  { path: "D:\\Repo\\.git\\refs", recursive: true, kind: "metadata" }
];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe("RepoWatchService", () => {
  it("emits one debounced change for a burst of repository file events", async () => {
    const fixture = createWatchFixture();

    fixture.service.watchRepo(repoPath);
    await settle();
    fixture.emitChange();
    fixture.emitChange();
    fixture.emitChange();

    await vi.advanceTimersByTimeAsync(749);
    expect(fixture.send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.send).toHaveBeenCalledTimes(1);
    expect(fixture.send).toHaveBeenCalledWith(IPC_CHANNELS.repoChanged, {
      repoPath: path.resolve(repoPath),
      changedAt: "2026-05-31T10:00:00.000Z",
      reason: "filesystem"
    });
  });

  it("bounds sustained activity with max wait and emits one final settled notification", async () => {
    const fixture = createWatchFixture();

    fixture.service.watchRepo(repoPath);
    await settle();
    fixture.emitChange();
    await vi.advanceTimersByTimeAsync(749);
    fixture.emitChange();
    await vi.advanceTimersByTimeAsync(749);
    fixture.emitChange();
    await vi.advanceTimersByTimeAsync(502);
    expect(fixture.send).toHaveBeenCalledTimes(1);

    fixture.emitChange();
    await vi.advanceTimersByTimeAsync(750);
    expect(fixture.send).toHaveBeenCalledTimes(2);
  });

  it("starts the content watcher after watchRepo returns so the walk does not delay the caller", async () => {
    const fixture = createWatchFixture();

    fixture.service.watchRepo(repoPath, metadataTargets);
    expect(fixture.watchers.map((watcher) => watcher.watchedPath)).toEqual([path.resolve(gitDir), path.resolve("D:\\Repo\\.git\\refs")]);

    await settle();
    expect(fixture.content().watchedPath).toBe(path.resolve(repoPath));
    expect(fixture.content().options.recursive).toBe(true);
  });

  it("does not start a content watcher when the repository is replaced before setup finishes", async () => {
    const fixture = createWatchFixture();

    fixture.service.watchRepo(repoPath);
    fixture.service.stopWatching();
    await settle();

    expect(fixture.watchFactory).not.toHaveBeenCalled();
  });

  it.each([
    ["metadata", "filesystem-metadata"],
    ["unknown", "filesystem-unknown"]
  ] as const)("preserves broad %s invalidation before a content event", async (source, reason) => {
    const fixture = createWatchFixture();
    fixture.service.watchRepo(repoPath, metadataTargets);
    await settle();
    if (source === "metadata") fixture.metadata("D:\\Repo\\.git\\refs").listener("change", "heads\\main");
    else fixture.emitChange(null);
    fixture.emitChange();

    await vi.advanceTimersByTimeAsync(750);

    expect(fixture.send).toHaveBeenCalledTimes(1);
    expect(fixture.send).toHaveBeenLastCalledWith(IPC_CHANNELS.repoChanged, expect.objectContaining({ reason }));

    fixture.emitChange();
    await vi.advanceTimersByTimeAsync(750);
    expect(fixture.send).toHaveBeenLastCalledWith(IPC_CHANNELS.repoChanged, expect.objectContaining({ reason: "filesystem" }));
  });

  it("preserves metadata invalidation when sustained content activity reaches max wait", async () => {
    const fixture = createWatchFixture();
    fixture.service.watchRepo(repoPath, metadataTargets);
    await settle();
    fixture.emitChange();
    await vi.advanceTimersByTimeAsync(700);
    fixture.metadata(gitDir).listener("change", "HEAD");
    await vi.advanceTimersByTimeAsync(700);
    fixture.emitChange();
    await vi.advanceTimersByTimeAsync(600);

    expect(fixture.send).toHaveBeenCalledTimes(1);
    expect(fixture.send).toHaveBeenLastCalledWith(IPC_CHANNELS.repoChanged, expect.objectContaining({ reason: "filesystem-metadata" }));
  });

  it.each([
    ".git",
    ".git\\index.lock",
    ".git\\index",
    ".git/objects/ab/cdef0123",
    ".git/objects/pack/pack-1.pack",
    ".git/logs/HEAD",
    ".git/HEAD",
    ".git/refs/heads/main",
    ".git/FETCH_HEAD",
    ".git/rebase-merge/msgnum",
    ".GIT/config",
    "vendor/lib/.git/HEAD",
    "vendor/lib/.git"
  ])("drops content watcher events under .git (%s)", async (filename) => {
    const fixture = createWatchFixture();

    fixture.service.watchRepo(repoPath, metadataTargets);
    await settle();
    fixture.emitChange(filename);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(fixture.send).not.toHaveBeenCalled();
    expect(fixture.content().isIgnored(filename)).toBe(true);
  });

  it("does not treat lookalike names as git internals", async () => {
    const fixture = createWatchFixture();
    fixture.service.watchRepo(repoPath);
    await settle();

    for (const filename of [".github/workflows/ci.yml", ".gitignore", ".gitattributes", "src/.gitkeep", "docs/a.git"]) {
      expect(fixture.content().isIgnored(filename)).toBe(false);
    }
  });

  it.each([
    ["HEAD", "filesystem-metadata"],
    ["packed-refs", "filesystem-metadata"],
    ["FETCH_HEAD", "filesystem-metadata"],
    ["MERGE_HEAD", "filesystem-metadata"],
    ["ORIG_HEAD", "filesystem-metadata"],
    ["rebase-merge", "filesystem-metadata"],
    ["config", "filesystem-metadata"]
  ] as const)("refreshes metadata from the git dir watcher for %s", async (filename, reason) => {
    const fixture = createWatchFixture();
    fixture.service.watchRepo(repoPath, metadataTargets);
    await settle();
    fixture.metadata(gitDir).listener("rename", filename);

    await vi.advanceTimersByTimeAsync(750);

    expect(fixture.send).toHaveBeenCalledWith(IPC_CHANNELS.repoChanged, expect.objectContaining({ reason }));
  });

  it.each(["heads/main", "heads\\feature\\x", "stash", "remotes/origin/main", "tags/v1"])(
    "refreshes metadata from the refs watcher for %s",
    async (filename) => {
      const fixture = createWatchFixture();
      fixture.service.watchRepo(repoPath, metadataTargets);
      await settle();
      fixture.metadata("D:\\Repo\\.git\\refs").listener("rename", filename);

      await vi.advanceTimersByTimeAsync(750);

      expect(fixture.send).toHaveBeenCalledWith(IPC_CHANNELS.repoChanged, expect.objectContaining({ reason: "filesystem-metadata" }));
    }
  );

  it.each(["index", "index.lock", "objects", "logs"])("ignores noisy git dir writes for %s", async (filename) => {
    const fixture = createWatchFixture();
    fixture.service.watchRepo(repoPath, metadataTargets);
    await settle();
    fixture.metadata(gitDir).listener("change", filename);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(fixture.send).not.toHaveBeenCalled();
  });

  it("ignores internal .lore writes produced by status scans", async () => {
    const fixture = createWatchFixture();

    fixture.service.watchRepo(repoPath);
    await settle();
    fixture.emitChange(".lore");
    fixture.emitChange(".lore\\instance");
    fixture.emitChange(".lore\\view\\staged");

    await vi.advanceTimersByTimeAsync(750);

    expect(fixture.send).not.toHaveBeenCalled();
    expect(fixture.content().isIgnored(".lore/view")).toBe(true);
  });

  it.each([
    [null, "filesystem-unknown"],
    ["", "filesystem-unknown"],
    [".mailmap", "filesystem-metadata"],
    [".githead\\actions.toml", "filesystem-metadata"],
    [".githead\\actions.local.toml", "filesystem-metadata"],
    ["src\\App.tsx", "filesystem"]
  ] as const)("classifies content event %s as %s", async (filename, reason) => {
    const fixture = createWatchFixture();
    fixture.service.watchRepo(repoPath);
    await settle();
    fixture.emitChange(filename);

    await vi.advanceTimersByTimeAsync(750);

    expect(fixture.send).toHaveBeenCalledWith(IPC_CHANNELS.repoChanged, expect.objectContaining({ reason }));
  });

  it("does not walk or report git-ignored directories", async () => {
    const resolveIgnoredDirectories = vi.fn(async () => ["node_modules", "packages/a/dist/", "./build"]);
    const fixture = createWatchFixture();

    fixture.service.watchRepo(repoPath, undefined, { resolveIgnoredDirectories });
    await settle();
    const content = fixture.content();

    expect(resolveIgnoredDirectories).toHaveBeenCalledTimes(1);
    expect(content.isIgnored("node_modules")).toBe(true);
    expect(content.isIgnored("node_modules/react/index.js")).toBe(true);
    expect(content.isIgnored("node_modules\\react\\index.js")).toBe(true);
    expect(content.isIgnored("packages/a/dist")).toBe(true);
    expect(content.isIgnored("packages/a/dist/main.js")).toBe(true);
    expect(content.isIgnored("build/out.o")).toBe(true);
    expect(content.isIgnored("packages/a/src/index.ts")).toBe(false);
    expect(content.isIgnored("packages/a")).toBe(false);
    expect(content.isIgnored("src/node_modules/x.js")).toBe(false);
    expect(content.isIgnored("node_modules_extra/x.js")).toBe(false);

    fixture.emitChange("node_modules/react/index.js");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fixture.send).not.toHaveBeenCalled();

    fixture.emitChange("src/index.ts");
    await vi.advanceTimersByTimeAsync(750);
    expect(fixture.send).toHaveBeenCalledWith(IPC_CHANNELS.repoChanged, expect.objectContaining({ reason: "filesystem" }));
  });

  it("keeps watching .githead even when the directory is ignored", async () => {
    const fixture = createWatchFixture();

    fixture.service.watchRepo(repoPath, undefined, { resolveIgnoredDirectories: async () => [".githead"] });
    await settle();

    expect(fixture.content().isIgnored(".githead/actions.local.toml")).toBe(false);
  });

  it("falls back to watching everything outside VCS internals when the ignore list fails", async () => {
    const fixture = createWatchFixture();

    fixture.service.watchRepo(repoPath, undefined, { resolveIgnoredDirectories: async () => { throw new Error("git failed"); } });
    await settle();

    expect(fixture.content().isIgnored("node_modules/x.js")).toBe(false);
    expect(fixture.content().isIgnored(".git/HEAD")).toBe(true);
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it("recomputes ignored directories and restarts the content watcher when .gitignore changes", async () => {
    let ignored = ["dist"];
    const resolveIgnoredDirectories = vi.fn(async () => ignored);
    const fixture = createWatchFixture();
    fixture.service.watchRepo(repoPath, metadataTargets, { resolveIgnoredDirectories });
    await settle();
    const first = fixture.content();

    ignored = ["dist", "node_modules"];
    fixture.emitChange(".gitignore");
    await vi.advanceTimersByTimeAsync(750);

    expect(resolveIgnoredDirectories).toHaveBeenCalledTimes(2);
    expect(first.close).toHaveBeenCalledTimes(1);
    const second = fixture.content();
    expect(second).not.toBe(first);
    expect(second.isIgnored("node_modules/a.js")).toBe(true);
    expect(fixture.metadata(gitDir).close).not.toHaveBeenCalled();

    // Stale events from the replaced watcher are dropped.
    first.listener("change", "src/a.ts");
    await vi.advanceTimersByTimeAsync(750);
    // The restart's own status refresh (covering the walk) coalesces with the
    // .gitignore change.
    expect(fixture.send).toHaveBeenCalledTimes(1);
    expect(fixture.send).toHaveBeenLastCalledWith(IPC_CHANNELS.repoChanged, expect.objectContaining({ reason: "filesystem" }));
  });

  it("does not restart the content watcher when the ignore set is unchanged", async () => {
    const resolveIgnoredDirectories = vi.fn(async () => ["dist"]);
    const fixture = createWatchFixture();
    fixture.service.watchRepo(repoPath, undefined, { resolveIgnoredDirectories });
    await settle();

    fixture.emitChange("packages/a/.gitignore");
    await vi.advanceTimersByTimeAsync(750);

    expect(resolveIgnoredDirectories).toHaveBeenCalledTimes(2);
    expect(fixture.watchFactory).toHaveBeenCalledTimes(1);
    expect(fixture.content().close).not.toHaveBeenCalled();
  });

  it("stops watching a newly created ignored directory", async () => {
    let ignored: string[] = [];
    const resolveIgnoredDirectories = vi.fn(async () => ignored);
    const fixture = createWatchFixture();
    fixture.isDirectory.mockImplementation(async (absolutePath) => absolutePath.endsWith("node_modules") || absolutePath.endsWith("src"));
    fixture.service.watchRepo(repoPath, undefined, { resolveIgnoredDirectories });
    await settle();
    const first = fixture.content();

    ignored = ["node_modules"];
    fixture.emitChange("node_modules", "rename");
    fixture.emitChange("node_modules/a.js", "rename");
    fixture.emitChange("src/a.ts", "change");
    await vi.advanceTimersByTimeAsync(750);

    expect(fixture.isDirectory).toHaveBeenCalledTimes(2);
    expect(fixture.isDirectory).toHaveBeenCalledWith(path.join(path.resolve(repoPath), "node_modules"));
    expect(resolveIgnoredDirectories).toHaveBeenCalledTimes(2);
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(fixture.content().isIgnored("node_modules/b.js")).toBe(true);
  });

  it("checks a new non-ignored directory only once", async () => {
    const resolveIgnoredDirectories = vi.fn(async () => []);
    const fixture = createWatchFixture();
    fixture.isDirectory.mockResolvedValue(true);
    fixture.service.watchRepo(repoPath, undefined, { resolveIgnoredDirectories });
    await settle();

    fixture.emitChange("src/feature", "rename");
    await vi.advanceTimersByTimeAsync(750);
    fixture.emitChange("src/feature", "rename");
    await vi.advanceTimersByTimeAsync(750);

    expect(fixture.isDirectory).toHaveBeenCalledTimes(1);
    expect(resolveIgnoredDirectories).toHaveBeenCalledTimes(2);
    expect(fixture.watchFactory).toHaveBeenCalledTimes(1);
  });

  it("does not inspect new paths or recompute ignores without a resolver", async () => {
    const fixture = createWatchFixture();
    fixture.service.watchRepo(repoPath);
    await settle();

    fixture.emitChange("node_modules", "rename");
    fixture.emitChange(".gitignore");
    await vi.advanceTimersByTimeAsync(750);

    expect(fixture.isDirectory).not.toHaveBeenCalled();
    expect(fixture.watchFactory).toHaveBeenCalledTimes(1);
  });

  it("closes the previous watcher when switching repositories", async () => {
    const fixture = createWatchFixture();
    const nextRepoPath = "D:\\Other";

    fixture.service.watchRepo(repoPath);
    await settle();
    fixture.service.watchRepo(nextRepoPath);
    await settle();

    expect(fixture.watchFactory).toHaveBeenCalledTimes(2);
    expect(fixture.watchers[0]?.close).toHaveBeenCalledTimes(1);
    expect(fixture.watchers[1]?.close).not.toHaveBeenCalled();
  });

  it("does not recreate watchers for the same repository", async () => {
    const fixture = createWatchFixture();

    fixture.service.watchRepo(repoPath);
    fixture.service.watchRepo(repoPath);
    await settle();
    fixture.service.watchRepo(repoPath);
    await settle();

    expect(fixture.watchFactory).toHaveBeenCalledTimes(1);
  });

  it("watches content and shared metadata while keeping healthy targets after a partial failure", async () => {
    const fixture = createWatchFixture();
    fixture.service.watchRepo(repoPath, [
      { path: repoPath, recursive: true, kind: "content" },
      { path: "D:\\Repo\\.git\\worktrees\\feature", recursive: false, kind: "metadata" },
      { path: "D:\\Repo\\.git\\refs", recursive: true, kind: "metadata" }
    ]);
    await settle();

    expect(fixture.watchFactory).toHaveBeenCalledTimes(3);
    const failing = fixture.metadata("D:\\Repo\\.git\\worktrees\\feature");
    failing.emit("error", new Error("metadata unavailable"));
    fixture.metadata("D:\\Repo\\.git\\refs").listener("change", "heads\\main");
    await vi.advanceTimersByTimeAsync(750);

    expect(failing.close).toHaveBeenCalledTimes(1);
    expect(fixture.content().close).not.toHaveBeenCalled();
    expect(fixture.metadata("D:\\Repo\\.git\\refs").close).not.toHaveBeenCalled();
    expect(fixture.send).toHaveBeenLastCalledWith(IPC_CHANNELS.repoChanged, expect.objectContaining({ reason: "filesystem-metadata" }));
  });

  it("clears pending work when replacing a watcher", async () => {
    const fixture = createWatchFixture();
    const nextRepoPath = "D:\\Other";

    fixture.service.watchRepo(repoPath);
    await settle();
    fixture.emitChange(".mailmap");
    fixture.service.watchRepo(nextRepoPath);
    await settle();

    await vi.advanceTimersByTimeAsync(750);
    expect(fixture.send).not.toHaveBeenCalled();

    fixture.emitChange();
    await vi.advanceTimersByTimeAsync(750);
    expect(fixture.send).toHaveBeenCalledWith(IPC_CHANNELS.repoChanged, expect.objectContaining({
      repoPath: path.resolve(nextRepoPath),
      reason: "filesystem"
    }));
  });

  it("ignores stale callbacks from a closed watcher", async () => {
    const fixture = createWatchFixture();
    const nextRepoPath = "D:\\Other";

    fixture.service.watchRepo(repoPath);
    await settle();
    fixture.service.watchRepo(nextRepoPath);
    await settle();
    fixture.watchers[0]?.listener("change", "src/App.tsx");

    await vi.advanceTimersByTimeAsync(750);
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it("emits watcher-error events and closes the watcher after watcher failures", async () => {
    const fixture = createWatchFixture();

    fixture.service.watchRepo(repoPath);
    await settle();
    fixture.content().emit("error", new Error("watch failed"));

    expect(fixture.send).toHaveBeenCalledWith(IPC_CHANNELS.repoChanged, {
      repoPath: path.resolve(repoPath),
      changedAt: "2026-05-31T10:00:00.000Z",
      reason: "watcher-error"
    });
    expect(fixture.content().close).toHaveBeenCalledTimes(1);
  });

  it("reports a content watcher that cannot start once and does not retry it", async () => {
    const fixture = createWatchFixture();
    fixture.watchFactory.mockImplementation((watchedPath, options, listener) => {
      if (options.recursive && path.resolve(watchedPath) === path.resolve(repoPath)) {
        throw Object.assign(new Error("System limit for number of file watchers reached"), { code: "ENOSPC" });
      }
      const watcher = new FakeWatcher(path.resolve(watchedPath), options, listener);
      fixture.watchers.push(watcher);
      return watcher;
    });

    fixture.service.watchRepo(repoPath, metadataTargets, { resolveIgnoredDirectories: async () => [] });
    await settle();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(fixture.send).toHaveBeenCalledTimes(1);
    expect(fixture.send).toHaveBeenCalledWith(IPC_CHANNELS.repoChanged, expect.objectContaining({ reason: "watcher-error" }));
    expect(fixture.watchFactory).toHaveBeenCalledTimes(3);

    // Metadata watching keeps working without the content watcher.
    fixture.metadata(gitDir).listener("rename", "HEAD");
    await vi.advanceTimersByTimeAsync(750);
    expect(fixture.send).toHaveBeenLastCalledWith(IPC_CHANNELS.repoChanged, expect.objectContaining({ reason: "filesystem-metadata" }));
    expect(fixture.watchFactory).toHaveBeenCalledTimes(3);
  });

  it("does not resurrect a failed content watcher when ignore rules change", async () => {
    let ignored = ["dist"];
    const fixture = createWatchFixture();
    fixture.service.watchRepo(repoPath, undefined, { resolveIgnoredDirectories: async () => ignored });
    await settle();

    const content = fixture.content();
    content.listener("change", ".gitignore");
    content.emit("error", new Error("ENOSPC"));
    ignored = ["dist", "node_modules"];
    await vi.advanceTimersByTimeAsync(10_000);

    expect(fixture.watchFactory).toHaveBeenCalledTimes(1);
    // The error, then the already-pending .gitignore change; nothing repeats.
    expect(fixture.send.mock.calls.map(([, event]) => (event as { reason: string }).reason)).toEqual(["watcher-error", "filesystem"]);
  });

  it("closes the watcher and clears pending debounce timers when stopped", async () => {
    const fixture = createWatchFixture();

    fixture.service.watchRepo(repoPath);
    await settle();
    fixture.emitChange();
    fixture.service.stopWatching();

    await vi.advanceTimersByTimeAsync(750);
    expect(fixture.content().close).toHaveBeenCalledTimes(1);
    expect(fixture.send).not.toHaveBeenCalled();
  });
});

function createWatchFixture(): WatchFixture {
  const send = vi.fn();
  const window = {
    webContents: {
      send
    }
  } as unknown as BrowserWindow;
  const watchers: FakeWatcher[] = [];
  const watchFactory = vi.fn<RepoWatchFactory>((watchedPath, options, listener) => {
    const watcher = new FakeWatcher(path.resolve(watchedPath), options, listener);
    watchers.push(watcher);
    return watcher;
  });
  const isDirectory = vi.fn<(absolutePath: string) => Promise<boolean>>(async () => false);
  const service = new RepoWatchService({
    getWindows: () => [window],
    watchFactory,
    isDirectory,
    debounceMs: 750,
    maxWaitMs: 2_000,
    clock: () => new Date("2026-05-31T10:00:00Z")
  });

  const content = (): FakeWatcher => {
    const watcher = watchers.findLast((candidate) => candidate.options.recursive && candidate.options.ignore !== undefined);
    if (!watcher) throw new Error("No content watcher was created.");
    return watcher;
  };

  return {
    service,
    send,
    watchFactory,
    isDirectory,
    watchers,
    content,
    metadata(watchedPath: string): FakeWatcher {
      const watcher = watchers.find((candidate) => candidate.watchedPath === path.resolve(watchedPath));
      if (!watcher) throw new Error(`No watcher for ${watchedPath}.`);
      return watcher;
    },
    emitChange(filename: string | Buffer | null = "src/App.tsx", eventType = "change"): void {
      content().listener(eventType, filename);
    }
  };
}
