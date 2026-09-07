// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { GitStashDetails, GitStashEntry } from "../shared/types";
import { useGitStashes } from "./useGitStashes";

const entries: GitStashEntry[] = ["first", "second", "third"].map((message, index) => ({
  ref: `stash@{${index}}`, hash: message, message, sourceBranch: "main", createdAt: "2026-09-07T00:00:00Z"
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup() {
  let savedEntries = entries;
  const getStashes = vi.fn(async () => savedEntries);
  const getStashDetails = vi.fn(async ({ stashRef }: { stashRef: string }): Promise<GitStashDetails> => ({
    stash: savedEntries.find((entry) => entry.ref === stashRef)!, files: []
  }));
  vi.stubGlobal("githead", { getStashes, getStashDetails });
  const hook = renderHook(() => useGitStashes("/repo", true, true));
  return { ...hook, getStashDetails, removeFirst: () => {
    savedEntries = entries.slice(1).map((entry, index) => ({ ...entry, ref: `stash@{${index}}` }));
  } };
}

it("keeps the selected stash by hash when another stash is removed", async () => {
  const { result, removeFirst } = setup();
  await waitFor(() => expect(result.current.state.details?.stash.hash).toBe("first"));
  await act(() => result.current.select("stash@{1}"));
  removeFirst();
  await act(() => result.current.refresh());
  await waitFor(() => expect(result.current.state.details?.stash.hash).toBe("second"));
  expect(result.current.state.selectedRef).toBe("stash@{0}");
  expect(result.current.state.details?.stash.ref).toBe("stash@{0}");
});

it("reloads details when the selected stash is removed and its ref is reused", async () => {
  const { result, removeFirst } = setup();
  await waitFor(() => expect(result.current.state.details?.stash.hash).toBe("first"));
  removeFirst();
  await act(() => result.current.refresh());
  await waitFor(() => expect(result.current.state.details?.stash.hash).toBe("second"));
  expect(result.current.state.selectedRef).toBe("stash@{0}");
});

it("ignores an old details response after refreshing renumbered stashes", async () => {
  const { result, removeFirst, getStashDetails } = setup();
  await waitFor(() => expect(result.current.state.details?.stash.hash).toBe("first"));
  let resolveDetails!: (details: GitStashDetails) => void;
  getStashDetails.mockImplementationOnce(() => new Promise((resolve) => { resolveDetails = resolve; }));
  let selection!: Promise<void>;
  act(() => { selection = result.current.select("stash@{1}"); });
  removeFirst();
  await act(() => result.current.refresh());
  await waitFor(() => expect(result.current.state.details?.stash.ref).toBe("stash@{0}"));
  await act(async () => {
    resolveDetails({ stash: entries[1]!, files: [] });
    await selection;
  });
  expect(result.current.state.details?.stash.ref).toBe("stash@{0}");
  expect(result.current.state.details?.stash.hash).toBe("second");
});
