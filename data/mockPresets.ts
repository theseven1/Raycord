/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ErrorKind } from "./errors";
import { type MockAccount, type MockResult, type MockRobloxAccount, mockSnowflake, type MockSource, newRobloxAccount, nowSeconds } from "./mock";
import type { DiscordGuildEvidence, RaywardProvider, RaywardReason } from "./types";

export type FlagTone = "safe" | "pending" | "provisional" | "mixed" | "unsafe" | "severe";

export const PRESETS = [
    { id: "clean", label: "Clean", description: "Checked everywhere, nothing found" },
    { id: "flagged", label: "Flagged", description: "One source flags the account and a linked Roblox account" },
    { id: "severe", label: "Severe", description: "Several high severity flags, an alt and another Discord account" },
    { id: "mixed", label: "Mixed", description: "A past offender record" },
    { id: "pending", label: "Under review", description: "Queued for review" },
    { id: "provisional", label: "Provisional", description: "Provisional flag with provisional reasons" },
    { id: "outage", label: "Partial outage", description: "Some sources fail while others answer" },
    { id: "blocked", label: "Key rejected", description: "Every source rejects the API key" },
    { id: "full", label: "Full demo", description: "Every field and every kind of evidence" },
] as const;

export type PresetId = typeof PRESETS[number]["id"];

const DAY = 86_400;

export function flagFor(provider: RaywardProvider, tone: FlagTone): number {
    const types = provider.flagTypes ?? [];
    switch (tone) {
        case "safe": return 0;
        case "provisional": return 4;
        case "mixed": return 6;
        case "pending":
            return types.find(t => t.tone === "pending" && t.value !== 4)?.value
                ?? types.find(t => t.value !== 0 && !t.safeToAction && t.value !== 4 && t.value !== 6)?.value
                ?? 1;
        case "unsafe": {
            const actionable = types.filter(t => t.safeToAction).sort((a, b) => a.severity - b.severity);
            return (actionable.find(t => t.severity < 9) ?? actionable[0])?.value ?? 2;
        }
        case "severe": {
            const actionable = types.filter(t => t.safeToAction).sort((a, b) => b.severity - a.severity);
            return actionable[0]?.value ?? 3;
        }
    }
}

const detector = (label: string) => ({ id: "test", label, summary: "Test lab detector" });

export function exampleServer(discordId: string, name = "Example server"): DiscordGuildEvidence {
    const now = nowSeconds();
    return {
        kind: "discordGuild",
        discordId,
        serverId: mockSnowflake(Date.now() - 400 * DAY * 1000),
        safeName: name,
        types: ["test"],
        name,
        tags: ["test"],
        messages: 128,
        typing: 14,
        reactions: 9,
        vcJoins: 2,
        joinedAt: now - 40 * DAY,
        firstSeen: now - 38 * DAY,
        lastSeen: now - DAY,
    };
}

export const textReason = (title = "Test reason with text evidence"): RaywardReason => ({
    type: "test-text",
    title,
    sources: [detector("Text check")],
    evidence: [{ kind: "text", text: "Example evidence written by the test lab." }],
});

export const outfitReason = (): RaywardReason => ({
    type: "test-outfit",
    title: "Test reason with an outfit",
    sources: [detector("Outfit check")],
    evidence: [{ kind: "outfit", outfitId: null, name: "Example outfit", category: "Avatar", description: "Example outfit description." }],
});

export const serverReason = (discordId: string): RaywardReason => ({
    type: "discord",
    title: "Member of flagged Discord servers",
    sources: [detector("Server check")],
    evidence: [exampleServer(discordId), exampleServer(discordId, "Second example server")],
});

export const userReason = (discordId: string): RaywardReason => ({
    type: "test-user",
    title: "Linked to another Discord account",
    sources: [detector("Link check")],
    evidence: [{ kind: "discordUser", discordId }],
});

const ok = (provider: RaywardProvider, tone: FlagTone, extra: MockResult = {}): MockSource =>
    ({ state: "ok", result: { flagType: flagFor(provider, tone), lastUpdated: nowSeconds() - 3 * DAY, ...extra } });

const failing = (kind: ErrorKind): MockSource => ({ state: kind });

function robloxFor(account: MockAccount, index: number, alt = false): MockRobloxAccount {
    const existing = account.roblox[index];
    const base = existing ?? newRobloxAccount(index + 1, alt);
    return { ...base, alt, sources: {}, servers: [], easi: null };
}

export function applyPreset(account: MockAccount, preset: PresetId, providers: RaywardProvider[]): MockAccount {
    const discordSources = providers.filter(p => p.capabilities.lookup && p.capabilities.discord);
    const robloxSources = providers.filter(p => p.capabilities.lookup);
    const [first, second, third, fourth, fifth] = discordSources;
    const rFirst = robloxSources[0];
    const now = nowSeconds();

    const next: MockAccount = { ...account, sources: {}, roblox: [], otherDiscord: [] };
    const roblox = (index: number, alt = false) => {
        const r = robloxFor(account, index, alt);
        next.roblox.push(r);
        return r;
    };

    switch (preset) {
        case "clean":
            for (const p of discordSources) next.sources[p.id] = ok(p, "safe");
            roblox(0);
            break;

        case "flagged": {
            if (first) next.sources[first.id] = ok(first, "unsafe", { reasons: [textReason(), serverReason(account.id)] });
            const r = roblox(0);
            if (rFirst) r.sources[rFirst.id] = ok(rFirst, "unsafe", { reasons: [outfitReason()] });
            break;
        }

        case "severe": {
            for (const p of [first, second]) if (p) next.sources[p.id] = ok(p, "severe", { reasons: [textReason("High severity test reason"), serverReason(account.id)] });
            const main = roblox(0);
            const alt = roblox(1, true);
            for (const p of robloxSources.slice(0, 2)) main.sources[p.id] = ok(p, "severe", { reasons: [outfitReason()] });
            if (rFirst) alt.sources[rFirst.id] = ok(rFirst, "unsafe", { reasons: [textReason()] });
            next.otherDiscord.push({ id: mockSnowflake(Date.now() - 300 * DAY * 1000), detectedAt: now - 20 * DAY, sources: [1] });
            break;
        }

        case "mixed":
            if (first) next.sources[first.id] = ok(first, "mixed", { reasons: [textReason("Past test reason")], headerMessage: "This account was flagged before and has since been cleared." });
            roblox(0);
            break;

        case "pending":
            if (first) next.sources[first.id] = ok(first, "pending", { queuedAt: now - 7200, processed: false, headerMessage: "This account is waiting for review." });
            roblox(0);
            break;

        case "provisional":
            if (first) next.sources[first.id] = ok(first, "provisional", { provisionalReasons: [textReason("Provisional test reason"), serverReason(account.id)] });
            roblox(0);
            break;

        case "outage": {
            discordSources.forEach((p, i) => {
                next.sources[p.id] = i === 0 ? ok(p, "unsafe", { reasons: [textReason()] }) : i % 2 ? failing("server") : failing("timeout");
            });
            const r = roblox(0);
            if (robloxSources[1]) r.sources[robloxSources[1].id] = failing("rate");
            break;
        }

        case "blocked":
            for (const p of discordSources) next.sources[p.id] = failing("auth");
            break;

        case "full": {
            const other = mockSnowflake(Date.now() - 200 * DAY * 1000);
            if (first) {
                next.sources[first.id] = ok(first, "severe", {
                    statusLabel: "Confirmed (test)",
                    headerMessage: "Every field on this card comes from the test lab.",
                    reasons: [textReason(), outfitReason(), serverReason(account.id), userReason(other)],
                    category: "test",
                    categoryLabel: "Test category",
                    reviewer: { username: "testreviewer", displayName: "Test Reviewer" },
                    isLocked: true,
                    queuedAt: now - 10 * DAY,
                    processed: true,
                    processedAt: now - 9 * DAY,
                    lastUpdated: now - 2 * DAY,
                });
            }
            if (second) next.sources[second.id] = ok(second, "unsafe", { reasons: [textReason()] });
            if (third) next.sources[third.id] = ok(third, "provisional", { provisionalReasons: [textReason("Provisional test reason")] });
            if (fourth) next.sources[fourth.id] = ok(fourth, "pending", { queuedAt: now - 3600, processed: false });
            if (fifth) next.sources[fifth.id] = failing("server");

            const main = roblox(0);
            main.verified = true;
            main.servers = [{ serverId: mockSnowflake(Date.now() - 500 * DAY * 1000), safeName: "Tracked example server", joinedAt: now - 60 * DAY, firstSeenAt: now - 58 * DAY }];
            main.easi = { note: "Example moderation note from the test lab.", erp: false };
            robloxSources.forEach((p, i) => {
                if (i === 0) main.sources[p.id] = ok(p, "severe", { reasons: [outfitReason(), textReason()] });
                else if (i === 1) main.sources[p.id] = ok(p, "unsafe", { reasons: [textReason()] });
            });

            const banned = roblox(1);
            banned.banned = true;
            if (rFirst) banned.sources[rFirst.id] = ok(rFirst, "mixed", { reasons: [textReason("Past test reason")] });

            const alt = roblox(2, true);
            if (rFirst) alt.sources[rFirst.id] = ok(rFirst, "pending", { queuedAt: now - 600 });

            next.otherDiscord.push({ id: other, detectedAt: now - 15 * DAY, sources: [1, 2] });
            break;
        }
    }
    return next;
}
