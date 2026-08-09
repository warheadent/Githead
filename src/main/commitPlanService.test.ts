import { describe, expect, it } from "vite-plus/test";
import type { AiSettings, GitFileDiff } from "../shared/types";
import type { AiSettingsService } from "./aiSettingsService";
import { CommitPlanService } from "./commitPlanService";

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
    const settingsService = {
      getSettings: async () => ({ ...settings, commitPlanGranularity: "hunk" as const }),
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
});
