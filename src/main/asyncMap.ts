import { Effect } from "effect";
import { runEffect, tryPromise } from "../shared/effectRuntime";

export async function mapWithConcurrency<T, U>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<U>
): Promise<U[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("Concurrency must be a positive integer.");
  }

  return runEffect(Effect.forEach(
    values,
    (value, index) => Effect.uninterruptible(tryPromise(() => mapper(value, index))),
    { concurrency }
  ));
}
