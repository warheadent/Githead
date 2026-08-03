import { Cause, Effect, Exit } from "effect";

export interface RunEffectOptions {
  signal?: AbortSignal | undefined;
}

export interface RunningEffect<A> {
  promise: Promise<A>;
  interrupt(): void;
}

/** Runs an Effect at a Promise-based application boundary. */
export async function runEffect<A, E>(
  effect: Effect.Effect<A, E>,
  options: RunEffectOptions = {}
): Promise<A> {
  const exit = await Effect.runPromiseExit(effect, { signal: options.signal });
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  if (options.signal?.aborted) {
    throw options.signal.reason ?? new DOMException("Operation was cancelled.", "AbortError");
  }

  throw errorFromCause(exit.cause);
}

/** Starts an Effect and exposes one synchronous interruption function. */
export function forkEffect<A, E>(effect: Effect.Effect<A, E>): RunningEffect<A> {
  let interrupt = (): void => undefined;
  const promise = new Promise<A>((resolve, reject) => {
    interrupt = Effect.runCallback(effect, {
      onExit: (exit) => {
        if (Exit.isSuccess(exit)) {
          resolve(exit.value);
        } else {
          reject(errorFromCause(exit.cause));
        }
      }
    });
  });
  return { promise, interrupt: () => interrupt() };
}

export function tryPromise<A>(
  operation: (signal: AbortSignal) => PromiseLike<A>
): Effect.Effect<A, unknown> {
  return Effect.tryPromise({
    try: operation,
    catch: (error) => error
  });
}

function errorFromCause<E>(cause: Cause.Cause<E>): unknown {
  return Cause.hasInterruptsOnly(cause)
    ? new DOMException("Effect task was interrupted.", "AbortError")
    : Cause.squash(cause);
}
