import { ArrowLeft, ArrowRight, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button, TooltipButton } from "@/components/ui/button";
import type { WorkspaceLocation, WorkspaceView } from "./useWorkspaceNavigation";

const viewLabels: Record<WorkspaceView, string> = {
  status: "File Status",
  stashes: "Stashes",
  history: "Commit History",
  workflows: "Workflows",
  pullRequests: "Pull Requests",
  issues: "Issues",
  activity: "Activity Log"
};

export function WorkspaceBreadcrumbs({ location, repositoryName, canGoBack, canGoForward, onBack, onForward, onNavigate }: {
  location: WorkspaceLocation;
  repositoryName: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onNavigate: (location: WorkspaceLocation) => void;
}): ReactNode {
  const route = location.historyRoute;
  const nestedHistory = location.activeView === "history" && route.kind !== "repository";
  return (
    <nav aria-label="Workspace navigation" className="flex min-w-0 items-center gap-1 border-b bg-card px-3 py-1 text-xs text-muted-foreground">
      <TooltipButton type="button" variant="ghost" size="icon-xs" aria-label="Go back" tooltip="Go back (Alt+Left)" disabled={!canGoBack} onClick={onBack}><ArrowLeft /></TooltipButton>
      <TooltipButton type="button" variant="ghost" size="icon-xs" aria-label="Go forward" tooltip="Go forward (Alt+Right)" disabled={!canGoForward} onClick={onForward}><ArrowRight /></TooltipButton>
      <ol className="ml-2 flex min-w-0 items-center gap-1">
        <li className="min-w-0 shrink">
          <Button type="button" variant="ghost" size="sm" className="h-6 max-w-48 px-1 text-xs" onClick={() => onNavigate({ ...location, activeView: "status" })}>
            <span className="truncate">{repositoryName}</span>
          </Button>
        </li>
        <li aria-hidden="true"><ChevronRight className="size-3" /></li>
        <li className="shrink-0">
          {nestedHistory ? <Button type="button" variant="ghost" size="sm" className="h-6 px-1 text-xs" onClick={() => onNavigate({ ...location, historyRoute: { kind: "repository" } })}>Commit History</Button>
            : <span aria-current="page">{viewLabels[location.activeView]}</span>}
        </li>
        {nestedHistory ? <>
          <li aria-hidden="true"><ChevronRight className="size-3" /></li>
          <li className="min-w-0 truncate" aria-current="page" title={route.kind === "file" ? route.origin.path : route.target.path}>
            {route.kind === "file" ? "File History" : "Blame"}: {route.kind === "file" ? route.origin.path : route.target.path}
          </li>
        </> : null}
      </ol>
    </nav>
  );
}
