# Installation

Vencord only loads custom plugins from a build you make yourself. Vencord's own guide is [Installing custom plugins](https://docs.vencord.dev/installing/custom-plugins/); this is the short version.

## Installer

The quickest way. It installs Git, Node.js and pnpm if they're missing (Node.js, and Git on Windows, as portable copies that need no admin rights), finds your Vencord source folder or downloads one, installs Raycord, builds, patches Discord and offers to restart it. It also turns on daily updates.

Windows (PowerShell):

```powershell
irm https://github.com/theseven1/Raycord/releases/latest/download/install.ps1 | iex
```

Linux and macOS:

```sh
curl -fsSL https://github.com/theseven1/Raycord/releases/latest/download/install.sh | bash
```

To pass options, download the script first. On Windows you can also run `& ([scriptblock]::Create((irm https://github.com/theseven1/Raycord/releases/latest/download/install.ps1))) -Yes`.

| Windows | Linux and macOS | What it does |
|---|---|---|
| `-VencordDir PATH` | `--dir PATH` | Use this Vencord source folder |
| `-Branch NAME` | `--branch NAME` | Patch `stable`, `ptb` or `canary` instead of the one found |
| `-Yes` | `--yes` | Don't ask anything |
| `-NoSchedule` | `--no-schedule` | Don't turn on daily updates |
| `-NoInject` | `--no-inject` | Build only, don't patch Discord |
| `-NoRestart` | `--no-restart` | Don't restart Discord |
| `-Check` | `--check` | Show what it found, change nothing |
| `-Update` | `--update` | Update and rebuild if anything changed (what the daily task runs) |
| `-Uninstall` | `--uninstall` | Remove Raycord and the daily task |

Daily updates follow Raycord's releases and Vencord's main branch. They run once a day and at login: Task Scheduler on Windows ("Raycord Updater"), a systemd user timer or cron on Linux, launchd on macOS. Changes load the next time Discord starts. The log is `%LOCALAPPDATA%\Raycord\update.log` on Windows, `~/.local/share/raycord/update.log` on Linux and `~/Library/Application Support/Raycord/update.log` on macOS.

If Raycord is already in your Vencord folder under another name, for example a copy you're working on, the installer leaves it alone and only builds.

## Requirements

- [Git](https://git-scm.com)
- [Node.js](https://nodejs.org) 22 or newer
- [pnpm](https://pnpm.io) (`npm install -g pnpm` or `corepack enable`)
- A Rayward API key from [rayward.app](https://rayward.app/signin)

## Manual install

### From source

```sh
git clone https://github.com/Vendicated/Vencord.git
cd Vencord
pnpm install --frozen-lockfile
git clone https://github.com/theseven1/Raycord.git src/userplugins/raycord
pnpm build
pnpm inject
```

Vencord doesn't care what the folder under `src/userplugins/` is called. These docs use `rayward`.

`pnpm inject` asks which Discord install to patch. For other clients:

- Browser: run `pnpm buildWeb` and load `dist/chromium-unpacked` (or `dist/firefox-unpacked`) as an unpacked extension.
- Vesktop: run `pnpm build` and set Vesktop's Vencord location to the `dist` folder.

### From a release

1. Download `rayward-vX.Y.Z.zip` from the [latest release](https://github.com/theseven1/Rayward-Vencord-User-Plugin/releases/latest).
2. Optionally check it. The `.sha256` file has the checksum, and each zip has a build provenance attestation:
   ```sh
   gh attestation verify rayward-vX.Y.Z.zip --repo theseven1/Rayward-Vencord-User-Plugin
   ```
3. Unzip it into `Vencord/src/userplugins/`, so you get `src/userplugins/rayward/index.tsx`.
4. Build and inject as above.

## Turning it on

1. Restart Discord.
2. Open **Settings > Vencord > Plugins** and enable **Raycord**.
3. Sign in with your Rayward API key when the window opens, or from **Rayward account** in its settings.
4. Pick your sources. The list comes from Rayward, so new sources show up without an update.

Open any profile to see the Rayward section.

## Updating

From source:

```sh
cd src/userplugins/rayward
git pull
cd ../../..
pnpm build
```

From a release, replace the `rayward` folder with the new zip and build again. Restart Discord either way.

## Coming from Rayward

The plugin is now called Raycord. Your settings, API key and "don't warn me again" choices move over on first start.

## Uninstalling

Delete `src/userplugins/rayward` and run `pnpm build`. To remove Vencord too, run `pnpm uninject`.

## Troubleshooting

### The plugin isn't in the list

Make sure `index.tsx` is directly in `src/userplugins/rayward/`, not a folder deeper, then rebuild.

### "Sign in to Rayward"

There's no key yet. Press **Sign in** and paste the key from your Rayward account. Keys start with `rwd_`; the sign-in token from Rayward's browser extension won't work.

### "Your Rayward API key was rejected"

The key is wrong, expired or suspended, or your access isn't approved yet. Check it on rayward.app.

### A source shows "Error"

Hover it to see why. Server errors and timeouts retry on their own, or press the retry button on the card. Other sources keep working.

### A setting doesn't change anything

"Profile section" needs a Discord restart. Everything else applies right away.

Still stuck? Ask in [Discussions](https://github.com/theseven1/Rayward-Vencord-User-Plugin/discussions).
