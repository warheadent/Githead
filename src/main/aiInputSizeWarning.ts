import { getAiProviderLabel } from "../shared/aiProvider";
import type { GetAiReasoningCapabilitiesRequest } from "../shared/types";

export interface AiInputLimitResolver {
  getInputTokenLimit?(request: GetAiReasoningCapabilitiesRequest, signal?: AbortSignal): Promise<number | null>;
}

// This is an advisory estimate for source code, not a tokenizer or a hard cap.
// Unknown models use a conservative warning threshold rather than an invented limit.
const UNKNOWN_MODEL_WARNING_TOKENS = 32_000;

export async function createAiInputSizeWarning(
  request: GetAiReasoningCapabilitiesRequest,
  prompt: string,
  resolver?: AiInputLimitResolver,
  signal?: AbortSignal
): Promise<string> {
  signal?.throwIfAborted();
  const estimatedTokens = Math.ceil(Buffer.byteLength(prompt, "utf8") / 3);
  let limit: number | null = null;
  try {
    limit = await resolver?.getInputTokenLimit?.(request, signal) ?? null;
  } catch {
    signal?.throwIfAborted();
  }
  signal?.throwIfAborted();
  if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) limit = null;
  const threshold = limit === null ? UNKNOWN_MODEL_WARNING_TOKENS : limit * 0.75;
  if (estimatedTokens < threshold) return "";
  const model = `${getAiProviderLabel(request.provider)} / ${request.model}`;
  const size = estimatedTokens.toLocaleString("en-US");
  const capacity = limit === null
    ? "Its input limit is unknown."
    : `Its advertised input limit is ${limit.toLocaleString("en-US")} tokens.`;
  return `Large diff for ${model}: the full prompt is roughly ${size} tokens. ${capacity} The token count is an estimate. Generation may be slower, cost more, or exceed the model's limit. Githead is sending the full diff. Consider selecting fewer changes.`;
}
