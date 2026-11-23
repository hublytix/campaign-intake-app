const SECRET_KEYS = /token|secret|password|authorization|verifier|refresh|cookie/i;

function redact(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length > 24 && /[A-Za-z0-9_-]{20,}/.test(value)) {
      // leave ordinary sentences; redact only if it looks like a credential key=value
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = SECRET_KEYS.test(key) ? "[redacted]" : redact(entry);
    }
    return output;
  }
  return value;
}

export function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
}

export function logInfo(message: string, extra?: Record<string, unknown>): void {
  if (extra) console.info(message, redact(extra));
  else console.info(message);
}

export function logError(message: string, extra?: Record<string, unknown>): void {
  if (extra) console.error(message, redact(extra));
  else console.error(message);
}
