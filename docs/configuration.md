# Configuration

Settings are under **Settings > Vencord > Plugins > Raycord**. Changes apply right away unless noted.

## Signing in

Raycord needs a Rayward API key. When there's no key, the sign-in window opens once on its own; after that, use **Sign in** in settings, in the profile section or in the Vencord toolbox. Raycord checks the key before saving it:

1. It has to look like an API key (`rwd_...`). Extension sign-in tokens are refused.
2. Rayward's account endpoint must not accept it, since only extension sessions pass there.
3. A test lookup of your own Discord account has to succeed.

Your key is rechecked quietly once a day. If Rayward rejects it, the profile section asks you to sign in again.

On the Add Friend page Discord only knows a username, so the friend warning only appears when Discord already knows who that is.

## Lookups

| Setting | Default | What it does |
|---|---|---|
| Rayward account | not signed in | Sign in with your API key from rayward.app. Nothing is checked until you do. Settings only show the key masked. Signing in or out clears the cache. |
| Sources | Rayward's defaults | One switch per source. New sources follow Rayward's default until you change them. |
| Roblox accounts | on | Shows names and avatars of linked Roblox accounts in reports. |

## Profiles

| Setting | Default | What it does |
|---|---|---|
| Profile section | on | The Rayward section in profiles and DM sidebars, and the Rayward tab in full profiles. Needs a restart. |
| Start expanded | on | Opens the profile section expanded. |
| Default tab | Overview | Overview, Sources or Roblox. |

## Member list and chat

| Setting | Default | What it does |
|---|---|---|
| Member list markers | off | Marks flagged users in the member list. Checks everyone who scrolls into view. |
| Friends page markers | on | Marks flagged users on the Friends page, including pending requests. Follows Skip friends. |
| Chat markers | off | Marks flagged message authors. |
| Marker style | Icon | Icon, Dot or Pill. |
| Marker level | Moderate | Lowest level that shows a marker. |

Both check every user you can see, which adds up in big servers. Results are cached, so scrolling back doesn't check again.

## Warnings

| Setting | Default | What it does |
|---|---|---|
| Send warning | on | Asks before your first message, sticker or wave to a flagged user in a DM. |
| Friend warning | on | Asks before you add, request or accept a flagged user as a friend. Declining and blocking aren't checked. |
| Send warning level | Moderate | Lowest level that triggers it. |
| Chat warnings | off | A banner under a flagged user's first message, once per channel. |
| DM notifications | off | Notifies you when a flagged user DMs you, once per session. |
| Chat warning level | High | Lowest level for chat warnings and DM notifications. |
| Skip bots | on | No section, markers or warnings for bots, and no "Rayward report" menu item. |
| Skip friends | off | No markers or warnings for friends. Their profiles still show results. |

The warning only appears if you've never messaged that person. If the check takes more than three seconds, your message goes through. "Don't warn me about this person again" skips them from then on; **Rayward: Reset send warnings** in the Vencord toolbox undoes that for everyone.

## Flag levels

Reports show every result, but only results a source marks as actionable count toward the levels above. Mixed, provisional and under review results don't trigger warnings.

| Level | Comes from |
|---|---|
| Severe | A source's most serious actionable status |
| High | Other actionable statuses, or an optional integration's ERP flag |
| Moderate | Other optional integration flags |

## Cache

**Cache duration** sets how long results are kept, from 5 minutes to 7 days (default 1 day). Failed lookups aren't cached. A failing source is retried after 30 seconds, 2 minutes, then 10 minutes, or right away when you press retry. **Clear cached results** in settings, or **Rayward: Clear cache** in the toolbox, empties it.

## Commands and shortcuts

| Where | What |
|---|---|
| `/rayward [user]` | Report for a Discord user, or you. Only you see the reply. |
| `/rayward-roblox <id>` | Results for a Roblox user ID. |
| `/rayward-group <id>` | Results for a Roblox group ID. |
| Right-click a user > Rayward report | Opens the full report. |
| Vencord toolbox | Sign in, Check yourself, Clear cache, Reset send warnings, Test lab. |

## Test lab

**Rayward: Test lab** in the Vencord toolbox creates fake accounts with a DM, a profile and editable results from every source. They only exist in your client and are never sent to Discord or Rayward. Use the presets for common cases, edit any source's result, give the account a custom avatar, add Roblox accounts and alts, and send messages as the fake account. Clearing a conversation resets its first-message warnings. **Stop and delete all** removes everything.
