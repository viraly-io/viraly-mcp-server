import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';
import { deriveIdempotencyKey } from './_idempotency.js';
import { assertSafeMediaUrl, MediaUrlError } from './_url-guard.js';

interface UrlPreviewUpstream {
  title?: string | null;
  description?: string | null;
  domain?: string | null;
  url: string;
  favicon?: string | null;
  isSuccess: boolean;
  image?: { url: string; mimeType?: string | null } | null;
}

const inputSchema = z.object({
  url: z
    .string()
    .url()
    .describe('The URL to fetch Open Graph metadata for. Must be a valid http(s) URL.'),
  idempotency_key: z.string().optional(),
});

registerTool({
  name: 'get_url_preview',
  description:
    "Fetch Open Graph metadata (title, description, image, favicon, domain) for a URL — the same preview card the Viraly composer renders. Useful when an LLM is composing a post that links somewhere and wants to confirm the link card before publishing. Marked as a write tool because it makes a real outbound HTTP request, but it doesn't change Viraly state.",
  inputSchema,
  isWrite: true,
  handler: async (input) => {
    // SSRF guard: the API fetches this URL server-side, so reject private/
    // reserved/link-local/metadata targets (and non-https schemes) at the MCP
    // layer before forwarding. Mirrors upload_media's protection.
    let safeUrl: URL;
    try {
      safeUrl = assertSafeMediaUrl(input.url);
    } catch (err) {
      if (err instanceof MediaUrlError) {
        throw new Error(`Refusing to fetch URL: ${err.message}`);
      }
      throw err;
    }

    const idempotencyKey = deriveIdempotencyKey(
      'get_url_preview',
      input,
      input.idempotency_key,
    );
    const client = getClient({ idempotencyKey });

    const preview = await client.call<UrlPreviewUpstream>({
      method: 'POST',
      path: '/api/platforms/url-preview',
      idempotent: true,
      body: { url: safeUrl.toString() },
    });

    return {
      url: preview.url,
      success: preview.isSuccess,
      title: preview.title ?? null,
      description: preview.description ?? null,
      domain: preview.domain ?? null,
      favicon_url: preview.favicon ?? null,
      image_url: preview.image?.url ?? null,
      image_mime_type: preview.image?.mimeType ?? null,
    };
  },
});
