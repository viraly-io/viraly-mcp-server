/**
 * Shared shape for the asynchronous image-generation job, used by the tool that
 * starts one (`generate_image`) and the tool that polls it (`get_image_job`).
 *
 * Both endpoints return the same `AiImageJobDto`, so mapping it once keeps the
 * two tools from drifting into reporting the same job differently.
 */

import { type AttachmentUpstream } from '../read/_post-shape.js';

/** AiImageJobDto as serialized by the Platform API. */
export interface AiImageJobUpstream {
  id: string;
  /** "Pending" | "Running" | "Succeeded" | "Failed". */
  status: string;
  prompt?: string;
  aspectRatio?: string;
  quality?: string;
  /** Stable machine code, e.g. "prompt-rejected" or "provider-unavailable". */
  errorCode?: string | null;
  errorMessage?: string | null;
  attachment?: (AttachmentUpstream & { id?: string }) | null;
  createdAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

/**
 * Flatten a job into the fields a model needs. The attachment is present only
 * once the job succeeds, so `attachment_id` doubles as "is it ready".
 */
export function describeJob(job: AiImageJobUpstream): Record<string, unknown> {
  const attachment = job.attachment ?? undefined;

  return {
    job_id: job.id,
    status: job.status,
    prompt: job.prompt,
    aspect_ratio: job.aspectRatio,
    quality: job.quality,
    // AttachmentDto nests file metadata under info and thumbnails; there are no
    // top-level url/width/height fields on the wire.
    attachment_id: attachment?.id,
    url: attachment?.info?.url,
    thumbnail_url: attachment?.thumbnails?.medium?.url ?? attachment?.thumbnails?.small?.url,
    width: attachment?.info?.width,
    height: attachment?.info?.height,
    type: attachment?.type,
    error_code: job.errorCode ?? undefined,
    error_message: job.errorMessage ?? undefined,
    started_at: job.startedAt ?? undefined,
    completed_at: job.completedAt ?? undefined,
  };
}

/** True once the job will never change again. */
export function isTerminal(status: string): boolean {
  return status === 'Succeeded' || status === 'Failed';
}
