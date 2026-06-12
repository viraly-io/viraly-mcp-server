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
