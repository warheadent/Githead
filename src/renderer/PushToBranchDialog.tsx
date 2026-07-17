import type { FormEvent, ReactNode } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GitRemoteBranch } from "../shared/types";

export interface PushToBranchDialogState {
  open: boolean;
  sourceBranch: string;
  remoteName: string;
  destinationMode: "existing" | "new";
  destinationBranch: string;
  newBranchName: string;
  error: string;
}

export const emptyPushToBranchDialog: PushToBranchDialogState = {
  open: false,
  sourceBranch: "",
  remoteName: "",
  destinationMode: "existing",
  destinationBranch: "",
  newBranchName: "",
  error: ""
};

const PUSH_NEW_BRANCH_VALUE = ":githead:new";

export function PushToBranchDialog({
  state,
  remotes,
  remoteBranches,
  currentUpstream,
  saving,
  onOpenChange,
  onStateChange,
  onPush
}: {
  state: PushToBranchDialogState;
  remotes: string[];
  remoteBranches: GitRemoteBranch[];
  currentUpstream: string | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onStateChange: (state: PushToBranchDialogState) => void;
  onPush: (event: FormEvent<HTMLFormElement>) => void;
}): ReactNode {
  const destinations = remoteBranches.filter((remoteBranch) =>
    remoteBranch.remote === state.remoteName && remoteBranch.name !== currentUpstream
  );
  const destinationValue = state.destinationMode === "new"
    ? PUSH_NEW_BRANCH_VALUE
    : state.destinationBranch;
  const destinationReady = state.destinationMode === "new"
    ? Boolean(state.newBranchName.trim())
    : Boolean(state.destinationBranch);

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <form className="grid gap-4" onSubmit={onPush}>
          <DialogHeader>
            <DialogTitle>Push to Another Branch</DialogTitle>
            <DialogDescription>
              Push the current branch to a different remote branch without changing its upstream.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label>Source branch</Label>
            <div className="commit-action-value selectable-text">{state.sourceBranch || "No current branch"}</div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="push-target-remote">Remote</Label>
            <select
              id="push-target-remote"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={state.remoteName}
              disabled={saving || remotes.length <= 1}
              onChange={(event) => {
                onStateChange({
                  ...state,
                  remoteName: event.currentTarget.value,
                  destinationMode: "existing",
                  destinationBranch: "",
                  newBranchName: "",
                  error: ""
                });
              }}
            >
              {remotes.length > 0 ? remotes.map((remoteName) => (
                <option key={remoteName} value={remoteName}>{remoteName}</option>
              )) : (
                <option value="">No push remote configured</option>
              )}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="push-target-branch">Destination branch</Label>
            <select
              id="push-target-branch"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={destinationValue}
              disabled={saving || !state.remoteName}
              onChange={(event) => {
                const value = event.currentTarget.value;
                onStateChange({
                  ...state,
                  destinationMode: value === PUSH_NEW_BRANCH_VALUE ? "new" : "existing",
                  destinationBranch: value === PUSH_NEW_BRANCH_VALUE ? "" : value,
                  newBranchName: "",
                  error: ""
                });
              }}
            >
              <option value="">Select a branch</option>
              {destinations.map((remoteBranch) => (
                <option key={remoteBranch.name} value={remoteBranch.branch}>{remoteBranch.branch}</option>
              ))}
              <option value={PUSH_NEW_BRANCH_VALUE}>New branch…</option>
            </select>
          </div>

          {state.destinationMode === "new" ? (
            <div className="grid gap-2">
              <Label htmlFor="push-target-new-branch">New branch name</Label>
              <Input
                id="push-target-new-branch"
                value={state.newBranchName}
                disabled={saving}
                autoFocus
                autoComplete="off"
                placeholder="feature/my-branch"
                onChange={(event) => {
                  onStateChange({
                    ...state,
                    newBranchName: event.currentTarget.value,
                    error: ""
                  });
                }}
              />
            </div>
          ) : null}

          <p className="text-sm text-muted-foreground">
            This is a one-time push. The upstream for {state.sourceBranch || "the current branch"} will not change.
          </p>
          <p className="min-h-5 text-sm text-destructive" role="alert">{state.error}</p>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !state.sourceBranch || !state.remoteName || !destinationReady}>
              {saving ? <Loader2 className="animate-spin" /> : <Upload />}
              {saving ? "Pushing" : "Push"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
