# Configuration

Settings are under **Settings > Vencord > Plugins > Raycord**. Changes apply right away unless noted.

## Lookups

| Setting | Default | What it does |
|---|---|---|
| API key | empty | Your key from rayward.app. Nothing is checked without it. Changing it clears the cache. |
| Sources | Rayward's defaults | One switch per source. New sources follow Rayward's default until you change them. |
| Roblox accounts | on | Shows names and avatars of linked Roblox accounts in reports. |

## Profiles

| Setting | Default | What it does |
|---|---|---|
| Profile section | on | The Rayward section in profiles and DM sidebars. Needs a restart. |
| Start expanded | on | Opens the profile section expanded. |
| Default tab | Overview | Overview, Sources or Roblox. |

## Member list and chat

| Setting | Default | What it does |
|---|---|---|
| Member list markers | off | Marks flagged users in the member list. Checks everyone who scrolls into view. |
| Chat markers | off | Marks flagged message authors. |
| Marker style | Icon | Icon, Dot or Pill. |
| Marker level | Moderate | Lowest level that shows a marker. |

Both check every user you can see, which adds up in big servers. Results are cached, so scrolling back doesn't check again.

## Warnings

| Setting | Default | What it does |
|---|---|---|
| Send warning | on | Asks before your first message, sticker or wave to a flagged user in a DM. |
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
| Vencord toolbox | Check yourself, Clear cache, Reset send warnings, Test lab. |

## Test lab

**Rayward: Test lab** in the Vencord toolbox creates fake accounts with a DM, a profile and editable results from every source. They only exist in your client and are never sent to Discord or Rayward. Use the presets for common cases, edit any source's result, give the account a custom avatar, add Roblox accounts and alts, and send messages as the fake account. Clearing a conversation resets its first-message warnings. **Stop and delete all** removes everything.
