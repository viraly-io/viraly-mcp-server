/**
 * Shared shape for the asynchronous image-generation job, used by the tool that
 * starts one (`generate_image`) and the tool that polls it (`get_image_job`).
 *
 * Both endpoints return the same `AiImageJobDto`, so mapping it once keeps the
 * two tools from drifting into reporting the same job differently.
 */

import { type AttachmentUpstream } from '../read/_post-shape.js';
import { describeMediaFailure, MEDIA_FAILURE_CODES } from './_media-outcome.js';

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
 * Flatten a job into the fields a model needs. The attachment is present once
 * the job succeeds, but the image is usable only once its row is "Completed":
 * the media processor measures the file after the job has written it (media
 * ingest flow, rule 8), so `ready` comes from the row's status and never from
 * the job's.
 */
export function describeJob(job: AiImageJobUpstream): Record<string, unknown> {
  const attachment = job.attachment ?? undefined;

  return {
    job_id: job.id,
    status: job.status,
    attachment_status: attachment?.status,
    ready: isReady(job),
    failed: isFailed(job),
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
    // A job that failed with its row's code carries the row's message, which is the media processor's and can
    // hold internal detail: such a code is described in plain words instead.
    error_message:
      job.errorCode && MEDIA_FAILURE_CODES.has(job.errorCode)
        ? describeMediaFailure(job.errorCode)
        : (job.errorMessage ?? undefined),
    started_at: job.startedAt ?? undefined,
    completed_at: job.completedAt ?? undefined,
  };
}

/** True once the job will never change again. */
export function isTerminal(status: string): boolean {
  return status === 'Succeeded' || status === 'Failed';
}

/** True once the image can be attached to a post: the job succeeded and its row is Completed. */
export function isReady(job: AiImageJobUpstream): boolean {
  return job.status === 'Succeeded' && job.attachment?.status === 'Completed';
}

/**
 * True while a call of get_image_job should keep waiting: the job is still
 * running, or it succeeded and the processor has not finished the row yet.
 */
export function isSettled(job: AiImageJobUpstream): boolean {
  return isFailed(job) || isReady(job);
}

/** True once the image will never be usable: the job failed, or its row ended Failed. */
export function isFailed(job: AiImageJobUpstream): boolean {
  return job.status === 'Failed' || job.attachment?.status === 'Failed';
}
