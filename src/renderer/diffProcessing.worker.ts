import { processDiff, type ProcessedDiff } from "./diffProcessing";
import { processDiffPlain, type DiffProcessingInput } from "./diffProcessingPlain";

export interface DiffWorkerRequest {
  type: "process";
  requestId: number;
  input: DiffProcessingInput;
}

export interface DiffWorkerSuccessResponse {
  type: "result";
  requestId: number;
  result: ProcessedDiff;
}

export interface DiffWorkerFailureResponse {
  type: "error";
  requestId: number;
  message: string;
}

export type DiffWorkerResponse = DiffWorkerSuccessResponse | DiffWorkerFailureResponse;

interface DiffWorkerScope {
  addEventListener(type: "message", listener: (event: MessageEvent<DiffWorkerRequest>) => void): void;
  postMessage(message: DiffWorkerResponse): void;
}

const workerScope = self as unknown as DiffWorkerScope;

workerScope.addEventListener("message", (event) => {
  const request = event.data;

  if (request.type !== "process") {
    return;
  }

  try {
    workerScope.postMessage({
      type: "result",
      requestId: request.requestId,
      result: processDiff(request.input)
    });
  } catch (error) {
    try {
      workerScope.postMessage({
        type: "result",
        requestId: request.requestId,
        result: processDiffPlain(request.input)
      });
    } catch {
      workerScope.postMessage({
        type: "error",
        requestId: request.requestId,
        message: error instanceof Error ? error.message : "Unable to process the diff."
      });
    }
  }
});
