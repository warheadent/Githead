import { Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";
import { forkEffect, runEffect, tryPromise } from "./effectRuntime";

describe("effectRuntime", () => {
  it("preserves typed failures at Promise boundaries", async () => {
    const error = new Error("request failed");

    await expect(runEffect(Effect.fail(error))).rejects.toBe(error);
  });

  it("preserves an external abort reason", async () => {
    const controller = new AbortController();
    const reason = new DOMException("Repository changed.", "AbortError");
    const operation = runEffect(tryPromise(() => new Promise<never>(() => undefined)), {
      signal: controller.signal
    });

    controller.abort(reason);

    await expect(operation).rejects.toBe(reason);
  });

  it("runs interruption finalizers once", async () => {
    const finalized = vi.fn();
    const running = forkEffect(
      tryPromise(() => new Promise<never>(() => undefined)).pipe(
        Effect.onInterrupt(() => Effect.sync(finalized))
      )
    );

    running.interrupt();
    running.interrupt();

    await expect(running.promise).rejects.toMatchObject({ name: "AbortError" });
    expect(finalized).toHaveBeenCalledTimes(1);
  });
});
