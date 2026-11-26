# Privacy

The plugin runs entirely in your Discord client and has no server of its own. The hosts below are the only ones it contacts.

## What leaves your client

| Host | What it receives | When |
|---|---|---|
| `roscoe.rayward.app` | Discord user IDs and linked Roblox IDs, with your API key | Whenever someone is looked up (see below) |
| `roscoe.rayward.app` | Nothing identifying | Loading the source list and source logos |
| `users.roblox.com`, `thumbnails.roblox.com`, `tr.rbxcdn.com` | Roblox IDs | Full reports and `/rayward-roblox`, when "Display linked Roblox accounts" is on |
| `rayward.app` | Nothing identifying | The icon in command replies |

An optional integration is off by default and enabled only from the Vencord toolbox with a secret. When enabled, it sends the IDs of linked Roblox accounts to its own service. The test lab is client-side only and sends nothing.

## When someone is looked up

- You open their profile or the DM sidebar, if the profile section is on.
- You open a DM with them. The plugin checks DM recipients in the background so the first message confirmation doesn't have to wait.
- They DM you, if DM notifications are on.
- They scroll into view in the member list or chat, if those markers are on. Both start turned off.
- You run `/rayward` or open their report.

Background checks skip bots when "Skip bots" is on, and they never include your own account. You are only looked up when you open your own profile or run `/rayward` on yourself.

## What's stored locally

Results are cached in Vencord's local storage (IndexedDB) for the time you choose, at most seven days, and then deleted. Failed lookups aren't stored. Your API key and optional integration secret are kept in Vencord's private plugin settings, so treat your settings exports as sensitive.

Clearing the cache from settings or the toolbox removes every stored result immediately.

## On desktop

Requests go through a small helper in Discord's main process (`native.ts`). It refuses any host outside the list above, and the same hosts are the only ones added to Discord's content security policy.
