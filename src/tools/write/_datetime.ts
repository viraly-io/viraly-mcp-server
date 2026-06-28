/**
 * Normalize a zone-designated ISO 8601 string to the same instant in UTC
 * with a `Z` suffix.
 *
 * The Viraly API deserializes `scheduledAt` into a .NET DateTime and treats
 * it as UTC. A non-Z offset (e.g. `2026-06-12T15:00:00+02:00`) parses
 * upstream to DateTimeKind.Local, which makes
 * TimeZoneInfo.ConvertTimeFromUtc throw and the request 500. Inputs must
 * already carry an explicit offset or Z (enforced by
 * `z.string().datetime({ offset: true })`), so the conversion is exact —
 * never a server-local-time guess.
 */
export function toUtcIso(value: string): string;
export function toUtcIso(value: string | undefined): string | undefined;
export function toUtcIso(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return new Date(value).toISOString();
}

/**
 * Tolerate a small amount of clock skew / in-flight latency so a time of
 * "right now" is not rejected as past.
 */
const PAST_GRACE_MS = 60_000;

/**
 * Validate that a caller-supplied scheduling time is in the future and return
 * it as a UTC ISO string.
 *
 * The Viraly API rejects a null/past `scheduledAt` with the opaque
 * `MODEL_VALIDATION_FAILED` (the failing field is only in the response body,
 * never logged), which an AI assistant like Grok surfaces verbatim with no way
 * to self-correct. Catching it here turns that dead end into a clear,
 * model-actionable instruction that names the offending value and the current
 * time, so the assistant can retry with a valid future time on its own.
 *
 * `now` is injectable for deterministic tests.
 */
export function toFutureUtcIso(value: string, now: number = Date.now()): string {
  const instant = new Date(value).getTime();
  // Zod's `.datetime({ offset: true })` already guarantees a parseable,
  // offset-bearing string upstream; the NaN check is defensive for any caller
  // that reaches this helper without that validation.
  if (Number.isNaN(instant)) {
    throw new Error(
      `Invalid scheduled_at "${value}". Use an ISO 8601 datetime with a timezone offset, ` +
        'e.g. 2026-07-01T09:00:00Z.',
    );
  }
  if (instant < now - PAST_GRACE_MS) {
    throw new Error(
      `scheduled_at "${value}" is in the past. Provide a future time. ` +
        `The current time is ${new Date(now).toISOString()} (UTC).`,
    );
  }
  return new Date(value).toISOString();
}
