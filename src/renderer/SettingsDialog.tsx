import {
  Bot,
  CheckCircle2,
  CircleAlert,
  GitCommitHorizontal,
  Loader2,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Save,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  AiApiKeyProvider,
  AiCommitMessageProvider,
  AiReasoningCapabilities,
  AiReasoningEffort,
  AiSettings,
  AppAppearanceMode,
  AppColorTheme,
  GitIdentityScope
} from "../shared/types";
import { AI_COMMIT_MESSAGE_PROVIDERS, AI_REASONING_EFFORTS, APP_ZOOM_FACTORS } from "../shared/types";
import { COLOR_THEME_OPTIONS } from "./themes";
import { getAiProviderLabel, getCliStatusMessage, isCliProvider } from "./aiProvider";

export interface SettingsDraft {
  selectedProvider: AiCommitMessageProvider;
  providerModels: Record<AiCommitMessageProvider, string>;
  prDescriptionModels: Record<AiCommitMessageProvider, string>;
  reasoningEfforts: Record<AiCommitMessageProvider, AiReasoningEffort>;
  prDescriptionReasoningEfforts: Record<AiCommitMessageProvider, AiReasoningEffort>;
  apiKeys: Partial<Record<AiApiKeyProvider, string>>;
  clearApiKeys: Partial<Record<AiApiKeyProvider, boolean>>;
  commitMessagePrompt: string;
  prDescriptionPrompt: string;
  autoFetchIntervalMinutes: string;
  colorTheme: AppColorTheme;
  appearanceMode: AppAppearanceMode;
  zoomFactor: number;
  gitIdentityName: string;
  gitIdentityEmail: string;
  gitIdentityScope: GitIdentityScope;
}

type SettingsCategory = "appearance" | "git-identity" | "sync" | "ai";

const categories = [
  { id: "appearance", label: "Appearance", description: "Theme and interface scale", icon: Palette },
  { id: "git-identity", label: "Git Identity", description: "Commit author details", icon: GitCommitHorizontal },
  { id: "sync", label: "Sync", description: "Automatic fetch behavior", icon: RefreshCw },
  { id: "ai", label: "AI", description: "Generation providers and prompts", icon: Bot }
] as const;

export function SettingsDialog({
  open,
  draft,
  aiSettings,
  saving,
  error,
  onOpenChange,
  onDraftChange,
  onSave
}: {
  open: boolean;
  draft: SettingsDraft;
  aiSettings: AiSettings | null;
  saving: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: SettingsDraft) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}): ReactNode {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("git-identity");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const baselineRef = useRef("");
  const wasOpenRef = useRef(false);
  const serializedDraft = serializeSettingsDraft(draft);
  const dirty = open && baselineRef.current !== "" && serializedDraft !== baselineRef.current;
  const dirtyCategories = getDirtyCategories(baselineRef.current, draft);
  const provider = draft.selectedProvider;
  const primaryReasoning = useAiReasoningCapabilities(open, provider, draft.providerModels[provider]);
  const prDescriptionModel = draft.prDescriptionModels[provider].trim();
  const prDescriptionReasoning = useAiReasoningCapabilities(open && Boolean(prDescriptionModel), provider, prDescriptionModel);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      baselineRef.current = serializeSettingsDraft(draft);
      setActiveCategory("git-identity");
      setConfirmDiscard(false);
    }
    wasOpenRef.current = open;
  }, [draft, open]);

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
          className="h-[min(780px,calc(100vh-2rem))] max-h-[min(780px,calc(100vh-2rem))] overflow-clip p-0 sm:max-w-[880px]"
          aria-busy={saving}
        >
          <form className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]" onSubmit={(event) => {
            if (saving) {
              event.preventDefault();
              return;
            }
            onSave(event);
          }}>
            <DialogHeader className="border-b px-6 py-5 pr-14">
              <p className="eyebrow">Preferences</p>
              <DialogTitle>Settings</DialogTitle>
              <DialogDescription>Configure Githead for the way you work.</DialogDescription>
            </DialogHeader>

            <Tabs
              value={activeCategory}
              orientation="vertical"
              onValueChange={(value) => setActiveCategory(value as SettingsCategory)}
              className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-0 md:grid-cols-[240px_minmax(0,1fr)] md:grid-rows-1"
            >
              <div className="border-b p-3 md:border-r md:border-b-0 md:p-4">
                <Label htmlFor="settings-category" className="sr-only">Settings category</Label>
                <select
                  id="settings-category"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm md:hidden"
                  value={activeCategory}
                  disabled={saving}
                  onChange={(event) => setActiveCategory(event.target.value as SettingsCategory)}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.label}</option>
                  ))}
                </select>
                <TabsList aria-label="Settings categories" className="hidden h-auto w-full flex-col items-stretch gap-1 bg-transparent p-0 md:flex">
                  {categories.map(({ id, label, description, icon: Icon }) => (
                    <TabsTrigger
                      key={id}
                      value={id}
                      aria-label={label}
                      className="group h-auto min-h-14 w-full justify-start gap-3 px-3 py-2 text-left data-[state=active]:bg-accent data-[state=active]:shadow-none"
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground group-data-[state=active]:text-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 font-medium">
                          {label}
                          {dirtyCategories[id] ? <span className="size-1.5 rounded-full bg-primary" aria-label="Unsaved changes" /> : null}
                          {error && activeCategory === id ? <CircleAlert className="size-3.5 text-destructive" aria-label="Error" /> : null}
                        </span>
                        <span className="block truncate text-xs font-normal text-muted-foreground">{description}</span>
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <div className="min-h-0 overflow-hidden">
                <SettingsPanel value="appearance" title="Appearance" description="Personalize Githead's look and interface scale.">
                  <AppearanceSettings draft={draft} saving={saving} onDraftChange={onDraftChange} />
                </SettingsPanel>
                <SettingsPanel value="git-identity" title="Git Identity" description="Choose the author details Git uses for commits.">
                  <GitIdentityFields
                    idPrefix="settings-git-identity"
                    name={draft.gitIdentityName}
                    email={draft.gitIdentityEmail}
                    scope={draft.gitIdentityScope}
                    disabled={saving}
                    error={error}
                    onChange={(patch) => onDraftChange({
                      ...draft,
                      ...(patch.name !== undefined ? { gitIdentityName: patch.name } : {}),
                      ...(patch.email !== undefined ? { gitIdentityEmail: patch.email } : {}),
                      ...(patch.scope !== undefined ? { gitIdentityScope: patch.scope } : {})
                    })}
                  />
                </SettingsPanel>
                <SettingsPanel value="sync" title="Sync" description="Control automatic remote fetches while Githead is open.">
                  <div className="grid max-w-xl gap-2">
                    <Label htmlFor="auto-fetch-interval">Auto-fetch interval</Label>
                    <Input id="auto-fetch-interval" type="number" min={0} max={1440} step={1} value={draft.autoFetchIntervalMinutes} disabled={saving} onChange={(event) => onDraftChange({ ...draft, autoFetchIntervalMinutes: event.target.value })} />
                    <p className="text-sm text-muted-foreground">Minutes between fetches. Use 0 to disable automatic fetch.</p>
                  </div>
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

                    <SettingsCard title="Commit generation" description="Model, reasoning, and instructions for commit messages.">
                      <div className="grid gap-2"><Label htmlFor="ai-model">Model</Label><Input id="ai-model" type="text" autoComplete="off" value={draft.providerModels[provider]} disabled={saving} onChange={(event) => onDraftChange({ ...draft, providerModels: { ...draft.providerModels, [provider]: event.target.value } })} /></div>
                      <ReasoningEffortField id="ai-reasoning-effort" label="Reasoning" value={draft.reasoningEfforts[provider]} capabilities={primaryReasoning.capabilities} loading={primaryReasoning.loading} disabled={saving} onChange={(reasoningEffort) => onDraftChange({ ...draft, reasoningEfforts: { ...draft.reasoningEfforts, [provider]: reasoningEffort } })} />
                      <div className="grid gap-2"><Label htmlFor="ai-commit-message-prompt">Commit Message Prompt</Label><Textarea id="ai-commit-message-prompt" className="min-h-44 resize-y field-sizing-fixed" rows={7} value={draft.commitMessagePrompt} disabled={saving} onChange={(event) => onDraftChange({ ...draft, commitMessagePrompt: event.target.value })} /></div>
                    </SettingsCard>

                    <SettingsCard title="Pull request generation" description="Optional model override and instructions for pull request descriptions.">
                      <div className="grid gap-2"><Label htmlFor="ai-pr-description-model">PR Description Model</Label><Input id="ai-pr-description-model" type="text" autoComplete="off" placeholder="Leave blank to use the commit message model" value={draft.prDescriptionModels[provider]} disabled={saving} onChange={(event) => onDraftChange({ ...draft, prDescriptionModels: { ...draft.prDescriptionModels, [provider]: event.target.value } })} /></div>
                      {prDescriptionModel ? <ReasoningEffortField id="ai-pr-description-reasoning-effort" label="PR Description Reasoning" value={draft.prDescriptionReasoningEfforts[provider]} capabilities={prDescriptionReasoning.capabilities} loading={prDescriptionReasoning.loading} disabled={saving} onChange={(reasoningEffort) => onDraftChange({ ...draft, prDescriptionReasoningEfforts: { ...draft.prDescriptionReasoningEfforts, [provider]: reasoningEffort } })} /> : <p className="text-sm text-muted-foreground">PR descriptions inherit the primary model and reasoning setting.</p>}
                      <div className="grid gap-2"><Label htmlFor="ai-pr-description-prompt">PR Description Prompt</Label><Textarea id="ai-pr-description-prompt" className="min-h-44 resize-y field-sizing-fixed" rows={7} value={draft.prDescriptionPrompt} disabled={saving} onChange={(event) => onDraftChange({ ...draft, prDescriptionPrompt: event.target.value })} /></div>
                    </SettingsCard>
                  </div>
                </SettingsPanel>
              </div>
            </Tabs>

            <div className="flex min-h-16 flex-col gap-3 border-t bg-background px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm">
                {error ? <p id="settings-git-identity-error" className="flex items-center gap-2 text-destructive" role="alert"><CircleAlert className="size-4 shrink-0" aria-hidden="true" /><span>{error}</span></p> : dirty ? <p className="text-muted-foreground" role="status">You have unsaved changes.</p> : <p className="text-muted-foreground">All changes are saved.</p>}
              </div>
              <DialogFooter className="shrink-0">
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

function SettingsPanel({ value, title, description, children }: { value: SettingsCategory; title: string; description: string; children: ReactNode }): ReactNode {
  return <TabsContent value={value} className="m-0 h-full min-h-0 overflow-y-auto"><section className="grid gap-5 px-5 py-5 sm:px-6"><div><h2 className="text-base font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div>{children}</section></TabsContent>;
}

function SettingsCard({ title, description, children }: { title: string; description: string; children: ReactNode }): ReactNode {
  return <section className="grid gap-4 rounded-lg border bg-card p-4"><div><h3 className="text-sm font-semibold">{title}</h3><p className="text-sm text-muted-foreground">{description}</p></div>{children}</section>;
}

function AppearanceSettings({ draft, saving, onDraftChange }: { draft: SettingsDraft; saving: boolean; onDraftChange: (draft: SettingsDraft) => void }): ReactNode {
  return <div className="grid max-w-2xl gap-5">
    <fieldset className="appearance-mode-picker" disabled={saving}><legend>Appearance</legend><div className="appearance-mode-options">{([{ id: "system", label: "System", icon: Monitor }, { id: "light", label: "Light", icon: Sun }, { id: "dark", label: "Dark", icon: Moon }] as const).map(({ id, label, icon: Icon }) => <label key={id}><input className="sr-only" type="radio" name="appearance-mode" value={id} checked={draft.appearanceMode === id} onChange={() => onDraftChange({ ...draft, appearanceMode: id })} /><Icon aria-hidden="true" /><span>{label}</span></label>)}</div></fieldset>
    <div className="interface-scale-setting"><div className="interface-scale-heading"><div><label className="text-sm font-semibold" htmlFor="interface-scale">Interface scale</label><p className="text-sm text-muted-foreground">Resize text and controls throughout Githead.</p></div><output className="interface-scale-value" htmlFor="interface-scale">{formatZoomFactor(draft.zoomFactor)}</output></div><div className="interface-scale-slider-wrap"><div className="interface-scale-notches" aria-hidden="true">{APP_ZOOM_FACTORS.map((factor) => <span key={factor} className={factor === 1 ? "is-default" : undefined} />)}</div><input id="interface-scale" className="interface-scale-slider" type="range" min={0} max={APP_ZOOM_FACTORS.length - 1} step={1} value={Math.max(0, APP_ZOOM_FACTORS.indexOf(draft.zoomFactor as typeof APP_ZOOM_FACTORS[number]))} aria-valuetext={formatZoomFactor(draft.zoomFactor)} disabled={saving} onChange={(event) => { const zoomFactor = APP_ZOOM_FACTORS[Number(event.currentTarget.value)]; if (zoomFactor !== undefined) onDraftChange({ ...draft, zoomFactor }); }} /></div><div className="interface-scale-bounds" aria-hidden="true"><span>75%</span><span className="interface-scale-default">100% Default</span><span>200%</span></div></div>
    <div><h3 className="text-sm font-semibold">Color theme</h3><p className="text-sm text-muted-foreground">Choose a palette for your selected appearance.</p></div>
    <fieldset className="theme-picker-grid" disabled={saving}><legend className="sr-only">Color theme</legend>{COLOR_THEME_OPTIONS.map((theme) => <label key={theme.id} className="theme-option"><input className="sr-only" type="radio" name="color-theme" value={theme.id} checked={draft.colorTheme === theme.id} onChange={() => onDraftChange({ ...draft, colorTheme: theme.id })} /><span className="theme-option-header"><span className="font-semibold">{theme.name}</span><CheckCircle2 className="theme-option-check" aria-hidden="true" /></span><span className="text-xs text-muted-foreground">{theme.description}</span><span className="theme-swatches" aria-hidden="true">{theme.swatches.map((swatch) => <span key={swatch} style={{ backgroundColor: swatch }} />)}</span></label>)}</fieldset>
  </div>;
}

export interface GitIdentityFieldsProps { idPrefix: string; name: string; email: string; scope: GitIdentityScope; disabled: boolean; error?: string; autoFocusName?: boolean; onChange: (patch: Partial<{ name: string; email: string; scope: GitIdentityScope }>) => void; }

export function GitIdentityFields({ idPrefix, name, email, scope, disabled, error = "", autoFocusName = false, onChange }: GitIdentityFieldsProps): ReactNode {
  const hasError = Boolean(error); const errorId = `${idPrefix}-error`;
  return <fieldset className="grid max-w-xl gap-4" disabled={disabled}><legend className="sr-only">Git Identity</legend><div className="grid gap-2"><Label htmlFor={`${idPrefix}-name`}>Name</Label><Input id={`${idPrefix}-name`} type="text" autoComplete="name" value={name} autoFocus={autoFocusName} aria-invalid={hasError} aria-describedby={hasError ? errorId : undefined} onChange={(event) => onChange({ name: event.target.value })} /></div><div className="grid gap-2"><Label htmlFor={`${idPrefix}-email`}>Email</Label><Input id={`${idPrefix}-email`} type="email" autoComplete="email" value={email} aria-invalid={hasError} aria-describedby={hasError ? errorId : undefined} onChange={(event) => onChange({ email: event.target.value })} /></div><div className="grid gap-2"><p className="text-sm font-medium">Save identity to</p><div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Save Git identity to">{(["repository", "global"] as const).map((item) => <Label key={item} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"><input type="radio" name={`${idPrefix}-scope`} value={item} checked={scope === item} onChange={() => onChange({ scope: item })} className="size-4" />{item === "repository" ? "This repository" : "Global"}</Label>)}</div></div></fieldset>;
}

function useAiReasoningCapabilities(enabled: boolean, provider: AiCommitMessageProvider, model: string): { capabilities: AiReasoningCapabilities; loading: boolean } {
  const [state, setState] = useState<{ capabilities: AiReasoningCapabilities; loading: boolean }>({ capabilities: { status: "unknown", supportedEfforts: [] }, loading: false });
  useEffect(() => { const normalizedModel = model.trim(); if (!enabled || !normalizedModel) { setState({ capabilities: { status: "unknown", supportedEfforts: [] }, loading: false }); return; } let cancelled = false; setState((current) => ({ ...current, loading: true })); const timeout = window.setTimeout(() => { void window.githead.getAiReasoningCapabilities({ provider, model: normalizedModel }).then((capabilities) => { if (!cancelled) setState({ capabilities, loading: false }); }).catch(() => { if (!cancelled) setState({ capabilities: { status: "unknown", supportedEfforts: [] }, loading: false }); }); }, 300); return () => { cancelled = true; window.clearTimeout(timeout); }; }, [enabled, model, provider]);
  return state;
}

function ReasoningEffortField({ id, label, value, capabilities, loading, disabled, onChange }: { id: string; label: string; value: AiReasoningEffort; capabilities: AiReasoningCapabilities; loading: boolean; disabled: boolean; onChange: (effort: AiReasoningEffort) => void }): ReactNode {
  const supportedEfforts = AI_REASONING_EFFORTS.filter((effort) => capabilities.supportedEfforts.includes(effort)); const available = capabilities.status === "supported" && supportedEfforts.length > 0; const selectedValue = supportedEfforts.includes(value) ? value : supportedEfforts[0] ?? value; const helpId = `${id}-help`; const helpText = loading ? "Checking whether this model supports configurable reasoning…" : capabilities.status === "unsupported" ? "This model does not support configurable reasoning." : capabilities.status === "unknown" ? "Reasoning support could not be verified for this model." : "Lower effort favors speed and cost; higher effort favors deeper reasoning.";
  return <div className="grid gap-2"><Label htmlFor={id}>{label}</Label><select id={id} className="h-10 rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50" value={selectedValue} disabled={disabled || loading || !available} aria-describedby={helpId} onChange={(event) => onChange(event.target.value as AiReasoningEffort)}>{(available ? supportedEfforts : [value]).map((effort) => <option key={effort} value={effort}>{effort.charAt(0).toUpperCase() + effort.slice(1)}</option>)}</select><p id={helpId} className="text-sm text-muted-foreground" aria-live="polite">{helpText}</p></div>;
}

function serializeSettingsDraft(draft: SettingsDraft): string { return JSON.stringify(draft); }
function formatZoomFactor(zoomFactor: number): string { return `${Math.round(zoomFactor * 100)}%`; }

function getDirtyCategories(baseline: string, draft: SettingsDraft): Record<SettingsCategory, boolean> {
  if (!baseline) return { appearance: false, "git-identity": false, sync: false, ai: false };
  const saved = JSON.parse(baseline) as SettingsDraft;
  return {
    appearance: saved.colorTheme !== draft.colorTheme || saved.appearanceMode !== draft.appearanceMode || saved.zoomFactor !== draft.zoomFactor,
    "git-identity": saved.gitIdentityName !== draft.gitIdentityName || saved.gitIdentityEmail !== draft.gitIdentityEmail || saved.gitIdentityScope !== draft.gitIdentityScope,
    sync: saved.autoFetchIntervalMinutes !== draft.autoFetchIntervalMinutes,
    ai: JSON.stringify({ selectedProvider: saved.selectedProvider, providerModels: saved.providerModels, prDescriptionModels: saved.prDescriptionModels, reasoningEfforts: saved.reasoningEfforts, prDescriptionReasoningEfforts: saved.prDescriptionReasoningEfforts, apiKeys: saved.apiKeys, clearApiKeys: saved.clearApiKeys, commitMessagePrompt: saved.commitMessagePrompt, prDescriptionPrompt: saved.prDescriptionPrompt }) !== JSON.stringify({ selectedProvider: draft.selectedProvider, providerModels: draft.providerModels, prDescriptionModels: draft.prDescriptionModels, reasoningEfforts: draft.reasoningEfforts, prDescriptionReasoningEfforts: draft.prDescriptionReasoningEfforts, apiKeys: draft.apiKeys, clearApiKeys: draft.clearApiKeys, commitMessagePrompt: draft.commitMessagePrompt, prDescriptionPrompt: draft.prDescriptionPrompt })
  };
}
