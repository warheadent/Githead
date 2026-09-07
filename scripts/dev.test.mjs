import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), close: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("electron", () => ({ default: "/electron" }));
vi.mock("vite-plus", () => ({ createServer: async () => ({ listen: async () => {}, printUrls() {}, resolvedUrls: { local: ["http://localhost:5173/"] }, close: mocks.close }) }));

let electron;
beforeEach(() => {
  vi.resetModules();
  mocks.spawn.mockReset();
  mocks.close.mockReset().mockResolvedValue(undefined);
  electron = new EventEmitter();
  mocks.spawn.mockImplementationOnce(() => {
    const build = new EventEmitter();
    queueMicrotask(() => build.emit("close", 0));
    return build;
  }).mockReturnValue(electron);
  vi.spyOn(process, "on").mockReturnValue(process);
  vi.spyOn(process, "exit").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function launch(args = []) {
  vi.spyOn(process, "argv", "get").mockReturnValue(["node", "dev.mjs", ...args]);
  await import("./dev.mjs");
}

describe("development launcher", () => {
  it("keeps sandboxing enabled by default", async () => {
    await launch();
    expect(mocks.spawn.mock.calls[1][1]).toEqual(["."]);
  });
  it("passes an explicit sandbox opt-out to Electron", async () => {
    await launch(["--remote-debugging-port=9222", "--no-sandbox"]);
    expect(mocks.spawn.mock.calls[1][1]).toEqual([".", "--no-sandbox"]);
    expect(mocks.spawn.mock.calls[1][2].env.GITHEAD_REMOTE_DEBUGGING_PORT).toBe("9222");
  });
  it("reports a signal crash as failure and closes Vite", async () => {
    await launch();
    electron.emit("close", null, "SIGTRAP");
    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledWith(1));
    expect(mocks.close).toHaveBeenCalled();
  });
  it("preserves a normal exit status", async () => {
    await launch();
    electron.emit("close", 0, null);
    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledWith(0));
  });
});
