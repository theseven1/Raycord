# Privacy

The plugin runs in your Discord client and has no server of its own. These are the only hosts it contacts.

## What leaves your client

| Host | What it receives | When |
|---|---|---|
| `roscoe.rayward.app` | Discord user IDs and linked Roblox IDs, with your API key | When someone is checked (see below) |
| `roscoe.rayward.app` | Nothing identifying | Loading the source list and logos |
| `roscoe.rayward.app` | Your API key, and your own Discord ID for one test lookup | Signing in, and a quiet recheck once a day |
| `users.roblox.com`, `thumbnails.roblox.com`, `tr.rbxcdn.com` | Roblox IDs | Reports and `/rayward-roblox`, when "Roblox accounts" is on |
| `rayward.app` | Nothing identifying | The icon in command replies |

An optional integration is off by default and can only be turned on from the Vencord toolbox with a secret. When on, it sends linked Roblox IDs to its own service.

The test lab runs entirely in your client and sends nothing. Requests that mention its fake accounts are answered locally.

## When someone is checked

- You open their profile or DM sidebar, if the profile section is on.
- You open a DM with them, so the send warning doesn't have to wait.
- They DM you, if DM notifications are on.
- They scroll into view in the member list or chat, if markers are on. Both are off by default.
- They scroll into view on the Friends page, if Friends page markers are on.
- You add, request or accept them as a friend, if the friend warning is on.
- You run `/rayward` or open their report.

Background checks skip bots when "Skip bots" is on, and never include you. You're only checked when you open your own profile or run `/rayward` on yourself.

## What's stored locally

Results are cached in Vencord's local storage (IndexedDB) for the cache duration you pick, at most 7 days. Failed lookups aren't stored. Your API key and any integration secret are in Vencord's private plugin settings, so treat settings exports as sensitive.

Clearing the cache from settings or the toolbox deletes every stored result.

## On desktop

Requests go through a small helper in Discord's main process (`native.ts`). It refuses any host not listed above, and only those hosts are added to Discord's content security policy.
