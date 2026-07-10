export async function mapWithConcurrency<T, U>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<U>
): Promise<U[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("Concurrency must be a positive integer.");
  }

  const results = Array.from({ length: values.length }, () => undefined as U);
  let nextIndex = 0;
  const state: { failure?: unknown } = {};

  const worker = async (): Promise<void> => {
    while (!("failure" in state)) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) {
        return;
      }
      const value = values[index]!;

      try {
        results[index] = await mapper(value, index);
      } catch (error) {
        state.failure = error;
      }
    }
  };

  await Promise.all(Array.from(
    { length: Math.min(concurrency, values.length) },
    () => worker()
  ));

  if ("failure" in state) {
    throw state.failure;
  }

  return results;
}
