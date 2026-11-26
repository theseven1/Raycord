# Installation

Vencord only loads custom plugins from a build you make yourself. The official guide is [Installing custom plugins](https://docs.vencord.dev/installing/custom-plugins/); the steps below are the short version for this plugin.

## Requirements

- [Git](https://git-scm.com)
- [Node.js](https://nodejs.org) 22 or newer
- [pnpm](https://pnpm.io) (`npm install -g pnpm` or `corepack enable`)
- A Rayward API key from [rayward.app](https://rayward.app/signin)

## From source

```sh
git clone https://github.com/Vendicated/Vencord.git
cd Vencord
pnpm install --frozen-lockfile
git clone https://github.com/theseven1/Rayward-Vencord-User-Plugin.git src/userplugins/rayward
pnpm build
pnpm inject
```

The folder name under `src/userplugins/` doesn't matter to Vencord, but the rest of these docs assume `rayward`.

`pnpm inject` asks which Discord install to patch. For other clients:

- Browser: run `pnpm buildWeb` and load `dist/chromium-unpacked` (or `dist/firefox-unpacked`) as an unpacked extension.
- Vesktop: run `pnpm build`, then point Vesktop's Vencord location setting at the `dist` folder.

## From a release

1. Download `rayward-vX.Y.Z.zip` from the [latest release](https://github.com/theseven1/Rayward-Vencord-User-Plugin/releases/latest).
2. Check the download if you like. The `.sha256` file next to it has the expected checksum, and every release zip has a build provenance attestation:
   ```sh
   gh attestation verify rayward-vX.Y.Z.zip --repo theseven1/Rayward-Vencord-User-Plugin
   ```
3. Unzip it into `Vencord/src/userplugins/`. You should end up with `src/userplugins/rayward/index.tsx`.
4. Build and inject as above.

## Turning it on

1. Restart Discord.
2. Open **Settings > Vencord > Plugins** and enable **Raycord**.
3. Open its settings and paste your API key.
4. Pick the sources you want. The list loads from Rayward, so new sources show up without a plugin update.

Open anyone's profile and the Rayward section appears in it.

## Updating

From source:

```sh
cd src/userplugins/rayward
git pull
cd ../../..
pnpm build
```

From a release, replace the `rayward` folder with the new zip's contents and build again. Restart Discord after either.

## Coming from Rayward

The plugin was renamed to Raycord. Your settings, API key and "don't warn me again" choices carry over automatically on first start.

## Uninstalling

Delete `src/userplugins/rayward` and run `pnpm build` again. To remove Vencord entirely, run `pnpm uninject`.

## Troubleshooting

### The plugin isn't in the list

Check that `index.tsx` sits directly in `src/userplugins/rayward/`, not one folder deeper, then rebuild.

### "Add your Rayward API key"

The key field is empty. Paste the key from your Rayward account.

### "Your Rayward API key was rejected"

The key is wrong, expired or suspended, or your access hasn't been approved yet. Check it on rayward.app.

### A source shows "Error"

Hover it to see why. Server errors and timeouts are retried automatically. You can also press the retry button on that source's card, and the other sources keep working in the meantime.

### Nothing changes after editing settings

"Show Rayward in profiles" needs a Discord restart. Everything else applies immediately.

Still stuck? Ask in [Discussions](https://github.com/theseven1/Rayward-Vencord-User-Plugin/discussions).
