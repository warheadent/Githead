import { Bot, CircleAlert, GitCommitHorizontal, Loader2, RefreshCw, Save } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
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
import type {
  CoordinatedRequest,
  GitIdentitySaveRequest,
  GitIdentitySettings,
  RepositoryAiSettings,
  RepositorySyncSettings
} from "../shared/types";
import { AI_COMMIT_MESSAGE_PROVIDERS } from "../shared/types";
import { DEFAULT_COMMIT_PLAN_GRANULARITY } from "../shared/types";
import { DEFAULT_SOURCE_CONTROL_WRITING_STYLE } from "../shared/sourceControlWritingStyle";
import { AiGenerationSettingsFields, type AiGenerationSettingsDraft } from "./AiGenerationSettingsFields";
import { getAiProviderLabel } from "../shared/aiProvider";
import { GitIdentityFields } from "./GitIdentityFields";
import { LoadingState } from "./LoadingState";
import { SettingsCard, SettingsCategoryLayout, SettingsPanel } from "./SettingsCategoryLayout";

type RepositorySettingsCategory = "git-identity" | "sync" | "ai";

interface RepositorySettingsDraft extends AiGenerationSettingsDraft {
  gitIdentityEnabled: boolean;
  gitIdentityName: string;
  gitIdentityEmail: string;
  syncEnabled: boolean;
  autoFetchIntervalMinutes: string;
  aiEnabled: boolean;
}

const categories = [
  { id: "git-identity", label: "Git Identity", icon: GitCommitHorizontal },
  { id: "sync", label: "Sync", icon: RefreshCw },
  { id: "ai", label: "AI", icon: Bot }
] as const;

const emptyDraft: RepositorySettingsDraft = {
  gitIdentityEnabled: false,
  gitIdentityName: "",
  gitIdentityEmail: "",
  syncEnabled: false,
  autoFetchIntervalMinutes: "10",
  aiEnabled: false,
  selectedProvider: "openrouter",
  commitPlanGranularity: DEFAULT_COMMIT_PLAN_GRANULARITY,
  providerModels: createStringRecord(),
  commitPlanModels: createStringRecord(),
  commitPlanReasoningEfforts: createReasoningRecord(),
  prDescriptionModels: createStringRecord(),
  reasoningEfforts: createReasoningRecord(),
  prDescriptionReasoningEfforts: createReasoningRecord(),
  commitMessagePrompt: "",
  prDescriptionPrompt: "",
  sourceControlWritingStyle: { ...DEFAULT_SOURCE_CONTROL_WRITING_STYLE }
};

export interface RepositorySettingsDialogProps {
  open: boolean;
  repoPath: string;
  onOpenChange: (open: boolean) => void;
  onSaved?: (repoPath: string) => void;
  onSaveGitIdentity?: (request: CoordinatedRequest<GitIdentitySaveRequest>) => Promise<GitIdentitySettings>;
}

export function RepositorySettingsDialog({
  open,
  repoPath,
  onOpenChange,
  onSaved,
  onSaveGitIdentity = (request) => window.githead.saveGitIdentity(request)
}: RepositorySettingsDialogProps): ReactNode {
  const requestIdRef = useRef(0);
  const baselineRef = useRef("");
  const [draft, setDraft] = useState<RepositorySettingsDraft>(emptyDraft);
  const [globalSettings, setGlobalSettings] = useState<{ identity: GitIdentitySettings["global"]; autoFetchIntervalMinutes: number }>({
    identity: { name: "", email: "" },
    autoFetchIntervalMinutes: 10
  });
  const [activeCategory, setActiveCategory] = useState<RepositorySettingsCategory>("git-identity");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const serializedDraft = serializeDraft(draft);
  const dirty = open && baselineRef.current !== "" && serializedDraft !== baselineRef.current;
  const dirtyCategories = getDirtyCategories(baselineRef.current, draft);

  useEffect(() => {
    if (!open || !repoPath) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    baselineRef.current = "";
    setActiveCategory("git-identity");
    setConfirmDiscard(false);
    setLoading(true);
    setError("");
    void Promise.all([
      window.githead.getGitIdentity(repoPath),
      window.githead.getRepositorySyncSettings({ repoPath }),
      window.githead.getRepositoryAiSettings({ repoPath }),
      window.githead.getAppSettings()
    ]).then(([identity, sync, ai, appSettings]) => {
      if (requestIdRef.current !== requestId) return;
      const nextDraft = createDraft(identity, sync, ai);
      baselineRef.current = serializeDraft(nextDraft);
      setDraft(nextDraft);
      setGlobalSettings({
        identity: identity.global,
        autoFetchIntervalMinutes: appSettings.autoFetchIntervalMinutes
      });
    }).catch((loadError: unknown) => {
      if (requestIdRef.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load repository settings.");
      }
    }).finally(() => {
      if (requestIdRef.current === requestId) setLoading(false);
    });
    return () => { requestIdRef.current += 1; };
  }, [open, repoPath]);

  const requestClose = (): void => {
    if (saving) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  };

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (loading || saving || !dirty) return;
    setSaving(true);
    setError("");
    try {
      const dirtyState = getDirtyCategories(baselineRef.current, draft);
      if (dirtyState["git-identity"]) {
        await onSaveGitIdentity({
          repoPath,
          scope: "repository",
          enabled: draft.gitIdentityEnabled,
          name: draft.gitIdentityName,
          email: draft.gitIdentityEmail,
          operationId: createOperationId()
        });
      }
      if (dirtyState.sync) {
        await window.githead.saveRepositorySyncSettings({
          repoPath,
          enabled: draft.syncEnabled,
          autoFetchIntervalMinutes: parseInterval(draft.autoFetchIntervalMinutes)
        });
      }
      if (dirtyState.ai) {
        await window.githead.saveRepositoryAiSettings({
          repoPath,
          enabled: draft.aiEnabled,
          selectedProvider: draft.selectedProvider,
          commitPlanGranularity: draft.commitPlanGranularity,
          providerModels: draft.providerModels,
          commitPlanModels: draft.commitPlanModels,
          commitPlanReasoningEfforts: draft.commitPlanReasoningEfforts,
          prDescriptionModels: draft.prDescriptionModels,
          reasoningEfforts: draft.reasoningEfforts,
          prDescriptionReasoningEfforts: draft.prDescriptionReasoningEfforts,
          commitMessagePrompt: draft.commitMessagePrompt,
          prDescriptionPrompt: draft.prDescriptionPrompt,
          sourceControlWritingStyle: draft.sourceControlWritingStyle
        });
      }
      baselineRef.current = serializeDraft(draft);
      onSaved?.(repoPath);
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save repository settings.");
    } finally {
      setSaving(false);
    }
  };

  const disabled = loading || saving;
  const automaticFetchEnabled = Number(draft.autoFetchIntervalMinutes) > 0;
  const footerMessage = error
    ? <p className="flex items-center gap-2 text-destructive" role="alert"><CircleAlert className="size-4 shrink-0" aria-hidden="true" /><span>{error}</span></p>
    : <p className="text-muted-foreground">{dirty ? "You have unsaved changes." : "All changes are saved."}</p>;

  return <>
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) requestClose(); }}>
      <DialogContent
        className="h-[min(780px,calc(100vh-2rem))] max-h-[min(780px,calc(100vh-2rem))] overflow-clip p-0 sm:max-w-[880px]"
        aria-busy={disabled}
      >
        <form className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]" onSubmit={(event) => { void save(event); }}>
          <DialogHeader className="border-b px-6 py-5 pr-14">
            <p className="eyebrow">Repository preferences</p>
            <DialogTitle>Repository Settings</DialogTitle>
            <DialogDescription className="grid gap-1">
              <span>Override Githead's global settings for this repository.</span>
              <span className="truncate font-mono text-xs" title={repoPath}>{repoPath}</span>
            </DialogDescription>
          </DialogHeader>

          {loading ? <LoadingState label="Loading repository settings" className="min-h-40" /> : (
            <SettingsCategoryLayout
              activeCategory={activeCategory}
              categories={categories}
              disabled={disabled}
              dirtyCategories={dirtyCategories}
              errorCategories={{ [activeCategory]: Boolean(error) }}
              onCategoryChange={setActiveCategory}
            >
              <SettingsPanel value="git-identity" title="Git Identity" description="Override the global author details for commits in this repository.">
                <OverrideToggle
                  checked={draft.gitIdentityEnabled}
                  disabled={disabled}
                  title="Use repository identity"
                  description="When off, commits use the global Git identity."
                  onChange={(gitIdentityEnabled) => setDraft({ ...draft, gitIdentityEnabled })}
                />
                <SettingsCard
                  title="Repository identity"
                  description={formatGlobalIdentity(globalSettings.identity)}
                >
                  <GitIdentityFields
                    idPrefix="repository-git-identity"
                    name={draft.gitIdentityName}
                    email={draft.gitIdentityEmail}
                    showScope={false}
                    disabled={disabled || !draft.gitIdentityEnabled}
                    error={activeCategory === "git-identity" ? error : ""}
                    onChange={(patch) => setDraft({
                      ...draft,
                      ...(patch.name !== undefined ? { gitIdentityName: patch.name } : {}),
                      ...(patch.email !== undefined ? { gitIdentityEmail: patch.email } : {})
                    })}
                  />
                </SettingsCard>
              </SettingsPanel>

              <SettingsPanel value="sync" title="Sync" description="Choose how often this repository fetches remote changes.">
                <OverrideToggle
                  checked={draft.syncEnabled}
                  disabled={disabled}
                  title="Use repository sync settings"
                  description={`When off, this repository uses the global ${formatInterval(globalSettings.autoFetchIntervalMinutes)} setting.`}
                  onChange={(syncEnabled) => setDraft({ ...draft, syncEnabled })}
                />
                <SettingsCard title="Automatic fetch" description="Fetch remote updates in the background while Githead is open.">
                  <fieldset className="grid max-w-xl gap-4" disabled={disabled || !draft.syncEnabled}>
                    <Label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={automaticFetchEnabled}
                        onChange={(event) => setDraft({
                          ...draft,
                          autoFetchIntervalMinutes: event.target.checked
                            ? String(globalSettings.autoFetchIntervalMinutes > 0 ? globalSettings.autoFetchIntervalMinutes : 10)
                            : "0"
                        })}
                      />
                      Automatically fetch changes
                    </Label>
                    <div className="grid gap-2">
                      <Label htmlFor="repository-auto-fetch-interval">Auto-fetch interval</Label>
                      <Input
                        id="repository-auto-fetch-interval"
                        type="number"
                        min={1}
                        max={1440}
                        step={1}
                        value={automaticFetchEnabled ? draft.autoFetchIntervalMinutes : ""}
                        placeholder="10"
                        disabled={disabled || !draft.syncEnabled || !automaticFetchEnabled}
                        onChange={(event) => setDraft({ ...draft, autoFetchIntervalMinutes: event.target.value })}
                      />
                      <p className="text-sm text-muted-foreground">Minutes between automatic fetches.</p>
                    </div>
                  </fieldset>
                </SettingsCard>
              </SettingsPanel>

              <SettingsPanel value="ai" title="AI" description="Override generation settings for this repository.">
                <OverrideToggle
                  checked={draft.aiEnabled}
                  disabled={disabled}
                  title="Use repository AI settings"
                  description="When off, this repository uses the global AI settings."
                  onChange={(aiEnabled) => setDraft({ ...draft, aiEnabled })}
                />
                <fieldset className="grid max-w-2xl gap-4" disabled={disabled || !draft.aiEnabled}>
                  <SettingsCard title="Provider" description="Choose the provider and model settings for this repository.">
                    <div className="grid gap-2">
                      <Label htmlFor="repository-ai-provider">Provider</Label>
                      <select
                        id="repository-ai-provider"
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={draft.selectedProvider}
                        onChange={(event) => setDraft({ ...draft, selectedProvider: event.target.value as RepositorySettingsDraft["selectedProvider"] })}
                      >
                        {AI_COMMIT_MESSAGE_PROVIDERS.map((provider) => <option key={provider} value={provider}>{getAiProviderLabel(provider)}</option>)}
                      </select>
                      <p className="text-sm text-muted-foreground">API keys and CLI authentication remain in the global settings.</p>
                    </div>
                  </SettingsCard>
                  <AiGenerationSettingsFields draft={draft} disabled={disabled || !draft.aiEnabled} enabled={open && draft.aiEnabled} idPrefix="repository-ai" onDraftChange={setDraft} />
                </fieldset>
              </SettingsPanel>
            </SettingsCategoryLayout>
          )}

          <div className="flex min-h-16 flex-col gap-3 border-t bg-background px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-5 min-w-0 text-sm">{footerMessage}</div>
            <DialogFooter className="shrink-0">
              <Button type="button" variant="outline" disabled={saving} onClick={requestClose}>Cancel</Button>
              <Button type="submit" disabled={disabled || !dirty}>{saving ? <Loader2 className="animate-spin" /> : <Save />}{saving ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader><DialogTitle>Discard repository settings?</DialogTitle><DialogDescription>Your unsaved repository overrides will be lost.</DialogDescription></DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
          <Button type="button" variant="destructive" onClick={() => { setConfirmDiscard(false); onOpenChange(false); }}>Discard changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function OverrideToggle({
  checked,
  disabled,
  title,
  description,
  onChange
}: {
  checked: boolean;
  disabled: boolean;
  title: string;
  description: string;
  onChange: (checked: boolean) => void;
}): ReactNode {
  return <label className="flex items-start gap-3 rounded-lg border bg-card p-4">
    <input className="mt-1 size-4 shrink-0" type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    <span><span className="block text-sm font-semibold">{title}</span><span className="block text-sm text-muted-foreground">{description}</span></span>
  </label>;
}

function createDraft(
  identity: GitIdentitySettings,
  sync: RepositorySyncSettings,
  ai: RepositoryAiSettings
): RepositorySettingsDraft {
  return {
    gitIdentityEnabled: identity.repositoryOverrideEnabled,
    gitIdentityName: identity.repository.name,
    gitIdentityEmail: identity.repository.email,
    syncEnabled: sync.enabled,
    autoFetchIntervalMinutes: String(sync.autoFetchIntervalMinutes),
    aiEnabled: ai.enabled,
    selectedProvider: ai.settings.selectedProvider,
    commitPlanGranularity: ai.settings.commitPlanGranularity,
    providerModels: mapProviders((provider) => ai.settings.providers[provider].model),
    commitPlanModels: mapProviders((provider) => ai.settings.providers[provider].commitPlanModel ?? ""),
    commitPlanReasoningEfforts: mapProviders((provider) => ai.settings.providers[provider].commitPlanReasoningEffort),
    prDescriptionModels: mapProviders((provider) => ai.settings.providers[provider].prDescriptionModel),
    reasoningEfforts: mapProviders((provider) => ai.settings.providers[provider].reasoningEffort),
    prDescriptionReasoningEfforts: mapProviders((provider) => ai.settings.providers[provider].prDescriptionReasoningEffort),
    commitMessagePrompt: ai.settings.commitMessagePrompt,
    prDescriptionPrompt: ai.settings.prDescriptionPrompt,
    sourceControlWritingStyle: ai.settings.sourceControlWritingStyle
  };
}

function getDirtyCategories(baseline: string, draft: RepositorySettingsDraft): Record<RepositorySettingsCategory, boolean> {
  if (!baseline) return { "git-identity": false, sync: false, ai: false };
  try {
    const saved = JSON.parse(baseline) as RepositorySettingsDraft;
    return {
      "git-identity": saved.gitIdentityEnabled !== draft.gitIdentityEnabled
        || saved.gitIdentityName !== draft.gitIdentityName
        || saved.gitIdentityEmail !== draft.gitIdentityEmail,
      sync: saved.syncEnabled !== draft.syncEnabled
        || saved.autoFetchIntervalMinutes !== draft.autoFetchIntervalMinutes,
      ai: serializeAiSettings(saved) !== serializeAiSettings(draft)
    };
  } catch {
    return { "git-identity": false, sync: false, ai: false };
  }
}

function serializeDraft(draft: RepositorySettingsDraft): string {
  return JSON.stringify(draft);
}

function serializeAiSettings(draft: RepositorySettingsDraft): string {
  const { gitIdentityEnabled: _identityEnabled, gitIdentityName: _name, gitIdentityEmail: _email, syncEnabled: _syncEnabled, autoFetchIntervalMinutes: _interval, ...ai } = draft;
  return JSON.stringify(ai);
}

function parseInterval(value: string): number {
  const parsed = Number(value.trim());
  if (!value.trim()) throw new Error("Enter an auto-fetch interval.");
  if (!Number.isInteger(parsed)) throw new Error("Auto-fetch interval must be a whole number of minutes.");
  if (parsed < 0) throw new Error("Auto-fetch interval cannot be negative.");
  if (parsed > 1440) throw new Error("Auto-fetch interval cannot exceed 1440 minutes.");
  return parsed;
}

function formatGlobalIdentity(identity: GitIdentitySettings["global"]): string {
  if (identity.name && identity.email) return `Global default: ${identity.name} <${identity.email}>`;
  return "The global identity is not fully configured.";
}

function formatInterval(interval: number): string {
  return interval === 0 ? "automatic fetch off" : `${interval}-minute auto-fetch`;
}

function createOperationId(): string {
  const uniquePart = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `repository-settings-${uniquePart}`;
}

function mapProviders<T>(getValue: (provider: typeof AI_COMMIT_MESSAGE_PROVIDERS[number]) => T): Record<typeof AI_COMMIT_MESSAGE_PROVIDERS[number], T> {
  return AI_COMMIT_MESSAGE_PROVIDERS.reduce((result, provider) => { result[provider] = getValue(provider); return result; }, {} as Record<typeof AI_COMMIT_MESSAGE_PROVIDERS[number], T>);
}

function createStringRecord(): RepositorySettingsDraft["providerModels"] {
  return mapProviders(() => "");
}

function createReasoningRecord(): RepositorySettingsDraft["reasoningEfforts"] {
  return mapProviders(() => "low");
}
