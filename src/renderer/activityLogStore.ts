import type { GitOperationResult, GitOutputEvent } from "../shared/types";
import {
  appendActivityLogEvent,
  appendActivityOperationResult,
  createActivityLogState,
  getActivityLogRawText,
  type ActivityLogState
} from "./activityLog";

type ActivityLogListener = () => void;

export class ActivityLogStore {
  private state = createActivityLogState();
  private readonly listeners = new Set<ActivityLogListener>();

  readonly getSnapshot = (): ActivityLogState => this.state;

  readonly subscribe = (listener: ActivityLogListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  append(event: GitOutputEvent): void {
    this.replace(appendActivityLogEvent(this.state, event));
  }

  appendOperationResult(label: string, result: GitOperationResult): void {
    this.replace(appendActivityOperationResult(this.state, label, result));
  }

  clear(): void {
    if (this.state.blocks.length === 0 && this.state.rawTextLength === 0) return;
    this.replace(createActivityLogState());
  }

  getRawText(): string {
    return getActivityLogRawText(this.state);
  }

  private replace(nextState: ActivityLogState): void {
    if (nextState === this.state) return;
    this.state = nextState;
    for (const listener of this.listeners) listener();
  }
}
