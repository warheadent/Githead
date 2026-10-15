// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { Tabs } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  gitCapabilities,
  loreCapabilities,
  type GitConfiguredAction,
  type GitPullRecovery,
  type RepoSummary
} from "../shared/types";
import { createActionsConfig, createSummary, createUpdateState, repoPath } from "./AppTestHarness";
import { emptyCloneDraft } from "./cloneRepository";
import type { ConfiguredActionRun } from "./configuredActionMenu";
import { OPERATION_BUTTON_FEEDBACK_HOLD_MS } from "./OperationButtonFeedback";
import { RepositoryHeader, type RepositoryHeaderProps } from "./RepositoryHeader";
import { RepositoryOmnibox } from "./RepositoryOmnibox";

const pushRemotes: RepoSummary["remotes"] = [
  { name: "origin", url: "https://example.test/repo.git", direction: "fetch" },
  { name: "origin", url: "https://example.test/repo.git", direction: "push" }
];

const pullRecovery: GitPullRecovery = {
  branchName: "main",
  upstreamName: "origin/main",
  oldUpstreamOid: "a".repeat(40),
  newUpstreamOid: "b".repeat(40),
  originalHeadOid: "c".repeat(40),
  localCommitCount: 2,
  hasWorkingChanges: false,
  canReapply: true,
  phase: "ready"
};

function configuredAction(name: string, overrides: Partial<GitConfiguredAction> = {}): GitConfiguredAction {
  return { name, description: "", command: "npm run example", shell: "powershell", ...overrides };
}

function run(name: string, overrides: Partial<ConfiguredActionRun> = {}): ConfiguredActionRun {
  return {
    id: 1,
    operationId: `operation-${name}`,
    name,
    repoPath,
    startedAt: Date.now(),
    cancelStatus: "idle",
    cancelError: "",
    ...overrides
  };
}

function headerProps(overrides: Partial<RepositoryHeaderProps> = {}): RepositoryHeaderProps {
  return {
    repoPath,
    displayName: "Githead",
    summary: createSummary(),
    isMaximized: false,
    changesCount: 0,
    guestView: null,
    guestCount: null,
    activityAttention: "none",
    actionHeading: "Ready",
    runningAction: null,
    feedbackEvent: null,
    configuredActionRuns: [],
    configuredActionOutcome: null,
    disabled: false,
    pullRecovery: null,
    cancellable: false,
    cancelStatus: "idle",
    cancelLabel: "Cancel",
    cancelingLabel: "Cancelling",
    appUpdate: createUpdateState(),
    onOpenSwitcher: vi.fn(),
    onCloseGuest: vi.fn(),
    addViewOptions: [
      { view: "stashes", title: "Stashes", label: "Stashes 2", meta: "2" },
      { view: "activity", title: "Activity log", label: "Activity log" }
    ],
    onOpenView: vi.fn(),
    onRunAction: vi.fn(),
    onPullWithAction: vi.fn(),
    onOpenPushToBranch: vi.fn(),
    onRunConfiguredAction: vi.fn(),
    onManageActions: vi.fn(),
    onCancel: vi.fn(),
    onCancelOperation: vi.fn(),
    onCheckForUpdates: vi.fn(),
    onDownloadUpdate: vi.fn(),
    onInstallUpdate: vi.fn(),
    onMinimize: vi.fn(),
    onToggleMaximize: vi.fn(),
    onCloseWindow: vi.fn(),
    ...overrides
  };
}

function Harness({ children, value = "status", onValueChange }: {
  children: ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
}): ReactNode {
  return (
    <TooltipProvider>
      <Tabs value={value} {...(onValueChange ? { onValueChange } : {})}>
        {children}
      </Tabs>
    </TooltipProvider>
  );
}

function renderHeader(
  overrides: Partial<RepositoryHeaderProps> = {},
  options: { value?: string; onValueChange?: (value: string) => void } = {}
) {
  const props = headerProps(overrides);
  const view = render(<Harness {...options}><RepositoryHeader {...props} /></Harness>);
  return {
    ...view,
    props,
    rerenderHeader(next: Partial<RepositoryHeaderProps>) {
      view.rerender(<Harness {...options}><RepositoryHeader {...props} {...next} /></Harness>);
    }
  };
}

/** The header with the add-repository omnibox anchored to the switcher, as the app shell wires it. */
function AnchoredHeader(): ReactNode {
  const switcherRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(true);
  return (
    <Harness>
      <RepositoryHeader
        {...headerProps({
          repoSwitcherRef: switcherRef,
          renderRepositoryMenuItems: () => <ContextMenuItem>Show in Explorer</ContextMenuItem>,
          wrapRepoSwitcher: (node) => (
            <RepositoryOmnibox
              anchor={node}
              returnFocusRef={switcherRef}
              open={open}
              disabled={false}
              onOpenChange={setOpen}
              onOpenLocal={vi.fn()}
              onConnectGitHub={vi.fn()}
              onAbandonCheck={vi.fn()}
              cloneDraft={emptyCloneDraft}
              cloneError=""
              cloneRunning={false}
              cloneCheckRunning={false}
              cloneCheckStatus="idle"
              cloneCheckMessage=""
              cloneBranches={[]}
              cancelStatus="idle"
              cancelError=""
              onCloneDraftChange={vi.fn()}
              onCloneSourceChange={vi.fn()}
              onChooseCloneParent={vi.fn()}
              onCheckRepositoryAccess={vi.fn()}
              onClone={vi.fn()}
              onCancelOperation={vi.fn()}
            />
          )
        })}
      />
      <button type="button" onClick={() => setOpen(true)}>Open add repository</button>
      <input aria-label="Commit message" />
    </Harness>
  );
}

function gitActions(): HTMLElement {
  return screen.getByRole("group", { name: "Git actions" });
}

function segment(name: string | RegExp): HTMLElement {
  return within(gitActions()).getByRole("button", { name });
}

function openMenuWithKeyboard(trigger: HTMLElement): void {
  act(() => {
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("RepositoryHeader", () => {
  it("is memoised", () => {
    expect((RepositoryHeader as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for("react.memo"));
  });

  it("renders the header strip with workspace navigation, views, Git actions and window controls", () => {
    const { container } = renderHeader({ isMaximized: true });

    const header = container.querySelector("header.repository-header");
    expect(header?.getAttribute("data-maximized")).toBe("true");
    const navigation = screen.getByRole("navigation", { name: "Workspace navigation" });
    expect(within(navigation).getByRole("button", { name: "Switch repository: Githead" }).getAttribute("aria-haspopup")).toBe("dialog");
    expect(within(navigation).getByRole("button", { name: "Switch branch" })).toBeTruthy();
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(gitActions()).toBeTruthy();
    expect(screen.getByRole("button", { name: "More" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Minimize window" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restore window" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close window" })).toBeTruthy();
  });

  it("keeps only the repository switcher, More and window controls for an invalid repository", () => {
    renderHeader({ summary: createSummary({ isValid: false, branch: null, upstream: null }) });

    expect(screen.getByRole("navigation", { name: "Workspace navigation" })).toBeTruthy();
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Switch repository: Githead",
      "More",
      "Minimize window",
      "Maximize window",
      "Close window"
    ]);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("group", { name: "Git actions" })).toBeNull();
  });

  it("announces the operation heading in a polite live paragraph without a status role", () => {
    const { rerenderHeader } = renderHeader({ actionHeading: "Fetch running" });

    const heading = screen.getByText("Fetch running");
    expect(heading.tagName).toBe("P");
    expect(heading.getAttribute("aria-live")).toBe("polite");
    expect(heading.className).toContain("sr-only");
    expect(screen.queryByRole("status")).toBeNull();

    rerenderHeader({ actionHeading: "Rebase recovery required" });
    expect(screen.getByText("Rebase recovery required")).toBe(heading);
  });

  describe("repository switcher", () => {
    it("opens the switcher on all sections", async () => {
      const user = userEvent.setup();
      const { props } = renderHeader({ displayName: "my-alias" });

      const switcher = screen.getByRole("button", { name: "Switch repository: my-alias" });
      expect(switcher.textContent).toContain("my-alias");
      await user.click(switcher);

      expect(props.onOpenSwitcher).toHaveBeenCalledWith("all");
    });

    it("shows the repository context menu items for the open repository", async () => {
      const onSettings = vi.fn();
      renderHeader({
        renderRepositoryMenuItems: () => <ContextMenuItem onSelect={onSettings}>Repository settings…</ContextMenuItem>
      });

      fireEvent.contextMenu(screen.getByRole("button", { name: "Switch repository: Githead" }));
      const menu = await screen.findByRole("menu");
      expect(within(menu).getByText(repoPath)).toBeTruthy();
      fireEvent.click(within(menu).getByRole("menuitem", { name: "Repository settings…" }));

      expect(onSettings).toHaveBeenCalledOnce();
    });

    it("anchors the add-repository popover below the switcher and returns focus to it", async () => {
      const user = userEvent.setup();
      render(<AnchoredHeader />);

      const popover = await screen.findByRole("dialog", { name: "Add repository" });
      expect(popover.getAttribute("data-anchored")).toBe("true");
      expect(popover.getAttribute("data-side")).toBe("bottom");
      // Radix parks content without a measured anchor at translate(0, -200%); an anchored one gets pixel offsets.
      const popper = popover.closest<HTMLElement>("[data-radix-popper-content-wrapper]");
      await waitFor(() => expect(popper?.style.transform).toMatch(/^translate\(-?[\d.]+px, -?[\d.]+px\)$/));
      await user.type(screen.getByRole("combobox", { name: "Search repositories or paste a source" }), "draft");
      await user.keyboard("{Escape}");

      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add repository" })).toBeNull());
      const switcher = screen.getByRole("button", { name: "Switch repository: Githead" });
      expect(document.activeElement).toBe(switcher);

      await user.click(screen.getByRole("button", { name: "Open add repository" }));
      expect((await screen.findByRole("combobox", { name: "Search repositories or paste a source" }) as HTMLInputElement).value).toBe("");

      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add repository" })).toBeNull());
      fireEvent.contextMenu(switcher);
      expect(await screen.findByRole("menuitem", { name: "Show in Explorer" })).toBeTruthy();
    });

    it("leaves focus where an outside click put it when the anchored popover closes", async () => {
      const user = userEvent.setup();
      render(<AnchoredHeader />);
      await screen.findByRole("dialog", { name: "Add repository" });

      const outside = screen.getByRole("textbox", { name: "Commit message" });
      await user.click(outside);

      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add repository" })).toBeNull());
      // FocusScope restores focus in a timeout after unmount, so let that timeout run first.
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
      expect(document.activeElement).toBe(outside);
    });
  });

  describe("branch pill", () => {
    it.each([
      ["a branch", { branch: "main" }, "main"],
      ["a tag", { branch: null, currentTag: "v2", upstream: null }, "Tag: v2"],
      ["a detached HEAD", { branch: null, currentTag: null, upstream: null }, "Detached HEAD"]
    ] as const)("names %s", (_kind, summary, text) => {
      renderHeader({ summary: createSummary(summary) });

      const pill = screen.getByRole("button", { name: "Switch branch" });
      expect(pill.textContent).toContain(text);
      expect(pill.textContent).not.toContain("local");
    });

    it("flags a branch without an upstream as local when upstreams can be set", () => {
      const { rerenderHeader } = renderHeader({ summary: createSummary({ branch: "feature/nav", upstream: null }) });

      const pill = screen.getByRole("button", { name: "Switch branch" });
      expect(pill.textContent).toContain("feature/nav");
      expect(pill.textContent).toContain("local");
      const description = (pill.getAttribute("aria-describedby") ?? "").split(" ")
        .map((id) => document.getElementById(id)?.textContent)
        .join(" ");
      expect(description).toBe("feature/nav local");

      rerenderHeader({
        summary: createSummary({ kind: "lore", capabilities: loreCapabilities(), branch: "feature/nav", upstream: null })
      });
      expect(screen.getByRole("button", { name: "Switch branch" }).textContent).not.toContain("local");
    });

    it("stays enabled while an operation runs and opens the branch switcher", async () => {
      const user = userEvent.setup();
      const { props } = renderHeader({ disabled: true, runningAction: "fetch", actionHeading: "Fetch running" });

      const pill = screen.getByRole("button", { name: "Switch branch" }) as HTMLButtonElement;
      expect(pill.disabled).toBe(false);
      await user.click(pill);

      expect(props.onOpenSwitcher).toHaveBeenCalledWith("branches");
    });

    it("is disabled until a repository summary is available", () => {
      renderHeader({ summary: null });

      expect((screen.getByRole("button", { name: "Switch branch" }) as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe("view switch", () => {
    it("names Changes with its count and switches views through the caller's Tabs root", () => {
      const onValueChange = vi.fn();
      const { rerenderHeader } = renderHeader({ changesCount: 5 }, { onValueChange });

      const changes = screen.getByRole("tab", { name: "Changes 5" });
      expect(changes.getAttribute("aria-selected")).toBe("true");
      expect(changes.querySelector(".workspace-tab-count")?.textContent).toBe("5");
      fireEvent.mouseDown(screen.getByRole("tab", { name: "History" }), { button: 0 });
      expect(onValueChange).toHaveBeenCalledWith("history");

      rerenderHeader({ changesCount: 0 });
      expect(screen.getByRole("tab", { name: "Changes" }).querySelector(".workspace-tab-count")).toBeNull();
      expect(screen.getAllByRole("tab")).toHaveLength(2);
    });

    it("opens a guest view from the + menu, outside the tablist, and reaches the quick switcher from it", async () => {
      const user = userEvent.setup();
      const { props } = renderHeader({ guestView: "activity" }, { value: "activity" });

      const add = screen.getByRole("button", { name: "Open a view" });
      expect(screen.getByRole("tablist").contains(add)).toBe(false);
      await user.click(add);
      const stashes = await screen.findByRole("menuitem", { name: "Stashes 2" });
      expect(screen.getByRole("menuitem", { name: "Activity log, open" })).toBeTruthy();
      await user.click(stashes);
      expect(props.onOpenView).toHaveBeenCalledWith("stashes");

      await user.click(screen.getByRole("button", { name: "Open a view" }));
      await user.click(await screen.findByRole("menuitem", { name: /Quick switcher/ }));
      expect(props.onOpenSwitcher).toHaveBeenCalledWith("all");
    });

    it("adds one guest segment with its count and a close button outside the tablist", async () => {
      const user = userEvent.setup();
      const { props, rerenderHeader } = renderHeader({ guestView: "pullRequests", guestCount: "4" }, { value: "pullRequests" });

      const guest = screen.getByRole("tab", { name: "Pull requests 4" });
      expect(guest.getAttribute("aria-selected")).toBe("true");
      expect(guest.getAttribute("data-attention")).toBeNull();
      const close = screen.getByRole("button", { name: "Close Pull requests view" });
      expect(screen.getByRole("tablist").contains(close)).toBe(false);
      await user.click(close);
      expect(props.onCloseGuest).toHaveBeenCalledOnce();

      rerenderHeader({ guestView: "stashes", guestCount: 0 });
      expect(screen.getByRole("tab", { name: "Stashes" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Close Stashes view" })).toBeTruthy();

      rerenderHeader({ guestView: "workflows", guestCount: null });
      expect(screen.getAllByRole("tab").map((tab) => tab.getAttribute("aria-label") ?? tab.textContent)).toEqual([
        "Changes",
        "History",
        "Workflow runs"
      ]);
    });

    it("moves focus to the tab that becomes active when the guest is closed from its close button", async () => {
      const user = userEvent.setup();
      /** Mirrors the app: closing an active guest hands over to Changes, otherwise the active view stays. */
      function ClosingHeader({ initialValue }: { initialValue: string }): ReactNode {
        const [value, setValue] = useState(initialValue);
        const [guestView, setGuestView] = useState<RepositoryHeaderProps["guestView"]>("stashes");
        return (
          <Harness value={value} onValueChange={setValue}>
            <RepositoryHeader
              {...headerProps({
                changesCount: 68,
                guestView,
                guestCount: 2,
                onCloseGuest: () => {
                  if (value === guestView) setValue("status");
                  setGuestView(null);
                }
              })}
            />
          </Harness>
        );
      }

      const { unmount } = render(<ClosingHeader initialValue="stashes" />);
      screen.getByRole("button", { name: "Close Stashes view" }).focus();
      await user.keyboard("{Enter}");
      expect(screen.queryByRole("tab", { name: /^Stashes/ })).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Changes 68", selected: true }));
      unmount();

      render(<ClosingHeader initialValue="history" />);
      screen.getByRole("button", { name: "Close Stashes view" }).focus();
      await user.keyboard(" ");
      expect(document.activeElement).toBe(screen.getByRole("tab", { name: "History", selected: true }));
    });

    it("gives every tab a hidden icon for narrow headers, so the label keeps naming the tab", () => {
      renderHeader({ guestView: "stashes", guestCount: 2 }, { value: "stashes" });

      for (const tab of screen.getAllByRole("tab")) {
        const icon = tab.querySelector(".view-switch-icon");
        expect(icon?.getAttribute("aria-hidden")).toBe("true");
        expect(tab.querySelector(".view-switch-label")?.textContent).toBeTruthy();
      }
      expect(screen.getByRole("tab", { name: "History" })).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Stashes 2" })).toBeTruthy();
    });

    it("marks an activity log guest with its attention", () => {
      const { rerenderHeader } = renderHeader({ guestView: "activity", activityAttention: "unread" });

      const guest = screen.getByRole("tab", { name: "Activity log, unread output available" });
      expect(guest.getAttribute("data-attention")).toBe("unread");
      expect(guest.querySelector(".header-attention-dot")).toBeTruthy();

      rerenderHeader({ guestView: "activity", activityAttention: "error" });
      expect(screen.getByRole("tab", { name: "Activity log, unread error details available" }).getAttribute("data-attention")).toBe("error");

      rerenderHeader({ guestView: "activity", activityAttention: "none" });
      const quiet = screen.getByRole("tab", { name: "Activity log" });
      expect(quiet.getAttribute("data-attention")).toBe("none");
      expect(quiet.querySelector(".header-attention-dot")).toBeNull();
    });
  });

  describe("Git actions", () => {
    it("orders Repository actions, Fetch, Pull, Push and the pull and push menu", () => {
      renderHeader();

      expect(within(gitActions()).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
        "Repository actions",
        "Fetch",
        "Pull",
        "Push",
        "More pull and push actions"
      ]);
    });

    it("puts Cancel first while an operation can be cancelled", async () => {
      const user = userEvent.setup();
      const { props, rerenderHeader } = renderHeader({ cancellable: true });

      const cancel = within(gitActions()).getAllByRole("button")[0]!;
      expect(cancel.textContent).toBe("Cancel");
      await user.click(cancel);
      expect(props.onCancel).toHaveBeenCalledOnce();

      rerenderHeader({ cancellable: true, cancelStatus: "canceling" });
      expect((within(gitActions()).getByRole("button", { name: "Cancelling" }) as HTMLButtonElement).disabled).toBe(true);
      rerenderHeader({ cancellable: true, cancelStatus: "error" });
      expect(within(gitActions()).getByRole("button", { name: "Retry Cancel" })).toBeTruthy();
      rerenderHeader({ cancellable: true, cancelLabel: "Stop", cancelingLabel: "Stopping…", cancelStatus: "canceling" });
      expect(within(gitActions()).getByRole("button", { name: "Stopping…" })).toBeTruthy();
      rerenderHeader({ cancellable: false });
      expect(within(gitActions()).queryByRole("button", { name: /Cancel|Stop/ })).toBeNull();
    });

    it("dims segments with nothing to move and shows counts on the segments they affect", () => {
      const { rerenderHeader } = renderHeader({ summary: createSummary({ ahead: 0, behind: 0 }) });

      expect(segment("Fetch").getAttribute("data-idle")).toBe("false");
      expect(segment("Pull").getAttribute("data-idle")).toBe("true");
      expect(segment("Push").getAttribute("data-idle")).toBe("true");
      expect(gitActions().querySelector(".sync-count-chip")).toBeNull();

      rerenderHeader({ summary: createSummary({ ahead: 3, behind: 2 }) });
      const pull = segment("Pull 2 commits");
      const push = segment("Push 3 commits");
      expect(pull.getAttribute("data-idle")).toBe("false");
      expect(push.getAttribute("data-idle")).toBe("false");
      expect(pull.querySelector(".sync-count-chip")?.textContent).toBe("2");
      expect(push.querySelector(".sync-count-chip")?.textContent).toBe("3");
      expect(pull.getAttribute("data-variant")).toBe("ghost");
      expect(push.getAttribute("data-variant")).toBe("ghost");

      rerenderHeader({ summary: createSummary({ ahead: 0, behind: 4 }) });
      expect(segment("Pull 4 commits").getAttribute("data-idle")).toBe("false");
      expect(segment("Push").getAttribute("data-idle")).toBe("true");
    });

    it("reads Publish for a branch without an upstream", async () => {
      const user = userEvent.setup();
      const { props } = renderHeader({ summary: createSummary({ branch: "feature/nav", upstream: null, remotes: pushRemotes }) });

      const publish = segment("Publish branch");
      expect(publish.textContent).toContain("Publish");
      expect(publish.getAttribute("data-idle")).toBe("false");
      expect(segment("Pull").getAttribute("data-idle")).toBe("true");
      await user.click(publish);

      expect(props.onRunAction).toHaveBeenCalledWith("push");
    });

    it("reads Sync for Lore and hides Fetch and the pull and push menu", () => {
      renderHeader({
        summary: createSummary({
          kind: "lore",
          capabilities: loreCapabilities(),
          upstream: null,
          actionsConfig: createActionsConfig({ actions: [configuredAction("Deploy", { bindToPull: true })] })
        })
      });

      expect(within(gitActions()).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
        "Repository actions",
        "Sync",
        "Push"
      ]);
      expect(segment("Sync").textContent).toContain("Sync");
      expect(segment("Sync").getAttribute("data-idle")).toBe("false");
      expect(segment("Push").getAttribute("data-idle")).toBe("false");
    });

    it("reads Resolve while pull recovery is pending", async () => {
      const user = userEvent.setup();
      const { props } = renderHeader({
        pullRecovery,
        summary: createSummary({ actionsConfig: createActionsConfig({ actions: [configuredAction("Deploy", { bindToPull: true })] }) })
      });

      const resolve = segment("Resolve remote history change");
      expect(resolve.textContent).toContain("Resolve");
      expect(resolve.getAttribute("data-idle")).toBe("false");
      await user.click(resolve);
      expect(props.onRunAction).toHaveBeenCalledWith("pull");

      await user.click(segment("More pull and push actions"));
      expect(screen.queryByText("Pull, then run")).toBeNull();
      expect(screen.getByRole("menuitem", { name: "Push to another branch…" })).toBeTruthy();
    });

    it("hides Fetch without the fetch capability", () => {
      renderHeader({ summary: createSummary({ capabilities: { ...gitCapabilities(), fetch: false } }) });

      expect(within(gitActions()).queryByRole("button", { name: "Fetch" })).toBeNull();
      expect(segment("Pull")).toBeTruthy();
    });

    it("explains why Pull is disabled on a detached HEAD", () => {
      renderHeader({ summary: createSummary({ branch: null, currentTag: "v2", upstream: null }) });

      const pull = segment(/^Pull/) as HTMLButtonElement;
      expect(pull.disabled).toBe(true);
      expect(screen.getByLabelText("Switch to a branch before pulling.").contains(pull)).toBe(true);
    });

    it.each([
      ["fetch", "Fetch", "Fetching…", createSummary()],
      ["pull", "Pull 2 commits", "Pulling…", createSummary({ behind: 2, ahead: 0 })],
      ["pull", "Sync", "Syncing…", createSummary({ kind: "lore", capabilities: loreCapabilities(), upstream: null })],
      ["push", "Push", "Pushing…", createSummary()]
    ] as const)("spins the running %s segment and keeps its name %s", (action, name, text, summary) => {
      renderHeader({ summary, runningAction: action, disabled: true });

      const running = segment(name);
      expect(running.textContent).toContain(text);
      expect(running.querySelector(".animate-spin")).toBeTruthy();
      expect(running.getAttribute("data-idle")).toBe("false");
      expect((running as HTMLButtonElement).disabled).toBe(true);
      // Only the running segment keeps its label, so the group does not widen and move the view switch.
      expect(running.getAttribute("data-running")).toBe("true");
      expect(running.closest(".remote-actions")?.getAttribute("data-running")).toBe("true");
      expect(running.closest(".remote-actions")?.querySelectorAll('[data-running="true"]')).toHaveLength(1);
    });

    it("keeps operation feedback inside the segment buttons", () => {
      renderHeader({
        feedbackEvent: {
          action: "fetch",
          expiresAt: Date.now() + OPERATION_BUTTON_FEEDBACK_HOLD_MS,
          operationId: "fetch-1",
          outcome: "success",
          repoPath,
          surface: "action-bar"
        }
      });

      const feedback = segment("Fetch").querySelector(".operation-button-feedback");
      expect(feedback?.getAttribute("data-feedback")).toBe("success");
      expect(segment("Pull").querySelector(".operation-button-feedback")?.getAttribute("data-feedback")).toBe("idle");
      expect(screen.getByRole("status").textContent).toBe("Fetched.");
    });

    it("offers pull-bound actions and Push to another branch from the pull and push menu", async () => {
      const user = userEvent.setup();
      const deploy = configuredAction("Packaging > Package and Launch", { bindToPull: true });
      const { props } = renderHeader({
        summary: createSummary({
          remotes: pushRemotes,
          actionsConfig: createActionsConfig({ actions: [configuredAction("Build"), deploy] })
        })
      });

      await user.click(segment("More pull and push actions"));
      const menu = screen.getByRole("menu");
      expect(within(menu).getByText("Pull, then run")).toBeTruthy();
      expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
        "Packaging > Package and Launch",
        "Push to another branch…"
      ]);
      await user.click(within(menu).getByRole("menuitem", { name: "Packaging > Package and Launch" }));
      expect(props.onPullWithAction).toHaveBeenCalledWith(deploy);

      await user.click(segment("More pull and push actions"));
      await user.click(screen.getByRole("menuitem", { name: "Push to another branch…" }));
      expect(props.onOpenPushToBranch).toHaveBeenCalledOnce();
    });

    it("disables the menu items, not the trigger, when pull and push cannot run", async () => {
      const user = userEvent.setup();
      renderHeader({
        disabled: true,
        summary: createSummary({
          remotes: pushRemotes,
          actionsConfig: createActionsConfig({ actions: [configuredAction("Deploy", { bindToPull: true })] })
        })
      });

      const trigger = segment("More pull and push actions") as HTMLButtonElement;
      expect(trigger.disabled).toBe(false);
      await user.click(trigger);
      expect(screen.getByRole("menuitem", { name: "Deploy" }).getAttribute("aria-disabled")).toBe("true");
      expect(screen.getByRole("menuitem", { name: "Push to another branch…" }).getAttribute("aria-disabled")).toBe("true");
    });

    it("omits the pull and push menu when there is nothing to put in it", () => {
      renderHeader({ summary: createSummary({ capabilities: { ...gitCapabilities(), pushToBranch: false } }) });

      expect(within(gitActions()).queryByRole("button", { name: "More pull and push actions" })).toBeNull();
    });
  });

  describe("Repository actions", () => {
    it("lists flattened groups with inline descriptions, the after Pull badge and the manage item", async () => {
      const user = userEvent.setup();
      const typecheck = configuredAction("Typecheck", { description: "Check the TypeScript projects" });
      const packageWindows = configuredAction("Packaging > Package for Windows");
      const launch = configuredAction("Packaging > Package and Launch", { bindToPull: true, description: "Build and launch" });
      const { props } = renderHeader({
        summary: createSummary({ actionsConfig: createActionsConfig({ actions: [typecheck, packageWindows, launch] }) })
      });

      const trigger = segment("Repository actions");
      expect(trigger.textContent).toBe("Actions");
      await user.click(trigger);
      const menu = screen.getByRole("menu");

      expect(within(menu).getByText("actions.toml")).toBeTruthy();
      expect(within(menu).getByText("Packaging")).toBeTruthy();
      const items = within(menu).getAllByRole("menuitem");
      expect(items.map((item) => item.getAttribute("aria-label"))).toEqual([
        "Typecheck",
        "Package for Windows",
        "Package and Launch",
        null
      ]);
      expect(items[3]).toBe(within(menu).getByRole("menuitem", { name: "Manage repository actions…" }));
      const describedBy = (name: string): string => (
        within(menu).getByRole("menuitem", { name }).getAttribute("aria-describedby") ?? ""
      ).split(" ").filter(Boolean).map((id) => document.getElementById(id)?.textContent).join(" | ");
      expect(describedBy("Typecheck")).toBe("Check the TypeScript projects");
      expect(describedBy("Package for Windows")).toBe("");
      expect(describedBy("Package and Launch")).toBe("Build and launch | after Pull");
      expect(within(menu).getByRole("menuitem", { name: "Manage repository actions…" }).textContent).toContain("Ctrl K › Actions");

      await user.click(within(menu).getByRole("menuitem", { name: "Package and Launch" }));
      expect(props.onRunConfiguredAction).toHaveBeenCalledWith(launch);

      await user.click(segment("Repository actions"));
      await user.click(screen.getByRole("menuitem", { name: "Manage repository actions…" }));
      expect(props.onManageActions).toHaveBeenCalledOnce();
    });

    it("shows the config error or the empty state", async () => {
      const user = userEvent.setup();
      const { rerenderHeader } = renderHeader({
        summary: createSummary({
          actionsConfig: createActionsConfig({ actions: [configuredAction("Build")], error: "actions.toml: invalid shell" })
        })
      });

      await user.click(segment("Repository actions"));
      expect(screen.getByRole("menuitem", { name: "actions.toml: invalid shell" }).getAttribute("aria-disabled")).toBe("true");
      expect(screen.queryByRole("menuitem", { name: "Build" })).toBeNull();
      await user.keyboard("{Escape}");

      rerenderHeader({ summary: createSummary() });
      await user.click(segment("Repository actions"));
      expect(screen.getByRole("menuitem", { name: "No configured actions" }).getAttribute("aria-disabled")).toBe("true");
    });

    it("shows the running action, then a count for several runs", () => {
      const { rerenderHeader } = renderHeader({ configuredActionRuns: [run("Build")] });

      const trigger = segment("Repository actions");
      expect(trigger.textContent).toBe("Build");
      expect(trigger.getAttribute("data-actions-state")).toBe("running");
      expect(trigger.querySelector(".animate-spin")).toBeTruthy();
      expect(document.getElementById(trigger.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Build");

      rerenderHeader({ configuredActionRuns: [run("Build"), run("Test", { id: 2 })] });
      expect(segment("Repository actions").textContent).toBe("2 running");
    });

    it("holds a passed state briefly, then returns to Actions", () => {
      vi.useFakeTimers();
      renderHeader({
        configuredActionOutcome: { name: "Typecheck", exitCode: 0, operationId: "typecheck-1", finishedAt: Date.now() }
      });

      const trigger = segment("Repository actions");
      expect(trigger.textContent).toBe("Typecheck passed");
      expect(trigger.getAttribute("data-actions-state")).toBe("passed");

      act(() => {
        vi.advanceTimersByTime(OPERATION_BUTTON_FEEDBACK_HOLD_MS);
      });

      expect(trigger.textContent).toBe("Actions");
      expect(trigger.getAttribute("data-actions-state")).toBe("idle");
      expect(vi.getTimerCount()).toBe(0);
    });

    it("shows a failed run until its activity log error has been seen", () => {
      const outcome = { name: "Test", exitCode: 1, operationId: "test-1", finishedAt: Date.now() };
      const { rerenderHeader } = renderHeader({ configuredActionOutcome: outcome, activityAttention: "error" });

      const trigger = segment("Repository actions");
      expect(trigger.textContent).toBe("Test failed");
      expect(trigger.getAttribute("data-actions-state")).toBe("failed");

      rerenderHeader({ configuredActionOutcome: outcome, activityAttention: "none" });
      expect(trigger.textContent).toBe("Actions");
    });

    it("lists running runs with a per-run Cancel menuitem", async () => {
      const user = userEvent.setup();
      const build = run("Build", { id: 7, operationId: "build-7", startedAt: Date.now() - 42_000 });
      const { props } = renderHeader({
        configuredActionRuns: [build],
        summary: createSummary({ actionsConfig: createActionsConfig({ actions: [configuredAction("Build", { command: "npm run build" })] }) })
      });

      await user.click(segment("Repository actions"));
      const cancel = screen.getByRole("menuitem", { name: "Cancel Build" });
      expect(cancel.textContent).toBe("Cancel");
      const detail = document.getElementById(cancel.getAttribute("aria-describedby") ?? "")?.textContent ?? "";
      expect(detail).toMatch(/^Running · 4\ds · npm run build$/);
      await user.click(cancel);

      expect(props.onCancelOperation).toHaveBeenCalledWith({ kind: "configured", id: 7, operationId: "build-7" });
    });

    it("disables a per-run Cancel while that run is cancelling", async () => {
      const user = userEvent.setup();
      renderHeader({ configuredActionRuns: [run("Build", { cancelStatus: "canceling" })] });

      await user.click(segment("Repository actions"));
      const cancel = screen.getByRole("menuitem", { name: "Cancel Build" });
      expect(cancel.getAttribute("aria-disabled")).toBe("true");
      expect(document.getElementById(cancel.getAttribute("aria-describedby") ?? "")?.textContent).toMatch(/^Cancelling · /);
    });

    it("runs the elapsed clock only while the menu is open and starts no timers while idle", () => {
      vi.useFakeTimers();
      const { rerenderHeader } = renderHeader();
      expect(vi.getTimerCount()).toBe(0);

      rerenderHeader({ configuredActionRuns: [run("Build", { startedAt: Date.now() - 5_000 })] });
      expect(vi.getTimerCount()).toBe(0);

      openMenuWithKeyboard(segment("Repository actions"));
      const cancel = screen.getByRole("menuitem", { name: "Cancel Build" });
      const detail = (): string => document.getElementById(cancel.getAttribute("aria-describedby") ?? "")?.textContent ?? "";
      expect(detail()).toBe("Running · 5s");
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      expect(detail()).toBe("Running · 7s");
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      act(() => {
        fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
      });
      // Let the closing menu run its one-shot focus timers; no interval may survive it.
      act(() => {
        vi.advanceTimersByTime(1_000);
      });
      expect(screen.queryByRole("menu")).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("More", () => {
    it("opens the quick switcher", async () => {
      const user = userEvent.setup();
      const { props } = renderHeader();

      const more = screen.getByRole("button", { name: "More" });
      expect(more.getAttribute("data-attention")).toBe("none");
      expect(more.querySelector(".header-attention-dot")).toBeNull();
      await user.click(more);

      expect(props.onOpenSwitcher).toHaveBeenCalledWith("all");
    });

    it.each([
      ["error", "Unread error details in the activity log"],
      ["unread", "Unread activity log output"]
    ] as const)("carries %s activity attention with the indicator", (attention, description) => {
      renderHeader({ activityAttention: attention, appUpdate: createUpdateState({ status: "available", availableVersion: "0.2.0" }) });

      const more = screen.getByRole("button", { name: "More" });
      expect(more.getAttribute("data-attention")).toBe(attention);
      expect(more.querySelector(".activity-log-attention-indicator")).toBeTruthy();
      expect(document.getElementById(more.getAttribute("aria-describedby") ?? "")?.textContent).toBe(description);
    });

    it("carries update attention when an app update is actionable", () => {
      renderHeader({ appUpdate: createUpdateState({ status: "available", availableVersion: "0.2.0" }) });

      const more = screen.getByRole("button", { name: "More" });
      expect(more.getAttribute("data-attention")).toBe("update");
      expect(more.querySelector(".header-attention-dot")).toBeTruthy();
      expect(more.querySelector(".activity-log-attention-indicator")).toBeNull();
    });
  });

  describe("app update", () => {
    it("renders the compact update control, shows release notes on hover, and keeps the version for assistive technology", async () => {
      const user = userEvent.setup();
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
      const { props, rerenderHeader } = renderHeader({
        appUpdate: createUpdateState({ status: "available", availableVersion: "0.2.0" })
      });

      const region = screen.getByRole("region", { name: "App update" });
      expect(region.className).toContain("is-compact");
      expect(screen.getByText("Version 0.2.0").className).toContain("sr-only");
      expect(within(region).queryByRole("button", { name: "Release notes" })).toBeNull();
      await user.click(within(region).getByRole("button", { name: "Update available" }));
      expect(props.onDownloadUpdate).toHaveBeenCalledOnce();

      rerenderHeader({
        appUpdate: createUpdateState({
          status: "downloaded",
          downloadedVersion: "0.2.0",
          releaseNotes: { version: "0.2.0", url: null, title: "Githead 0.2.0", body: "Notes", loading: false, error: null }
        })
      });
      expect(within(region).queryByRole("button", { name: "Release notes" })).toBeNull();
      await user.hover(within(region).getByRole("button", { name: "Restart to update" }));
      expect(await screen.findByRole("heading", { name: "Githead 0.2.0" })).toBeTruthy();
      await user.click(within(region).getByRole("button", { name: "Restart to update" }));
      expect(confirm).toHaveBeenCalledOnce();
      expect(props.onInstallUpdate).toHaveBeenCalledOnce();
    });

    it("stays out of the header while there is nothing to do", () => {
      renderHeader();

      expect(screen.queryByRole("region", { name: "App update" })).toBeNull();
    });
  });
});
