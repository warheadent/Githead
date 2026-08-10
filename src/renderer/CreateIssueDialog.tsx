import { ArrowLeft, CircleDot, ExternalLink, FileText, Loader2, MessageCircleQuestion, Plus } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { GitHubIssueTemplate, GitHubIssueTemplateField, GitHubIssueTemplates } from "../shared/types";
import { initialIssueFormAnswers, serializeIssueForm, validateIssueForm, type GitHubIssueFormAnswers } from "./githubIssueForm";

const BasicMarkdown = lazy(() => import("./BasicMarkdown.js").then((module) => ({ default: module.BasicMarkdown })));

export interface CreateIssueDraft {
  title: string;
  body: string;
  labels: string[];
  assignees: string[];
}

interface Props {
  open: boolean;
  repoPath: string;
  repositoryName: string;
  repositoryUrl: string;
  busy: boolean;
  error: string;
  outcomeUnknown: boolean;
  unknownOutcomeReviewed: boolean;
  onOpenChange(open: boolean): void;
  onOpenExternalUrl(url: string): void;
  onReviewUnknownOutcome(): void;
  onClearError(): void;
  onSubmit(draft: CreateIssueDraft): void;
}

type DialogMode = "chooser" | "blank" | "template";

export function CreateIssueDialog(props: Props): ReactNode {
  const [templates, setTemplates] = useState<GitHubIssueTemplates | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loadGeneration, setLoadGeneration] = useState(0);
  const [mode, setMode] = useState<DialogMode>("chooser");
  const [selectedTemplate, setSelectedTemplate] = useState<GitHubIssueTemplate | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [answers, setAnswers] = useState<GitHubIssueFormAnswers>({});
  const [validationError, setValidationError] = useState("");
  const requestIdRef = useRef("");

  const resetDraft = useCallback(() => {
    setMode("chooser");
    setSelectedTemplate(null);
    setTitle("");
    setBody("");
    setAnswers({});
    setValidationError("");
  }, []);

  useEffect(() => {
    if (!props.open || !props.repoPath) return;
    resetDraft();
    setTemplates(null);
    setLoadError("");
    const requestId = issueTemplateRequestId();
    requestIdRef.current = requestId;
    let active = true;
    void window.githead.getGitHubIssueTemplates({ repoPath: props.repoPath, requestId }).then((result) => {
      if (!active || requestIdRef.current !== requestId) return;
      if (!result.ok) {
        setLoadError(result.error.message);
        return;
      }
      setTemplates(result.data);
      if (result.data.templates.length === 0 && result.data.contactLinks.length === 0 && result.data.blankIssuesEnabled) setMode("blank");
    }).catch((error: unknown) => {
      if (active && requestIdRef.current === requestId) setLoadError(error instanceof Error ? error.message : "Unable to load issue templates.");
    });
    return () => {
      active = false;
      if (requestIdRef.current === requestId) {
        requestIdRef.current = "";
        void window.githead.cancelGitHubRequest({ requestId });
      }
    };
  }, [loadGeneration, props.open, props.repoPath, resetDraft]);

  const selectedHasUnsupportedFeatures = Boolean(selectedTemplate?.unsupportedFeatures.length);
  const visibleError = validationError || props.error;
  const selectTemplate = (template: GitHubIssueTemplate): void => {
    setSelectedTemplate(template);
    setTitle(template.title);
    setBody(template.body);
    setAnswers(initialIssueFormAnswers(template));
    setValidationError("");
    props.onClearError();
    setMode("template");
  };
  const selectBlank = (): void => {
    setSelectedTemplate(null);
    setTitle("");
    setBody("");
    setAnswers({});
    setValidationError("");
    props.onClearError();
    setMode("blank");
  };
  const updateAnswer = (id: string, value: string | string[]): void => {
    setAnswers((current) => ({ ...current, [id]: value }));
    setValidationError("");
    props.onClearError();
  };
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!title.trim()) {
      setValidationError("Enter an issue title.");
      return;
    }
    if (selectedTemplate?.kind === "form") {
      const formError = validateIssueForm(selectedTemplate, answers);
      if (formError) {
        setValidationError(formError);
        return;
      }
    }
    props.onSubmit({
      title: title.trim(),
      body: selectedTemplate?.kind === "form" ? serializeIssueForm(selectedTemplate, answers) : body,
      labels: selectedTemplate?.labels ?? [],
      assignees: selectedTemplate?.assignees ?? []
    });
  };
  const githubTemplateUrl = selectedTemplate
    ? `${props.repositoryUrl}/issues/new?template=${encodeURIComponent(selectedTemplate.filename)}`
    : `${props.repositoryUrl}/issues/new`;

  return <Dialog open={props.open} onOpenChange={props.onOpenChange}>
    <DialogContent className="create-issue-dialog sm:max-w-[660px]" aria-busy={props.busy}>
      <form className="grid min-h-0 gap-4" onSubmit={submit}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            {mode !== "chooser" && templates && (templates.templates.length > 0 || templates.contactLinks.length > 0) ? (
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Back to templates" disabled={props.busy} onClick={() => { setMode("chooser"); setValidationError(""); }}><ArrowLeft /></Button>
            ) : null}
            <DialogTitle>New issue</DialogTitle>
          </div>
          <DialogDescription>{mode === "chooser" ? `Choose a template for ${props.repositoryName}.` : `Create an issue in ${props.repositoryName}.`}</DialogDescription>
        </DialogHeader>

        {!templates && !loadError ? <div className="create-issue-loading"><Loader2 className="animate-spin" /><span>Loading issue templates…</span></div> : null}
        {loadError ? <div className="create-issue-load-error" role="alert"><p>{loadError}</p><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setLoadGeneration((value) => value + 1)}>Retry</Button><Button type="button" variant="outline" onClick={() => props.onOpenExternalUrl(`${props.repositoryUrl}/issues/new`)}><ExternalLink />Open on GitHub</Button></div></div> : null}

        {templates && mode === "chooser" ? <IssueTemplateChooser templates={templates} onSelectTemplate={selectTemplate} onSelectBlank={selectBlank} onOpenExternalUrl={props.onOpenExternalUrl} /> : null}

        {templates && mode !== "chooser" ? <div className="create-issue-form-scroll">
          {selectedTemplate ? <div className="create-issue-template-heading"><FileText /><div><strong>{selectedTemplate.name}</strong>{selectedTemplate.description ? <p>{selectedTemplate.description}</p> : null}</div></div> : null}
          {selectedHasUnsupportedFeatures ? <div className="create-issue-warning" role="alert">This template uses {selectedTemplate?.unsupportedFeatures.join(", ")}. Complete it on GitHub so no template behavior is lost.</div> : null}
          <div className="grid gap-2">
            <Label htmlFor="create-issue-title">Title</Label>
            <Input id="create-issue-title" autoFocus value={title} disabled={props.busy || selectedHasUnsupportedFeatures} placeholder="Briefly describe the problem or request" onChange={(event) => { setTitle(event.currentTarget.value); setValidationError(""); props.onClearError(); }} />
          </div>
          {selectedTemplate?.kind === "form"
            ? selectedTemplate.fields.map((field, index) => <IssueFormField key={field.kind === "markdown" ? `markdown-${index}` : field.id} field={field} value={field.kind === "markdown" ? "" : answers[field.id]} disabled={props.busy || selectedHasUnsupportedFeatures} onChange={updateAnswer} />)
            : <div className="grid gap-2"><Label htmlFor="create-issue-body">Description</Label><Textarea id="create-issue-body" className="resize-y field-sizing-fixed" rows={8} value={body} disabled={props.busy || selectedHasUnsupportedFeatures} placeholder="Add context, expected behavior, or steps to reproduce (optional)" onChange={(event) => { setBody(event.currentTarget.value); setValidationError(""); props.onClearError(); }} /><p className="text-xs text-muted-foreground">GitHub Markdown is supported.</p></div>}
        </div> : null}

        <div className="grid min-h-5 gap-2">
          {visibleError ? <p className="text-sm text-destructive" role="alert">{visibleError}</p> : null}
          {props.outcomeUnknown && !props.unknownOutcomeReviewed ? <Button type="button" variant="outline" className="w-fit" onClick={props.onReviewUnknownOutcome}><ExternalLink />Open Issues</Button> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          {selectedHasUnsupportedFeatures ? <Button type="button" onClick={() => props.onOpenExternalUrl(githubTemplateUrl)}><ExternalLink />Open on GitHub</Button> : null}
          {templates && mode !== "chooser" && !selectedHasUnsupportedFeatures ? <Button type="submit" disabled={props.busy || !title.trim() || (props.outcomeUnknown && !props.unknownOutcomeReviewed)}>{props.busy ? <Loader2 className="animate-spin" /> : <CircleDot />}{props.busy ? "Creating…" : "Create issue"}</Button> : null}
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function IssueTemplateChooser({ templates, onSelectTemplate, onSelectBlank, onOpenExternalUrl }: { templates: GitHubIssueTemplates; onSelectTemplate(template: GitHubIssueTemplate): void; onSelectBlank(): void; onOpenExternalUrl(url: string): void }): ReactNode {
  return <div className="create-issue-choices">
    {templates.templates.map((template) => <button type="button" className="create-issue-choice" key={template.filename} onClick={() => onSelectTemplate(template)}><FileText /><span><strong>{template.name}</strong><small>{template.description || (template.kind === "form" ? "Guided issue form" : "Issue template")}</small></span><span className="create-issue-choice-action">Get started</span></button>)}
    {templates.blankIssuesEnabled ? <button type="button" className="create-issue-choice" onClick={onSelectBlank}><Plus /><span><strong>Blank issue</strong><small>Start without a template</small></span><span className="create-issue-choice-action">Get started</span></button> : null}
    {templates.contactLinks.map((link) => <button type="button" className="create-issue-choice" key={link.url} onClick={() => onOpenExternalUrl(link.url)}><MessageCircleQuestion /><span><strong>{link.name}</strong><small>{link.description}</small></span><ExternalLink className="create-issue-choice-external" /></button>)}
    {!templates.templates.length && !templates.blankIssuesEnabled && !templates.contactLinks.length ? <p className="text-sm text-muted-foreground">This repository does not allow issue creation from a template or a blank issue.</p> : null}
  </div>;
}

function IssueFormField({ field, value, disabled, onChange }: { field: GitHubIssueTemplateField; value: string | string[] | undefined; disabled: boolean; onChange(id: string, value: string | string[]): void }): ReactNode {
  if (field.kind === "markdown") return <div className="create-issue-guidance"><Suspense fallback={<p>{field.value}</p>}><BasicMarkdown externalLinks>{field.value}</BasicMarkdown></Suspense></div>;
  const required = field.kind === "checkboxes" ? field.options.some((option) => option.required) : field.required;
  const descriptionId = field.description ? `create-issue-${field.id}-description` : undefined;
  return <fieldset className="grid gap-2" disabled={disabled}>
    <Label htmlFor={`create-issue-${field.id}`}>{field.label}{required ? <span aria-hidden="true"> *</span> : null}</Label>
    {field.description ? <p id={descriptionId} className="text-xs text-muted-foreground">{field.description}</p> : null}
    {field.kind === "input" ? <Input id={`create-issue-${field.id}`} value={typeof value === "string" ? value : ""} required={field.required} aria-describedby={descriptionId} placeholder={field.placeholder} onChange={(event) => onChange(field.id, event.currentTarget.value)} /> : null}
    {field.kind === "textarea" ? <Textarea id={`create-issue-${field.id}`} className="resize-y field-sizing-fixed" rows={5} value={typeof value === "string" ? value : ""} required={field.required} aria-describedby={descriptionId} placeholder={field.placeholder} onChange={(event) => onChange(field.id, event.currentTarget.value)} /> : null}
    {field.kind === "dropdown" && !field.multiple ? <select id={`create-issue-${field.id}`} className="create-issue-select" required={field.required} aria-describedby={descriptionId} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(field.id, event.currentTarget.value)}><option value="">Select an option</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : null}
    {field.kind === "dropdown" && field.multiple ? <div className="create-issue-checkboxes" id={`create-issue-${field.id}`}>{field.options.map((option) => <CheckOption key={option} label={option} checked={Array.isArray(value) && value.includes(option)} onChange={(checked) => onChange(field.id, toggleList(value, option, checked))} />)}</div> : null}
    {field.kind === "checkboxes" ? <div className="create-issue-checkboxes" id={`create-issue-${field.id}`}>{field.options.map((option) => <CheckOption key={option.label} label={option.label} required={option.required} checked={Array.isArray(value) && value.includes(option.label)} onChange={(checked) => onChange(field.id, toggleList(value, option.label, checked))} />)}</div> : null}
  </fieldset>;
}

function CheckOption({ label, checked, required = false, onChange }: { label: string; checked: boolean; required?: boolean; onChange(checked: boolean): void }): ReactNode {
  return <label><input type="checkbox" checked={checked} required={required} onChange={(event) => onChange(event.currentTarget.checked)} /><span>{label}{required ? " *" : ""}</span></label>;
}

function toggleList(value: string | string[] | undefined, option: string, checked: boolean): string[] {
  const current = Array.isArray(value) ? value : [];
  return checked ? [...new Set([...current, option])] : current.filter((entry) => entry !== option);
}

function issueTemplateRequestId(): string {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `issue-templates-${suffix}`;
}
