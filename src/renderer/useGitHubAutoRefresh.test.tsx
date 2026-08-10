// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { useGitHubAutoRefresh } from "./useGitHubAutoRefresh";

afterEach(() => {
  vi.useRealTimers();
});

describe("useGitHubAutoRefresh", () => {
  it("polls on the configured cadence without overlapping requests", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const refresh = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    renderHook(() => useGitHubAutoRefresh({ enabled: true, intervalMs: 5_000, refresh }));

    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => { finish(); await Promise.resolve(); });
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("pauses after blur and refreshes immediately when focus returns", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useGitHubAutoRefresh({ enabled: true, intervalMs: 30_000, refresh }));

    act(() => window.dispatchEvent(new Event("blur")));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("stops polling when disabled", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ enabled }) => useGitHubAutoRefresh({ enabled, intervalMs: 5_000, refresh }), {
      initialProps: { enabled: true }
    });

    rerender({ enabled: false });
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(refresh).not.toHaveBeenCalled();
  });
});
