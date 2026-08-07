import { describe, expect, it, vi } from "vite-plus/test";
import type { GitOperationResult, GitOutputEvent } from "../shared/types";
import { ActivityLogStore } from "./activityLogStore";

function output(text: string): GitOutputEvent {
  return {
    runId: "run-1",
    action: "fetch",
    stream: "stdout",
    text,
    timestamp: "2026-01-01T00:00:00.000Z"
  };
}

describe("ActivityLogStore", () => {
  it("notifies only its subscribers when output changes", () => {
    const store = new ActivityLogStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.append(output("one\n"));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getRawText()).toBe("[stdout] one\n");

    unsubscribe();
    store.append(output("two\n"));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getRawText()).toBe("[stdout] one\ntwo\n");
  });

  it("does not notify for empty output or an empty clear", () => {
    const store = new ActivityLogStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.append(output(""));
    store.clear();

    expect(listener).not.toHaveBeenCalled();
  });

  it("adds operation results and clears them", () => {
    const store = new ActivityLogStore();
    const result: GitOperationResult = {
      repoPath: "C:\\repo",
      exitCode: 0,
      stdout: "done",
      stderr: ""
    };

    store.appendOperationResult("Refresh", result);
    expect(store.getRawText()).toContain("Refresh exited with code 0.");

    store.clear();
    expect(store.getRawText()).toBe("");
  });

  it("tracks unread output without notifying on every chunk", () => {
    const store = new ActivityLogStore();
    const listener = vi.fn();
    store.subscribeAttention(listener);

    store.append(output("one\n"));
    store.append(output("two\n"));

    expect(store.getAttentionSnapshot()).toBe("unread");
    expect(listener).toHaveBeenCalledTimes(1);

    store.append({ ...output("failure\n"), stream: "stderr" });
    expect(store.getAttentionSnapshot()).toBe("error");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("suppresses and clears attention while the log is being viewed", () => {
    const store = new ActivityLogStore();
    store.setViewing(true);
    store.append(output("visible\n"));
    expect(store.getAttentionSnapshot()).toBe("none");

    store.setViewing(false);
    store.markOperationOutcome(false);
    expect(store.getAttentionSnapshot()).toBe("unread");

    store.setViewing(true);
    expect(store.getAttentionSnapshot()).toBe("none");
  });
});
