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
121 tools in the registry, catalog last changed 2026-10-31.

#### workspace

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `get_workspace` | The workspace and the active social set: names, plan, timezone and how many channels are connected. Use it for questions about the account itself. For the workspace's settings (notifications, API keys, connected apps, webhooks, Slack, Teams, Discord) use get_workspace_settings and its neighbours in the settings module. | `workspace:read` | read |  |
| `get_workspace_brief` | The brief the members wrote for Copilot: brand voice, audience, do and don't lists, posting rules. The social set's own brief when it has one, otherwise the workspace's. | `workspace:read` | read |  |
| `list_social_sets` | The social sets this member can open, with name, short code and timezone, and which one is active. Tools work on the active set; to act on another one the member named, pass its id as socialSetId. | `social_sets:read` | read |  |
| `list_timezones` | Timezone ids the app accepts, for setting a social set's timezone. Filter with search; at most 50 come back. | `workspace:read` | read |  |
| `update_workspace_brief` | Replaces the brief Copilot reads on every request (brand voice, audience, rules), for the whole workspace or this social set only. Show the member the new text; it replaces the old one. | `social_sets:write` | reversible write | yes |

#### social_sets

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_social_set` | Creates a new, empty social set (a brand or client with its own channels, calendar and timezone). Channels are connected to it in the app afterwards. | `social_sets:write` | reversible write | yes |
| `delete_social_set` | Deletes a social set with all its channels, posts and inbox history. Irreversible; the member confirms on a card every time. | `social_sets:write` | always ask |  |
| `get_social_set` | The active social set in detail: name, short code, colour, timezone and each connected channel with its status. | `social_sets:read` | read |  |
| `update_social_set` | Renames the active social set or changes its timezone. | `social_sets:write` | reversible write | yes |

#### channels

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `disconnect_channel` | Disconnects a channel from Viraly: its scheduled posts and inbox history are removed. Irreversible; the member confirms on a card every time. | `channels:write` | always ask |  |
| `get_channel` | One channel in detail: platform, account type, status and why (an expired token, a locked channel over the plan's limit), when its token was last refreshed, its posting slots and how many posts it has. | `channels:read` | read |  |
| `get_media_requirements` | Each platform's rules for media and text: formats, file sizes, aspect ratios, video lengths, how many files, caption length and hashtag limits. Check them before drafting; validate_post checks a concrete post. | `channels:read` | read |  |
| `get_posting_slots` | The weekly posting slots of each channel (day and local time) that the queue fills. find_free_slots says which of them are empty on given dates. | `channels:read` | read |  |
| `get_reconnect_link` | Where the member reconnects an expired or broken channel. Reconnecting needs the member to sign in to the network themselves, so Copilot cannot do it; it can open the page with navigate. | `channels:read` | read |  |
| `list_channels` | The connected accounts and pages of the active social set: id, name, username, platform and status (Active, Expired, Disabled, Locked). Use it to turn a channel name into its id. | `channels:read` | read |  |
| `list_pinterest_boards` | The boards of a Pinterest channel, with their ids. A pin needs a board. | `channels:read` | read |  |
| `set_posting_slots` | Replaces one channel's weekly posting slots. Queued posts move to the new slots as the app does when slots are edited. | `channels:write` | reversible write | yes |

#### posts

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `bulk_reschedule` | Moves several drafts or scheduled posts to new times under one confirmation. Each item succeeds or fails on its own and the result says which; drafts stay drafts. | `posts:write` | reversible write | yes |
| `cancel_post` | Stops a scheduled post from publishing by turning it back into a draft. Nothing is deleted. | `posts:write` | reversible write | yes |
| `create_draft` | Saves a draft on one channel of the active social set. A draft publishes nothing; it waits in the app until someone schedules it. Needs the member's confirmation unless they allowed drafts. | `posts:write` | reversible write | yes |
| `delete_draft` | Deletes a draft. Undo brings it back as a new draft with the same text, media and time. | `posts:write` | reversible write | yes |
| `delete_scheduled_post` | Deletes a scheduled, pending-approval or failed post from Viraly. Irreversible; the member confirms every time. For drafts use delete_draft; to keep a post but stop it, use cancel_post. | `posts:write` | always ask |  |
| `duplicate_post` | Copies a post's text and media into a new draft, on the same channel or another. Works for published and failed posts too. | `posts:write` | reversible write | yes |
| `export_posts` | The posts of a date range as CSV text (date, channel, status, title, link), up to 100 rows. Hand the text to download_file to give the member a file. | `posts:read` | read |  |
| `find_free_slots` | The empty posting slots of the active social set's channels in a date range, earliest first: each with channel and local time. A slot is empty when no scheduled post sits in it. Use it for "fill the empty slots next week". | `posts:read` | read |  |
| `get_calendar` | The calendar of the active social set for a date range: every post per day with its local time, channel, status and caption start. Use it to see what is planned or where the gaps are. | `posts:read` | read |  |
| `get_post` | One post of the active social set: the full caption, channel, status, local scheduled time, public link, last error and summary metrics. | `posts:read` | read |  |
| `get_post_diagnostics` | Why a post failed or is stuck: the network's error with its reason and hint, the channel's state, and what usually fixes it. | `posts:read` | read |  |
| `get_post_preview` | How a post will appear: the full text with its length against the platform's limit, the media in order with type and size, the placement and the local time. | `posts:read` | read |  |
| `list_posts` | Posts of the active social set, 25 per page, latest scheduled first: id, a short caption, channel, status, local scheduled time and summary metrics. For one post in full use get_post; for the best performers use list_top_posts; for posts waiting for the member's approval use list_pending_approvals (approvals module), which knows who approves what. | `posts:read` | read |  |
| `move_to_queue` | Puts a draft or scheduled post into its channel's next empty posting slot; it then publishes by itself at that time. | `posts:write` | reversible write | yes |
| `publish_now` | Publishes a draft or scheduled post to the network right now. Irreversible: once on the network Viraly cannot take it back. The member confirms on a card every time. | `posts:write` | always ask |  |
| `reschedule_post` | Moves a draft, scheduled or pending-approval post of the active social set to a new time. A draft keeps its status: it gets the time but stays a draft and does not publish until someone schedules it. Needs the member's confirmation unless they allowed rescheduling. | `posts:write` | reversible write | yes |
| `retry_failed_post` | Tries a failed post again right now. Read get_post (its error) or get_post_diagnostics first: retrying an expired channel or a rejected file fails again. | `posts:write` | always ask |  |
| `schedule_post` | Schedules a post to publish by itself at a time, or in the channel's next queue slot: a new post, or an existing draft. It publishes without anyone pressing a button, so check it with validate_post first. | `posts:write` | reversible write | yes |
| `search_posts` | Finds posts of the active social set by words in their text, newest first, among its latest 2,000 posts. Use it to find "the post about the autumn guide". | `posts:read` | read |  |
| `update_post` | Changes the text, media or placement of a draft or scheduled post. It keeps its status and time; use reschedule_post for the time. | `posts:write` | reversible write | yes |
| `validate_post` | Checks a post before it is saved or scheduled, with the same rules the app enforces: caption length, media formats, sizes, counts and aspect ratios per platform, plus a channel that cannot publish, a time in the past and the same text already on the channel. Returns each problem; saves nothing. | `posts:read` | read |  |

#### categories

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `assign_category` | Adds categories to posts of the active social set, or removes them. | `categories:write` | reversible write | yes |
| `create_category` | Creates a post category for the workspace. | `categories:write` | reversible write | yes |
| `delete_category` | Deletes a post category; posts that had it lose it. The member confirms every time. | `categories:write` | always ask |  |
| `list_categories` | The workspace's post categories (content pillars such as Promotions or Tips) with id, colour and how many posts use each. | `categories:read` | read |  |
| `update_category` | Renames or recolours a post category. | `categories:write` | reversible write | yes |

#### media

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_collection` | Creates a media library collection (folder) in the active social set. | `media:write` | reversible write | yes |
| `delete_media` | Removes a file from the media library. Posts that already carry it keep it. The member confirms every time. | `media:write` | always ask |  |
| `get_media` | One file of the media library: type, status, size, duration, alt text, tags and collection. | `media:read` | read |  |
| `import_media` | Imports a file from Dropbox or Unsplash into the active social set's media library. It runs in the background; the result gives the job's state. | `media:write` | reversible write |  |
| `list_media` | Files in one media library collection of the active social set, 25 per page, newest first: id, type, size, alt text and tags. Use the ids as mediaIds in posts. | `media:read` | read |  |
| `list_media_collections` | The media library's collections (folders) in the active social set, with how many files each holds. | `media:read` | read |  |
| `move_media` | Moves files to another collection of the same social set. | `media:write` | reversible write | yes |
| `request_media_render` | Makes an edited copy of a library file on the server: a centred crop to an aspect ratio, a video trim, or both. The original stays; the copy appears in the library when the render finishes. | `media:write` | reversible write | yes |
| `search_media` | Searches every collection of the active social set's media library by file name, alt text or tag; at most 25 results. | `media:read` | read |  |
| `update_alt_text` | Sets a library file's alt text, which posts carry to the networks that support it. generate_alt_text drafts one. | `media:write` | reversible write | yes |
| `upload_media_from_url` | Adds a file to the active social set's media library from a public link. The server downloads and measures it; the result says when it is ready to post. | `media:write` | reversible write | yes |

#### hashtags

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_hashtag_list` | Saves a hashtag list in the active social set for the composer. | `hashtags:write` | reversible write | yes |
| `delete_hashtag_list` | Deletes a saved hashtag list. The member confirms every time. | `hashtags:write` | always ask |  |
| `generate_hashtags` | Suggests hashtags for a post with the composer's hashtag generator. Returns text only. | `hashtags:read` | read |  |
| `get_hashtag_list` | One saved hashtag list in full. | `hashtags:read` | read |  |
| `list_hashtag_lists` | The saved hashtag lists of the active social set: id, topic and the hashtags. | `hashtags:read` | read |  |
| `update_hashtag_list` | Changes a saved hashtag list's topic or hashtags. | `hashtags:write` | reversible write | yes |

#### analytics

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `compare_periods` | Compares two date ranges of published posts in the active social set, or one channel: posts, engagement, reach, views and the change in percent. Use it for "this month against last month". | `analytics:read` | read |  |
| `export_analytics_csv` | Post metrics of a date range as CSV text, one row per published post, up to 100 rows. Hand it to download_file for a file. | `analytics:read` | read |  |
| `get_best_times` | When the active social set's published posts did best: average engagement by weekday and by local hour over a look-back window, with how many posts each figure rests on. | `analytics:read` | read |  |
| `get_category_analytics` | How each post category performed in the active social set over a date range: posts, reach, impressions, engagement and engagement rate per category, for comparing content pillars. | `analytics:read` | read |  |
| `get_channel_analytics` | A channel's performance in a date range: the posts published and their summed metrics on every platform, plus the account's own numbers (followers, reach, engagement) with the previous period of equal length on Facebook and Instagram. | `analytics:read` | read |  |
| `get_post_analytics` | What one post of the active social set did: reach, impressions, views, likes, comments, shares, saves, clicks and when the numbers were last updated. | `analytics:read` | read |  |
| `get_post_insights` | The published posts of one channel since a date with their metrics, newest first or ranked by engagement, reach or views. | `analytics:read` | read |  |
| `list_top_posts` | The best performing published posts of the active social set in a date range, across its channels, with summary metrics. Use it for questions like "what was my best post this week". | `analytics:read` | read |  |
| `trigger_analytics_sync` | Asks the network for a channel's latest numbers now instead of waiting for the next scheduled fetch. It runs in the background for a few minutes. | `analytics:read` | reversible write |  |

#### ai

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `generate_alt_text` | Looks at an image in the media library and drafts alt text for it. Returns text; update_alt_text saves it. | `media:read` | read |  |
| `generate_caption` | Writes or reworks a caption with the composer's AI assistant: new from a topic, or rephrased, shortened, expanded, more casual or more formal. Returns text only; nothing is saved. | `posts:read` | read |  |
| `generate_image` | Generates an image with the app's image model and saves it to the media library. It counts against the plan's monthly image allowance, so the member confirms it. | `media:write` | reversible write | yes |
| `generate_link_title` | Writes a short headline for a link preview or a bio link button. | `posts:read` | read |  |
| `generate_variations` | Writes alternative versions of a caption, for A/B tests or for posting the same news on several days. | `posts:read` | read |  |
| `rewrite_for_channel` | Rewrites a caption for another platform's length and style, for example a LinkedIn post into a Bluesky one under 300 characters. | `posts:read` | read |  |

#### inbox

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_comment_rule` | Creates a comment rule on a post of the active social set: when a new comment matches the conditions, the inbox replies publicly, sends a DM to the commenter, or hides the comment, with fixed texts or an optional model step. Replies go out without anyone pressing a button, so the member confirms every time. Needs the Influencer plan or higher and a channel whose inbox can reply. | `comment_rules:write` | always ask |  |
| `get_comment_rule_activity` | What a comment rule, or a post's rules, did: totals by status and skip reason, and the recent replies, DMs and hides with the text we sent. Commenters' own text is not included. | `comment_rules:read` | read |  |
| `list_comment_rules` | The comment rules of the active social set, or of one post: id, post, what triggers them, what they do, status and what they did in the last 30 days. | `comment_rules:read` | read |  |
| `pause_comment_rule` | Pauses a comment rule, or every rule of a post, so no more replies go out; or resumes them. Undo puts the rules back as they were. | `comment_rules:write` | reversible write | yes |

#### bio_links

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `add_block` | Adds a link button or a social icon to a bio page. Other sections (media, products, tipping, forms) are added in the editor. | `biolinks:write` | reversible write | yes |
| `create_bio_page` | Creates a link-in-bio page in the active social set with a profile name and bio; links are added with add_block. The page is public at its URL once created. | `biolinks:write` | reversible write | yes |
| `delete_bio_page` | Deletes a bio page with its custom domain; its URL stops working. The member confirms every time. | `biolinks:write` | always ask |  |
| `export_subscribers` | A bio page's subscribers as CSV text (name, email, phone, date), up to 100 rows. Hand it to download_file for a file. | `subscribers:read` | read |  |
| `get_bio_analytics` | A bio page's traffic over a period: views, unique visitors, clicks, click-through rate, bounce rate, and its most clicked links. | `biolinks:read` | read |  |
| `get_bio_page` | One bio page: its profile title and bio, its sections, its links (with ids for update_block and remove_block) and its social links. | `biolinks:read` | read |  |
| `get_custom_domain` | A bio page's custom domain and its DNS status, with the records the member still has to add at their domain registrar. | `biolinks:read` | read |  |
| `list_bio_integrations` | The email-list integrations (for example AWeber, HubSpot, Kit) the active social set's bio pages can send new subscribers to. | `biolinks:read` | read |  |
| `list_bio_pages` | The link-in-bio pages of the active social set: id, title, URL slug and custom domain. | `biolinks:read` | read |  |
| `list_subscribers` | People who signed up on a bio page's email form, newest first: name, email and date; at most 25, with the total. | `subscribers:read` | read |  |
| `remove_block` | Removes a link button or a social icon from a bio page. | `biolinks:write` | reversible write | yes |
| `request_custom_domain` | Starts serving a bio page on the member's own domain. It returns the DNS records the member must add at their registrar; the domain works once they are in place. | `biolinks:write` | reversible write | yes |
| `update_bio_page` | Changes a bio page's profile name, bio or URL slug. Design and other sections are edited in the app. | `biolinks:write` | reversible write | yes |
| `update_block` | Changes a link button's text or URL, or a social icon's URL, on a bio page. | `biolinks:write` | reversible write | yes |

#### short_links

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_short_link` | Shortens a URL with the workspace's default shortener; the result says if it fell back to Viraly's own. | `url_shortener:write` | reversible write | yes |
| `delete_short_link` | Deletes a short link. Anyone who opens it afterwards gets nothing, including in posts already published. The member confirms every time. | `url_shortener:write` | always ask |  |
| `get_short_link_stats` | Clicks on one short link: total, by day, by country, by device and the posts that carry it. | `url_shortener:read` | read |  |
| `get_shortener_settings` | Which shortener the workspace uses by default (Viraly's own, Bitly, Dub or Rebrandly) and its default domain. | `url_shortener:read` | read |  |
| `get_url_preview` | What a link shows when shared: its page title, description, site and image. | `url_shortener:read` | read |  |
| `list_short_links` | The workspace's short links, 25 per page, newest first: short URL, original URL, clicks and the shortener that made it. | `url_shortener:read` | read |  |
| `set_default_shortener` | Chooses which shortener the workspace uses by default. | `url_shortener:write` | reversible write | yes |

#### ideas

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_draft_from_idea` | Turns an idea into a draft on a channel: its caption (or title) and media, with the link appended. The idea is marked Scheduled as in the app. | `posts:write` | reversible write | yes |
| `create_idea` | Saves an idea on a board of the active social set. | `ideas:write` | reversible write | yes |
| `delete_idea` | Deletes an idea. Undo saves it again on its board with the same text. | `ideas:write` | reversible write | yes |
| `generate_ideas` | Suggests post ideas for a business and audience with the app's idea generator. Returns text; create_idea saves the ones the member likes. | `ideas:read` | read |  |
| `list_idea_boards` | The idea boards of the active social set with how many ideas each holds. | `ideas:read` | read |  |
| `list_ideas` | The ideas on one board: title, caption, notes, link, planned date and status. | `ideas:read` | read |  |
| `update_idea` | Changes an idea's title, caption, notes, status or date. | `ideas:write` | reversible write | yes |

#### feeds

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_draft_from_feed_item` | Drafts a post sharing a feed item on a channel, with its link, and marks the item used. | `posts:write` | reversible write | yes |
| `list_feed_items` | The newest items of a feed: title, link, summary and whether they were used. | `feeds:read` | read |  |
| `list_feeds` | The RSS and Atom feeds the active social set follows, with unread item counts and fetch errors. | `feeds:read` | read |  |
| `subscribe_feed` | Follows an RSS or Atom feed in the active social set so its items appear in Feeds. | `feeds:write` | reversible write | yes |
| `unsubscribe_feed` | Stops following a feed and removes its items. Undo follows it again; read states start over. | `feeds:write` | reversible write | yes |

#### approvals

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `add_post_comment` | Adds an internal team comment to a post, as in the post's comment thread. The network never sees it. | `posts:write` | reversible write | yes |
| `list_pending_approvals` | Posts of the active social set in the approval workflow: by default the ones waiting for this member to approve, with channel, local time and caption start. | `posts:read` | read |  |
| `list_post_comments` | The team's internal comments on a post (not comments from the network), oldest first, with who wrote them. | `posts:read` | read |  |
| `request_approval` | Sends a post for approval: it waits as Pending approval and does not publish until approved. The approvers are notified as in the app. | `posts:write` | reversible write |  |

#### evergreen

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_evergreen_schedule` | Makes a post evergreen: Viraly schedules a copy of it every so many days, until a count or a date. | `posts:write` | reversible write | yes |
| `list_evergreen_schedules` | The evergreen schedules of the active social set: which post recycles, how often, how many times so far and whether it is paused. | `posts:read` | read |  |
| `list_recycled_content` | The copies an evergreen post has produced so far: each copy's time and status. | `posts:read` | read |  |
| `pause_evergreen_schedule` | Pauses an evergreen schedule so no new copies are made, or resumes it. | `posts:write` | reversible write | yes |
| `update_evergreen_schedule` | Changes how often an evergreen post recycles and when it stops. | `posts:write` | reversible write | yes |
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
