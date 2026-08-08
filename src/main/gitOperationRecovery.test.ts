import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { GitRepositoryOperationKind } from "../shared/types";
import {
  getGitOperationCommand,
  getOperationActions,
  GitOperationRecoveryService,
  parseOperationStatus
} from "./gitOperationRecovery";
import type { ProcessResult, ProcessRunner } from "./processRunner";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("Git operation state parsing", () => {
  it("keeps conflicted paths NUL-safe, including spaces", () => {
    const parsed = parseOperationStatus([
      "# branch.head feature/recovery",
      "u UU N... 100644 100644 100644 100644 aaaaaaa bbbbbbb ccccccc src/a conflicted file.ts",
      "1 M. N... 100644 100644 100644 aaaaaaa bbbbbbb src/other.ts"
    ].join("\0"));

    expect(parsed).toEqual({
      currentBranch: "feature/recovery",
      conflictedPaths: ["src/a conflicted file.ts"],
      hasChanges: true
    });
  });

  it.each([
    ["merge", "merge", null],
    ["rebase merge backend", "rebase", "merge"],
    ["rebase apply backend", "rebase", "apply"],
    ["cherry-pick sequence", "cherry-pick", null],
    ["revert sequence", "revert", null]
  ] as const)("detects %s metadata", async (fixture, expectedKind, expectedBackend) => {
    const { repoPath, gitDir } = await createLayout();
    await writeOperationFixture(gitDir, fixture);
    const service = new GitOperationRecoveryService(layoutRunner(gitDir));
    const status = [
      "# branch.oid 0123456789012345678901234567890123456789",
      "# branch.head main",
      "u UU N... 100644 100644 100644 100644 aaaaaaa bbbbbbb ccccccc conflict.txt"
    ].join("\0");

    const state = await service.detect(repoPath, status);

    expect(state).toMatchObject({
      kind: expectedKind,
      backend: expectedBackend,
      phase: "conflicts",
      hasConflicts: true,
      conflictedPaths: ["conflict.txt"],
      originalBranch: expectedKind === "rebase" ? "feature/topic" : "main"
    });
    if (expectedKind === "rebase") expect(state?.sequence).toEqual({ current: 2, total: 4 });
  });
});

describe("Git operation action selection", () => {
  it.each(["rebase", "cherry-pick", "revert"] satisfies GitRepositoryOperationKind[])(
    "supports skip for %s",
    (kind) => {
      expect(getGitOperationCommand(kind, "skip")).toEqual([kind, "--skip"]);
      expect(getOperationActions(kind, "conflicts", true).skip).toMatchObject({ supported: true, enabled: true });
    }
  );

  it("rejects merge skip and disables Continue while conflicts remain", () => {
    expect(getGitOperationCommand("merge", "skip")).toBeNull();
    expect(getOperationActions("merge", "conflicts", true)).toMatchObject({
      continue: { supported: true, enabled: false },
      skip: { supported: false, enabled: false },
      abort: { supported: true, enabled: true, requiresConfirmation: true }
    });
  });

  it("uses a non-interactive editor for Continue", () => {
    expect(getGitOperationCommand("rebase", "continue")).toEqual(["-c", "core.editor=true", "rebase", "--continue"]);
  });

  it("offers Keep empty only for an empty cherry-pick", () => {
    expect(getGitOperationCommand("cherry-pick", "keep-empty")).toBeNull();
    expect(getOperationActions("cherry-pick", "empty-commit", false)).toMatchObject({
      continue: { enabled: false },
      skip: { enabled: true },
      "keep-empty": { supported: true, enabled: true },
      abort: { enabled: true }
    });
    expect(getOperationActions("revert", "ready-to-continue", false)["keep-empty"]).toMatchObject({
      supported: false,
      enabled: false
    });
  });
});

async function createLayout(): Promise<{ repoPath: string; gitDir: string }> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "githead-operation-unit-"));
  temporaryDirectories.push(repoPath);
  const gitDir = path.join(repoPath, ".git");
  await fs.mkdir(gitDir);
  return { repoPath, gitDir };
}

function layoutRunner(gitDir: string): ProcessRunner {
  return {
    async run(): Promise<ProcessResult> {
      return {
        exitCode: 0,
        stdout: [
          gitDir,
          gitDir,
          path.join(gitDir, "MERGE_HEAD"),
          path.join(gitDir, "rebase-merge"),
          path.join(gitDir, "rebase-apply"),
          path.join(gitDir, "CHERRY_PICK_HEAD"),
          path.join(gitDir, "REVERT_HEAD"),
          path.join(gitDir, "sequencer")
        ].join("\n") + "\n",
        stderr: ""
      };
    }
  };
}

async function writeOperationFixture(
  gitDir: string,
  fixture: "merge" | "rebase merge backend" | "rebase apply backend" | "cherry-pick sequence" | "revert sequence"
): Promise<void> {
  if (fixture === "merge") {
    await fs.writeFile(path.join(gitDir, "MERGE_HEAD"), "a".repeat(40));
    return;
  }
  if (fixture.startsWith("rebase")) {
    const directory = path.join(gitDir, fixture.endsWith("merge backend") ? "rebase-merge" : "rebase-apply");
    await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, "head-name"), "refs/heads/feature/topic\n");
    await fs.writeFile(path.join(directory, fixture.endsWith("merge backend") ? "msgnum" : "next"), "2\n");
    await fs.writeFile(path.join(directory, fixture.endsWith("merge backend") ? "end" : "last"), "4\n");
    return;
  }
  const sequencer = path.join(gitDir, "sequencer");
  await fs.mkdir(sequencer);
  if (fixture === "cherry-pick sequence") {
    await fs.writeFile(path.join(gitDir, "CHERRY_PICK_HEAD"), "b".repeat(40));
    await fs.writeFile(path.join(sequencer, "todo"), "pick bbbbbbb Subject\n");
  } else {
    await fs.writeFile(path.join(gitDir, "REVERT_HEAD"), "c".repeat(40));
    await fs.writeFile(path.join(sequencer, "todo"), "revert ccccccc Subject\n");
  }
}
