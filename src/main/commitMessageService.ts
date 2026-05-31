import type { GitOperationResult, GenerateCommitMessageRequest } from "../shared/types";
import type { AiSettingsService } from "./aiSettingsService";
import type { GitService } from "./gitService";

const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_PREFERRED_SERVICE_TIER = "flex";
const MAX_DIFF_CHARS = 60_000;

type Fetch = typeof fetch;

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

export class CommitMessageService {
  constructor(
    private readonly gitService: GitService,
    private readonly settingsService: AiSettingsService,
    private readonly fetchImpl: Fetch = fetch
  ) {}

  async generateCommitMessage(request: GenerateCommitMessageRequest): Promise<GitOperationResult> {
    try {
      const [
        settings,
        apiKey
      ] = await Promise.all([
        this.settingsService.getSettings(),
        this.settingsService.getApiKey()
      ]);

      if (!apiKey) {
        return createFailure(request.repoPath, "OpenRouter API key is not configured.");
      }

      if (!settings.model.trim()) {
        return createFailure(request.repoPath, "OpenRouter model is not configured.");
      }

      const diffResult = await this.gitService.getStagedDiff(request.repoPath);
      if (diffResult.exitCode !== 0) {
        return diffResult;
      }

      const diff = diffResult.stdout.trim();
      if (!diff) {
        return createFailure(request.repoPath, "Stage changes before generating a commit message.");
      }

      const response = await this.fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: createHeaders(apiKey, settings.siteUrl, settings.siteTitle),
        body: JSON.stringify({
          model: settings.model,
          service_tier: OPENROUTER_PREFERRED_SERVICE_TIER,
          messages: [
            {
              role: "system",
              content: [
                "You write concise Git commit messages for git commit --file=-.",
                "Use Conventional Commits style, such as type(scope): subject.",
                "Return exactly the commit message text that should be saved.",
                "Do not include commentary, labels, markdown fences, or alternatives.",
                "Use a subject line under 72 characters.",
                "Add a plain-text body only when it explains important context."
              ].join(" ")
            },
            {
              role: "user",
              content: createPrompt(diff)
            }
          ],
          temperature: 0.2,
          max_tokens: 220
        })
      });

      const payload = await parseOpenRouterResponse(response);
      if (!response.ok) {
        return createFailure(
          request.repoPath,
          payload.error?.message || `OpenRouter request failed with status ${response.status}.`
        );
      }

      const message = normalizeGeneratedMessage(payload.choices?.[0]?.message?.content ?? "");
      if (!message) {
        return createFailure(request.repoPath, "OpenRouter returned an empty commit message.");
      }

      return {
        repoPath: request.repoPath,
        exitCode: 0,
        stdout: message,
        stderr: ""
      };
    } catch (error) {
      return createFailure(
        request.repoPath,
        error instanceof Error ? error.message : "Unable to generate commit message."
      );
    }
  }
}

function createHeaders(apiKey: string, siteUrl: string, siteTitle: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...(siteUrl ? { "HTTP-Referer": siteUrl } : {}),
    ...(siteTitle ? { "X-Title": siteTitle } : {})
  };
}

function createPrompt(diff: string): string {
  const truncated = diff.length > MAX_DIFF_CHARS;
  const promptDiff = truncated ? diff.slice(0, MAX_DIFF_CHARS) : diff;

  return [
    "Write a Git commit message for this staged diff.",
    "Use Conventional Commits style, such as type(scope): subject.",
    "Output only the commit message, with no explanation before or after it.",
    truncated ? "The diff was truncated; summarize only the visible staged changes." : "",
    "",
    "Staged diff:",
    promptDiff
  ].filter((line) => line.length > 0).join("\n");
}

async function parseOpenRouterResponse(response: Response): Promise<OpenRouterResponse> {
  try {
    return await response.json() as OpenRouterResponse;
  } catch {
    return {};
  }
}

function normalizeGeneratedMessage(message: string): string {
  return message
    .trim()
    .replace(/^```(?:gitcommit|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function createFailure(repoPath: string, stderr: string): GitOperationResult {
  return {
    repoPath,
    exitCode: -1,
    stdout: "",
    stderr
  };
}
