import { IPC_CHANNELS } from "../shared/ipc";
import type { GitOperationResult, GitOutputEvent } from "../shared/types";

export interface GitOutputTarget {
  isDestroyed(): boolean;
  send(channel: string, event: GitOutputEvent): void;
}

export interface GitOutputSink {
  write(event: GitOutputEvent): void;
  flush(): void;
}

export async function runWithGitOutputSink<T>(
  sink: GitOutputSink,
  operation: (write: GitOutputSink["write"]) => Promise<T>
): Promise<T> {
  try {
    return await operation(sink.write);
  } finally {
    sink.flush();
  }
}

/** Attach repository identity and explicit outcomes without parsing command text. */
export async function runWithRepositoryGitOutput<T extends GitOperationResult>(
  sink: GitOutputSink,
  repoPath: string,
  operation: (write: GitOutputSink["write"]) => Promise<T>
): Promise<T> {
  return runWithGitOutputSink(sink, async (write) => {
    const runs = new Map<string, GitOutputEvent>();
    let exitCode = -1;
    let startedAt: string | undefined;
    let endedAt: string | undefined;
    try {
      const result = await operation((output) => {
        if (!runs.has(output.runId)) runs.set(output.runId, output);
        write({ ...output, repoPath });
      });
      exitCode = result.exitCode;
      if ("startedAt" in result && typeof result.startedAt === "string") startedAt = result.startedAt;
      if ("endedAt" in result && typeof result.endedAt === "string") endedAt = result.endedAt;
      return { ...result, outputStreamed: runs.size > 0 };
    } finally {
      for (const first of runs.values()) {
        write({ ...first, repoPath, stream: "system", text: "", startedAt: startedAt ?? first.timestamp, timestamp: endedAt ?? new Date().toISOString(), exitCode });
      }
    }
  });
}

export interface GitOutputBatcherOptions {
  getBroadcastTargets: () => GitOutputTarget[];
  flushIntervalMs?: number;
  maxBatchChars?: number;
  maxPendingEvents?: number;
  schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  cancelScheduled?: (timer: ReturnType<typeof setTimeout>) => void;
}

interface PendingGitOutput {
  target: GitOutputTarget | null;
  event: GitOutputEvent;
  sourceEventCount: number;
}

const DEFAULT_FLUSH_INTERVAL_MS = 32;
const DEFAULT_MAX_BATCH_CHARS = 64 * 1024;
const DEFAULT_MAX_PENDING_EVENTS = 512;

/**
 * Coalesces adjacent output chunks before they cross the Electron IPC boundary.
 * The queue keeps arrival order. A target owned by an operation never falls back
 * to another window if its renderer is gone.
 */
export class GitOutputBatcher {
  private readonly getBroadcastTargets: () => GitOutputTarget[];
  private readonly flushIntervalMs: number;
  private readonly maxBatchChars: number;
  private readonly maxPendingEvents: number;
  private readonly schedule: NonNullable<GitOutputBatcherOptions["schedule"]>;
  private readonly cancelScheduled: NonNullable<GitOutputBatcherOptions["cancelScheduled"]>;
  private pending: PendingGitOutput[] = [];
  private pendingEventCount = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: GitOutputBatcherOptions) {
    this.getBroadcastTargets = options.getBroadcastTargets;
    this.flushIntervalMs = Math.max(0, options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS);
    this.maxBatchChars = Math.max(1, options.maxBatchChars ?? DEFAULT_MAX_BATCH_CHARS);
    this.maxPendingEvents = Math.max(1, options.maxPendingEvents ?? DEFAULT_MAX_PENDING_EVENTS);
    this.schedule = options.schedule ?? setTimeout;
    this.cancelScheduled = options.cancelScheduled ?? clearTimeout;
  }

  createSink(target?: GitOutputTarget): GitOutputSink {
    return {
      write: (event) => this.enqueue(event, target),
      flush: () => {
        if (target) {
          this.flushTarget(target);
        } else {
          this.flushBroadcast();
        }
      }
    };
  }

  enqueue(event: GitOutputEvent, target?: GitOutputTarget): void {
    if (event.exitCode !== undefined) {
      if (target) this.flushTarget(target);
      else this.flushBroadcast();
      this.send({ target: target ?? null, event, sourceEventCount: 1 });
      return;
    }
    if (!event.text) {
      return;
    }

    this.pendingEventCount += 1;
    let remainingText = event.text;
    let sourceEventRecorded = false;
    while (remainingText.length > 0) {
      const last = this.pending.at(-1);
      if (last && canMerge(last, target, event, this.maxBatchChars)) {
        const availableChars = this.maxBatchChars - last.event.text.length;
        const appendedText = remainingText.slice(0, availableChars);
        last.event = {
          ...last.event,
          text: `${last.event.text}${appendedText}`
        };
        if (!sourceEventRecorded) {
          last.sourceEventCount += 1;
          sourceEventRecorded = true;
        }
        remainingText = remainingText.slice(appendedText.length);
        continue;
      }

      const nextText = remainingText.slice(0, this.maxBatchChars);
      this.pending.push({
        target: target ?? null,
        event: {
          ...event,
          text: nextText
        },
        sourceEventCount: sourceEventRecorded ? 0 : 1
      });
      sourceEventRecorded = true;
      remainingText = remainingText.slice(nextText.length);
    }

    if (this.pendingEventCount >= this.maxPendingEvents) {
      this.flushAll();
      return;
    }

    this.scheduleFlush();
  }

  flushTarget(target: GitOutputTarget): void {
    this.flushMatching((entry) => entry.target === target);
  }

  flushBroadcast(): void {
    this.flushMatching((entry) => entry.target === null);
  }

  flushAll(): void {
    this.clearTimer();
    const pending = this.pending;
    this.pending = [];
    this.pendingEventCount = 0;

    for (const entry of pending) {
      this.send(entry);
    }
  }

  private scheduleFlush(): void {
    if (this.timer !== null) {
      return;
    }

    this.timer = this.schedule(() => {
      this.timer = null;
      this.flushAll();
    }, this.flushIntervalMs);
  }

  private flushMatching(matches: (entry: PendingGitOutput) => boolean): void {
    const matching: PendingGitOutput[] = [];
    const remaining: PendingGitOutput[] = [];

    for (const entry of this.pending) {
      (matches(entry) ? matching : remaining).push(entry);
    }

    this.pending = remaining;
    this.pendingEventCount -= matching.reduce((count, entry) => count + entry.sourceEventCount, 0);
    if (remaining.length === 0) {
      this.clearTimer();
    }

    for (const entry of matching) {
      this.send(entry);
    }
  }

  private clearTimer(): void {
    if (this.timer === null) {
      return;
    }

    this.cancelScheduled(this.timer);
    this.timer = null;
  }

  private send(entry: PendingGitOutput): void {
    if (entry.target) {
      sendToTarget(entry.target, entry.event);
      return;
    }

    for (const target of this.getBroadcastTargets()) {
      sendToTarget(target, entry.event);
    }
  }
}

function canMerge(
  pending: PendingGitOutput,
  target: GitOutputTarget | undefined,
  event: GitOutputEvent,
  maxBatchChars: number
): boolean {
  return pending.target === (target ?? null)
    && pending.event.repoPath === event.repoPath
    && pending.event.runId === event.runId
    && pending.event.action === event.action
    && pending.event.stream === event.stream
    && pending.event.text.length < maxBatchChars;
}

function sendToTarget(target: GitOutputTarget, event: GitOutputEvent): void {
  if (target.isDestroyed()) {
    return;
  }

  try {
    target.send(IPC_CHANNELS.gitOutput, event);
  } catch {
    // A renderer can close between the state check and the send call.
  }
}
