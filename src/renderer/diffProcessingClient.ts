import type { ProcessedDiff } from "./diffProcessing";
import { processDiffPlain, type DiffProcessingInput } from "./diffProcessingPlain";
import type { DiffWorkerRequest, DiffWorkerResponse } from "./diffProcessing.worker";
import DiffProcessingWorker from "./diffProcessing.worker?worker";

const DEFAULT_CACHE_ENTRY_LIMIT = 12;
const DEFAULT_QUEUED_REQUEST_LIMIT = 16;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export type { DiffProcessingInput, ProcessedDiff };

export interface DiffProcessingSession {
  process(input: DiffProcessingInput): Promise<ProcessedDiff | null>;
  cancel(): void;
  dispose(): void;
}

export interface DiffWorkerLike {
  onmessage: ((event: MessageEvent<DiffWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: DiffWorkerRequest): void;
  terminate(): void;
}

export interface DiffProcessingServiceOptions {
  workerFactory?: () => DiffWorkerLike | null;
  cacheEntryLimit?: number;
  queuedRequestLimit?: number;
  requestTimeoutMs?: number;
}

interface PendingRequest {
  requestId: number;
  sessionId: number;
  input: DiffProcessingInput;
  cacheKey: string;
  resolve: (result: ProcessedDiff | null) => void;
}

export class DiffProcessingService {
  private readonly workerFactory: () => DiffWorkerLike | null;
  private readonly cacheEntryLimit: number;
  private readonly queuedRequestLimit: number;
  private readonly requestTimeoutMs: number;
  private readonly cache = new Map<string, ProcessedDiff>();
  private readonly queue: PendingRequest[] = [];
  private worker: DiffWorkerLike | null = null;
  private active: PendingRequest | null = null;
  private activeTimeout: ReturnType<typeof setTimeout> | null = null;
  private nextRequestId = 1;
  private nextSessionId = 1;
  private workerDisabled = false;
  private disposed = false;

  constructor(options: DiffProcessingServiceOptions = {}) {
    this.workerFactory = options.workerFactory ?? createBrowserWorker;
    this.cacheEntryLimit = toPositiveInteger(options.cacheEntryLimit, DEFAULT_CACHE_ENTRY_LIMIT);
    this.queuedRequestLimit = toPositiveInteger(options.queuedRequestLimit, DEFAULT_QUEUED_REQUEST_LIMIT);
    this.requestTimeoutMs = toPositiveInteger(options.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
  }

  createSession(): DiffProcessingSession {
    const sessionId = this.nextSessionId;
    this.nextSessionId += 1;
    let generation = 0;
    let sessionDisposed = false;

    return {
      process: async (input) => {
        if (sessionDisposed) {
          return null;
        }

        generation += 1;
        const requestGeneration = generation;
        const result = await this.request(sessionId, input);
        return sessionDisposed || requestGeneration !== generation ? null : result;
      },
      cancel: () => {
        generation += 1;
        this.cancelQueuedRequests(sessionId);
      },
      dispose: () => {
        if (sessionDisposed) {
          return;
        }

        sessionDisposed = true;
        generation += 1;
        this.cancelQueuedRequests(sessionId);
      }
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.clearActiveTimeout();
    this.worker?.terminate();
    this.worker = null;
    this.active?.resolve(null);
    this.active = null;

    for (const request of this.queue.splice(0)) {
      request.resolve(null);
    }

    this.cache.clear();
  }

  private request(sessionId: number, input: DiffProcessingInput): Promise<ProcessedDiff | null> {
    if (this.disposed) {
      return Promise.resolve(null);
    }

    const cacheKey = createCacheKey(input);
    const cached = this.readCache(cacheKey);

    if (cached) {
      return Promise.resolve(cached);
    }

    if (this.workerDisabled) {
      return resolvePlainDiff(input);
    }

    return new Promise((resolve) => {
      this.cancelQueuedRequests(sessionId);

      if (this.queue.length >= this.queuedRequestLimit) {
        const removed = this.queue.shift();

        if (removed) {
          removed.resolve(null);
        }
      }

      this.queue.push({
        requestId: this.nextRequestId,
        sessionId,
        input,
        cacheKey,
        resolve
      });
      this.nextRequestId += 1;
      this.startNextRequest();
    });
  }

  private cancelQueuedRequests(sessionId: number): void {
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      const request = this.queue[index];

      if (request?.sessionId === sessionId) {
        this.queue.splice(index, 1);
        request.resolve(null);
      }
    }
  }

  private startNextRequest(): void {
    if (this.active || this.disposed) {
      return;
    }

    const next = this.queue.shift();

    if (!next) {
      return;
    }

    const worker = this.getWorker();

    if (!worker) {
      this.workerDisabled = true;
      this.completeWithPlainText(next);
      this.flushQueueWithPlainText();
      return;
    }

    this.active = next;
    this.activeTimeout = setTimeout(() => {
      this.disableWorkerAndUsePlainText();
    }, this.requestTimeoutMs);

    try {
      worker.postMessage({
        type: "process",
        requestId: next.requestId,
        input: next.input
      });
    } catch {
      this.disableWorkerAndUsePlainText();
    }
  }

  private getWorker(): DiffWorkerLike | null {
    if (this.worker) {
      return this.worker;
    }

    try {
      const worker = this.workerFactory();

      if (!worker) {
        return null;
      }

      worker.onmessage = (event) => {
        this.handleWorkerResponse(event.data);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        this.disableWorkerAndUsePlainText();
      };
      this.worker = worker;
      return worker;
    } catch {
      return null;
    }
  }

  private handleWorkerResponse(response: DiffWorkerResponse): void {
    const request = this.active;

    if (!request || response.requestId !== request.requestId) {
      return;
    }

    this.clearActiveTimeout();
    this.active = null;

    if (response.type === "result") {
      this.writeCache(request.cacheKey, response.result);
      request.resolve(response.result);
    } else {
      this.completeWithPlainText(request);
    }

    this.startNextRequest();
  }

  private disableWorkerAndUsePlainText(): void {
    this.clearActiveTimeout();
    this.workerDisabled = true;
    this.worker?.terminate();
    this.worker = null;
    const active = this.active;
    this.active = null;

    if (active) {
      this.completeWithPlainText(active);
    }

    this.flushQueueWithPlainText();
  }

  private flushQueueWithPlainText(): void {
    for (const request of this.queue.splice(0)) {
      this.completeWithPlainText(request);
    }
  }

  private completeWithPlainText(request: PendingRequest): void {
    void resolvePlainDiff(request.input).then((result) => {
      this.writeCache(request.cacheKey, result);
      request.resolve(result);
    });
  }

  private clearActiveTimeout(): void {
    if (this.activeTimeout) {
      clearTimeout(this.activeTimeout);
      this.activeTimeout = null;
    }
  }

  private readCache(key: string): ProcessedDiff | null {
    const value = this.cache.get(key);

    if (!value) {
      return null;
    }

    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  private writeCache(key: string, value: ProcessedDiff): void {
    this.cache.delete(key);
    this.cache.set(key, value);

    while (this.cache.size > this.cacheEntryLimit) {
      const oldestKey = this.cache.keys().next().value as string | undefined;

      if (oldestKey === undefined) {
        break;
      }

      this.cache.delete(oldestKey);
    }
  }
}

let sharedService: DiffProcessingService | null = null;

export function createDiffProcessingSession(): DiffProcessingSession {
  sharedService ??= new DiffProcessingService();
  return sharedService.createSession();
}

function createBrowserWorker(): DiffWorkerLike | null {
  if (typeof Worker === "undefined") {
    return null;
  }

  return new DiffProcessingWorker({
    name: "githead-diff-processor"
  });
}

function createCacheKey(input: DiffProcessingInput): string {
  return `${input.filePath}\0${input.truncated ? "1" : "0"}\0${input.text}`;
}

function resolvePlainDiff(input: DiffProcessingInput): Promise<ProcessedDiff> {
  return new Promise((resolve) => {
    queueMicrotask(() => {
      resolve(processDiffPlain(input));
    });
  });
}

function toPositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value! : fallback;
}
