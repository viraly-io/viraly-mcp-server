/**
 * Poll one asynchronous image generation.
 *
 * Filed under `write/` to sit beside `generate_image` and their shared shape
 * helper, but it is deliberately NOT `isWrite`: it creates nothing and changes
 * nothing, and flagging it would put every poll through the write dedupe cache,
 * which would return the FIRST poll's result for the next 60 seconds and make
 * the job look permanently stuck at Pending.
 */

import { z } from 'zod';

import { getClient } from '../../api/client-factory.js';
import { registerTool } from '../registry.js';
import { type AiImageJobUpstream, describeJob, isTerminal } from './_ai-image-job.js';

const inputSchema = z.object({
  job_id: z
    .string()
    .min(1)
    .describe('The job id returned by generate_image, e.g. "ab12cd34". Required.'),
});

registerTool({
  name: 'get_image_job',
  description:
    'Check an image generation started by generate_image. Generation normally takes about a ' +
    'minute, so wait roughly 10 seconds between calls rather than polling in a tight loop. ' +
    'While status is "Pending" or "Running" nothing has gone wrong and there is nothing to do ' +
    'but wait. "Succeeded" carries the attachment id to use in schedule_post or create_draft; ' +
    '"Failed" carries an error message safe to show the user. Never restart the generation ' +
    'while a job is still Pending or Running.',
  inputSchema,
  // Read-only: it inspects a job, it does not create or change one.
  handler: async (input) => {
    const client = getClient();

    const job = await client.call<AiImageJobUpstream>({
      method: 'GET',
      path: `/api/platforms/ai/image-jobs/${encodeURIComponent(input.job_id)}`,
    });

    const described = describeJob(job);

    if (isTerminal(job.status)) {
      return described;
    }

    return {
      ...described,
      next_step:
        'Still generating. Wait about 10 seconds and call get_image_job again with the same ' +
        'job_id. Do not start another generation.',
    };
  },
});
