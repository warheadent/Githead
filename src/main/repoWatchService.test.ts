import { EventEmitter } from "node:events";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { IPC_CHANNELS } from "../shared/ipc";
import { RepoWatchService, type RepoWatchFactory, type RepoWatcherLike } from "./repoWatchService";

class FakeWatcher extends EventEmitter implements RepoWatcherLike {
  close = vi.fn();

  override on(eventName: "error", listener: (error: Error) => void): this {
    super.on(eventName, listener);
    return this;
  }
}

interface WatchFixture {
  service: RepoWatchService;
  send: ReturnType<typeof vi.fn>;
  watchFactory: ReturnType<typeof vi.fn<RepoWatchFactory>>;
  watchers: FakeWatcher[];
  emitChange(index?: number, filename?: string | Buffer | null): void;
}

const repoPath = "D:\\Repo";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("RepoWatchService", () => {
  it("emits one debounced change for a burst of repository file events", async () => {
    const fixture = createWatchFixture();

    fixture.service.watchRepo(repoPath);
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

  it("ignores git watcher events produced by status refreshes", async () => {
    const fixture = createWatchFixture();

    fixture.service.watchRepo(repoPath);
    fixture.emitChange(0, ".git\\index.lock");
    fixture.emitChange(0, ".git\\index");
    fixture.emitChange(0, ".git");

    await vi.advanceTimersByTimeAsync(750);

    expect(fixture.send).not.toHaveBeenCalled();
  });

  it("ignores internal .lore writes produced by status scans", async () => {
    const fixture = createWatchFixture();

    fixture.service.watchRepo(repoPath);
    fixture.emitChange(0, ".lore");
    fixture.emitChange(0, ".lore\\instance");
    fixture.emitChange(0, ".lore\\view\\staged");

    await vi.advanceTimersByTimeAsync(750);

    expect(fixture.send).not.toHaveBeenCalled();
  });

  it.each([
    [null, "filesystem-unknown"],
    [".git\\refs\\heads\\main", "filesystem-metadata"]
  ] as const)("falls back to broad invalidation for %s", async (filename, reason) => {
    const fixture = createWatchFixture();
    fixture.service.watchRepo(repoPath);
    fixture.emitChange(0, filename);

    await vi.advanceTimersByTimeAsync(750);

    expect(fixture.send).toHaveBeenCalledWith(IPC_CHANNELS.repoChanged, expect.objectContaining({ reason }));
  });

  it("closes the previous watcher when switching repositories", () => {
    const fixture = createWatchFixture();
    const nextRepoPath = "D:\\Other";

    fixture.service.watchRepo(repoPath);
    fixture.service.watchRepo(nextRepoPath);

    expect(fixture.watchFactory).toHaveBeenCalledTimes(2);
    expect(fixture.watchers[0]?.close).toHaveBeenCalledTimes(1);
    expect(fixture.watchers[1]?.close).not.toHaveBeenCalled();
  });

  it("clears pending work when replacing a watcher", async () => {
    const fixture = createWatchFixture();
    const nextRepoPath = "D:\\Other";

    fixture.service.watchRepo(repoPath);
    fixture.emitChange();
    fixture.service.watchRepo(nextRepoPath);

    await vi.advanceTimersByTimeAsync(750);
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it("ignores stale callbacks from a closed watcher", async () => {
    const fixture = createWatchFixture();
    const nextRepoPath = "D:\\Other";

    fixture.service.watchRepo(repoPath);
    fixture.service.watchRepo(nextRepoPath);
    fixture.emitChange(0);

    await vi.advanceTimersByTimeAsync(750);
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it("emits watcher-error events and closes the watcher after watcher failures", () => {
    const fixture = createWatchFixture();

    fixture.service.watchRepo(repoPath);
    fixture.watchers[0]?.emit("error", new Error("watch failed"));

    expect(fixture.send).toHaveBeenCalledWith(IPC_CHANNELS.repoChanged, {
      repoPath: path.resolve(repoPath),
      changedAt: "2026-05-31T10:00:00.000Z",
      reason: "watcher-error"
    });
    expect(fixture.watchers[0]?.close).toHaveBeenCalledTimes(1);
  });

  it("closes the watcher and clears pending debounce timers when stopped", async () => {
    const fixture = createWatchFixture();

    fixture.service.watchRepo(repoPath);
    fixture.emitChange();
    fixture.service.stopWatching();

    await vi.advanceTimersByTimeAsync(750);
    expect(fixture.watchers[0]?.close).toHaveBeenCalledTimes(1);
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
  const listeners: Array<(eventType: string, filename: string | Buffer | null) => void> = [];
  const watchFactory = vi.fn<RepoWatchFactory>((_repoPath, _options, listener) => {
    const watcher = new FakeWatcher();
    watchers.push(watcher);
    listeners.push(listener);
    return watcher;
  });
  const service = new RepoWatchService({
    getWindows: () => [window],
    watchFactory,
    debounceMs: 750,
    maxWaitMs: 2_000,
    clock: () => new Date("2026-05-31T10:00:00Z")
  });

  return {
    service,
    send,
    watchFactory,
    watchers,
    emitChange(index = 0, filename: string | Buffer | null = "src/App.tsx"): void {
      listeners[index]?.("change", filename);
    }
  };
}
