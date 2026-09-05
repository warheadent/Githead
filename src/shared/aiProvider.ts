import type { AiApiKeyProvider, AiCliProvider, AiCommitMessageProvider, AiSettings } from "./types";
import { AI_API_KEY_PROVIDERS, AI_CLI_PROVIDERS } from "./types";

export function isApiKeyProvider(provider: AiCommitMessageProvider): provider is AiApiKeyProvider {
  return AI_API_KEY_PROVIDERS.includes(provider as AiApiKeyProvider);
}

export function isCliProvider(provider: AiCommitMessageProvider): provider is AiCliProvider {
  return AI_CLI_PROVIDERS.includes(provider as AiCliProvider);
}

export function getAiProviderLabel(provider: AiCommitMessageProvider): string {
  switch (provider) {
    case "openrouter": return "OpenRouter";
    case "openai": return "OpenAI";
    case "codex-cli": return "Codex CLI";
    case "anthropic": return "Anthropic";
    case "claude-code": return "Claude Code";
  }
}

export function getCliStatusMessage(aiSettings: AiSettings | null, provider: AiCliProvider): string {
  return aiSettings?.cliStatus[provider]?.message ?? `${getAiProviderLabel(provider)} status is unavailable.`;
}
