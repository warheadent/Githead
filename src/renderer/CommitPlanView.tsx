import { MAX_COMMIT_PLAN_GROUPS, MAX_COMMIT_PLAN_PATHS } from "../shared/commitPlanLimits";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Loader2, Plus, RotateCw, Sparkles, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { loadCommitPlanDraft, saveCommitPlanDraft } from "./commitPlanDraft";
import { reconcileCommitPlan, removeCommittedChanges } from "./commitPlanState";
import type {
  CommitPlan,
  CommitPlanChange,
  CommitPlanGroup,
  CommitPlanValidationRequest,
  CommitPlanValidationResult,
  GenerateCommitPlanResult,
  GitOperationResult,
  GitQuickCommitChange,
  GitStatusFile
} from "../shared/types";
import { getFileStatusVisuals } from "./fileStatusVisuals";
import { FileStatusChip } from "./FileStatusChip";
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
  onValidatePlan: (request: CommitPlanValidationRequest) => Promise<CommitPlanValidationResult>;
  onQuickCommit: (changes: GitQuickCommitChange[], message: string) => Promise<GitOperationResult | null>;
}

export function CommitPlanView(props: CommitPlanViewProps): ReactNode {
  return <CommitPlanEditor key={props.repoPath} {...props} />;
}

function CommitPlanEditor({
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
  onValidatePlan,
  onQuickCommit
}: CommitPlanViewProps): ReactNode {
  const draft = useMemo(() => loadCommitPlanDraft(repoPath), [repoPath]);
  const [plan, setPlan] = usePersistentWorkspacePanelState<CommitPlan | null>("commit-plan-plan", () => draft?.plan ?? null);
  const [includedChangeIds, setIncludedChangeIds] = usePersistentWorkspacePanelState<Set<string>>(
    "commit-plan-included-changes", () => new Set(draft?.includedChangeIds ?? [])
  );
  const [excludedPaths, setExcludedPaths] = usePersistentWorkspacePanelState<Set<string>>(
    "commit-plan-excluded-paths", () => new Set(draft?.excludedPaths ?? [])
  );
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState("");
  const [choosingFiles, setChoosingFiles] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [stale, setStale] = useState(false);
  const [validating, setValidating] = useState(Boolean(plan));
  const [generating, setGenerating] = useState(false);
  const [committingGroupId, setCommittingGroupId] = useState<string | null>(null);
  const [exitingGroupIds, setExitingGroupIds] = useState<Set<string>>(() => new Set());
  const [inboxCollapsed, setInboxCollapsed] = usePersistentWorkspacePanelState("commit-plan-inbox-collapsed", false);
  const inboxId = useId();
  const alive = useRef(true);
  const planRef = useRef(plan);
  planRef.current = plan;
  const repositoryChangeVersionRef = useRef(repositoryChangeVersion);
  repositoryChangeVersionRef.current = repositoryChangeVersion;
  const validationGenerationRef = useRef(0);
  const operationRef = useRef(false);
  const generatedSnapshotRef = useRef<{ version: number; pathsKey: string } | null>(null);
  const fileByPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);
  const availablePaths = useMemo(() => files.filter(canUseInCommitPlan).map((file) => file.path), [files]);
  const selectedPaths = useMemo(() => availablePaths.filter((path) => !excludedPaths.has(path)), [availablePaths, excludedPaths]);
  const selectedPathsRef = useRef(selectedPaths);
  selectedPathsRef.current = selectedPaths;
  const pathsKey = JSON.stringify(selectedPaths);
  const changeById = useMemo(() => new Map(plan?.changes.map((change) => [change.id, change]) ?? []), [plan?.changes]);
  const plannedChangeIds = useMemo(() => new Set(plan?.groups.flatMap((group) => group.changeIds) ?? []), [plan?.groups]);
  const inboxChanges = useMemo(() => plan?.changes.filter((change) => !plannedChangeIds.has(change.id)) ?? [], [plan?.changes, plannedChangeIds]);
  const blockedByStagedFiles = stagedCount > 0;
  const editingDisabled = disabled || generating || committingGroupId !== null;
  const savedDraft = useRef({ plan, includedChangeIds: [...includedChangeIds], excludedPaths: [...excludedPaths] });
  savedDraft.current = { plan, includedChangeIds: [...includedChangeIds], excludedPaths: [...excludedPaths] };

  useEffect(() => {
    const timer = window.setTimeout(() => setSaveFailed(!saveCommitPlanDraft(repoPath, savedDraft.current)), 250);
    return () => window.clearTimeout(timer);
  }, [repoPath, plan, includedChangeIds, excludedPaths]);

  useEffect(() => {
    alive.current = true;
    const save = (): void => { saveCommitPlanDraft(repoPath, savedDraft.current); };
    window.addEventListener("pagehide", save);
    return () => {
      alive.current = false;
      validationGenerationRef.current += 1;
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [repoPath]);

  const validatePlan = useCallback(async (
    candidatePlan: CommitPlan,
    candidatePaths: string[],
    expectedVersion: number
  ): Promise<void> => {
    const generation = ++validationGenerationRef.current;
    setValidating(true);
    try {
      const result = await onValidatePlan({ repoPath, paths: candidatePaths, granularity: candidatePlan.granularity, changes: candidatePlan.changes });
      if (!alive.current || generation !== validationGenerationRef.current || expectedVersion !== repositoryChangeVersionRef.current) return;
      if (result.repoPath !== repoPath || result.stderr || (!result.valid && !result.currentChanges)) {
        setStale(true);
        setValidationError(result.stderr || "The working tree changed. Generate the commit plan again.");
        return;
      }
      if (result.currentChanges) {
        setPlan((current) => current ? reconcileCommitPlan(current, result.currentChanges!) : current);
      }
      setStale(false);
      setValidationError("");
    } catch (reason) {
      if (!alive.current || generation !== validationGenerationRef.current) return;
      setStale(true);
      setValidationError(reason instanceof Error ? reason.message : "Unable to refresh the commit plan.");
    } finally {
      if (alive.current && generation === validationGenerationRef.current) setValidating(false);
    }
  }, [onValidatePlan, repoPath, setPlan]);

  useEffect(() => {
    if (!planRef.current || !supported || editingDisabled || blockedByStagedFiles) return;
    const generatedSnapshot = generatedSnapshotRef.current;
    generatedSnapshotRef.current = null;
    if (generatedSnapshot?.version === repositoryChangeVersion && generatedSnapshot.pathsKey === pathsKey) return;
    void validatePlan(planRef.current, selectedPathsRef.current, repositoryChangeVersion);
  }, [repositoryChangeVersion, pathsKey, supported, editingDisabled, blockedByStagedFiles, validatePlan]);

  useEffect(() => {
    const ids = new Set(plan?.changes.map((change) => change.id));
    setIncludedChangeIds((current) => {
      const next = new Set([...current].filter((id) => ids.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [plan?.changes, setIncludedChangeIds]);

  const storeCompletedPlan = (nextPlan: CommitPlan, included: Set<string>): void => {
    setPlan(nextPlan);
    setIncludedChangeIds(included);
    savedDraft.current = { ...savedDraft.current, plan: nextPlan, includedChangeIds: [...included] };
    const saved = saveCommitPlanDraft(repoPath, savedDraft.current);
    if (alive.current) setSaveFailed(!saved);
  };

  const generate = async (): Promise<void> => {
    if (operationRef.current || editingDisabled || blockedByStagedFiles || selectedPaths.length === 0) return;
    operationRef.current = true;
    validationGenerationRef.current += 1;
    const startVersion = repositoryChangeVersionRef.current;
    const requestedPaths = [...selectedPaths];
    setGenerating(true);
    setError("");
    try {
      const result = await onGenerate(requestedPaths);
      if (!result) return;
      if (result.repoPath !== repoPath || result.exitCode !== 0 || !result.plan) {
        if (alive.current) setError(result.stderr || "Unable to generate a commit plan.");
        return;
      }
      storeCompletedPlan(result.plan, new Set(result.plan.groups.flatMap((group) => group.changeIds)));
      if (!alive.current) return;
      setChoosingFiles(false);
      setValidationError("");
      setExitingGroupIds(new Set());
      setStale(false);
      const currentVersion = repositoryChangeVersionRef.current;
      if (startVersion === currentVersion) generatedSnapshotRef.current = { version: currentVersion, pathsKey: JSON.stringify(requestedPaths) };
      setValidating(startVersion !== currentVersion);
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : "Unable to generate a commit plan.");
    } finally {
      operationRef.current = false;
      if (alive.current) setGenerating(false);
    }
  };

  const updateGroup = (groupId: string, updater: (group: CommitPlanGroup) => CommitPlanGroup): void => {
    setPlan((current) => current ? {
      ...current,
      groups: current.groups.map((group) => group.id === groupId ? updater(group) : group)
    } : current);
  };

  const moveChange = (changeId: string, fromGroupId: string | null, targetGroupId: string | null): void => {
    if (targetGroupId) setIncludedChangeIds((current) => new Set(current).add(changeId));
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
        }),
        unassignedChangeIds: targetGroupId === null
          ? [...new Set([...current.unassignedChangeIds, changeId])]
          : current.unassignedChangeIds.filter((item) => item !== changeId)
      };
    });
  };

  const addGroup = (): void => {
    setPlan((current) => current && current.groups.length < MAX_COMMIT_PLAN_GROUPS ? {
      ...current, groups: [...current.groups, { id: crypto.randomUUID(), message: "", rationale: "", changeIds: [] }]
    } : current);
  };

  const reorderGroup = (groupId: string, offset: number): void => {
    setPlan((current) => {
      if (!current) return current;
      const groups = [...current.groups];
      const index = groups.findIndex((group) => group.id === groupId);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= groups.length) return current;
      [groups[index], groups[target]] = [groups[target]!, groups[index]!];
      return { ...current, groups };
    });
  };

  const deleteGroup = (groupId: string): void => {
    setPlan((current) => current ? {
      ...current,
      groups: current.groups.filter((group) => group.id !== groupId),
      unassignedChangeIds: [...new Set([...current.unassignedChangeIds, ...(current.groups.find((group) => group.id === groupId)?.changeIds ?? [])])]
    } : current);
  };

  const quickCommit = async (group: CommitPlanGroup): Promise<void> => {
    const selectedChanges = group.changeIds.flatMap((id) => {
      const change = changeById.get(id);
      return change && includedChangeIds.has(id) && fileByPath.has(change.path) ? [change] : [];
    });
    const message = createCommitMessage(group);
    if (!plan || operationRef.current || editingDisabled || stale || validating || blockedByStagedFiles || group.needsReview || selectedChanges.length === 0 || !group.message.trim()) return;
    operationRef.current = true;
    validationGenerationRef.current += 1;
    setCommittingGroupId(group.id);
    setError("");
    try {
      const result = await onQuickCommit(selectedChanges.map(toQuickCommitChange), message);
      if (!result) return;
      if (result.repoPath !== repoPath || result.exitCode !== 0) {
        if (alive.current) setError(result.stderr || "Unable to create the commit.");
        return;
      }
      const committed = new Set(selectedChanges.map((change) => change.id));
      if (alive.current && group.changeIds.every((id) => committed.has(id))) setExitingGroupIds((current) => new Set(current).add(group.id));
      storeCompletedPlan(removeCommittedChanges(planRef.current ?? plan, committed), new Set(savedDraft.current.includedChangeIds.filter((id) => !committed.has(id))));
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : "Unable to create the commit.");
    } finally {
      operationRef.current = false;
      if (alive.current) setCommittingGroupId(null);
    }
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
  const showFileSelection = !plan || choosingFiles;
  const inboxCount = showFileSelection ? availablePaths.length : inboxChanges.length;
  const inboxTitle = plan?.granularity === "hunk" ? "Changes to plan" : "Files to plan";

  return (
    <section className="commit-plan-view" aria-label="AI commit plan">
      <header className="commit-plan-toolbar">
        <div>
          <h2>Commit plan</h2>
          <p>{plan?.granularity === "hunk" ? "Group working-tree hunks into focused commits." : "Group working-tree files into focused commits."}</p>
        </div>
        <div className="commit-plan-toolbar-actions">
        {plan ? <>
          <Button type="button" variant="ghost" size="sm" disabled={editingDisabled} aria-pressed={choosingFiles} onClick={() => setChoosingFiles((current) => !current)}>Choose files</Button>
          <Button type="button" variant="outline" size="sm" disabled={editingDisabled || blockedByStagedFiles || validating} onClick={() => { void validatePlan(plan, selectedPaths, repositoryChangeVersion); }}><RotateCw />Refresh</Button>
          <Button type="button" variant="outline" size="sm" disabled={editingDisabled || plan.groups.length >= MAX_COMMIT_PLAN_GROUPS} onClick={addGroup}><Plus />Add group</Button>
        </> : null}
        <Button
          type="button"
          size="sm"
          disabled={editingDisabled || blockedByStagedFiles || selectedPaths.length === 0 || selectedPaths.length > MAX_COMMIT_PLAN_PATHS || !supported || !canGenerate}
          title={blockedByStagedFiles ? "Unstage existing files before you generate a commit plan." : generateTitle}
          onClick={() => { void generate(); }}
        >
          {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {plan ? "Regenerate" : "Generate"}
        </Button>
        </div>
      </header>

      {blockedByStagedFiles ? (
        <div className="commit-plan-notice" role="alert">
          Unstage the {stagedCount} staged {stagedCount === 1 ? "file" : "files"} before you use Commit plan.
        </div>
      ) : !supported ? (
        <div className="commit-plan-notice">Commit plan is available only for Git repositories.</div>
      ) : validating ? (
        <div className="commit-plan-notice" role="status">Checking whether the commit plan is still current...</div>
      ) : null}
      {validationError ? <div className="commit-plan-error" role="alert">{validationError}</div> : null}
      {saveFailed ? <div className="commit-plan-notice" role="status">This draft could not be saved. Keep this window open to retain your edits.</div> : null}
      {selectedPaths.length > MAX_COMMIT_PLAN_PATHS ? <div className="commit-plan-notice" role="alert">Select up to {MAX_COMMIT_PLAN_PATHS} files for a commit plan.</div> : null}
      {error ? <div className="commit-plan-error" role="alert">{error}</div> : null}

      <div data-workspace-scroll-key="commit-plan" className="commit-plan-scroll">
        <div className="commit-plan-inbox-sticky">
          <section className="commit-plan-inbox" aria-labelledby={`${inboxId}-title`}>
            <header className="commit-plan-inbox-header">
              <div className="commit-plan-inbox-copy"><h3 id={`${inboxId}-title`}>{inboxTitle}</h3></div>
              <Badge variant={inboxCount > 0 ? "secondary" : "outline"}>{showFileSelection ? `${selectedPaths.length} selected` : inboxCount}</Badge>
              <Button type="button" variant="ghost" size="icon-xs" aria-label={inboxCollapsed ? `Show ${inboxTitle.toLowerCase()}` : `Hide ${inboxTitle.toLowerCase()}`} aria-expanded={!inboxCollapsed} aria-controls={inboxId} onClick={() => setInboxCollapsed((current) => !current)}>
                <ChevronDown className={inboxCollapsed ? "commit-plan-inbox-chevron is-collapsed" : "commit-plan-inbox-chevron"} />
              </Button>
              {showFileSelection ? <div className="commit-plan-selection-actions">
                <Button type="button" size="sm" variant="ghost" disabled={editingDisabled} onClick={() => setExcludedPaths(new Set())}>Select all</Button>
                <Button type="button" size="sm" variant="ghost" disabled={editingDisabled} onClick={() => setExcludedPaths(new Set(availablePaths))}>Select none</Button>
              </div> : null}
            </header>
            {!inboxCollapsed ? (
              <div id={inboxId} className="commit-plan-inbox-content">
                {inboxCount > 0 ? (
                  <div className="commit-plan-files" role="list">
                    {!showFileSelection && plan ? inboxChanges.map((change) => (
                      <CommitPlanChangeRow
                        key={change.id}
                        change={change}
                        file={fileByPath.get(change.path)}
                        selectedPath={selectedPath}
                        disabled={editingDisabled || stale || validating}
                        groups={plan.groups}
                        onSelectFile={onSelectFile}
                        onMove={(targetGroupId) => moveChange(change.id, null, targetGroupId)}
                      />
                    )) : availablePaths.map((path) => {
                      const file = fileByPath.get(path);
                      return file ? <div className={`commit-plan-file commit-plan-inbox-file ${selectedPath === path ? "is-selected" : ""}`} role="listitem" key={path}><input type="checkbox" aria-label={`Plan ${path}`} checked={!excludedPaths.has(path)} disabled={editingDisabled} onChange={(event) => setExcludedPaths((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.delete(path); else next.add(path);
                        return next;
                      })} /><CommitPlanFileDetails file={file} onSelect={() => onSelectFile(file)} /></div> : null;
                    })}
                  </div>
                ) : <p className="commit-plan-inbox-empty">{plan ? "Every eligible change is assigned to a planned commit." : "No eligible changed files."}</p>}
              </div>
            ) : null}
          </section>
        </div>

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
            content: <div className="commit-plan-empty"><strong>{inboxChanges.length > 0 ? "Create a group to assign the remaining changes." : "All planned groups are committed."}</strong></div>
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
                      <Input id={`commit-plan-message-${group.id}`} value={group.message} disabled={editingDisabled} onChange={(event) => updateGroup(group.id, (current) => ({ ...current, message: event.target.value }))} />
                      <label className="sr-only" htmlFor={`commit-plan-body-${group.id}`}>Commit body</label>
                      <Textarea id={`commit-plan-body-${group.id}`} rows={2} value={group.rationale} placeholder="Commit body (optional)" disabled={editingDisabled} onChange={(event) => updateGroup(group.id, (current) => ({ ...current, rationale: event.target.value }))} />
                    </div>
                    <Badge variant="secondary">{group.changeIds.length}</Badge>
                    <Button type="button" size="sm" disabled={editingDisabled || stale || validating || blockedByStagedFiles || group.needsReview === true || !group.message.trim() || !group.changeIds.some((changeId) => includedChangeIds.has(changeId) && changeById.has(changeId))} onClick={() => { void quickCommit(group); }}>
                      {committingGroupId === group.id ? <Loader2 className="animate-spin" /> : null}
                      Quick Commit
                    </Button>
                  </div>
                  <div className="commit-plan-group-actions">
                    <span>Commit {index + 1}</span>
                    {group.needsReview ? <>
                      <span role="status">Changes moved or disappeared. Review this group.</span>
                      <Button type="button" size="sm" variant="outline" disabled={editingDisabled || validating || stale || group.changeIds.length === 0} onClick={() => updateGroup(group.id, (current) => ({ ...current, needsReview: false }))}>Mark reviewed</Button>
                    </> : null}
                    <Button type="button" variant="ghost" size="icon-xs" aria-label={`Move commit ${index + 1} up`} disabled={editingDisabled || index === 0} onClick={() => reorderGroup(group.id, -1)}><ArrowUp /></Button>
                    <Button type="button" variant="ghost" size="icon-xs" aria-label={`Move commit ${index + 1} down`} disabled={editingDisabled || index === plan.groups.length - 1} onClick={() => reorderGroup(group.id, 1)}><ArrowDown /></Button>
                    <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove commit group ${index + 1}`} disabled={editingDisabled} onClick={() => deleteGroup(group.id)}><Trash2 /></Button>
                  </div>
                  <div className="commit-plan-files" role="list">
                    {group.changeIds.map((changeId) => {
                      const change = changeById.get(changeId);
                      if (!change) return null;
                      const file = fileByPath.get(change.path);
                      return <div className={`commit-plan-file ${selectedPath === change.path ? "is-selected" : ""}`} role="listitem" key={change.id}>
                        <input type="checkbox" aria-label={`Include ${changeDescription(change)} in this commit`} checked={includedChangeIds.has(change.id)} disabled={editingDisabled || stale || validating} onChange={(event) => setIncludedChangeIds((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(change.id); else next.delete(change.id);
                          return next;
                        })} />
                        <CommitPlanChangeDetails change={change} file={file} onSelect={file ? () => onSelectFile(file) : undefined} />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-xs" aria-label={`Move ${changeDescription(change)} to another group`} disabled={editingDisabled || stale || validating}><span className={`commit-plan-marker commit-plan-marker-${index % 6}`} aria-hidden="true" /><ChevronDown /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {plan.groups.filter((target) => target.id !== group.id).map((target) => <DropdownMenuItem key={target.id} onSelect={() => moveChange(change.id, group.id, target.id)}>{target.message || "Untitled commit"}</DropdownMenuItem>)}
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
    {groups.length > 0 ? <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-xs" aria-label={`Assign ${changeDescription(change)} to a commit`} disabled={disabled}><ChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{groups.map((target) => <DropdownMenuItem key={target.id} onSelect={() => onMove(target.id)}>{target.message || "Untitled commit"}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu> : null}
  </div>;
}

function CommitPlanChangeDetails({ change, file, onSelect }: { change: CommitPlanChange; file: GitStatusFile | undefined; onSelect: (() => void) | undefined }): ReactNode {
  const content = <><span>{baseName(change.path)}</span><small>{change.kind === "hunk" ? change.label : directoryName(change.path)}</small></>;
  return <>
    {file ? <CommitPlanStatusBadge file={file} /> : <Badge variant="outline">?</Badge>}
    {onSelect ? <button type="button" className="commit-plan-file-name" onClick={onSelect}>{content}</button> : <span className="commit-plan-file-name">{content}</span>}
    {change.contextIncomplete ? <Badge variant="outline" title="The AI did not receive the full diff. Review the file before committing.">Limited AI context</Badge> : null}
  </>;
}

function CommitPlanFileDetails({ file, onSelect }: { file: GitStatusFile; onSelect: () => void }): ReactNode {
  return <><CommitPlanStatusBadge file={file} /><button type="button" className="commit-plan-file-name" onClick={onSelect}><span>{baseName(file.path)}</span><small>{directoryName(file.path)}</small></button></>;
}

function CommitPlanStatusBadge({ file }: { file: GitStatusFile }): ReactNode {
  const visuals = getFileStatusVisuals(file, "unstaged");
  return <FileStatusChip visuals={visuals} tooltip={false} />;
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
