import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { CancellableProcessRunner } from "./cancellableProcessRunner";
import { GitService } from "./gitService";
import { NodeProcessRunner, type BinaryProcessResult, type ProcessResult, type ProcessRunOptions, type ProcessRunner } from "./processRunner";

class CountingRunner implements ProcessRunner {
  readonly calls: string[][] = [];
  private readonly delegate = new NodeProcessRunner();

  run(command: string, args: string[], options?: ProcessRunOptions): Promise<ProcessResult> {
    this.calls.push(args.slice(2));
    return this.delegate.run(command, args, options);
  }

  runBinary(command: string, args: string[], options: ProcessRunOptions & { maxBytes: number }): Promise<BinaryProcessResult> {
    this.calls.push(args.slice(2));
    return this.delegate.runBinary(command, args, options);
  }

  take(): string[] {
    return this.calls.splice(0).map((args) => args.slice(0, 2).join(" "));
  }
}

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })));
});

async function createRepo(): Promise<{ repo: string; git: (...args: string[]) => Promise<string> }> {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "githead-immutable-"));
  directories.push(repo);
  const runner = new NodeProcessRunner();
  const git = async (...args: string[]): Promise<string> => {
    const result = await runner.run("git", ["-C", repo, ...args]);
    expect(result.exitCode, result.stderr).toBe(0);
    return result.stdout.trim();
  };
  await git("init", "-q");
  await git("config", "user.name", "Original Author");
  await git("config", "user.email", "author@example.test");
  await git("config", "core.autocrlf", "false");
  return { repo, git };
}

const lines = (count: number, label: string) => Array.from({ length: count }, (_, index) => `${label} ${index}\n`).join("");

describe("immutable commit reads with real Git", () => {
  it("loads a commit's details and first diff in parallel and serves a revisit without spawning Git", async () => {
    const { repo, git } = await createRepo();
    await fs.writeFile(path.join(repo, "a.txt"), lines(30, "a"));
    await fs.writeFile(path.join(repo, "c.txt"), "c\n");
    await git("add", ".");
    await git("commit", "-qm", "root");
    const root = await git("rev-parse", "HEAD");
    await fs.appendFile(path.join(repo, "c.txt"), "more\n");
    await git("add", ".");
    await git("commit", "-qm", "second");
    const second = await git("rev-parse", "HEAD");

    const runner = new CountingRunner();
    const service = new GitService(runner);
    const click = (hash: string, preferredPath = "") => Promise.all([
      service.getCommitDetails({ repoPath: repo, hash }),
      service.getCommitFileDiff({ repoPath: repo, hash, path: preferredPath, fallbackToFirstFile: true })
    ]);

    const [details, diff] = await click(second);
    expect(details.files.map((file) => file.path)).toEqual(["c.txt"]);
    expect(diff).toMatchObject({ path: "c.txt", kind: "text" });
    // One repository check for the session, then details and the diff share
    // one diff-tree; no per-read validation spawns.
    expect(runner.take().sort()).toEqual(["diff-tree --root", "rev-parse --is-inside-work-tree", "show --format=", "show -s"].sort());

    const [, rootDiff] = await click(root, "c.txt");
    expect(rootDiff).toMatchObject({ path: "c.txt", kind: "text" });
    expect(runner.take().sort()).toEqual(["diff-tree --root", "show --format=", "show -s"].sort());

    const [revisited, revisitedDiff] = await click(second, "c.txt");
    expect(revisited).toEqual(details);
    expect(revisitedDiff).toEqual(diff);
    expect(runner.take()).toEqual([]);

    // The preferred path wins when the commit changed it; otherwise the first file.
    await expect(service.getCommitFileDiff({ repoPath: repo, hash: root, path: "a.txt", fallbackToFirstFile: true }))
      .resolves.toMatchObject({ path: "a.txt" });
    await git("commit", "-q", "--allow-empty", "-m", "empty");
    await expect(service.getCommitFileDiff({ repoPath: repo, hash: await git("rev-parse", "HEAD"), path: "a.txt", fallbackToFirstFile: true }))
      .resolves.toMatchObject({ path: "", kind: "empty" });
  });

  it("shows renamed and copied files against their original path", async () => {
    const { repo, git } = await createRepo();
    await fs.writeFile(path.join(repo, "old.txt"), lines(40, "rename"));
    await fs.writeFile(path.join(repo, "src.txt"), lines(40, "copy"));
    await git("add", ".");
    await git("commit", "-qm", "root");
    await git("mv", "old.txt", "new.txt");
    await fs.appendFile(path.join(repo, "new.txt"), "renamed tail\n");
    await fs.copyFile(path.join(repo, "src.txt"), path.join(repo, "copy.txt"));
    await fs.appendFile(path.join(repo, "src.txt"), "source tail\n");
    await git("add", "-A");
    await git("commit", "-qm", "rename and copy");
    const hash = await git("rev-parse", "HEAD");
    const service = new GitService(new NodeProcessRunner());

    const details = await service.getCommitDetails({ repoPath: repo, hash });
    const renamed = details.files.find((file) => file.path === "new.txt");
    const copied = details.files.find((file) => file.path === "copy.txt");
    expect(renamed).toMatchObject({ status: "R", originalPath: "old.txt" });
    expect(copied).toMatchObject({ status: "C", originalPath: "src.txt" });

    const renameDiff = await service.getCommitFileDiff({ repoPath: repo, hash, path: "new.txt", originalPath: "old.txt" });
    expect(renameDiff.text).toContain("rename from old.txt");
    expect(renameDiff.text).toContain("+renamed tail");
    expect(renameDiff.text).not.toContain("new file mode");

    const copyDiff = await service.getCommitFileDiff({ repoPath: repo, hash, path: "copy.txt", originalPath: "src.txt" });
    expect(copyDiff.text).toContain("copy from src.txt");
    expect(copyDiff.text).not.toContain("source tail");
    expect(copyDiff.text.match(/^diff --git /gm)).toHaveLength(1);

    // Without the original path, Git cannot pair the rename.
    const unpaired = await service.getCommitFileDiff({ repoPath: repo, hash, path: "new.txt" });
    expect(unpaired.text).toContain("new file mode");
  });

  it("invalidates cached reads when mailmap or replacement refs change", async () => {
    const { repo, git } = await createRepo();
    await fs.writeFile(path.join(repo, "file.txt"), "one\n");
    await git("add", ".");
    await git("commit", "-qm", "first subject");
    const first = await git("rev-parse", "HEAD");
    await fs.writeFile(path.join(repo, "file.txt"), "two\n");
    await git("commit", "-qam", "second subject");
    const second = await git("rev-parse", "HEAD");
    const runner = new CountingRunner();
    const service = new GitService(runner);

    const blame = await service.getFileBlame({ repoPath: repo, hash: first, path: "file.txt" });
    expect(blame.kind === "text" ? blame.commits[0]?.authorName : null).toBe("Original Author");
    await service.getFileBlame({ repoPath: repo, hash: first, path: "file.txt" });
    expect(runner.take().filter((call) => call.startsWith("blame"))).toHaveLength(1);

    await fs.writeFile(path.join(repo, ".mailmap"), "Mapped Author <author@example.test>\n");
    const mapped = await service.getFileBlame({ repoPath: repo, hash: first, path: "file.txt" });
    expect(mapped.kind === "text" ? mapped.commits[0]?.authorName : null).toBe("Mapped Author");

    await expect(service.getCommitDetails({ repoPath: repo, hash: first })).resolves.toMatchObject({ subject: "first subject" });
    await git("replace", first, second);
    await expect(service.getCommitDetails({ repoPath: repo, hash: first })).resolves.toMatchObject({ subject: "second subject" });
  });

  it("does not cache abbreviated ids or cancelled reads", async () => {
    const { repo, git } = await createRepo();
    await fs.writeFile(path.join(repo, "file.txt"), "content\n");
    await git("add", ".");
    await git("commit", "-qm", "only");
    const hash = await git("rev-parse", "HEAD");
    const counting = new CountingRunner();
    const runner = new CancellableProcessRunner(counting);
    const service = new GitService(runner);

    await service.getCommitDetails({ repoPath: repo, hash: hash.slice(0, 12) });
    counting.take();
    await service.getCommitDetails({ repoPath: repo, hash: hash.slice(0, 12) });
    expect(counting.take()).toHaveLength(2);

    const controller = new AbortController();
    controller.abort();
    const cancelled = await runner.runWithSignal(controller.signal, () =>
      service.getCommitFileDiff({ repoPath: repo, hash, path: "file.txt" }));
    expect(cancelled.kind).toBe("error");
    counting.take();
    await expect(service.getCommitFileDiff({ repoPath: repo, hash, path: "file.txt" })).resolves.toMatchObject({ kind: "text" });
    expect(counting.take()).toEqual(["show --format="]);
  });

  it("reports the repository error when a validated folder disappears", async () => {
    const { repo, git } = await createRepo();
    await fs.writeFile(path.join(repo, "file.txt"), "content\n");
    await git("add", ".");
    await git("commit", "-qm", "only");
    const hash = await git("rev-parse", "HEAD");
    const service = new GitService(new NodeProcessRunner());
    await service.getCommitDetails({ repoPath: repo, hash });

    await fs.rm(repo, { recursive: true, force: true });
    await expect(service.getCommitDetails({ repoPath: repo, hash }))
      .rejects.toThrow("Repository folder does not exist or is no longer available.");
    await expect(service.getCommitFileDiff({ repoPath: repo, hash, path: "file.txt" }))
      .resolves.toMatchObject({ kind: "error", text: "Repository folder does not exist or is no longer available." });
  });
});
