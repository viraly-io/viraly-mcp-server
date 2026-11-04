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
126 tools in the registry, catalog last changed 2026-11-04.

#### workspace

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `get_workspace` | The workspace (id, name, plan, status, when it was created, how many channels it has in all) and the active social set (id, name, timezone, how many channels are connected to it). Use it for questions about the account itself. For the workspace's settings (notifications, API keys, connected apps, webhooks, Slack, Teams, Discord) use get_workspace_settings and its neighbours in the settings module; for the plan's limits use get_subscription. | `workspace:read` | read |  |
| `get_workspace_brief` | The brief the members wrote for Copilot: brand voice, audience, do and don't lists, posting rules. The social set's own brief when it has one, otherwise the workspace's, with when it last changed and the 8,000-character limit. | `workspace:read` | read |  |
| `list_social_sets` | Every social set this member can open, as the app's list shows them: id, name, short code, colour, timezone, when it was created, how many channels it has, and which one is active (null through an API connection, which has no active set). Tools work on the active set; to act on another one the member named, pass its id as socialSetId. | `social_sets:read` | read |  |
| `list_timezones` | Timezone ids the app accepts for a social set (IANA names such as Europe/Berlin), with the display name and the standard UTC offset. Up to 100 come back with the total; use search to find one. | `workspace:read` | read |  |
| `update_workspace_brief` | Replaces the brief Copilot reads on every request (brand voice, audience, rules), for the whole workspace or this social set only, up to 8,000 characters; empty removes it. A social set's own brief shadows the workspace's for that set. Show the member the new text; it replaces the old one. Through an API connection no member is recorded as its author; the call names a social set there too, and forThisSocialSetOnly still decides between that set's own brief and the workspace's. | `social_sets:write` | reversible write | yes |

#### social_sets

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_social_set` | Creates a new, empty social set (a brand or client with its own channels, calendar and timezone), with the server's checks: a name up to 65 characters, a timezone id from list_timezones, a code of one or two characters (the app's form asks for exactly two). The default code and colour are the form's. Channels are connected to it in the app afterwards. In Copilot undo deletes it again while it has no channel and no media library file; over MCP there is no card and no undo. | `social_sets:write` | reversible write | yes |
| `delete_social_set` | Deletes a social set with all its channels, every post (published history and analytics included), its inbox history and every file of its media library, as the app's list does: YouTube access is revoked, the workspace's webhooks hear each channel disconnect, and channels locked by the plan's limit are re-evaluated. The card and the result count the channels, posts and media files. A workspace keeps at least one social set, so the last one is refused, and so is a set with a file still uploading or processing (delete it once the file is done). Irreversible: in Copilot the member confirms every time and a conversation cannot delete its own set; over MCP no card is shown, so confirm with the person first. | `social_sets:write` | always ask |  |
| `get_social_set` | The active social set in detail: name, short code, colour, timezone, when it was created, and each connected channel with its username, who connected it (connectedAs, as the app's set page shows), account type, status and problem. | `social_sets:read` | read |  |
| `update_social_set` | Changes the active social set's name, timezone, colour or code, with the app's checks. A timezone change re-times every post with a future time that is scheduled, awaiting approval or being published so it keeps its local wall-clock time in the new zone (the moment it publishes changes); drafts keep their placeholder time; the result says how many moved. In Copilot undo puts the old values back the same way; over MCP there is no card and no undo. | `social_sets:write` | reversible write | yes |

#### channels

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_pinterest_board` | Creates a board on a Pinterest channel's account, as the composer's board picker does when the member types a new name, and stores it with the channel's boards; the result's board is the row list_pinterest_boards returns, so its id goes straight to boardId on create_draft or schedule_post. The board is public on Pinterest (the picker makes public boards too; Viraly's Pinterest sign-in does not ask for secret boards), and Viraly cannot delete it again: that is done on Pinterest. A name the channel already has a board for (case aside) is refused with that board's id, so use it instead; a channel that is not Pinterest, not connected, or whose sign-in did not grant boards:write is refused. In Copilot the member confirms every time on a card naming the channel and the board; over MCP no card is shown, so confirm with the person first. | `posts:write` | always ask |  |
| `disconnect_channel` | Disconnects a channel from Viraly, as the app's Disconnect does, and deletes everything Viraly holds for it: every post including the published history and its analytics, comments and approvals, and its inbox conversations with their messages and notes. Nothing is removed on the network itself; for YouTube Viraly's Google access is revoked, the inbox's webhooks for the channel are dropped, the workspace's webhooks get ChannelDisconnected, and a channel locked by the plan's limit may unlock. The card and the result count the posts and conversations deleted. Irreversible: in Copilot the member confirms every time; over MCP no card is shown, so confirm with the person first. | `channels:write` | always ask |  |
| `get_channel` | One channel in detail, as the app's channel card shows it: platform, account type, username, status and why (an expired token with the network's message and what to do, a locked channel over the plan's limit, a disabled one), needsReconnect where the app offers Reconnect (expired or disabled), who connected it, the permissions it granted, when its token was last and is next refreshed, when analytics were last and are next fetched, its posting slots with their ids, how many posts it has, when its history sync started and the earliest day it has analytics for (syncStartedAt, earliestMetricAt). For an X account also the subscription type and the caption limit that applies (280 weighted characters, or 25,000 for Premium on a paid plan). | `channels:read` | read |  |
| `get_media_requirements` | Each platform's rules for media and text, from the app's composer table and the server's validator: formats, file sizes, aspect ratios, resolutions, video lengths, how many files, caption, title, first-comment, link and hashtag limits, reel cover photos and the YouTube thumbnail. Where the composer and the server differ, a note says which one checks it (for example Facebook reel length, which the server does not check). Check them before drafting; validate_post runs the server's check on a concrete post. | `channels:read` | read |  |
| `get_posting_slots` | The weekly posting slots of each channel (id, day, local time in the social set's timezone) that the queue fills, with how many posts sit in each (every post in the slot with a future time, whatever its status). The ids are what set_posting_slots takes to move a slot. find_free_slots says which slots are empty on given dates. Up to 100 channels; truncated says when there are more. | `channels:read` | read |  |
| `get_reconnect_link` | Where the member reconnects an expired or broken channel: the app's social set page, which starts the network's sign-in for that channel on arrival (Bluesky and Mastodon ask for the credentials on the page). Reconnecting needs the member to sign in to the network themselves, so no tool can do it. In the app Copilot can open the path with navigate; elsewhere give the member the url. | `channels:read` | read |  |
| `list_channels` | The connected accounts and pages of the active social set, in the app's order: id, name, username, platform, account type, status (Active, Expired, Disabled, Locked), the problem behind a status and who connected it (connectedAs). Use it to turn a channel name into its id; get_channel has the rest of the card. | `channels:read` | read |  |
| `list_pinterest_boards` | The boards of a Pinterest channel with their ids, as the app's board picker shows them. A pin needs one: pass the id as boardId on create_draft, schedule_post or update_post. When none fits, create_pinterest_board makes one, as the picker's create does; a board made on Pinterest itself is listed with refresh true. Without refresh the list is what the last fetch stored, so a board made on Pinterest since may be missing. | `channels:read` | read |  |
| `set_posting_slots` | Replaces one channel's weekly posting slots, the times the queue fills, as the app's posting times editor saves them. Queued posts follow their slot only when the slot is sent with its id and a new time (they move to that time on the same date); a removed slot's queued posts keep their date, time and queued status (the app still lists them in the queue at that time) but no longer sit in a posting slot, which get_post shows as inPostingSlot false. generateSlotsPerDay replaces every slot with random best-time slots for the platform, as the app's Generate New Slots followed by Save does: every queued post keeps its time and leaves its slot; in Copilot the card shows the generated times and exactly those are saved. Up to 100 slots, times as HH:mm. The result says what moved and what lost its slot. In Copilot undo restores the old times of slots that still exist, re-adds removed ones (with new ids) and puts the queued posts that lost their slot back into the slot on their day and time; their times never change. Over MCP there is no card and no undo. | `channels:write` | reversible write | yes |

#### posts

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `bulk_reschedule` | Moves up to 50 posts to new times in the future under one confirmation: drafts, scheduled and pending-approval posts, and processed posts (media ready, waiting for their time), which go back to scheduled. Each item succeeds or fails on its own and the result says which; drafts stay drafts. Undo moves each back while its old time has not passed; over MCP there is no card and no undo. | `posts:write` | reversible write | yes |
| `cancel_post` | Stops a scheduled post from publishing by turning it back into a draft; it keeps its time, content and approval record, and nothing is deleted. A post waiting for approval goes back to draft as the app's Move to Draft does: its approval request is withdrawn, and that has no undo. Refused for a draft, a post being published, published or failed. Undo schedules it again while its time has not passed; over MCP there is no card and no undo. | `posts:write` | reversible write | yes |
| `create_draft` | Saves a draft on one channel of the active social set, with everything the composer takes: text, media, title, categories, platform settings (config), an approval request, evergreen. A draft publishes nothing; it waits in the app until someone schedules it. Without scheduledAtLocal it is planned for now, so it shows on today in the calendar. It counts against the plan's monthly post quota and is refused once the month is full. In Copilot the member confirms on a card unless they allowed drafts, and undo deletes it while it is still a draft; over MCP there is no card and no undo. | `posts:write` | reversible write | yes |
| `delete_draft` | Deletes a draft. Undo brings it back as a new draft (a new id) with the same text, title, media and alt text, categories, platform settings and time, and it does not count against the monthly post quota again; over MCP there is no card and no undo. | `posts:write` | reversible write | yes |
| `delete_scheduled_post` | Deletes a scheduled post (one on its way to the network included), a pending-approval or a failed post from Viraly. When it is an evergreen original its recycled copies are deleted with it, and the result counts them (recycledCopiesDeleted). Irreversible. In Copilot the member confirms on a card every time; over MCP there is no card and no undo. A published post is refused: deleting it in Viraly would not remove it from the network. For drafts use delete_draft; to keep a post but stop it, use cancel_post. | `posts:write` | always ask |  |
| `duplicate_post` | Copies a post into a new draft on the same channel or another and saves the draft at once (the app's Duplicate only opens the composer with the copy, and saves nothing until the member does): its text, title, media with alt text, categories and platform settings; on another platform the settings are rebuilt from the text. Anything given here replaces what is copied. Works for published and failed posts too. The copy is planned for now, so it counts against the plan's monthly post quota and is refused once the month is full. Undo deletes the copy while it is still a draft; over MCP there is no card and no undo. | `posts:write` | reversible write | yes |
| `export_posts` | The posts of a date range as CSV text with the app's export columns (Title, Scheduled At, Status, Channel, Platform, Post URL, Image URL, Created By), by scheduled time. Returns the text of up to 100 rows, the total and whether it stopped short; it makes no file, and a PDF or an emailed export exists only in the app. Needs the Influencer plan or above, as the app's export does. | `posts:read` | read |  |
| `find_free_slots` | The empty posting slots of the active social set's channels in a date range, earliest first: each with channel and local time. A slot is empty when no post at all sits at its time on that channel (a queued draft takes it, as in the app's queue and the queue placement); truncated says when more existed than limit. Channels without slots and channels that cannot publish are named. Use it for "fill the empty slots next week". | `posts:read` | read |  |
| `get_calendar` | The calendar of the active social set for a date range: per day, up to 40 posts with id, local time, channel, status, caption start, title, public link, error, media count, categories and the evergreen flag; a day with more says truncated with its total. Posts of locked channels (past the plan's channel limit) are left out, as in the app. Use it to see what is planned or where the gaps are. | `posts:read` | read |  |
| `get_post` | One post of the active social set as the app reads it: the text (on X, Threads, Bluesky and Mastodon the first post of the thread; config holds the rest), title, channel, status, local scheduled time, public link, the stored config (the platform settings nested as the composer sends them: title, first comment, board, privacy, thread posts), the attachments with alt text and order, categories, approval state, evergreen flags, the last error with its reason and hint, and summary metrics. queued is the app's flag (the status is scheduled or on the way to publishing); inPostingSlot says whether the post sits in one of the channel's posting slots (a post whose slot was removed stays queued at its time with inPostingSlot false). To change a setting, send update_post a config block with only the fields to change, in the shape update_post's config takes (for example config.youTube.contentOptions.title); the stored config has members update_post does not take. | `posts:read` | read |  |
| `get_post_diagnostics` | Why a post failed or is stuck: the network's error with its reason and hint, the channel's state, whether the post's time has passed while it still waits to publish, the problems the save-time rules find on its stored settings now, and what usually fixes it. | `posts:read` | read |  |
| `get_post_preview` | How a post will appear: the text with its length (on X, Threads, Bluesky and Mastodon the first post, with the whole thread beside it), the placement (post type and system post type), the platform title, first comment, board and link, the media in order with type, dimensions, file size and duration, the local time, and the problems the save-time rules find on its stored settings. | `posts:read` | read |  |
| `list_posts` | Posts of the active social set, 25 per page, latest scheduled first with unscheduled drafts last: id, a short caption, title, channel, status, local scheduled time, media count, categories, approval state and summary metrics. startDate and endDate bound the scheduled date in the social set's timezone (dateField switches to the creation or publish date; a published post the platform import brought in has no stored publish time and counts by its scheduled time, when it went out); hasMore says when another page exists. For one post in full use get_post; for the best performers use list_top_posts; for posts waiting for the member's approval use list_pending_approvals (approvals module), which knows who approves what. | `posts:read` | read |  |
| `move_to_queue` | Puts a draft or scheduled post into its channel's next empty posting slot from now; it then publishes by itself at that time. On a channel without posting slots a draft stays a draft and the result says so, and a scheduled post is refused, so it keeps its time. Refused for a post waiting for approval, publishing, published or failed. Undo puts it back as it was while its old time has not passed; over MCP there is no card and no undo. | `posts:write` | reversible write | yes |
| `publish_now` | Publishes a draft or scheduled post to the network right now, as the app's Publish Now does: the post is checked again with the save-time rules (a refusal lists the problems and changes nothing), its media must be ready, and a post.updated webhook is sent. Refused for a post waiting for approval, publishing, published or failed (use retry_failed_post). Irreversible: once on the network Viraly cannot take it back. In Copilot the member confirms on a card every time; over MCP there is no card, so the caller's own confirmation is the only one. The result has id, status (the raw status, ProcessingEnqueued once it starts), displayStatus, channel, caption, mediaCount and a note. | `posts:write` | always ask |  |
| `reschedule_post` | Moves a draft, scheduled, pending-approval or processed post of the active social set to a new time in the future. A draft keeps its status: it gets the time but stays a draft and does not publish until someone schedules it; a processed post (media ready, waiting for its time) goes back to scheduled. In Copilot the member confirms unless they allowed rescheduling, and undo moves it back while the old time has not passed; over MCP there is no card and no undo. | `posts:write` | reversible write | yes |
| `retry_failed_post` | Publishes a failed post again right now, as the app's Publish Now on a failed post does: the post is checked again with the save-time rules, its last error and delivery attempts are cleared, and a post.updated webhook is sent. Read get_post (its error) or get_post_diagnostics first: retrying an expired channel or a rejected file fails again. Irreversible once it succeeds. In Copilot the member confirms on a card every time; over MCP there is no card. The result has id, status (the raw status) and displayStatus. | `posts:write` | always ask |  |
| `schedule_post` | Schedules a post to publish by itself at a time, or in the channel's next queue slot: a new post with everything the composer takes (text, media, title, categories, platform settings, approval, evergreen), or an existing draft or scheduled post by postId (a scheduled one moves to the new time). With useNextQueueSlot on a channel without posting slots a draft stays a draft and the result says so, and a scheduled post is refused, so it keeps its time. A new post counts against the plan's monthly post quota and is refused once the month is full. It publishes without anyone pressing a button, so check it with validate_post first. Undo deletes a post it created, or puts a post it scheduled back as it was, before it publishes; over MCP there is no card and no undo. | `posts:write` | reversible write | yes |
| `search_posts` | Finds posts of the active social set by words in their text, newest first, among its latest 2,000 posts. Use it to find "the post about the autumn guide". | `posts:read` | read |  |
| `update_post` | Changes a draft or scheduled post: text, media and alt text, placement, title, categories, platform settings (config), approval, evergreen. What is omitted stays, the approval record included. It keeps its status and time, except that an approvalRequest makes it wait for approval; use reschedule_post for the time. Refused for a post waiting for approval, publishing, published or failed, and for a scheduled post whose time has passed. Undo puts the old content back while its time has not passed; over MCP there is no card and no undo. | `posts:write` | reversible write | yes |
| `validate_post` | Checks a post before it is saved or scheduled, with the rules the server applies on save to the settings as they would be stored (caption and title lengths, first comment, board, privacy, media formats, sizes, counts and aspect ratios per platform), plus a channel that cannot publish, a time in the past, the same text already on the channel and, for a new post (no postId), the monthly post quota the save applies. An existing post is judged on its stored settings with the given fields laid over them. Returns each problem; saves nothing. | `posts:read` | read |  |

#### categories

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `assign_category` | Adds categories to posts of the active social set, or removes them, as the calendar's bulk category action does. A post that already has (or lacks) a category is left as it is. The result has postsUpdated (the posts sent), categoriesAffected (how many of the categories changed on at least one post), assignmentsChanged (post and category pairs added or removed) and changes (each post's changed categories). In Copilot undo reverses only those changes. Over MCP there is no card and no undo. | `categories:write` | reversible write | yes |
| `create_category` | Creates a post category for the workspace (every social set shares them), as the app's category settings do. In Copilot undo deletes it again while no post or idea uses it. Over MCP there is no card and no undo. | `categories:write` | reversible write | yes |
| `delete_category` | Deletes a post category of the workspace; posts and ideas that had it lose it (they are not deleted). The result counts them. There is no undo. In Copilot the member confirms every time. Over MCP no card is shown, so confirm with the person first. | `categories:write` | always ask |  |
| `list_categories` | The workspace's post categories (content pillars such as Promotions or Tips), in the app's order (sort order, then name): id, name, colour, sort order, when each was made, and how many posts and ideas use each, counted across the whole workspace. | `categories:read` | read |  |
| `update_category` | Renames or recolours a post category of the workspace; posts and ideas keep it. In Copilot undo puts the old name and colour back. Over MCP there is no card and no undo. | `categories:write` | reversible write | yes |

#### media

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_collection` | Creates a media library collection (folder) in the active social set, named up to 100 characters. It becomes the first collection, as in the app. In Copilot undo deletes it again while no file of any status is in it. Over MCP there is no card and no undo. | `media:write` | reversible write | yes |
| `delete_media` | Deletes a file from the media library and its stored copies. Refused while the file is used by a post (remove it from those posts first) and while it is still uploading or processing. One file per call (the app's bulk delete has no tool). There is no undo. In Copilot the member confirms every time. Over MCP no card is shown, so confirm with the person first. | `media:write` | always ask |  |
| `get_media` | One file of the media library, any status, as the app's file view shows it: type, status, name, width and height, duration, size, urls, alt text, tags, collection, who added it and when, the source, and the error of a file that failed. Resolves a file that upload_media_from_url, import_media, request_media_render or generate_image made; it answers at once and does not wait for a file to finish, so call it again for a file still uploading or processing. | `media:read` | read |  |
| `import_media` | Imports a file into the active social set's media library the way the app's import panel does: from a public direct link, a Dropbox direct link or an Unsplash photo id (search_unsplash is the panel's Unsplash search). The server checks the link at once and refuses a dead, oversized or unsupported one with the reason; the download then runs in the background. The result names the file (mediaId) and the job; get_media on the file says when it is Completed, or why it Failed. Unsplash photos are stored with the photographer's username in the file name only: credit them where the photo is published (search_unsplash gives the name and profile link). In Copilot undo removes the file once the download has finished. Over MCP there is no card and no undo. | `media:write` | reversible write | yes |
| `list_media` | Finished (Completed) files in one media library collection of the active social set, with the library toolbar's filters: type, favourites, search, tags and uploader (me, others, one member, or none). Favourites first, then newest, unless sort or favoritesFirst say otherwise. Each file has id, type, status, name, width and height, duration, size, urls, alt text, tags, favourite, when and by whom it was added (files added through an API connection, or by a member since removed, have no uploader: uploadedBy none finds them). hasMore and nextCursor page it. Use the ids as mediaIds in posts. Files still uploading or processing are not listed; get_media reads one in any status. | `media:read` | read |  |
| `list_media_collections` | The media library's collections (folders) of the active social set in the app's order: id, name, how many finished (Completed) files each holds, whether it is starred, its order, tags, notes and when it was made. Renaming, starring, reordering and deleting a collection are done in the app. | `media:read` | read |  |
| `move_media` | Moves up to 100 files to another collection of the same social set. Every id must be in this set's library; the files' tags are left as they are, as in the app. In Copilot undo moves each file back to the collection it was in. Over MCP there is no card and no undo. | `media:write` | reversible write | yes |
| `request_media_render` | Makes an edited copy of a library VIDEO on the server with the renderer the app's media editor uses: a centred crop to an aspect ratio, a trim to one range of seconds, muting, and mirroring, in any combination. The editor's rotation, several trim ranges, volume levels, colour, resize and overlays are not offered here, and images cannot be edited this way (the renderer takes video only). The original stays; the copy is a new file filed in the original's collection (the editor leaves its copy outside the library) that starts Uploading and becomes Completed when the render finishes (get_media on mediaId). The result has the render's status, progress and, when it failed, errorCode and error; a video too large or too long for the renderer is refused with its code. In Copilot undo cancels a running render or removes the finished copy. Over MCP there is no card and no undo. | `media:write` | reversible write | yes |
| `search_media` | Searches every collection of the active social set's media library at once (the app searches one collection at a time) by file name or alt text, and by tags with the tags filter, with the library's type, favourite and uploader filters; finished files only, favourites first then newest unless sort or favoritesFirst say otherwise. Each file names its collection and who added it. hasMore and nextCursor page it. | `media:read` | read |  |
| `search_unsplash` | Searches Unsplash's free photos as the app's import panel does: each photo has its photoId (for import_media with provider Unsplash), a description, width and height, thumbnail and preview links, and the photographer's name and profile link, which Unsplash asks to credit wherever the photo is shown. Nothing is imported or saved. Up to 120 searches a minute per workspace, as the app's import panel. | `media:read` | read |  |
| `update_alt_text` | Sets a library file's alt text (its notes in the library, shown in the app's file view). Posts carry their own alt text per file, and that is what reaches the networks: give postId to set it on a draft or scheduled post that carries the file, saved the way the composer saves the post (its post.updated webhook fires). On a post it is held to the composer's limit for the post's platform (the composer shows the count and warns; this tool refuses a text over it) and to the files the composer offers alt text for: photos on Facebook, Instagram, X, LinkedIn and Bluesky photo posts (not on a Reel, a story, a video, GIF, text or document post), the first file of a pin, photos and videos on Mastodon and Threads, nothing on TikTok, YouTube or Google Business; any other file is refused with the rule. Without postId no post changes, and the library keeps up to 500 characters, so a longer text without postId is refused; with postId a text over 500 is set on the post only. The result has the stored text, the platform's limit and whether the library text was set. In Copilot undo puts the old texts back while the post can still be edited. generate_alt_text drafts the text. Over MCP there is no card and no undo. | `media:write` | reversible write | yes |
| `upload_media_from_url` | Adds a file to the active social set's media library from a public link straight to an image or video: the server downloads and measures it while the call waits, then files it in the collection (the app's library imports a link in the background instead; import_media does it that way). A download that fails, breaks off or is refused leaves no file. A photo comes back Completed (ready to post) within a few seconds; a video comes back Uploading or Processing and get_media says when it is ready. Each call adds a new file, also for a link added before; only a retry of the same tool call returns the first file. Alt text over 500 characters or a name over 255 is refused before anything is downloaded. In Copilot undo removes the file once it is no longer uploading or processing. Over MCP a retry is a request with the same Idempotency-Key header, which returns the first file; the same key with other arguments is refused (409). Over MCP there is no card and no undo. | `media:write` | reversible write | yes |

#### hashtags

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_hashtag_list` | Saves a hashtag list in the active social set for the composer's hashtag picker: a topic up to 512 characters and at most 30 tags, 1024 characters in all. Tags are stored as the app's tag field stores them (each with #, once, single-spaced); the result has the stored text. In Copilot undo deletes the list again. Over MCP there is no card and no undo. | `hashtags:write` | reversible write | yes |
| `delete_hashtag_list` | Deletes a saved hashtag list of the active social set; posts that used its tags keep them. There is no undo. In Copilot the member confirms every time. Over MCP no card is shown, so confirm with the person first. | `hashtags:write` | always ask |  |
| `generate_hashtags` | Suggests hashtags for a topic with the composer's hashtag generator (its field takes up to 512 characters): the tags as a list, plus the generator's own text with its groupings. Nothing is saved. | `posts:write` | read |  |
| `get_hashtag_list` | One saved hashtag list of the active social set in full: id, topic, the hashtags and when it was made. | `hashtags:read` | read |  |
| `list_hashtag_lists` | The saved hashtag lists of the active social set, newest first: id, topic, the hashtags in full and when each was made. At most 100; truncated says when there are more. | `hashtags:read` | read |  |
| `update_hashtag_list` | Changes a saved hashtag list's topic or replaces its hashtags; what is omitted stays. The result has the stored text. In Copilot undo puts the old topic and hashtags back. Over MCP there is no card and no undo. | `hashtags:write` | reversible write | yes |

#### analytics

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `compare_periods` | Compares two date ranges of published posts in the active social set, one channel or one platform: posts, the totals of the app's universal metrics (engagement = likes + comments + shares + clicks, the app's universal engagement (null for YouTube: not a YouTube figure), impressions, reach, likes, comments, shares, clicks, video views, engagement rate) and the change in percent from the first to the second. Only posts with collected metrics count, up to 10,000 per period (truncated says when the sums stopped short; the posts change counts every post). Totals follow the app's combined totals: YouTube's likes, comments, shares and views are left out of a total when another platform is in scope (YouTube's API policies forbid mixing them; they stay in byPlatform), and reach is never summed across platforms (the platform's own reach with one platform in scope, else null; byPlatform has it per platform). As the app's pages, which drop the engagement and engagement-rate figures whenever YouTube is in scope, engagement, engagementRate and averageEngagementPerPost are null when any YouTube post is in scope (byPlatform keeps each other platform's own); filter by platform or channel for them. A total that counts no post is null, not 0. platformsCovered and platformsLeftOut say which platforms a total adds up. Both periods add up the same platforms, so a change never compares YouTube figures with another platform's. There is no native endpoint for it; the sums are the tool's own over the app's definitions. Use it for "this month against last month". | `analytics:read` | read |  |
| `export_analytics_csv` | One channel's post metrics of a date range as CSV text with the app's export writer and columns (ID, External ID, Published At in the set's timezone, Content, Post URL, Image URL, then the platform's metric columns), oldest first. Returns the text of up to 100 rows, the total and whether it stopped short: the app's file has every row, so a busy channel's full export is the app's. It makes no file, and the PDF report (Business and above) exists only in the app. Needs the Influencer plan or above, as the app's export does. A start date before the plan's analytics retention is moved up to it (retentionNote), where the app's date picker would not offer it. | `analytics:read` | read |  |
| `get_best_times` | When the active social set's published posts did best: the average engagement rate (or engagement, engagement = likes + comments + shares + clicks, the app's universal engagement (null for YouTube: not a YouTube figure)) by weekday and by local hour, and the ten best weekday and three-hour windows, over every post of the window with collected metrics (up to 10,000), with how many posts each figure rests on. The app has no best-times figure for your own posts (its best times are for competitors); this one is computed by the tool. Posts without impressions or video views have no rate. With any YouTube post in scope nothing is averaged (byWeekday, byHour and bySlot are null and withheld is true), as the app shows no derived engagement on a view that includes YouTube: give a platform or a channel that is not YouTube. A hint, not a rule: set_posting_slots sets the slots. | `analytics:read` | read |  |
| `get_category_analytics` | How post categories performed in the active social set over a date range, with the app's category analytics summary: per category (or combined, the app's campaign figure) the posts, the universal totals (impressions, likes, comments, shares, clicks, video views, engagement = likes + comments + shares + clicks, the app's universal engagement (null for YouTube: not a YouTube figure), engagement rate) and the breakdown per platform. The totals are the app's: YouTube is left out of them when another platform is present (it stays in platformBreakdown), and the totals' reach is always null, as in the app; each platform's reach is in platformBreakdown. platformsCovered and platformsLeftOut say which platforms a total adds up. As the app's summary and comparison, a category with any YouTube post has no engagement or engagement rate in its totals (platformBreakdown keeps each other platform's own). Unlike the app's compare (2 to 8 categories, no platform filter) it takes up to 100 categories, one summary each, and a platform filter. No tool lists a category's posts; list_top_posts ranks the whole social set. Unknown category ids are listed, not fatal. | `analytics:read` | read |  |
| `get_channel_analytics` | A channel's performance in a date range: every published post of the range with collected metrics summed with the app's universal metrics (postTotals: engagement = likes + comments + shares + clicks, the app's universal engagement (null for YouTube: not a YouTube figure); reach is the channel's own sum, null where the platform reports none; up to 10,000 posts, truncated says when it stopped short), plus the account's headline numbers from the services the app's analytics page reads: Facebook and Instagram with the previous period (reach, views, engaged accounts, follows, Instagram followers), LinkedIn follower gains and page views, YouTube channel totals (views, watch time, subscribers), Threads totals and followers, the Pinterest account report with the app's default filters, and the TikTok, X, Bluesky and Mastodon follower counts. It does not carry the page's daily series, demographics, audience, traffic-source, device, media-type or follow-type breakdowns, nor the Pinterest report's filters. A network that does not answer leaves accountError set and the post totals stand. A start date before the plan's analytics retention is moved up to it. | `analytics:read` | read |  |
| `get_post_analytics` | What one post of the active social set did: the flattened metrics (reach, impressions, views, likes, comments, shares, saves, clicks; null where the platform reports none), the app's universal metrics with the engagement rate, the network's own metric object as the app's post view shows it, the link to the live post, and when the numbers were last updated. Engagement is the one the other analytics tools use: engagement = likes + comments + shares + clicks, the app's universal engagement (null for YouTube: not a YouTube figure); engagement is the universal block's likes + comments + shares + clicks; the flattened metrics keep the platform's own fields, so their shares and clicks can differ (X, Threads and Bluesky shares include quotes, X clicks are profile clicks, Pinterest saves are its universal shares and count in engagement). | `analytics:read` | read |  |
| `get_post_insights` | The published posts with collected metrics of one channel in a date range, as the app's posts table lists them: newest first, sorted by any of the platform's own metrics, or ranked over the whole range by engagement, reach or views; paged, with the total, the app's universal metrics, the flattened and the native metrics, the post type and thumbnail per post. Engagement is the one the other analytics tools use: engagement = likes + comments + shares + clicks, the app's universal engagement (null for YouTube: not a YouTube figure); engagement is the universal block's likes + comments + shares + clicks; the flattened metrics keep the platform's own fields, so their shares and clicks can differ (X, Threads and Bluesky shares include quotes, X clicks are profile clicks, Pinterest saves are its universal shares and count in engagement). The app's channel posts table shows the platform's own engagement column instead (Instagram total interactions, LinkedIn's engagement rate, X engagements, Facebook's rate over reach); those figures are in native. A ranking by engagement is refused on a YouTube channel. The end date and the ranked mode are the tool's own; the app's table takes a start date only. A start date before the plan's analytics retention is moved up to it. | `analytics:read` | read |  |
| `list_top_posts` | The best (or worst) published posts with collected metrics of the active social set (or one channel or platform) in a date range, ranked over every post of the range in the order of the app's category posts table, paged, with the total. Every post carries the app's universal metrics (engagement = likes + comments + shares + clicks, the app's universal engagement (null for YouTube: not a YouTube figure); engagement rate = engagement over impressions, else video views) and the flattened metrics; engagement is the universal block's likes + comments + shares + clicks; the flattened metrics keep the platform's own fields, so their shares and clicks can differ (X, Threads and Bluesky shares include quotes, X clicks are profile clicks, Pinterest saves are its universal shares and count in engagement). A ranking by engagement or engagement rate is refused when YouTube posts are in the range, as the app's highlights show no such ranking with YouTube in scope: give a platform or a channel that is not YouTube, or rank by likes, comments, shares, clicks, views or impressions. A native sort ranks every platform's own figure side by side. No native endpoint ranks a whole social set; the app ranks the posts of chosen categories. A start date before the plan's analytics retention is moved up to it. Use it for "what was my best post this week". | `analytics:read` | read |  |
| `trigger_analytics_sync` | Asks the network for a channel's latest numbers now instead of waiting for the next scheduled fetch, as the app's refresh button does (same service call). It runs in the background for a few minutes; a refresh started in the last 30 minutes that has not finished is reported as still running and not started again. Unlike the app's button, which stays disabled while a refresh is marked running, a refresh marked running for more than 30 minutes is taken as stuck and started again. Returns when the refresh started and when the numbers were last fetched. | `analytics:read` | reversible write |  |

#### ai

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `generate_alt_text` | Looks at an image in the media library (a video's poster for a video) and drafts alt text for it within the platform's composer limit, in a language, shortening up to twice when the draft is over (up to three model calls); fitsLimit says whether it fits, and platformTakesAltText false with a note says the platform's posts take none. Returns text; update_alt_text with the postId saves it on the post, where the networks read it. Over MCP the three model calls take one permit of the workspace's AI budget. | `posts:write` | read |  |
| `generate_caption` | Writes or reworks a caption with the composer's AI assistant: new from a topic, or rephrased, shortened, expanded, more casual or more formal, in a tone, for a platform. Returns text only; nothing is saved. No hashtags are written (generate_hashtags does that). | `posts:write` | read |  |
| `generate_image` | Generates an image with the app's image model and saves it in the active social set's media library (list_media, get_media and the post tools' mediaIds see it). It counts against the plan's monthly image allowance (the result has imagesThisMonth); deleting the image afterwards does not give the allowance back. In Copilot the member confirms it on a card unless they allowed it, and the call returns the image after about a minute, ready true once it is Completed (else get_media says when); undo removes the image. Over MCP there is no card and no undo, and the call returns a job at once instead, because the generation outlasts the connection's timeout: resolve it with get_image_generation. | `posts:write` | reversible write | yes |
| `generate_link_title` | Writes a short headline (3 to 8 words) for a bio link button, from a caption, an image, or both, with the generator the bio link's automatic titles use. Returns text only. | `posts:write` | read |  |
| `generate_variations` | Writes alternative versions of a caption with the composer's variation generator (their native home is a post's evergreenSettings.variations; also A/B tests or the same news on several days). Returns text only. | `posts:write` | read |  |
| `get_image_generation` | The state of an image generation started by generate_image when it returned a job: Pending, Running, Succeeded with the mediaId of the image in the media library, or Failed with the reason. It waits up to 40 seconds for the generation unless wait is false. Nothing is charged for a failed one. | `media:read` | read |  |
| `rewrite_for_channel` | Rewrites a caption for another platform's style with the composer's Rephrase, then checks it against that platform's standard caption limit (Bluesky 300, X 280, Threads and Mastodon 500, Pinterest 800, Google Business 1500, Instagram and TikTok videos 2200, LinkedIn 3000, Facebook and YouTube 5000), or the limit given, and shortens up to twice when it is over; fitsLimit says whether it fits. X is measured as X and validate_post measure it, every link 23 and most emoji 2 (weightedLength). That is up to three model calls (the rewrite and two shortenings). Returns text only. Over MCP the three model calls take one permit of the workspace's AI budget. | `posts:write` | read |  |

#### inbox

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_comment_rule` | Creates a comment rule on a post of the active social set: when a new comment matches the conditions, the inbox replies publicly, sends a DM to the commenter, or hides the comment, with fixed texts or an optional model step; exclusions say which comments it leaves alone. Replies go out without anyone pressing a button: in Copilot the member confirms every time; over MCP no card is shown, so confirm with the person first. Needs the Influencer plan or higher and a platform whose inbox can reply (the post's channel must have its inbox switched on for comments to arrive). | `comment_rules:write` | always ask |  |
| `delete_comment_rule` | Deletes a comment rule of the active social set, as the comment rules endpoint's DELETE does: the rule acts on no new comment, and every row of its activity (what get_comment_rule_activity shows for it) is deleted with it; the card and the result count those rows. Replies it already sent stay on the network. Irreversible: in Copilot the member confirms every time; over MCP no card is shown, so confirm with the person first. To stop a rule for a while and keep its activity, use pause_comment_rule. | `comment_rules:write` | always ask |  |
| `get_comment_rule_activity` | What a comment rule, or a post's rules, did: totals by status and skip reason, and the recent replies, DMs and hides, newest first, with the text we sent (its first 200 characters). Commenters' own text is not included. A deleted rule's activity is gone with it. | `comment_rules:read` | read |  |
| `list_comment_rules` | The comment rules of the active social set, or of one post, newest first: id, post (and whether that post was deleted), what triggers them, what they do, the exclusions, delays and cap, status and what they did in the last 30 days. total counts the rules returned (at most limit), not every rule of the set. With a status filter only the newest limit x 2 rules are looked at, as the comment rules endpoint does, so an older rule in that status can be missing. | `comment_rules:read` | read |  |
| `pause_comment_rule` | Pauses a comment rule, or every rule of a post, so it sends no more replies or DMs and hides no more comments; or resumes them. Ended rules are left as they are. The result lists each rule's status before and after (rules[].from and to). In Copilot undo puts each rule back in its earlier status (a rule paused again gets the default reason, not its old one); over MCP there is no card and no undo, so resume or pause again by hand. | `comment_rules:write` | reversible write | yes |

#### bio_links

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `add_block` | Adds an item to a bio page: a link button, a social icon, a featured video, a grid tile, a tip button, a product or an RSS feed, with the fields the editor has for it. Its section is added to the page after the existing ones when it is new. Plan rules, as in the editor: the Products, Tipping and RSS feed sections (and the email form and auto-add posts) need the Influencer plan or above, and each list holds at most a number of items per plan (Free: 5 links, 5 social icons, 1 featured video, 9 grid tiles, no products, tips or feeds; Influencer: 25, 15, 3, 24, 10 products, 5 tips, 2 feeds; Business: 50, 25, 10, 50, 30, 10, 5; Agency: 100, 50, 20, 100, 75, unlimited tips, 10; Enterprise: 200, 100, 50, 200, 150, unlimited tips, 20). A page over a limit from an earlier plan keeps its items; only adding past the limit is refused. Below Influencer, as the editor locks those sections, a product, tip or RSS feed already on the page can be removed but not changed. In Copilot it can be undone until the page is edited again, unless the plan no longer allows what the undo would put back; over MCP there is no undo. The email form, the auto-add posts section and the contact card are set with update_bio_page or in the editor; sections cannot be reordered here. | `biolinks:write` | reversible write | yes |
| `create_bio_page` | Creates a link-in-bio page in the active social set, as the app's editor would: profile name and bio, the design (a Design tab theme or its own colours, fonts and buttons; the app's default when omitted), profile picture, branding, and optionally the first links and social icons; more blocks with add_block. The page is public at its URL as soon as it exists. The plan's page limit and the editor's plan rules apply: a chosen slug needs Influencer, hiding the branding needs Business, and links and icons are capped per plan. In Copilot it can be undone (the page is deleted again) until a custom domain is attached; over MCP there is no undo. | `biolinks:write` | reversible write | yes |
| `delete_bio_page` | Deletes a bio page with its custom domain; its URL stops working. Its subscribers, its analytics history and its auto-add channel settings are deleted with it, as in the app (the result counts them); export_subscribers first to keep the list. There is no undo. In Copilot the member confirms every time; over MCP no card is shown, so confirm with the person first. | `biolinks:write` | always ask |  |
| `export_subscribers` | A bio page's subscribers as CSV text with the app's columns (Email, Name, Phone, Subscribed On, in UTC as yyyy-MM-dd HH:mm:ss), newest first, with the app's search and date filters; up to maxRows rows (default 1,000) across pages, truncated when more exist. Returns text, not a file. There is no plan check, as in the app (whose export takes the page of rows on screen). | `subscribers:read` | read |  |
| `get_bio_analytics` | A bio page's traffic over a period, the numbers of the app's analytics tab: overview (views, unique visitors, clicks, click-through rate, sessions, average session length, bounce rate, scroll depth), the 50 most clicked links with their click-through rate (truncatedLinks says when there are more), the daily series, the 20 countries and 20 cities with the most views (truncatedCountries says when more countries had views), devices, browsers, referrers and UTM campaigns, and activity by hour and weekday. Overview covers up to 365 days; the other parts at most 91 days (first and last day no more than 90 days apart), as in the app, and are left out for a longer period. It needs the Influencer plan or above, as the app's analytics tab and its endpoints. | `biolinks:read` | read |  |
| `get_bio_page` | One bio page as the editor shows it: URL and domain, profile (title, bio, image), theme (selectedPreset is the Design tab theme it was set from; the stored preset key, which nothing reads, is left out), sections in order, every content list with item ids for update_block and remove_block (links, social icons, media, grid, tipping, products, RSS feeds), the email form's texts and its integration, pixels, settings, contact card, auto-add limit and linked channels (their ids and display settings). The email form's field order, labels, colours and default country are not included. | `biolinks:read` | read |  |
| `get_custom_domain` | A bio page's custom domain and its live status, with the DNS records the member still has to add at their registrar. Unless the domain is already AVAILABLE the status is checked with the hosting now and saved on the page, as the editor's refresh does; that save counts as an edit, so a Copilot undo of an earlier change to this page is refused afterwards. Statuses: CREATING, REQUESTING_CERTIFICATE, PENDING_VERIFICATION, PENDING_DEPLOYMENT, AVAILABLE, FAILED, or UNKNOWN when none is stored; a page without a custom domain has status NONE, no records and its Viraly URL. checkedAt is the last check with the hosting. A field with no value is left out of the result: requestedAt always (no request time is recorded), checkedAt before the first check. | `biolinks:read` | read |  |
| `list_bio_integrations` | The email and CRM integrations (for example Mailchimp, HubSpot, Kit) connected to the active social set that a bio page's email form can send new subscribers to; update_bio_page emailIntegrationId attaches one. Pixel and tag integrations are not listed; those are set per page with pixelTracking. | `biolinks:read` | read |  |
| `list_bio_pages` | The link-in-bio pages of the active social set: id, title, slug, public URL, custom domain with its status (the domain serves the page only when AVAILABLE), auto-add limit and dates. | `biolinks:read` | read |  |
| `list_subscribers` | People who signed up on a bio page's email form, newest first: id, name, email, phone and when; paged (page, pageSize), with the total and hasMore, and the app's search and date filters. | `subscribers:read` | read |  |
| `remove_block` | Removes an item (link, social icon, video, grid tile, tip button, product or RSS feed) from a bio page. A section left empty disappears from the page, as on the editor's save, except the links section while the page auto-adds posts (they show in its place) and the RSS feed section, which the editor keeps. In Copilot it can be undone until the page is edited again, unless the plan no longer allows what the undo would put back; over MCP there is no undo. | `biolinks:write` | reversible write | yes |
| `remove_custom_domain` | Releases a bio page's custom domain: the page serves from its Viraly URL (get_bio_page url) again and the domain's certificate is dropped; requesting it again starts verification over. Subscribers and analytics stay. This counts as an edit of the page, so a Copilot undo of an earlier change to it is refused afterwards. There is no undo. In Copilot the member confirms every time; over MCP no card is shown, so confirm with the person first. | `biolinks:write` | always ask |  |
| `request_custom_domain` | Starts serving a bio page on the member's own domain (Enterprise plan only, as in the app). It returns the DNS records the member must add at their registrar; get_custom_domain checks the status, and the domain serves the page once AVAILABLE. A page has one domain; remove_custom_domain releases it. This counts as an edit of the page, so a Copilot undo of an earlier change to it is refused afterwards. In Copilot it can be undone (the domain is released); over MCP there is no undo. | `biolinks:write` | reversible write | yes |
| `update_bio_page` | Changes a bio page's profile (name, bio, picture), URL slug, design (a Design tab theme, colours, fonts, buttons, background), branding, auto-add limit, tracking pixels, contact card, email integration or branded tip colours; what is not given stays. The editor's plan rules apply to what changes: a new slug, pixels and the email form need Influencer (below it the form's integration cannot be changed, only detached), hiding the branding needs Business; a page that already has them from an earlier plan keeps them. The result lists each change with its value before (a dash when there was none). In Copilot it can be undone until the page is edited again, unless the plan no longer allows what the undo would put back; over MCP there is no undo. Blocks are changed with add_block, update_block and remove_block; the email form's texts and the auto-add channel settings are edited in the app. | `biolinks:write` | reversible write | yes |
| `update_block` | Changes an item of a bio page (a link, social icon, video, grid tile, tip button, product or RSS feed): its text, URL, image, colour, platform, product or feed fields, or its position in its list. What is not given stays; the result lists each change with its value before. Sections cannot be reordered here. In Copilot it can be undone until the page is edited again, unless the plan no longer allows what the undo would put back; over MCP there is no undo. | `biolinks:write` | reversible write | yes |

#### short_links

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_short_link` | Shortens a URL with the workspace's default shortener (or the one given) and returns the short URL to put in a caption. A link not used in a post is switched off 24 hours later: pass its id as shortenedUrlIds to create_draft, schedule_post or update_post, or give postId here. An existing active link for the same URL is returned instead of a new one (reused: true) and cannot be undone away. A new link counts against the plan's monthly short links (Free 50, Influencer 500, Business 5,000, Agency 25,000, Enterprise unlimited); a custom back-half needs Business or above. In Copilot a new link can be undone (it is deleted); over MCP there is no undo. | `url_shortener:write` | reversible write | yes |
| `delete_short_link` | Deletes a short link from Viraly with its click history and post associations. A Viraly link stops resolving, including in posts already published; a Bitly, Dub or Rebrandly link keeps resolving at the provider. There is no undo. In Copilot the member confirms every time; over MCP no card is shown, so confirm with the person first. | `url_shortener:write` | always ask |  |
| `get_short_link_stats` | Clicks on one short link: total; by day for the last 60 days that had clicks (UTC days, days without clicks left out); the top 10 countries and top 10 cities; by device and operating system; and the first 10 posts that carry it (postCount has them all). truncated says which lists were cut. Only Viraly's own redirect counts clicks, so a Bitly, Dub or Rebrandly link always shows 0 here; see its clicks at that provider. | `url_shortener:read` | read |  |
| `get_shortener_settings` | Which shortener the workspace uses by default (Viraly's own, Bitly, Dub or Rebrandly), which providers are connected with their default domain, and which one and which domain new links are made with: a default that is not connected falls back to Viraly's own. | `url_shortener:read` | read |  |
| `get_url_preview` | What a link shows when shared: its page title, description, site and one image (the composer can also list every image on the page; this tool cannot). | `url_shortener:read` | read |  |
| `list_short_links` | The workspace's active short links, newest first: id, short code, short URL, original URL, clicks counted by Viraly's redirect and the shortener that made it; paged, with the total and hasMore. Links switched off (unused after 24 hours) are not listed. | `url_shortener:read` | read |  |
| `set_default_shortener` | Chooses which connected shortener the workspace makes links with by default, and for Bitly, Dub or Rebrandly the domain they are made on (get_shortener_settings shows the connected ones). A provider not connected in the app is refused. In Copilot it can be undone; over MCP there is no undo. | `url_shortener:write` | reversible write | yes |

#### ideas

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_draft_from_idea` | Turns an idea into a draft on a channel: the idea's caption as the text (its title when the caption is empty), its title as the post title and the Pinterest, YouTube, TikTok or LinkedIn document title, its tags as the post's categories, and its media attached; title, categoryIds, mediaIds, mediaUrls, boardId and config replace what the idea gives. The app's idea card opens the composer with the caption and title only and leaves the idea as it is; this tool also copies the tags and media and marks the idea Scheduled. The draft is validated like any post and counts against the plan's monthly post quota, refused once the month is full. The result has the draft's caption, title, status, media count and categories. In Copilot undo deletes the draft while it is still one and puts the idea's status back. Over MCP there is no card and no undo. | `posts:write` | reversible write | yes |
| `create_idea` | Saves an idea on a board of the active social set as a Draft, with its title, caption, notes, link, planned date, media (finished library files) and tags (categories), at the top of the board as the app does; the idea.created webhook fires. The app's idea modal edits the title, caption, date, board and media only. In Copilot undo deletes it again. Over MCP there is no card and no undo. | `ideas:write` | reversible write | yes |
| `delete_idea` | Deletes an idea, as the app's delete does (no webhook). In Copilot undo saves it again on its board with its text, date, media, tags, status and position, under a new id with the undoing member as its creator (the app has no undo; the idea.created webhook fires again). Over MCP there is no card and no undo, so the idea is gone for good. | `ideas:write` | reversible write | yes |
| `generate_ideas` | Suggests one post idea (two to four sentences) for a business and audience with the app's idea generator; call it again for another. Returns text; create_idea saves the ones the member likes. | `posts:write` | read |  |
| `get_idea` | One idea in full, as the app's idea modal shows it: id, board, title, the whole caption and notes, link, planned date, status, order, tags, its media with type, name and thumbnail, the id of the member who made it, and when it was made and last changed. | `ideas:read` | read |  |
| `list_idea_boards` | The idea boards of the active social set (id, name, description, colour, order) with how many ideas each holds. A set with no boards gets the app's four default boards on the first call, with the app's two sample ideas on the Unassigned board, as the Ideas page does on its first visit. | `ideas:read` | read |  |
| `list_ideas` | The ideas on one board in the board's order, or the ideas planned in a date range across the set's boards: id, title, caption (cut at 300 characters) and notes (cut at 200), with captionTruncated and notesTruncated saying when they were cut, link, planned date, status, order, tags and media ids; paged (50 by default, up to 100), with the total and hasMore. get_idea reads one idea in full; read it before editing a cut text with update_idea. | `ideas:read` | read |  |
| `update_idea` | Changes an idea's title, caption, notes, link, status, planned date, board, media, tags or position; what is not given stays, and clear removes a caption, notes, link or date. Saving the idea from the app's modal keeps its notes and link; a move between boards in the app's board view clears its planned date, as the app sends none. The result lists the media added, removed and kept. In Copilot undo puts the idea back as it was, unless one of its earlier files has been removed from the library since. Over MCP there is no card and no undo. | `ideas:write` | reversible write | yes |

#### feeds

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_draft_from_feed_item` | Drafts a post sharing a feed item on a channel, prefilled as the app's Create post does (title, summary and link), with what the composer then lets the member add: media (the item's image, library files or links), a Pinterest board, a title, categories and platform settings. The item's image is attached by default only where the platform needs media (Instagram, Pinterest, TikTok); on Facebook, X, LinkedIn, Threads, Bluesky, Mastodon and Google Business the default keeps the app's text and link card, and includeImage true attaches it. The draft is validated like any post and counts against the plan's monthly post quota, refused once the month is full. It marks the item used unless told not to. The result has the draft's caption, title, status, media count and categories. In Copilot undo deletes the draft while it is still one and puts the item back (an image imported for it stays in the library after undo). Over MCP there is no card and no undo. | `posts:write` | reversible write | yes |
| `list_feed_items` | The items of a feed, newest first (a feed keeps its newest 100): id, title, link, summary (cut at 300 characters), image link, published date and status (Unread, Read, or Scheduled once used for a post); paged, with the total and hasMore. | `feeds:read` | read |  |
| `list_feeds` | The RSS and Atom feeds the active social set follows: id, name, URL, description, collection (id and name), status, unread and item counts, last fetch and fetch error; optionally one status or one collection. collections lists the set's feed collections, empty ones included, for subscribe_feed's feedCollectionId. | `feeds:read` | read |  |
| `subscribe_feed` | Follows an RSS or Atom feed in the active social set so its items appear in Feeds, as the app's add dialog does: the feed is fetched and parsed first and refused when it cannot be read, and its items are fetched. It goes last in its collection. In Copilot undo stops following it again. Over MCP there is no card and no undo. | `feeds:write` | reversible write | yes |
| `unsubscribe_feed` | Stops following a feed and deletes its items with their read and used states, as the app's delete does. In Copilot undo follows it again with its name, description and collection, last in that collection and Active, and its items are fetched afresh with their states starting over. Over MCP there is no card and no undo, so the feed and its items are gone for good. | `feeds:write` | reversible write | yes |

#### approvals

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `list_pending_approvals` | Posts of the active social set in the approval workflow, earliest scheduled time first (the app reviews them in the calendar, filtered by status): by default the ones waiting for this member to approve; through an API connection, which has no member, give filter All. Each with its approval: who asked and when, the rule (all must approve, or N of M), every approver's decision with its time and comment (a rejection's reason), and whether it is resolved, plus the post's error if it has one. Paged; hasMore says when there is another page. | `posts:read` | read |  |
| `list_post_comments` | The team's internal comments on a post (not comments from the network), oldest first, as the post's comment thread shows them: who wrote each, its full text (up to 5,000 characters; a mention is written in it as @[userId], which the app shows as the member's name), when it was edited, the members mentioned in it and its attachments. | `posts:read` | read |  |

#### evergreen

| Tool | What it does | Scope | Risk | Undo |
|---|---|---|---|---|
| `create_evergreen_schedule` | Makes a post evergreen, as the composer's Recycle does: Viraly schedules copies of it every so many days from the post's own time (or at chosen times), until a count or an end date, rotating the caption variations. The copies are generated at once and publish by themselves; nothing extends the series later. The first copy must fall in the future: for a post published long ago, give customDatesLocal. For a draft, the copies still publish on their dates; the draft itself does not. Not for YouTube or TikTok posts (the app skips them) or for a recycled copy. A post that is already evergreen is changed with update_evergreen_schedule. pause_evergreen_schedule holds the copies and stop_evergreen_schedule ends the schedule (the app's Stop recycling). In Copilot undo removes the schedule and every copy not yet published; over MCP there is no card and no undo, so use stop_evergreen_schedule to take it back. | `posts:write` | reversible write | yes |
| `list_evergreen_schedules` | The evergreen schedules of the active social set, as the Recycled content page lists them: the post with its channel and thumbnail, every how many days (0 with customDatesLocal), the caption variations, the limit and end date, whether paused, and the copies (generated so far, scheduled, published, drafts; the original is not counted). Paged; hasMore says when there is another page. | `posts:read` | read |  |
| `list_recycled_content` | The copies of an evergreen post, earliest first: published ones and the ones still scheduled or drafted, each with its local time and status. The original post is named apart, not counted as a copy. Give the original's id: a recycled copy or a post with no evergreen schedule is refused. Paged; hasMore says when there is another page. | `posts:read` | read |  |
| `pause_evergreen_schedule` | Pauses an evergreen schedule, as the Recycled content page's Pause does: every copy not yet published (scheduled, drafted, awaiting approval, being processed or being published) becomes a draft, so no copy publishes. The original post keeps its status: a scheduled original still publishes at its time (cancel_post or delete_scheduled_post stops it). Resume (resume true) schedules again the drafted copies whose time is still ahead, deletes those whose time passed while paused, and keeps as drafts those whose media is not usable. Neither makes new copies. To end recycling for good, use stop_evergreen_schedule. In Copilot undo does the opposite (a resume after a pause also deletes the copies whose time passed, and copies that were awaiting approval or drafted before the pause come back scheduled); over MCP there is no card and no undo. | `posts:write` | reversible write | yes |
| `stop_evergreen_schedule` | Stops an evergreen schedule for good, as the Recycled content page's Delete Schedule does (keeping the original post): the schedule is removed, every copy still scheduled or drafted (a paused schedule's copies too) is deleted, and the copies already published, failed, awaiting approval or being published stay as ordinary posts. The original post stays as it is; delete it separately with delete_scheduled_post or delete_draft. The result counts the copies deleted and kept. It cannot be undone; to hold the copies for a while, use pause_evergreen_schedule. In Copilot the member confirms every time; over MCP no card is shown, so confirm with the person first. A post with no schedule (one already stopped) answers not found. | `posts:write` | always ask |  |
| `update_evergreen_schedule` | Changes an evergreen schedule as the Recycled content page's edit dialog does: the interval or the copy times, the limit or end date, the caption variations. What is omitted stays as it is. Copies are made only when the interval or the copy times change: then the scheduled and drafted copies with a future time are deleted and made again from the post's own time, and the count so far starts over (copies awaiting approval or being published stay, outside the new series). On a paused schedule the new copies are drafts and it stays paused: nothing publishes until a resume. A lower limit deletes the latest copies not yet published beyond it (published copies are not counted against it); a higher limit, a later end date or removeLimit adds no copies, and the result's note says so. In Copilot undo puts the settings back, but copies a lower limit deleted are not made again and an interval change is undone by making the copies again; over MCP there is no card and no undo. To end the schedule, use stop_evergreen_schedule. | `posts:write` | reversible write | yes |
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
