import { z } from 'zod';

import { registerTool } from '../registry.js';

/**
 * Per-platform media requirements, mirrored from the Viraly web composer
 * (viraly-react-spa/src/utils/media-requirements.ts) and enforced server-side
 * by the API's PostValidationService. Surfaced so the connected model can meet
 * the requirements BEFORE calling schedule_post/update_post/create_draft and,
 * if a post is still rejected, understand the error and adjust the media/caption.
 *
 * Keep in sync with media-requirements.ts in the SPA and PostValidationService.cs.
 */
const PLATFORMS = ['Instagram', 'Facebook', 'Twitter', 'YouTube', 'TikTok', 'Pinterest', 'LinkedIn', 'Threads', 'Bluesky', 'Mastodon'] as const;

type Platform = (typeof PLATFORMS)[number];

const REQUIREMENTS: Record<Platform, unknown> = {
  Instagram: {
    image_post: { aspect_ratio: '3:4 to 1.91:1', max_file_size: '8MB', formats: ['JPEG', 'PNG'] },
    carousel: { max_count: 10, note: 'Mix photos/videos up to 10; photos 8MB; aspect 3:4 to 1.91:1' },
    reel: { aspect_ratio: '0.01:1 to 10:1 (9:16 ideal)', max_file_size: '300MB', duration: '3s-15min', max_width: 1920, formats: ['MP4', 'MOV'] },
    video_story: { aspect_ratio: '0.01:1 to 10:1', max_file_size: '100MB', duration: '3s-60s', formats: ['MP4', 'MOV'] },
    caption: { max_chars: 2200, max_hashtags: 5 },
  },
  Facebook: {
    image_post: { max_file_size: '10MB', max_count: 10, formats: ['JPEG', 'PNG'] },
    gif: { max_file_size: '8MB', max_dimensions: '1280x1080', formats: ['GIF'] },
    video_reel: { max_file_size: '1GB', duration: '3s-240min', formats: ['MP4', 'MOV', 'WebM'] },
    video_story: { aspect_ratio: '9:16', min_resolution: '540x960', max_file_size: '1GB', duration: '3s-90s' },
    caption: { max_chars: 5000, comment_max_chars: 8000 },
  },
  Twitter: {
    image_post: { max_file_size: '5MB', max_count: 4, formats: ['JPEG', 'PNG'] },
    gif: { max_file_size: '15MB', max_dimensions: '1280x1080' },
    video: { aspect_ratio: '1:3 to 3:1', max_file_size: '512MB', duration: '0.5s-140s', formats: ['MP4', 'MOV', 'WebM'] },
    caption: { max_chars: '280 (25,000 for Premium/verified X on paid Viraly plans)' },
  },
  YouTube: {
    short: { aspect_ratio: '9:16 or 1:1', max_file_size: '4GB', duration: '<180s', title_max_chars: 100, description_max_chars: 5000 },
    video: { max_file_size: '4GB', duration: '>2s', title_max_chars: 100, description_max_chars: 5000 },
    notes: ['Title required', 'No angle brackets (< >) in title/description', 'Max 60 hashtags total'],
  },
  TikTok: {
    video: { resolution: '360x360 to 4096x4096', max_file_size: '4GB', formats: ['MP4', 'WebM', 'MOV'], caption_max_chars: 2200, note: 'Max duration varies by creator account and is enforced by TikTok at publish time, not at scheduling — keep videos within the creator\'s allowed length or the publish will fail' },
    photo_post: { max_file_size: '10MB', max_count: 35, resolution: '<=1920x1080 or <=1080x1920', formats: ['JPEG', 'WebP'], caption_max_chars: 4000, title_max_chars: 90 },
  },
  Pinterest: {
    image_pin: { aspect_ratio: '2:3 recommended', max_file_size: '10MB', formats: ['JPEG', 'PNG'] },
    video_pin: { aspect_ratio: '1:1, 2:3, 4:5, or 9:16', max_file_size: '2GB', duration: '4s-15min', formats: ['MP4', 'MOV'] },
    carousel: { max_count: 5, note: 'Photos only; all must share the same aspect ratio' },
    title_max_chars: 100,
    description_max_chars: 800,
    notes: ['A board must be selected — pass board_id (discover ids with list_pinterest_boards)'],
  },
  LinkedIn: {
    photo_post: { max_file_size: '8MB', max_pixels: 'width x height <= 36,152,320', formats: ['JPEG', 'PNG'] },
    video_post: { aspect_ratio: '9:16 to 16:9', file_size: '75KB-500MB', duration: '3s-30min', formats: ['MP4'] },
    multi_image: { max_file_size: '8MB', count: '2-20', formats: ['JPEG', 'PNG'] },
    document_post: { max_file_size: '100MB', max_count: 1, formats: ['PDF', 'PPTX', 'DOCX'], note: 'Document title required' },
    caption: { max_chars: 3000, comment_max_chars: 1248 },
  },
  Threads: {
    photo_post: { aspect_ratio: '<10:1', max_file_size: '8MB', width: '360px-1440px', formats: ['JPEG', 'PNG'] },
    video_post: { aspect_ratio: '0.01:1 to 10:1 (9:16 rec.)', max_file_size: '1GB', duration: '1s-300s', max_width: 1920, formats: ['MP4', 'MOV'] },
    carousel: { count: '2-20', note: 'Mix photos/videos' },
    caption: { max_chars: 500, max_hashtags: 1 },
  },
  Bluesky: {
    photo_post: { max_file_size: '~976KB', formats: ['JPEG', 'PNG', 'WebP'] },
    video_post: { max_file_size: '100MB', duration: '1s-180s', formats: ['MP4', 'MOV'] },
    carousel: { count: '2-4', note: 'Photos only (no videos)' },
    caption: { max_chars: 300 },
  },
  Mastodon: {
    photo_post: { max_file_size: '16MB', formats: ['JPEG', 'PNG', 'WebP'] },
    video_post: { max_file_size: '40MB', formats: ['MP4', 'MOV'] },
    carousel: { count: '2-4', note: 'Photos only (no videos)' },
    caption: { max_chars: 500 },
  },
};

const inputSchema = z.object({
  platform: z
    .enum(PLATFORMS)
    .optional()
    .describe('Optional. Limit the response to a single platform. Omit to get all platforms.'),
});

registerTool({
  name: 'get_media_requirements',
  description:
    'Return the per-platform media and caption requirements (allowed formats, max file size, dimensions/aspect ratio, video duration, attachment counts, caption length, hashtag limits) enforced when scheduling a post. Call this BEFORE attaching media or writing a caption so the post passes validation on the first try. The API validates the same rules server-side and returns a friendly error listing exactly what to fix; note that video duration/dimension limits are best-effort because Viraly does not always measure server-side, so the target platform may still reject a non-conforming video.',
  inputSchema,
  handler: async (input) => {
    if (input.platform) {
      return { platform: input.platform, requirements: REQUIREMENTS[input.platform] };
    }
    return { requirements: REQUIREMENTS };
  },
});
