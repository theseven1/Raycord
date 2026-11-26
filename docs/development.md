# Development

## Setup

Follow the source install in [installation.md](installation.md), but clone your fork and build in dev mode:

```sh
git clone https://github.com/<you>/Rayward-Vencord-User-Plugin.git src/userplugins/rayward
pnpm build --dev
pnpm inject
pnpm watch
```

Dev builds are unminified and include Vencord's developer plugins. Reload Discord with Ctrl+R after each rebuild. Console messages from the plugin are labelled Raycord.

For a disposable client, the browser build works well: `pnpm buildWeb --dev`, load `dist/chromium-unpacked` and log in with a test account.

## Tests

```sh
node --test src/userplugins/rayward/tests/*.test.mjs
```

The tests bundle the real `data/` modules with esbuild, swap Vencord and Discord modules for the stubs in `tests/stubs/`, and run them against a fake Rayward API. Add a case when you change lookups, retries, caching or verdicts. Run them from the Vencord root so `esbuild` resolves from Vencord's dependencies.

## Test lab

**Rayward: Test lab** in the Vencord toolbox creates fake accounts, each with a DM and a profile. Their results come from the presets and editors, so you can check every state without an API key or a real flagged account. Typing in a fake DM, waving and sending stickers stay local, and the send warning works as usual. **Stop and delete all** removes the DMs, profiles and saved session.

## Linting

```sh
node src/userplugins/rayward/.github/scripts/lint.mjs src/userplugins/rayward
```

Vencord's lint config skips `src/userplugins`, so the script copies the plugin into a temporary folder under `src/plugins`, runs oxlint with Vencord's rules except the path alias rule, and removes the copy.

## CI

| Workflow | Runs | Checks |
|---|---|---|
| CI | Every push and pull request | Lint, type check, desktop and web builds, tests, all against Vencord `main` |
| Vencord compatibility | Daily | The same build. It opens an issue when Vencord changes break the plugin and closes it once the build passes again |
| CodeQL | Push, pull request, weekly | Static analysis of the plugin and the workflows |
| Scorecard | Weekly | OpenSSF supply chain checks |
| Dependency review | Pull requests | Known vulnerabilities in new action versions |
| PR title | Pull requests | Conventional commit format |

Actions are pinned to commit SHAs. Dependabot opens a grouped update each week.

## Releasing

1. Merge pull requests with conventional titles into `main`.
2. release-please keeps a release pull request open with the next version and changelog.
3. Merge it. That tags `vX.Y.Z`, publishes the release, and attaches `rayward-vX.Y.Z.zip`, its checksum and a provenance attestation.

The zip holds the plugin files, README and LICENSE in a `rayward/` folder, ready to drop into `src/userplugins/`.
