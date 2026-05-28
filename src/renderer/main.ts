import "./styles.css";
import type {
  AiSettings,
  GitAction,
  GitDiffSide,
  GitFileDiff,
  GitOperationResult,
  GitOutputEvent,
  GitRunResult,
  GitStatusFile,
  RepoSummary
} from "../shared/types";
import { parseUnifiedDiff } from "./diffParser";

const DEFAULT_REPO_PATH = "D:\\Githead";

interface FileSelection {
  path: string;
  side: GitDiffSide;
}

interface ContextMenuState {
  x: number;
  y: number;
  file: GitStatusFile;
  side: GitDiffSide;
}

interface AppState {
  repoPath: string;
  summary: RepoSummary | null;
  runningAction: GitAction | null;
  runningOperation: string | null;
  lastResult: GitRunResult | null;
  lastOperationResult: GitOperationResult | null;
  selection: FileSelection | null;
  diff: GitFileDiff | null;
  diffLoading: boolean;
  commitMessage: string;
  contextMenu: ContextMenuState | null;
  aiSettings: AiSettings | null;
  settingsError: string;
  settingsSaving: boolean;
}

const state: AppState = {
  repoPath: DEFAULT_REPO_PATH,
  summary: null,
  runningAction: null,
  runningOperation: null,
  lastResult: null,
  lastOperationResult: null,
  selection: null,
  diff: null,
  diffLoading: false,
  commitMessage: "",
  contextMenu: null,
  aiSettings: null,
  settingsError: "",
  settingsSaving: false
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root was not found.");
}

app.innerHTML = `
  <section class="shell">
    <aside class="repo-panel" aria-label="Repository">
      <div class="brand-row">
        <div class="brand-mark" aria-hidden="true">G</div>
        <div>
          <h1>Githead</h1>
          <p id="repo-health" class="muted">Checking repository…</p>
        </div>
      </div>

      <div class="path-row">
        <label for="repo-path">Repository</label>
        <div class="path-control">
          <input id="repo-path" type="text" readonly />
          <button id="choose-repo" type="button" title="Choose repository">Browse</button>
        </div>
      </div>

      <section class="change-summary" aria-label="Change summary">
        <div>
          <span id="staged-count-value">0</span>
          <p>Staged</p>
        </div>
        <div>
          <span id="unstaged-count-value">0</span>
          <p>Unstaged</p>
        </div>
        <div>
          <span id="conflict-count-value">0</span>
          <p>Conflicts</p>
        </div>
      </section>

      <dl class="repo-facts">
        <div>
          <dt>Branch</dt>
          <dd id="branch-value">-</dd>
        </div>
        <div>
          <dt>Upstream</dt>
          <dd id="upstream-value">-</dd>
        </div>
        <div>
          <dt>Remotes</dt>
          <dd id="remotes-value">-</dd>
        </div>
      </dl>

      <button id="refresh-repo" class="secondary full-width" type="button">Refresh</button>
    </aside>

    <section class="workspace" aria-label="Git workspace">
      <header class="action-bar">
        <div>
          <p class="eyebrow">Sync</p>
          <h2 id="action-heading">Ready</h2>
          <p id="current-branch-label" class="muted">No branch selected</p>
        </div>
        <div class="button-row" role="group" aria-label="Git actions">
          <button class="action-button" data-action="fetch" type="button">Fetch</button>
          <button class="action-button" data-action="pull" type="button">Pull</button>
          <button class="action-button primary" data-action="push" type="button">Push</button>
        </div>
      </header>

      <section class="file-status" aria-label="File status">
        <div class="file-lists" aria-label="Changed files">
          <section class="file-group" aria-label="Staged files">
            <div class="file-group-header">
              <h2 id="staged-heading">Staged files</h2>
              <div class="file-actions">
                <button id="unstage-all" class="small-button" type="button">Unstage All</button>
                <button id="unstage-selected" class="small-button" type="button">Unstage</button>
              </div>
            </div>
            <div id="staged-list" class="file-list" role="listbox" aria-labelledby="staged-heading"></div>
          </section>

          <section class="file-group" aria-label="Unstaged files">
            <div class="file-group-header">
              <h2 id="unstaged-heading">Unstaged files</h2>
              <div class="file-actions">
                <button id="stage-all" class="small-button" type="button">Stage All</button>
                <button id="stage-selected" class="small-button" type="button">Stage</button>
              </div>
            </div>
            <div id="unstaged-list" class="file-list" role="listbox" aria-labelledby="unstaged-heading"></div>
          </section>
        </div>

        <section class="diff-panel" aria-label="File diff">
          <div class="diff-header">
            <div>
              <p class="eyebrow" id="diff-side">Diff</p>
              <h2 id="diff-title">Select a file</h2>
            </div>
            <button id="refresh-diff" class="secondary small-button" type="button">Refresh Diff</button>
          </div>
          <div id="diff-output" class="diff-output">Select a file to view the diff</div>
        </section>
      </section>

      <section class="commit-panel" aria-label="Commit staged files">
        <div class="commit-author">
          <div>
            <p class="eyebrow">Commit</p>
            <h2>Staged changes</h2>
          </div>
          <p id="operation-feedback" class="muted"></p>
        </div>
        <textarea id="commit-message" rows="3" placeholder="Summarize staged changes…"></textarea>
        <div class="commit-footer">
          <button id="settings-button" class="secondary" type="button">Settings</button>
          <button id="generate-message" class="secondary" type="button">Generate</button>
          <button id="clear-log" class="secondary" type="button">Clear Log</button>
          <button id="commit-button" class="primary" type="button">Commit</button>
        </div>
        <details id="log-panel" class="log-panel">
          <summary>
            <span>Activity Log</span>
            <span id="log-status" class="log-status">Empty</span>
          </summary>
          <pre id="log-output" class="log-output" aria-live="polite"></pre>
        </details>
      </section>
    </section>
  </section>
  <div id="file-context-menu" class="context-menu" role="menu" hidden></div>
  <dialog id="settings-dialog" class="settings-dialog" aria-labelledby="settings-title">
    <form id="settings-form" class="settings-form">
      <div class="settings-header">
        <div>
          <p class="eyebrow">OpenRouter</p>
          <h2 id="settings-title">AI Settings</h2>
        </div>
        <button id="settings-close" class="secondary small-button" type="button" aria-label="Close settings">Close</button>
      </div>
      <label class="settings-field" for="openrouter-api-key">
        <span>API Key</span>
        <input id="openrouter-api-key" type="password" autocomplete="off" placeholder="Leave blank to keep existing key" />
      </label>
      <label class="settings-field" for="openrouter-model">
        <span>Model</span>
        <input id="openrouter-model" type="text" autocomplete="off" />
      </label>
      <label class="settings-field" for="openrouter-site-url">
        <span>Site URL</span>
        <input id="openrouter-site-url" type="url" autocomplete="off" placeholder="Optional" />
      </label>
      <label class="settings-field" for="openrouter-site-title">
        <span>Site Title</span>
        <input id="openrouter-site-title" type="text" autocomplete="off" placeholder="Githead" />
      </label>
      <p id="settings-error" class="settings-error" role="alert"></p>
      <div class="settings-actions">
        <button id="settings-cancel" class="secondary" type="button">Cancel</button>
        <button id="settings-save" class="primary" type="submit">Save</button>
      </div>
    </form>
  </dialog>
`;

const repoHealth = getElement("repo-health");
const repoPathInput = getElement<HTMLInputElement>("repo-path");
const chooseRepoButton = getElement<HTMLButtonElement>("choose-repo");
const refreshRepoButton = getElement<HTMLButtonElement>("refresh-repo");
const branchValue = getElement("branch-value");
const upstreamValue = getElement("upstream-value");
const remotesValue = getElement("remotes-value");
const stagedCountValue = getElement("staged-count-value");
const unstagedCountValue = getElement("unstaged-count-value");
const conflictCountValue = getElement("conflict-count-value");
const actionHeading = getElement("action-heading");
const currentBranchLabel = getElement("current-branch-label");
const stagedList = getElement("staged-list");
const unstagedList = getElement("unstaged-list");
const stagedHeading = getElement("staged-heading");
const unstagedHeading = getElement("unstaged-heading");
const stageAllButton = getElement<HTMLButtonElement>("stage-all");
const stageSelectedButton = getElement<HTMLButtonElement>("stage-selected");
const unstageAllButton = getElement<HTMLButtonElement>("unstage-all");
const unstageSelectedButton = getElement<HTMLButtonElement>("unstage-selected");
const refreshDiffButton = getElement<HTMLButtonElement>("refresh-diff");
const diffSide = getElement("diff-side");
const diffTitle = getElement("diff-title");
const diffOutput = getElement<HTMLDivElement>("diff-output");
const commitMessageInput = getElement<HTMLTextAreaElement>("commit-message");
const commitButton = getElement<HTMLButtonElement>("commit-button");
const generateMessageButton = getElement<HTMLButtonElement>("generate-message");
const settingsButton = getElement<HTMLButtonElement>("settings-button");
const operationFeedback = getElement("operation-feedback");
const logPanel = getElement<HTMLDetailsElement>("log-panel");
const logStatus = getElement("log-status");
const logOutput = getElement<HTMLPreElement>("log-output");
const clearLogButton = getElement<HTMLButtonElement>("clear-log");
const fileContextMenu = getElement<HTMLDivElement>("file-context-menu");
const settingsDialog = getElement<HTMLDialogElement>("settings-dialog");
const settingsForm = getElement<HTMLFormElement>("settings-form");
const settingsCloseButton = getElement<HTMLButtonElement>("settings-close");
const settingsCancelButton = getElement<HTMLButtonElement>("settings-cancel");
const settingsSaveButton = getElement<HTMLButtonElement>("settings-save");
const settingsError = getElement("settings-error");
const openRouterApiKeyInput = getElement<HTMLInputElement>("openrouter-api-key");
const openRouterModelInput = getElement<HTMLInputElement>("openrouter-model");
const openRouterSiteUrlInput = getElement<HTMLInputElement>("openrouter-site-url");
const openRouterSiteTitleInput = getElement<HTMLInputElement>("openrouter-site-title");
const actionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".action-button"));

let diffRequestId = 0;

chooseRepoButton.addEventListener("click", () => {
  void chooseRepo();
});

refreshRepoButton.addEventListener("click", () => {
  void refreshRepo();
});

clearLogButton.addEventListener("click", () => {
  logOutput.textContent = "";
  updateLogPanel(false);
});

stageAllButton.addEventListener("click", () => {
  void stageFiles(getUnstagedFiles().map((file) => file.path));
});

stageSelectedButton.addEventListener("click", () => {
  if (state.selection?.side === "unstaged") {
    void stageFiles([state.selection.path], {
      path: state.selection.path,
      side: "staged"
    });
  }
});

unstageAllButton.addEventListener("click", () => {
  void unstageFiles(getStagedFiles().map((file) => file.path));
});

unstageSelectedButton.addEventListener("click", () => {
  if (state.selection?.side === "staged") {
    void unstageFiles([state.selection.path], {
      path: state.selection.path,
      side: "unstaged"
    });
  }
});

refreshDiffButton.addEventListener("click", () => {
  void loadSelectedDiff();
});

commitMessageInput.addEventListener("input", () => {
  state.commitMessage = commitMessageInput.value;
  render();
});

commitButton.addEventListener("click", () => {
  void commitChanges();
});

generateMessageButton.addEventListener("click", () => {
  void generateCommitMessage();
});

settingsButton.addEventListener("click", () => {
  openSettingsDialog();
});

settingsCloseButton.addEventListener("click", () => {
  closeSettingsDialog();
});

settingsCancelButton.addEventListener("click", () => {
  closeSettingsDialog();
});

settingsDialog.addEventListener("cancel", () => {
  state.settingsError = "";
});

settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveAiSettings();
});

actionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action as GitAction | undefined;
    if (!action) {
      return;
    }

    void runAction(action);
  });
});

stagedList.addEventListener("click", (event) => {
  selectFileFromEvent(event, "staged");
});

unstagedList.addEventListener("click", (event) => {
  selectFileFromEvent(event, "unstaged");
});

stagedList.addEventListener("contextmenu", (event) => {
  showFileContextMenu(event, "staged");
});

unstagedList.addEventListener("contextmenu", (event) => {
  showFileContextMenu(event, "unstaged");
});

stagedList.addEventListener("scroll", hideContextMenu);
unstagedList.addEventListener("scroll", hideContextMenu);

document.addEventListener("click", (event) => {
  if (event.target instanceof Node && fileContextMenu.contains(event.target)) {
    return;
  }

  hideContextMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideContextMenu();
  }
});

window.addEventListener("blur", hideContextMenu);

window.githead.onGitOutput((event) => {
  appendLog(event);
});

updateLogPanel(false);
render();
void refreshRepo();
void loadAiSettings();

function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }

  return element as T;
}

async function chooseRepo(): Promise<void> {
  const repoPath = await window.githead.chooseRepo();
  if (!repoPath) {
    return;
  }

  state.repoPath = repoPath;
  state.lastResult = null;
  state.lastOperationResult = null;
  state.selection = null;
  state.diff = null;
  state.contextMenu = null;
  await refreshRepo();
}

async function refreshRepo(): Promise<void> {
  repoHealth.textContent = "Checking repository…";
  setBusy(true);

  try {
    state.summary = await window.githead.getRepoSummary(state.repoPath);
    reconcileSelection();
  } catch (error) {
    state.summary = {
      repoPath: state.repoPath,
      isValid: false,
      branch: null,
      upstream: null,
      hasHead: false,
      remotes: [],
      statusLines: [],
      files: [],
      validationErrors: [
        error instanceof Error ? error.message : "Unable to read repository state."
      ]
    };
    state.selection = null;
    state.diff = null;
    state.contextMenu = null;
  } finally {
    setBusy(false);
    render();
  }

  if (state.selection) {
    await loadSelectedDiff();
  }
}

async function runAction(action: GitAction): Promise<void> {
  if (!state.summary?.isValid || isOperationRunning()) {
    return;
  }

  state.runningAction = action;
  state.lastResult = null;
  render();
  logOutput.textContent = "";
  updateLogPanel(false);

  try {
    state.lastResult = await window.githead.runGitAction({
      repoPath: state.repoPath,
      action
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Git command failed.";
    state.lastResult = {
      runId: "renderer-error",
      action,
      repoPath: state.repoPath,
      exitCode: -1,
      stdout: "",
      stderr: message,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString()
    };
    appendSystemLine(message);
  } finally {
    state.runningAction = null;
    await refreshRepo();
    render();
  }
}

async function stageFiles(paths: string[], nextSelection?: FileSelection): Promise<void> {
  await runFileOperation("Staging files", nextSelection, () =>
    window.githead.stageFiles({
      repoPath: state.repoPath,
      paths
    })
  );
}

async function unstageFiles(paths: string[], nextSelection?: FileSelection): Promise<void> {
  await runFileOperation("Unstaging files", nextSelection, () =>
    window.githead.unstageFiles({
      repoPath: state.repoPath,
      paths
    })
  );
}

async function commitChanges(): Promise<void> {
  if (!state.summary?.isValid || isOperationRunning() || !canCommit()) {
    return;
  }

  await runFileOperation("Committing changes", null, () =>
    window.githead.commitChanges({
      repoPath: state.repoPath,
      message: state.commitMessage
    })
  );

  if (state.lastOperationResult?.exitCode === 0) {
    state.commitMessage = "";
    commitMessageInput.value = "";
  }
}

async function generateCommitMessage(): Promise<void> {
  if (!state.summary?.isValid || isOperationRunning() || !canGenerateCommitMessage()) {
    return;
  }

  state.runningOperation = "Generating commit message";
  state.lastOperationResult = null;
  render();

  try {
    state.lastOperationResult = await window.githead.generateCommitMessage({
      repoPath: state.repoPath
    });

    if (state.lastOperationResult.exitCode === 0) {
      const generatedMessage = state.lastOperationResult.stdout.trim();
      state.commitMessage = generatedMessage;
      commitMessageInput.value = state.commitMessage;
      state.lastOperationResult = {
        ...state.lastOperationResult,
        stdout: "Commit message generated."
      };
    }
  } catch (error) {
    state.lastOperationResult = {
      repoPath: state.repoPath,
      exitCode: -1,
      stdout: "",
      stderr: error instanceof Error ? error.message : "Unable to generate commit message."
    };
  } finally {
    state.runningOperation = null;
    render();
  }
}

async function loadAiSettings(): Promise<void> {
  try {
    state.aiSettings = await window.githead.getAiSettings();
  } catch (error) {
    state.aiSettings = null;
    state.lastOperationResult = {
      repoPath: state.repoPath,
      exitCode: -1,
      stdout: "",
      stderr: error instanceof Error ? error.message : "Unable to load AI settings."
    };
  } finally {
    render();
  }
}

function openSettingsDialog(): void {
  const settings = state.aiSettings;
  state.settingsError = "";
  openRouterApiKeyInput.value = "";
  openRouterModelInput.value = settings?.model ?? "";
  openRouterSiteUrlInput.value = settings?.siteUrl ?? "";
  openRouterSiteTitleInput.value = settings?.siteTitle ?? "Githead";
  settingsDialog.showModal();
  openRouterApiKeyInput.focus();
  render();
}

function closeSettingsDialog(): void {
  state.settingsError = "";
  settingsDialog.close();
  render();
}

async function saveAiSettings(): Promise<void> {
  if (state.settingsSaving) {
    return;
  }

  state.settingsError = "";
  state.settingsSaving = true;
  render();

  try {
    state.aiSettings = await window.githead.saveAiSettings({
      apiKey: openRouterApiKeyInput.value,
      model: openRouterModelInput.value,
      siteUrl: openRouterSiteUrlInput.value,
      siteTitle: openRouterSiteTitleInput.value
    });
    settingsDialog.close();
  } catch (error) {
    state.settingsError = error instanceof Error ? error.message : "Unable to save AI settings.";
  } finally {
    state.settingsSaving = false;
    render();
  }
}

async function runFileOperation(
  label: string,
  nextSelection: FileSelection | null | undefined,
  operation: () => Promise<GitOperationResult>
): Promise<void> {
  if (!state.summary?.isValid || isOperationRunning()) {
    return;
  }

  state.contextMenu = null;
  state.runningOperation = label;
  state.lastOperationResult = null;
  render();

  try {
    state.lastOperationResult = await operation();
  } catch (error) {
    state.lastOperationResult = {
      repoPath: state.repoPath,
      exitCode: -1,
      stdout: "",
      stderr: error instanceof Error ? error.message : `${label} failed.`
    };
  } finally {
    state.runningOperation = null;
    if (state.lastOperationResult?.exitCode === 0 && nextSelection !== undefined) {
      state.selection = nextSelection;
      state.diff = null;
    }
    await refreshRepo();
    render();
  }
}

async function loadSelectedDiff(): Promise<void> {
  const selection = state.selection;
  if (!selection || !state.summary?.isValid) {
    state.diff = null;
    render();
    return;
  }

  const requestId = diffRequestId + 1;
  diffRequestId = requestId;
  state.diffLoading = true;
  render();

  try {
    const diff = await window.githead.getFileDiff({
      repoPath: state.repoPath,
      path: selection.path,
      side: selection.side
    });

    if (requestId === diffRequestId) {
      state.diff = diff;
    }
  } catch (error) {
    if (requestId === diffRequestId) {
      state.diff = {
        path: selection.path,
        side: selection.side,
        kind: "error",
        text: error instanceof Error ? error.message : "Unable to read diff."
      };
    }
  } finally {
    if (requestId === diffRequestId) {
      state.diffLoading = false;
      render();
    }
  }
}

function render(): void {
  repoPathInput.value = state.repoPath;
  commitMessageInput.value = state.commitMessage;

  const summary = state.summary;
  const isValid = summary?.isValid ?? false;
  const stagedFiles = getStagedFiles();
  const unstagedFiles = getUnstagedFiles();
  const running = isOperationRunning();

  repoHealth.textContent = summary
    ? summary.isValid
      ? "Repository ready"
      : summary.validationErrors.join(" ")
    : "Checking repository…";
  repoHealth.className = `muted ${isValid ? "good" : "bad"}`;

  branchValue.textContent = summary?.branch ?? "-";
  upstreamValue.textContent = summary?.upstream ?? "-";
  remotesValue.textContent = summary?.remotes.length
    ? [...new Set(summary.remotes.map((remote) => remote.name))].join(", ")
    : "-";
  stagedCountValue.textContent = String(stagedFiles.length);
  unstagedCountValue.textContent = String(unstagedFiles.length);
  conflictCountValue.textContent = String(summary?.files.filter((file) => file.isConflicted).length ?? 0);
  currentBranchLabel.textContent = summary?.branch
    ? `${summary.branch}${summary.upstream ? ` tracking ${summary.upstream}` : ""}`
    : "No branch selected";

  stagedHeading.textContent = `Staged files (${stagedFiles.length})`;
  unstagedHeading.textContent = `Unstaged files (${unstagedFiles.length})`;
  renderFileList(stagedList, stagedFiles, "staged");
  renderFileList(unstagedList, unstagedFiles, "unstaged");
  renderDiff();
  renderContextMenu();

  actionHeading.textContent = state.runningAction
    ? `${capitalize(state.runningAction)} running`
    : state.runningOperation
      ? state.runningOperation
      : state.lastResult
        ? formatResultHeading(state.lastResult)
        : "Ready";

  operationFeedback.textContent = getOperationFeedback();
  operationFeedback.className = `muted ${state.lastOperationResult?.exitCode === 0 ? "good" : state.lastOperationResult ? "bad" : ""}`;

  const disableActions = running || !isValid;
  actionButtons.forEach((button) => {
    button.disabled = disableActions;
    button.classList.toggle("is-running", button.dataset.action === state.runningAction);
  });

  stageAllButton.disabled = disableActions || unstagedFiles.length === 0;
  stageSelectedButton.disabled = disableActions || state.selection?.side !== "unstaged";
  unstageAllButton.disabled = disableActions || stagedFiles.length === 0;
  unstageSelectedButton.disabled = disableActions || state.selection?.side !== "staged";
  refreshDiffButton.disabled = disableActions || !state.selection;
  commitButton.disabled = disableActions || !canCommit();
  generateMessageButton.disabled = disableActions || !canGenerateCommitMessage();
  generateMessageButton.title = getGenerateMessageTitle();
  settingsButton.disabled = running;
  refreshRepoButton.disabled = running;
  chooseRepoButton.disabled = running;
  renderSettingsDialog();
}

function renderContextMenu(): void {
  const contextMenu = state.contextMenu;
  fileContextMenu.replaceChildren();

  if (!contextMenu) {
    fileContextMenu.hidden = true;
    return;
  }

  const disabled = !state.summary?.isValid || isOperationRunning();
  const actionLabel = contextMenu.side === "unstaged" ? "Stage" : "Unstage";

  const items: Array<
    | { kind: "separator" }
    | { kind: "item"; label: string; action: () => void; disabled?: boolean }
  > = [
    {
      kind: "item",
      label: "Open",
      action: () => {
        void openContextFile();
      },
      disabled: disabled || isDeletedOnSide(contextMenu.file, contextMenu.side)
    },
    {
      kind: "item",
      label: "Show in Explorer",
      action: () => {
        void showContextFileInExplorer();
      },
      disabled
    },
    {
      kind: "item",
      label: "Copy Path to Clipboard",
      action: () => {
        void copyContextFilePath();
      },
      disabled
    },
    {
      kind: "separator"
    },
    {
      kind: "item",
      label: actionLabel,
      action: () => {
        void toggleContextFileStage();
      },
      disabled
    },
    {
      kind: "item",
      label: "Delete",
      action: () => {
        void deleteContextFile();
      },
      disabled
    },
    {
      kind: "item",
      label: "Revert changes",
      action: () => {
        void revertContextFileChanges();
      },
      disabled
    },
    {
      kind: "separator"
    },
    {
      kind: "item",
      label: "Add to ignore",
      action: () => {
        void addContextFileToIgnore();
      },
      disabled: disabled || isDeletedOnSide(contextMenu.file, contextMenu.side)
    }
  ];

  fileContextMenu.append(...items.map((item) => {
    if (item.kind === "separator") {
      const separator = document.createElement("div");
      separator.className = "context-menu-separator";
      separator.setAttribute("role", "separator");
      return separator;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "context-menu-item";
    button.setAttribute("role", "menuitem");
    button.textContent = item.label;
    button.disabled = Boolean(item.disabled);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (button.disabled) {
        return;
      }

      item.action();
      hideContextMenu();
    });

    return button;
  }));

  fileContextMenu.hidden = false;
  positionContextMenu(contextMenu.x, contextMenu.y);
}

function renderFileList(container: HTMLElement, files: GitStatusFile[], side: GitDiffSide): void {
  if (!state.summary?.isValid) {
    container.innerHTML = `<p class="empty-state">Select a valid repository.</p>`;
    return;
  }

  if (files.length === 0) {
    container.innerHTML = `<p class="empty-state">No ${side} files.</p>`;
    return;
  }

  container.replaceChildren(...files.map((file) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "file-row";
    button.dataset.path = file.path;
    button.dataset.side = side;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(state.selection?.path === file.path && state.selection.side === side));
    button.classList.toggle("is-selected", state.selection?.path === file.path && state.selection.side === side);

    const status = document.createElement("span");
    status.className = `status-chip ${file.isConflicted ? "conflict" : ""}`;
    status.textContent = formatFileStatus(file, side);

    const path = document.createElement("span");
    path.className = "file-path";
    path.textContent = file.originalPath ? `${file.originalPath} -> ${file.path}` : file.path;

    button.append(status, path);
    return button;
  }));
}

function renderDiff(): void {
  const selection = state.selection;
  diffSide.textContent = selection ? `${capitalize(selection.side)} diff` : "Diff";
  diffTitle.textContent = selection?.path ?? "Select a file";

  if (!selection) {
    diffOutput.className = "diff-output";
    setDiffMessage("Select a file to view the diff");
    return;
  }

  if (state.diffLoading) {
    diffOutput.className = "diff-output";
    setDiffMessage("Loading diff…");
    return;
  }

  if (!state.diff) {
    diffOutput.className = "diff-output";
    setDiffMessage("Refresh the diff to view this file.");
    return;
  }

  diffOutput.className = `diff-output ${state.diff.kind}`;
  if (state.diff.kind !== "text") {
    setDiffMessage(state.diff.text);
    return;
  }

  renderDiffRows(
    parseUnifiedDiff(state.diff.text, state.diff.truncated ? [
      "Diff truncated."
    ] : [])
  );
}

function setDiffMessage(message: string): void {
  diffOutput.replaceChildren();
  diffOutput.textContent = message;
}

function renderDiffRows(rows: ReturnType<typeof parseUnifiedDiff>): void {
  diffOutput.replaceChildren(...rows.map((row) => {
    const line = document.createElement("div");
    line.className = `diff-row ${row.kind}`;

    const oldLine = document.createElement("span");
    oldLine.className = "diff-line-number old-line";
    oldLine.textContent = row.oldLine === null ? "" : String(row.oldLine);

    const newLine = document.createElement("span");
    newLine.className = "diff-line-number new-line";
    newLine.textContent = row.newLine === null ? "" : String(row.newLine);

    const marker = document.createElement("span");
    marker.className = "diff-marker";
    marker.textContent = row.marker;

    const code = document.createElement("span");
    code.className = "diff-code";
    code.textContent = row.text;

    line.append(oldLine, newLine, marker, code);
    return line;
  }));
}

function setBusy(isBusy: boolean): void {
  refreshRepoButton.disabled = isBusy;
  chooseRepoButton.disabled = isBusy || isOperationRunning();
}

function appendLog(event: GitOutputEvent): void {
  const prefix = event.stream === "system" ? "" : `[${event.stream}] `;
  logPanel.open = true;
  logOutput.textContent += `${prefix}${event.text}`;
  logOutput.scrollTop = logOutput.scrollHeight;
  updateLogPanel(true);
}

function updateLogPanel(shouldOpen: boolean): void {
  const hasOutput = logOutput.textContent.trim().length > 0;
  logStatus.textContent = hasOutput ? "Output Available" : "Empty";
  clearLogButton.disabled = !hasOutput;

  if (shouldOpen) {
    logPanel.open = true;
  } else if (!hasOutput) {
    logPanel.open = false;
  }
}

function appendSystemLine(text: string): void {
  appendLog({
    runId: "renderer",
    action: state.runningAction ?? "fetch",
    stream: "system",
    text: `${text}\n`,
    timestamp: new Date().toISOString()
  });
}

function selectFileFromEvent(event: Event, side: GitDiffSide): void {
  const target = event.target instanceof Element
    ? event.target.closest<HTMLButtonElement>(".file-row")
    : null;
  const path = target?.dataset.path;

  if (!path) {
    return;
  }

  state.selection = {
    path,
    side
  };
  state.diff = null;
  render();
  void loadSelectedDiff();
}

function showFileContextMenu(event: MouseEvent, side: GitDiffSide): void {
  const target = event.target instanceof Element
    ? event.target.closest<HTMLButtonElement>(".file-row")
    : null;
  const filePath = target?.dataset.path;

  if (!filePath) {
    hideContextMenu();
    return;
  }

  const file = getFilesForSide(side).find((candidate) => candidate.path === filePath);
  if (!file) {
    hideContextMenu();
    return;
  }

  event.preventDefault();
  state.selection = {
    path: file.path,
    side
  };
  state.diff = null;
  state.contextMenu = {
    x: event.clientX,
    y: event.clientY,
    file,
    side
  };
  render();
  void loadSelectedDiff();
}

function hideContextMenu(): void {
  if (!state.contextMenu) {
    return;
  }

  state.contextMenu = null;
  renderContextMenu();
}

async function openContextFile(): Promise<void> {
  const contextMenu = state.contextMenu;
  if (!contextMenu) {
    return;
  }

  await runFileOperation("Opening file", undefined, () =>
    window.githead.openFile({
      repoPath: state.repoPath,
      path: contextMenu.file.path
    })
  );
}

async function showContextFileInExplorer(): Promise<void> {
  const contextMenu = state.contextMenu;
  if (!contextMenu) {
    return;
  }

  await runFileOperation("Showing file in Explorer", undefined, () =>
    window.githead.showInExplorer({
      repoPath: state.repoPath,
      path: contextMenu.file.path
    })
  );
}

async function copyContextFilePath(): Promise<void> {
  const contextMenu = state.contextMenu;
  if (!contextMenu) {
    return;
  }

  await runFileOperation("Copying path", undefined, () =>
    window.githead.copyPathToClipboard({
      repoPath: state.repoPath,
      path: contextMenu.file.path
    })
  );
}

async function toggleContextFileStage(): Promise<void> {
  const contextMenu = state.contextMenu;
  if (!contextMenu) {
    return;
  }

  if (contextMenu.side === "unstaged") {
    await stageFiles([
      contextMenu.file.path
    ], {
      path: contextMenu.file.path,
      side: "staged"
    });
    return;
  }

  await unstageFiles([
    contextMenu.file.path
  ], {
    path: contextMenu.file.path,
    side: "unstaged"
  });
}

async function deleteContextFile(): Promise<void> {
  const contextMenu = state.contextMenu;
  if (!contextMenu) {
    return;
  }

  await runFileOperation("Deleting file", null, () =>
    window.githead.deleteFile({
      repoPath: state.repoPath,
      path: contextMenu.file.path
    })
  );
}

async function revertContextFileChanges(): Promise<void> {
  const contextMenu = state.contextMenu;
  if (!contextMenu) {
    return;
  }

  await runFileOperation("Reverting changes", null, () =>
    window.githead.revertFileChanges({
      repoPath: state.repoPath,
      path: contextMenu.file.path,
      side: contextMenu.side
    })
  );
}

async function addContextFileToIgnore(): Promise<void> {
  const contextMenu = state.contextMenu;
  if (!contextMenu) {
    return;
  }

  await runFileOperation("Adding to ignore", undefined, () =>
    window.githead.addPathToIgnore({
      repoPath: state.repoPath,
      path: contextMenu.file.path
    })
  );
}

function positionContextMenu(x: number, y: number): void {
  fileContextMenu.style.left = `${x}px`;
  fileContextMenu.style.top = `${y}px`;

  const rect = fileContextMenu.getBoundingClientRect();
  const margin = 8;
  const left = Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin));
  const top = Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin));

  fileContextMenu.style.left = `${left}px`;
  fileContextMenu.style.top = `${top}px`;
}

function isDeletedOnSide(file: GitStatusFile, side: GitDiffSide): boolean {
  return side === "staged" ? file.indexStatus === "D" : file.worktreeStatus === "D";
}

function reconcileSelection(): void {
  if (!state.selection || !state.summary?.isValid) {
    return;
  }

  const files = state.selection.side === "staged" ? getStagedFiles() : getUnstagedFiles();
  if (!files.some((file) => file.path === state.selection?.path)) {
    state.selection = null;
    state.diff = null;
  }
}

function getStagedFiles(): GitStatusFile[] {
  return getSortedFiles((file) => file.isStaged);
}

function getUnstagedFiles(): GitStatusFile[] {
  return getSortedFiles((file) => file.isUnstaged);
}

function getFilesForSide(side: GitDiffSide): GitStatusFile[] {
  return side === "staged" ? getStagedFiles() : getUnstagedFiles();
}

function getSortedFiles(predicate: (file: GitStatusFile) => boolean): GitStatusFile[] {
  return [...(state.summary?.files ?? [])]
    .filter(predicate)
    .sort((left, right) => left.path.localeCompare(right.path));
}

function formatFileStatus(file: GitStatusFile, side: GitDiffSide): string {
  if (file.isConflicted) {
    return "UU";
  }

  return side === "staged" ? file.indexStatus : file.worktreeStatus === "?" ? "?" : file.worktreeStatus;
}

function canCommit(): boolean {
  return getStagedFiles().length > 0 && state.commitMessage.trim().length > 0;
}

function canGenerateCommitMessage(): boolean {
  return getStagedFiles().length > 0 && hasCompleteAiSettings();
}

function hasCompleteAiSettings(): boolean {
  return Boolean(state.aiSettings?.hasApiKey && state.aiSettings.model.trim());
}

function getGenerateMessageTitle(): string {
  if (getStagedFiles().length === 0) {
    return "Stage changes before generating a commit message.";
  }

  if (!hasCompleteAiSettings()) {
    return "Configure OpenRouter settings before generating a commit message.";
  }

  return "Generate a commit message from staged changes.";
}

function renderSettingsDialog(): void {
  settingsError.textContent = state.settingsError;
  settingsSaveButton.disabled = state.settingsSaving;
  settingsCancelButton.disabled = state.settingsSaving;
  settingsCloseButton.disabled = state.settingsSaving;
  openRouterApiKeyInput.disabled = state.settingsSaving;
  openRouterModelInput.disabled = state.settingsSaving;
  openRouterSiteUrlInput.disabled = state.settingsSaving;
  openRouterSiteTitleInput.disabled = state.settingsSaving;
  settingsSaveButton.textContent = state.settingsSaving ? "Saving" : "Save";
}

function isOperationRunning(): boolean {
  return Boolean(state.runningAction || state.runningOperation);
}

function getOperationFeedback(): string {
  if (state.runningOperation) {
    return state.runningOperation;
  }

  if (!state.lastOperationResult) {
    return "";
  }

  if (state.lastOperationResult.exitCode === 0) {
    return state.lastOperationResult.stdout.trim() || "Operation complete.";
  }

  return state.lastOperationResult.stderr.trim() || "Operation failed.";
}

function formatResultHeading(result: GitRunResult): string {
  const label = capitalize(result.action);
  return result.exitCode === 0 ? `${label} complete` : `${label} failed`;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
