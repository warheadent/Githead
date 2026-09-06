import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GitService } from "./gitService";
import { NodeProcessRunner } from "./processRunner";

describe("tag checkout", { timeout: 15_000 }, () => {
  const runner = new NodeProcessRunner();
  const service = new GitService(runner);
  let root: string;
  let repo: string;
  const git = async (...args: string[]): Promise<string> => {
    const result = await runner.run("git", ["-C", repo, ...args]);
    if (result.exitCode !== 0) throw new Error(result.stderr);
    return result.stdout.trim();
  };
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "githead-tag-checkout-"));
    repo = path.join(root, "repo");
    await fs.mkdir(repo);
    await git("init", "-b", "main");
    await git("config", "core.autocrlf", "false");
    await git("config", "user.name", "Tag test");
    await git("config", "user.email", "tag@example.test");
    await fs.writeFile(path.join(repo, "file.txt"), "release\n");
    await git("add", ".");
    await git("commit", "-m", "First release");
    await git("tag", "v1");
    await git("tag", "-a", "v2", "-m", "Release two");
    await git("tag", "v10");
    await fs.writeFile(path.join(repo, "file.txt"), "later\n");
    await git("commit", "-am", "Later work");
  });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });
  const select = async (name: string) => {
    const tag = (await service.getCheckoutTags({ repoPath: repo })).find((item) => item.name === name)!;
    return { repoPath: repo, tagName: tag.name, expectedObjectId: tag.objectId };
  };
  it("lists lightweight and annotated tags in version order with commit details", async () => {
    const tags = await service.getCheckoutTags({ repoPath: repo });
    expect(tags.map((tag) => tag.name)).toEqual(["v10", "v2", "v1"]);
    expect(tags[1]).toMatchObject({ description: "Release two", commitId: await git("rev-parse", "v2^{commit}") });
  });
  it("checks out the release detached and reports a tag after rereading identity", async () => {
    const result = await service.checkoutTag(await select("v2"));
    expect(result.exitCode).toBe(0);
    expect(await git("branch", "--show-current")).toBe("");
    expect(await fs.readFile(path.join(repo, "file.txt"), "utf8")).toBe("release\n");
    const identity = await service.getRepoIdentity({ repoPath: repo, generation: 1 });
    expect(identity.branch).toBeNull();
    expect(identity.currentTag).toBeTruthy();
  });
  it("creates a branch at the selected release without an upstream", async () => {
    expect((await service.checkoutTag({ ...await select("v1"), branchName: "release-fix" })).exitCode).toBe(0);
    expect(await git("branch", "--show-current")).toBe("release-fix");
    expect(await git("rev-parse", "HEAD")).toBe(await git("rev-parse", "v1"));
    expect((await runner.run("git", ["-C", repo, "rev-parse", "--abbrev-ref", "@{upstream}"])).exitCode).not.toBe(0);
  });
  it("preserves conflicting local edits", async () => {
    await fs.writeFile(path.join(repo, "file.txt"), "my edits\n");
    expect((await service.checkoutTag(await select("v1"))).exitCode).not.toBe(0);
    expect(await git("branch", "--show-current")).toBe("main");
    expect(await fs.readFile(path.join(repo, "file.txt"), "utf8")).toBe("my edits\n");
  });
  it("rejects changed tags and existing branch names", async () => {
    const selected = await select("v1");
    await git("tag", "-f", "v1");
    expect((await service.checkoutTag(selected)).stderr).toContain("tag changed");
    expect((await service.checkoutTag({ ...await select("v2"), branchName: "main" })).exitCode).not.toBe(0);
    expect(await git("branch", "--show-current")).toBe("main");
  });
  it("lists remote tags once each and fetches only the selected tag", async () => {
    const remote = path.join(root, "remote.git");
    expect((await runner.run("git", ["clone", "--bare", repo, remote])).exitCode).toBe(0);
    await git("remote", "add", "origin", remote);
    await git("tag", "-d", "v1", "v2", "v10");
    const tags = await service.getCheckoutTags({ repoPath: repo, remoteName: "origin" });
    expect(tags.map((tag) => tag.name)).toEqual(["v10", "v2", "v1"]);
    const selected = tags.find((tag) => tag.name === "v2")!;
    expect((await service.checkoutTag({ repoPath: repo, remoteName: "origin", tagName: selected.name, expectedObjectId: selected.objectId })).exitCode).toBe(0);
    expect(await git("tag", "--list")).toBe("v2");
    expect(await git("rev-parse", "HEAD")).toBe(selected.commitId);
  });
  it("does not overwrite a conflicting local tag when fetching", async () => {
    const remote = path.join(root, "remote.git");
    expect((await runner.run("git", ["clone", "--bare", repo, remote])).exitCode).toBe(0);
    await git("remote", "add", "origin", remote);
    const selected = (await service.getCheckoutTags({ repoPath: repo, remoteName: "origin" })).find((tag) => tag.name === "v1")!;
    await git("tag", "-f", "v1");
    const local = await git("rev-parse", "v1");
    expect((await service.checkoutTag({ repoPath: repo, remoteName: "origin", tagName: "v1", expectedObjectId: selected.objectId })).exitCode).not.toBe(0);
    expect(await git("rev-parse", "v1")).toBe(local);
    expect(await git("branch", "--show-current")).toBe("main");
  });
  it("rejects a remote tag moved after selection", async () => {
    const remote = path.join(root, "remote.git");
    expect((await runner.run("git", ["clone", "--bare", repo, remote])).exitCode).toBe(0);
    await git("remote", "add", "origin", remote);
    const selected = await select("v1");
    await git("tag", "-d", "v1");
    expect((await runner.run("git", ["-C", remote, "tag", "-f", "v1", "main"])).exitCode).toBe(0);
    expect((await service.checkoutTag({ ...selected, remoteName: "origin" })).stderr).toContain("tag changed");
    expect(await git("branch", "--show-current")).toBe("main");
  });
  it("rejects tags pointing to a blob", async () => {
    await git("tag", "blob", await git("rev-parse", "HEAD:file.txt"));
    expect((await service.checkoutTag(await select("blob"))).stderr).toContain("does not point to a commit");
    expect(await git("branch", "--show-current")).toBe("main");
  });
});
