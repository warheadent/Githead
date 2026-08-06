import { RotateCcw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_SOURCE_CONTROL_WRITING_STYLE,
  SOURCE_CONTROL_WRITING_STYLE_OPTIONS
} from "../shared/sourceControlWritingStyle";
import {
  AI_REASONING_EFFORTS,
  SOURCE_CONTROL_WRITING_STYLE_MODES,
  type AiCommitMessageProvider,
  type AiReasoningCapabilities,
  type AiReasoningEffort,
  type SourceControlWritingStyleMode
} from "../shared/types";

export interface AiGenerationSettingsDraft {
  selectedProvider: AiCommitMessageProvider;
  providerModels: Record<AiCommitMessageProvider, string>;
  commitPlanModels: Record<AiCommitMessageProvider, string>;
  commitPlanReasoningEfforts: Record<AiCommitMessageProvider, AiReasoningEffort>;
  prDescriptionModels: Record<AiCommitMessageProvider, string>;
  reasoningEfforts: Record<AiCommitMessageProvider, AiReasoningEffort>;
  prDescriptionReasoningEfforts: Record<AiCommitMessageProvider, AiReasoningEffort>;
  commitMessagePrompt: string;
  prDescriptionPrompt: string;
  sourceControlWritingStyle: {
    mode: SourceControlWritingStyleMode;
    customInstructions: string;
  };
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
  const commitPlanModel = draft.commitPlanModels[provider].trim();
  const commitPlanOverrideReasoning = useAiReasoningCapabilities(enabled && Boolean(commitPlanModel), provider, commitPlanModel);
  const commitPlanReasoning = commitPlanModel ? commitPlanOverrideReasoning : primaryReasoning;
  const prDescriptionModel = draft.prDescriptionModels[provider].trim();
  const prDescriptionOverrideReasoning = useAiReasoningCapabilities(enabled && Boolean(prDescriptionModel), provider, prDescriptionModel);
  const prDescriptionReasoning = prDescriptionModel ? prDescriptionOverrideReasoning : primaryReasoning;

  return <>
    <SourceControlWritingStyleField draft={draft} disabled={disabled} idPrefix={idPrefix} onDraftChange={onDraftChange} />

    <SettingsCard title="Commit generation" description="Model and reasoning for commit messages.">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-model`}>Model</Label>
        <Input id={`${idPrefix}-model`} type="text" autoComplete="off" value={draft.providerModels[provider]} disabled={disabled} onChange={(event) => onDraftChange({ ...draft, providerModels: { ...draft.providerModels, [provider]: event.target.value } })} />
      </div>
      <ReasoningEffortField id={`${idPrefix}-reasoning-effort`} label="Reasoning" value={draft.reasoningEfforts[provider]} capabilities={primaryReasoning.capabilities} loading={primaryReasoning.loading} disabled={disabled} onChange={(reasoningEffort) => onDraftChange({ ...draft, reasoningEfforts: { ...draft.reasoningEfforts, [provider]: reasoningEffort } })} />
    </SettingsCard>

    <SettingsCard title="Commit plan generation" description="Optional model override and separate reasoning for commit grouping and messages.">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-commit-plan-model`}>Commit Plan Model</Label>
        <Input id={`${idPrefix}-commit-plan-model`} type="text" autoComplete="off" placeholder="Leave blank to use the commit message model" value={draft.commitPlanModels[provider]} disabled={disabled} onChange={(event) => onDraftChange({ ...draft, commitPlanModels: { ...draft.commitPlanModels, [provider]: event.target.value } })} />
      </div>
      <ReasoningEffortField id={`${idPrefix}-commit-plan-reasoning-effort`} label="Commit Plan Reasoning" value={draft.commitPlanReasoningEfforts[provider]} capabilities={commitPlanReasoning.capabilities} loading={commitPlanReasoning.loading} disabled={disabled} onChange={(reasoningEffort) => onDraftChange({ ...draft, commitPlanReasoningEfforts: { ...draft.commitPlanReasoningEfforts, [provider]: reasoningEffort } })} />
    </SettingsCard>

    <SettingsCard title="Pull request generation" description="Optional model override and separate reasoning for pull request descriptions.">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-pr-description-model`}>PR Description Model</Label>
        <Input id={`${idPrefix}-pr-description-model`} type="text" autoComplete="off" placeholder="Leave blank to use the commit message model" value={draft.prDescriptionModels[provider]} disabled={disabled} onChange={(event) => onDraftChange({ ...draft, prDescriptionModels: { ...draft.prDescriptionModels, [provider]: event.target.value } })} />
      </div>
      <ReasoningEffortField id={`${idPrefix}-pr-description-reasoning-effort`} label="PR Description Reasoning" value={draft.prDescriptionReasoningEfforts[provider]} capabilities={prDescriptionReasoning.capabilities} loading={prDescriptionReasoning.loading} disabled={disabled} onChange={(reasoningEffort) => onDraftChange({ ...draft, prDescriptionReasoningEfforts: { ...draft.prDescriptionReasoningEfforts, [provider]: reasoningEffort } })} />
    </SettingsCard>
  </>;
}

function SettingsCard({ title, description, children }: { title: string; description: string; children: ReactNode }): ReactNode {
  return <section className="grid gap-4 rounded-lg border bg-card p-4"><div><h3 className="text-sm font-semibold">{title}</h3><p className="text-sm text-muted-foreground">{description}</p></div>{children}</section>;
}

function SourceControlWritingStyleField<T extends AiGenerationSettingsDraft>({ draft, disabled, idPrefix, onDraftChange }: { draft: T; disabled: boolean; idPrefix: string; onDraftChange: (draft: T) => void }): ReactNode {
  const style = draft.sourceControlWritingStyle;
  const option = SOURCE_CONTROL_WRITING_STYLE_OPTIONS[style.mode];
  const selectId = `${idPrefix}-source-control-writing-style`;
  const instructionsId = `${idPrefix}-source-control-writing-instructions`;
  const isDefault = style.mode === DEFAULT_SOURCE_CONTROL_WRITING_STYLE.mode
    && style.customInstructions === DEFAULT_SOURCE_CONTROL_WRITING_STYLE.customInstructions;

  return <SettingsCard title="Source control writing style" description={option.description}>
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={selectId}>Writing style</Label>
        <Button type="button" variant="ghost" size="sm" disabled={disabled || isDefault} aria-label="Reset source control writing style to default" onClick={() => onDraftChange({ ...draft, sourceControlWritingStyle: { ...DEFAULT_SOURCE_CONTROL_WRITING_STYLE } })}><RotateCcw />Reset to default</Button>
      </div>
      <select id={selectId} className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={style.mode} disabled={disabled} onChange={(event) => onDraftChange({ ...draft, sourceControlWritingStyle: { ...style, mode: event.target.value as SourceControlWritingStyleMode } })}>
        {SOURCE_CONTROL_WRITING_STYLE_MODES.map((mode) => <option key={mode} value={mode}>{SOURCE_CONTROL_WRITING_STYLE_OPTIONS[mode].label}</option>)}
      </select>
      {style.mode === "custom" ? <div className="grid gap-2 pt-2">
        <Label htmlFor={instructionsId}>Custom instructions</Label>
        <Textarea id={instructionsId} className="min-h-28 resize-y field-sizing-fixed" rows={4} placeholder="Keep titles concise. Use short bullet points in descriptions." value={style.customInstructions} disabled={disabled} onChange={(event) => onDraftChange({ ...draft, sourceControlWritingStyle: { ...style, customInstructions: event.target.value } })} />
      </div> : null}
    </div>
  </SettingsCard>;
}

function useAiReasoningCapabilities(enabled: boolean, provider: AiCommitMessageProvider, model: string): { capabilities: AiReasoningCapabilities; loading: boolean } {
  const [state, setState] = useState<{ capabilities: AiReasoningCapabilities; loading: boolean }>({ capabilities: { status: "unknown", supportedEfforts: [] }, loading: false });
  useEffect(() => { const normalizedModel = model.trim(); if (!enabled || !normalizedModel) { setState({ capabilities: { status: "unknown", supportedEfforts: [] }, loading: false }); return; } let cancelled = false; setState((current) => ({ ...current, loading: true })); const timeout = window.setTimeout(() => { void window.githead.getAiReasoningCapabilities({ provider, model: normalizedModel }).then((capabilities) => { if (!cancelled) setState({ capabilities, loading: false }); }).catch(() => { if (!cancelled) setState({ capabilities: { status: "unknown", supportedEfforts: [] }, loading: false }); }); }, 300); return () => { cancelled = true; window.clearTimeout(timeout); }; }, [enabled, model, provider]);
  return state;
}

function ReasoningEffortField({ id, label, value, capabilities, loading, disabled, onChange }: { id: string; label: string; value: AiReasoningEffort; capabilities: AiReasoningCapabilities; loading: boolean; disabled: boolean; onChange: (effort: AiReasoningEffort) => void }): ReactNode {
  const supportedEfforts = AI_REASONING_EFFORTS.filter((effort) => capabilities.supportedEfforts.includes(effort)); const available = capabilities.status === "supported" && supportedEfforts.length > 0; const selectedValue = supportedEfforts.includes(value) ? value : supportedEfforts[0] ?? value; const helpId = `${id}-help`; const helpText = loading ? "Checking whether this model supports configurable reasoning…" : capabilities.status === "unsupported" ? "This model does not support configurable reasoning." : capabilities.status === "unknown" ? "Reasoning support could not be verified for this model." : "Lower effort favors speed and cost; higher effort favors deeper reasoning.";
  return <div className="grid gap-2"><Label htmlFor={id}>{label}</Label><select id={id} className="h-10 rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50" value={selectedValue} disabled={disabled || loading || !available} aria-describedby={helpId} onChange={(event) => onChange(event.target.value as AiReasoningEffort)}>{(available ? supportedEfforts : [value]).map((effort) => <option key={effort} value={effort}>{formatReasoningEffort(effort)}</option>)}</select><p id={helpId} className="text-sm text-muted-foreground" aria-live="polite">{helpText}</p></div>;
}

function formatReasoningEffort(effort: AiReasoningEffort): string {
  return effort === "xhigh" ? "Extra High" : effort.charAt(0).toUpperCase() + effort.slice(1);
}
