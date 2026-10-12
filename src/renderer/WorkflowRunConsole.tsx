import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleSlash,
  Loader2,
  RotateCcw,
  X,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button, TooltipButton } from "@/components/ui/button";
import type { GitHubWorkflowJob, GitHubWorkflowRun } from "../shared/types";
import { useGitHubWorkflowRunDetail } from "./useGitHubQueries";
import {
  DetailCardHeader,
  FactRow,
  FactsSidebar,
  GitHubDetailRefreshButton,
  GitHubDetailStatus,
  OpenOnGitHubButton,
  StateBadge,
  type StateBadgeTone
} from "./GitHubDetailStatus";
import { formatDateTime, formatRelativeDate } from "./relativeTime";
import { WorkflowDuration } from "./WorkflowDuration";

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
  active = true,
  onClose,
  onOpenExternalUrl,
  onRunChanged
}: {
  repoPath: string;
  githubFullName: string;
  run: GitHubWorkflowRun;
  active?: boolean;
  onClose: () => void;
  onOpenExternalUrl: (url: string) => void;
  onRunChanged: () => void;
}): ReactNode {
  const repository = useMemo(() => ({ repoPath, githubFullName }), [repoPath, githubFullName]);
  const detail = useGitHubWorkflowRunDetail(repository, run.id, active);
  const current = detail.data ?? run;
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [mutation, setMutation] = useState<MutationState>(IDLE_MUTATION);
  const mutationGeneration = useRef(0);
  const initializedJobs = useRef(false);

  useEffect(() => {
    mutationGeneration.current += 1;
    initializedJobs.current = false;
    setExpandedJobs(new Set());
    setConfirmCancel(false);
    setMutation(IDLE_MUTATION);
    return () => { mutationGeneration.current += 1; };
  }, [repoPath, githubFullName, run.id]);

  useEffect(() => {
    initializedJobs.current = false;
    setExpandedJobs(new Set());
  }, [current.attempt]);

  useEffect(() => {
    const jobs = detail.data?.jobs;
    if (initializedJobs.current || !jobs?.length) return;
    initializedJobs.current = true;
    const failed = jobs.filter((job) => isFailed(job)).map((job) => job.id);
    setExpandedJobs(new Set(failed.length ? failed : [jobs[0]!.id]));
  }, [detail.data?.jobs, repoPath, githubFullName, run.id, current.attempt]);

  const runMutation = async (kind: MutationKind): Promise<void> => {
    const generation = mutationGeneration.current + 1;
    mutationGeneration.current = generation;
    setMutation({ kind, message: kind === "rerun" ? "Requesting re-run" : "Requesting cancellation", error: "" });
    try {
      const result = kind === "rerun"
        ? await window.githead.rerunGitHubWorkflowRun({ repoPath, runId: run.id, operationId: createOperationId(kind) })
        : await window.githead.cancelGitHubWorkflowRun({ repoPath, runId: run.id, operationId: createOperationId(kind) });
      if (generation !== mutationGeneration.current) return;
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
      if (generation !== mutationGeneration.current) return;
      setMutation({
        kind: null,
        message: "",
        error: `${error instanceof Error ? error.message : String(error)} GitHub may have accepted the request. Check the run before trying again.`
      });
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== "Escape" || !event.currentTarget.contains(document.activeElement)) return;
    event.preventDefault();
    onClose();
  };

  const canCancel = ["queued", "in_progress", "waiting", "pending", "requested"].includes(current.status);
  const canRerun = current.status === "completed";
  const statusText = formatRunStatus(current.status, current.conclusion);
  const runLabel = current.runNumber === null ? "Run" : `Run #${current.runNumber}`;

  return (
    <aside className="review-console workflow-run-console" aria-label={`${current.name} ${runLabel}`} onKeyDown={handleKeyDown}>
      <DetailCardHeader
        title={current.name}
        {...(current.runNumber === null ? {} : { number: `#${current.runNumber}` })}
        meta={(
          <>
            <StateBadge tone={getRunStateTone(current.status, current.conclusion)}>{statusText}</StateBadge>
            <span>{current.actor.login}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={current.updatedAt} title={formatDateTime(current.updatedAt, "Unknown")}>{formatRelativeDate(current.updatedAt)}</time>
            <span aria-hidden="true">·</span>
            <code className="github-detail-ref" title={current.branch}>{current.branch}</code>
            <span aria-hidden="true">·</span>
            <span>{formatEvent(current.event)}</span>
            <span aria-hidden="true">·</span>
            <code className="github-detail-ref" title={current.commitSha}>{shortSha(current.commitSha)}</code>
          </>
        )}
        actions={(
          <>
            <OpenOnGitHubButton onOpen={() => onOpenExternalUrl(current.url)} />
            <GitHubDetailRefreshButton detail={detail} label="Refresh run details" />
            <TooltipButton type="button" variant="ghost" size="icon-sm" aria-label="Close workflow run details" tooltip="Close" onClick={onClose}><X /></TooltipButton>
          </>
        )}
      />

      <div className="review-console-tabs">
        <GitHubDetailStatus detail={detail} label="run details" />
        {detail.data ? (
          <div className="github-detail-body workflow-run-overview">
            <main className="workflow-job-list" aria-label="Workflow jobs">
              <div className="github-section-heading">
                <h3>Jobs</h3>
                <span aria-hidden="true">·</span>
                <span>{detail.data.jobCount}</span>
              </div>
              {detail.data.jobs.length ? (
                <div className="workflow-jobs">
                  {detail.data.jobs.map((job) => {
                    const expanded = expandedJobs.has(job.id);
                    return (
                      <article className="workflow-job" key={job.id} data-expanded={expanded ? "true" : "false"}>
                        <div className="workflow-job-header">
                          <button
                            type="button"
                            className="workflow-job-toggle"
                            aria-expanded={expanded}
                            onClick={() => setExpandedJobs((currentJobs) => toggleSetValue(currentJobs, job.id))}
                          >
                            {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                            <RunStatusIcon status={job.status} conclusion={job.conclusion} />
                            <strong className="workflow-job-name">{job.name}</strong>
                            <span className="sr-only">, {formatRunStatus(job.status, job.conclusion)}</span>
                          </button>
                          <span className="workflow-duration"><WorkflowDuration startedAt={job.startedAt} completedAt={job.completedAt} running={job.status === "in_progress"} active={active} /></span>
                          {job.url ? <Button type="button" variant="link" size="xs" className="workflow-job-logs" onClick={() => onOpenExternalUrl(job.url)}>Logs</Button> : null}
                        </div>
                        {expanded ? (
                          <ol className="workflow-step-list" aria-label={`${job.name} steps`}>
                            {job.steps.length ? job.steps.map((step) => (
                              <li key={`${job.id}-${step.number}`} data-status={statusClass(step.status, step.conclusion)}>
                                <RunStatusIcon status={step.status} conclusion={step.conclusion} />
                                <span className="workflow-step-name">{step.name}<span className="sr-only">, {formatRunStatus(step.status, step.conclusion)}</span></span>
                                <time className="workflow-duration"><WorkflowDuration startedAt={step.startedAt} completedAt={step.completedAt} running={step.status === "in_progress"} active={active} /></time>
                              </li>
                            )) : <li className="workflow-step-empty">GitHub returned no steps for this job.</li>}
                          </ol>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : <p className="review-console-empty">GitHub returned no jobs for this run.</p>}
            </main>
            <FactsSidebar label="Run details" heading="Run details">
              <FactRow label="Status"><span className={`workflow-inspector-status ${statusClass(current.status, current.conclusion)}`}>{statusText}</span></FactRow>
              <FactRow label="Workflow"><span>{current.name}</span></FactRow>
              <FactRow label="Run"><span>{current.runNumber === null ? "-" : `#${current.runNumber}`}{current.attempt > 1 ? ` · attempt ${current.attempt}` : ""}</span></FactRow>
              <FactRow label="Branch"><code>{current.branch}</code></FactRow>
              <FactRow label="Trigger"><span>{formatEvent(current.event)}</span></FactRow>
              <FactRow label="Actor"><span>{current.actor.login}</span></FactRow>
              <FactRow label="Started"><span>{formatDateTime(current.startedAt || current.createdAt, "Unknown")}</span></FactRow>
              <FactRow label="Duration"><span><WorkflowDuration startedAt={current.startedAt || current.createdAt} completedAt={current.status === "completed" ? current.updatedAt : ""} running={current.status === "in_progress"} active={active} /></span></FactRow>
              <FactRow label="Commit"><code title={current.commitSha}>{shortSha(current.commitSha)}</code></FactRow>
              <div className="workflow-run-commit-message"><h4>Run title</h4><p>{current.displayTitle || current.commitMessage || "No title provided."}</p></div>
              {current.commitMessage && current.commitMessage !== current.displayTitle ? <div className="workflow-run-commit-message"><h4>Commit</h4><p>{current.commitMessage}</p></div> : null}
            </FactsSidebar>
          </div>
        ) : null}
      </div>

      <div className="review-console-mutation" aria-live="polite" aria-atomic="true">
        {mutation.error ? <p role="alert">{mutation.error}</p> : null}
        <span className="sr-only">{mutation.message}</span>
      </div>

      <footer className="github-detail-footer">
        {confirmCancel ? (
          <div className="github-detail-confirmation" role="group" aria-label="Confirm workflow cancellation">
            <span>Cancel {runLabel.toLowerCase()} and its active jobs?</span>
            <Button type="button" variant="ghost" size="sm" disabled={Boolean(mutation.kind)} onClick={() => setConfirmCancel(false)}>Keep running</Button>
            <Button type="button" variant="destructive" size="sm" disabled={Boolean(mutation.kind)} onClick={() => {
              setConfirmCancel(false);
              void runMutation("cancel");
            }}>{mutation.kind === "cancel" ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Ban />}Cancel run</Button>
          </div>
        ) : (
          <>
            {mutation.message ? <span className="workflow-run-mutation-message"><CheckCircle2 />{mutation.message}</span> : null}
            {!canRerun && !canCancel ? <span className="workflow-run-actions-unavailable">Run actions are unavailable for {statusText.toLowerCase()} runs.</span> : null}
            <span className="github-detail-footer-spacer" />
            {canCancel ? <Button type="button" variant="outline" size="sm" disabled={Boolean(mutation.kind)} onClick={() => setConfirmCancel(true)}>
              {mutation.kind === "cancel" ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}Cancel run
            </Button> : null}
            {canRerun ? <Button type="button" size="sm" disabled={Boolean(mutation.kind)} onClick={() => void runMutation("rerun")}>
              {mutation.kind === "rerun" ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <RotateCcw />}Re-run all jobs
            </Button> : null}
          </>
        )}
      </footer>
    </aside>
  );
}

/** The status icon of a workflow run, job or step. Shared by the run list and the run details. */
export function RunStatusIcon({ status, conclusion }: { status: string; conclusion: string | null }): ReactNode {
  if (status !== "completed") return <Loader2 className="workflow-status-icon is-running animate-spin motion-reduce:animate-none" aria-hidden="true" />;
  if (["success", "neutral", "skipped"].includes(conclusion ?? "")) return <CheckCircle2 className="workflow-status-icon is-success" aria-hidden="true" />;
  if (conclusion === "cancelled") return <CircleSlash className="workflow-status-icon is-cancelled" aria-hidden="true" />;
  return <XCircle className="workflow-status-icon is-failure" aria-hidden="true" />;
}

function getRunStateTone(status: string, conclusion: string | null): StateBadgeTone {
  const value = statusClass(status, conclusion);
  return value === "is-success" ? "success" : value === "is-running" ? "warning" : "danger";
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
