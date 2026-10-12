import {
  Archive,
  ChartColumnBig,
  CircleDot,
  Clipboard,
  GitPullRequest,
  History,
  ListTree,
  Workflow,
  type LucideIcon
} from "lucide-react";
import type { WorkspaceView } from "./useWorkspaceNavigation";

/** Views that open in the single guest slot next to the permanent Changes and History views. */
export type GuestView = Exclude<WorkspaceView, "status" | "history">;

/** Guest views in Go-to order. */
export const GUEST_VIEWS: readonly GuestView[] = ["stashes", "pullRequests", "issues", "workflows", "analytics", "activity"];

export const WORKSPACE_VIEW_LABELS: Readonly<Record<WorkspaceView, string>> = {
  status: "Changes",
  history: "History",
  stashes: "Stashes",
  pullRequests: "Pull requests",
  issues: "Issues",
  workflows: "Workflow runs",
  analytics: "Analytics",
  activity: "Activity log"
};

export const WORKSPACE_VIEW_ICONS: Readonly<Record<WorkspaceView, LucideIcon>> = {
  status: ListTree,
  history: History,
  stashes: Archive,
  pullRequests: GitPullRequest,
  issues: CircleDot,
  workflows: Workflow,
  analytics: ChartColumnBig,
  activity: Clipboard
};

export function isGuestView(view: WorkspaceView): view is GuestView {
  return view !== "status" && view !== "history";
}

export function isGitHubView(view: WorkspaceView): boolean {
  return view === "workflows" || view === "pullRequests" || view === "issues";
}
