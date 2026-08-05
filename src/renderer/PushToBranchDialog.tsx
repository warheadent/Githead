import type { FormEvent, ReactNode } from "react";
import { GitBranch, Loader2, Plus, Upload } from "lucide-react";
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
import type { PushToBranchDialogState } from "./pushToBranchState";
import { ReferencePicker } from "./ReferencePicker";
export { emptyPushToBranchDialog, type PushToBranchDialogState } from "./pushToBranchState";

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
      <DialogContent className="sm:max-w-[460px]" aria-busy={saving}>
        <form className="grid gap-4" onSubmit={(event) => {
          if (saving) {
            event.preventDefault();
            return;
          }
          onPush(event);
        }}>
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
            <ReferencePicker
              id="push-target-remote"
              value={state.remoteName}
              options={remotes.map((remoteName) => ({ value: remoteName, label: remoteName, icon: <Upload /> }))}
              disabled={saving || remotes.length <= 1}
              ariaLabel="Select push remote"
              placeholder="No push remote configured"
              searchPlaceholder="Search remotes..."
              emptyMessage="No push remotes found."
              triggerIcon={<Upload />}
              onValueChange={(remoteName) => {
                onStateChange({
                  ...state,
                  remoteName,
                  destinationMode: "existing",
                  destinationBranch: "",
                  newBranchName: "",
                  error: ""
                });
              }}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="push-target-branch">Destination branch</Label>
            <ReferencePicker
              id="push-target-branch"
              value={destinationValue}
              options={[
                ...destinations.map((remoteBranch) => ({ value: remoteBranch.branch, label: remoteBranch.branch, detail: remoteBranch.remote, icon: <GitBranch /> })),
                { value: PUSH_NEW_BRANCH_VALUE, label: "New branch…", icon: <Plus /> }
              ]}
              disabled={saving || !state.remoteName}
              ariaLabel="Select destination branch"
              placeholder="Select a branch"
              searchPlaceholder="Search destination branches..."
              emptyMessage="No destination branches found."
              triggerIcon={<GitBranch />}
              onValueChange={(value) => {
                onStateChange({
                  ...state,
                  destinationMode: value === PUSH_NEW_BRANCH_VALUE ? "new" : "existing",
                  destinationBranch: value === PUSH_NEW_BRANCH_VALUE ? "" : value,
                  newBranchName: "",
                  error: ""
                });
              }}
            />
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {saving ? "Cancel push" : "Cancel"}
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
