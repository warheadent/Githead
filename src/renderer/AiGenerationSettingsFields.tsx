import { RotateCcw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "../shared/commitMessagePrompt";
import { DEFAULT_PR_DESCRIPTION_PROMPT } from "../shared/prDescriptionPrompt";
import {
  AI_REASONING_EFFORTS,
  type AiCommitMessageProvider,
  type AiReasoningCapabilities,
  type AiReasoningEffort
} from "../shared/types";

export interface AiGenerationSettingsDraft {
  selectedProvider: AiCommitMessageProvider;
  providerModels: Record<AiCommitMessageProvider, string>;
  prDescriptionModels: Record<AiCommitMessageProvider, string>;
  reasoningEfforts: Record<AiCommitMessageProvider, AiReasoningEffort>;
  prDescriptionReasoningEfforts: Record<AiCommitMessageProvider, AiReasoningEffort>;
  commitMessagePrompt: string;
  prDescriptionPrompt: string;
}

export interface AiGenerationSettingsFieldsProps<T extends AiGenerationSettingsDraft> {
  draft: T;
  disabled: boolean;
  enabled: boolean;
  idPrefix: string;
  onDraftChange: (draft: T) => void;
}

export function AiGenerationSettingsFields<T extends AiGenerationSettingsDraft>({
  draft,
  disabled,
  enabled,
  idPrefix,
  onDraftChange
}: AiGenerationSettingsFieldsProps<T>): ReactNode {
  const provider = draft.selectedProvider;
  const primaryReasoning = useAiReasoningCapabilities(enabled, provider, draft.providerModels[provider]);
  const prDescriptionModel = draft.prDescriptionModels[provider].trim();
  const prDescriptionReasoning = useAiReasoningCapabilities(enabled && Boolean(prDescriptionModel), provider, prDescriptionModel);

  return <>
    <SettingsCard title="Commit generation" description="Model, reasoning, and instructions for commit messages.">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-model`}>Model</Label>
        <Input id={`${idPrefix}-model`} type="text" autoComplete="off" value={draft.providerModels[provider]} disabled={disabled} onChange={(event) => onDraftChange({ ...draft, providerModels: { ...draft.providerModels, [provider]: event.target.value } })} />
      </div>
      <ReasoningEffortField id={`${idPrefix}-reasoning-effort`} label="Reasoning" value={draft.reasoningEfforts[provider]} capabilities={primaryReasoning.capabilities} loading={primaryReasoning.loading} disabled={disabled} onChange={(reasoningEffort) => onDraftChange({ ...draft, reasoningEfforts: { ...draft.reasoningEfforts, [provider]: reasoningEffort } })} />
      <PromptField id={`${idPrefix}-commit-message-prompt`} label="Commit Message Prompt" value={draft.commitMessagePrompt} defaultValue={DEFAULT_COMMIT_MESSAGE_PROMPT} disabled={disabled} onChange={(commitMessagePrompt) => onDraftChange({ ...draft, commitMessagePrompt })} />
    </SettingsCard>

    <SettingsCard title="Pull request generation" description="Optional model override and instructions for pull request descriptions.">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-pr-description-model`}>PR Description Model</Label>
        <Input id={`${idPrefix}-pr-description-model`} type="text" autoComplete="off" placeholder="Leave blank to use the commit message model" value={draft.prDescriptionModels[provider]} disabled={disabled} onChange={(event) => onDraftChange({ ...draft, prDescriptionModels: { ...draft.prDescriptionModels, [provider]: event.target.value } })} />
      </div>
      {prDescriptionModel
        ? <ReasoningEffortField id={`${idPrefix}-pr-description-reasoning-effort`} label="PR Description Reasoning" value={draft.prDescriptionReasoningEfforts[provider]} capabilities={prDescriptionReasoning.capabilities} loading={prDescriptionReasoning.loading} disabled={disabled} onChange={(reasoningEffort) => onDraftChange({ ...draft, prDescriptionReasoningEfforts: { ...draft.prDescriptionReasoningEfforts, [provider]: reasoningEffort } })} />
        : <p className="text-sm text-muted-foreground">PR descriptions inherit the primary model and reasoning setting.</p>}
      <PromptField id={`${idPrefix}-pr-description-prompt`} label="PR Description Prompt" value={draft.prDescriptionPrompt} defaultValue={DEFAULT_PR_DESCRIPTION_PROMPT} disabled={disabled} onChange={(prDescriptionPrompt) => onDraftChange({ ...draft, prDescriptionPrompt })} />
    </SettingsCard>
  </>;
}

function SettingsCard({ title, description, children }: { title: string; description: string; children: ReactNode }): ReactNode {
  return <section className="grid gap-4 rounded-lg border bg-card p-4"><div><h3 className="text-sm font-semibold">{title}</h3><p className="text-sm text-muted-foreground">{description}</p></div>{children}</section>;
}

function PromptField({ id, label, value, defaultValue, disabled, onChange }: { id: string; label: string; value: string; defaultValue: string; disabled: boolean; onChange: (value: string) => void }): ReactNode {
  return <div className="grid gap-2"><div className="flex items-center justify-between gap-3"><Label htmlFor={id}>{label}</Label><Button type="button" variant="ghost" size="sm" disabled={disabled || value === defaultValue} aria-label={`Reset ${label.toLowerCase()} to default`} onClick={() => onChange(defaultValue)}><RotateCcw />Reset to default</Button></div><Textarea id={id} className="min-h-44 resize-y field-sizing-fixed" rows={7} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></div>;
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
