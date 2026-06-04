import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import type {
  GitActionsConfig,
  GitConfiguredAction,
  GitConfiguredActionFile,
  GitConfiguredActionFileConfig,
  GitConfiguredActionShell,
  GitConfiguredActionSaveRequest,
  GitOperationResult
} from "../shared/types";
import { GIT_CONFIGURED_ACTION_SHELLS } from "../shared/types";

const ACTION_FILE_NAMES: Record<GitConfiguredActionFile, string> = {
  shared: "actions.toml",
  local: "actions.local.toml"
};

const EMPTY_FILE_CONFIGS: Record<GitConfiguredActionFile, GitConfiguredActionFileConfig> = {
  shared: createEmptyActionFileConfig("shared"),
  local: createEmptyActionFileConfig("local")
};

export function createEmptyActionsConfig(): GitActionsConfig {
  return createActionsConfig(false, EMPTY_FILE_CONFIGS.shared, EMPTY_FILE_CONFIGS.local, "");
}

export async function readActionsConfig(repoRoot: string): Promise<GitActionsConfig> {
  const githeadPath = path.join(repoRoot, ".githead");
  const stats = await getStats(githeadPath);
  if (!stats) {
    return createEmptyActionsConfig();
  }

  if (!stats.isDirectory()) {
    const shared = createEmptyActionFileConfig("shared", false);
    const local = createEmptyActionFileConfig("local", false);
    return createActionsConfig(false, shared, local, ".githead must be a folder.");
  }

  const shared = await readActionsFile(githeadPath, "shared");
  const local = await readActionsFile(githeadPath, "local");
  const error = shared.error || local.error;

  return createActionsConfig(true, shared, local, error);
}

export async function saveActionsConfigFile(
  repoRoot: string,
  request: GitConfiguredActionSaveRequest
): Promise<GitOperationResult> {
  const target = request.target;
  if (!isActionFileTarget(target)) {
    return createOperationFailure(request.repoPath, "Repository Action target is invalid.");
  }

  const validation = validateActionList(ACTION_FILE_NAMES[target], request.actions);
  if (validation) {
    return createOperationFailure(request.repoPath, validation);
  }

  const githeadPath = path.join(repoRoot, ".githead");
  const githeadStats = await getStats(githeadPath);
  if (githeadStats && !githeadStats.isDirectory()) {
    return createOperationFailure(request.repoPath, ".githead must be a folder.");
  }

  const filePath = path.join(githeadPath, ACTION_FILE_NAMES[target]);
  const existingText = await readTextFileIfExists(filePath);
  if (existingText !== null) {
    const existing = parseActionsFile(ACTION_FILE_NAMES[target], existingText);
    if (existing.error) {
      return createOperationFailure(request.repoPath, `${ACTION_FILE_NAMES[target]}: ${existing.error}`);
    }

    if (hasTomlComment(existingText) || existing.blockedReason) {
      return createOperationFailure(
        request.repoPath,
        `${ACTION_FILE_NAMES[target]} cannot be edited in Githead because it contains comments or fields Githead does not manage.`
      );
    }
  }

  if (!githeadStats) {
    await fs.mkdir(githeadPath, {
      recursive: true
    });
  }

  const text = formatActionsFile(request.actions);
  const tempPath = path.join(githeadPath, `${ACTION_FILE_NAMES[target]}.${process.pid}.${Date.now()}.tmp`);
  try {
    await fs.writeFile(tempPath, text, "utf8");
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, {
      force: true
    }).catch(() => undefined);
    throw error;
  }

  return {
    repoPath: request.repoPath,
    exitCode: 0,
    stdout: "Repository Actions saved.",
    stderr: ""
  };
}

export function getActionKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export function isConfiguredActionShell(value: string): value is GitConfiguredActionShell {
  return GIT_CONFIGURED_ACTION_SHELLS.includes(value as GitConfiguredActionShell);
}

function createActionsConfig(
  hasGitheadDir: boolean,
  shared: GitConfiguredActionFileConfig,
  local: GitConfiguredActionFileConfig,
  error: string
): GitActionsConfig {
  return {
    hasGitheadDir,
    shared,
    local,
    actions: error ? [] : mergeActions(shared.actions, local.actions),
    error
  };
}

function mergeActions(
  sharedActions: GitConfiguredAction[],
  localActions: GitConfiguredAction[]
): GitConfiguredAction[] {
  const mergedActions: GitConfiguredAction[] = [];
  const actionIndexes = new Map<string, number>();

  for (const action of [
    ...sharedActions,
    ...localActions
  ]) {
    const key = getActionKey(action.name);
    const existingIndex = actionIndexes.get(key);
    if (existingIndex === undefined) {
      actionIndexes.set(key, mergedActions.length);
      mergedActions.push(action);
    } else {
      mergedActions[existingIndex] = action;
    }
  }

  return mergedActions;
}

async function readActionsFile(
  githeadPath: string,
  target: GitConfiguredActionFile
): Promise<GitConfiguredActionFileConfig> {
  const fileName = ACTION_FILE_NAMES[target];
  const filePath = path.join(githeadPath, fileName);
  const text = await readTextFileIfExists(filePath);
  if (text === null) {
    return createEmptyActionFileConfig(target);
  }

  const parsed = parseActionsFile(fileName, text);
  return {
    target,
    fileName,
    exists: true,
    actions: parsed.actions,
    error: parsed.error ? `${fileName}: ${parsed.error}` : "",
    writable: !parsed.error && !hasTomlComment(text) && !parsed.blockedReason,
    blockedReason: parsed.error
      ? ""
      : hasTomlComment(text)
        ? "This file contains comments. Edit it manually to preserve them."
        : parsed.blockedReason
  };
}

function parseActionsFile(
  fileName: string,
  text: string
): { actions: GitConfiguredAction[]; error: string; blockedReason: string } {
  let parsed: unknown;
  try {
    parsed = parseToml(text);
  } catch (error) {
    return {
      actions: [],
      error: error instanceof Error ? error.message : "Unable to parse TOML.",
      blockedReason: ""
    };
  }

  if (!isRecord(parsed)) {
    return {
      actions: [],
      error: "Actions config must be a TOML table.",
      blockedReason: ""
    };
  }

  const topLevelKeys = Object.keys(parsed);
  const unknownTopLevelKeys = topLevelKeys.filter((key) => key !== "actions");
  let blockedReason = "";
  if (unknownTopLevelKeys.length > 0) {
    blockedReason = `${fileName} contains fields Githead does not manage.`;
  }

  const rawActions = parsed.actions;
  if (rawActions === undefined) {
    return {
      actions: [],
      error: "",
      blockedReason: ""
    };
  }

  if (!Array.isArray(rawActions)) {
    return {
      actions: [],
      error: "Expected [[actions]] array tables.",
      blockedReason: ""
    };
  }

  const actions: GitConfiguredAction[] = [];
  const seenNames = new Set<string>();
  for (const [index, rawAction] of rawActions.entries()) {
    if (!isRecord(rawAction)) {
      return {
        actions: [],
        error: `Action ${index + 1} must be a table.`,
        blockedReason: ""
      };
    }

    const unknownActionKeys = Object.keys(rawAction).filter((key) => key !== "name" && key !== "command" && key !== "shell");
    if (unknownActionKeys.length > 0) {
      blockedReason ||= `${fileName} contains action fields Githead does not manage.`;
    }

    const action = parseActionTable(fileName, rawAction, index, seenNames);
    if ("error" in action) {
      return {
        actions: [],
        error: action.error,
        blockedReason: ""
      };
    }

    actions.push(action);
  }

  return {
    actions,
    error: "",
    blockedReason
  };
}

function parseActionTable(
  fileName: string,
  rawAction: Record<string, unknown>,
  index: number,
  seenNames: Set<string>
): GitConfiguredAction | { error: string } {
  const name = typeof rawAction.name === "string" ? rawAction.name.trim() : "";
  if (!name) {
    return {
      error: `Action ${index + 1} is missing a name.`
    };
  }

  const key = getActionKey(name);
  if (seenNames.has(key)) {
    return {
      error: `Duplicate action name "${name}" in ${fileName}.`
    };
  }
  seenNames.add(key);

  const command = typeof rawAction.command === "string" ? rawAction.command.trim() : "";
  if (!command) {
    return {
      error: `Action "${name}" is missing a command.`
    };
  }

  const shell = typeof rawAction.shell === "string" ? rawAction.shell.trim() : "";
  if (!isConfiguredActionShell(shell)) {
    return {
      error: `Action "${name}" has an invalid shell.`
    };
  }

  return {
    name,
    command,
    shell
  };
}

function validateActionList(fileName: string, actions: GitConfiguredAction[]): string {
  const seenNames = new Set<string>();
  for (const [index, action] of actions.entries()) {
    if (!isRecord(action)) {
      return `Action ${index + 1} must be a table.`;
    }

    const parsed = parseActionTable(fileName, action, index, seenNames);
    if ("error" in parsed) {
      return parsed.error;
    }
  }

  return "";
}

function formatActionsFile(actions: GitConfiguredAction[]): string {
  if (actions.length === 0) {
    return "";
  }

  return `${actions.map((action) => [
    "[[actions]]",
    `name = ${formatTomlString(action.name.trim())}`,
    `command = ${formatTomlString(action.command.trim())}`,
    `shell = ${formatTomlString(action.shell)}`,
    ""
  ].join("\n")).join("\n")}`;
}

function formatTomlString(value: string): string {
  return JSON.stringify(value);
}

function hasTomlComment(text: string): boolean {
  let quote: "\"" | "'" | null = null;
  let escaped = false;

  for (const char of text) {
    if (quote === "\"") {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        quote = null;
      }
      continue;
    }

    if (quote === "'") {
      if (char === "'") {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === "#") {
      return true;
    }
  }

  return false;
}

async function readTextFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function getStats(filePath: string): Promise<Awaited<ReturnType<typeof fs.stat>> | null> {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function createEmptyActionFileConfig(
  target: GitConfiguredActionFile,
  writable = true
): GitConfiguredActionFileConfig {
  return {
    target,
    fileName: ACTION_FILE_NAMES[target],
    exists: false,
    actions: [],
    error: "",
    writable,
    blockedReason: ""
  };
}

function isActionFileTarget(value: string): value is GitConfiguredActionFile {
  return value === "shared" || value === "local";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function createOperationFailure(repoPath: string, stderr: string): GitOperationResult {
  return {
    repoPath,
    exitCode: -1,
    stdout: "",
    stderr
  };
}
