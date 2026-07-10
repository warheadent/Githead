import { describe, expect, it } from "vite-plus/test";
import { mapWithConcurrency } from "./asyncMap";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("mapWithConcurrency", () => {
  it("limits active work and preserves input order", async () => {
    const pending = Array.from({ length: 7 }, () => deferred<number>());
    let active = 0;
    let maximumActive = 0;
    const result = mapWithConcurrency(pending, 4, async (item) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      try {
        return await item.promise;
      } finally {
        active -= 1;
      }
    });

    await Promise.resolve();
    expect(active).toBe(4);
    pending[3]!.resolve(30);
    await Promise.resolve();
    pending[0]!.resolve(0);
    await Promise.resolve();
    pending[4]!.resolve(40);
    pending[1]!.resolve(10);
    pending[2]!.resolve(20);
    await Promise.resolve();
    pending[5]!.resolve(50);
    pending[6]!.resolve(60);

    await expect(result).resolves.toEqual([0, 10, 20, 30, 40, 50, 60]);
    expect(maximumActive).toBe(4);
  });

  it("handles empty and smaller-than-limit collections", async () => {
    await expect(mapWithConcurrency([], 4, async (value) => value)).resolves.toEqual([]);
    await expect(mapWithConcurrency([1, 2], 4, async (value) => value * 2)).resolves.toEqual([2, 4]);
  });

  it("stops scheduling new work after a rejection and waits for in-flight work", async () => {
    const blocker = deferred<number>();
    const failure = new Error("status failed");
    const started: number[] = [];
    const result = mapWithConcurrency([0, 1, 2, 3, 4], 2, async (value) => {
      started.push(value);
      if (value === 0) {
        throw failure;
      }
      return blocker.promise;
    });

    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    blocker.resolve(1);

    await expect(result).rejects.toBe(failure);
    expect(started).toEqual([0, 1]);
  });

  it("rejects invalid concurrency limits", async () => {
    await expect(mapWithConcurrency([1], 0, async (value) => value)).rejects.toThrow(RangeError);
  });
});
