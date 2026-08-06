import { describe, expect, it } from "vite-plus/test";
import type { AiSettings, GitFileDiff } from "../shared/types";
import type { AiSettingsService } from "./aiSettingsService";
import { CommitPlanService } from "./commitPlanService";

const settings: AiSettings = {
  selectedProvider: "openrouter",
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
  it("uses the separate commit plan model and reasoning effort", async () => {
    const calls: RequestInit[] = [];
    const fetchImpl = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push(init ?? {});
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"groups":[{"message":"feat: plan changes","paths":["src/a.ts"]}]}' } }]
      }), { status: 200 });
    };
    const diff: GitFileDiff = { path: "src/a.ts", side: "unstaged", kind: "text", text: "+change" };
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

    const body = JSON.parse(String(calls[0]?.body)) as { model: string; reasoning: { effort: string } };
    expect(body.model).toBe("openrouter/plan");
    expect(body.reasoning).toEqual({ effort: "high" });
  });
});
