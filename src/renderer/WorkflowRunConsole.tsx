import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  Loader2,
  RotateCcw,
  X,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, TooltipButton } from "@/components/ui/button";
import type { GitHubWorkflowJob, GitHubWorkflowRun } from "../shared/types";
import { useGitHubWorkflowRunDetail } from "./useGitHubQueries";

type MutationKind = "rerun" | "cancel";

interface MutationState {
  kind: MutationKind | null;
  message: string;
  error: string;
}

const IDLE_MUTATION: MutationState = { kind: null, message: "", error: "" };

export function WorkflowRunConsole({
  repoPath,
  githubFullName,
  run,
  onClose,
  onOpenExternalUrl,
  onRunChanged
}: {
  repoPath: string;
  githubFullName: string;
  run: GitHubWorkflowRun;
  onClose: () => void;
  onOpenExternalUrl: (url: string) => void;
  onRunChanged: () => void;
}): ReactNode {
  const repository = useMemo(() => ({ repoPath, githubFullName }), [repoPath, githubFullName]);
  const detail = useGitHubWorkflowRunDetail(repository, run.id);
  const current = detail.data ?? run;
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [mutation, setMutation] = useState<MutationState>(IDLE_MUTATION);

  useEffect(() => {
    setExpandedJobs(new Set());
    setConfirmCancel(false);
    setMutation(IDLE_MUTATION);
  }, [run.id]);

  useEffect(() => {
    const jobs = detail.data?.jobs;
    if (!jobs?.length) return;
    setExpandedJobs((existing) => {
      if (existing.size) return existing;
      const failed = jobs.filter((job) => isFailed(job)).map((job) => job.id);
      return new Set(failed.length ? failed : [jobs[0]!.id]);
    });
  }, [detail.data?.jobs]);

  const runMutation = async (kind: MutationKind): Promise<void> => {
    setMutation({ kind, message: kind === "rerun" ? "Requesting re-run" : "Requesting cancellation", error: "" });
    try {
      const result = kind === "rerun"
        ? await window.githead.rerunGitHubWorkflowRun({ repoPath, runId: run.id, operationId: createOperationId(kind) })
        : await window.githead.cancelGitHubWorkflowRun({ repoPath, runId: run.id, operationId: createOperationId(kind) });
      if (!result.ok) {
        setMutation({
          kind: null,
          message: "",
          error: result.error.outcomeUnknown
            ? `${result.error.message} GitHub may have accepted the request. Check the run before trying again.`
            : result.error.message
        });
        return;
      }
      setMutation({ kind: null, message: result.data.message, error: "" });
      onRunChanged();
      await detail.refresh().catch(() => undefined);
    } catch (error) {
      setMutation({
        kind: null,
        message: "",
        error: `${error instanceof Error ? error.message : String(error)} GitHub may have accepted the request. Check the run before trying again.`
      });
    }
  };

  const canCancel = ["queued", "in_progress", "waiting", "pending", "requested"].includes(current.status);
  const canRerun = current.status === "completed";
  const statusText = formatRunStatus(current.status, current.conclusion);
  const runLabel = current.runNumber === null ? "Run" : `Run #${current.runNumber}`;

  return (
    <aside className="review-console workflow-run-console" aria-label={`${current.name} ${runLabel}`}>
      <header className="review-console-header">
        <div className="review-console-heading">
          <div className="review-console-title-line">
            <span className="review-console-number">{current.runNumber === null ? "Run" : `#${current.runNumber}`}</span>
            <h2 title={current.name}>{current.name}</h2>
          </div>
          <div className="review-console-meta">
            <span className={`workflow-run-state ${statusClass(current.status, current.conclusion)}`}>
              <RunStatusIcon status={current.status} conclusion={current.conclusion} />
              {statusText}
            </span>
            <span>{current.actor.login}</span>
            <span aria-hidden="true">·</span>
            <span>{formatDateTime(current.updatedAt)}</span>
          </div>
          <div className="review-console-branches">
            <span title={current.branch}><GitBranch />{current.branch}</span>
            <span title={current.commitSha}><GitCommitHorizontal />{shortSha(current.commitSha)}</span>
            <span><CircleDot />{formatEvent(current.event)}</span>
          </div>
        </div>
        <div className="review-console-header-actions">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenExternalUrl(current.url)}>Open on GitHub <ExternalLink /></Button>
          <TooltipButton type="button" variant="ghost" size="icon" aria-label="Close workflow run details" tooltip="Close" onClick={onClose}><X /></TooltipButton>
        </div>
      </header>

      <div className="review-console-tabs workflow-run-console-tabs">
        <div className="review-console-tab-list review-console-single-tab" role="tablist" aria-label="Workflow run details">
          <button type="button" role="tab" aria-selected="true">Jobs <span className="review-console-tab-count">{detail.data?.jobCount ?? "-"}</span></button>
        </div>
        <WorkflowRunDetailStatus detail={detail} />
        {detail.data ? (
          <div className="workflow-run-overview">
            <main className="workflow-job-list" aria-label="Workflow jobs">
              {detail.data.jobs.length ? detail.data.jobs.map((job) => {
                const expanded = expandedJobs.has(job.id);
                return (
                  <article className="workflow-job" key={job.id}>
                    <div className="workflow-job-header">
                      <button
                        type="button"
                        className="workflow-job-toggle"
                        aria-expanded={expanded}
                        onClick={() => setExpandedJobs((currentJobs) => toggleSetValue(currentJobs, job.id))}
                      >
                        {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                        <RunStatusIcon status={job.status} conclusion={job.conclusion} />
                        <span className="workflow-job-heading">
                          <strong>{job.name}</strong>
                          <small>{formatRunStatus(job.status, job.conclusion)} · {formatDuration(job.startedAt, job.completedAt)}</small>
                        </span>
                      </button>
                      {job.url ? <Button type="button" variant="ghost" size="sm" onClick={() => onOpenExternalUrl(job.url)}>Logs <ExternalLink /></Button> : null}
                    </div>
                    {expanded ? (
                      <ol className="workflow-step-list" aria-label={`${job.name} steps`}>
                        {job.steps.length ? job.steps.map((step) => (
                          <li key={`${job.id}-${step.number}`}>
                            <RunStatusIcon status={step.status} conclusion={step.conclusion} />
                            <span><strong>{step.name}</strong><small>{formatRunStatus(step.status, step.conclusion)}</small></span>
                            <time>{formatDuration(step.startedAt, step.completedAt)}</time>
                          </li>
                        )) : <li className="workflow-step-empty">GitHub returned no steps for this job.</li>}
                      </ol>
                    ) : null}
                  </article>
                );
              }) : <p className="review-console-empty">GitHub returned no jobs for this run.</p>}
            </main>
            <aside className="review-console-inspector" aria-label="Run details">
              <h3>Run details</h3>
              <InspectorRow label="Status"><span className={`workflow-inspector-status ${statusClass(current.status, current.conclusion)}`}><RunStatusIcon status={current.status} conclusion={current.conclusion} />{statusText}</span></InspectorRow>
              <InspectorRow label="Workflow"><span>{current.name}</span></InspectorRow>
              <InspectorRow label="Run"><span>{current.runNumber === null ? "-" : `#${current.runNumber}`}{current.attempt > 1 ? ` · attempt ${current.attempt}` : ""}</span></InspectorRow>
              <InspectorRow label="Branch"><code>{current.branch}</code></InspectorRow>
              <InspectorRow label="Trigger"><span>{formatEvent(current.event)}</span></InspectorRow>
              <InspectorRow label="Actor"><span>{current.actor.login}</span></InspectorRow>
              <InspectorRow label="Started"><span>{formatDateTime(current.startedAt || current.createdAt)}</span></InspectorRow>
              <InspectorRow label="Duration"><span>{formatDuration(current.startedAt || current.createdAt, current.updatedAt)}</span></InspectorRow>
              <InspectorRow label="Commit"><code title={current.commitSha}>{shortSha(current.commitSha)}</code></InspectorRow>
              <div className="workflow-run-commit-message"><h4>Run title</h4><p>{current.displayTitle || current.commitMessage || "No title provided."}</p></div>
              {current.commitMessage && current.commitMessage !== current.displayTitle ? <div className="workflow-run-commit-message"><h4>Commit</h4><p>{current.commitMessage}</p></div> : null}
            </aside>
          </div>
        ) : null}
      </div>

      <div className="review-console-mutation" aria-live="polite" aria-atomic="true">
        {mutation.error ? <p role="alert">{mutation.error}</p> : null}
        <span className="sr-only">{mutation.message}</span>
      </div>

      <footer className="review-console-footer">
        {confirmCancel ? (
          <div className="review-console-merge-confirmation" role="group" aria-label="Confirm workflow cancellation">
            <span>Cancel {runLabel.toLowerCase()} and its active jobs?</span>
            <Button type="button" variant="ghost" size="sm" disabled={Boolean(mutation.kind)} onClick={() => setConfirmCancel(false)}>Keep running</Button>
            <Button type="button" variant="destructive" size="sm" disabled={Boolean(mutation.kind)} onClick={() => {
              setConfirmCancel(false);
              void runMutation("cancel");
            }}>{mutation.kind === "cancel" ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Ban />}Cancel run</Button>
          </div>
        ) : (
          <>
            {canRerun ? <Button type="button" size="sm" disabled={Boolean(mutation.kind)} onClick={() => void runMutation("rerun")}>
              {mutation.kind === "rerun" ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <RotateCcw />}Re-run all jobs
            </Button> : null}
            {canCancel ? <Button type="button" variant="destructive" size="sm" disabled={Boolean(mutation.kind)} onClick={() => setConfirmCancel(true)}><Ban />Cancel run</Button> : null}
            {!canRerun && !canCancel ? <span className="workflow-run-actions-unavailable">Run actions are unavailable for {statusText.toLowerCase()} runs.</span> : null}
            {mutation.message ? <span className="workflow-run-mutation-message"><CheckCircle2 />{mutation.message}</span> : null}
          </>
        )}
      </footer>
    </aside>
  );
}

function WorkflowRunDetailStatus({ detail }: { detail: ReturnType<typeof useGitHubWorkflowRunDetail> }): ReactNode {
  if ((detail.status === "loading" || detail.status === "idle") && !detail.data) {
    return <div className="review-console-loading" role="status" aria-live="polite"><Loader2 className="animate-spin motion-reduce:animate-none" />Loading run details</div>;
  }
  if (detail.error && !detail.data) {
    return <div className="review-console-load-error" role="alert"><p>{detail.error}</p><Button type="button" variant="outline" size="sm" onClick={() => void detail.refresh()}>Retry</Button></div>;
  }
  if (detail.status === "refreshing") return <span className="sr-only" role="status" aria-live="polite">Refreshing run details</span>;
  if (detail.error && detail.data) return <div className="review-console-stale-error" role="status">Showing cached run details. Refresh failed: {detail.error}</div>;
  return null;
}

function InspectorRow({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return <div className="review-console-inspector-row"><span>{label}</span><div>{children}</div></div>;
}

function RunStatusIcon({ status, conclusion }: { status: string; conclusion: string | null }): ReactNode {
  if (status !== "completed") return <Loader2 className="workflow-status-icon is-running animate-spin motion-reduce:animate-none" aria-hidden="true" />;
  if (["success", "neutral", "skipped"].includes(conclusion ?? "")) return <CheckCircle2 className="workflow-status-icon is-success" aria-hidden="true" />;
  return <XCircle className="workflow-status-icon is-failure" aria-hidden="true" />;
}

function statusClass(status: string, conclusion: string | null): string {
  if (status !== "completed") return "is-running";
  return ["success", "neutral", "skipped"].includes(conclusion ?? "") ? "is-success" : "is-failure";
}

function isFailed(job: GitHubWorkflowJob): boolean {
  return job.status === "completed" && !["success", "neutral", "skipped"].includes(job.conclusion ?? "");
}

function formatRunStatus(status: string, conclusion: string | null): string {
  return humanize(conclusion || status || "unknown");
}

function formatEvent(event: string): string {
  return humanize(event || "unknown");
}

function humanize(value: string): string {
  return value.split("_").filter(Boolean).map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ") || "Unknown";
}

function formatDateTime(value: string): string {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function formatDuration(start: string, end: string): string {
  const started = Date.parse(start);
  const ended = Date.parse(end);
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) return "-";
  const totalSeconds = Math.max(0, Math.round((ended - started) / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function shortSha(value: string): string {
  return value ? value.slice(0, 7) : "-";
}

function toggleSetValue(values: Set<string>, value: string): Set<string> {
  const next = new Set(values);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function createOperationId(kind: MutationKind): string {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `github-workflow-${kind}-${suffix}`;
}
