# Architecture

## Layout

```
index.tsx           plugin definition: patches, events, commands, menus, toolbox
native.ts           desktop network helper with a host allowlist
settings.tsx        settings and the Rayward → Raycord migration
styles.css          all styles, scoped under vc-rw-
lib/                constants, formatting, transport, markdown summary, command embeds
data/               lookups, caching, verdicts, the send guard
  mock.ts           test lab registry and interceptors
  mockPresets.ts    test lab presets
lib/testSession.ts  test lab DMs and profiles, client-side only
components/
  brand/            logos, status icons, small icons
  report/           profile section, report modal and its tabs
  chat/             member list and chat markers, chat warning, send confirmation
  settings/         source switches and the optional integration modal
  testlab/          test lab editors and controls
  shared.tsx        tabs, tooltips, chips and states used everywhere
assets/             bundled images, inlined at build time
tests/              data layer tests, run with node:test
```

## Request path

`lib/transport.ts` makes a single request with a 10 second timeout and returns transport failures as values instead of throwing. Error objects don't survive IPC, so this matters. On desktop the request runs in the main process through `native.ts`, which only allows the hosts listed in [privacy.md](privacy.md). On web it runs in the page.

`data/http.ts` wraps that with retries and rate limiting:

- Timeouts, connection failures and 500, 502, 503 and 504 responses are retried twice, after about 0.4 and 1.2 seconds with jitter.
- A 429 is retried once if `Retry-After` is 10 seconds or less.
- Each Rayward source has its own rate limit, so the governor tracks them separately. It slows down when `X-RateLimit-Remaining` gets close to zero rather than waiting to be told.

Failed responses become typed errors (`data/errors.ts`): config, auth, quota, rate, server, network, timeout, parse or client. Missing keys, rejected keys and quota problems block every source at once, so the UI shows one message for them instead of a row per source.

## Stores

`data/store.ts` is a small keyed cache used for every kind of lookup. It handles:

- a TTL, persisted to IndexedDB through Vencord's DataStore
- de-duplication of identical requests in flight
- batching: keys requested within 120 ms go out together
- at most four requests in flight per store
- a backoff for failed keys (30 seconds, 2 minutes, 10 minutes), so scrolling past a broken source doesn't hammer it
- coalesced notifications, so a batch of 100 results re-renders each subscriber once

Rayward lookups (`data/rayward.ts`) use one store per subject, Discord or Roblox, with keys shaped `source:id`. Each source caches, fails and retries on its own, which is why one source being down never hides the others. Sources that support batching get one request per 100 IDs. Others are asked one ID at a time, and a 404 for a single ID means "no record".

The source list (`data/providers.ts`) is cached for an hour. If refreshing it fails, the last known list keeps working.

## From results to a verdict

`data/verdict.ts` turns each source's result into a tone (safe, under review, provisional, mixed or flagged) and, for results the source marks actionable, a severity. A report's verdict combines the Discord account, every linked Roblox account and any optional integrations. It also keeps a list of findings for tooltips and a list of sources that failed.

`data/hooks.ts` builds a report synchronously from whatever is cached and lists the keys still worth fetching. The React hook (`useRayward`) and the async resolver used by commands and the send guard both run on that one function, so the UI and the guard can't disagree. The resolver follows linked Roblox accounts as Rotector's answer arrives.

## Test lab

The test lab intercepts lookup stores in `data/store.ts` for IDs in its local registry. Mock Discord and Roblox IDs are answered client-side and never reach the network. Fake DMs and profiles are materialized in the current Discord client only.

## Send guard

Discord's chat input fires Vencord's pre-send event, but the "Wave to ..." button and the sticker picker call `sendGreetMessage` and `sendStickers` directly. `data/guard.ts` wraps both functions while the plugin runs and restores them when it stops. All three paths share one check:

- It only applies in DMs, and only before your first message there.
- It waits at most three seconds for a verdict. A slow API never blocks sending.
- Concurrent sends to one channel share a single prompt.
- After "Send anyway", further sends in that channel go through for a minute.

## UI

Source cards, overview rows and Roblox accounts share one card component. Lists use CSS subgrid, so names, summaries and statuses line up across cards, and a container query hides summaries in narrow profile popouts. Colors are mixed from the inherited text color instead of Discord's opaque backgrounds, which keeps them readable on Nitro profile themes and custom Vencord themes. Light and dark logos switch on the nearest theme class through inherited custom properties, so a light profile inside a dark client gets the right one.
