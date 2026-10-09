import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { cloneRepositoryWithSource } from "./repositoryClone";

describe("clone orchestration", () => {
  let parentPath: string;
  beforeEach(async () => { parentPath = await fs.mkdtemp(path.join(os.tmpdir(), "githead-clone-test-")); });
  afterEach(async () => { await fs.rm(parentPath, { recursive: true, force: true }); });
  function setup() {
    const result = { repoPath: path.join(parentPath, "repo"), exitCode: 0, stdout: "cloned", stderr: "" };
    return {
      git: { cloneRepository: vi.fn().mockResolvedValue(result), addRemote: vi.fn().mockResolvedValue(result) },
      lore: { cloneRepository: vi.fn().mockResolvedValue(result) },
      github: { fork: vi.fn().mockResolvedValue({ owner: "me", name: "repo", fullName: "me/repo", webUrl: "https://github.com/me/repo" }) },
      rememberParent: vi.fn().mockResolvedValue(undefined)
    };
  }
  it("clones the fork, adds upstream and remembers the destination", async () => {
    const services = setup();
    const request = { source: "https://github.com/org/repo.git", parentPath, directoryName: "repo", fork: true };
    expect((await cloneRepositoryWithSource(request, new AbortController().signal, services)).exitCode).toBe(0);
    expect(services.git.cloneRepository).toHaveBeenCalledWith({ ...request, source: "https://github.com/me/repo.git" });
    expect(services.git.addRemote).toHaveBeenCalledWith({ repoPath: path.join(parentPath, "repo"), name: "upstream", url: request.source });
    expect(services.rememberParent).toHaveBeenCalledWith(parentPath);
  });
  it("checks destination before creating a remote fork", async () => {
    const services = setup();
    await fs.mkdir(path.join(parentPath, "repo"));
    await fs.writeFile(path.join(parentPath, "repo", "keep"), "user data");
    expect((await cloneRepositoryWithSource({ source: "https://github.com/org/repo.git", parentPath, directoryName: "repo", fork: true }, new AbortController().signal, services)).exitCode).toBe(-1);
    expect(services.github.fork).not.toHaveBeenCalled();
  });
  it("reports partial success when upstream fails, preserving the clone", async () => {
    const services = setup();
    services.git.addRemote.mockResolvedValue({ repoPath: path.join(parentPath, "repo"), exitCode: 1, stdout: "", stderr: "permission denied" });
    const result = await cloneRepositoryWithSource({ source: "https://github.com/org/repo.git", parentPath, directoryName: "repo", fork: true }, new AbortController().signal, services);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Clone saved at");
    expect(result.stderr).toContain("adding upstream failed: permission denied");
  });
  it("routes Lore through its existing service and rejects a Lore fork", async () => {
    const services = setup();
    const request = { source: "lore://studio/game", parentPath, directoryName: "repo" };
    expect((await cloneRepositoryWithSource(request, new AbortController().signal, services)).exitCode).toBe(0);
    expect(services.lore.cloneRepository).toHaveBeenCalledWith(request);
    expect(services.git.cloneRepository).not.toHaveBeenCalled();
    expect((await cloneRepositoryWithSource({ ...request, fork: true }, new AbortController().signal, services)).stderr).toContain("cannot be forked");
  });
});
