import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  GIT_CONFIG_KEYS, emptyGitConfigValues,
  type GitConfigEntry, type GitConfigKey, type GitConfigRequest, type GitConfigSaveRequest,
  type GitConfigSettings, type GitConfigValues, type GitIgnoreFile, type GitIgnoreFileSaveRequest, type GitSigningTestRequest, type GitSigningTestResult
} from "../shared/gitConfig";
import type { ProcessRunner } from "./processRunner";

const configPattern = `^(${GIT_CONFIG_KEYS.map((key) => key.replaceAll(".", "\\.")).join("|")}|branch\\..*\\.rebase)$`;
const booleanKeys = new Set<GitConfigKey>(["commit.gpgsign", "fetch.prune", "push.autosetupremote", "rerere.enabled"]);
const enumValues: Partial<Record<GitConfigKey, readonly string[]>> = {
  "gpg.format": ["openpgp", "ssh", "x509"],
  "pull.rebase": ["true", "false", "merges", "interactive"],
  "pull.ff": ["true", "false", "only"],
  "core.autocrlf": ["true", "false", "input"],
  "core.safecrlf": ["true", "false", "warn"]
};

/** Owns the editable Git settings, their origins, and atomic configuration writes. */
export class GitConfigService {
  constructor(private readonly runner: ProcessRunner) {}

  async getIgnoreFilePath(request: GitConfigRequest): Promise<string> {
    validateRequest(request);
    const result = await this.runner.run("git", [
      ...(request.repoPath ? ["-C", request.repoPath] : []), "config", "--path", "--get", "core.excludesfile"
    ], { cwd: request.repoPath || os.tmpdir() });
    if (result.exitCode !== 0 && result.exitCode !== 1) throw new Error(result.stderr || "Unable to read the ignore file path.");
    return result.exitCode === 0
      ? path.resolve(request.repoPath || os.tmpdir(), result.stdout.trim())
      : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "git", "ignore");
  }

  async getSettings(request: GitConfigRequest): Promise<GitConfigSettings> {
    validateRequest(request);
    const filePath = await this.configPath(request);
    const contents = await readOptionalFile(filePath);
    const [own, effective, branch] = await Promise.all([
      contents === null ? Promise.resolve([]) : this.readEntries(["--file", filePath, "--no-includes"], request.repoPath),
      this.readEntries(["--includes"], request.repoPath),
      request.repoPath ? this.runner.run("git", ["-C", request.repoPath, "branch", "--show-current"]) : Promise.resolve(null)
    ]);
    const values = emptyGitConfigValues();
    for (const entry of own) if (isConfigKey(entry.key)) values[entry.key] = normalizeValue(entry.key, entry.value);
    const resolved: GitConfigSettings["effective"] = {};
    const inherited: GitConfigSettings["inherited"] = {};
    let branchRebase: GitConfigEntry | null = null;
    for (const { key, ...entry } of effective) {
      if (isConfigKey(key)) {
        resolved[key] = { ...entry, value: normalizeValue(key, entry.value) };
        const originPath = entry.origin.startsWith("file:")
          ? await fs.realpath(path.resolve(request.repoPath || os.tmpdir(), entry.origin.slice(5))).catch(() => "") : "";
        if (originPath !== filePath) inherited[key] = resolved[key]!;
      }
      if (branch?.exitCode === 0 && key === `branch.${branch.stdout.trim()}.rebase`) branchRebase = entry;
    }
    return { repoPath: request.repoPath, scope: request.scope, filePath, revision: revision(contents), values, effective: resolved, inherited, branchRebase };
  }

  async saveSettings(request: GitConfigSaveRequest, signal?: AbortSignal): Promise<GitConfigSettings> {
    validateRequest(request);
    await this.validateChanges(request.changes);
    const filePath = await this.configPath(request);
    signal?.throwIfAborted();
    await this.updateFile(filePath, request.revision, async (lockPath) => {
      for (const [key, value] of Object.entries(request.changes)) {
        signal?.throwIfAborted();
        const result = await this.runner.run("git", [
          "config", "--file", lockPath,
          ...(value === null ? ["--unset-all", key] : ["--replace-all", key, value])
        ]);
        if (result.exitCode !== 0 && !(value === null && result.exitCode === 5)) {
          throw new Error(result.stderr.trim() || result.error || `Unable to save ${key}.`);
        }
      }
    }, signal);
    return this.getSettings(request);
  }

  async getIgnoreFile(request: GitConfigRequest): Promise<GitIgnoreFile> {
    const configuredPath = await this.getIgnoreFilePath(request);
    const filePath = await resolveWritableFilePath(configuredPath);
    const stats = await fs.stat(filePath).catch((error: unknown) => {
      if (hasCode(error, "ENOENT")) return null;
      throw error;
    });
    if (stats && (!stats.isFile() || stats.size > 1024 * 1024)) throw new Error("Choose a text ignore file smaller than 1 MB.");
    const contents = await readOptionalFile(filePath);
    if (contents && (contents.includes(0) || !Buffer.from(contents.toString("utf8")).equals(contents))) throw new Error("The ignore file must contain UTF-8 text.");
    return { filePath, contents: contents?.toString("utf8") ?? "", revision: revision(contents) };
  }

  async saveIgnoreFile(request: GitIgnoreFileSaveRequest, signal?: AbortSignal): Promise<GitIgnoreFile> {
    if (typeof request.contents !== "string" || request.contents.includes("\0") || Buffer.byteLength(request.contents) > 1024 * 1024) throw new Error("The ignore file must contain less than 1 MB of text.");
    const current = await this.getIgnoreFile(request);
    if (current.filePath !== request.filePath) throw new Error("The ignore file path changed. Close the editor and open it again.");
    await this.updateFile(current.filePath, request.revision, (lockPath) => fs.writeFile(lockPath, request.contents, "utf8"), signal);
    return this.getIgnoreFile(request);
  }

  private async updateFile(filePath: string, expectedRevision: string, update: (lockPath: string) => Promise<void>, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const lockPath = `${filePath}.lock`;
    const lock = await fs.open(lockPath, "wx", 0o600).catch((error: unknown) => {
      if (hasCode(error, "EEXIST")) throw new Error("Git configuration is locked by another operation. Retry when it finishes.");
      throw error;
    });
    let published = false;
    try {
      const contents = await readOptionalFile(filePath);
      if (revision(contents) !== expectedRevision) throw new Error("Git configuration changed outside this dialog. Reload the settings before saving.");
      if (contents !== null) await lock.chmod((await fs.stat(filePath)).mode & 0o777);
      await lock.writeFile(contents ?? "");
      await lock.close();
      await update(lockPath);
      signal?.throwIfAborted();
      await fs.rename(lockPath, filePath);
      published = true;
    } finally {
      await lock.close();
      if (!published) await fs.rm(lockPath, { force: true });
    }
  }

  async testSigning(request: GitSigningTestRequest): Promise<GitSigningTestResult> {
    validateRequest(request);
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "githead-signing-"));
    try {
      const testRepo = request.repoPath || path.join(directory, "repository");
      if (!request.repoPath) {
        const initialized = await this.runner.run("git", ["init", "--quiet", testRepo]);
        if (initialized.exitCode !== 0) throw new Error(initialized.stderr || "Unable to create the signing test repository.");
      }
      const objectPath = path.join(directory, "objects");
      await fs.mkdir(objectPath);
      const env = { ...process.env, GIT_OBJECT_DIRECTORY: objectPath };
      const tree = await this.runner.run("git", ["-C", testRepo, "mktree"], { stdin: "", env });
      if (tree.exitCode !== 0) throw new Error(tree.stderr || "Unable to create the signing test tree.");
      // Keep the repository context for includes, key selection, and signing programs.
      // All test objects go to a temporary object directory; no refs or hooks are used.
      const result = await this.runner.run("git", [
        "-C", testRepo, "commit-tree", "-S", tree.stdout.trim(), "-m", "Githead signing test"
      ], { timeoutMs: 30_000, env });
      return result.exitCode === 0
        ? { ok: true, message: "Signing succeeded. No repository branch was changed." }
        : { ok: false, message: result.stderr.trim() || result.error || "Signing failed. Check the key and signing program." };
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }

  private async validateChanges(changes: Partial<GitConfigValues>): Promise<void> {
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw new Error("Invalid Git configuration changes.");
    for (const [key, value] of Object.entries(changes)) {
      if (!isConfigKey(key)) throw new Error("This Git setting cannot be edited here.");
      if (value === null) continue;
      if (typeof value !== "string" || !value.trim() || value.includes("\0") || value.length > 8192) throw new Error(`Enter a valid value for ${key}.`);
      const allowed = booleanKeys.has(key) ? ["true", "false"] : enumValues[key];
      if (allowed && !allowed.includes(value)) throw new Error(`Invalid value for ${key}.`);
      if (key === "init.defaultbranch") {
        const checked = await this.runner.run("git", ["check-ref-format", "--branch", value]);
        if (value.startsWith("-") || value === "HEAD" || value.includes("@{") || checked.exitCode !== 0) throw new Error("Enter a valid initial branch name.");
      }
    }
  }

  private async configPath(request: GitConfigRequest): Promise<string> {
    let configPath: string;
    if (request.scope === "repository") {
      const result = await this.runner.run("git", ["-C", request.repoPath, "rev-parse", "--path-format=absolute", "--git-path", "config"]);
      if (result.exitCode !== 0) throw new Error(result.stderr.trim() || "Select a Git repository before editing its configuration.");
      configPath = result.stdout.trim();
    } else if (process.env.GIT_CONFIG_GLOBAL) {
      configPath = path.resolve(process.env.GIT_CONFIG_GLOBAL);
    } else {
      const homeConfig = path.join(os.homedir(), ".gitconfig");
      const xdgConfig = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "git", "config");
      configPath = await readOptionalFile(homeConfig) !== null || await readOptionalFile(xdgConfig) === null ? homeConfig : xdgConfig;
    }
    // Preserve symlinked dotfiles by replacing their target, as Git does.
    return resolveWritableFilePath(configPath);
  }

  private async readEntries(scopeArgs: string[], repoPath: string, pattern = configPattern): Promise<Array<GitConfigEntry & { key: string }>> {
    const result = await this.runner.run("git", [
      ...(repoPath ? ["-C", repoPath] : []), "config", ...scopeArgs,
      "--null", "--show-origin", "--show-scope", "--get-regexp", pattern
    ], { cwd: repoPath || os.tmpdir() });
    if (result.exitCode === 1 && !result.stdout && !result.stderr && !result.error) return [];
    if (result.exitCode !== 0) throw new Error(result.stderr.trim() || result.error || "Unable to read Git configuration.");
    const fields = result.stdout.split("\0");
    const entries: Array<GitConfigEntry & { key: string }> = [];
    for (let index = 0; index + 2 < fields.length; index += 3) {
      const record = fields[index + 2]!;
      const separator = record.indexOf("\n");
      entries.push({ scope: fields[index]!, origin: fields[index + 1]!, key: separator < 0 ? record : record.slice(0, separator), value: separator < 0 ? "true" : record.slice(separator + 1) });
    }
    return entries;
  }
}

function validateRequest(request: GitConfigRequest): void {
  if (!request || (request.scope !== "global" && request.scope !== "repository") || typeof request.repoPath !== "string") throw new Error("Choose a valid Git configuration scope.");
  if (request.scope === "repository" && !request.repoPath.trim()) throw new Error("Select a repository before editing Git configuration.");
}

function isConfigKey(key: string): key is GitConfigKey { return GIT_CONFIG_KEYS.some((candidate) => candidate === key); }
function hasCode(error: unknown, code: string): boolean { return error instanceof Error && "code" in error && error.code === code; }
async function resolveWritableFilePath(filePath: string): Promise<string> {
  try {
    return await fs.realpath(filePath);
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;
    const parent = path.dirname(filePath);
    if (parent === filePath) throw error;
    // Resolve existing parents before creation so aliases and Windows short paths stay stable.
    return path.join(await resolveWritableFilePath(parent), path.basename(filePath));
  }
}
async function readOptionalFile(filePath: string): Promise<Buffer | null> {
  try { return await fs.readFile(filePath); } catch (error) { if (hasCode(error, "ENOENT")) return null; throw error; }
}
function revision(contents: Buffer | null): string { return createHash("sha256").update(contents === null ? "missing:" : "file:").update(contents ?? "").digest("hex"); }
function normalizeValue(key: GitConfigKey, value: string): string {
  if (booleanKeys.has(key) || ["pull.rebase", "pull.ff", "core.autocrlf", "core.safecrlf"].includes(key)) {
    if (["yes", "on", "1", "true"].includes(value.toLowerCase())) return "true";
    if (["no", "off", "0", "false", ""].includes(value.toLowerCase())) return "false";
  }
  return value;
}
