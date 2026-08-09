import { ChevronDown, Loader2, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Button, TooltipButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
  compact?: boolean;
  activeFilterCount?: number;
  refreshDisabled?: boolean;
  refreshing?: boolean;
  onSearchChange: (value: string) => void;
  onPresetChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onClear: () => void;
  onRefresh?: () => void;
}

export function GitHubQueryToolbar({ view, search, preset, presets, sort, sortOptions, viewerAvailable, children, status, compact = false, activeFilterCount = 0, refreshDisabled = false, refreshing = false, onSearchChange, onPresetChange, onSortChange, onClear, onRefresh }: GitHubQueryToolbarProps): ReactNode {
  const id = useId();
  const [draft, setDraft] = useState(search);
  useEffect(() => setDraft(search), [search]);
  useEffect(() => {
    if (view === "workflows" || draft === search) return;
    const timer = setTimeout(() => onSearchChange(draft), 300);
    return () => clearTimeout(timer);
  }, [draft, onSearchChange, search, view]);
  const placeholder = view === "workflows" ? "Search loaded runs" : view === "pullRequests" ? "Search open pull requests" : "Search open issues";
  const displayedPlaceholder = compact && view === "pullRequests" ? "Search pull requests" : placeholder;

  if (compact) {
    return <div className="github-query-toolbar github-query-toolbar-compact">
      <label className="github-compact-search" htmlFor={`${id}-search`}>
        <span className="sr-only">Search</span>
        <Search aria-hidden="true" />
        <input id={`${id}-search`} type="search" value={draft} placeholder={displayedPlaceholder} onChange={(event) => setDraft(event.target.value)} />
      </label>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="github-filter-trigger" aria-label={`Filters, ${activeFilterCount} active`}>
            <SlidersHorizontal />
            Filters
            <span className="github-filter-count" aria-hidden="true">{activeFilterCount}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="github-filter-popover" align="start">
          <div className="github-filter-popover-header">
            <div>
              <p className="font-medium">Filters</p>
              <p className="text-xs text-muted-foreground">Narrow the loaded pull requests.</p>
            </div>
            <span className="github-filter-count" aria-label={`${activeFilterCount} active filters`}>{activeFilterCount}</span>
          </div>
          <label className="github-query-field" htmlFor={`${id}-preset`}><span>Preset</span><select id={`${id}-preset`} value={preset} onChange={(event) => onPresetChange(event.target.value)}>{presets.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select></label>
          {children}
          {!viewerAvailable && view !== "workflows" ? <span className="github-query-help">Sign in to GitHub to use Mine presets.</span> : null}
          <Button type="button" variant="outline" className="github-clear-filters" onClick={onClear}>Clear filters</Button>
        </PopoverContent>
      </Popover>
      <CompactSortMenu value={sort} options={sortOptions} onValueChange={onSortChange} />
      {onRefresh ? <TooltipButton type="button" variant="outline" size="icon" className="github-query-refresh" disabled={refreshDisabled || refreshing} aria-label="Refresh pull requests" tooltip="Refresh pull requests" onClick={onRefresh}>
        {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      </TooltipButton> : null}
      <span className="sr-only" role="status" aria-live="polite">{status}</span>
    </div>;
  }

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

function CompactSortMenu({ value, options, onValueChange }: { value: string; options: Option[]; onValueChange: (value: string) => void }): ReactNode {
  const selected = options.find((option) => option.value === value) ?? options[0];
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="outline" className="github-compact-sort" aria-label={`Sort: ${selected?.label ?? "Choose sorting"}`}>
        <span>Sort:</span>
        <span className="github-compact-sort-value">{selected?.label ?? "Choose sorting"}</span>
        <ChevronDown aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="github-sort-menu">
      <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
        {options.map((option) => <DropdownMenuRadioItem key={option.value} value={option.value} {...(option.disabled === undefined ? {} : { disabled: option.disabled })}>{option.label}</DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
