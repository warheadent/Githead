import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { GitService } from "./gitService";
import { NodeProcessRunner } from "./processRunner";
import { QuickCommitService } from "./quickCommitService";

const runner = new NodeProcessRunner();
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function git(repoPath: string, args: string[]): Promise<string> {
  const result = await runner.run("git", ["-C", repoPath, ...args]);
  if (result.exitCode !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

async function fixture() {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "githead-quick-commit-"));
  roots.push(repoPath);
  await git(repoPath, ["init"]);
  await git(repoPath, ["config", "user.name", "Quick Commit Test"]);
  await git(repoPath, ["config", "user.email", "quick@example.test"]);
  await git(repoPath, ["config", "commit.gpgsign", "false"]);
  await fs.writeFile(path.join(repoPath, "selected.txt"), "original\n");
  await git(repoPath, ["add", "."]);
  await git(repoPath, ["commit", "-m", "Initial"]);
  await fs.writeFile(path.join(repoPath, "selected.txt"), "selected change\n");
  await fs.writeFile(path.join(repoPath, "other.txt"), "unselected change\n");
  const generate = vi.fn(async (_request: { repoPath: string }, _diff: string) => ({ repoPath, exitCode: 0, stdout: "Update selected file", stderr: "" }));
  const service = new QuickCommitService(new GitService(runner), { generateCommitMessageFromDiff: generate });
  const controller = new AbortController();
  return { repoPath, generate, service, controller, request: { repoPath, paths: ["selected.txt"] } };
}

describe("generated Quick Commit", { timeout: 30_000 }, () => {
  it("generates without staging and commits only selected files", async () => {
    const f = await fixture();
    f.generate.mockImplementation(async (_request, diff) => {
      expect(await git(f.repoPath, ["diff", "--cached", "--name-only"])).toBe("");
      expect(diff).toContain("selected change");
      expect(diff).not.toContain("unselected change");
      return { repoPath: f.repoPath, exitCode: 0, stdout: "Update selected file", stderr: "" };
    });
    const phases: string[] = [];
    const result = await f.service.generateAndCommit(f.request, f.controller.signal, undefined, undefined, (phase) => phases.push(phase));
    expect(result.exitCode).toBe(0);
    expect(phases).toEqual(["generating", "committing"]);
    expect(await git(f.repoPath, ["show", "--format=%s", "--name-only", "HEAD"])).toBe("Update selected file\n\nselected.txt");
    expect(await git(f.repoPath, ["status", "--porcelain"])).toBe("?? other.txt");
  });

  it("rejects existing staged changes before calling AI", async () => {
    const f = await fixture();
    await git(f.repoPath, ["add", "other.txt"]);
    const result = await f.service.generateAndCommit(f.request, f.controller.signal);
    expect(result.exitCode).not.toBe(0);
    expect(f.generate).not.toHaveBeenCalled();
    expect(await git(f.repoPath, ["diff", "--cached", "--name-only"])).toBe("other.txt");
  });

  it("leaves the index untouched when generation fails", async () => {
    const f = await fixture();
    f.generate.mockResolvedValue({ repoPath: f.repoPath, exitCode: 1, stdout: "", stderr: "Provider unavailable" });
    const result = await f.service.generateAndCommit(f.request, f.controller.signal);
    expect(result.stderr).toBe("Provider unavailable");
    expect(await git(f.repoPath, ["diff", "--cached", "--name-only"])).toBe("");
    expect(await git(f.repoPath, ["log", "-1", "--format=%s"])).toBe("Initial");
  });

  it("stops when selected contents change during generation and retains the message", async () => {
    const f = await fixture();
    f.generate.mockImplementation(async () => {
      await fs.writeFile(path.join(f.repoPath, "selected.txt"), "changed again\n");
      return { repoPath: f.repoPath, exitCode: 0, stdout: "Update selected file", stderr: "" };
    });
    const result = await f.service.generateAndCommit(f.request, f.controller.signal);
    expect(result.exitCode).not.toBe(0);
    expect(result.generatedMessage).toBe("Update selected file");
    expect(result.stderr).toContain("selected changes changed");
    expect(await git(f.repoPath, ["diff", "--cached", "--name-only"])).toBe("");
    expect(await git(f.repoPath, ["log", "-1", "--format=%s"])).toBe("Initial");
  });

  it("does not commit after cancellation during generation", async () => {
    const f = await fixture();
    f.generate.mockImplementation(async () => {
      f.controller.abort();
      return { repoPath: f.repoPath, exitCode: 0, stdout: "Update selected file", stderr: "" };
    });
    await expect(f.service.generateAndCommit(f.request, f.controller.signal)).rejects.toThrow();
    expect(await git(f.repoPath, ["diff", "--cached", "--name-only"])).toBe("");
    expect(await git(f.repoPath, ["log", "-1", "--format=%s"])).toBe("Initial");
  });

  it("preserves externally staged files added during generation", async () => {
    const f = await fixture();
    f.generate.mockImplementation(async () => {
      await git(f.repoPath, ["add", "other.txt"]);
      return { repoPath: f.repoPath, exitCode: 0, stdout: "Update selected file", stderr: "" };
    });
    const result = await f.service.generateAndCommit(f.request, f.controller.signal);
    expect(result.exitCode).not.toBe(0);
    expect(result.generatedMessage).toBe("Update selected file");
    expect(await git(f.repoPath, ["diff", "--cached", "--name-only"])).toBe("other.txt");
  });

  it("restores staging and retains the message if a commit hook rejects the commit", async () => {
    const f = await fixture();
    await fs.writeFile(path.join(f.repoPath, ".git", "hooks", "pre-commit"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const result = await f.service.generateAndCommit(f.request, f.controller.signal);
    expect(result.exitCode).not.toBe(0);
    expect(result.generatedMessage).toBe("Update selected file");
    expect(await git(f.repoPath, ["diff", "--cached", "--name-only"])).toBe("");
    expect(await git(f.repoPath, ["log", "-1", "--format=%s"])).toBe("Initial");
  });
});
