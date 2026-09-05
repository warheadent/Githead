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
    expect(store.getAttentionSnapshot()).toBe("unread");
    expect(listener).toHaveBeenCalledTimes(1);

    store.append({ ...output(""), stream: "system", exitCode: 1 });
    expect(store.getAttentionSnapshot()).toBe("error");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("suppresses and clears attention while the log is being viewed", () => {
    const store = new ActivityLogStore();
    store.setViewing(true);
    store.append(output("visible\n"));
    expect(store.getAttentionSnapshot()).toBe("none");

    store.setViewing(false);
    store.append({ ...output(""), stream: "system", exitCode: 0 });
    expect(store.getAttentionSnapshot()).toBe("unread");

    store.setViewing(true);
    expect(store.getAttentionSnapshot()).toBe("none");
  });
});

it("uses completion status for stderr and retains an unrelated unread failure", () => {
  const store = new ActivityLogStore();
  store.append({ ...output("normal progress\n"), stream: "stderr" });
  store.append({ ...output(""), exitCode: 0 });
  expect(store.getAttentionSnapshot()).toBe("unread");
  store.append({ ...output(""), runId: "failed", exitCode: 1 });
  store.append({ ...output(""), runId: "successful", exitCode: 0 });
  expect(store.getAttentionSnapshot()).toBe("error");
});

it("isolates repository history, late output, unread state and clearing", () => {
  const store = new ActivityLogStore();
  store.setRepository("/repo/a");
  store.append({ ...output("first\n"), repoPath: "/repo/a" });
  store.setRepository("/repo/b");
  store.append({ ...output("second\n"), repoPath: "/repo/b", runId: "second" });
  store.setViewing(true);
  store.append({ ...output("late failure\n"), repoPath: "/repo/a", exitCode: 1 });
  expect(store.getRawText()).toBe("[stdout] second\n");
  expect(store.getAttentionSnapshot()).toBe("none");
  store.clear();
  store.setViewing(false);
  store.setRepository("/repo/a");
  expect(store.getRawText()).toBe("[stdout] first\n[stdout] late failure\n");
  expect(store.getAttentionSnapshot()).toBe("error");
});

it("keeps completed runs and exports one run without clearing previous output", () => {
  const store = new ActivityLogStore();
  const result = { repoPath: "/repo", action: "fetch", exitCode: 0, stdout: "done", stderr: "", startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T00:00:02Z" };
  store.completeRun({ ...result, runId: "first" });
  store.completeRun({ ...result, runId: "second", stdout: "another" });
  expect(store.getSnapshot().runs).toHaveLength(2);
  expect(store.getRawText("first")).toContain("done");
  expect(store.getRawText("first")).not.toContain("another");
  const listener = vi.fn();
  store.subscribe(listener);
  store.completeRun({ ...result, runId: "second", stdout: "another" });
  expect(listener).not.toHaveBeenCalled();
});

it("preserves partial ANSI state when the log is cleared during a run", () => {
  const store = new ActivityLogStore();
  store.append(output("\u001b[3"));
  store.clear();
  store.append(output("1mred\u001b[0m"));
  expect(store.getSnapshot().blocks[0]?.html).toContain("ansi-red-fg");
});

it("does not mark another repository as read when switching away from the log", () => {
  const store = new ActivityLogStore();
  store.setRepository("/repo/a", true);
  store.append({ ...output("failed\n"), repoPath: "/repo/b", exitCode: 1 });
  store.setRepository("/repo/b", false);
  expect(store.getAttentionSnapshot()).toBe("error");
});

it("does not duplicate output when an IPC result arrives before its stream events", () => {
  const store = new ActivityLogStore();
  store.completeRun({
    repoPath: "/repo", runId: "run-1", action: "fetch", exitCode: 0, stdout: "done\n", stderr: "", outputStreamed: true,
    startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T00:00:02Z"
  });
  store.append({ ...output("done\n"), repoPath: "/repo" });
  expect(store.getRawText()).toBe("[stdout] done\n");
  expect(store.getSnapshot().runs[0]?.exitCode).toBe(0);
});

it("does not rerender the current repository for another repository's output", () => {
  const store = new ActivityLogStore();
  store.setRepository("/repo/a");
  store.append(output("visible"));
  const snapshot = store.getSnapshot();
  const listener = vi.fn();
  store.subscribe(listener);
  store.append({ ...output("background"), repoPath: "/repo/b", runId: "background" });
  expect(store.getSnapshot()).toBe(snapshot);
  expect(listener).not.toHaveBeenCalled();
});
