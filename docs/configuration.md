# Configuration

Settings live under **Settings > Vencord > Plugins > Rayward**. Changes apply right away unless the table says otherwise.

## Lookups

| Setting | Default | What it does |
|---|---|---|
| Rayward API key | empty | Your key from rayward.app. Nothing is looked up without it. Changing it clears cached results. |
| Sources | Rayward's defaults | One switch per source Rayward offers. Sources added later follow Rayward's default until you change them. |
| Display linked Roblox accounts | on | Loads avatars and names for linked Roblox accounts in full reports. |

## Profiles

| Setting | Default | What it does |
|---|---|---|
| Show Rayward in profiles and DM sidebars | on | The Rayward section under a profile. Needs a restart. |
| Open the profile section by default | on | Starts the section expanded. |
| Tab to open in profile reports | Overview | Overview, Sources or Roblox. |

## Member list and chat

| Setting | Default | What it does |
|---|---|---|
| Check users visible in the member list | off | Looks up everyone who scrolls into view and marks flagged users. |
| Check users visible in chat | off | The same for message authors. |
| Indicator style | Icon | Icon, Dot or Pill. |
| Lowest flag level that displays an indicator | Moderate | Hides markers below this level. |

Both of these check every user you can see, which can mean a lot of lookups in big servers. Results are cached, so scrolling back doesn't repeat them.

## Warnings

| Setting | Default | What it does |
|---|---|---|
| Warn you before interacting with flagged user | on | Asks before your first message, sticker or wave to a flagged user in a DM. |
| Lowest flag level that triggers the warning | Moderate | |
| Show a warning under a flagged user's first message in a channel | off | One banner per person per channel. |
| Notify when a flagged user DMs you | off | A desktop notification, once per person per session. |
| Lowest flag level for chat warnings and DM notifications | High | |
| Skip bots | on | Bots get no profile section, markers or warnings. |
| Skip friends | off | Friends are skipped for markers and warnings. Their profiles still show results. |

The first message confirmation only appears when you've never sent a message in that DM. If the lookup takes longer than three seconds, the message goes through rather than blocking you. Ticking "Don't warn me about this person again" in the dialog skips that person from then on. To undo all of those, use **Rayward: Reset send warnings** in the Vencord toolbox.

## Flag levels

Every result is shown in reports, but only results a source marks as actionable count toward the levels above. Mixed, provisional and under review results show in reports and tooltips without triggering warnings.

| Level | Comes from |
|---|---|
| Severe | A source's most serious actionable status |
| High | Other actionable statuses, or an optional integration flag for ERP |
| Moderate | Other optional integration flags |

## Cache

The slider sets how long results are kept. (default 24 hours). Failed lookups are never cached. A failing source is retried after 30 seconds, then 2 minutes, then 10 minutes, or right away when you press retry. **Clear cached results** in settings, or **Rayward: Clear cache** in the toolbox, empties everything.

## Commands and shortcuts

| Where | What |
|---|---|
| `/rayward [user]` | Report for a Discord user, or yourself. Only you see the reply. |
| `/rayward-roblox <id>` | Results for a Roblox user ID. |
| `/rayward-group <id>` | Results for a Roblox group ID. |
| Right-click a user > Rayward report | Opens the full report. |
| Vencord toolbox | Check yourself, Clear cache, Reset send warnings, Test lab. |
