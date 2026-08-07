import { useCallback, useEffect, useId, useMemo, useRef, type ReactNode } from "react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type {
  CommitPlan,
  CommitPlanGroup,
  GenerateCommitPlanResult,
  GitOperationResult,
  GitStatusFile
} from "../shared/types";
import { getFileStatusVisuals } from "./fileStatusVisuals";
import { MotionList, MotionSwap } from "./motion";
import { usePersistentWorkspacePanelState } from "./workspacePanelState";

interface CommitPlanViewProps {
  repoPath: string;
  files: GitStatusFile[];
  stagedCount: number;
  selectedPath: string | null;
  disabled: boolean;
  supported: boolean;
  canGenerate: boolean;
  generateTitle: string;
  onSelectFile: (file: GitStatusFile) => void;
  onGenerate: (paths: string[]) => Promise<GenerateCommitPlanResult | null>;
  onQuickCommit: (paths: string[], message: string) => Promise<GitOperationResult | null>;
}

export function CommitPlanView({
  repoPath,
  files,
  stagedCount,
  selectedPath,
  disabled,
  supported,
  canGenerate,
  generateTitle,
  onSelectFile,
  onGenerate,
  onQuickCommit
}: CommitPlanViewProps): ReactNode {
  const [plan, setPlan] = usePersistentWorkspacePanelState<CommitPlan | null>("commit-plan-plan", null);
  const [includedPaths, setIncludedPaths] = usePersistentWorkspacePanelState<Set<string>>(
    "commit-plan-included-paths",
    () => new Set()
  );
  const [error, setError] = usePersistentWorkspacePanelState("commit-plan-error", "");
  const [generating, setGenerating] = usePersistentWorkspacePanelState("commit-plan-generating", false);
  const [committingGroupId, setCommittingGroupId] = usePersistentWorkspacePanelState<string | null>("commit-plan-committing-group", null);
  const [exitingGroupIds, setExitingGroupIds] = usePersistentWorkspacePanelState<Set<string>>(
    "commit-plan-exiting-groups",
    () => new Set()
  );
  const [inboxCollapsed, setInboxCollapsed] = usePersistentWorkspacePanelState("commit-plan-inbox-collapsed", false);
  const inboxId = useId();
  const previousRepoPathRef = useRef(repoPath);
  const fileByPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);
  const availablePaths = useMemo(
    () => files.filter(canUseInCommitPlan).map((file) => file.path),
    [files]
  );
  const blockedByStagedFiles = stagedCount > 0;
  const plannedPaths = useMemo(
    () => new Set(plan?.groups.flatMap((group) => group.paths) ?? []),
    [plan]
  );
  const inboxPaths = useMemo(() => {
    if (!plan) return availablePaths;
    const unassignedPaths = new Set(plan.unassignedPaths);
    return availablePaths.filter((path) => unassignedPaths.has(path) || !plannedPaths.has(path));
  }, [availablePaths, plan, plannedPaths]);

  useEffect(() => {
    if (previousRepoPathRef.current === repoPath) return;
    previousRepoPathRef.current = repoPath;
    setPlan(null);
    setIncludedPaths(new Set());
    setError("");
    setGenerating(false);
    setCommittingGroupId(null);
    setExitingGroupIds(new Set());
  }, [repoPath]);

  useEffect(() => {
    const currentPaths = new Set(files.map((file) => file.path));
    setIncludedPaths((current) => new Set([...current].filter((path) => currentPaths.has(path))));
    if (stagedCount === 0) {
      setPlan((current) => current ? {
        groups: current.groups
          .map((group) => ({ ...group, paths: group.paths.filter((path) => currentPaths.has(path)) }))
          .filter((group) => group.paths.length > 0),
        unassignedPaths: current.unassignedPaths.filter((path) => currentPaths.has(path))
      } : current);
    }
  }, [files, stagedCount]);

  const generate = async (): Promise<void> => {
    if (generating || disabled || blockedByStagedFiles || availablePaths.length === 0) return;
    setGenerating(true);
    setError("");
    const result = await onGenerate(availablePaths);
    setGenerating(false);
    if (!result) return;
    if (result.exitCode !== 0 || !result.plan) {
      setError(result.stderr || "Unable to generate a commit plan.");
      return;
    }
    setPlan(result.plan);
    setExitingGroupIds(new Set());
    setIncludedPaths(new Set(result.plan.groups.flatMap((group) => group.paths)));
  };

  const updateGroup = (groupId: string, updater: (group: CommitPlanGroup) => CommitPlanGroup): void => {
    setPlan((current) => current ? {
      ...current,
      groups: current.groups.map((group) => group.id === groupId ? updater(group) : group)
    } : current);
  };

  const movePath = (path: string, fromGroupId: string | null, targetGroupId: string | null): void => {
    setPlan((current) => {
      if (!current) return current;
      return {
        groups: current.groups.map((group) => {
          if (group.id === fromGroupId) return { ...group, paths: group.paths.filter((item) => item !== path) };
          if (group.id === targetGroupId && !group.paths.includes(path)) return { ...group, paths: [...group.paths, path] };
          return group;
        }).filter((group) => group.paths.length > 0),
        unassignedPaths: targetGroupId === null
          ? [...new Set([...current.unassignedPaths, path])]
          : current.unassignedPaths.filter((item) => item !== path)
      };
    });
  };

  const quickCommit = async (group: CommitPlanGroup): Promise<void> => {
    const paths = group.paths.filter((path) => includedPaths.has(path) && fileByPath.has(path));
    const message = createCommitMessage(group);
    if (disabled || blockedByStagedFiles || paths.length === 0 || !message || committingGroupId) return;
    setCommittingGroupId(group.id);
    setError("");
    const result = await onQuickCommit(paths, message);
    setCommittingGroupId(null);
    if (!result) return;
    if (result.exitCode !== 0) {
      setError(result.stderr || "Unable to create the commit.");
      return;
    }
    setExitingGroupIds((current) => new Set(current).add(group.id));
    setPlan((current) => current ? {
      ...current,
      groups: current.groups.filter((item) => item.id !== group.id)
    } : current);
    setIncludedPaths((current) => {
      const next = new Set(current);
      for (const path of paths) next.delete(path);
      return next;
    });
  };

  const finishGroupExit = useCallback((groupId: string): void => {
    setExitingGroupIds((current) => {
      if (!current.has(groupId)) return current;
      const next = new Set(current);
      next.delete(groupId);
      return next;
    });
  }, []);

  const hasRenderedGroups = Boolean(plan && (plan.groups.length > 0 || exitingGroupIds.size > 0));

  return (
    <section className="commit-plan-view" aria-label="AI commit plan">
      <header className="commit-plan-toolbar">
        <div>
          <h2>Commit plan</h2>
          <p>Group working-tree files into focused commits.</p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={disabled || generating || blockedByStagedFiles || availablePaths.length === 0 || !supported || !canGenerate}
          title={blockedByStagedFiles ? "Unstage existing files before you generate a commit plan." : generateTitle}
          onClick={() => { void generate(); }}
        >
          {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {plan ? "Regenerate" : "Generate"}
        </Button>
      </header>

      {blockedByStagedFiles ? (
        <div className="commit-plan-notice" role="alert">
          Unstage the {stagedCount} staged {stagedCount === 1 ? "file" : "files"} before you use Commit plan.
        </div>
      ) : !supported ? (
        <div className="commit-plan-notice">Commit plan is available only for Git repositories.</div>
      ) : null}
      {error ? <div className="commit-plan-error" role="alert">{error}</div> : null}

      <div data-workspace-scroll-key="commit-plan" className="commit-plan-scroll">
        <section className="commit-plan-inbox" aria-labelledby={`${inboxId}-title`}>
          <header className="commit-plan-inbox-header">
            <div className="commit-plan-inbox-copy">
              <h3 id={`${inboxId}-title`}>Files to plan</h3>
            </div>
            <Badge variant={inboxPaths.length > 0 ? "secondary" : "outline"}>{inboxPaths.length}</Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={inboxCollapsed ? "Show files to plan" : "Hide files to plan"}
              aria-expanded={!inboxCollapsed}
              aria-controls={inboxId}
              onClick={() => setInboxCollapsed((current) => !current)}
            >
              <ChevronDown className={inboxCollapsed ? "commit-plan-inbox-chevron is-collapsed" : "commit-plan-inbox-chevron"} />
            </Button>
          </header>
          {!inboxCollapsed ? (
            <div id={inboxId} className="commit-plan-inbox-content">
              {inboxPaths.length > 0 ? (
                <div className="commit-plan-files" role="list">
                  {inboxPaths.map((path) => {
                    const file = fileByPath.get(path);
                    if (!file) return null;
                    return (
                      <div className={`commit-plan-file commit-plan-inbox-file ${selectedPath === path ? "is-selected" : ""}`} role="listitem" key={path}>
                        <CommitPlanFileDetails file={file} onSelect={() => onSelectFile(file)} />
                        {plan && plan.groups.length > 0 ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" variant="ghost" size="icon-xs" aria-label={`Assign ${path} to a commit`} disabled={disabled}>
                                <ChevronDown />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {plan.groups.map((target) => (
                                <DropdownMenuItem key={target.id} onSelect={() => movePath(path, null, target.id)}>
                                  {target.message}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="commit-plan-inbox-empty">
                  {plan ? "Every eligible file is assigned to a planned commit." : "No eligible changed files."}
                </p>
              )}
            </div>
          ) : null}
        </section>
        <MotionSwap
          className="commit-plan-state-swap"
          presenceClassName="commit-plan-state-presence"
          item={!plan ? {
            key: "empty",
            content: (
              <div className="commit-plan-empty">
                <Sparkles aria-hidden="true" />
                <strong>Create a focused commit plan</strong>
                <span>Githead will inspect the unstaged diffs and suggest groups and commit messages.</span>
              </div>
            )
          } : !hasRenderedGroups ? {
            key: "complete",
            content: (
              <div className="commit-plan-empty"><strong>All planned groups are committed.</strong></div>
            )
          } : {
            key: "groups",
            content: (
              <>
                <MotionList
                  element="article"
                  itemClassName="commit-plan-group"
                  items={plan.groups.map((group, index) => ({
                    key: group.id,
                    content: (
                      <>
                        <div className="commit-plan-group-header">
                          <span className={`commit-plan-marker commit-plan-marker-${index % 6}`} aria-hidden="true" />
                          <div className="commit-plan-group-copy">
                            <label className="sr-only" htmlFor={`commit-plan-message-${group.id}`}>Commit message</label>
                            <Input
                              id={`commit-plan-message-${group.id}`}
                              value={group.message}
                              disabled={disabled}
                              onChange={(event) => updateGroup(group.id, (current) => ({ ...current, message: event.target.value }))}
                            />
                            {group.rationale ? <p>{group.rationale}</p> : null}
                          </div>
                          <Badge variant="secondary">{group.paths.length}</Badge>
                          <Button
                            type="button"
                            size="sm"
                            disabled={disabled || blockedByStagedFiles || committingGroupId !== null || !group.message.trim() || !group.paths.some((path) => includedPaths.has(path) && fileByPath.has(path))}
                            onClick={() => { void quickCommit(group); }}
                          >
                            {committingGroupId === group.id ? <Loader2 className="animate-spin" /> : null}
                            Quick Commit
                          </Button>
                        </div>
                        <div className="commit-plan-files" role="list">
                          {group.paths.map((path) => {
                            const file = fileByPath.get(path);
                            if (!file) return null;
                            return (
                              <div className={`commit-plan-file ${selectedPath === path ? "is-selected" : ""}`} role="listitem" key={path}>
                                <input
                                  type="checkbox"
                                  aria-label={`Include ${path} in this commit`}
                                  checked={includedPaths.has(path)}
                                  disabled={disabled}
                                  onChange={(event) => setIncludedPaths((current) => {
                                    const next = new Set(current);
                                    if (event.target.checked) next.add(path); else next.delete(path);
                                    return next;
                                  })}
                                />
                                <CommitPlanFileDetails file={file} onSelect={() => onSelectFile(file)} />
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button type="button" variant="ghost" size="icon-xs" aria-label={`Move ${path} to another group`} disabled={disabled}>
                                      <span className={`commit-plan-marker commit-plan-marker-${index % 6}`} aria-hidden="true" />
                                      <ChevronDown />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {plan.groups.filter((target) => target.id !== group.id).map((target) => (
                                      <DropdownMenuItem key={target.id} onSelect={() => movePath(path, group.id, target.id)}>
                                        {target.message}
                                      </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={() => movePath(path, group.id, null)}>Move to unassigned</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )
                  }))}
                  onItemExitComplete={finishGroupExit}
                />
              </>
            )
          }}
        />
      </div>
    </section>
  );
}

function CommitPlanFileDetails({ file, onSelect }: { file: GitStatusFile; onSelect: () => void }): ReactNode {
  const visuals = getFileStatusVisuals(file, "unstaged");
  return (
    <>
      <Badge variant="outline" className={`status-chip status-chip-${visuals.tone}`} title={visuals.label}>{visuals.code}</Badge>
      <button type="button" className="commit-plan-file-name" onClick={onSelect}>
        <span>{baseName(file.path)}</span>
        <small>{directoryName(file.path)}</small>
      </button>
    </>
  );
}

function canUseInCommitPlan(file: GitStatusFile): boolean {
  return !file.isConflicted && file.submodule?.canStage !== false;
}

export function createCommitMessage(group: Pick<CommitPlanGroup, "message" | "rationale">): string {
  const subject = group.message.trim();
  const description = group.rationale.trim();
  return description ? `${subject}\n\n${description}` : subject;
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function directoryName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}
