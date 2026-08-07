import { describe, expect, it, vi } from "vite-plus/test";
import { WorkspacePanelStateStore } from "./workspacePanelState";

describe("WorkspacePanelStateStore", () => {
  it("keeps one stable lazy value for each repository and key", () => {
    const store = new WorkspacePanelStateStore();
    const createInitialValue = vi.fn(() => ({ query: "" }));

    const first = store.read("repo-a", "stash-filter", createInitialValue);
    const second = store.read("repo-a", "stash-filter", createInitialValue);

    expect(second).toBe(first);
    expect(createInitialValue).toHaveBeenCalledTimes(1);
  });

  it("notifies only the listeners for the value that changed", () => {
    const store = new WorkspacePanelStateStore();
    const repoAListener = vi.fn();
    const repoBListener = vi.fn();
    store.subscribe("repo-a", "query", repoAListener);
    store.subscribe("repo-b", "query", repoBListener);

    store.write("repo-a", "query", "icons");
    store.write("repo-a", "query", "icons");

    expect(repoAListener).toHaveBeenCalledTimes(1);
    expect(repoBListener).not.toHaveBeenCalled();
  });

  it("limits retained repository state", () => {
    const store = new WorkspacePanelStateStore();
    store.write("repo-0", "query", "old");
    for (let index = 1; index <= 8; index += 1) {
      store.write(`repo-${index}`, "query", `value-${index}`);
    }

    expect(store.read("repo-0", "query", "fresh")).toBe("fresh");
    expect(store.read("repo-8", "query", "fresh")).toBe("value-8");
  });
});
