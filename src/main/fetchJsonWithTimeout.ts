type Fetch = typeof fetch;

export interface FetchJsonWithTimeoutOptions<T> {
  timeoutMs: number;
  /** Inactivity mode resets the timeout on headers and non-empty body chunks. */
  timeoutMode?: "total" | "inactivity";
  signal?: AbortSignal;
  timeoutReason?: unknown;
  createJsonFallback?: () => T;
}

export interface FetchJsonResult<T> {
  response: Response;
  payload: T;
}

/**
 * Keeps timeout and external cancellation active through both response headers
 * and JSON body consumption. The explicit abort race also bounds fetch
 * implementations or response bodies that do not observe the supplied signal.
 */
export async function fetchJsonWithTimeout<T>(
  fetchImpl: Fetch,
  input: Parameters<Fetch>[0],
  init: RequestInit,
  options: FetchJsonWithTimeoutOptions<T>
): Promise<FetchJsonResult<T>> {
  const controller = new AbortController();
  let externalListenerAttached = false;
  const onExternalAbort = () => {
    controller.abort(options.signal?.reason);
  };
  if (options.signal?.aborted) {
    onExternalAbort();
  } else if (options.signal) {
    options.signal.addEventListener("abort", onExternalAbort, { once: true });
    externalListenerAttached = true;
  }
  const timeout = setTimeout(() => {
    controller.abort(options.timeoutReason ?? new DOMException(
      `Request timed out after ${options.timeoutMs}ms.`,
      "TimeoutError"
    ));
  }, options.timeoutMs);

  try {
    controller.signal.throwIfAborted();
    const response = await raceWithAbort(fetchImpl(input, {
      ...init,
      signal: controller.signal
    }), controller.signal);
    const onActivity = options.timeoutMode === "inactivity" ? () => { timeout.refresh(); } : undefined;
    onActivity?.();
    const payload = await parseJson(response, controller.signal, options.createJsonFallback, onActivity);
    return { response, payload };
  } catch (error) {
    if (controller.signal.aborted) {
      throw controller.signal.reason;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (externalListenerAttached) {
      options.signal?.removeEventListener("abort", onExternalAbort);
    }
  }
}

async function parseJson<T>(
  response: Response,
  signal: AbortSignal,
  createFallback: (() => T) | undefined,
  onActivity: (() => void) | undefined
): Promise<T> {
  try {
    if (!onActivity || !response.body) {
      return await raceWithAbort(response.json() as Promise<T>, signal);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    try {
      while (true) {
        const { done, value } = await raceWithAbort(reader.read(), signal);
        if (done) break;
        if (value.byteLength > 0) {
          onActivity();
          chunks.push(decoder.decode(value, { stream: true }));
        }
      }
      chunks.push(decoder.decode());
      return JSON.parse(chunks.join("")) as T;
    } finally {
      if (signal.aborted) {
        // Cancellation must not wait for an unresponsive underlying stream.
        void reader.cancel(signal.reason).catch(() => undefined);
      }
      reader.releaseLock();
    }
  } catch (error) {
    if (signal.aborted) {
      throw signal.reason;
    }
    if (createFallback) {
      return createFallback();
    }
    throw error;
  }
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const resolveOnce = (value: T) => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const rejectOnce = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", onAbort);
      reject(error);
    };
    const onAbort = () => {
      rejectOnce(signal.reason);
    };

    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }

    promise.then(resolveOnce, rejectOnce);
  });
}
