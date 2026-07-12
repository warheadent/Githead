import { useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Option { value: string; label: string; disabled?: boolean }
export interface GitHubQueryToolbarProps {
  view: "workflows" | "pullRequests" | "issues";
  search: string;
  preset: string;
  presets: Option[];
  sort: string;
  sortOptions: Option[];
  viewerAvailable: boolean;
  children?: ReactNode;
  status: string;
  onSearchChange: (value: string) => void;
  onPresetChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onClear: () => void;
}

export function GitHubQueryToolbar({ view, search, preset, presets, sort, sortOptions, viewerAvailable, children, status, onSearchChange, onPresetChange, onSortChange, onClear }: GitHubQueryToolbarProps): ReactNode {
  const id = useId();
  const [draft, setDraft] = useState(search);
  useEffect(() => setDraft(search), [search]);
  useEffect(() => {
    if (view === "workflows") return;
    const timer = setTimeout(() => onSearchChange(draft), 300);
    return () => clearTimeout(timer);
  }, [draft, onSearchChange, view]);
  const placeholder = view === "workflows" ? "Search loaded runs" : view === "pullRequests" ? "Search open pull requests" : "Search open issues";
  return <div className="github-query-toolbar">
    <label className="github-query-field github-query-search" htmlFor={`${id}-search`}><span>Search</span><input id={`${id}-search`} type="search" value={draft} placeholder={placeholder} onChange={(event) => { setDraft(event.target.value); if (view === "workflows") onSearchChange(event.target.value); }} /></label>
    <label className="github-query-field"><span>Preset</span><select value={preset} onChange={(event) => onPresetChange(event.target.value)}>{presets.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select></label>
    {children}
    <label className="github-query-field"><span>Sort</span><select value={sort} onChange={(event) => onSortChange(event.target.value)}>{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <Button type="button" variant="outline" className="github-clear-filters" onClick={onClear}>Clear filters</Button>
    {!viewerAvailable && view !== "workflows" ? <span className="github-query-help">Sign in to GitHub to use Mine presets.</span> : null}
    <span className="sr-only" role="status" aria-live="polite">{status}</span>
  </div>;
}
