import type { GitOperationResult, GitOutputEvent, GitRunResult } from "../shared/types";
import {
  appendActivityLogEvent, appendActivityOperationResult, createActivityLogState, getActivityLogRawText,
  type ActivityLogState
} from "./activityLog";
import { getRepoPathKey } from "./repositorySnapshotCache";

type ActivityLogListener = () => void;
export type ActivityLogAttention = "error" | "none" | "unread";

export class ActivityLogStore {
  private state = createActivityLogState();
  private snapshot = this.state;
  private repository: string | null = null;
  private readonly listeners = new Set<ActivityLogListener>();
  private readonly attentionListeners = new Set<ActivityLogListener>();
  private readonly unreadRuns = new Map<string, ActivityLogAttention>();
  private attention: ActivityLogAttention = "none";
  private viewing = false;

  readonly getSnapshot = (): ActivityLogState => this.snapshot;
  readonly getAttentionSnapshot = (): ActivityLogAttention => this.attention;
  readonly subscribe = (listener: ActivityLogListener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  readonly subscribeAttention = (listener: ActivityLogListener): (() => void) => {
    this.attentionListeners.add(listener);
    return () => { this.attentionListeners.delete(listener); };
  };

  setRepository(repoPath: string, viewing = this.viewing): void {
    const key = getRepoPathKey(repoPath);
    this.viewing = viewing;
    if (this.repository === key) {
      this.publishAttention();
      return;
    }
    this.repository = key;
    this.publish();
  }

  append(event: GitOutputEvent): void {
    const next = appendActivityLogEvent(this.state, { ...event, repoPath: event.repoPath ?? this.repository ?? "" });
    if (next === this.state) return;
    this.state = next;
    const run = next.runs.find((item) => item.id === event.runId);
    if (!(this.viewing && this.matchesRepository(run?.repoPath ?? ""))) {
      this.unreadRuns.set(event.runId, event.exitCode !== undefined && event.exitCode !== 0 ? "error" : this.unreadRuns.get(event.runId) ?? "unread");
    }
    this.publish();
  }

  appendOperationResult(label: string, result: GitOperationResult): void {
    this.state = appendActivityOperationResult(this.state, label, result);
    const run = this.state.runs.at(-1);
    if (run && !(this.viewing && this.matchesRepository(run.repoPath))) {
      this.unreadRuns.set(run.id, result.exitCode === 0 ? "unread" : "error");
    }
    this.publish();
  }

  /** Results also cover rejected commands which never emitted streamed output. */
  completeRun(result: GitRunResult): void {
    const existing = this.state.runs.find((run) => run.id === result.runId);
    if (existing?.exitCode === result.exitCode && existing.endedAt === result.endedAt) return;
    if (!existing && !result.outputStreamed) {
      this.state = appendActivityOperationResult(this.state, result.action, result, result.runId, result.startedAt);
    }
    this.append({
      runId: result.runId, action: result.action, repoPath: result.repoPath, stream: "system", text: "",
      timestamp: result.endedAt, startedAt: result.startedAt, exitCode: result.exitCode
    });
  }

  setViewing(viewing: boolean): void {
    this.viewing = viewing;
    this.publishAttention();
  }

  clear(): void {
    const removed = new Set(this.state.runs.filter((run) => this.matchesRepository(run.repoPath)).map((run) => run.id));
    if (!removed.size && !this.snapshot.trimmed) return;
    const runs = this.state.runs.filter((run) => !removed.has(run.id));
    const blocks = this.state.blocks.filter((block) => block.kind === "notice" ? runs.length > 0 : !removed.has(block.runId));
    // Keep parser state for active streams, so Clear does not break a partial ANSI sequence.
    this.state = { ...this.state, runs, blocks, rawTextLength: blocks.reduce((length, block) => length + block.rawText.length, 0), trimmed: blocks.some((block) => block.kind === "notice"), version: this.state.version + 1 };
    for (const id of removed) this.unreadRuns.delete(id);
    this.publish();
  }

  getRawText(runId?: string): string {
    return getActivityLogRawText(this.snapshot, runId);
  }

  private matchesRepository(repoPath: string): boolean {
    return this.repository === null || getRepoPathKey(repoPath) === this.repository;
  }

  private publish(): void {
    const runs = this.state.runs.filter((run) => this.matchesRepository(run.repoPath));
    const ids = new Set(runs.map((run) => run.id));
    const blocks = this.state.blocks.filter((block) => (block.kind === "notice" && runs.length > 0) || ids.has(block.runId));
    const changed = runs.length !== this.snapshot.runs.length || blocks.length !== this.snapshot.blocks.length
      || runs.some((run, index) => run !== this.snapshot.runs[index])
      || blocks.some((block, index) => block !== this.snapshot.blocks[index]);
    if (changed) this.snapshot = { ...this.state, runs, blocks, rawTextLength: blocks.reduce((length, block) => length + block.rawText.length, 0) };
    const retained = new Set(this.state.runs.map((run) => run.id));
    for (const id of this.unreadRuns.keys()) if (!retained.has(id)) this.unreadRuns.delete(id);
    if (changed) for (const listener of this.listeners) listener();
    this.publishAttention();
  }

  private publishAttention(): void {
    let attention: ActivityLogAttention = "none";
    for (const run of this.snapshot.runs) {
      if (this.viewing) this.unreadRuns.delete(run.id);
      const unread = this.unreadRuns.get(run.id);
      if (unread === "error" || (unread === "unread" && attention === "none")) attention = unread;
    }
    if (attention === this.attention) return;
    this.attention = attention;
    for (const listener of this.attentionListeners) listener();
  }
}
