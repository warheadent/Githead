import type { GitOperationResult, GenerateCommitMessageRequest } from "../shared/types";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "../shared/commitMessagePrompt";
import type { AiSettingsService } from "./aiSettingsService";
import type { VcsService } from "./vcsService";

/** Whichever VCS backend owns the repo supplies the staged diff for the model. */
type StagedDiffProvider = Pick<VcsService, "getStagedDiff">;

const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_PREFERRED_SERVICE_TIER = "flex";
const OPENROUTER_SITE_URL = "https://github.com/warheadent/Githead#readme";
const OPENROUTER_SITE_TITLE = "Githead";
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
    private readonly resolveService: (repoPath: string) => StagedDiffProvider | Promise<StagedDiffProvider>,
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

      const service = await this.resolveService(request.repoPath);
      const diffResult = await service.getStagedDiff(request.repoPath);
      if (diffResult.exitCode !== 0) {
        return diffResult;
      }

      const diff = diffResult.stdout.trim();
      if (!diff) {
        return createFailure(request.repoPath, "Stage changes before generating a commit message.");
      }

      const response = await this.fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: createHeaders(apiKey),
        body: JSON.stringify({
          model: settings.model,
          service_tier: OPENROUTER_PREFERRED_SERVICE_TIER,
          messages: [
            {
              role: "system",
              content: [
                "You write concise Git commit messages for git commit --file=-.",
                "Follow Conventional Commits format: type(scope): subject.",
                "Use only these lowercase types: feat, fix, refactor, perf, docs, test, build, ci, chore, revert.",
                "Set scope to the primary module only when one clearly dominates; otherwise omit scope and parentheses.",
                "Write the subject in imperative mood, aim for under 50 characters, and use no trailing period.",
                "Include a body only when it clarifies important behavior or explains why the change was made.",
                "Separate the subject and body with exactly one blank line.",
                "Use '-' bullets for body details, and keep each bullet on one line.",
                "For breaking changes, append '!' after the type/scope and add a BREAKING CHANGE: footer.",
                "Return exactly the commit message text that should be saved.",
                "Do not include commentary, labels, markdown fences, or alternatives.",
                "Do not insert manual line breaks within the subject or within any bullet."
              ].join(" ")
            },
            {
              role: "user",
              content: createPrompt(settings.commitMessagePrompt, diff)
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

function createHeaders(apiKey: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": OPENROUTER_SITE_URL,
    "X-Title": OPENROUTER_SITE_TITLE
  };
}

function createPrompt(commitMessagePrompt: string, diff: string): string {
  const truncated = diff.length > MAX_DIFF_CHARS;
  const promptDiff = truncated ? diff.slice(0, MAX_DIFF_CHARS) : diff;
  const instructions = commitMessagePrompt.trim() || DEFAULT_COMMIT_MESSAGE_PROMPT;

  return [
    instructions,
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
