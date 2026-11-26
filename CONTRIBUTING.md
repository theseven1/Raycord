# Contributing

Thanks for helping out.

## Before you start

For anything bigger than a small fix, open an issue or discussion first so we can agree on the approach. Problems with a specific flag go to the source that issued it.

## Setup

The plugin builds inside a Vencord checkout, the same way users install it.

```sh
git clone https://github.com/Vendicated/Vencord.git
cd Vencord
pnpm install --frozen-lockfile
git clone https://github.com/<you>/Rayward-Vencord-User-Plugin.git src/userplugins/rayward
pnpm build --dev
pnpm inject
```

`pnpm watch` rebuilds on save. Reload Discord with Ctrl+R to pick up changes. [docs/development.md](docs/development.md) has more on debugging and testing against a live client.

To try a change by hand, open **Rayward: Test lab** from the Vencord toolbox. It gives you fake accounts with any result you want, no API key needed.

## Checks

Run these from the Vencord root before opening a pull request. CI runs the same steps against the latest Vencord.

```sh
node src/userplugins/rayward/.github/scripts/lint.mjs src/userplugins/rayward
pnpm exec tsc --noEmit
pnpm build
pnpm buildWeb
node --test src/userplugins/rayward/tests/*.test.mjs
```

The lint script applies Vencord's own oxlint rules (minus the path alias rule, which only makes sense for Vencord's built-in plugins). Add a test in `tests/` when you change how lookups, caching or verdicts behave.

## Code style

- Follow the patterns already in the file you're editing.
- Source files carry the license header and no other comments. If something needs explaining, try a clearer name or a smaller function first. If it still needs words, put them in the pull request description or in `docs/architecture.md`.
- Keep user-facing text short and in sentence case.
- Never commit API keys, secrets, or real people's Discord or Roblox IDs, including in tests and screenshots.

## Commits and pull requests

Pull request titles follow [Conventional Commits](https://www.conventionalcommits.org), and a check enforces it. Pull requests are squash merged, so the title becomes the commit on `main`.

| Prefix | Use for | Release |
|---|---|---|
| `feat:` | New behavior users can see | minor |
| `fix:` | Bug fixes | patch |
| `perf:` | Faster or lighter, same behavior | patch |
| `refactor:`, `test:`, `docs:`, `ci:`, `chore:` | Everything else | none |

Add `!` after the type (`feat!:`) for a change that breaks existing settings or behavior.

Keep pull requests focused on one change. Update the docs in the same pull request when settings or behavior change.

## Releases

Releases are automated with release-please. Merging to `main` keeps a release pull request up to date with the next version and changelog. Merging that pull request tags the release, publishes it, and attaches a zip, its SHA-256 checksum and a build provenance attestation.

## Code of conduct

Everyone taking part is expected to follow the [code of conduct](CODE_OF_CONDUCT.md).
