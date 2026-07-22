/**
 * In-process Gemini call budget for this single-user app.
 * Survives across requests in the same Node process; resets on server restart.
 */
declare global {
  var __geminiRateLimit:
    | {
        lastCallAt: number;
        callTimestamps: number[];
        inFlight: boolean;
      }
    | undefined;
}

const MIN_INTERVAL_MS = 20_000;
const MAX_CALLS_PER_HOUR = 15;
const HOUR_MS = 60 * 60 * 1000;

function state() {
  if (!globalThis.__geminiRateLimit) {
    globalThis.__geminiRateLimit = {
      lastCallAt: 0,
      callTimestamps: [],
      inFlight: false,
    };
  }

  return globalThis.__geminiRateLimit;
}

export type GeminiRateLimitBlock = {
  allowed: false;
  retryAfterSeconds: number;
  reason: string;
};

export type GeminiRateLimitOk = {
  allowed: true;
};

export function checkGeminiRateLimit(): GeminiRateLimitOk | GeminiRateLimitBlock {
  const current = state();
  const now = Date.now();

  if (current.inFlight) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(MIN_INTERVAL_MS / 1000),
      reason: "A Gemini request is already running. Wait for it to finish.",
    };
  }

  const sinceLast = now - current.lastCallAt;
  if (current.lastCallAt > 0 && sinceLast < MIN_INTERVAL_MS) {
    const retryAfterSeconds = Math.ceil((MIN_INTERVAL_MS - sinceLast) / 1000);
    return {
      allowed: false,
      retryAfterSeconds,
      reason: `Slow down — wait ${retryAfterSeconds}s between Gemini batches to stay under free-tier limits.`,
    };
  }

  current.callTimestamps = current.callTimestamps.filter(
    (timestamp) => now - timestamp < HOUR_MS,
  );

  if (current.callTimestamps.length >= MAX_CALLS_PER_HOUR) {
    const oldest = current.callTimestamps[0] ?? now;
    const retryAfterSeconds = Math.ceil((HOUR_MS - (now - oldest)) / 1000);
    return {
      allowed: false,
      retryAfterSeconds,
      reason: `Hourly Gemini limit reached (${MAX_CALLS_PER_HOUR} batches/hour). Try again in about ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
    };
  }

  return { allowed: true };
}

export function beginGeminiCall() {
  const current = state();
  current.inFlight = true;
}

export function endGeminiCall(success: boolean) {
  const current = state();
  const now = Date.now();
  current.inFlight = false;
  current.lastCallAt = now;

  if (success) {
    current.callTimestamps.push(now);
    current.callTimestamps = current.callTimestamps.filter(
      (timestamp) => now - timestamp < HOUR_MS,
    );
  }
}

export const GEMINI_BATCH_SIZE = 40;
