import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { GitHubFailure } from "../shared/types";
import { reportGitHubFailure } from "./githubOperationReporter";
import { configureOperationalErrorReporter, type OperationalErrorSink } from "./operationalErrorReporter";

afterEach(() => configureOperationalErrorReporter(null));

function failure(kind: GitHubFailure["kind"]): GitHubFailure {
  return { kind, message: "private message", retryable: false, retryAfterAt: null, outcomeUnknown: false, source: "rest", rateLimit: null };
}

function configureSink(): OperationalErrorSink {
  const sink: OperationalErrorSink = { addBreadcrumb: vi.fn(), captureException: vi.fn(), captureMessage: vi.fn(), countMetric: vi.fn() };
  configureOperationalErrorReporter(sink);
  return sink;
}

describe("reportGitHubFailure", () => {
  it("counts an offline request without raising an issue", () => {
    const sink = configureSink();
    reportGitHubFailure("read", failure("offline"));

    expect(sink.countMetric).toHaveBeenCalledWith("githead.operation.failure", expect.objectContaining({ category: "network" }));
    expect(sink.captureMessage).not.toHaveBeenCalled();
  });

  it("tags an unexpected failure with its HTTP status and error name but not its message", () => {
    const sink = configureSink();
    reportGitHubFailure("mutation", failure("unexpected"), { httpStatus: 409, error: new SyntaxError("private message") });

    expect(sink.captureMessage).toHaveBeenCalledWith("Githead operational failure", expect.objectContaining({
      level: "error",
      tags: expect.objectContaining({ subsystem: "github", category: "unexpected", http_status: "409", error_name: "syntaxerror" })
    }));
    expect(JSON.stringify(vi.mocked(sink.captureMessage).mock.calls)).not.toContain("private message");
  });
});
