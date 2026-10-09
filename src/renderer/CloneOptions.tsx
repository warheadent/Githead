import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CloneDraft } from "./cloneRepository";

export function CloneOptions({ draft, disabled, idPrefix, onChange }: {
  draft: CloneDraft;
  disabled: boolean;
  idPrefix: string;
  onChange(draft: CloneDraft): void;
}) {
  return <div className="setup-clone-advanced-body">
    <div className="grid gap-2">
      <Label htmlFor={`${idPrefix}-depth`}>Depth</Label>
      <Input id={`${idPrefix}-depth`} type="number" min="0" step="1" value={draft.depth} disabled={disabled}
        aria-describedby={`${idPrefix}-depth-hint`} onChange={(event) => onChange({ ...draft, depth: event.target.value })} />
      <span id={`${idPrefix}-depth-hint`} className="setup-clone-hint">0 for full history</span>
    </div>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={!draft.skipLfs} disabled={disabled}
        onChange={(event) => onChange({ ...draft, skipLfs: !event.target.checked })} />
      Download Git LFS files
    </label>
    <p className="setup-clone-hint">Uses the installed Git LFS filters.</p>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={draft.recurseSubmodules} disabled={disabled}
        onChange={(event) => onChange({ ...draft, recurseSubmodules: event.target.checked })} />
      Initialize submodules recursively
    </label>
  </div>;
}

export function cloneOptionsSummary(draft: CloneDraft): string {
  return `${Number(draft.depth) > 0 ? `Depth ${draft.depth}` : "Full clone"} · LFS ${draft.skipLfs ? "off" : "on"} · ${draft.recurseSubmodules ? "with submodules" : "no submodules"}`;
}
