import { GitIgnoreFileDialog } from "./GitIgnoreFileDialog";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GitConfigKey, GitConfigValues, GitSigningTestResult } from "../shared/gitConfig";
import { LoadingState } from "./LoadingState";
import { SettingsCard } from "./SettingsCategoryLayout";
import type { GitConfigEditorState } from "./useGitConfigSettings";

const boolOptions = [["true", "On"], ["false", "Off"]] as const;
const selectClassName = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50";

type Options = readonly (readonly [string, string])[];

export function GitConfigSettingsFields({ editor, disabled }: { editor: GitConfigEditorState; disabled: boolean }): ReactNode {
  const { settings, draft, setDraft } = editor;
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<GitSigningTestResult | null>(null);
  const [fileError, setFileError] = useState("");
  useEffect(() => { setTestResult(null); }, [draft]);
  if (editor.loading) return <LoadingState label="Loading Git configuration" />;
  if (!settings) return <div className="grid gap-3"><p role="alert">{editor.error || "Git configuration is unavailable."}</p><Button type="button" variant="outline" onClick={() => { void editor.reload(); }}>Reload Git configuration</Button></div>;
  const locked = disabled || editor.saving || testing;
  const prefix = `${settings.scope}-git-config`;
  const update = (key: GitConfigKey, value: string | null): void => setDraft({ ...draft, [key]: value });

  const source = (key: GitConfigKey, fallback: string): ReactNode => {
    const entry = settings.effective[key];
    const inherited = settings.inherited[key];
    return <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer">Current: {displayValue(entry?.value ?? fallback)}</summary>
      <div className="mt-1 grid gap-1 break-words [overflow-wrap:anywhere]">
        <span>{key}</span>
        <span>{entry ? `${entry.scope}: ${entry.origin}` : "No saved value. Githead uses the default shown above."}</span>
        {inherited ? <span>Inherited: {displayValue(inherited.value)}. {inherited.scope}: {inherited.origin}</span> : null}
      </div>
    </details>;
  };
  const select = (key: GitConfigKey, label: string, options: Options, fallback: string, help?: string): ReactNode => {
    const current = draft[key];
    const custom = current !== null && !options.some(([value]) => value === current);
    return <div className="settings-field grid gap-2">
      <Label htmlFor={`${prefix}-${key}`}>{label}</Label>
      <select id={`${prefix}-${key}`} className={selectClassName} disabled={locked} value={current ?? "inherit"} onChange={(event) => update(key, event.target.value === "inherit" ? null : event.target.value)}>
        <option value="inherit">Inherit</option>
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        {custom ? <option value={current}>Existing value: {current}</option> : null}
      </select>
      {help ? <p className="text-sm text-muted-foreground">{help}</p> : null}
      {source(key, fallback)}
    </div>;
  };
  const chooseFile = async (key: GitConfigKey, purpose: "signing-key" | "ignore"): Promise<void> => {
    setFileError("");
    try {
      const selected = await window.githead.chooseGitConfigFile(purpose);
      if (selected) setDraft((current) => ({ ...current, [key]: selected }));
    } catch (cause) { setFileError(cause instanceof Error ? cause.message : "Unable to select a file."); }
  };
  const text = (key: GitConfigKey, label: string, fallback: string, purpose?: "signing-key" | "ignore"): ReactNode => <div className="settings-field grid gap-2">
    <Label htmlFor={`${prefix}-${key}`}>{label}</Label>
    <div className="flex gap-2">
      <Input id={`${prefix}-${key}`} className="min-w-0 flex-1" value={draft[key] ?? ""} placeholder="Inherit" disabled={locked} onChange={(event) => update(key, event.target.value || null)} />
      {purpose ? <Button type="button" variant="outline" disabled={locked} aria-label={`Choose ${label.toLowerCase()}`} onClick={() => { void chooseFile(key, purpose); }}>Browse</Button> : null}
      {draft[key] !== null ? <Button type="button" variant="outline" disabled={locked} aria-label={`Inherit ${label.toLowerCase()}`} onClick={() => update(key, null)}>Inherit</Button> : null}
    </div>
    {source(key, fallback)}
  </div>;
  const testSigning = async (): Promise<void> => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await window.githead.testGitSigning({ repoPath: settings.repoPath, scope: settings.scope, operationId: `git-signing-${crypto.randomUUID()}` }));
    } catch (cause) {
      setTestResult({ ok: false, message: cause instanceof Error ? cause.message : "Unable to test signing." });
    } finally { setTesting(false); }
  };

  return <div className="grid min-w-0 gap-6">
    <p className="text-sm text-muted-foreground">{settings.scope === "global"
      ? "These changes apply to your global Git configuration and also affect other Git clients."
      : "These changes apply to this Git repository and its worktrees. Other Git clients also use them."} Choose Inherit to remove a value from this configuration file.</p>
    <SettingsCard title="Commit signing" description="Sign commits with your existing key.">
      {select("commit.gpgsign", "Sign commits", boolOptions, "Off")}
      {select("gpg.format", "Signing format", [["openpgp", "OpenPGP"], ["ssh", "SSH"], ["x509", "X.509"]], "OpenPGP")}
      {text("user.signingkey", "Signing key", "Automatic key selection", "signing-key")}
      <p className="text-sm text-muted-foreground">Use a key ID for OpenPGP or X.509. For SSH, choose a key file or a public key managed by your SSH agent.</p>
      <div><Button type="button" variant="outline" disabled={locked || editor.dirty} onClick={() => { void testSigning(); }}>{testing ? "Testing signing…" : "Test saved signing settings"}</Button></div>
      {editor.dirty ? <p className="text-xs text-muted-foreground">Save your changes before testing signing.</p> : null}
      {testResult ? <p className={`break-words text-sm ${testResult.ok ? "text-muted-foreground" : "text-destructive"}`} role="status">{testResult.message}</p> : null}
    </SettingsCard>
    <SettingsCard title="Pull and fetch">
      <div className="settings-field grid gap-2">
        <Label htmlFor={`${prefix}-pull`}>Pull behavior</Label>
        <select id={`${prefix}-pull`} className={selectClassName} disabled={locked} value={pullMode(draft)} onChange={(event) => setDraft({ ...draft, ...pullValues(event.target.value) })}>
          <option value="inherit">Inherit</option><option value="ff-only">Fast-forward only</option><option value="merge">Merge</option><option value="rebase">Rebase</option>
          {pullMode(draft) === "custom" ? <option value="custom">Existing Git configuration</option> : null}
        </select>
        <p className="text-sm text-muted-foreground">Fast-forward only stops when branches have diverged. Merge joins their histories. Rebase reapplies your local commits on the fetched branch.</p>
        {source("pull.rebase", "Fast-forward only when no pull policy is set")}
        {source("pull.ff", "Fast-forward only when no pull policy is set")}
        {settings.branchRebase ? <p className="text-sm text-muted-foreground">This branch has its own rebase setting: {displayValue(settings.branchRebase.value)}. Source: {settings.branchRebase.origin}. Git uses it before the general rebase setting.</p> : null}
      </div>
      {select("fetch.prune", "Remove stale remote references", boolOptions, "On", "Remove references to branches deleted on the remote. Settings for individual remotes still apply.")}
    </SettingsCard>
    <SettingsCard title="Push">
      {select("push.autosetupremote", "Set upstream on first push", boolOptions, "Off", "Track a new branch on an ordinary push when Git's push mode supports it. The Publish Branch action always sets an upstream.")}
    </SettingsCard>
    {settings.scope === "global" ? <SettingsCard title="New repositories" description="Used when Git initializes a repository. Existing branches and clones keep their names.">
      {text("init.defaultbranch", "Default initial branch", "Git default")}
    </SettingsCard> : null}
    <SettingsCard title="Personal ignore file" description="Ignore local tools and generated files without editing the repository's .gitignore.">
      {text("core.excludesfile", "Ignore file", "Git's default personal ignore file", "ignore")}
      <div><Button type="button" variant="outline" disabled={locked || editor.dirty} onClick={() => setIgnoreOpen(true)}>Open saved ignore file</Button></div>
      <GitIgnoreFileDialog open={ignoreOpen} request={settings} onClose={() => setIgnoreOpen(false)} />
    </SettingsCard>
    <details className="group rounded-md border p-4">
      <summary className="cursor-pointer text-sm font-medium">Advanced</summary>
      <div className="mt-4 grid gap-6">
        <SettingsCard title="Line endings" description="The repository's .gitattributes rules can override these conversion settings. Changing conversion can affect which files appear modified.">
          {select("core.autocrlf", "Line ending conversion", [["false", "No automatic conversion"], ["input", "Convert CRLF to LF on commit"], ["true", "Use CRLF in the working directory"]], "No automatic conversion")}
          {select("core.safecrlf", "Irreversible line ending conversion", [["false", "Allow"], ["warn", "Warn"], ["true", "Reject"]], "Allow")}
        </SettingsCard>
        <SettingsCard title="Conflict resolution">
          {select("rerere.enabled", "Reuse previous conflict resolutions", boolOptions, "Git default", "Remember how you resolved conflicts and apply those resolutions when the same conflicts occur again.")}
        </SettingsCard>
      </div>
    </details>
    {fileError ? <p role="alert" className="text-sm text-destructive">{fileError}</p> : null}
    {editor.error ? <div className="grid gap-2"><p role="alert" className="text-sm text-destructive">{editor.error}</p><Button type="button" variant="outline" disabled={locked} onClick={() => { void editor.reload(); }}>Reload and discard Git edits</Button></div> : null}
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Configuration file</summary><p className="mt-1 break-all">{settings.filePath}</p></details>
  </div>;
}

function displayValue(value: string): string { return value === "true" ? "On" : value === "false" ? "Off" : value; }
function pullMode(values: GitConfigValues): string {
  if (values["pull.ff"] === null && values["pull.rebase"] === null) return "inherit";
  if (values["pull.ff"] === "only") return "ff-only";
  if (values["pull.ff"] === "true" && values["pull.rebase"] === "false") return "merge";
  if (values["pull.ff"] === "true" && values["pull.rebase"] === "true") return "rebase";
  return "custom";
}
function pullValues(mode: string): Partial<GitConfigValues> {
  if (mode === "inherit") return { "pull.ff": null, "pull.rebase": null };
  if (mode === "ff-only") return { "pull.ff": "only", "pull.rebase": "false" };
  if (mode === "merge" || mode === "rebase") return { "pull.ff": "true", "pull.rebase": mode === "rebase" ? "true" : "false" };
  return {};
}
