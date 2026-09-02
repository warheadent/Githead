import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { readActionsConfig, saveActionsConfigFile } from "./actionsConfig";

const tempDirs: string[] = [];

afterEach(async () => {
  const dirs = tempDirs.splice(0);
  await Promise.all(dirs.map((dir) => fs.rm(dir, {
    recursive: true,
    force: true
  })));
});

describe("actionsConfig", () => {
  it("reads shared and local actions with local overrides in the effective list", async () => {
    const repoRoot = await createTempRepoRoot();
    const githeadDir = path.join(repoRoot, ".githead");
    await fs.mkdir(githeadDir);
    await fs.writeFile(path.join(githeadDir, "actions.toml"), [
      "[[actions]]",
      "name = \"Build\"",
      "description = \"Compile the application\"",
      "command = \"npm run build\"",
      "shell = \"powershell\"",
      "",
      "[[actions]]",
      "name = \"Test\"",
      "command = \"npm test\"",
      "shell = \"bash\"",
      ""
    ].join("\n"), "utf8");
    await fs.writeFile(path.join(githeadDir, "actions.local.toml"), [
      "[[actions]]",
      "name = \"test\"",
      "command = \"npm run test:local\"",
      "shell = \"cmd\"",
      "",
      "[[actions]]",
      "name = \"Lint\"",
      "command = \"npm run lint\"",
      "shell = \"powershell\"",
      ""
    ].join("\n"), "utf8");

    const config = await readActionsConfig(repoRoot);

    expect(config.error).toBe("");
    expect(config.shared.actions.map((action) => action.name)).toEqual([
      "Build",
      "Test"
    ]);
    expect(config.local.actions.map((action) => action.name)).toEqual([
      "test",
      "Lint"
    ]);
    expect(config.actions).toEqual([
      {
        name: "Build",
        description: "Compile the application",
        command: "npm run build",
        shell: "powershell"
      },
      {
        name: "test",
        description: "",
        command: "npm run test:local",
        shell: "cmd"
      },
      {
        name: "Lint",
        description: "",
        command: "npm run lint",
        shell: "powershell"
      }
    ]);
  });

  it("saves shared and local action files and creates .githead on first save", async () => {
    const repoRoot = await createTempRepoRoot();

    const sharedResult = await saveActionsConfigFile(repoRoot, {
      repoPath: repoRoot,
      target: "shared",
      actions: [
        {
          name: "Build",
          description: "Compile the application",
          command: "npm run build",
          shell: "powershell"
        }
      ]
    });
    const localResult = await saveActionsConfigFile(repoRoot, {
      repoPath: repoRoot,
      target: "local",
      actions: [
        {
          name: "Build",
          description: "",
          command: "npm run build:local",
          shell: "cmd"
        }
      ]
    });

    expect(sharedResult.exitCode).toBe(0);
    expect(localResult.exitCode).toBe(0);
    await expect(fs.stat(path.join(repoRoot, ".githead"))).resolves.toMatchObject({
      isDirectory: expect.any(Function)
    });
    expect(await fs.readFile(path.join(repoRoot, ".githead", "actions.toml"), "utf8")).toBe([
      "[[actions]]",
      "name = \"Build\"",
      "description = \"Compile the application\"",
      "command = \"npm run build\"",
      "shell = \"powershell\"",
      ""
    ].join("\n"));
    expect((await readActionsConfig(repoRoot)).actions).toEqual([
      {
        name: "Build",
        description: "",
        command: "npm run build:local",
        shell: "cmd"
      }
    ]);
  });

  it("blocks duplicate action names within one file", async () => {
    const repoRoot = await createTempRepoRoot();

    const result = await saveActionsConfigFile(repoRoot, {
      repoPath: repoRoot,
      target: "shared",
      actions: [
        {
          name: "Build",
          description: "",
          command: "npm run build",
          shell: "powershell"
        },
        {
          name: "build",
          description: "",
          command: "npm run build:again",
          shell: "powershell"
        }
      ]
    });

    expect(result).toMatchObject({
      exitCode: -1,
      stderr: "Duplicate action name \"build\" in actions.toml."
    });
  });

  it("rejects non-string action descriptions", async () => {
    const repoRoot = await createTempRepoRoot();
    const githeadDir = path.join(repoRoot, ".githead");
    await fs.mkdir(githeadDir);
    await fs.writeFile(path.join(githeadDir, "actions.toml"), [
      "[[actions]]", "name = \"Build\"", "description = 42",
      "command = \"npm run build\"", "shell = \"powershell\"", ""
    ].join("\n"), "utf8");
    await expect(readActionsConfig(repoRoot)).resolves.toMatchObject({
      error: 'actions.toml: Action "Build" has an invalid description.'
    });
  });

  it("reads and saves actions bound to Pull", async () => {
    const repoRoot = await createTempRepoRoot();
    const githeadDir = path.join(repoRoot, ".githead");
    await fs.mkdir(githeadDir);
    await fs.writeFile(path.join(githeadDir, "actions.toml"), [
      "[[actions]]", "name = \"Install\"", "command = \"npm install\"",
      "shell = \"bash\"", "bind_to_pull = true", ""
    ].join("\n"), "utf8");

    const config = await readActionsConfig(repoRoot);
    expect(config.actions).toEqual([{
      name: "Install",
      description: "",
      command: "npm install",
      shell: "bash",
      bindToPull: true
    }]);

    const result = await saveActionsConfigFile(repoRoot, {
      repoPath: repoRoot,
      target: "shared",
      actions: config.shared.actions
    });
    expect(result.exitCode).toBe(0);
    expect(await fs.readFile(path.join(githeadDir, "actions.toml"), "utf8")).toContain("bind_to_pull = true");
  });

  it("rejects non-boolean bind_to_pull values", async () => {
    const repoRoot = await createTempRepoRoot();
    const githeadDir = path.join(repoRoot, ".githead");
    await fs.mkdir(githeadDir);
    await fs.writeFile(path.join(githeadDir, "actions.toml"), [
      "[[actions]]", "name = \"Install\"", "command = \"npm install\"",
      "shell = \"bash\"", "bind_to_pull = \"yes\"", ""
    ].join("\n"), "utf8");

    await expect(readActionsConfig(repoRoot)).resolves.toMatchObject({
      error: 'actions.toml: Action "Install" has an invalid bind_to_pull value.'
    });
  });

  it("blocks structured saves for commented or unknown-field files", async () => {
    const repoRoot = await createTempRepoRoot();
    const githeadDir = path.join(repoRoot, ".githead");
    await fs.mkdir(githeadDir);
    await fs.writeFile(path.join(githeadDir, "actions.toml"), [
      "# keep this",
      "[[actions]]",
      "name = \"Build\"",
      "command = \"npm run build\"",
      "shell = \"powershell\"",
      ""
    ].join("\n"), "utf8");
    await fs.writeFile(path.join(githeadDir, "actions.local.toml"), [
      "[[actions]]",
      "name = \"Deploy\"",
      "command = \"npm run deploy\"",
      "shell = \"powershell\"",
      "timeout = 30",
      ""
    ].join("\n"), "utf8");

    const commentedResult = await saveActionsConfigFile(repoRoot, {
      repoPath: repoRoot,
      target: "shared",
      actions: []
    });
    const unknownResult = await saveActionsConfigFile(repoRoot, {
      repoPath: repoRoot,
      target: "local",
      actions: []
    });

    expect(commentedResult).toMatchObject({
      exitCode: -1,
      stderr: "actions.toml cannot be edited in Githead because it contains comments or fields Githead does not manage."
    });
    expect(unknownResult).toMatchObject({
      exitCode: -1,
      stderr: "actions.local.toml cannot be edited in Githead because it contains comments or fields Githead does not manage."
    });
  });
});

async function createTempRepoRoot(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "githead-actions-config-"));
  tempDirs.push(dir);
  return dir;
}
