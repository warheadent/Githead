import { CircleAlert, Loader2, Save } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { AI_COMMIT_MESSAGE_PROVIDERS, type RepositoryAiSettings } from "../shared/types";
import { DEFAULT_SOURCE_CONTROL_WRITING_STYLE } from "../shared/sourceControlWritingStyle";
import { AiGenerationSettingsFields, type AiGenerationSettingsDraft } from "./AiGenerationSettingsFields";
import { getAiProviderLabel } from "./aiProvider";

interface RepositoryAiSettingsDraft extends AiGenerationSettingsDraft {
  enabled: boolean;
}

const emptyDraft: RepositoryAiSettingsDraft = {
  enabled: false,
  selectedProvider: "openrouter",
  providerModels: createStringRecord(),
  prDescriptionModels: createStringRecord(),
  reasoningEfforts: createReasoningRecord(),
  prDescriptionReasoningEfforts: createReasoningRecord(),
  commitMessagePrompt: "",
  prDescriptionPrompt: "",
  sourceControlWritingStyle: { ...DEFAULT_SOURCE_CONTROL_WRITING_STYLE }
};

export interface RepositoryAiSettingsDialogProps {
  open: boolean;
  repoPath: string;
  onOpenChange: (open: boolean) => void;
}

export function RepositoryAiSettingsDialog({ open, repoPath, onOpenChange }: RepositoryAiSettingsDialogProps): ReactNode {
  const requestIdRef = useRef(0);
  const [draft, setDraft] = useState<RepositoryAiSettingsDraft>(emptyDraft);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !repoPath) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError("");
    void window.githead.getRepositoryAiSettings({ repoPath }).then((result) => {
      if (requestIdRef.current === requestId) setDraft(createDraft(result));
    }).catch((loadError: unknown) => {
      if (requestIdRef.current === requestId) setError(loadError instanceof Error ? loadError.message : "Unable to load repository AI settings.");
    }).finally(() => {
      if (requestIdRef.current === requestId) setLoading(false);
    });
    return () => { requestIdRef.current += 1; };
  }, [open, repoPath]);

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (loading || saving) return;
    setSaving(true);
    setError("");
    try {
      await window.githead.saveRepositoryAiSettings({
        repoPath,
        enabled: draft.enabled,
        selectedProvider: draft.selectedProvider,
        providerModels: draft.providerModels,
        prDescriptionModels: draft.prDescriptionModels,
        reasoningEfforts: draft.reasoningEfforts,
        prDescriptionReasoningEfforts: draft.prDescriptionReasoningEfforts,
        commitMessagePrompt: draft.commitMessagePrompt,
        prDescriptionPrompt: draft.prDescriptionPrompt,
        sourceControlWritingStyle: draft.sourceControlWritingStyle
      });
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save repository AI settings.");
    } finally {
      setSaving(false);
    }
  };

  const disabled = loading || saving;
  return <Dialog open={open} onOpenChange={(nextOpen) => { if (!saving) onOpenChange(nextOpen); }}>
    <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden p-0">
      <DialogHeader className="border-b px-6 py-5">
        <DialogTitle>Repository AI Settings</DialogTitle>
        <DialogDescription className="grid gap-1">
          <span>Override AI generation settings for this repository.</span>
          <span className="truncate font-mono text-xs" title={repoPath}>{repoPath}</span>
        </DialogDescription>
      </DialogHeader>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { void save(event); }}>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading ? <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="animate-spin" />Loading repository settings…</div> : <div className="grid gap-4">
            <label className="flex items-start gap-3 rounded-lg border bg-card p-4">
              <input className="mt-1 size-4" type="checkbox" checked={draft.enabled} disabled={disabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
              <span><span className="block text-sm font-semibold">Use repository settings</span><span className="block text-sm text-muted-foreground">When off, this repository uses the global AI settings.</span></span>
            </label>

            <fieldset className="grid gap-4" disabled={disabled || !draft.enabled}>
              <div className="grid gap-2 rounded-lg border bg-card p-4">
                <Label htmlFor="repository-ai-provider">Provider</Label>
                <select id="repository-ai-provider" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={draft.selectedProvider} onChange={(event) => setDraft({ ...draft, selectedProvider: event.target.value as RepositoryAiSettingsDraft["selectedProvider"] })}>
                  {AI_COMMIT_MESSAGE_PROVIDERS.map((provider) => <option key={provider} value={provider}>{getAiProviderLabel(provider)}</option>)}
                </select>
                <p className="text-sm text-muted-foreground">API keys and CLI authentication remain in the global settings.</p>
              </div>
              <AiGenerationSettingsFields draft={draft} disabled={disabled || !draft.enabled} enabled={open && draft.enabled} idPrefix="repository-ai" onDraftChange={setDraft} />
            </fieldset>
          </div>}
        </div>
        <div className="flex min-h-16 items-center justify-between gap-4 border-t px-6 py-3">
          <div className="min-w-0 text-sm">{error ? <p className="flex items-center gap-2 text-destructive" role="alert"><CircleAlert className="size-4 shrink-0" aria-hidden="true" /><span>{error}</span></p> : null}</div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="secondary" disabled={disabled}>{saving ? <Loader2 className="animate-spin" /> : <Save />}{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

function createDraft(result: RepositoryAiSettings): RepositoryAiSettingsDraft {
  return {
    enabled: result.enabled,
    selectedProvider: result.settings.selectedProvider,
    providerModels: mapProviders((provider) => result.settings.providers[provider].model),
    prDescriptionModels: mapProviders((provider) => result.settings.providers[provider].prDescriptionModel),
    reasoningEfforts: mapProviders((provider) => result.settings.providers[provider].reasoningEffort),
    prDescriptionReasoningEfforts: mapProviders((provider) => result.settings.providers[provider].prDescriptionReasoningEffort),
    commitMessagePrompt: result.settings.commitMessagePrompt,
    prDescriptionPrompt: result.settings.prDescriptionPrompt,
    sourceControlWritingStyle: result.settings.sourceControlWritingStyle
  };
}

function mapProviders<T>(getValue: (provider: typeof AI_COMMIT_MESSAGE_PROVIDERS[number]) => T): Record<typeof AI_COMMIT_MESSAGE_PROVIDERS[number], T> {
  return AI_COMMIT_MESSAGE_PROVIDERS.reduce((result, provider) => { result[provider] = getValue(provider); return result; }, {} as Record<typeof AI_COMMIT_MESSAGE_PROVIDERS[number], T>);
}

function createStringRecord(): RepositoryAiSettingsDraft["providerModels"] {
  return mapProviders(() => "");
}

function createReasoningRecord(): RepositoryAiSettingsDraft["reasoningEfforts"] {
  return mapProviders(() => "low");
}
