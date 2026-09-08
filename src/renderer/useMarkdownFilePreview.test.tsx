// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { createGitheadMock } from "./AppTestHarness";
import { useMarkdownFilePreview } from "./useMarkdownFilePreview";
import type { GitFilePreview } from "@/shared/types";

afterEach(cleanup);
it("keeps cached text during refresh, ignores cancelled replies, and retries after a failure", async () => {
  window.githead = createGitheadMock();
  const request = { repoPath: "/repo", path: "README.md", source: { kind: "working" } as const };
  const pending: ((value: GitFilePreview) => void)[] = [];
  vi.mocked(window.githead.getFilePreview).mockResolvedValueOnce({ path: request.path, text: "# Original" })
    .mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
  const { result, rerender } = renderHook(({ version, enabled }) => useMarkdownFilePreview(request, version, enabled), { initialProps: { version: 1, enabled: true } });
  await waitFor(() => expect(result.current.text).toBe("# Original"));
  rerender({ version: 1, enabled: false });
  rerender({ version: 1, enabled: true });
  expect(window.githead.getFilePreview).toHaveBeenCalledTimes(1);
  rerender({ version: 2, enabled: true });
  expect(result.current.text).toBe("# Original");
  expect(result.current.loading).toBe(true);
  rerender({ version: 3, enabled: true });
  await act(async () => pending[0]!({ path: request.path, text: "# Stale" }));
  expect(result.current.text).toBe("# Original");
  await act(async () => pending[1]!({ path: request.path, text: "# Latest" }));
  expect(result.current.text).toBe("# Latest");
  vi.mocked(window.githead.getFilePreview).mockRejectedValueOnce(new Error("Read failed"));
  rerender({ version: 4, enabled: true });
  await waitFor(() => expect(result.current.error).toBe("Read failed"));
  expect(result.current.text).toBe("# Latest");
  vi.mocked(window.githead.getFilePreview).mockResolvedValueOnce({ path: request.path, text: "# Recovered" });
  rerender({ version: 4, enabled: false });
  rerender({ version: 4, enabled: true });
  await waitFor(() => expect(result.current.text).toBe("# Recovered"));
});
