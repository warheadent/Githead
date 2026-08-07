import type { GitOperationResult, GitOutputEvent } from "../shared/types";
import {
  appendActivityLogEvent,
  appendActivityOperationResult,
  createActivityLogState,
  getActivityLogRawText,
  type ActivityLogState
} from "./activityLog";

type ActivityLogListener = () => void;
export type ActivityLogAttention = "error" | "none" | "unread";

export class ActivityLogStore {
  private state = createActivityLogState();
  private readonly listeners = new Set<ActivityLogListener>();
  private attention: ActivityLogAttention = "none";
  private readonly attentionListeners = new Set<ActivityLogListener>();
  private viewing = false;

  readonly getSnapshot = (): ActivityLogState => this.state;
  readonly getAttentionSnapshot = (): ActivityLogAttention => this.attention;

  readonly subscribe = (listener: ActivityLogListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly subscribeAttention = (listener: ActivityLogListener): (() => void) => {
    this.attentionListeners.add(listener);
    return () => {
      this.attentionListeners.delete(listener);
    };
  };

  append(event: GitOutputEvent): void {
    const nextState = appendActivityLogEvent(this.state, event);
    if (!this.replace(nextState)) return;
    this.recordAttention(event.stream === "stderr" ? "error" : "unread");
  }

  appendOperationResult(label: string, result: GitOperationResult): void {
    const nextState = appendActivityOperationResult(this.state, label, result);
    if (!this.replace(nextState)) return;
    this.recordAttention(result.exitCode === 0 ? "unread" : "error");
  }

  markOperationOutcome(failed: boolean): void {
    this.recordAttention(failed ? "error" : "unread");
  }

  setViewing(viewing: boolean): void {
    this.viewing = viewing;
    if (viewing) this.setAttention("none");
  }

  clear(): void {
    if (this.state.blocks.length === 0 && this.state.rawTextLength === 0) {
      this.setAttention("none");
      return;
    }
    this.replace(createActivityLogState());
    this.setAttention("none");
  }

  getRawText(): string {
    return getActivityLogRawText(this.state);
  }

  private recordAttention(attention: Exclude<ActivityLogAttention, "none">): void {
    if (this.viewing || this.attention === "error") return;
    this.setAttention(attention);
  }

  private setAttention(attention: ActivityLogAttention): void {
    if (attention === this.attention) return;
    this.attention = attention;
    for (const listener of this.attentionListeners) listener();
  }

  private replace(nextState: ActivityLogState): boolean {
    if (nextState === this.state) return false;
    this.state = nextState;
    for (const listener of this.listeners) listener();
    return true;
  }
}
