/**
 * Tool aggregation point. Side-effect imports — each module calls
 * `registerTool(...)` at load time.
 */

// ── Read tools ─────────────────────────────────────────────────────────
import './read/list-channels.js';
import './read/list-pending-posts.js';
import './read/list-published-posts.js';
import './read/list-drafts.js';
import './read/get-post.js';
import './read/get-post-analytics.js';
import './read/get-channel-analytics.js';
import './read/list-media.js';
import './read/list-hashtag-groups.js';
import './read/list-categories.js';
import './read/get-workspace-info.js';

// ── Write tools ────────────────────────────────────────────────────────
import './write/schedule-post.js';
import './write/update-post.js';
import './write/cancel-post.js';
import './write/create-draft.js';
import './write/upload-media.js';
import './write/generate-image.js';
import './write/generate-caption.js';

export {};
