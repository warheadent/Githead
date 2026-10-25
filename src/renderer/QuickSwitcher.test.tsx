// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { gitCapabilities, type AppUpdateState, type RepoSummary } from "../shared/types";
import { QuickSwitcher, toAriaKeyShortcuts } from "./QuickSwitcher";
import {
  buildQuickSwitcherSections,
  type QuickSwitcherInput,
  type QuickSwitcherItem,
  type QuickSwitcherMode
} from "./quickSwitcherItems";
import { normalizeRepositoryOrganization } from "./repositoryOrganization";

const repoPath = "D:\\Githead";
const other = "D:\\Work\\Other";

function createSummary(overrides: Partial<RepoSummary> = {}): RepoSummary {
  return {
    repoPath,
    kind: "git",
    capabilities: gitCapabilities(),
    isValid: true,
    branch: "main",
    currentTag: null,
    upstream: "origin/main",
    branches: [
      { name: "main", current: true, upstream: "origin/main" },
      { name: "feature/nav", current: false, upstream: null }
    ],
    hasHead: true,
    remotes: [
      { name: "origin", url: "https://github.com/acme/githead.git", direction: "fetch" },
      { name: "origin", url: "https://github.com/acme/githead.git", direction: "push" }
    ],
    remoteBranches: [
      { name: "origin/main", remote: "origin", branch: "main" },
      { name: "origin/release", remote: "origin", branch: "release" }
    ],
    defaultRemoteBranch: { name: "origin/main", remote: "origin", branch: "main" },
    commitsAheadOfDefaultBranch: 0,
    githubRepository: null,
    ahead: null,
    behind: null,
    files: [],
    operationState: null,
    validationErrors: [],
    safeDirectory: null,
    actionsConfig: {
      hasGitheadDir: true,
      actions: [{ name: "Test", command: "npm test", description: "", shell: "powershell" }],
      error: "",
      shared: { exists: true, actions: [], error: "", writable: true, blockedReason: "", target: "shared", fileName: "actions.json" },
      local: { exists: true, actions: [], error: "", writable: true, blockedReason: "", target: "local", fileName: "actions.local.json" }
    },
    ...overrides
  };
}

const idleUpdate: AppUpdateState = {
  enabled: false,
  status: "disabled",
  currentVersion: "1.0.0",
  availableVersion: null,
  downloadedVersion: null,
  downloadPercent: null,
  checkedAt: null,
  message: null,
  releaseNotes: null,
  errorContext: null,
  canRetry: false
};

function createInput(overrides: Partial<QuickSwitcherInput> = {}): QuickSwitcherInput {
  return {
    repoPath,
    repoRecents: [repoPath, other],
    repositoryGroups: [],
    organization: normalizeRepositoryOrganization({}),
    repoSyncStatuses: {},
    showHidden: false,
    searching: false,
    running: false,
    summary: createSummary(),
    stashCount: 0,
    pullRequestCount: null,
    issueCount: null,
    activityAttention: "none",
    activeView: "status",
    branchPullRequests: [],
    hasPullRequestData: false,
    appUpdate: idleUpdate,
    canGoBack: false,
    canGoForward: false,
    ...overrides
  };
}

interface HarnessProps {
  mode?: QuickSwitcherMode;
  input?: QuickSwitcherInput;
  upstreamError?: string;
  renderItemContextMenu?: (item: QuickSwitcherItem, row: ReactElement) => ReactNode;
}

function renderSwitcher({ mode: initialMode = "all", input = createInput(), upstreamError, renderItemContextMenu }: HarnessProps = {}) {
  const onSelect = vi.fn<(item: QuickSwitcherItem) => void>();
  const onClose = vi.fn<() => void>();
  const onModeChange = vi.fn<(mode: QuickSwitcherMode) => void>();

  function Harness(): ReactNode {
    const [mode, setMode] = useState<QuickSwitcherMode>(initialMode);
    const [query, setQuery] = useState("");
    return (
      <QuickSwitcher
        mode={mode}
        sections={buildQuickSwitcherSections(mode, { ...input, searching: query.trim().length > 0 })}
        query={query}
        onQueryChange={setQuery}
        onSelect={onSelect}
        onClose={onClose}
        onModeChange={(next) => {
          onModeChange(next);
          setQuery("");
          setMode(next);
        }}
        renderItemContextMenu={renderItemContextMenu}
        upstreamError={upstreamError}
      />
    );
  }

  render(<TooltipProvider><Harness /></TooltipProvider>);
  return { onSelect, onClose, onModeChange };
}

function searchField(): HTMLElement {
  return screen.getByRole("combobox");
}

function activeOption(): HTMLElement {
  const id = searchField().getAttribute("aria-activedescendant");
  const option = id ? document.getElementById(id) : null;
  if (!option) throw new Error("No active option.");
  return option;
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("QuickSwitcher", () => {
  it("names the dialog, the search field and the one results listbox, and labels each section group", () => {
    renderSwitcher();

    const dialog = screen.getByRole("dialog", { name: "Quick switcher" });
    const field = within(dialog).getByRole("combobox", { name: "Switch repository, branch or view…" });
    expect(field.getAttribute("placeholder")).toBe("Switch repository, branch or view…");
    expect(document.activeElement).toBe(field);
    const listboxes = within(dialog).getAllByRole("listbox");
    expect(listboxes).toHaveLength(1);
    expect(listboxes[0]?.getAttribute("aria-label")).toBe("Quick switcher results");
    expect(field.getAttribute("aria-controls")).toBe(listboxes[0]?.id);
    expect(within(dialog).queryByRole("listbox", { name: "Repositories" })).toBeNull();

    const repositories = within(dialog).getByRole("group", { name: "Repositories" });
    expect(within(repositories).getByRole("option", { name: `Switch to ${other}` })).toBeTruthy();
    expect(within(dialog).getByRole("group", { name: "Branches" })).toBeTruthy();
    expect(within(dialog).getByRole("group", { name: "Go to" })).toBeTruthy();
    expect(within(within(dialog).getByRole("group", { name: "Repository actions" })).getByRole("option", { name: "Test" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Close quick switcher" })).toBeTruthy();
  });

  it.each([
    ["branches", "Branches"],
    ["upstream", "Change upstream"]
  ] as const)("uses the %s mode placeholder", (mode, placeholder) => {
    renderSwitcher({ mode });

    const field = screen.getByRole("combobox", { name: placeholder });
    expect(field.getAttribute("placeholder")).toBe(placeholder);
    expect(screen.queryByRole("group", { name: "Repositories" })).toBeNull();
  });

  it("marks the open repository and branch as current and blocked rows as disabled", () => {
    renderSwitcher({ input: createInput({ running: true }) });

    const current = screen.getByRole("option", { name: `Switch to ${repoPath}` });
    expect(current.getAttribute("aria-current")).toBe("true");
    expect(current.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("option", { name: `Switch to ${other}` }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("option", { name: "main, current" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("option", { name: "Settings" }).getAttribute("aria-disabled")).toBeNull();
  });

  it("moves the active row with the arrow, Home and End keys and runs it with Enter", () => {
    const { onSelect } = renderSwitcher();
    const field = searchField();

    const first = activeOption();
    expect(first.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(field, { key: "ArrowDown" });
    const second = activeOption();
    expect(second).not.toBe(first);
    expect(second.getAttribute("aria-label")).toBe(`Switch to ${other}`);
    expect(second.getAttribute("aria-selected")).toBe("true");
    expect(first.getAttribute("aria-selected")).toBe("false");

    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({ kind: "repository", payload: { path: other } });

    fireEvent.keyDown(field, { key: "End" });
    const options = screen.getAllByRole("option");
    expect(activeOption()).toBe(options.at(-1));
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(activeOption()).toBe(options[0]);
    fireEvent.keyDown(field, { key: "ArrowUp" });
    expect(activeOption()).toBe(options.at(-1));
    fireEvent.keyDown(field, { key: "Home" });
    expect(activeOption()).toBe(options[0]);
  });

  it("does not run a disabled row", () => {
    const { onSelect } = renderSwitcher({ input: createInput({ running: true }) });

    fireEvent.keyDown(searchField(), { key: "ArrowDown" });
    expect(activeOption().getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(searchField(), { key: "Enter" });
    fireEvent.click(activeOption());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("filters rows as the user types and runs a clicked row", () => {
    const { onSelect } = renderSwitcher();

    fireEvent.change(searchField(), { target: { value: "feature" } });
    expect(screen.queryByRole("group", { name: "Repositories" })).toBeNull();
    const option = screen.getByRole("option", { name: "feature/nav" });
    expect(activeOption()).toBe(option);

    fireEvent.click(option);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ kind: "branch", title: "feature/nav" }));
  });

  it("starts branch mode on the current branch", () => {
    renderSwitcher({ mode: "branches" });

    expect(activeOption().getAttribute("aria-label")).toBe("main, current");
    expect(screen.getByRole("group", { name: "Local" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Actions" })).toBeTruthy();
  });

  it("puts keyboard shortcut hints on the option without changing its name", () => {
    renderSwitcher();

    const settings = screen.getByRole("option", { name: "Settings" });
    expect(settings.getAttribute("aria-keyshortcuts")).toBe("Control+,");
    expect(settings.querySelector("kbd")?.getAttribute("aria-hidden")).toBe("true");
    expect(toAriaKeyShortcuts("Alt ←")).toBe("Alt+ArrowLeft");
  });

  it("opens the active row's context menu with Shift+F10 and the context menu key", async () => {
    renderSwitcher({
      renderItemContextMenu: (item, row) => item.kind === "repository" ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>Rename {item.title}</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ) : row
    });

    fireEvent.keyDown(searchField(), { key: "ArrowDown" });
    fireEvent.keyDown(searchField(), { key: "F10", shiftKey: true });
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Rename Other" })).toBeTruthy();

    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.keyDown(searchField(), { key: "ContextMenu" });
    expect(await screen.findByRole("menu")).toBeTruthy();
  });

  it("returns to branch mode when Escape is pressed in upstream mode and closes otherwise", () => {
    const { onClose, onModeChange } = renderSwitcher({ mode: "upstream" });

    expect(screen.getByRole("option", { name: "origin/main, current" }).getAttribute("aria-current")).toBe("true");
    fireEvent.keyDown(searchField(), { key: "Escape" });
    expect(onModeChange).toHaveBeenCalledWith("branches");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Branches" })).toBeTruthy();

    fireEvent.keyDown(searchField(), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the upstream error only in upstream mode", () => {
    renderSwitcher({ mode: "upstream", upstreamError: "Unable to change upstream." });
    expect(screen.getByRole("alert").textContent).toBe("Unable to change upstream.");
    cleanup();

    renderSwitcher({ mode: "branches", upstreamError: "Unable to change upstream." });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("closes from the Escape hint", () => {
    const { onClose } = renderSwitcher();

    fireEvent.click(screen.getByRole("button", { name: "Close quick switcher" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
