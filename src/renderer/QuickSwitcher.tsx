import {
  Check,
  Cloud,
  EyeOff,
  Folder,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitFork,
  GitMerge,
  Info,
  ListChecks,
  Navigation,
  Play,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Tag,
  TriangleAlert,
  type LucideIcon
} from "lucide-react";
import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { filterQuickSwitcherItems, type QuickSwitcherItem, type QuickSwitcherMode, type QuickSwitcherSection } from "./quickSwitcherItems";
import { RecentRepositoryVcsIcon, RepoSyncStatusChips } from "./SyncCountChip";
import { WORKSPACE_VIEW_ICONS } from "./workspaceViews";

/** Marks the switcher's dialog so global shortcuts can tell it apart from other dialogs. */
export const QUICK_SWITCHER_ATTRIBUTE = "data-quick-switcher";

const PLACEHOLDERS: Readonly<Record<QuickSwitcherMode, string>> = {
  all: "Switch repository, branch or view…",
  branches: "Branches",
  upstream: "Change upstream"
};

export interface QuickSwitcherProps {
  mode: QuickSwitcherMode;
  /** Unfiltered sections for the mode; the switcher filters them by the query. */
  sections: readonly QuickSwitcherSection[];
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (item: QuickSwitcherItem) => void;
  onClose: () => void;
  onModeChange: (mode: QuickSwitcherMode) => void;
  /** Wraps a row in a context menu. Return the row unchanged for items without one. */
  renderItemContextMenu?: ((item: QuickSwitcherItem, row: ReactElement) => ReactNode) | undefined;
  /** Shown as an alert in upstream mode only. */
  upstreamError?: string | undefined;
  /**
   * Moves focus after the switcher closed and dropped it. Returns whether it placed focus; otherwise focus returns to
   * the control that had it when the switcher opened.
   */
  restoreFocus?: (() => boolean) | undefined;
}

/**
 * The command palette that switches repositories, branches and views. It is presentational: the caller builds the
 * sections, owns the query and mode, and dispatches the chosen item. Mount it only while it is open.
 */
export function QuickSwitcher({
  mode,
  sections,
  query,
  onQueryChange,
  onSelect,
  onClose,
  onModeChange,
  renderItemContextMenu,
  upstreamError,
  restoreFocus
}: QuickSwitcherProps): ReactNode {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  // The control that had focus when the switcher opened, such as the header's branch pill. Mode changes keep it.
  const [opener] = useState(() => {
    const focused = document.activeElement;
    return focused instanceof HTMLElement && focused !== document.body ? focused : null;
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const visibleSections = useMemo(() => filterQuickSwitcherItems(sections, query), [query, sections]);
  const items = useMemo(() => visibleSections.flatMap((section) => section.items), [visibleSections]);
  const optionIds = useMemo(() => new Map(items.map((item, index) => [item.id, `${listId}-option-${index}`])), [items, listId]);
  const searching = query.trim().length > 0;
  const activeIndex = resolveActiveIndex(items, activeId, mode, searching);
  const activeItem = activeIndex >= 0 ? items[activeIndex] ?? null : null;
  const activeOptionId = activeItem ? optionIds.get(activeItem.id) : undefined;

  useEffect(() => {
    if (!activeOptionId) return;
    document.getElementById(activeOptionId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeOptionId]);

  const choose = (item: QuickSwitcherItem | null): void => {
    if (!item || item.disabled) return;
    onSelect(item);
  };

  const move = (target: number): void => {
    const item = items[Math.max(0, Math.min(items.length - 1, target))];
    if (item) setActiveId(item.id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!items.length) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      move((Math.max(0, activeIndex) + delta + items.length) % items.length);
    } else if (event.key === "Home" || event.key === "End") {
      // Home and End move the caret while the query has text, like any search field.
      if (searching) return;
      event.preventDefault();
      move(event.key === "Home" ? 0 : items.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(activeItem);
    } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      openActiveContextMenu();
    }
  };

  const openActiveContextMenu = (): void => {
    const row = activeOptionId ? document.getElementById(activeOptionId) : null;
    if (!row) return;
    const bounds = row.getBoundingClientRect();
    row.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + Math.min(32, bounds.width / 2),
      clientY: bounds.bottom
    }));
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        {...{ [QUICK_SWITCHER_ATTRIBUTE]: "" }}
        className="quick-switcher"
        showCloseButton={false}
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          // The switcher has no trigger, so Radix would leave focus on the document body.
          event.preventDefault();
          // A dialog or view opened from the switcher may already hold focus; only recover focus that was dropped.
          const focused = document.activeElement;
          if (focused && focused !== document.body && focused.isConnected) return;
          if (restoreFocus?.()) return;
          if (opener?.isConnected) opener.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (mode === "upstream") {
            event.preventDefault();
            onModeChange("branches");
          }
        }}
      >
        <DialogTitle className="sr-only">Quick switcher</DialogTitle>
        <div className="quick-switcher-search">
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label={PLACEHOLDERS[mode]}
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeOptionId}
            placeholder={PLACEHOLDERS[mode]}
            value={query}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              onQueryChange(event.currentTarget.value);
              setActiveId(null);
            }}
            onKeyDown={handleKeyDown}
          />
          <button type="button" className="quick-switcher-kbd" aria-label="Close quick switcher" onClick={onClose}>
            <kbd>Esc</kbd>
          </button>
        </div>
        {mode === "upstream" && upstreamError ? <p className="quick-switcher-error" role="alert">{upstreamError}</p> : null}
        <div id={listId} className="quick-switcher-list" role="listbox" aria-label="Quick switcher results">
          {visibleSections.map((section) => {
            const labelId = `${id}-section-${section.key}`;
            return (
              <div key={section.key} className="quick-switcher-section" role="group" aria-labelledby={labelId}>
                <div id={labelId} className="quick-switcher-section-label">{section.label}</div>
                {section.items.map((item) => {
                  const row = renderOption({
                    id: optionIds.get(item.id) ?? item.id,
                    item,
                    active: item.id === activeItem?.id,
                    onActivate: () => setActiveId(item.id),
                    onChoose: () => choose(item)
                  });
                  return <Fragment key={item.id}>{renderItemContextMenu ? renderItemContextMenu(item, row) : row}</Fragment>;
                })}
                {section.omittedCount ? (
                  <div className="quick-switcher-more" role="none">
                    {section.omittedCount === 1 ? "1 more remote branch. Type to search." : `${section.omittedCount} more remote branches. Type to search.`}
                  </div>
                ) : null}
              </div>
            );
          })}
          {items.length === 0 ? <p className="quick-switcher-empty" role="none">{searching ? "No matches." : "Nothing to show."}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Builds a row as a plain element so a context menu trigger can merge its props into it. */
function renderOption({ id, item, active, onActivate, onChoose }: {
  id: string;
  item: QuickSwitcherItem;
  active: boolean;
  onActivate: () => void;
  onChoose: () => void;
}): ReactElement {
  const Icon = getItemIcon(item);
  const repository = item.kind === "repository" || item.kind === "repair" ? item.payload : null;
  const kbd = item.kbd ? formatKbd(item.kbd) : null;
  const showReason = active && item.disabled && item.disabledReason;
  return (
    <div
      id={id}
      role="option"
      aria-label={item.label}
      aria-selected={active}
      aria-disabled={item.disabled ? "true" : undefined}
      aria-current={item.current || item.selected ? "true" : undefined}
      aria-keyshortcuts={item.kbd ? toAriaKeyShortcuts(item.kbd) : undefined}
      data-depth={item.depth ?? 0}
      data-kind={item.kind}
      className="quick-switcher-option"
      title={item.disabled ? item.disabledReason : undefined}
      onMouseMove={() => { if (!active) onActivate(); }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onChoose}
    >
      <span className="quick-switcher-option-icon" aria-hidden="true">
        {repository?.vcsKind && item.kind === "repository" && !repository.worktree
          ? <RecentRepositoryVcsIcon kind={repository.vcsKind} />
          : <Icon />}
      </span>
      <span className="quick-switcher-option-copy">
        <span className="quick-switcher-option-title">{item.title}</span>
        {repository?.labelDetail && !repository.worktree ? <span className="quick-switcher-option-label-detail">{repository.labelDetail}</span> : null}
        {item.detail ? <span className="quick-switcher-option-detail">{item.detail}</span> : null}
        {repository?.hidden ? <EyeOff className="quick-switcher-option-hidden" aria-hidden="true" /> : null}
      </span>
      {repository ? <RepoSyncStatusChips status={repository.syncStatus} /> : null}
      {showReason ? <span className="quick-switcher-option-reason">{item.disabledReason}</span> : null}
      {item.meta && !showReason ? <span className="quick-switcher-option-meta">{item.meta}</span> : null}
      {item.selected ? <Check className="quick-switcher-option-check" aria-hidden="true" /> : null}
      {kbd ? <kbd className="quick-switcher-option-kbd" aria-hidden="true">{kbd}</kbd> : null}
    </div>
  );
}

/**
 * The active row keeps its id across data refreshes. Without one, the switcher starts on the chosen upstream, on the
 * current branch in branch mode, or on the first row.
 */
function resolveActiveIndex(items: readonly QuickSwitcherItem[], activeId: string | null, mode: QuickSwitcherMode, searching: boolean): number {
  if (!items.length) return -1;
  if (activeId !== null) {
    const index = items.findIndex((item) => item.id === activeId);
    if (index >= 0) return index;
  }
  if (!searching) {
    const selected = items.findIndex((item) => item.selected);
    if (selected >= 0) return selected;
    if (mode === "branches") {
      const current = items.findIndex((item) => item.current && item.kind === "branch");
      if (current >= 0) return current;
    }
  }
  return 0;
}

const BRANCH_ACTION_ICONS: Readonly<Record<string, LucideIcon>> = {
  "new-branch": Plus,
  merge: GitMerge,
  rebase: GitFork,
  "checkout-tag": Tag,
  "add-worktree": FolderGit2,
  "manage-branches": SlidersHorizontal,
  "change-upstream": Cloud
};

function getItemIcon(item: QuickSwitcherItem): LucideIcon {
  switch (item.kind) {
    case "repository":
      return item.payload.worktree ? GitBranch : Folder;
    case "repair":
      return TriangleAlert;
    case "add-repository":
      return Plus;
    case "toggle-hidden-repositories":
      return EyeOff;
    case "organize-repositories":
      return ListChecks;
    case "branch":
      return item.payload.item.icon === "remote" ? Cloud : item.payload.item.icon === "worktree" ? FolderOpen : GitBranch;
    case "branch-action":
      return BRANCH_ACTION_ICONS[item.payload.action] ?? GitBranch;
    case "upstream":
      return item.payload.upstream ? GitBranch : Cloud;
    case "open-remote":
    case "manage-remotes":
    case "remote":
      return Cloud;
    case "repository-action":
      return Play;
    case "notice":
      return Info;
    case "view":
      return WORKSPACE_VIEW_ICONS[item.payload.view];
    case "settings":
    case "repository-settings":
      return Settings;
    case "navigate":
      return Navigation;
    default:
      return SlidersHorizontal;
  }
}

const IS_MAC = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

function formatKbd(kbd: string): string {
  return IS_MAC ? kbd.replace(/^Ctrl /, "⌘ ").replace(/^Alt /, "⌥ ") : kbd;
}

const ARIA_KEY_NAMES: Readonly<Record<string, string>> = { Ctrl: "Control", "←": "ArrowLeft", "→": "ArrowRight" };

/** "Ctrl B" → "Control+B"; "Alt ←" → "Alt+ArrowLeft". */
export function toAriaKeyShortcuts(kbd: string): string {
  return kbd.split(" ").filter(Boolean).map((part) => ARIA_KEY_NAMES[part] ?? part).join("+");
}
