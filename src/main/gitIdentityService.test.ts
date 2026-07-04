import { describe, expect, it } from "vite-plus/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GitIdentityService } from "./gitIdentityService";
import type { ProcessResult, ProcessRunOptions, ProcessRunner } from "./processRunner";

interface RunnerCall {
  command: string;
  args: string[];
  options?: ProcessRunOptions;
}

class FakeRunner implements ProcessRunner {
  readonly calls: RunnerCall[] = [];

  constructor(private readonly results: ProcessResult[]) {}

  async run(command: string, args: string[], options?: ProcessRunOptions): Promise<ProcessResult> {
    this.calls.push({
      command,
      args,
      ...(options ? { options } : {})
    });

    const result = this.results.shift();
    if (!result) {
      throw new Error("Fake runner has no result queued.");
    }

    return result;
  }
}

const ok = (stdout = ""): ProcessResult => ({
  exitCode: 0,
  stdout,
  stderr: ""
});

const failure = (stderr = "fatal: failed"): ProcessResult => ({
  exitCode: 1,
  stdout: "",
  stderr
});

async function withTempDir<T>(callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "githead-identity-test-"));

  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, {
      recursive: true,
      force: true
    });
  }
}

describe("GitIdentityService", () => {
  it("reads repository and global identity with repository as the default scope", async () => {
    await withTempDir(async (dir) => {
      const runner = new FakeRunner([
        ok("Repo User\n"),
        ok("repo@example.test\n"),
        ok("Global User\n"),
        ok("global@example.test\n")
      ]);
      const service = new GitIdentityService(dir, runner);

      await expect(service.getIdentity("D:\\Repo")).resolves.toEqual({
        scope: "repository",
        name: "Repo User",
        email: "repo@example.test",
        repository: {
          name: "Repo User",
          email: "repo@example.test"
        },
        global: {
          name: "Global User",
          email: "global@example.test"
        }
      });
      expect(runner.calls.map((call) => call.args)).toEqual([
        ["-C", "D:\\Repo", "config", "--get", "user.name"],
        ["-C", "D:\\Repo", "config", "--get", "user.email"],
        ["config", "--global", "--get", "user.name"],
        ["config", "--global", "--get", "user.email"]
      ]);
    });
  });

  it("writes repository identity and persists the selected default", async () => {
    await withTempDir(async (dir) => {
      const runner = new FakeRunner([
        ok(),
        ok(),
        ok("Taylor\n"),
        ok("taylor@example.test\n"),
        failure(),
        failure()
      ]);
      const service = new GitIdentityService(dir, runner);

      await expect(service.saveIdentity({
        repoPath: "D:\\Repo",
        name: " Taylor ",
        email: " taylor@example.test ",
        scope: "repository"
      })).resolves.toMatchObject({
        scope: "repository",
        name: "Taylor",
        email: "taylor@example.test"
      });

      expect(runner.calls.slice(0, 2).map((call) => call.args)).toEqual([
        ["-C", "D:\\Repo", "config", "user.name", "Taylor"],
        ["-C", "D:\\Repo", "config", "user.email", "taylor@example.test"]
      ]);
      await expect(fs.readFile(path.join(dir, "git-identity-settings.json"), "utf8"))
        .resolves.toContain("\"scope\": \"repository\"");
    });
  });

  it("writes global identity", async () => {
    await withTempDir(async (dir) => {
      const runner = new FakeRunner([
        ok(),
        ok(),
        failure(),
        failure(),
        ok("Taylor\n"),
        ok("taylor@example.test\n")
      ]);
      const service = new GitIdentityService(dir, runner);

      await service.saveIdentity({
        repoPath: "D:\\Repo",
        name: "Taylor",
        email: "taylor@example.test",
        scope: "global"
      });

      expect(runner.calls.slice(0, 2).map((call) => call.args)).toEqual([
        ["config", "--global", "user.name", "Taylor"],
        ["config", "--global", "user.email", "taylor@example.test"]
      ]);
    });
  });

  it("validates identity before spawning git", async () => {
    await withTempDir(async (dir) => {
      const runner = new FakeRunner([]);
      const service = new GitIdentityService(dir, runner);

      await expect(service.saveIdentity({
        repoPath: "D:\\Repo",
        name: "",
        email: "bad",
        scope: "repository"
      })).rejects.toThrow("Enter your Git author name.");
      expect(runner.calls).toHaveLength(0);
    });
  });

  it("surfaces git config write failures", async () => {
    await withTempDir(async (dir) => {
      const runner = new FakeRunner([
        failure("error: could not lock config file")
      ]);
      const service = new GitIdentityService(dir, runner);

      await expect(service.saveIdentity({
        repoPath: "D:\\Repo",
        name: "Taylor",
        email: "taylor@example.test",
        scope: "repository"
      })).rejects.toThrow("error: could not lock config file");
    });
  });
});
