import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  const [plan, setPlan] = useState<CommitPlan | null>(null);
  const [includedPaths, setIncludedPaths] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [committingGroupId, setCommittingGroupId] = useState<string | null>(null);
  const fileByPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);
  const availablePaths = useMemo(
    () => files.filter(canUseInCommitPlan).map((file) => file.path),
    [files]
  );
  const blockedByStagedFiles = stagedCount > 0;

  useEffect(() => {
    setPlan(null);
    setIncludedPaths(new Set());
    setError("");
    setGenerating(false);
    setCommittingGroupId(null);
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
    setIncludedPaths(new Set(result.plan.groups.flatMap((group) => group.paths)));
  };

  const updateGroup = (groupId: string, updater: (group: CommitPlanGroup) => CommitPlanGroup): void => {
    setPlan((current) => current ? {
      ...current,
      groups: current.groups.map((group) => group.id === groupId ? updater(group) : group)
    } : current);
  };

  const movePath = (path: string, fromGroupId: string, targetGroupId: string | null): void => {
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
    const message = group.message.trim();
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

      <div className="commit-plan-scroll">
        {!plan ? (
          <div className="commit-plan-empty">
            <Sparkles aria-hidden="true" />
            <strong>Create a focused commit plan</strong>
            <span>Githead will inspect the unstaged diffs and suggest groups and commit messages.</span>
          </div>
        ) : plan.groups.length === 0 ? (
          <div className="commit-plan-empty"><strong>All planned groups are committed.</strong></div>
        ) : (
          plan.groups.map((group, index) => (
            <article className="commit-plan-group" key={group.id}>
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
                  const visuals = getFileStatusVisuals(file, "unstaged");
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
                      <button type="button" className="commit-plan-file-name" onClick={() => onSelectFile(file)}>
                        <span>{baseName(path)}</span>
                        <small>{directoryName(path)}</small>
                      </button>
                      <Badge variant="outline" className={`status-chip status-chip-${visuals.tone}`} title={visuals.label}>{visuals.code}</Badge>
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
            </article>
          ))
        )}

        {plan?.unassignedPaths.length ? (
          <section className="commit-plan-unassigned" aria-label="Unassigned files">
            <h3>Unassigned files ({plan.unassignedPaths.length})</h3>
            {plan.unassignedPaths.map((path) => <div key={path}>{path}</div>)}
          </section>
        ) : null}
      </div>
    </section>
  );
}

function canUseInCommitPlan(file: GitStatusFile): boolean {
  return !file.isConflicted && file.submodule?.canStage !== false;
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function directoryName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}
