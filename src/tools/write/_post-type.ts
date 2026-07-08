import type { PostConfigUpstream } from '../read/_post-shape.js';

/** Tool-facing placement vocabulary. */
export type PostTypeInput = 'feed' | 'reel' | 'story' | 'short';

const API_POST_TYPE: Record<PostTypeInput, string> = {
  feed: 'Feed',
  reel: 'Reel',
  story: 'Story',
  short: 'Short',
};

/** Map the tool's lowercase post_type to the API's IntegrationPostType enum string. */
export function toApiPostType(postType: PostTypeInput | undefined): string {
  return API_POST_TYPE[postType ?? 'feed'];
}

/**
 * Derive the placement of an existing post from its platform config blob so an
 * update can echo it back. The API rebuilds the whole config server-side on a
 * caption-only update; without the placement, a story/reel/short would be
 * silently demoted to a feed post.
 */
export function derivePostTypeFromConfig(
  config: PostConfigUpstream | null | undefined,
): PostTypeInput | undefined {
  const fbOrIg =
    config?.facebook?.contentOptions?.postType ?? config?.instagram?.contentOptions?.postType;
  if (fbOrIg === 'Reel') return 'reel';
  if (fbOrIg === 'Story') return 'story';
  if (config?.youTube?.contentOptions?.postType === 'ShortVideo') return 'short';
  return undefined;
}
