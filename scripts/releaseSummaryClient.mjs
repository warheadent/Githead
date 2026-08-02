export const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
export const FLEX_SERVICE_TIER = "flex";
export const DEFAULT_SERVICE_TIER = "default";
export const MAX_FLEX_RETRIES = 3;
export const MAX_FLEX_RETRY_WAIT_MS = 5 * 60 * 1000;
export const FLEX_RETRY_BACKOFF_MS = [5_000, 15_000, 45_000];

export class OpenRouterReleaseSummaryError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "OpenRouterReleaseSummaryError";
    this.status = status;
  }
}

/**
 * Request a release summary with Flex first, then default-tier fallback when
 * Flex remains temporarily unavailable.
 */
export async function generateReleaseSummary({
  apiKey,
  payload,
  referer,
  title,
  fetchImpl = fetch,
  sleep = defaultSleep,
  log = console.log
}) {
  let waitedMs = 0;

  for (let retry = 0; retry <= MAX_FLEX_RETRIES; retry += 1) {
    const result = await sendRequest({
      apiKey,
      payload,
      serviceTier: FLEX_SERVICE_TIER,
      referer,
      title,
      fetchImpl
    });

    if (result.ok) {
      return result.summary;
    }

    if (!isTemporaryFlexFailure(result.status)) {
      throw createRequestError(result);
    }

    if (retry === MAX_FLEX_RETRIES) {
      break;
    }

    const delayMs = getFlexRetryDelay({
      retry,
      retryAfter: result.retryAfter,
      waitedMs
    });

    if (delayMs === null) {
      log("::warning::Flex capacity retry would exceed the five-minute wait limit. Falling back to the default service tier.");
      break;
    }

    log(`Flex release-summary request failed with ${result.status}. Retrying in ${formatDelay(delayMs)}.`);
    await sleep(delayMs);
    waitedMs += delayMs;
  }

  log("::warning::Flex release-summary capacity remained unavailable. Falling back to the default service tier.");
  const fallbackResult = await sendRequest({
    apiKey,
    payload,
    serviceTier: DEFAULT_SERVICE_TIER,
    referer,
    title,
    fetchImpl
  });

  if (!fallbackResult.ok) {
    throw createRequestError(fallbackResult);
  }

  return fallbackResult.summary;
}

async function sendRequest({ apiKey, payload, serviceTier, referer, title, fetchImpl }) {
  let response;

  try {
    response = await fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": referer,
        "X-Title": title
      },
      body: JSON.stringify({
        ...payload,
        service_tier: serviceTier
      })
    });
  } catch (error) {
    throw new OpenRouterReleaseSummaryError(`OpenRouter request failed: ${getErrorMessage(error)}`);
  }

  const responseText = await response.text();

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      responseText,
      retryAfter: response.headers.get("Retry-After")
    };
  }

  let parsed;

  try {
    parsed = JSON.parse(responseText);
  } catch (error) {
    throw new OpenRouterReleaseSummaryError(`OpenRouter returned invalid JSON: ${getErrorMessage(error)}`, response.status);
  }

  const body = parsed.choices?.[0]?.message?.content?.trim();

  if (!body) {
    throw new OpenRouterReleaseSummaryError("OpenRouter returned an empty release summary.", response.status);
  }

  return {
    ok: true,
    summary: {
      body,
      serviceTier: parsed.service_tier ?? null
    }
  };
}

function getFlexRetryDelay({ retry, retryAfter, waitedMs }) {
  const retryAfterMs = parseRetryAfter(retryAfter);

  if (retryAfterMs !== null) {
    return waitedMs + retryAfterMs <= MAX_FLEX_RETRY_WAIT_MS ? retryAfterMs : null;
  }

  const backoffMs = FLEX_RETRY_BACKOFF_MS[retry];
  return waitedMs + backoffMs <= MAX_FLEX_RETRY_WAIT_MS ? backoffMs : null;
}

function parseRetryAfter(value) {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

function isTemporaryFlexFailure(status) {
  return status === 429 || status === 503;
}

function createRequestError({ status, responseText }) {
  return new OpenRouterReleaseSummaryError(`OpenRouter request failed with ${status}: ${responseText}`, status);
}

function formatDelay(delayMs) {
  return `${Math.ceil(delayMs / 1000)} seconds`;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function defaultSleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
