import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { inspectCloneDestination, validateCloneRequest } from "./cloneValidation";

describe("clone destinations", () => {
  let parentPath: string;
  beforeEach(async () => { parentPath = await fs.mkdtemp(path.join(os.tmpdir(), "githead-clone-destination-")); });
  afterEach(async () => { await fs.rm(parentPath, { recursive: true, force: true }); });

  it("warns for existing empty folders and suggests the first available suffix", async () => {
    await fs.mkdir(path.join(parentPath, "repo"));
    await fs.writeFile(path.join(parentPath, "repo-2"), "occupied");
    expect(await inspectCloneDestination({ parentPath, directoryName: "repo" })).toEqual({
      path: path.join(parentPath, "repo"), exists: true, suggestedName: "repo-3", error: null
    });
  });

  it("revalidates the target before clone when it is created after the preview", async () => {
    const request = { source: "https://example.com/repo.git", parentPath, directoryName: "repo" };
    expect((await inspectCloneDestination(request)).exists).toBe(false);
    await fs.mkdir(path.join(parentPath, "repo"));
    await fs.writeFile(path.join(parentPath, "repo", "keep"), "user data");
    expect(await validateCloneRequest(request)).toEqual({ error: "Destination folder already exists and is not empty." });
  });

  it.each(["../outside", "..", "nested/repo", "nested\\repo", "C:\\repo"])("rejects invalid destination %s", async (directoryName) => {
    expect((await inspectCloneDestination({ parentPath, directoryName })).error).toBeTruthy();
  });

  it.each(["repo:stream", "NUL", "repo."])("applies Windows folder-name restrictions only on Windows: %s", async (directoryName) => {
    expect(Boolean((await inspectCloneDestination({ parentPath, directoryName })).error)).toBe(process.platform === "win32");
  });
});
