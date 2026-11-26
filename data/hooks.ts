/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { settings } from "../settings";
import { easiStore, isEasiEnabled } from "./easi";
import { isBlockingError, makeError, type RaywardError } from "./errors";
import { isMockDiscord } from "./mock";
import { getProviders, invalidateProviders, loadProviders, peekProviders, providersError, subscribeProviders } from "./providers";
import { discordAltsStore, discordStore, hasApiKey, membershipStore, outcomesFor, robloxStore, sourceKey, sourcesFor } from "./rayward";
import { robloxAvatarStore, robloxProfileStore } from "./roblox";
import { type Subscription, useSubscriptions } from "./store";
import type { DiscordAlt, EasiResult, RaywardConnection, RaywardMembership, SubjectLookup, Verdict } from "./types";
import { buildVerdict, EMPTY_VERDICT, failedOutcomes, okResults } from "./verdict";

export type ReportState = "idle" | "loading" | "ready" | "unavailable";

export interface RaywardData {
    state: ReportState;
    blocking?: RaywardError;
    discord: SubjectLookup;
    connections: RaywardConnection[];
    alts: RaywardConnection[];
    linkedKnown: boolean;
    accounts: Map<number, SubjectLookup>;
    memberships: Map<number, RaywardMembership | null>;
    discordAlts?: DiscordAlt[] | null;
    notes: Map<number, EasiResult | null>;
    verdict: Verdict;
}

export interface RaywardReport extends RaywardData {
    refresh(): void;
    retrySource(providerId: string): void;
}

const EMPTY_LOOKUP: SubjectLookup = { outcomes: [] };

const idleData = (state: ReportState, blocking?: RaywardError): RaywardData => ({
    state,
    blocking,
    discord: EMPTY_LOOKUP,
    connections: [],
    alts: [],
    linkedKnown: false,
    accounts: new Map(),
    memberships: new Map(),
    notes: new Map(),
    verdict: EMPTY_VERDICT,
});

const uniqueConnections = (list: RaywardConnection[]) => [...new Map(list.map(c => [c.robloxUserId, c])).values()];

function collect(userId: string, deep: boolean): { data: RaywardData; subscriptions: Subscription[]; } {
    if (!hasApiKey() && !isMockDiscord(userId)) return { data: idleData("unavailable", makeError("config", "Add a Rayward API key in the plugin settings")), subscriptions: [] };

    const discordSources = sourcesFor("discord");
    const robloxSources = sourcesFor("roblox");
    if (!discordSources || !robloxSources) {
        const error = providersError();
        return { data: idleData(error ? "unavailable" : "loading", error), subscriptions: [] };
    }

    const subscriptions: Subscription[] = [];
    const discord = outcomesFor("discord", userId, discordSources);
    subscriptions.push({ store: discordStore, keys: discordSources.map(p => sourceKey(p.id, userId)) });

    const rotector = discord.outcomes.find(o => o.provider.id === "rotector");
    const linkedKnown = !rotector || rotector.state !== "loading";
    const connections = rotector?.state === "ok" ? rotector.result?.linkedRobloxAccounts ?? [] : [];
    const directIds = connections.map(c => String(c.robloxUserId));
    const rotectorOn = robloxSources.some(p => p.id === "rotector");

    const memberships = new Map<number, RaywardMembership | null>();
    let alts: RaywardConnection[] = [];
    let discordAlts: DiscordAlt[] | null | undefined;
    if (deep && rotectorOn) {
        subscriptions.push({ store: membershipStore, keys: directIds });
        for (const id of directIds) memberships.set(Number(id), membershipStore.peek(id) ?? null);
        alts = uniqueConnections([...memberships.values()].flatMap(m => m?.altAccounts ?? []))
            .filter(c => !directIds.includes(String(c.robloxUserId)));

        subscriptions.push({ store: discordAltsStore, keys: [userId] });
        discordAlts = discordAltsStore.stateOf(userId) === "error" ? null : discordAltsStore.peek(userId);
    }

    const allIds = [...directIds, ...alts.map(c => String(c.robloxUserId))];
    const accounts = new Map<number, SubjectLookup>();
    for (const id of allIds) accounts.set(Number(id), outcomesFor("roblox", id, robloxSources));
    subscriptions.push({ store: robloxStore, keys: allIds.flatMap(id => robloxSources.map(p => sourceKey(p.id, id))) });

    const notes = new Map<number, EasiResult | null>();
    if (deep && isEasiEnabled()) {
        subscriptions.push({ store: easiStore, keys: allIds });
        for (const id of allIds) notes.set(Number(id), easiStore.peek(id) ?? null);
    }

    const failures = failedOutcomes(discord);
    const blocking = discord.outcomes.length && failures.length === discord.outcomes.length && isBlockingError(failures[0].error)
        ? failures[0].error
        : undefined;
    const settled = discord.outcomes.some(o => o.state !== "loading") || !discord.outcomes.length;

    return {
        data: {
            state: blocking ? "unavailable" : settled ? "ready" : "loading",
            blocking,
            discord,
            connections,
            alts,
            linkedKnown,
            accounts,
            memberships,
            discordAlts,
            notes,
            verdict: buildVerdict(discord, accounts.values(), notes),
        },
        subscriptions,
    };
}

function refreshKeys(subscriptions: Subscription[], filter: (key: string) => boolean = () => true) {
    for (const { store, keys } of subscriptions) {
        for (const key of keys) if (filter(key)) void store.refresh(key);
    }
}

const watchProviders = (cb: () => void) => {
    getProviders().catch(() => { });
    return subscribeProviders(cb);
};

export function useRayward(userId: string | undefined, { deep = false, enabled = true } = {}): RaywardReport {
    settings.use(["sourceOverrides", "raywardApiKey", "easiEnabled", "easiSecret"]);

    const active = enabled && !!userId;
    const { data, subscriptions } = active ? collect(userId, deep) : { data: idleData("idle"), subscriptions: [] };
    useSubscriptions(subscriptions, active, watchProviders);

    return {
        ...data,
        refresh() {
            if (!userId) return;
            if (!peekProviders() || providersError()) invalidateProviders();
            getProviders().catch(() => { });
            refreshKeys(subscriptions);
        },
        retrySource(providerId) {
            refreshKeys(subscriptions.filter(s => s.store === discordStore || s.store === robloxStore), key => key.startsWith(`${providerId}:`));
        },
    };
}

export async function resolveData(userId: string, deep = false): Promise<RaywardData> {
    if (hasApiKey() || isMockDiscord(userId)) await getProviders().catch(() => { });

    let signature = "";
    for (let round = 0; round < 4; round++) {
        const { data, subscriptions } = collect(userId, deep);
        const next = subscriptions.map(s => `${s.store.name}:${s.keys.join(",")}`).join("|");
        if (next === signature) return data;
        signature = next;
        await Promise.all(subscriptions.flatMap(({ store, keys }) => keys.map(key => store.prefetch(key))));
    }
    return collect(userId, deep).data;
}

export const resolveVerdict = async (userId: string) => (await resolveData(userId)).verdict;

export function peekVerdict(userId: string): Verdict | null {
    const { data } = collect(userId, false);
    return okResults(data.discord).length ? data.verdict : null;
}

const allStores = [discordStore, robloxStore, membershipStore, discordAltsStore, easiStore, robloxAvatarStore, robloxProfileStore];

export async function clearAllCaches() {
    invalidateProviders();
    await Promise.all(allStores.map(s => s.clear()));
}

export async function loadAllCaches() {
    await Promise.all([loadProviders(), ...allStores.map(s => s.load())]);
}
