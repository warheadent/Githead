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
  CommitPlanChange,
  CommitPlanGroup,
  GenerateCommitPlanResult,
  GitOperationResult,
  GitQuickCommitChange,
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
  repositoryChangeVersion?: number;
  onSelectFile: (file: GitStatusFile) => void;
  onGenerate: (paths: string[]) => Promise<GenerateCommitPlanResult | null>;
  onQuickCommit: (changes: GitQuickCommitChange[], message: string) => Promise<GitOperationResult | null>;
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
  repositoryChangeVersion = 0,
  onSelectFile,
  onGenerate,
  onQuickCommit
}: CommitPlanViewProps): ReactNode {
  const [plan, setPlan] = usePersistentWorkspacePanelState<CommitPlan | null>("commit-plan-plan", null);
  const [includedChangeIds, setIncludedChangeIds] = usePersistentWorkspacePanelState<Set<string>>(
    "commit-plan-included-changes",
    () => new Set()
  );
  const [error, setError] = usePersistentWorkspacePanelState("commit-plan-error", "");
  const [stale, setStale] = usePersistentWorkspacePanelState("commit-plan-stale", false);
  const [generating, setGenerating] = usePersistentWorkspacePanelState("commit-plan-generating", false);
  const [committingGroupId, setCommittingGroupId] = usePersistentWorkspacePanelState<string | null>("commit-plan-committing-group", null);
  const [exitingGroupIds, setExitingGroupIds] = usePersistentWorkspacePanelState<Set<string>>(
    "commit-plan-exiting-groups",
    () => new Set()
  );
  const [inboxCollapsed, setInboxCollapsed] = usePersistentWorkspacePanelState("commit-plan-inbox-collapsed", false);
  const inboxId = useId();
  const previousRepoPathRef = useRef(repoPath);
  const repositoryChangeVersionRef = useRef(repositoryChangeVersion);
  const previousRepositoryChangeVersionRef = useRef(repositoryChangeVersion);
  repositoryChangeVersionRef.current = repositoryChangeVersion;
  const fileByPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);
  const availablePaths = useMemo(
    () => files.filter(canUseInCommitPlan).map((file) => file.path),
    [files]
  );
  const changeById = useMemo(
    () => new Map(plan?.changes.map((change) => [change.id, change]) ?? []),
    [plan]
  );
  const plannedChangeIds = useMemo(
    () => new Set(plan?.groups.flatMap((group) => group.changeIds) ?? []),
    [plan]
  );
  const inboxChanges = useMemo(() => {
    if (!plan) return [];
    const unassigned = new Set(plan.unassignedChangeIds);
    return plan.changes.filter((change) => unassigned.has(change.id) || !plannedChangeIds.has(change.id));
  }, [plan, plannedChangeIds]);
  const blockedByStagedFiles = stagedCount > 0;

  useEffect(() => {
    if (previousRepoPathRef.current === repoPath) return;
    previousRepoPathRef.current = repoPath;
    previousRepositoryChangeVersionRef.current = repositoryChangeVersion;
    setPlan(null);
    setIncludedChangeIds(new Set());
    setError("");
    setStale(false);
    setGenerating(false);
    setCommittingGroupId(null);
    setExitingGroupIds(new Set());
  }, [repoPath, repositoryChangeVersion]);

  useEffect(() => {
    if (previousRepositoryChangeVersionRef.current === repositoryChangeVersion) return;
    previousRepositoryChangeVersionRef.current = repositoryChangeVersion;
    if (plan) setStale(true);
  }, [plan, repositoryChangeVersion]);

  useEffect(() => {
    const currentPaths = new Set(files.map((file) => file.path));
    setIncludedChangeIds((current) => new Set([...current].filter((changeId) => {
      const change = plan?.changes.find((candidate) => candidate.id === changeId);
      return Boolean(change && currentPaths.has(change.path));
    })));
    if (stagedCount === 0) {
      setPlan((current) => filterUnavailableChanges(current, currentPaths));
    }
  }, [files, stagedCount]);

  const generate = async (): Promise<void> => {
    if (generating || disabled || blockedByStagedFiles || availablePaths.length === 0) return;
    const startVersion = repositoryChangeVersionRef.current;
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
    setIncludedChangeIds(new Set(result.plan.groups.flatMap((group) => group.changeIds)));
    setStale(repositoryChangeVersionRef.current !== startVersion);
  };

  const updateGroup = (groupId: string, updater: (group: CommitPlanGroup) => CommitPlanGroup): void => {
    setPlan((current) => current ? {
      ...current,
      groups: current.groups.map((group) => group.id === groupId ? updater(group) : group)
    } : current);
  };

  const moveChange = (changeId: string, fromGroupId: string | null, targetGroupId: string | null): void => {
    setPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        groups: current.groups.map((group) => {
          if (group.id === fromGroupId) return { ...group, changeIds: group.changeIds.filter((item) => item !== changeId) };
          if (group.id === targetGroupId && !group.changeIds.includes(changeId)) {
            return { ...group, changeIds: [...group.changeIds, changeId] };
          }
          return group;
        }).filter((group) => group.changeIds.length > 0),
        unassignedChangeIds: targetGroupId === null
          ? [...new Set([...current.unassignedChangeIds, changeId])]
          : current.unassignedChangeIds.filter((item) => item !== changeId)
      };
    });
  };

  const quickCommit = async (group: CommitPlanGroup): Promise<void> => {
    const selectedChanges = group.changeIds.flatMap((changeId) => {
      const change = changeById.get(changeId);
      return change && includedChangeIds.has(changeId) && fileByPath.has(change.path) ? [change] : [];
    });
    const message = createCommitMessage(group);
    if (disabled || stale || blockedByStagedFiles || selectedChanges.length === 0 || !message || committingGroupId) return;
    setCommittingGroupId(group.id);
    setError("");
    const result = await onQuickCommit(selectedChanges.map(toQuickCommitChange), message);
    setCommittingGroupId(null);
    if (!result) return;
    if (result.exitCode !== 0) {
      setError(result.stderr || "Unable to create the commit.");
      return;
    }
    const committedChangeIds = new Set(selectedChanges.map((change) => change.id));
    setExitingGroupIds((current) => new Set(current).add(group.id));
    setPlan((current) => current ? {
      ...current,
      changes: current.changes.filter((change) => !committedChangeIds.has(change.id)),
      groups: current.groups.filter((item) => item.id !== group.id),
      unassignedChangeIds: current.unassignedChangeIds.filter((changeId) => !committedChangeIds.has(changeId))
    } : current);
    setIncludedChangeIds((current) => {
      const next = new Set(current);
      for (const changeId of committedChangeIds) next.delete(changeId);
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
  const inboxCount = plan ? inboxChanges.length : availablePaths.length;
  const inboxTitle = plan?.granularity === "hunk" ? "Changes to plan" : "Files to plan";

  return (
    <section className="commit-plan-view" aria-label="AI commit plan">
      <header className="commit-plan-toolbar">
        <div>
          <h2>Commit plan</h2>
          <p>{plan?.granularity === "hunk" ? "Group working-tree hunks into focused commits." : "Group working-tree files into focused commits."}</p>
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
      ) : stale ? (
        <div className="commit-plan-notice" role="alert">The working tree changed. Generate the commit plan again.</div>
      ) : null}
      {error ? <div className="commit-plan-error" role="alert">{error}</div> : null}

      <div data-workspace-scroll-key="commit-plan" className="commit-plan-scroll">
        <section className="commit-plan-inbox" aria-labelledby={`${inboxId}-title`}>
          <header className="commit-plan-inbox-header">
            <div className="commit-plan-inbox-copy"><h3 id={`${inboxId}-title`}>{inboxTitle}</h3></div>
            <Badge variant={inboxCount > 0 ? "secondary" : "outline"}>{inboxCount}</Badge>
            <Button type="button" variant="ghost" size="icon-xs" aria-label={inboxCollapsed ? `Show ${inboxTitle.toLowerCase()}` : `Hide ${inboxTitle.toLowerCase()}`} aria-expanded={!inboxCollapsed} aria-controls={inboxId} onClick={() => setInboxCollapsed((current) => !current)}>
              <ChevronDown className={inboxCollapsed ? "commit-plan-inbox-chevron is-collapsed" : "commit-plan-inbox-chevron"} />
            </Button>
          </header>
          {!inboxCollapsed ? (
            <div id={inboxId} className="commit-plan-inbox-content">
              {inboxCount > 0 ? (
                <div className="commit-plan-files" role="list">
                  {plan ? inboxChanges.map((change) => (
                    <CommitPlanChangeRow
                      key={change.id}
                      change={change}
                      file={fileByPath.get(change.path)}
                      selectedPath={selectedPath}
                      disabled={disabled}
                      groups={plan.groups}
                      onSelectFile={onSelectFile}
                      onMove={(targetGroupId) => moveChange(change.id, null, targetGroupId)}
                    />
                  )) : availablePaths.map((path) => {
                    const file = fileByPath.get(path);
                    return file ? <div className={`commit-plan-file commit-plan-inbox-file ${selectedPath === path ? "is-selected" : ""}`} role="listitem" key={path}><CommitPlanFileDetails file={file} onSelect={() => onSelectFile(file)} /></div> : null;
                  })}
                </div>
              ) : <p className="commit-plan-inbox-empty">{plan ? "Every eligible change is assigned to a planned commit." : "No eligible changed files."}</p>}
            </div>
          ) : null}
        </section>

        <MotionSwap
          className="commit-plan-state-swap"
          presenceClassName="commit-plan-state-presence"
          initialOpacity={0.85}
          initialY={-2}
          item={!plan ? {
            key: "empty",
            content: <div className="commit-plan-empty"><Sparkles aria-hidden="true" /><strong>Create a focused commit plan</strong><span>Githead will inspect the unstaged diffs and suggest groups and commit messages.</span></div>
          } : !hasRenderedGroups ? {
            key: "complete",
            content: <div className="commit-plan-empty"><strong>All planned groups are committed.</strong></div>
          } : {
            key: "groups",
            content: <MotionList
              element="article"
              itemClassName="commit-plan-group"
              initialY={-2}
              items={plan.groups.map((group, index) => ({
                key: group.id,
                content: <>
                  <div className="commit-plan-group-header">
                    <span className={`commit-plan-marker commit-plan-marker-${index % 6}`} aria-hidden="true" />
                    <div className="commit-plan-group-copy">
                      <label className="sr-only" htmlFor={`commit-plan-message-${group.id}`}>Commit message</label>
                      <Input id={`commit-plan-message-${group.id}`} value={group.message} disabled={disabled} onChange={(event) => updateGroup(group.id, (current) => ({ ...current, message: event.target.value }))} />
                      {group.rationale ? <p>{group.rationale}</p> : null}
                    </div>
                    <Badge variant="secondary">{group.changeIds.length}</Badge>
                    <Button type="button" size="sm" disabled={disabled || stale || blockedByStagedFiles || committingGroupId !== null || !group.message.trim() || !group.changeIds.some((changeId) => includedChangeIds.has(changeId) && changeById.has(changeId))} onClick={() => { void quickCommit(group); }}>
                      {committingGroupId === group.id ? <Loader2 className="animate-spin" /> : null}
                      Quick Commit
                    </Button>
                  </div>
                  <div className="commit-plan-files" role="list">
                    {group.changeIds.map((changeId) => {
                      const change = changeById.get(changeId);
                      if (!change) return null;
                      const file = fileByPath.get(change.path);
                      return <div className={`commit-plan-file ${selectedPath === change.path ? "is-selected" : ""}`} role="listitem" key={change.id}>
                        <input type="checkbox" aria-label={`Include ${changeDescription(change)} in this commit`} checked={includedChangeIds.has(change.id)} disabled={disabled || stale} onChange={(event) => setIncludedChangeIds((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(change.id); else next.delete(change.id);
                          return next;
                        })} />
                        <CommitPlanChangeDetails change={change} file={file} onSelect={file ? () => onSelectFile(file) : undefined} />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-xs" aria-label={`Move ${changeDescription(change)} to another group`} disabled={disabled || stale}><span className={`commit-plan-marker commit-plan-marker-${index % 6}`} aria-hidden="true" /><ChevronDown /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {plan.groups.filter((target) => target.id !== group.id).map((target) => <DropdownMenuItem key={target.id} onSelect={() => moveChange(change.id, group.id, target.id)}>{target.message}</DropdownMenuItem>)}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => moveChange(change.id, group.id, null)}>Move to unassigned</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>;
                    })}
                  </div>
                </>
              }))}
              onItemExitComplete={finishGroupExit}
            />
          }}
        />
      </div>
    </section>
  );
}

function CommitPlanChangeRow({ change, file, selectedPath, disabled, groups, onSelectFile, onMove }: { change: CommitPlanChange; file: GitStatusFile | undefined; selectedPath: string | null; disabled: boolean; groups: CommitPlanGroup[]; onSelectFile: (file: GitStatusFile) => void; onMove: (groupId: string) => void }): ReactNode {
  return <div className={`commit-plan-file commit-plan-inbox-file ${selectedPath === change.path ? "is-selected" : ""}`} role="listitem">
    <CommitPlanChangeDetails change={change} file={file} onSelect={file ? () => onSelectFile(file) : undefined} />
    {groups.length > 0 ? <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-xs" aria-label={`Assign ${changeDescription(change)} to a commit`} disabled={disabled}><ChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{groups.map((target) => <DropdownMenuItem key={target.id} onSelect={() => onMove(target.id)}>{target.message}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu> : null}
  </div>;
}

function CommitPlanChangeDetails({ change, file, onSelect }: { change: CommitPlanChange; file: GitStatusFile | undefined; onSelect: (() => void) | undefined }): ReactNode {
  const content = <><span>{baseName(change.path)}</span><small>{change.kind === "hunk" ? change.label : directoryName(change.path)}</small></>;
  return <>
    {file ? <CommitPlanStatusBadge file={file} /> : <Badge variant="outline">?</Badge>}
    {onSelect ? <button type="button" className="commit-plan-file-name" onClick={onSelect}>{content}</button> : <span className="commit-plan-file-name">{content}</span>}
  </>;
}

function CommitPlanFileDetails({ file, onSelect }: { file: GitStatusFile; onSelect: () => void }): ReactNode {
  return <><CommitPlanStatusBadge file={file} /><button type="button" className="commit-plan-file-name" onClick={onSelect}><span>{baseName(file.path)}</span><small>{directoryName(file.path)}</small></button></>;
}

function CommitPlanStatusBadge({ file }: { file: GitStatusFile }): ReactNode {
  const visuals = getFileStatusVisuals(file, "unstaged");
  return <Badge variant="outline" className={`status-chip status-chip-${visuals.tone}`} title={visuals.label}>{visuals.code}</Badge>;
}

function filterUnavailableChanges(plan: CommitPlan | null, currentPaths: Set<string>): CommitPlan | null {
  if (!plan) return plan;
  const changes = plan.changes.filter((change) => currentPaths.has(change.path));
  const changeIds = new Set(changes.map((change) => change.id));
  return {
    ...plan,
    changes,
    groups: plan.groups.map((group) => ({ ...group, changeIds: group.changeIds.filter((changeId) => changeIds.has(changeId)) })).filter((group) => group.changeIds.length > 0),
    unassignedChangeIds: plan.unassignedChangeIds.filter((changeId) => changeIds.has(changeId))
  };
}

function toQuickCommitChange(change: CommitPlanChange): GitQuickCommitChange {
  return { path: change.path, kind: change.kind, fingerprint: change.fingerprint };
}

function changeDescription(change: CommitPlanChange): string {
  return change.kind === "hunk" ? `${change.path} ${change.label}` : change.path;
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
