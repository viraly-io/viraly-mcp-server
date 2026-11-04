# Viraly MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-1.x-blue)](https://modelcontextprotocol.io)

The official [Model Context Protocol](https://modelcontextprotocol.io) server for [Viraly](https://viraly.io) — connect any MCP-aware AI assistant (Claude Desktop, Claude.ai web, ChatGPT, Cursor, custom agents built on the Anthropic / OpenAI SDKs) directly to your Viraly social-media workspace and let it schedule posts, run analytics, generate captions, and manage every channel you've connected, all in plain language.

**First-class MCP support: 121 tools, full CRUD.** Not a read-only sidekick: your AI can create, read, update, and delete across posts, channels, media, analytics, bio links, short links, ideas, feeds and more, bound by the same OAuth scopes and plan limits as the web app.

> **Available on every Viraly plan, including Free.** No API key — sign in once with OAuth and your AI assistant gets scoped, revocable access to your workspace.

- **Public endpoint:** `https://mcp.viraly.io/mcp`
- **Beta / staging:** `https://mcp.beta.viraly.io/mcp`
- **Source:** [github.com/viraly-io/viraly-mcp-server](https://github.com/viraly-io/viraly-mcp-server)
- **API docs:** [viraly.io/docs](https://viraly.io/docs)

---

## What you can do with it

Once connected, your AI assistant can drive Viraly using natural language:

> *"Draft three Instagram captions about our spring sale, then schedule the best one for Friday at 9am."*

> *"What were my top-performing LinkedIn posts last month by reach? Export them to CSV."*

> *"Generate a hero image for my next YouTube short and save it to the media library."*

> *"Reschedule everything in the Promo queue from this week to next week."*

> *"Post this clip as an Instagram story today and as a YouTube Short tomorrow morning."*

The MCP server exposes **121 tools** across reading, writing, analytics, and AI generation; see the [tool catalog](#tool-catalog) below.

---

## Quick install

Pick your MCP client. The first time you run any of these, your browser will open to `app.viraly.io/oauth/authorize` for sign-in and consent. After that, your assistant stays connected.

### Claude Desktop / Claude.ai

Add a custom connector pointing to `https://mcp.viraly.io/mcp`. Follow [Anthropic's connector guide](https://support.anthropic.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp).

### ChatGPT (Apps & Connectors)

In **Settings → Connectors → Add new**, paste `https://mcp.viraly.io/mcp` and follow the OAuth prompt.

### Cursor

In `~/.cursor/mcp.json` (or your project's `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "viraly": {
      "url": "https://mcp.viraly.io/mcp"
    }
  }
}
```

### Claude Code (CLI)

```bash
claude mcp add viraly https://mcp.viraly.io/mcp -t http
```

### Custom agents (Anthropic SDK / OpenAI SDK / etc.)

Any MCP-compliant client over Streamable HTTP works. Point it at `https://mcp.viraly.io/mcp` and complete the OAuth 2.1 flow (PKCE + Dynamic Client Registration are supported per [RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591)). The discovery doc is at `https://mcp.viraly.io/.well-known/oauth-protected-resource`.

---

## Tool catalog

The list below is generated from the API's registry by `npm run readme`; do not edit it by hand. Risk classes: a read runs at once; a reversible write is logged with Undo; an always-ask action needs the member's confirmation in the Viraly app, and through MCP it runs under the API key's own scopes.

<!-- tools:start -->
122 tools in the registry, catalog last changed 2026-10-31.

#### workspace

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `get_workspace` | The workspace (id, name, plan, status, when it was created, how many channels it has in all) and the active social set (id, name, timezone, how many channels are connected to it). Use it for questions about the account itself. For the workspace's settings (notifications, API keys, connected apps, webhooks, Slack, Teams, Discord) use get_workspace_settings and its neighbours in the settings module; for the plan's limits use get_subscription. | `workspace:read` | read |  |
| `get_workspace_brief` | The brief the members wrote for Copilot: brand voice, audience, do and don't lists, posting rules. The social set's own brief when it has one, otherwise the workspace's, with when it last changed and the 8,000-character limit. | `workspace:read` | read |  |
| `list_social_sets` | Every social set this member can open, as the app's list shows them: id, name, short code, colour, timezone, when it was created, how many channels it has, and which one is active (null through an API connection, which has no active set). Tools work on the active set; to act on another one the member named, pass its id as socialSetId. | `social_sets:read` | read |  |
| `list_timezones` | Timezone ids the app accepts for a social set (IANA names such as Europe/Berlin), with the display name and the standard UTC offset. Up to 100 come back with the total; use search to find one. | `workspace:read` | read |  |
| `update_workspace_brief` | Replaces the brief Copilot reads on every request (brand voice, audience, rules), for the whole workspace or this social set only, up to 8,000 characters; empty removes it. A social set's own brief shadows the workspace's for that set. Show the member the new text; it replaces the old one. Through an API connection the brief is written for the workspace with no member recorded as its author. | `social_sets:write` | reversible write | yes |

#### social_sets

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_social_set` | Creates a new, empty social set (a brand or client with its own channels, calendar and timezone) with the same checks as the app's form. Channels are connected to it in the app afterwards. | `social_sets:write` | reversible write | yes |
| `delete_social_set` | Deletes a social set with all its channels, every post (published history and analytics included) and inbox history, as the app's list does: YouTube access is revoked, the workspace's webhooks hear each channel disconnect, and channels locked by the plan's limit are re-evaluated. A workspace keeps at least one social set, so the last one is refused. Irreversible; the member confirms on a card every time. | `social_sets:write` | always ask |  |
| `get_social_set` | The active social set in detail: name, short code, colour, timezone, when it was created, and each connected channel with its username, account type, status and problem. | `social_sets:read` | read |  |
| `update_social_set` | Changes the active social set's name, timezone, colour or code, with the app's checks. A timezone change re-times every post with a future time that is scheduled, awaiting approval or being published so it keeps its local wall-clock time in the new zone (the moment it publishes changes); drafts keep their placeholder time; the result says how many moved. Undo puts the old values back the same way. | `social_sets:write` | reversible write | yes |

#### channels

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `disconnect_channel` | Disconnects a channel from Viraly and deletes everything Viraly holds for it: every post including the published history and its analytics, comments and approvals, and its inbox conversations. Nothing is removed on the network itself. Irreversible; the member confirms on a card every time. | `channels:write` | always ask |  |
| `get_channel` | One channel in detail, as the app's channel card shows it: platform, account type, username, status and why (an expired token with the network's message, a locked channel over the plan's limit), who connected it, the permissions it granted, when its token was last and is next refreshed, when analytics were last and are next fetched, its posting slots with their ids, and how many posts it has. For an X account also the subscription type and the caption limit that applies (280 weighted characters, or 25,000 for Premium on a paid plan). | `channels:read` | read |  |
| `get_media_requirements` | Each platform's rules for media and text as the app's composer and the server's validator apply them: formats, file sizes, aspect ratios, resolutions, video lengths, how many files, caption, title, first-comment and hashtag limits, thumbnails. Check them before drafting; validate_post checks a concrete post. | `channels:read` | read |  |
| `get_posting_slots` | The weekly posting slots of each channel (id, day, local time in the social set's timezone) that the queue fills, with how many queued posts sit in each. The ids are what set_posting_slots takes to move a slot. find_free_slots says which slots are empty on given dates. | `channels:read` | read |  |
| `get_reconnect_link` | Where the member reconnects an expired or broken channel: the app's social set page, which starts the network's sign-in for that channel on arrival (Bluesky and Mastodon ask for the credentials on the page). Reconnecting needs the member to sign in to the network themselves, so no tool can do it. In the app Copilot can open the path with navigate; elsewhere give the member the url. | `channels:read` | read |  |
| `list_channels` | The connected accounts and pages of the active social set: id, name, username, platform, account type, status (Active, Expired, Disabled, Locked) and the problem behind a status. Use it to turn a channel name into its id. | `channels:read` | read |  |
| `list_pinterest_boards` | The boards of a Pinterest channel with their ids, as the app's board picker shows them. A pin needs one: pass the id as boardId on create_draft, schedule_post or update_post. Without refresh the list is what the last fetch stored, so a board made on Pinterest since may be missing. | `channels:read` | read |  |
| `set_posting_slots` | Replaces one channel's weekly posting slots, the times the queue fills. Queued posts follow their slot only when the slot is sent with its id and a new time (they move to that time on the same date, as the app's slot editor does); a removed slot's queued posts keep their date, time and queued status (the app still lists them in the queue at that time) but no longer sit in a posting slot, which get_post shows as inPostingSlot false. generateSlotsPerDay replaces every slot with best-time slots and moves each queued post to the new slot in the same position of its day; posts beyond that count keep their time without a slot. The result says what moved. Undo restores the old times of slots that still exist and re-adds removed ones as new slots; posts that lost their slot are not re-attached. | `channels:write` | reversible write | yes |

#### posts

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `bulk_reschedule` | Moves several drafts or scheduled posts to new times under one confirmation. Each item succeeds or fails on its own and the result says which; drafts stay drafts. | `posts:write` | reversible write | yes |
| `cancel_post` | Stops a scheduled post from publishing by turning it back into a draft. Nothing is deleted. | `posts:write` | reversible write | yes |
| `create_draft` | Saves a draft on one channel of the active social set, with everything the composer takes: text, media, title, categories, platform settings (config), an approval request, evergreen. A draft publishes nothing; it waits in the app until someone schedules it. Needs the member's confirmation unless they allowed drafts. | `posts:write` | reversible write | yes |
| `delete_draft` | Deletes a draft. Undo brings it back as a new draft with the same text, title, media and alt text, categories, platform settings and time. | `posts:write` | reversible write | yes |
| `delete_scheduled_post` | Deletes a scheduled, pending-approval or failed post from Viraly. Irreversible; the member confirms every time. For drafts use delete_draft; to keep a post but stop it, use cancel_post. | `posts:write` | always ask |  |
| `duplicate_post` | Copies a post into a new draft on the same channel or another: its text, title, media with alt text, categories and platform settings; on another platform the settings are rebuilt from the text. Anything given here replaces what is copied. Works for published and failed posts too. | `posts:write` | reversible write | yes |
| `export_posts` | The posts of a date range as CSV text with the app's export columns (Title, Scheduled At, Status, Channel, Platform, Post URL, Image URL, Created By), by scheduled time. Returns the text of up to 100 rows, the total and whether it stopped short; it makes no file, and a PDF or an emailed export exists only in the app. Needs the Influencer plan or above, as the app's export does. | `posts:read` | read |  |
| `find_free_slots` | The empty posting slots of the active social set's channels in a date range, earliest first: each with channel and local time. A slot is empty when no post at all sits at its time on that channel (a queued draft takes it, as in the app's queue and the queue placement); truncated says when more existed than limit. Channels without slots and channels that cannot publish are named. Use it for "fill the empty slots next week". | `posts:read` | read |  |
| `get_calendar` | The calendar of the active social set for a date range: per day, up to 40 posts with id, local time, channel, status, caption start, title, public link, error, media count, categories and the evergreen flag; a day with more says truncated with its total. Use it to see what is planned or where the gaps are. | `posts:read` | read |  |
| `get_post` | One post of the active social set as the app reads it: the text (on X, Threads, Bluesky and Mastodon the first post of the thread; config holds the rest), title, channel, status, local scheduled time, public link, the stored config (the platform settings nested as the composer sends them: title, first comment, board, privacy, thread posts), the attachments with alt text and order, categories, approval state, evergreen flags, the last error with its reason and hint, and summary metrics. queued is the app's flag (the status is scheduled or on the way to publishing); inPostingSlot says whether the post sits in one of the channel's posting slots (a post whose slot was removed stays queued at its time with inPostingSlot false). Hand config back to update_post as config to change a setting. | `posts:read` | read |  |
| `get_post_diagnostics` | Why a post failed or is stuck: the network's error with its reason and hint, the channel's state, whether the post's time has passed while it still waits to publish, the problems the save-time rules find on its stored settings now, and what usually fixes it. | `posts:read` | read |  |
| `get_post_preview` | How a post will appear: the text with its length (on X, Threads, Bluesky and Mastodon the first post, with the whole thread beside it), the placement (post type and system post type), the platform title, first comment, board and link, the media in order with type, dimensions, file size and duration, the local time, and the problems the save-time rules find on its stored settings. | `posts:read` | read |  |
| `list_posts` | Posts of the active social set, 25 per page, latest scheduled first with unscheduled drafts last: id, a short caption, title, channel, status, local scheduled time, media count, categories, approval state and summary metrics. startDate and endDate bound the scheduled date in the social set's timezone (dateField switches to the creation or publish date; a published post the platform import brought in has no stored publish time and counts by its scheduled time, when it went out); hasMore says when another page exists. For one post in full use get_post; for the best performers use list_top_posts; for posts waiting for the member's approval use list_pending_approvals (approvals module), which knows who approves what. | `posts:read` | read |  |
| `move_to_queue` | Puts a draft or scheduled post into its channel's next empty posting slot; it then publishes by itself at that time. | `posts:write` | reversible write | yes |
| `publish_now` | Publishes a draft or scheduled post to the network right now. Irreversible: once on the network Viraly cannot take it back. The member confirms on a card every time. | `posts:write` | always ask |  |
| `reschedule_post` | Moves a draft, scheduled or pending-approval post of the active social set to a new time. A draft keeps its status: it gets the time but stays a draft and does not publish until someone schedules it. Needs the member's confirmation unless they allowed rescheduling. | `posts:write` | reversible write | yes |
| `retry_failed_post` | Tries a failed post again right now. Read get_post (its error) or get_post_diagnostics first: retrying an expired channel or a rejected file fails again. | `posts:write` | always ask |  |
| `schedule_post` | Schedules a post to publish by itself at a time, or in the channel's next queue slot: a new post with everything the composer takes (text, media, title, categories, platform settings, approval, evergreen), or an existing draft. It publishes without anyone pressing a button, so check it with validate_post first. | `posts:write` | reversible write | yes |
| `search_posts` | Finds posts of the active social set by words in their text, newest first, among its latest 2,000 posts. Use it to find "the post about the autumn guide". | `posts:read` | read |  |
| `update_post` | Changes a draft or scheduled post: text, media and alt text, placement, title, categories, platform settings (config: first comment, link card, YouTube or Pinterest title, privacy, board, thread posts), approval, evergreen. What is omitted stays. It keeps its status and time; use reschedule_post for the time. | `posts:write` | reversible write | yes |
| `validate_post` | Checks a post before it is saved or scheduled, with the rules the server applies on save to the settings as they would be stored (caption and title lengths, first comment, board, privacy, media formats, sizes, counts and aspect ratios per platform), plus a channel that cannot publish, a time in the past and the same text already on the channel. An existing post is judged on its stored settings with the given fields laid over them. Returns each problem; saves nothing. | `posts:read` | read |  |

#### categories

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `assign_category` | Adds categories to posts of the active social set, or removes them. A post that already has (or lacks) a category is left as it is; the result lists what changed, and undo reverses only that. | `categories:write` | reversible write | yes |
| `create_category` | Creates a post category for the workspace. | `categories:write` | reversible write | yes |
| `delete_category` | Deletes a post category; posts that had it lose it. The member confirms every time. | `categories:write` | always ask |  |
| `list_categories` | The workspace's post categories (content pillars such as Promotions or Tips) with id, colour, sort order and how many posts use each. | `categories:read` | read |  |
| `update_category` | Renames or recolours a post category. | `categories:write` | reversible write | yes |

#### media

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_collection` | Creates a media library collection (folder) in the active social set. It becomes the first collection, as in the app. | `media:write` | reversible write | yes |
| `delete_media` | Deletes a file from the media library and its storage. Refused while the file is used by a post (remove it from those posts first) and while it is still uploading or processing. The member confirms every time. | `media:write` | always ask |  |
| `get_media` | One file of the media library, any status, as the app's file view shows it: type, status, name, width and height, duration, size, urls, alt text, tags, collection, who added it and when, the source, and the error of a file that failed. Resolves a file that upload_media_from_url, import_media, request_media_render or generate_image made. | `media:read` | read |  |
| `import_media` | Imports a file into the active social set's media library the way the app's import panel does: from a public direct link, a Dropbox direct link or an Unsplash photo id. The server checks the link at once and refuses a dead, oversized or unsupported one with the reason; the download then runs in the background. The result names the file (mediaId) and the job; get_media on the file says when it is Completed, or why it Failed. | `media:write` | reversible write | yes |
| `list_media` | Finished files in one media library collection of the active social set, favourites first then newest first, with the same filters as the app: id, type, status, name, width and height, duration, size, urls, alt text, tags. hasMore and nextCursor page it. Use the ids as mediaIds in posts. | `media:read` | read |  |
| `list_media_collections` | The media library's collections (folders) of the active social set as the app lists them, with how many files each holds, its tags and notes. | `media:read` | read |  |
| `move_media` | Moves files to another collection of the same social set. Every id must be in this set's library; the files' tags are left as they are, as in the app. | `media:write` | reversible write | yes |
| `request_media_render` | Makes an edited copy of a library VIDEO on the server, as the app's media editor does: a centred crop to an aspect ratio, a trim to one range of seconds, or both. Images cannot be edited this way (the renderer takes video only). The original stays; the copy is a new file in the original's collection that starts Uploading and becomes Completed when the render finishes (get_media on mediaId). Undo cancels a running render or removes the finished copy. | `media:write` | reversible write | yes |
| `search_media` | Searches every collection of the active social set's media library at once by file name or alt text, and by tags with the tags filter; finished files only, favourites first then newest. hasMore and nextCursor page it. | `media:read` | read |  |
| `update_alt_text` | Sets a library file's alt text (its notes in the library, shown in the app's file view). Posts carry their own alt text per file, and that is what reaches the networks: give postId to set it on a post that carries the file; without postId no post changes. generate_alt_text drafts the text. | `media:write` | reversible write | yes |
| `upload_media_from_url` | Adds a file to the active social set's media library from a public link, as the composer's import by link does: the server downloads it into the collection, then measures it. A photo comes back Completed (ready to post) within a few seconds; a video comes back Uploading or Processing and get_media says when it is ready. The same link sent twice in one run makes one file. | `media:write` | reversible write | yes |

#### hashtags

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_hashtag_list` | Saves a hashtag list in the active social set for the composer. | `hashtags:write` | reversible write | yes |
| `delete_hashtag_list` | Deletes a saved hashtag list. The member confirms every time. | `hashtags:write` | always ask |  |
| `generate_hashtags` | Suggests hashtags for a topic with the composer's hashtag generator (its field takes up to 512 characters): the tags as a list, plus the generator's own text with its groupings. Nothing is saved. | `posts:write` | read |  |
| `get_hashtag_list` | One saved hashtag list in full. | `hashtags:read` | read |  |
| `list_hashtag_lists` | The saved hashtag lists of the active social set, newest first: id, topic, the hashtags in full and when each was made. At most 100; truncated says when there are more. | `hashtags:read` | read |  |
| `update_hashtag_list` | Changes a saved hashtag list's topic or hashtags. | `hashtags:write` | reversible write | yes |

#### analytics

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `compare_periods` | Compares two date ranges of published posts in the active social set, one channel or one platform, over every post of each range: posts, the app's universal totals (engagement = likes + comments + shares + clicks, impressions, reach, likes, comments, shares, clicks, video views) and the change in percent from the first to the second. Only posts with collected metrics count; YouTube posts carry no engagement. Use it for "this month against last month". | `analytics:read` | read |  |
| `export_analytics_csv` | One channel's post metrics of a date range as CSV text with the app's export columns (ID, External ID, Published At in the set's timezone, Content, Post URL, Image URL, then the platform's metric columns), oldest first. Returns the text of up to 100 rows, the total and whether it stopped short; it makes no file, and the PDF report exists only in the app. Needs the Influencer plan or above, as the app's export does. | `analytics:read` | read |  |
| `get_best_times` | When the active social set's published posts did best: the average engagement rate (or engagement) by weekday, by local hour and by weekday and three-hour window over every post of the window, with how many posts each figure rests on. Posts without impressions have no rate; YouTube posts are left out (not YouTube's own figures). A hint, not a rule: set_posting_slots sets the slots. | `analytics:read` | read |  |
| `get_category_analytics` | How post categories performed in the active social set over a date range, with the app's category analytics: per category (or combined) the posts, the universal totals (impressions, reach, likes, comments, shares, clicks, video views, engagement = likes + comments + shares + clicks, engagement rate) and the breakdown per platform. Engagement is null where only YouTube contributes. Unknown category ids are listed, not fatal. | `analytics:read` | read |  |
| `get_channel_analytics` | A channel's performance in a date range: every published post of the range summed with the app's universal metrics, plus the account's own numbers as the app's analytics page shows them: Facebook and Instagram with the previous period (reach, views, engaged accounts, follows, Instagram followers), LinkedIn follower gains and page views, YouTube channel totals (views, watch time, subscribers), Threads totals and followers, the Pinterest account report, and the TikTok, X, Bluesky and Mastodon follower counts. A network that does not answer leaves accountError set and the post totals stand. A start date before the plan's analytics retention is moved up to it. | `analytics:read` | read |  |
| `get_post_analytics` | What one post of the active social set did: the flattened metrics (reach, impressions, views, likes, comments, shares, saves, clicks; null where the platform reports none), the network's own metric object as the app's post view shows it, the link to the live post, and when the numbers were last updated. Engagement is null for YouTube (not a YouTube figure). | `analytics:read` | read |  |
| `get_post_insights` | The published posts of one channel in a date range with their metrics, as the app's posts table lists them: newest first, sorted by any of the platform's own metrics, or ranked over the whole range by engagement, reach or views; paged, with the total, the flattened and the native metrics, the post type and thumbnail per post. A start date before the plan's analytics retention is moved up to it. | `analytics:read` | read |  |
| `list_top_posts` | The best (or worst) published posts of the active social set in a date range, ranked over every post of the range in the app's own order (engagement = likes + comments + shares + clicks; engagement rate = engagement over impressions), paged, with the total. YouTube posts are left out of a ranking by engagement or engagement rate (not YouTube's own figures). A start date before the plan's analytics retention is moved up to it. Use it for "what was my best post this week". | `analytics:read` | read |  |
| `trigger_analytics_sync` | Asks the network for a channel's latest numbers now instead of waiting for the next scheduled fetch, as the app's refresh button does. It runs in the background for a few minutes; a refresh started in the last 30 minutes is reported as still running and not started again. Returns when the refresh started and when the numbers were last fetched. | `analytics:read` | reversible write |  |

#### ai

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `generate_alt_text` | Looks at an image in the media library (a video's poster for a video) and drafts alt text for it within the platform's composer limit, in a language, shortening up to twice when the draft is over; fitsLimit says whether it fits. Returns text; update_alt_text with the postId saves it on the post, where the networks read it. | `posts:write` | read |  |
| `generate_caption` | Writes or reworks a caption with the composer's AI assistant: new from a topic, or rephrased, shortened, expanded, more casual or more formal, in a tone, for a platform. Returns text only; nothing is saved. No hashtags are written (generate_hashtags does that). | `posts:write` | read |  |
| `generate_image` | Generates an image with the app's image model and saves it in the active social set's media library (list_media, get_media and the post tools' mediaIds see it). It counts against the plan's monthly image allowance, so the member confirms it; deleting the image afterwards does not give the allowance back. In the app the call returns the image (about a minute). Through an API connection it returns a job at once instead, because the generation outlasts the connection's timeout: resolve it with get_image_generation. | `posts:write` | reversible write | yes |
| `generate_link_title` | Writes a short headline (3 to 8 words) for a bio link button, from a caption, an image, or both, with the generator the bio link's automatic titles use. Returns text only. | `posts:write` | read |  |
| `generate_variations` | Writes alternative versions of a caption with the composer's variation generator (their native home is a post's evergreenSettings.variations; also A/B tests or the same news on several days). Returns text only. | `posts:write` | read |  |
| `get_image_generation` | The state of an image generation started by generate_image: Pending, Running, Succeeded with the mediaId of the image in the media library, or Failed with the reason. Nothing is charged for a failed one. | `media:read` | read |  |
| `rewrite_for_channel` | Rewrites a caption for another platform's style with the composer's Rephrase, then checks it against that platform's caption limit (Bluesky 300, X 280, Threads and Mastodon 500, Pinterest 800, Instagram and TikTok 2200, LinkedIn 3000, Facebook and YouTube 5000) and shortens up to twice when it is over; fitsLimit says whether it fits. Returns text only. | `posts:write` | read |  |

#### inbox

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_comment_rule` | Creates a comment rule on a post of the active social set: when a new comment matches the conditions, the inbox replies publicly, sends a DM to the commenter, or hides the comment, with fixed texts or an optional model step; exclusions say which comments it leaves alone. Replies go out without anyone pressing a button, so the member confirms every time. Needs the Influencer plan or higher and a platform whose inbox can reply (the post's channel must have its inbox switched on for comments to arrive). | `comment_rules:write` | always ask |  |
| `delete_comment_rule` | Deletes a comment rule of the active social set, as the app's DELETE does: it stops replying at once and its activity log stays. Irreversible; the member confirms every time. To stop a rule for a while, use pause_comment_rule. | `comment_rules:write` | always ask |  |
| `get_comment_rule_activity` | What a comment rule, or a post's rules, did: totals by status and skip reason, and the recent replies, DMs and hides with the text we sent. Commenters' own text is not included. | `comment_rules:read` | read |  |
| `list_comment_rules` | The comment rules of the active social set, or of one post: id, post (and whether that post was deleted), what triggers them, what they do, the exclusions, delays and cap, status and what they did in the last 30 days. | `comment_rules:read` | read |  |
| `pause_comment_rule` | Pauses a comment rule, or every rule of a post, so no more replies go out; or resumes them. Undo puts the rules back as they were. | `comment_rules:write` | reversible write | yes |

#### bio_links

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `add_block` | Adds an item to a bio page: a link button, a social icon, a featured video, a grid tile, a tip button, a product or an RSS feed, with the fields the editor has for it. Its section is added to the page after the existing ones when it is new. The email form, the auto-add posts section and the contact card are set with update_bio_page or in the editor. | `biolinks:write` | reversible write | yes |
| `create_bio_page` | Creates a link-in-bio page in the active social set, as the app's editor would: profile name and bio, the design (a preset or its own colours, fonts and buttons; the app's default when omitted), profile picture, branding, and optionally the first links and social icons; more blocks with add_block. The page is public at its URL as soon as it exists; the plan's page limit applies. | `biolinks:write` | reversible write | yes |
| `delete_bio_page` | Deletes a bio page with its custom domain; its URL stops working. The member confirms every time. | `biolinks:write` | always ask |  |
| `export_subscribers` | A bio page's subscribers as CSV text with the app's columns (Email, Name, Phone, Subscribed On), newest first, with the app's search and date filters; up to maxRows rows (default 1,000) and truncated when more exist. Returns text, not a file. Needs the Influencer plan or above, as the app's export does. | `subscribers:read` | read |  |
| `get_bio_analytics` | A bio page's traffic over a period, the numbers of the app's analytics tab: overview (views, unique visitors, clicks, click-through rate, sessions, average session length, bounce rate, scroll depth), every link's clicks and click-through rate, the daily series, countries and cities, devices, browsers, referrers and UTM campaigns, and activity by hour and weekday. | `biolinks:read` | read |  |
| `get_bio_page` | One bio page as the editor shows it: URL and domain, profile (title, bio, image), theme, sections in order, every content list with item ids for update_block and remove_block (links, social icons, media, grid, tipping, products, RSS feeds), the email form and its integration, pixels, settings, contact card, auto-add limit and linked channels. | `biolinks:read` | read |  |
| `get_custom_domain` | A bio page's custom domain and its live status (checked with the hosting now unless it is already AVAILABLE), with the DNS records the member still has to add at their registrar. Statuses: CREATING, REQUESTING_CERTIFICATE, PENDING_VERIFICATION, PENDING_DEPLOYMENT, AVAILABLE, FAILED. | `biolinks:read` | read |  |
| `list_bio_integrations` | The email and CRM integrations (for example Mailchimp, HubSpot, Kit) connected to the active social set that a bio page's email form can send new subscribers to; update_bio_page emailIntegrationId attaches one. Pixel and tag integrations are not listed; those are set per page with pixelTracking. | `biolinks:read` | read |  |
| `list_bio_pages` | The link-in-bio pages of the active social set: id, title, slug, public URL, custom domain with its status (the domain serves the page only when AVAILABLE), auto-add limit and dates. | `biolinks:read` | read |  |
| `list_subscribers` | People who signed up on a bio page's email form, newest first: id, name, email, phone and when; paged (page, pageSize), with the total and hasMore, and the app's search and date filters. | `subscribers:read` | read |  |
| `remove_block` | Removes an item (link, social icon, video, grid tile, tip button, product or RSS feed) from a bio page; a section left empty disappears from the page, as in the editor. | `biolinks:write` | reversible write | yes |
| `remove_custom_domain` | Releases a bio page's custom domain: the page serves from its Viraly URL (get_bio_page url) again and the domain's certificate is dropped; requesting it again starts verification over. The member confirms every time. | `biolinks:write` | always ask |  |
| `request_custom_domain` | Starts serving a bio page on the member's own domain (Enterprise plan only, as in the app). It returns the DNS records the member must add at their registrar; get_custom_domain checks the status, and the domain serves the page once AVAILABLE. A page has one domain; remove_custom_domain releases it. | `biolinks:write` | reversible write | yes |
| `update_bio_page` | Changes a bio page's profile (name, bio, picture), URL slug, design (preset, colours, fonts, buttons, background), branding, auto-add limit, tracking pixels, contact card or email integration; what is not given stays. Blocks are changed with add_block, update_block and remove_block; the email form's texts and the auto-add channel settings are edited in the app. | `biolinks:write` | reversible write | yes |
| `update_block` | Changes an item of a bio page (a link, social icon, video, grid tile, tip button, product or RSS feed): its text, URL, image, colour, platform, product or feed fields, or its position in its list. What is not given stays. | `biolinks:write` | reversible write | yes |

#### short_links

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_short_link` | Shortens a URL with the workspace's default shortener (or the one given) and returns the short URL to put in a caption. A link not used in a post is switched off 24 hours later: pass its id as shortenedUrlIds to create_draft, schedule_post or update_post, or give postId here. An existing active link for the same URL is returned instead of a new one (reused: true) and cannot be undone away. | `url_shortener:write` | reversible write | yes |
| `delete_short_link` | Deletes a short link from Viraly with its click history and post associations. A Viraly link stops resolving, including in posts already published; a Bitly, Dub or Rebrandly link keeps resolving at the provider. The member confirms every time. | `url_shortener:write` | always ask |  |
| `get_short_link_stats` | Clicks on one short link: total, by day (last 60), by country, city, device and operating system, and the posts that carry it. Clicks are counted through Viraly's redirect, so a Bitly, Dub or Rebrandly link shows the clicks that provider reports to nobody: 0 here. | `url_shortener:read` | read |  |
| `get_shortener_settings` | Which shortener the workspace uses by default (Viraly's own, Bitly, Dub or Rebrandly), which providers are connected with their default domain, and which one and which domain new links are made with: a default that is not connected falls back to Viraly's own. | `url_shortener:read` | read |  |
| `get_url_preview` | What a link shows when shared: its page title, description, site and image. | `url_shortener:read` | read |  |
| `list_short_links` | The workspace's active short links, newest first: id, short URL, original URL, clicks and the shortener that made it; paged, with the total and hasMore. | `url_shortener:read` | read |  |
| `set_default_shortener` | Chooses which connected shortener the workspace makes links with by default, and for Bitly, Dub or Rebrandly the domain they are made on. | `url_shortener:write` | reversible write | yes |

#### ideas

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_draft_from_idea` | Turns an idea into a draft on a channel as the app's composer does: the idea's caption as the text (its title when the caption is empty), its title as the post title and the Pinterest, YouTube, TikTok or LinkedIn document title, its tags as the post's categories, and its media attached. The idea is marked Scheduled, as in the app. | `posts:write` | reversible write | yes |
| `create_idea` | Saves an idea on a board of the active social set, with its text, planned date, media and tags, at the top of the board as the app does. | `ideas:write` | reversible write | yes |
| `delete_idea` | Deletes an idea. Undo saves it again on its board with its text, date, media, tags, status and position, under a new id (the app has no undo; the idea.created webhook fires again). | `ideas:write` | reversible write | yes |
| `generate_ideas` | Suggests one post idea (two to four sentences) for a business and audience with the app's idea generator; call it again for another. Returns text; create_idea saves the ones the member likes. | `posts:write` | read |  |
| `list_idea_boards` | The idea boards of the active social set (id, name, description, colour, order) with how many ideas each holds. A set with no boards gets the app's four default boards on the first call. | `ideas:read` | read |  |
| `list_ideas` | The ideas on one board in the board's order, or the ideas planned in a date range across the set's boards: id, title, caption, notes, link, planned date, status, order, tags and media ids; paged, with the total and hasMore. | `ideas:read` | read |  |
| `update_idea` | Changes an idea's title, caption, notes, link, status, planned date, board, media, tags or position; what is not given stays, and clear removes a caption, notes, link or date. | `ideas:write` | reversible write | yes |

#### feeds

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_draft_from_feed_item` | Drafts a post sharing a feed item on a channel, prefilled as the app's Create post does (title, summary and link; no image), and marks the item used unless told not to. | `posts:write` | reversible write | yes |
| `list_feed_items` | The items of a feed, newest first: id, title, link, summary, image, published date and whether they were used; paged, with the total and hasMore. | `feeds:read` | read |  |
| `list_feeds` | The RSS and Atom feeds the active social set follows: id, name, URL, description, collection, status, unread and item counts, last fetch and fetch error; optionally one status or one collection. | `feeds:read` | read |  |
| `subscribe_feed` | Follows an RSS or Atom feed in the active social set so its items appear in Feeds, as the app's add dialog does: the feed is fetched and parsed first and refused when it cannot be read. | `feeds:write` | reversible write | yes |
| `unsubscribe_feed` | Stops following a feed and removes its items. Undo follows it again with its name, description and collection; its items are fetched afresh and their read states start over. | `feeds:write` | reversible write | yes |

#### approvals

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `list_pending_approvals` | Posts of the active social set in the approval workflow, as the app's approvals page lists them: by default the ones waiting for this member to approve. Each with its approval: who asked and when, the rule (all must approve, or N of M), every approver's decision with its time and comment (a rejection's reason), and whether it is resolved. Paged; hasMore says when there is another page. | `posts:read` | read |  |
| `list_post_comments` | The team's internal comments on a post (not comments from the network), oldest first, as the post's comment thread shows them: who wrote each, its full text (up to 5,000 characters), when it was edited, the members mentioned in it and its attachments. | `posts:read` | read |  |

#### evergreen

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_evergreen_schedule` | Makes a post evergreen, as the composer's Recycle does: Viraly schedules copies of it every so many days from the post's own time (or at chosen times), until a count or an end date, rotating the caption variations. The copies are generated at once and publish by themselves; nothing extends the series later. Not for YouTube or TikTok posts (the app skips them) or for a recycled copy. A post that is already evergreen is changed with update_evergreen_schedule. | `posts:write` | reversible write | yes |
| `list_evergreen_schedules` | The evergreen schedules of the active social set, as the Recycled content page lists them: the post, every how many days (0 with customDatesLocal), the caption variations, the limit and end date, whether paused, and the copies (generated so far, scheduled, published, drafts; the original is not counted). Paged; hasMore says when there is another page. | `posts:read` | read |  |
| `list_recycled_content` | The copies of an evergreen post, earliest first: published ones and the ones still scheduled or drafted, each with its local time and status. The original post is named apart, not counted as a copy. Paged; hasMore says when there is another page. | `posts:read` | read |  |
| `pause_evergreen_schedule` | Pauses an evergreen schedule, as the Recycled content page does: every unpublished copy (and the original, if not yet published) becomes a draft and nothing publishes. Resume schedules the copies with a future time again, deletes the copies whose time passed while paused, and keeps as drafts those whose media is not usable. Neither makes new copies. | `posts:write` | reversible write | yes |
| `update_evergreen_schedule` | Changes an evergreen schedule as the Recycled content page's edit dialog does: the interval or the copy times, the limit or end date, the caption variations. What is omitted stays as it is. A new interval or new times delete the scheduled copies and make them again from the post's time; a lower limit removes the latest copies; a higher one adds none. Undo puts the whole schedule back. | `posts:write` | reversible write | yes |
<!-- tools:end -->

## OAuth scopes reference

When your assistant connects, it asks for a set of scopes. You can grant a subset; the assistant will get scope-error responses for tools that need anything you withheld.

| Scope | Grants |
|---|---|
| `posts:read` | List/get posts and their metadata |
| `posts:write` | Schedule, create, update, reschedule, publish, cancel posts; AI generation |
| `channels:read` | List channels, channel stats |
| `channels:write` | Disconnect channels, trigger analytics sync |
| `analytics:read` | Post + channel analytics, insights, CSV export |
| `media:read` | List media library |
| `media:write` | Upload media, generate AI images |
| `social_sets:read` | List social sets |
| `social_sets:write` | Update social-set timezone |
| `categories:read` | List categories |
| `hashtags:read` | List hashtag groups |
| `biolinks:read` | List bio-link pages |
| `subscribers:read` | List bio-link subscribers |
| `workspace:read` | Workspace name, plan, status |

Revoke at any time from **Settings → Connected Apps** in the Viraly SPA.

---

## Self-hosting

The hosted endpoint at `mcp.viraly.io` is what every consumer should use. This section is for users who want to run their own copy (security audits, air-gapped corporate deployments, dev work on the server itself).

```bash
git clone https://github.com/viraly-io/viraly-mcp-server.git
cd viraly-mcp-server
npm install
npm run build

VIRALY_API_ORIGIN=https://api.viraly.io \
VIRALY_OAUTH_ISSUER=https://api.viraly.io \
MCP_PUBLIC_ORIGIN=https://localhost:8080 \
MCP_TRANSPORT=http \
PORT=8080 \
npm start
```

For stdio mode (single-user CLI tools that already have a `vat_*` access token):

```bash
VIRALY_ACCESS_TOKEN=vat_yourtoken \
MCP_TRANSPORT=stdio \
node dist/server.js
```

### Environment variables

| Var | Default | Notes |
|---|---|---|
| `MCP_TRANSPORT` | `http` | `http` (Streamable HTTP) or `stdio` |
| `PORT` | `8080` | HTTP transport only |
| `VIRALY_API_ORIGIN` | `https://api.viraly.io` | Upstream Platform API |
| `VIRALY_OAUTH_ISSUER` | (= `VIRALY_API_ORIGIN`) | Issuer URL for OAuth metadata |
| `MCP_PUBLIC_ORIGIN` | `https://mcp.viraly.io` | This server's public URL |
| `MCP_CORS_ORIGINS` | (empty) | Comma-separated allowed origins |
| `LOG_LEVEL` | `info` | pino level |
| `MCP_RATE_LIMIT_PER_MINUTE` | `300` | Per-token cap |
| `MCP_METRICS_TOKEN` | (none) | If set, `/metrics` requires `Authorization: Bearer <token>` |
| `VIRALY_ACCESS_TOKEN` | (none) | stdio transport only |

### HTTP endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | none | Liveness probe |
| GET | `/metrics` | optional bearer | Prometheus exposition |
| GET | `/.well-known/oauth-protected-resource` | none | [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) |
| POST | `/mcp` | Bearer `vat_*` | MCP JSON-RPC |
| GET | `/mcp` | Bearer `vat_*` | SSE event stream |
| DELETE | `/mcp` | Bearer `vat_*` | Session termination |

---

## Architecture

```
MCP client  ──OAuth 2.1 + PKCE──▶  Viraly .NET API  (api.viraly.io)
     │                                    ▲
     │                                    │ Bearer vat_* (forwarded)
     │  Streamable HTTP / stdio           │
     └─▶  Viraly MCP server  (mcp.viraly.io)
              ├─ Tool registry (read + write)
              ├─ OAuth resource-server middleware
              └─ Pass-through to Platform API (/api/platforms/*)
```

The server is a thin proxy that exposes LLM-friendly tool schemas. Authentication and authorization are delegated to the Viraly API — every tool call forwards the user's `vat_*` access token upstream and lets the API enforce scopes and plan limits exactly as it does for the SPA. There's no shared key, no privileged service account, and no way for one user's tokens to access another tenant's data.

### Repo layout

```
src/
  server.ts              entry point
  config.ts              env-var loading + validation
  auth/
    middleware.ts        Bearer-token auth for HTTP transport
    token-context.ts     AsyncLocalStorage for per-request token
  api/
    viraly-client.ts     Platform API client (typed)
    errors.ts            error taxonomy
  tools/
    registry.ts          the generated adapter: tools/list and tools/call from the API registry
    idempotency.ts       stable idempotency key per call
  transport/
    http.ts              Streamable HTTP transport
    stdio.ts             stdio transport
  observability/
    logger.ts            pino logger (auth headers redacted)
    metrics.ts           prom-client metrics
tools-catalog.json       export of the API's tool registry (source of the README tool list)
scripts/
  generate-readme.mjs    rewrites the README tool list from tools-catalog.json
```

#### Keeping the catalog current

Run the API test `AgentToolCatalogDump` (viraly-api, `Viraly.Services.Tests/Copilot/AgentToolCatalogDump.cs`) with `COPILOT_CATALOG_OUT=<path>`, copy `<path>.json` to `tools-catalog.json` here, then run `npm run readme`. CI runs `npm run readme:check` and fails when the README is behind the catalog.

---

## Troubleshooting

**Browser shows "ruffled feathers" / generic error after sign-in.**
You may be on a stale SPA bundle — hard-refresh `app.viraly.io` (Cmd-Shift-R / Ctrl-Shift-R) and retry the OAuth flow.

**Tool returns "Plan limit reached".**
You hit a quota gate (e.g. `generate_image` on Free plan). Upgrade at [viraly.io/pricing](https://viraly.io/pricing) or pick a tool that doesn't require the gated capability.

**Tool returns "additional permission" / scope error.**
The original consent didn't grant the scope this tool needs. Open **Settings → Connected Apps**, revoke, then re-add the connector and grant the missing scope.

**`MODEL_VALIDATION_FAILED` from any tool.**
File an issue with the tool name and (redacted) input — that error means the MCP server's request shape is out of sync with the API. We try to catch these in CI but the surface is large.

**Token expired.**
Most clients auto-refresh. If yours doesn't, reconnect — the OAuth flow only takes a few seconds.

---

## Security

See [`SECURITY.md`](SECURITY.md) for the disclosure policy and the threat model.

Highlights:
- OAuth 2.1 + PKCE; no shared keys, no service accounts.
- Per-tool scopes + plan-tier checks enforced by the Viraly API, not by this server.
- Authorization headers and OAuth tokens are redacted in logs.
- All container deploys are pinned by SHA, not tag, in CI.

---

## License

MIT — see [`LICENSE`](LICENSE).

---

## Links

- [Viraly](https://viraly.io)
- [Viraly Docs (full REST API)](https://viraly.io/docs)
- [Pricing](https://viraly.io/pricing) — MCP is included on every plan
- [Model Context Protocol spec](https://modelcontextprotocol.io)
