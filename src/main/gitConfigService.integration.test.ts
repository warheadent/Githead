import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { GitConfigService } from "./gitConfigService";
import { NodeProcessRunner, type ProcessRunner } from "./processRunner";
import type { GitConfigSaveRequest } from "../shared/gitConfig";

let directory: string;
let repoPath: string;
const runner = new NodeProcessRunner();
let service: GitConfigService;
async function git(...args: string[]): Promise<string> {
  const result = await runner.run("git", ["-C", repoPath, ...args]);
  if (result.exitCode !== 0) throw new Error(result.stderr || result.error);
  return result.stdout.trim();
}
async function save(changes: GitConfigSaveRequest["changes"], scope: "global" | "repository" = "repository") {
  const current = await service.getSettings({ repoPath, scope });
  return service.saveSettings({ ...current, changes });
}

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "githead-config-test-"));
  repoPath = path.join(directory, "repo");
  vi.stubEnv("GIT_CONFIG_GLOBAL", path.join(directory, "global"));
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  await fs.mkdir(repoPath);
  await git("init", "-b", "main");
  await git("config", "user.name", "Config Test");
  await git("config", "user.email", "test@example.invalid");
  service = new GitConfigService(runner);
});
afterEach(async () => { vi.unstubAllEnvs(); await fs.rm(directory, { recursive: true, force: true }); });

describe("Git configuration persistence", () => {
  it("preserves false, reads origins, and removes only the repository override", async () => {
    await save({ "fetch.prune": "true" }, "global");
    let settings = await save({ "fetch.prune": "false" });
    expect(settings.values["fetch.prune"]).toBe("false");
    expect(settings.effective["fetch.prune"]).toMatchObject({ value: "false", scope: "local" });
    expect(settings.inherited["fetch.prune"]).toMatchObject({ value: "true", scope: "global" });
    settings = await save({ "fetch.prune": null });
    expect(settings.values["fetch.prune"]).toBeNull();
    expect(settings.effective["fetch.prune"]).toMatchObject({ value: "true", scope: "global" });
    expect(await git("config", "user.name")).toBe("Config Test");
  });

  it("honors conditional includes without treating included values as editable file entries", async () => {
    const included = path.join(directory, "work config");
    await fs.writeFile(included, "[commit]\n gpgSign = true\n");
    await git("config", "--global", `includeIf.gitdir:${repoPath}/.path`, included);
    const before = await fs.readFile(included, "utf8");
    const settings = await service.getSettings({ repoPath, scope: "global" });
    expect(settings.values["commit.gpgsign"]).toBeNull();
    expect(settings.effective["commit.gpgsign"]).toMatchObject({ value: "true", origin: `file:${included}` });
    await save({ "commit.gpgsign": "false" }, "global");
    await save({ "commit.gpgsign": null }, "global");
    expect((await service.getSettings({ repoPath, scope: "global" })).effective["commit.gpgsign"]?.value).toBe("true");
    expect(await fs.readFile(included, "utf8")).toBe(before);
  });

  it("does not partially write invalid batches or stale revisions", async () => {
    const current = await service.getSettings({ repoPath, scope: "repository" });
    const before = await fs.readFile(current.filePath, "utf8");
    await expect(service.saveSettings({ ...current, changes: { "fetch.prune": "true", "init.defaultbranch": "bad name" } })).rejects.toThrow("branch name");
    expect(await fs.readFile(current.filePath, "utf8")).toBe(before);
    await git("config", "user.name", "Changed elsewhere");
    await expect(service.saveSettings({ ...current, changes: { "fetch.prune": "true" } })).rejects.toThrow("changed outside");
    expect(await git("config", "user.name")).toBe("Changed elsewhere");
  });

  it("leaves the original file intact if a later Git write fails", async () => {
    const current = await service.getSettings({ repoPath, scope: "repository" });
    const before = await fs.readFile(current.filePath, "utf8");
    const failingRunner: ProcessRunner = {
      run: (command, args, options) => args.includes("core.autocrlf") && args.includes("--replace-all")
        ? Promise.resolve({ exitCode: 4, stdout: "", stderr: "Test write failure" })
        : runner.run(command, args, options)
    };
    await expect(new GitConfigService(failingRunner).saveSettings({ ...current, changes: { "fetch.prune": "true", "core.autocrlf": "input" } })).rejects.toThrow("Test write failure");
    expect(await fs.readFile(current.filePath, "utf8")).toBe(before);
    await expect(fs.stat(`${current.filePath}.lock`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("respects another Git writer's lock", async () => {
    const current = await service.getSettings({ repoPath, scope: "repository" });
    await fs.writeFile(`${current.filePath}.lock`, "other writer");
    await expect(service.saveSettings({ ...current, changes: { "pull.ff": "only" } })).rejects.toThrow("locked");
    expect(await fs.readFile(`${current.filePath}.lock`, "utf8")).toBe("other writer");
  });

  it("reads worktree overrides while saving to the shared repository configuration", async () => {
    await git("commit", "--allow-empty", "-m", "initial");
    const worktree = path.join(directory, "worktree");
    await git("worktree", "add", "-b", "feature", worktree);
    await git("config", "extensions.worktreeConfig", "true");
    await runner.run("git", ["-C", worktree, "config", "--worktree", "fetch.prune", "false"]);
    const current = await service.getSettings({ repoPath: worktree, scope: "repository" });
    const result = await service.saveSettings({ ...current, changes: { "fetch.prune": "true" } });
    expect(result.values["fetch.prune"]).toBe("true");
    expect(result.effective["fetch.prune"]).toMatchObject({ value: "false", scope: "worktree" });
    expect(await git("config", "--local", "fetch.prune")).toBe("true");
  });

  it("preserves symlinked global configuration", async () => {
    const target = path.join(directory, "dotfiles");
    await fs.writeFile(target, "# keep this comment\n");
    await fs.symlink(target, process.env.GIT_CONFIG_GLOBAL!);
    await save({ "init.defaultbranch": "trunk" }, "global");
    expect((await fs.lstat(process.env.GIT_CONFIG_GLOBAL!)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(target, "utf8")).toContain("# keep this comment");
    expect(await git("config", "--global", "init.defaultbranch")).toBe("trunk");
  });

  it("edits an extensionless ignore file and rejects stale editor saves", async () => {
    const ignorePath = path.join(directory, "personal-ignore");
    await save({ "core.excludesfile": ignorePath });
    const file = await service.getIgnoreFile({ repoPath, scope: "repository" });
    expect(file.contents).toBe("");
    await service.saveIgnoreFile({ repoPath, scope: "repository", ...file, contents: "*.local\n" });
    expect(await git("check-ignore", "settings.local")).toBe("settings.local");
    await expect(service.saveIgnoreFile({ repoPath, scope: "repository", ...file, contents: "*.log\n" })).rejects.toThrow("changed outside");
    expect(await fs.readFile(ignorePath, "utf8")).toBe("*.local\n");
  });

  it("uses the selected initial branch and line ending conversion", async () => {
    await save({ "init.defaultbranch": "trunk" }, "global");
    const created = path.join(directory, "new-repository");
    await git("init", created);
    expect((await runner.run("git", ["-C", created, "symbolic-ref", "--short", "HEAD"])).stdout.trim()).toBe("trunk");
    await save({ "core.autocrlf": "input", "core.safecrlf": "false", "rerere.enabled": "true" });
    await fs.writeFile(path.join(repoPath, "lines.txt"), "first\r\nsecond\r\n");
    await git("add", "lines.txt");
    expect((await runner.run("git", ["-C", repoPath, "show", ":lines.txt"])).stdout).toBe("first\nsecond\n");
    expect(await git("config", "--bool", "rerere.enabled")).toBe("true");
  });

  it("does not publish a configuration save cancelled during staging", async () => {
    const current = await service.getSettings({ repoPath, scope: "repository" });
    const controller = new AbortController();
    const cancelling: ProcessRunner = { run: async (command, args, options) => {
      const result = await runner.run(command, args, options);
      if (args.includes("--replace-all")) controller.abort(new Error("Cancelled"));
      return result;
    } };
    await expect(new GitConfigService(cancelling).saveSettings({ ...current, changes: { "fetch.prune": "false" } }, controller.signal)).rejects.toThrow("Cancelled");
    expect((await service.getSettings({ repoPath, scope: "repository" })).revision).toBe(current.revision);
  });

  it("tests SSH signing without changing HEAD, the index, or saved configuration", async () => {
    const keyPath = path.join(directory, "signing-key");
    const generated = await runner.run("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", keyPath]);
    expect(generated.exitCode).toBe(0);
    await git("commit", "--allow-empty", "-m", "initial");
    const head = await git("rev-parse", "HEAD");
    await save({ "gpg.format": "ssh", "user.signingkey": keyPath, "commit.gpgsign": "true" });
    const config = await fs.readFile(path.join(repoPath, ".git/config"), "utf8");
    expect(await service.testSigning({ repoPath, scope: "repository" })).toMatchObject({ ok: true });
    expect(await git("rev-parse", "HEAD")).toBe(head);
    expect(await git("status", "--porcelain")).toBe("");
    expect(await fs.readFile(path.join(repoPath, ".git/config"), "utf8")).toBe(config);
    await git("config", "gpg.ssh.program", path.join(directory, "missing-signer"));
    expect(await service.testSigning({ repoPath, scope: "repository" })).toMatchObject({ ok: false });
  });
});
