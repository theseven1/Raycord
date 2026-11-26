/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ErrorKind } from "./errors";
import { type MockAccount, type MockResult, type MockRobloxAccount, mockSnowflake, type MockSource, newRobloxAccount, nowSeconds } from "./mock";
import type { DiscordGuildEvidence, RaywardEvidence, RaywardFlagType, RaywardProvider, RaywardReason } from "./types";

export type FlagTone = "safe" | "pending" | "provisional" | "mixed" | "unsafe";
export type LabSubject = "discord" | "roblox";

export const PRESETS = [
    { id: "clean", label: "Clean", description: "Every source answers with no flags" },
    { id: "flagged", label: "Flagged", description: "Rotector flags the account and its Roblox account" },
    { id: "severe", label: "Severe", description: "Flagged on every source, with an alt" },
    { id: "mixed", label: "Mixed", description: "Mixed on Discord, past offender on Roblox" },
    { id: "pending", label: "Under review", description: "The Roblox account is queued on Rotector" },
    { id: "provisional", label: "Provisional", description: "The Roblox account has a provisional flag" },
    { id: "outage", label: "Partial outage", description: "Some sources fail, the rest answer" },
    { id: "blocked", label: "Key rejected", description: "Every source rejects the API key" },
    { id: "full", label: "Full demo", description: "Every field and kind of evidence" },
] as const;

export type PresetId = typeof PRESETS[number]["id"];

const DAY = 86_400;

const SERVER_TYPES: Record<string, string[]> = {
    tase: ["Condo Server"],
    serversweep: ["CONDO"],
    rolock: ["CONDO"],
};

const CLEAN_MESSAGES: Record<string, string> = {
    tase: "No inappropriate Discord server memberships yet.",
    serversweep: "No inappropriate Discord server memberships yet.",
    rolock: "No inappropriate Discord server memberships yet.",
    rab: "This user has no flagged activity in inappropriate Roblox games yet.",
    rcr: "RCR holds no record of this user.",
};

export const supportsSubject = (provider: RaywardProvider, subject: LabSubject) =>
    provider.capabilities.lookup && (subject === "roblox" || provider.capabilities.discord);

const DISCORD_FLAGS = new Set([0, 2, 5]);

export function allowedFlags(provider: RaywardProvider, subject: LabSubject): RaywardFlagType[] {
    return (provider.flagTypes ?? []).filter(t => subject === "roblox" || DISCORD_FLAGS.has(t.value));
}

export function flagFor(provider: RaywardProvider, tone: FlagTone, subject: LabSubject = "roblox"): number | undefined {
    const types = allowedFlags(provider, subject);
    const has = (value: number) => types.some(t => t.value === value);
    switch (tone) {
        case "safe": return 0;
        case "provisional": return has(4) ? 4 : undefined;
        case "mixed": return has(6) ? 6 : types.find(t => t.tone === "mixed")?.value;
        case "pending": return types.find(t => t.tone === "pending" && !t.safeToAction && t.value !== 4)?.value;
        case "unsafe": return (types.find(t => t.safeToAction && t.tone === "unsafe") ?? types.find(t => t.safeToAction))?.value;
    }
}

export function statusFor(provider: RaywardProvider, flagType: number): string | undefined {
    if (flagType === 0) return "Not Flagged";
    const type: RaywardFlagType | undefined = provider.flagTypes.find(t => t.value === flagType);
    if (type?.safeToAction && type.tone === "unsafe") return provider.id === "rotector" ? "Unsafe" : "Flagged";
    return type?.name;
}

export function messageFor(provider: RaywardProvider, subject: LabSubject, flagType: number): string | undefined {
    if (flagType === 0) return CLEAN_MESSAGES[provider.id];
    const type = provider.flagTypes.find(t => t.value === flagType);
    if (!type?.safeToAction) return undefined;
    if (provider.id === "okappiki") return "Found in condo records.";
    if (provider.id === "rotector" && subject === "roblox") return "This user has been verified as inappropriate by moderators.";
    if (provider.id === "rab" || provider.id === "rcr") return "Found in inappropriate Roblox games.";
    return "Member of inappropriate Discord servers.";
}

export function exampleServer(discordId: string, name = "Example server", types: string[] = []): DiscordGuildEvidence {
    const now = nowSeconds();
    return {
        kind: "discordGuild",
        discordId,
        serverId: mockSnowflake(Date.now() - 400 * DAY * 1000),
        safeName: name,
        types,
        name,
        messages: 12,
        typing: 3,
        reactions: 2,
        vcJoins: 0,
        joinedAt: now - 40 * DAY,
        firstSeen: now - 38 * DAY,
        lastSeen: now - DAY,
        staff: false,
        booster: false,
    };
}

export const textReason = (title = "Test reason"): RaywardReason => ({
    type: "test",
    title,
    sources: [],
    evidence: [{ kind: "text", text: "Example evidence from the test lab." }],
});

export const outfitReason = (): RaywardReason => ({
    type: "outfit",
    title: "Inappropriate Outfits",
    sources: [{ id: "outfit", label: "Outfit", summary: "One outfit matched." }],
    evidence: [{ kind: "outfit", outfitId: null, name: "Example outfit", category: "Avatar", description: "Example outfit description." }],
});

export const userReason = (discordId: string): RaywardReason => ({
    type: "condo",
    title: "Condo Activity",
    sources: [{ id: "discord", label: "Discord", summary: "Discord user with linked Roblox account detected in 2 condo server(s)" }],
    evidence: [{ kind: "discordUser", discordId }],
});

export function serverReason(provider: RaywardProvider, discordId: string): RaywardReason {
    const types = SERVER_TYPES[provider.id] ?? [];
    return {
        type: "discord_membership",
        title: provider.id === "okappiki" ? "Condo Discord Servers" : "Discord Servers",
        sources: [{ id: provider.id, label: provider.name }],
        evidence: [exampleServer(discordId, "Example server", types), exampleServer(discordId, "Second example server", types)],
    };
}

function reasonsFor(provider: RaywardProvider, subject: LabSubject, discordId: string): RaywardReason[] {
    if (provider.id === "rotector" && subject === "roblox") return [userReason(discordId)];
    if (provider.id === "rab" || provider.id === "rcr") {
        return [{ type: "games", title: "Inappropriate Games", sources: [{ id: provider.id, label: provider.name }], evidence: [{ kind: "text", text: "Played an example game that this source tracks." }] }];
    }
    return [serverReason(provider, discordId)];
}

export function resultFor(provider: RaywardProvider, subject: LabSubject, tone: FlagTone, discordId: string): MockSource {
    const flagType = flagFor(provider, tone, subject);
    if (flagType === undefined) return resultFor(provider, subject, "safe", discordId);

    const result: MockResult = {
        flagType,
        statusLabel: statusFor(provider, flagType),
        headerMessage: messageFor(provider, subject, flagType),
    };
    if (tone === "unsafe") result.reasons = reasonsFor(provider, subject, discordId);
    if (tone === "provisional") result.provisionalReasons = reasonsFor(provider, subject, discordId);
    if (tone === "pending") Object.assign(result, { queuedAt: nowSeconds() - 2 * 3600, processed: false });
    if (tone === "mixed") result.reasons = reasonsFor(provider, subject, discordId);
    if (provider.id === "rotector" && subject === "roblox" && tone !== "safe" && tone !== "pending") {
        Object.assign(result, {
            category: "condo",
            categoryLabel: "Condo",
            reviewer: tone === "unsafe" ? { username: "Anonymous", displayName: "Anonymous" } : undefined,
            lastUpdated: nowSeconds() - 3 * DAY,
        });
    }
    return { state: "ok", result };
}

export function relabel(provider: RaywardProvider, subject: LabSubject, result: MockResult, flagType: number, discordId: string): MockResult {
    const next: MockResult = { ...result, flagType, statusLabel: statusFor(provider, flagType), headerMessage: messageFor(provider, subject, flagType) };
    if (flagType === 0) {
        delete next.reasons;
        delete next.provisionalReasons;
    } else if (!next.reasons?.length && !next.provisionalReasons?.length) {
        if (flagType === 4) next.provisionalReasons = reasonsFor(provider, subject, discordId);
        else next.reasons = reasonsFor(provider, subject, discordId);
    }
    return next;
}

const failing = (kind: ErrorKind): MockSource => ({ state: kind });

function robloxFor(account: MockAccount, index: number, alt = false): MockRobloxAccount {
    const base = account.roblox[index] ?? newRobloxAccount(index + 1, alt);
    return { ...base, alt, sources: {}, servers: [], easi: null };
}

const exampleEvidence = (discordId: string): RaywardEvidence[] => [
    { kind: "text", text: "Example text evidence." },
    { kind: "outfit", outfitId: null, name: "Example outfit", category: "Avatar", description: "Example outfit description." },
    exampleServer(discordId),
    { kind: "discordUser", discordId },
];

export function applyPreset(account: MockAccount, preset: PresetId, providers: RaywardProvider[]): MockAccount {
    const discord = providers.filter(p => supportsSubject(p, "discord"));
    const roblox = providers.filter(p => supportsSubject(p, "roblox"));
    const rotector = providers.find(p => p.id === "rotector");
    const lead = rotector ?? discord[0];
    const now = nowSeconds();

    const next: MockAccount = { ...account, sources: {}, roblox: [], otherDiscord: [] };
    const addRoblox = (index: number, alt = false) => {
        const r = robloxFor(account, index, alt);
        next.roblox.push(r);
        return r;
    };
    const fill = (target: Record<string, MockSource>, list: RaywardProvider[], subject: LabSubject, tone: (p: RaywardProvider) => FlagTone) => {
        for (const p of list) target[p.id] = resultFor(p, subject, tone(p), account.id);
    };

    switch (preset) {
        case "clean":
            fill(next.sources, discord, "discord", () => "safe");
            fill(addRoblox(0).sources, roblox, "roblox", () => "safe");
            break;

        case "flagged":
            fill(next.sources, discord, "discord", p => p === lead ? "unsafe" : "safe");
            fill(addRoblox(0).sources, roblox, "roblox", p => p === lead ? "unsafe" : "safe");
            break;

        case "severe": {
            fill(next.sources, discord, "discord", () => "unsafe");
            fill(addRoblox(0).sources, roblox, "roblox", p => p.capabilities.discord || p === lead ? "unsafe" : "safe");
            fill(addRoblox(1, true).sources, roblox, "roblox", p => p === lead ? "unsafe" : "safe");
            next.otherDiscord.push({ id: mockSnowflake(Date.now() - 300 * DAY * 1000), detectedAt: now - 20 * DAY, sources: [3] });
            break;
        }

        case "mixed":
            fill(next.sources, discord, "discord", p => p === lead ? "mixed" : "safe");
            fill(addRoblox(0).sources, roblox, "roblox", p => p === lead ? "mixed" : "safe");
            break;

        case "pending":
            fill(next.sources, discord, "discord", () => "safe");
            fill(addRoblox(0).sources, roblox, "roblox", p => p === lead ? "pending" : "safe");
            break;

        case "provisional":
            fill(next.sources, discord, "discord", () => "safe");
            fill(addRoblox(0).sources, roblox, "roblox", p => p === lead ? "provisional" : "safe");
            break;

        case "outage":
            discord.forEach((p, i) => {
                next.sources[p.id] = i === 0 ? resultFor(p, "discord", "unsafe", account.id) : i % 2 ? failing("server") : failing("timeout");
            });
            roblox.forEach((p, i) => {
                addRoblox(0);
                next.roblox[0].sources[p.id] = i === 1 ? failing("rate") : resultFor(p, "roblox", i === 0 ? "unsafe" : "safe", account.id);
            });
            next.roblox.splice(1);
            break;

        case "blocked":
            for (const p of discord) next.sources[p.id] = failing("auth");
            break;

        case "full": {
            const other = mockSnowflake(Date.now() - 200 * DAY * 1000);
            fill(next.sources, discord, "discord", p => p === lead ? "unsafe" : discord.indexOf(p) % 2 ? "unsafe" : "safe");
            if (lead && next.sources[lead.id].result) {
                const result = next.sources[lead.id].result!;
                result.reasons = [...result.reasons ?? [], { type: "test", title: "Every evidence type", sources: [{ id: "test", label: "Test lab", summary: "Shows each kind of evidence." }], evidence: exampleEvidence(other) }];
            }
            const last = discord.at(-1);
            if (last && last !== lead) next.sources[last.id] = failing("server");

            const main = addRoblox(0);
            main.verified = true;
            main.servers = [{ serverId: mockSnowflake(Date.now() - 500 * DAY * 1000), safeName: "Tracked example server", joinedAt: now - 60 * DAY, firstSeenAt: now - 58 * DAY }];
            main.easi = { note: "Example moderation note.", erp: false };
            fill(main.sources, roblox, "roblox", p => p.capabilities.discord ? "unsafe" : "safe");
            if (lead && main.sources[lead.id]?.result) Object.assign(main.sources[lead.id].result!, { isLocked: true, queuedAt: now - 10 * DAY, processed: true, processedAt: now - 9 * DAY });

            const banned = addRoblox(1);
            banned.banned = true;
            fill(banned.sources, roblox, "roblox", p => p === lead ? "mixed" : "safe");

            const alt = addRoblox(2, true);
            fill(alt.sources, roblox, "roblox", p => p === lead ? "pending" : "safe");

            next.otherDiscord.push({ id: other, detectedAt: now - 15 * DAY, sources: [3] });
            break;
        }
    }
    return next;
}
