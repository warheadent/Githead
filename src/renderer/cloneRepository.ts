import type { FormEvent } from "react";
import type { GitHubCloneRepository, OperationCancelStatus } from "../shared/types";

export interface CloneDraft {
  source: string;
  parentPath: string;
  directoryName: string;
  branchName: string;
  depth: string;
  recurseSubmodules: boolean;
  skipLfs?: boolean;
  sourceRefPath?: string;
}

export const emptyCloneDraft: CloneDraft = {
  source: "", parentPath: "", directoryName: "", branchName: "", depth: "0", recurseSubmodules: true
};

export interface CloneRepositoryControls {
  cloneDraft: CloneDraft;
  cloneError: string;
  cloneRunning: boolean;
  cloneCheckRunning: boolean;
  cloneCheckStatus: "idle" | "success" | "error";
  cloneCheckMessage: string;
  cloneBranches: string[];
  cancelStatus: OperationCancelStatus;
  cancelError: string;
  onCloneDraftChange(draft: CloneDraft): void;
  onCloneSourceChange(draft: CloneDraft): void;
  onChooseCloneParent(): void;
  onCheckRepositoryAccess(): void;
  onClone(event: FormEvent<HTMLFormElement>, fork?: boolean): void;
  onCancelOperation(): void;
}

export function repositoryMeta(repository: GitHubCloneRepository): string {
  const pushed = repository.pushedAt ? Date.parse(repository.pushedAt) : NaN;
  const days = Math.max(0, Math.floor((Date.now() - pushed) / 86_400_000));
  const hours = Math.max(0, Math.floor((Date.now() - pushed) / 3_600_000));
  return [Number.isFinite(pushed) ? `updated ${days ? `${days}d` : hours ? `${hours}h` : "just now"}${days || hours ? " ago" : ""}` : "", repository.language].filter(Boolean).join(" · ");
}
