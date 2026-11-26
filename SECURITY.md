# Security policy

## Supported versions

Only the latest release gets security fixes. Update before reporting, in case the problem is already fixed.

| Version | Supported |
|---|---|
| 1.x (latest) | Yes |
| Older | No |

## Reporting a vulnerability

Please don't open a public issue. Report it privately through [GitHub's advisory form](https://github.com/theseven1/Rayward-Vencord-User-Plugin/security/advisories/new), or message the maintainer on Discord (`_de.bug`) if you can't use GitHub.

Include what you found, how to reproduce it, and what an attacker could do with it. You'll get a reply within seven days. Once a fix is released, the advisory is published with credit to you unless you'd rather stay anonymous.

## Scope

In scope:

- Handling of the Rayward API key and the optional integration secret, which are stored in Vencord's private settings and sent only as request headers to their own hosts.
- The desktop network helper in `native.ts`, which only fetches from an allowlist of hosts.
- Rendering of data from Rayward, the sources and Roblox, for example markup or links that could run script or mislead.
- The first message confirmation, if it can be skipped without the user choosing to.

Out of scope:

- Whether a flag is correct. Contact the source that issued it.
- Rayward's API or a source's own service. Report those to their operators.
- Vencord or Discord themselves, unless this plugin makes the problem worse.
