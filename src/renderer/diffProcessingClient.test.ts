import { describe, expect, it } from "vite-plus/test";
import {
  DiffProcessingService,
  type DiffWorkerLike
} from "./diffProcessingClient";
import { processDiffPlain, type DiffProcessingInput } from "./diffProcessingPlain";
import type { DiffWorkerRequest, DiffWorkerResponse } from "./diffProcessing.worker";

class FakeDiffWorker implements DiffWorkerLike {
  onmessage: ((event: MessageEvent<DiffWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly requests: DiffWorkerRequest[] = [];
  terminated = false;

  postMessage(message: DiffWorkerRequest): void {
    this.requests.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  respondWithResult(requestIndex: number): void {
    const request = this.requests[requestIndex];

    if (!request) {
      throw new Error(`Missing worker request ${requestIndex}.`);
    }

    this.onmessage?.({
      data: {
        type: "result",
        requestId: request.requestId,
        result: processDiffPlain(request.input)
      }
    } as MessageEvent<DiffWorkerResponse>);
  }

  respondWithError(requestIndex: number): void {
    const request = this.requests[requestIndex];

    if (!request) {
      throw new Error(`Missing worker request ${requestIndex}.`);
    }

    this.onmessage?.({
      data: {
        type: "error",
        requestId: request.requestId,
        message: "Worker processing failed."
      }
    } as MessageEvent<DiffWorkerResponse>);
  }
}

describe("DiffProcessingService", () => {
  it("uses one worker and returns aligned results", async () => {
    const worker = new FakeDiffWorker();
    const service = new DiffProcessingService({ workerFactory: () => worker });
    const session = service.createSession();
    const input = createInput("first");
    const pending = session.process(input);

    expect(worker.requests).toHaveLength(1);
    worker.respondWithResult(0);

    await expect(pending).resolves.toEqual(processDiffPlain(input));
    expect(worker.terminated).toBe(false);
    service.dispose();
  });

  it("removes queued stale work and ignores an active stale reply", async () => {
    const worker = new FakeDiffWorker();
    const service = new DiffProcessingService({ workerFactory: () => worker });
    const session = service.createSession();
    const first = session.process(createInput("first"));
    const second = session.process(createInput("second"));
    const thirdInput = createInput("third");
    const third = session.process(thirdInput);

    await expect(second).resolves.toBeNull();
    expect(worker.requests.map((request) => request.input.text)).toEqual([createInput("first").text]);

    worker.respondWithResult(0);
    await expect(first).resolves.toBeNull();
    expect(worker.requests.map((request) => request.input.text)).toEqual([
      createInput("first").text,
      thirdInput.text
    ]);

    worker.respondWithResult(1);
    await expect(third).resolves.toEqual(processDiffPlain(thirdInput));
    service.dispose();
  });

  it("returns cached results without another worker request", async () => {
    const worker = new FakeDiffWorker();
    const service = new DiffProcessingService({ workerFactory: () => worker });
    const session = service.createSession();
    const input = createInput("cached");
    const first = session.process(input);

    worker.respondWithResult(0);
    const firstResult = await first;
    const secondResult = await session.process(input);

    expect(secondResult).toBe(firstResult);
    expect(worker.requests).toHaveLength(1);
    service.dispose();
  });

  it("evicts the oldest cached result at the configured limit", async () => {
    const worker = new FakeDiffWorker();
    const service = new DiffProcessingService({
      workerFactory: () => worker,
      cacheEntryLimit: 1
    });
    const session = service.createSession();
    const firstInput = createInput("first-cache-entry");
    const secondInput = createInput("second-cache-entry");
    const first = session.process(firstInput);

    worker.respondWithResult(0);
    await first;

    const second = session.process(secondInput);
    worker.respondWithResult(1);
    await second;

    const repeatedFirst = session.process(firstInput);
    expect(worker.requests).toHaveLength(3);
    worker.respondWithResult(2);
    await repeatedFirst;
    service.dispose();
  });

  it("limits queued work and cancels an evicted request", async () => {
    const worker = new FakeDiffWorker();
    const service = new DiffProcessingService({
      workerFactory: () => worker,
      queuedRequestLimit: 1
    });
    const activeInput = createInput("active");
    const evictedInput = createInput("evicted");
    const finalInput = createInput("final");
    const active = service.createSession().process(activeInput);
    const evicted = service.createSession().process(evictedInput);
    const final = service.createSession().process(finalInput);

    await expect(evicted).resolves.toBeNull();
    expect(worker.requests).toHaveLength(1);

    worker.respondWithResult(0);
    await active;
    expect(worker.requests).toHaveLength(2);
    expect(worker.requests[1]?.input).toEqual(finalInput);

    worker.respondWithResult(1);
    await final;
    service.dispose();
  });

  it("uses plain text after a worker processing error", async () => {
    const worker = new FakeDiffWorker();
    const service = new DiffProcessingService({ workerFactory: () => worker });
    const input = createInput("failure");
    const pending = service.createSession().process(input);

    worker.respondWithError(0);

    await expect(pending).resolves.toEqual(processDiffPlain(input));
    service.dispose();
  });

  it("works without a browser Worker implementation", async () => {
    const service = new DiffProcessingService({ workerFactory: () => null });
    const input = createInput("fallback");

    await expect(service.createSession().process(input)).resolves.toEqual(processDiffPlain(input));
    service.dispose();
  });

  it("cancels queued work when a session is disposed", async () => {
    const worker = new FakeDiffWorker();
    const service = new DiffProcessingService({ workerFactory: () => worker });
    const activeSession = service.createSession();
    const queuedSession = service.createSession();
    const active = activeSession.process(createInput("active"));
    const queued = queuedSession.process(createInput("queued"));

    queuedSession.dispose();
    await expect(queued).resolves.toBeNull();
    worker.respondWithResult(0);
    await active;
    expect(worker.requests).toHaveLength(1);
    service.dispose();
  });
});

function createInput(value: string): DiffProcessingInput {
  return {
    filePath: "src/example.ts",
    text: `@@ -0,0 +1 @@\n+const ${value} = true;`,
    truncated: false
  };
}
