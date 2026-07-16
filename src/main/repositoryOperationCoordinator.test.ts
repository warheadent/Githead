import { describe, expect, it, vi } from "vite-plus/test";
import { RepositoryOperationCoordinator } from "./repositoryOperationCoordinator";

describe("RepositoryOperationCoordinator", () => {
  it("rejects overlap in one repository while allowing another repository", async () => {
    const coordinator = new RepositoryOperationCoordinator();
    let finishFirst!: () => void;
    const first = coordinator.run("D:\\Repo", 10_000, () => new Promise<void>((resolve) => {
      finishFirst = resolve;
    }));

    expect(coordinator.isRunning("d:\\repo\\")).toBe(true);
    await expect(coordinator.run("D:\\Repo", 10_000, async () => "same")).resolves.toEqual({ started: false });
    await expect(coordinator.run("D:\\Other", 10_000, async () => "other")).resolves.toEqual({ started: true, value: "other" });

    finishFirst();
    await expect(first).resolves.toEqual({ started: true, value: undefined });
    expect(coordinator.isRunning("D:\\Repo")).toBe(false);
  });

  it("aborts an operation explicitly and releases its repository", async () => {
    const coordinator = new RepositoryOperationCoordinator();
    const operation = coordinator.run("D:\\Repo", 10_000, (signal) => new Promise<string>((resolve) => {
      signal.addEventListener("abort", () => resolve((signal.reason as Error).name), { once: true });
    }));

    expect(coordinator.cancel("D:\\Repo")).toBe(true);
    await expect(operation).resolves.toEqual({ started: true, value: "AbortError" });
    expect(coordinator.isRunning("D:\\Repo")).toBe(false);
  });

  it("aborts operations that exceed their timeout", async () => {
    vi.useFakeTimers();
    const coordinator = new RepositoryOperationCoordinator();
    const operation = coordinator.run("D:\\Repo", 50, (signal) => new Promise<string>((resolve) => {
      signal.addEventListener("abort", () => resolve((signal.reason as Error).name), { once: true });
    }));

    await vi.advanceTimersByTimeAsync(50);
    await expect(operation).resolves.toEqual({ started: true, value: "TimeoutError" });
    expect(coordinator.isRunning("D:\\Repo")).toBe(false);
    vi.useRealTimers();
  });
});
