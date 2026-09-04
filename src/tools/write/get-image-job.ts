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

/**
 * How long one get_image_job call may wait for the job before answering. Kept
 * clear of every timeout stacked above it: undici upstream 45s (per GET, not
 * cumulative), Lambda 55s, the MCP client's own 60s, CloudFront 75s.
 */
const WAIT_BUDGET_MS = 40_000;
const POLL_INTERVAL_MS = 4_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const inputSchema = z.object({
  job_id: z
    .string()
    .min(1)
    .describe('The job id returned by generate_image, e.g. "ab12cd34". Required.'),
});

registerTool({
  name: 'get_image_job',
  description:
    'Check an image generation started by generate_image. This call waits on the server for ' +
    'up to about 40 seconds and returns as soon as the job finishes, so one or two calls are ' +
    'normally enough; if it comes back still "Pending" or "Running" nothing has gone wrong, ' +
    'just call it again with the same job_id. "Succeeded" carries the attachment id to use in ' +
    'schedule_post or create_draft; "Failed" carries an error message safe to show the user. ' +
    'Never restart the generation while a job is still Pending or Running.',
  inputSchema,
  // Read-only: it inspects a job, it does not create or change one.
  handler: async (input) => {
    const client = getClient();
    const path = `/api/platforms/ai/image-jobs/${encodeURIComponent(input.job_id)}`;
    const deadline = Date.now() + WAIT_BUDGET_MS;

    let job = await client.call<AiImageJobUpstream>({ method: 'GET', path });

    // Long-poll on behalf of the model. Generation takes about a minute, and
    // several AI clients cannot pause between tool calls: handed an immediate
    // "Pending" they either hammer the endpoint or give up and report the tool
    // as unresponsive. Holding the request here (well inside the 45s upstream,
    // 55s Lambda, 60s MCP-client and 75s CloudFront budgets) turns the whole
    // flow into one or two calls for them. Each upstream GET is milliseconds,
    // so the only thing held open is this Lambda invocation.
    while (!isTerminal(job.status) && Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      job = await client.call<AiImageJobUpstream>({ method: 'GET', path });
    }

    const described = describeJob(job);

    if (isTerminal(job.status)) {
      return described;
    }

    return {
      ...described,
      next_step:
        'Still generating. Call get_image_job again with the same job_id; it will wait for ' +
        'the result. Do not start another generation.',
    };
  },
});
