import { describe, expect, it, vi } from "vite-plus/test";
import { RequestRegistry } from "./requestRegistry";

describe("RequestRegistry", () => {
  it("registers and cancels requests independently by owner", () => {
    const registry = new RequestRegistry<number>();
    const first = registry.register(1, "summary");
    const second = registry.register(2, "summary");

    registry.cancel(1, "summary");

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
  });

  it("aborts a replaced request with the same owner and id", () => {
    const registry = new RequestRegistry<number>();
    const first = registry.register(1, "summary");
    const second = registry.register(1, "summary");

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
  });

  it("does not let late completion remove a replacement request", () => {
    const registry = new RequestRegistry<number>();
    const first = registry.register(1, "summary");
    const replacement = registry.register(1, "summary");
    const abort = vi.fn();
    replacement.signal.addEventListener("abort", abort);

    first.complete();
    registry.cancel(1, "summary");

    expect(abort).toHaveBeenCalledTimes(1);
  });

  it("completes a request without aborting it", () => {
    const registry = new RequestRegistry<number>();
    const registration = registry.register(1, "summary");

    registration.complete();
    registry.cancel(1, "summary");

    expect(registration.signal.aborted).toBe(false);
  });

  it("cancels all requests owned by one sender", () => {
    const registry = new RequestRegistry<number>();
    const summary = registry.register(1, "summary");
    const history = registry.register(1, "history");
    const otherOwner = registry.register(2, "summary");

    registry.cancelAll(1);

    expect(summary.signal.aborted).toBe(true);
    expect(history.signal.aborted).toBe(true);
    expect(otherOwner.signal.aborted).toBe(false);
  });
});
