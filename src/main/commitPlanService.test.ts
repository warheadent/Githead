import { describe, expect, it } from "vite-plus/test";
import type { AiSettings, GitFileDiff } from "../shared/types";
import type { AiSettingsService } from "./aiSettingsService";
import { createCommitPlanChanges, toPublicCommitPlanChange } from "./commitPlanChanges";
import { CommitPlanService, createDiffContext } from "./commitPlanService";

const settings: AiSettings = {
  selectedProvider: "openrouter",
  commitPlanGranularity: "file",
  providers: {
    openrouter: { model: "openrouter/commit", commitPlanModel: "openrouter/plan", commitPlanReasoningEffort: "high", prDescriptionModel: "", reasoningEffort: "low", prDescriptionReasoningEffort: "low", hasApiKey: true },
    openai: { model: "gpt", commitPlanReasoningEffort: "low", prDescriptionModel: "", reasoningEffort: "low", prDescriptionReasoningEffort: "low", hasApiKey: false },
    "codex-cli": { model: "gpt", commitPlanReasoningEffort: "low", prDescriptionModel: "", reasoningEffort: "low", prDescriptionReasoningEffort: "low", hasApiKey: false },
    anthropic: { model: "claude", commitPlanReasoningEffort: "low", prDescriptionModel: "", reasoningEffort: "low", prDescriptionReasoningEffort: "low", hasApiKey: false },
    "claude-code": { model: "claude", commitPlanReasoningEffort: "low", prDescriptionModel: "", reasoningEffort: "low", prDescriptionReasoningEffort: "low", hasApiKey: false }
  },
  cliStatus: {
    "codex-cli": { detected: false, authenticated: false, message: "Unavailable." },
    "claude-code": { detected: false, authenticated: false, message: "Unavailable." }
  },
  commitMessagePrompt: "Write a commit message.",
  prDescriptionPrompt: "Write a pull request description.",
  sourceControlWritingStyle: { mode: "conventional_commits", customInstructions: "" }
};

describe("CommitPlanService", () => {
  it("validates an unchanged hunk snapshot and rejects changed or added hunks", async () => {
    let diff: GitFileDiff = {
      path: "src/a.ts",
      side: "unstaged",
      kind: "text",
      text: "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n"
    };
    const settingsService = {
      getSettings: async () => settings,
      getGenerationSettings: async () => settings,
      getApiKey: async () => "sk-test"
    } as unknown as AiSettingsService;
    const service = new CommitPlanService(
      async () => ({ getFileDiff: async () => diff, getCommitHistory: async () => [] }),
      settingsService
    );
    const generated = await service.validateCommitPlan({
      repoPath: "D:\\Repo",
      paths: ["src/a.ts"],
      granularity: "hunk",
      changes: [{
        id: "change-1",
        path: "src/a.ts",
        kind: "hunk",
        label: "@@ -1 +1 @@",
        fingerprint: ""
      }]
    });
    const currentChanges = createCommitPlanChanges([diff], "hunk").map(toPublicCommitPlanChange);

    expect(generated.valid).toBe(false);
    await expect(service.validateCommitPlan({
      repoPath: "D:\\Repo",
      paths: ["src/a.ts"],
      granularity: "hunk",
      changes: currentChanges
    })).resolves.toMatchObject({ valid: true });

    diff = {
      ...diff,
      text: "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n@@ -10 +10 @@\n-before\n+after\n"
    };
    await expect(service.validateCommitPlan({
      repoPath: "D:\\Repo",
      paths: ["src/a.ts"],
      granularity: "hunk",
      changes: currentChanges
    })).resolves.toMatchObject({ valid: false });
  });

  it("creates hunk planning units when the hunk setting is active", async () => {
    const fetchImpl = async (): Promise<Response> => new Response(JSON.stringify({
      choices: [{ message: { content: '{"groups":[{"message":"feat: first hunk","changeIds":["change-1"]},{"message":"fix: second hunk","changeIds":["change-2"]}]}' } }]
    }), { status: 200 });
    const diff: GitFileDiff = {
      path: "src/a.ts",
      side: "unstaged",
      kind: "text",
      text: [
        "diff --git a/src/a.ts b/src/a.ts",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1,2 +1,2 @@ first",
        "-old one",
        "+new one",
        " context",
        "@@ -20,2 +20,2 @@ second",
        "-old two",
        "+new two",
        " context",
        ""
      ].join("\n")
    };
    let generationSettingsCalls = 0;
    const settingsService = {
      getSettings: async () => ({ ...settings, commitPlanGranularity: "hunk" as const }),
      getGenerationSettings: async () => {
        generationSettingsCalls += 1;
        return { ...settings, commitPlanGranularity: "hunk" as const };
      },
      getApiKey: async () => "sk-test"
    } as unknown as AiSettingsService;
    const service = new CommitPlanService(
      async () => ({ getFileDiff: async () => diff, getCommitHistory: async () => [] }),
      settingsService,
      fetchImpl as typeof fetch
    );

    const result = await service.generateCommitPlan({ repoPath: "D:\\Repo", paths: ["src/a.ts"] });

    expect(result.plan).toMatchObject({
      granularity: "hunk",
      changes: [{ kind: "hunk", path: "src/a.ts" }, { kind: "hunk", path: "src/a.ts" }],
      groups: [{ changeIds: ["change-1"] }, { changeIds: ["change-2"] }]
    });
    expect(generationSettingsCalls).toBe(1);
  });

  it("uses the separate commit plan model and reasoning effort", async () => {
    const calls: RequestInit[] = [];
    const fetchImpl = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push(init ?? {});
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"groups":[{"message":"feat: plan changes","changeIds":["change-1"]}]}' } }]
      }), { status: 200 });
    };
    const diff: GitFileDiff = { path: "src/a.ts", side: "unstaged", kind: "text", text: "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+change\n" };
    const source = {
      getFileDiff: async () => diff,
      getCommitHistory: async () => []
    };
    const settingsService = {
      getSettings: async () => settings,
      getGenerationSettings: async () => settings,
      getApiKey: async () => "sk-test"
    } as unknown as AiSettingsService;
    const service = new CommitPlanService(
      async () => source,
      settingsService,
      fetchImpl as typeof fetch,
      undefined,
      { getCapabilities: async () => ({ status: "supported", supportedEfforts: ["low", "high"] }) }
    );

    await expect(service.generateCommitPlan({ repoPath: "D:\\Repo", paths: ["src/a.ts"] }))
      .resolves.toMatchObject({ exitCode: 0 });

    const body = JSON.parse(String(calls[0]?.body)) as {
      model: string;
      reasoning: { effort: string };
      max_tokens: number;
    };
    expect(body.model).toBe("openrouter/plan");
    expect(body.reasoning).toEqual({ effort: "high" });
    expect(body.max_tokens).toBe(16_384);
  });

  it("uses a bulk working-tree snapshot when the source provides one", async () => {
    let bulkReads = 0;
    let individualReads = 0;
    const diffs: GitFileDiff[] = ["src/a.ts", "src/b.ts"].map((path) => ({
      path,
      side: "unstaged",
      kind: "text",
      text: `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-old\n+new\n`
    }));
    const source = {
      getCommitPlanDiffs: async () => {
        bulkReads += 1;
        return diffs;
      },
      getFileDiff: async () => {
        individualReads += 1;
        throw new Error("Individual diff reads should not run.");
      },
      getCommitHistory: async () => []
    };
    const settingsService = {
      getSettings: async () => settings,
      getGenerationSettings: async () => settings,
      getApiKey: async () => "sk-test"
    } as unknown as AiSettingsService;
    const fetchImpl = async (): Promise<Response> => new Response(JSON.stringify({
      choices: [{ message: { content: '{"groups":[{"message":"feat: plan changes","changeIds":["change-1","change-2"]}]}' } }]
    }), { status: 200 });
    const service = new CommitPlanService(
      async () => source,
      settingsService,
      fetchImpl as typeof fetch
    );

    await expect(service.generateCommitPlan({
      repoPath: "D:\\Repo",
      paths: ["src/a.ts", "src/b.ts"]
    })).resolves.toMatchObject({ exitCode: 0 });

    expect(bulkReads).toBe(1);
    expect(individualReads).toBe(0);
  });

  it("uses a bulk working-tree snapshot when validating a plan", async () => {
    let bulkReads = 0;
    let individualReads = 0;
    const diffs: GitFileDiff[] = ["src/a.ts", "src/b.ts"].map((path) => ({
      path,
      side: "unstaged",
      kind: "text",
      text: `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-old\n+new\n`
    }));
    const source = {
      getCommitPlanDiffs: async () => {
        bulkReads += 1;
        return diffs;
      },
      getFileDiff: async () => {
        individualReads += 1;
        throw new Error("Individual diff reads should not run.");
      },
      getCommitHistory: async () => []
    };
    const settingsService = {
      getSettings: async () => settings,
      getGenerationSettings: async () => settings,
      getApiKey: async () => "sk-test"
    } as unknown as AiSettingsService;
    const service = new CommitPlanService(async () => source, settingsService);

    await expect(service.validateCommitPlan({
      repoPath: "D:\\Repo",
      paths: ["src/a.ts", "src/b.ts"],
      granularity: "file",
      changes: createCommitPlanChanges(diffs, "file").map(toPublicCommitPlanChange)
    })).resolves.toMatchObject({ valid: true });

    expect(bulkReads).toBe(1);
    expect(individualReads).toBe(0);
  });
});


describe("commit plan context budget", () => {
  it("gives large changes a share and fully includes small changes regardless of order", () => {
    const prepared = createCommitPlanChanges([
      { path: "large-a.ts", side: "unstaged", kind: "text", text: "A".repeat(100_000) },
      { path: "small.ts", side: "unstaged", kind: "text", text: "+small change" },
      { path: "large-b.ts", side: "unstaged", kind: "text", text: "B".repeat(100_000) }
    ], "file");
    const context = createDiffContext(prepared);
    expect(context.text.length).toBeLessThanOrEqual(80_000);
    expect(context.text).toContain("+small change");
    expect(context.text.match(/A/g)?.length).toBeGreaterThan(30_000);
    expect(context.text.match(/B/g)?.length).toBeGreaterThan(30_000);
    expect([...context.incompleteChangeIds]).toEqual(["change-1", "change-3"]);
  });

  it("reports already truncated and binary input as incomplete", () => {
    const prepared = createCommitPlanChanges([
      { path: "large.ts", side: "unstaged", kind: "text", text: "+prefix", truncated: true },
      { path: "asset.bin", side: "unstaged", kind: "binary", text: "Binary files differ" }
    ], "file");
    expect([...createDiffContext(prepared).incompleteChangeIds]).toEqual(["change-1", "change-2"]);
  });
});
