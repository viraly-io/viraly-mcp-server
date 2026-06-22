import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';
import { dedupeWrite, deriveIdempotencyKey } from './_idempotency.js';

const inputSchema = z.object({
  platform: z
    .enum([
      'facebook',
      'instagram',
      'twitter',
      'linkedin',
      'pinterest',
      'tiktok',
      'youtube',
      'threads',
      'bluesky',
      'mastodon',
    ])
    .describe('Platform of the channel.'),
  channel_id: z.string().min(1).describe('The channel id whose post analytics to export.'),
  post_metrics: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      'List of metric column ids to include (e.g. ["likes","comments","reach","impressions"]). The exact set of valid metrics is platform-specific.',
    ),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Optional. Inclusive lower bound, YYYY-MM-DD.'),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Optional. Inclusive upper bound, YYYY-MM-DD.'),
  idempotency_key: z.string().optional(),
});

registerTool({
  name: 'export_analytics_csv',
  description:
    "Export per-post analytics for a channel as a CSV string. Use this when the user asks for a downloadable report or wants to feed metrics into a spreadsheet. Returns a base64-encoded CSV plus the suggested filename — the caller is responsible for writing it to disk if needed.",
  inputSchema,
  isWrite: true,
  handler: async (input) => {
    const idempotencyKey = deriveIdempotencyKey(
      'export_analytics_csv',
      input,
      input.idempotency_key,
    );
    const client = getClient({ idempotencyKey });

    // The API returns raw CSV bytes with content-type text/csv. The shared
    // client tries JSON.parse; on failure it returns the original string,
    // so we always get the CSV text back as a string here. We re-encode to
    // base64 so the LLM doesn't accidentally truncate or mangle multi-line
    // text when echoing the value.
    // The upstream does NOT honor Idempotency-Key, so dedupeWrite collapses a
    // retry of this expensive export into the cached result rather than
    // re-running the report generation.
    const csv = await dedupeWrite(idempotencyKey, () =>
      client.call<string>({
        method: 'POST',
        path: `/api/platforms/analytics/export/${encodeURIComponent(input.platform)}`,
        idempotent: true,
        body: {
          channelId: input.channel_id,
          postMetrics: input.post_metrics,
          startDate: input.start_date,
          endDate: input.end_date,
        },
      }),
    );

    const csvText = typeof csv === 'string' ? csv : JSON.stringify(csv);
    const csvBase64 = Buffer.from(csvText, 'utf8').toString('base64');

    // Sanitize values used in the suggested filename so a crafted channel_id/platform
    // can't inject path separators, CRLF, or other control characters if a caller
    // writes it to disk or a Content-Disposition header.
    const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64) || 'export';

    return {
      platform: input.platform,
      channel_id: input.channel_id,
      filename: `${safe(input.platform)}-${safe(input.channel_id)}-analytics.csv`,
      csv_base64: csvBase64,
      csv_byte_length: Buffer.byteLength(csvText, 'utf8'),
    };
  },
});
