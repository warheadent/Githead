import {
  Bot,
  CheckCircle2,
  CircleAlert,
  Gauge,
  GitFork,
  GitCommitHorizontal,
  ExternalLink,
  Loader2,
  Monitor,
  Moon,
  Palette,
  Plug,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sun
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
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
  AiApiKeyProvider,
  AiCommitMessageProvider,
  AiReasoningEffort,
  AiSettings,
  AppAppearanceMode,
  AppCodeFont,
  AppColorTheme,
  AppUiFont,
  CommitPlanGranularity,
  GitIdentityScope,
  GitHubConnectionStatus,
  GitHubDeviceFlow,
  GitHubRepository,
  RemoteCheckLeaseSeconds,
  SourceControlWritingStyle,
  TagPushBehavior
} from "../shared/types";
import { AI_COMMIT_MESSAGE_PROVIDERS, APP_ZOOM_FACTORS, REMOTE_CHECK_LEASE_SECONDS } from "../shared/types";
import { COLOR_THEME_OPTIONS } from "./themes";
import { CODE_FONT_OPTIONS, UI_FONT_OPTIONS, type FontOption } from "./fonts";
import { getAiProviderLabel, getCliStatusMessage, isCliProvider } from "./aiProvider";
import { GitIdentityFields } from "./GitIdentityFields";
import { AiGenerationSettingsFields } from "./AiGenerationSettingsFields";
import { MotionSwap } from "./motion";
import { SettingsCard, SettingsCategoryLayout, SettingsPanel } from "./SettingsCategoryLayout";
export { GitIdentityFields } from "./GitIdentityFields";

export interface SettingsDraft {
  selectedProvider: AiCommitMessageProvider;
  commitPlanGranularity: CommitPlanGranularity;
  providerModels: Record<AiCommitMessageProvider, string>;
  commitPlanModels: Record<AiCommitMessageProvider, string>;
  commitPlanReasoningEfforts: Record<AiCommitMessageProvider, AiReasoningEffort>;
  prDescriptionModels: Record<AiCommitMessageProvider, string>;
  reasoningEfforts: Record<AiCommitMessageProvider, AiReasoningEffort>;
  prDescriptionReasoningEfforts: Record<AiCommitMessageProvider, AiReasoningEffort>;
  apiKeys: Partial<Record<AiApiKeyProvider, string>>;
  clearApiKeys: Partial<Record<AiApiKeyProvider, boolean>>;
  commitMessagePrompt: string;
  prDescriptionPrompt: string;
  sourceControlWritingStyle: SourceControlWritingStyle;
  autoFetchIntervalMinutes: string;
  colorTheme: AppColorTheme;
  appearanceMode: AppAppearanceMode;
  uiFont: AppUiFont;
  codeFont: AppCodeFont;
  zoomFactor: number;
  tagPushBehavior: TagPushBehavior;
  requireUpToDateUpstreamBeforeCommit: boolean;
  remoteCheckLeaseSeconds: RemoteCheckLeaseSeconds;
  allowCherryPickingContainedCommits: boolean;
  shareAnonymousDiagnostics: boolean;
  gitIdentityName: string;
  gitIdentityEmail: string;
  gitIdentityScope: GitIdentityScope;
}

export type SettingsCategory = "appearance" | "git-identity" | "git-behaviors" | "sync" | "integrations" | "ai" | "privacy" | "diagnostics";

const categories = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "git-identity", label: "Git Identity", icon: GitCommitHorizontal },
  { id: "git-behaviors", label: "Git Behaviors", icon: SlidersHorizontal },
  { id: "sync", label: "Sync", icon: RefreshCw },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "ai", label: "AI", icon: Bot },
  { id: "privacy", label: "Privacy", icon: ShieldCheck },
  { id: "diagnostics", label: "Diagnostics", icon: Gauge }
] as const;

const tagPushBehaviorOptions = [
  {
    value: "all",
    label: "Push all local tags (Default)",
    description: "Runs a separate tag push after the branch succeeds. This may publish tags unrelated to the branch being pushed."
  },
  {
    value: "follow",
    label: "Push reachable annotated tags",
    description: "Adds --follow-tags to the branch push. Lightweight tags are not included; only annotated tags reachable from pushed commits are sent."
  },
  {
    value: "none",
    label: "Do not push tags automatically",
    description: "Pushes only the branch or ref requested by you."
  }
] as const satisfies readonly {
  value: TagPushBehavior;
  label: string;
  description: string;
}[];

const remoteCheckLeaseOptions: ReadonlyArray<{ value: RemoteCheckLeaseSeconds; label: string }> = [
  { value: 0, label: "Always fetch" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 120, label: "2 minutes (Default)" },
  { value: 300, label: "5 minutes" },
  { value: 600, label: "10 minutes" }
];

export interface SettingsDialogProps {
  open: boolean;
  draft: SettingsDraft;
  aiSettings: AiSettings | null;
  saving: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: SettingsDraft) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onOpenPerformanceDiagnostics: () => void;
  initialCategory?: SettingsCategory;
  githubConnection?: GitHubConnectionStatus | null;
  githubConnectionLoading?: boolean;
  githubConnecting?: boolean;
  githubDeviceFlow?: GitHubDeviceFlow | null;
  githubConnectionError?: string;
  githubRepository?: GitHubRepository | null;
  onConnectGitHub?: () => void;
  onDisconnectGitHub?: () => void;
  onRetryGitHubConnection?: () => void;
  onReviewGitHubAccess?: () => void;
  onManageRemotes?: () => void;
  onOpenGitHubRepository?: () => void;
}

export function SettingsDialog({
  open,
  draft,
  aiSettings,
  saving,
  error,
  onOpenChange,
  onDraftChange,
  onSave,
  onOpenPerformanceDiagnostics,
  initialCategory = "git-identity",
  githubConnection = null,
  githubConnectionLoading = false,
  githubConnecting = false,
  githubDeviceFlow = null,
  githubConnectionError = "",
  githubRepository = null,
  onConnectGitHub = () => undefined,
  onDisconnectGitHub = () => undefined,
  onRetryGitHubConnection = () => undefined,
  onReviewGitHubAccess = () => undefined,
  onManageRemotes = () => undefined,
  onOpenGitHubRepository = () => undefined
}: SettingsDialogProps): ReactNode {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("git-identity");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const baselineRef = useRef("");
  const wasOpenRef = useRef(false);
  const serializedDraft = serializeSettingsDraft(draft);
  const dirty = open && baselineRef.current !== "" && serializedDraft !== baselineRef.current;
  const dirtyCategories = getDirtyCategories(baselineRef.current, draft);
  const provider = draft.selectedProvider;
  const selectedTagPushBehavior = tagPushBehaviorOptions.find((option) => option.value === draft.tagPushBehavior) ?? tagPushBehaviorOptions[0];
  const footerStatus = error ? {
    key: "error",
    content: <p id="settings-git-identity-error" className="flex items-center gap-2 text-destructive" role="alert"><CircleAlert className="size-4 shrink-0" aria-hidden="true" /><span>{error}</span></p>
  } : dirty ? {
    key: "dirty",
    content: <p className="text-muted-foreground" role="status">You have unsaved changes.</p>
  } : {
    key: "saved",
    content: <p className="text-muted-foreground">All changes are saved.</p>
  };

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      baselineRef.current = serializeSettingsDraft(draft);
      setActiveCategory(initialCategory);
      setConfirmDiscard(false);
    }
    wasOpenRef.current = open;
  }, [draft, initialCategory, open]);

  const requestClose = (): void => {
    if (saving) {
      onOpenChange(false);
      return;
    }
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => {
        if (!nextOpen) requestClose();
      }}>
        <DialogContent
          className="settings-dialog h-[min(780px,calc(100vh-2rem))] max-h-[min(780px,calc(100vh-2rem))] overflow-clip p-0 sm:max-w-[880px]"
          aria-busy={saving}
        >
          <form className="settings-dialog-form grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]" onSubmit={(event) => {
            if (saving) {
              event.preventDefault();
              return;
            }
            onSave(event);
          }}>
            <DialogHeader className="settings-dialog-header border-b px-6 py-5 pr-14">
              <p className="eyebrow">Preferences</p>
              <DialogTitle>Settings</DialogTitle>
              <DialogDescription>Configure Githead for the way you work.</DialogDescription>
            </DialogHeader>

            <SettingsCategoryLayout
              activeCategory={activeCategory}
              categories={categories}
              disabled={saving}
              dirtyCategories={dirtyCategories}
              errorCategories={{ "git-identity": Boolean(error) }}
              onCategoryChange={setActiveCategory}
            >
                <SettingsPanel value="appearance" title="Appearance" description="Personalize Githead's look and interface scale.">
                  <AppearanceSettings draft={draft} saving={saving} onDraftChange={onDraftChange} />
                </SettingsPanel>
                <SettingsPanel value="git-identity" title="Git Identity" description="Set the default author details Git uses for commits.">
                  <SettingsCard title="Global identity">
                    <GitIdentityFields
                      idPrefix="settings-git-identity"
                      name={draft.gitIdentityName}
                      email={draft.gitIdentityEmail}
                      scope="global"
                      showScope={false}
                      disabled={saving}
                      error={error}
                      onChange={(patch) => onDraftChange({
                        ...draft,
                        ...(patch.name !== undefined ? { gitIdentityName: patch.name } : {}),
                        ...(patch.email !== undefined ? { gitIdentityEmail: patch.email } : {})
                      })}
                    />
                    <p className="text-sm text-muted-foreground">Repository overrides are available from a repository's context menu.</p>
                  </SettingsCard>
                </SettingsPanel>
                <SettingsPanel value="git-behaviors" title="Git Behaviors" description="Choose how Githead handles Git operations by default.">
                  <SettingsCard title="Commit" description="Control the network safety check used by commit operations.">
                    <div className="flex max-w-2xl items-start gap-3 rounded-md border p-3">
                      <input
                        id="require-up-to-date-upstream-before-commit"
                        type="checkbox"
                        className="mt-1 shrink-0"
                        checked={draft.requireUpToDateUpstreamBeforeCommit}
                        disabled={saving}
                        onChange={(event) => onDraftChange({
                          ...draft,
                          requireUpToDateUpstreamBeforeCommit: event.currentTarget.checked
                        })}
                      />
                      <span>
                        <Label htmlFor="require-up-to-date-upstream-before-commit">Check the upstream before committing</Label>
                        <span className="mt-1 block text-sm font-normal normal-case text-muted-foreground">
                          Fetch the tracked remote and stop before creating a commit when the remote is ahead or has diverged. Branches without a remote upstream can still commit locally.
                        </span>
                      </span>
                    </div>
                    <div className="grid max-w-2xl gap-2">
                      <Label htmlFor="remote-check-lease-seconds">Reuse a remote check for</Label>
                      <select
                        id="remote-check-lease-seconds"
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                        value={draft.remoteCheckLeaseSeconds}
                        disabled={saving}
                        onChange={(event) => {
                          const value = Number(event.currentTarget.value);
                          if (REMOTE_CHECK_LEASE_SECONDS.includes(value as RemoteCheckLeaseSeconds)) {
                            onDraftChange({ ...draft, remoteCheckLeaseSeconds: value as RemoteCheckLeaseSeconds });
                          }
                        }}
                      >
                        {remoteCheckLeaseOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Commit Plan checks while generating. Other protected commits reuse that result until this time ends, while still validating the branch and fetched upstream locally.
                      </p>
                    </div>
                  </SettingsCard>
                  <SettingsCard title="Push" description="Control what happens to tags after an ordinary branch push, targeted push, or branch publish.">
                    <div className="grid max-w-2xl gap-2">
                      <Label htmlFor="tag-push-behavior">Tag push behavior</Label>
                      <select
                        id="tag-push-behavior"
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                        value={draft.tagPushBehavior}
                        disabled={saving}
                        aria-describedby="tag-push-behavior-description tag-push-behavior-help"
                        onChange={(event) => onDraftChange({ ...draft, tagPushBehavior: event.currentTarget.value as TagPushBehavior })}
                      >
                        {tagPushBehaviorOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <p id="tag-push-behavior-description" className="text-xs leading-relaxed text-muted-foreground">
                        {selectedTagPushBehavior.description}
                      </p>
                      {draft.tagPushBehavior === "all" ? (
                        <p className="flex items-start gap-2 rounded-md border bg-muted/30 p-2.5 text-xs leading-relaxed" role="note">
                          <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span>After a branch push succeeds, Githead also pushes every local tag to the same remote.</span>
                        </p>
                      ) : null}
                      <p id="tag-push-behavior-help" className="text-xs text-muted-foreground">This setting does not affect manually creating, pushing, or deleting an individual tag.</p>
                    </div>
                  </SettingsCard>
                  <SettingsCard title="Cherry-pick" description="Control whether Githead offers unusual cherry-pick workflows.">
                    <div className="flex max-w-2xl items-start gap-3 rounded-md border p-3">
                      <input
                        id="allow-contained-cherry-pick"
                        type="checkbox"
                        className="mt-1 shrink-0"
                        checked={draft.allowCherryPickingContainedCommits}
                        disabled={saving}
                        onChange={(event) => onDraftChange({
                          ...draft,
                          allowCherryPickingContainedCommits: event.currentTarget.checked
                        })}
                      />
                      <span>
                        <Label htmlFor="allow-contained-cherry-pick">Allow commits already contained in the current branch</Label>
                        <span className="mt-1 block text-sm font-normal normal-case text-muted-foreground">
                          Useful for reapplying reverted changes. Git may stop on an empty cherry-pick if the changes already exist.
                        </span>
                      </span>
                    </div>
                  </SettingsCard>
                </SettingsPanel>
                <SettingsPanel value="sync" title="Sync" description="Control automatic remote fetches while Githead is open.">
                  <SettingsCard title="Global auto-fetch" description="The default schedule for repositories without an override.">
                    <div className="grid max-w-xl gap-2">
                      <Label htmlFor="auto-fetch-interval">Auto-fetch interval</Label>
                      <Input id="auto-fetch-interval" type="number" min={0} max={1440} step={1} value={draft.autoFetchIntervalMinutes} disabled={saving} onChange={(event) => onDraftChange({ ...draft, autoFetchIntervalMinutes: event.target.value })} />
                      <p className="text-sm text-muted-foreground">Minutes between fetches. The default is 10 minutes; use 0 to turn automatic fetch off.</p>
                    </div>
                  </SettingsCard>
                </SettingsPanel>
                <SettingsPanel value="integrations" title="Integrations" description="Connect external services used by Githead.">
                  <GitHubIntegrationSettings
                    connection={githubConnection}
                    loading={githubConnectionLoading}
                    connecting={githubConnecting}
                    deviceFlow={githubDeviceFlow}
                    error={githubConnectionError}
                    repository={githubRepository}
                    disabled={saving}
                    onConnect={onConnectGitHub}
                    onDisconnect={onDisconnectGitHub}
                    onRetry={onRetryGitHubConnection}
                    onReviewAccess={onReviewGitHubAccess}
                    onManageRemotes={onManageRemotes}
                    onOpenRepository={onOpenGitHubRepository}
                  />
                </SettingsPanel>
                <SettingsPanel value="ai" title="AI" description="Configure providers and instructions for generated Git content.">
                  <div className="grid max-w-2xl gap-4">
                    <SettingsCard title="Provider" description="Connection and model used for AI generation.">
                      <div className="grid gap-2">
                        <Label htmlFor="ai-provider">Provider</Label>
                        <select id="ai-provider" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={draft.selectedProvider} disabled={saving} onChange={(event) => onDraftChange({ ...draft, selectedProvider: event.target.value as AiCommitMessageProvider })}>
                          {AI_COMMIT_MESSAGE_PROVIDERS.map((item) => <option key={item} value={item}>{getAiProviderLabel(item)}</option>)}
                        </select>
                      </div>
                      {isCliProvider(provider) ? (
                        <div className="grid gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                          <div className="flex items-center justify-between gap-3"><span className="font-medium">{getAiProviderLabel(provider)} status</span><Badge variant={provider === "codex-cli" ? "secondary" : "outline"}>CLI</Badge></div>
                          <p className="text-muted-foreground">{getCliStatusMessage(aiSettings, provider)}</p>
                        </div>
                      ) : (
                        <div className="grid gap-2">
                          <Label htmlFor="ai-api-key">{getAiProviderLabel(provider)} API Key</Label>
                          <Input id="ai-api-key" type="password" autoComplete="off" placeholder="Leave blank to keep existing key" value={draft.apiKeys[provider] ?? ""} disabled={saving} onChange={(event) => onDraftChange({ ...draft, apiKeys: { ...draft.apiKeys, [provider]: event.target.value }, clearApiKeys: { ...draft.clearApiKeys, [provider]: false } })} />
                        </div>
                      )}
                    </SettingsCard>

                    <AiGenerationSettingsFields draft={draft} disabled={saving} enabled={open} idPrefix="ai" onDraftChange={onDraftChange} />
                  </div>
                </SettingsPanel>
                <SettingsPanel value="privacy" title="Privacy" description="Control diagnostic data Githead sends outside this device.">
                  <SettingsCard title="Diagnostics and usage" description="Choose whether to help improve Githead by sharing anonymous diagnostic data.">
                    <div className="flex max-w-2xl items-start gap-3 rounded-md border p-3">
                      <input
                        id="share-anonymous-diagnostics"
                        type="checkbox"
                        className="mt-1 shrink-0"
                        checked={draft.shareAnonymousDiagnostics}
                        disabled={saving}
                        onChange={(event) => onDraftChange({
                          ...draft,
                          shareAnonymousDiagnostics: event.currentTarget.checked
                        })}
                      />
                      <span>
                        <Label htmlFor="share-anonymous-diagnostics">Share anonymous diagnostics</Label>
                        <span className="mt-1 block text-sm font-normal normal-case text-muted-foreground">
                          Send bounded error reports, operation outcomes, and related diagnostic breadcrumbs to Sentry. Turn this off to stop Githead analytics and tracking.
                        </span>
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Performance diagnostics remain available on demand and stay on this device.
                    </p>
                  </SettingsCard>
                </SettingsPanel>
                <SettingsPanel value="diagnostics" title="Diagnostics" description="Inspect bounded performance metrics on demand.">
                  <SettingsCard title="Performance diagnostics" description="Githead collects numeric process, command, and refresh summaries only while the diagnostics dialog is open.">
                    <div>
                      <Button type="button" variant="outline" disabled={saving} onClick={onOpenPerformanceDiagnostics}>
                        <Gauge aria-hidden="true" />
                        Open performance diagnostics
                      </Button>
                    </div>
                  </SettingsCard>
                </SettingsPanel>
            </SettingsCategoryLayout>

            <div className="settings-dialog-footer flex min-h-16 flex-col gap-3 border-t bg-background px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
              <MotionSwap
                item={footerStatus}
                className="relative min-h-5 min-w-0 text-sm"
                presenceClassName=""
                initialY={-2}
              />
              <DialogFooter className="settings-dialog-actions shrink-0">
                <Button type="button" variant="outline" onClick={requestClose}>{saving ? "Cancel operation" : "Cancel"}</Button>
                <Button type="submit" disabled={saving || !dirty}>{saving ? <Loader2 className="animate-spin" /> : <Save />}{saving ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader><DialogTitle>Discard unsaved settings?</DialogTitle><DialogDescription>Your changes, including appearance previews, will be restored to their saved values.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
            <Button type="button" variant="destructive" onClick={() => { setConfirmDiscard(false); onOpenChange(false); }}>Discard changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AppearanceSettings({ draft, saving, onDraftChange }: { draft: SettingsDraft; saving: boolean; onDraftChange: (draft: SettingsDraft) => void }): ReactNode {
  return <div className="grid max-w-2xl gap-5">
    <fieldset className="appearance-mode-picker" disabled={saving}><legend>Appearance</legend><div className="appearance-mode-options">{([{ id: "system", label: "System", icon: Monitor }, { id: "light", label: "Light", icon: Sun }, { id: "dark", label: "Dark", icon: Moon }] as const).map(({ id, label, icon: Icon }) => <label key={id}><input className="sr-only" type="radio" name="appearance-mode" value={id} checked={draft.appearanceMode === id} onChange={() => onDraftChange({ ...draft, appearanceMode: id })} /><Icon aria-hidden="true" /><span>{label}</span></label>)}</div></fieldset>
    <div className="interface-scale-setting"><div className="interface-scale-heading"><div><label className="text-sm font-semibold" htmlFor="interface-scale">Interface scale</label><p className="text-sm text-muted-foreground">Resize text and controls throughout Githead.</p></div><output className="interface-scale-value" htmlFor="interface-scale">{formatZoomFactor(draft.zoomFactor)}</output></div><div className="interface-scale-slider-wrap"><div className="interface-scale-notches" aria-hidden="true">{APP_ZOOM_FACTORS.map((factor) => <span key={factor} className={factor === 1 ? "is-default" : undefined} />)}</div><input id="interface-scale" className="interface-scale-slider" type="range" min={0} max={APP_ZOOM_FACTORS.length - 1} step={1} value={Math.max(0, APP_ZOOM_FACTORS.indexOf(draft.zoomFactor as typeof APP_ZOOM_FACTORS[number]))} aria-valuetext={formatZoomFactor(draft.zoomFactor)} disabled={saving} onChange={(event) => { const zoomFactor = APP_ZOOM_FACTORS[Number(event.currentTarget.value)]; if (zoomFactor !== undefined) onDraftChange({ ...draft, zoomFactor }); }} /></div><div className="interface-scale-bounds" aria-hidden="true"><span>75%</span><span className="interface-scale-default">100% Default</span><span>200%</span></div></div>
    <div><h3 className="text-sm font-semibold">Fonts</h3><p className="text-sm text-muted-foreground">Choose separate typefaces for the interface and code-focused content.</p></div>
    <div className="font-setting-grid">
      <FontSetting id="ui-font" label="Interface font" value={draft.uiFont} options={UI_FONT_OPTIONS} sample="Githead Aa 123 — Repository status" disabled={saving} onChange={(uiFont) => onDraftChange({ ...draft, uiFont })} />
      <FontSetting id="code-font" label="Code font" value={draft.codeFont} options={CODE_FONT_OPTIONS} sample="const branch = 'main';  =>  !=" disabled={saving} onChange={(codeFont) => onDraftChange({ ...draft, codeFont })} />
    </div>
    <div><h3 className="text-sm font-semibold">Color theme</h3><p className="text-sm text-muted-foreground">Choose a palette for your selected appearance.</p></div>
    <fieldset className="theme-picker-grid" disabled={saving}><legend className="sr-only">Color theme</legend>{COLOR_THEME_OPTIONS.map((theme) => <label key={theme.id} className="theme-option"><input className="sr-only" type="radio" name="color-theme" value={theme.id} checked={draft.colorTheme === theme.id} onChange={() => onDraftChange({ ...draft, colorTheme: theme.id })} /><span className="theme-option-header"><span className="font-semibold">{theme.name}</span><CheckCircle2 className="theme-option-check" aria-hidden="true" /></span><span className="text-xs text-muted-foreground">{theme.description}</span><span className="theme-swatches" aria-hidden="true">{theme.swatches.map((swatch) => <span key={swatch} style={{ backgroundColor: swatch }} />)}</span></label>)}</fieldset>
  </div>;
}

function GitHubIntegrationSettings({
  connection,
  loading,
  connecting,
  deviceFlow,
  error,
  repository,
  disabled,
  onConnect,
  onDisconnect,
  onRetry,
  onReviewAccess,
  onManageRemotes,
  onOpenRepository
}: {
  connection: GitHubConnectionStatus | null;
  loading: boolean;
  connecting: boolean;
  deviceFlow: GitHubDeviceFlow | null;
  error: string;
  repository: GitHubRepository | null;
  disabled: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onRetry: () => void;
  onReviewAccess: () => void;
  onManageRemotes: () => void;
  onOpenRepository: () => void;
}): ReactNode {
  const status = connection?.state ?? "anonymous";
  const requiresConnection = status === "anonymous" || connection?.failure?.kind === "authentication";
  const authenticated = connection?.source !== "anonymous" && !requiresConnection;
  const resetAt = connection?.failure?.retryAfterAt ?? connection?.failure?.rateLimit?.resetAt ?? null;
  return <SettingsCard title="GitHub" description="Use one GitHub account for workflow runs, issues, and pull requests.">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border bg-muted/40"><GitFork className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <p className="font-medium">GitHub Desktop connection</p>
          <p className="text-sm text-muted-foreground">{loading ? "Checking GitHub connection…" : connection?.message ?? "GitHub is not connected."}</p>
        </div>
      </div>
      <Badge variant={status === "authenticated" ? "secondary" : status === "unauthorized" || status === "rateLimited" ? "destructive" : "outline"}>
        {formatGitHubConnectionState(status)}
      </Badge>
    </div>

    <dl className="grid gap-2 rounded-md border bg-muted/20 p-3 text-sm">
      <div className="grid gap-1 sm:grid-cols-[130px_minmax(0,1fr)]"><dt className="text-muted-foreground">Active account</dt><dd className="font-medium">{connection?.accountLogin ? `@${connection.accountLogin}` : authenticated ? "Authenticated account unavailable" : "No account"}</dd></div>
      <div className="grid gap-1 sm:grid-cols-[130px_minmax(0,1fr)]"><dt className="text-muted-foreground">Access</dt><dd className="font-medium">{formatGitHubAccess(connection)}</dd></div>
      <div className="grid gap-1 sm:grid-cols-[130px_minmax(0,1fr)]"><dt className="text-muted-foreground">Credential source</dt><dd className="font-medium">{formatGitHubSource(connection?.source ?? "anonymous")}</dd></div>
    </dl>

    {resetAt ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm" role="status">GitHub expects access to resume {formatResetTime(resetAt)}. Cached results remain visible.</p> : null}
    {error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p> : null}

    {deviceFlow ? <div className="grid gap-3 rounded-md border border-primary/30 bg-primary/5 p-3" role="status">
      <div><p className="text-sm font-medium">Enter this code on GitHub</p><p className="mt-1 font-mono text-2xl font-semibold tracking-[0.2em] selectable-text">{deviceFlow.userCode}</p></div>
      <p className="text-sm text-muted-foreground">Githead is waiting for authorization. This code expires {formatResetTime(deviceFlow.expiresAt)}.</p>
      <Button type="button" variant="outline" className="w-fit" disabled={disabled} onClick={() => void window.githead.openExternalUrl({ url: deviceFlow.verificationUri })}><ExternalLink />Open GitHub</Button>
    </div> : null}

    <div className="flex flex-wrap gap-2">
      {requiresConnection ? <Button type="button" disabled={disabled || connecting} onClick={onConnect}>{connecting ? <Loader2 className="animate-spin" /> : <GitFork />}{connecting ? "Waiting for GitHub…" : "Connect GitHub"}</Button> : null}
      {status === "offline" || status === "rateLimited" || status === "unauthorized" ? <Button type="button" variant="outline" disabled={disabled || loading} onClick={onRetry}><RefreshCw />Retry</Button> : null}
      {status === "unauthorized" || authenticated ? <Button type="button" variant="outline" disabled={disabled} onClick={onReviewAccess}><ExternalLink />Review access</Button> : null}
      <Button type="button" variant="outline" disabled={disabled} onClick={onManageRemotes}>Manage remotes</Button>
      {repository ? <Button type="button" variant="outline" disabled={disabled} onClick={onOpenRepository}><ExternalLink />Open repository</Button> : null}
      {connection?.source === "githubApp" && status !== "anonymous" ? <Button type="button" variant="ghost" disabled={disabled || connecting} onClick={onDisconnect}>Disconnect</Button> : null}
    </div>

    <div className="grid gap-1 text-xs leading-relaxed text-muted-foreground">
      <p>Private repositories require the Githead GitHub App to be installed for that repository.</p>
      <p>Githead requests read access to Actions and Contents, plus read and write access to Pull requests. Creating issues also requires Issues write access; review GitHub App access if GitHub rejects creation.</p>
    </div>
  </SettingsCard>;
}

function formatGitHubConnectionState(state: GitHubConnectionStatus["state"]): string {
  if (state === "authenticated") return "Authenticated";
  if (state === "unauthorized") return "Unauthorized";
  if (state === "rateLimited") return "Rate limited";
  if (state === "offline") return "Offline";
  return "Anonymous";
}

function formatGitHubAccess(connection: GitHubConnectionStatus | null): string {
  if (!connection || connection.state === "anonymous") return "Anonymous public access";
  if (connection.repositoryAccess === "granted") return "Repository access granted";
  if (connection.repositoryAccess === "missing") return "Repository access not granted";
  return formatGitHubConnectionState(connection.state);
}

function formatGitHubSource(source: GitHubConnectionStatus["source"]): string {
  if (source === "githubApp") return "Githead GitHub App";
  if (source === "environment") return "Environment token";
  if (source === "gh") return "GitHub CLI";
  return "None";
}

function formatResetTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function FontSetting<T extends string>({ id, label, value, options, sample, disabled, onChange }: { id: string; label: string; value: T; options: readonly FontOption<T>[]; sample: string; disabled: boolean; onChange: (value: T) => void }): ReactNode {
  const selected = options.find((option) => option.id === value) ?? options[0];
  const helpId = `${id}-help`;
  return <div className="font-setting"><Label htmlFor={id}>{label}</Label><select id={id} className="h-10 rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50" value={value} disabled={disabled} aria-describedby={helpId} onChange={(event) => onChange(event.currentTarget.value as T)}>{options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select><p id={helpId} className="text-xs text-muted-foreground">{selected?.description}</p><div className="font-preview" style={{ fontFamily: selected?.previewFamily }} aria-hidden="true">{sample}</div></div>;
}


function serializeSettingsDraft(draft: SettingsDraft): string { return JSON.stringify(draft); }
function formatZoomFactor(zoomFactor: number): string { return `${Math.round(zoomFactor * 100)}%`; }

function getDirtyCategories(baseline: string, draft: SettingsDraft): Record<SettingsCategory, boolean> {
  if (!baseline) return { appearance: false, "git-identity": false, "git-behaviors": false, sync: false, integrations: false, ai: false, privacy: false, diagnostics: false };
  const saved = JSON.parse(baseline) as SettingsDraft;
  return {
    appearance: saved.colorTheme !== draft.colorTheme || saved.appearanceMode !== draft.appearanceMode || saved.uiFont !== draft.uiFont || saved.codeFont !== draft.codeFont || saved.zoomFactor !== draft.zoomFactor,
    "git-identity": saved.gitIdentityName !== draft.gitIdentityName || saved.gitIdentityEmail !== draft.gitIdentityEmail,
    "git-behaviors": saved.tagPushBehavior !== draft.tagPushBehavior
      || saved.requireUpToDateUpstreamBeforeCommit !== draft.requireUpToDateUpstreamBeforeCommit
      || saved.remoteCheckLeaseSeconds !== draft.remoteCheckLeaseSeconds
      || saved.allowCherryPickingContainedCommits !== draft.allowCherryPickingContainedCommits,
    sync: saved.autoFetchIntervalMinutes !== draft.autoFetchIntervalMinutes,
    integrations: false,
    ai: JSON.stringify({ selectedProvider: saved.selectedProvider, commitPlanGranularity: saved.commitPlanGranularity, providerModels: saved.providerModels, commitPlanModels: saved.commitPlanModels, commitPlanReasoningEfforts: saved.commitPlanReasoningEfforts, prDescriptionModels: saved.prDescriptionModels, reasoningEfforts: saved.reasoningEfforts, prDescriptionReasoningEfforts: saved.prDescriptionReasoningEfforts, apiKeys: saved.apiKeys, clearApiKeys: saved.clearApiKeys, commitMessagePrompt: saved.commitMessagePrompt, prDescriptionPrompt: saved.prDescriptionPrompt, sourceControlWritingStyle: saved.sourceControlWritingStyle }) !== JSON.stringify({ selectedProvider: draft.selectedProvider, commitPlanGranularity: draft.commitPlanGranularity, providerModels: draft.providerModels, commitPlanModels: draft.commitPlanModels, commitPlanReasoningEfforts: draft.commitPlanReasoningEfforts, prDescriptionModels: draft.prDescriptionModels, reasoningEfforts: draft.reasoningEfforts, prDescriptionReasoningEfforts: draft.prDescriptionReasoningEfforts, apiKeys: draft.apiKeys, clearApiKeys: draft.clearApiKeys, commitMessagePrompt: draft.commitMessagePrompt, prDescriptionPrompt: draft.prDescriptionPrompt, sourceControlWritingStyle: draft.sourceControlWritingStyle }),
    privacy: saved.shareAnonymousDiagnostics !== draft.shareAnonymousDiagnostics,
    diagnostics: false
  };
}
