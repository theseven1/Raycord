/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { useEffect, useState } from "@webpack/common";

import { STORAGE_PREFIX } from "../lib/constants";
import { logger } from "../lib/utils";
import { easiStore } from "./easi";
import { type ErrorKind, makeError } from "./errors";
import { peekProviders, setExtraProviders } from "./providers";
import { discordAltsStore, discordStore, membershipStore, robloxStore, sourceKey } from "./rayward";
import { robloxAvatarStore, robloxProfileStore } from "./roblox";
import { type Intercepted, setInterceptor, type SourceStore } from "./store";
import type { DiscordAlt, EasiResult, RaywardConnection, RaywardFlagType, RaywardMembership, RaywardProvider, RaywardResult, RobloxProfile } from "./types";

const STORAGE_KEY = `${STORAGE_PREFIX}testLab`;

export const ERROR_KINDS: ErrorKind[] = ["server", "timeout", "network", "rate", "parse", "client", "auth", "quota", "config"];
export type MockSourceState = "none" | "ok" | "checking" | ErrorKind;
export type MockResult = Partial<Omit<RaywardResult, "id" | "linkedRobloxAccounts">>;

export interface MockSource {
    state: MockSourceState;
    result?: MockResult;
}

export interface MockServer { serverId: string; safeName: string; joinedAt: number | null; firstSeenAt: number; }

export interface MockRobloxAccount {
    id: string;
    username: string;
    displayName: string;
    banned: boolean;
    verified: boolean;
    avatarUrl: string;
    alt: boolean;
    linkSources: number[];
    detectedAt: number;
    sources: Record<string, MockSource>;
    servers: MockServer[];
    easi: { note: string; erp: boolean; } | null;
}

export interface MockOtherAccount { id: string; detectedAt: number | null; sources: number[]; }

export interface MockAccount {
    id: string;
    username: string;
    globalName: string;
    avatar: string;
    bio: string;
    accentColor: number | null;
    bot: boolean;
    sources: Record<string, MockSource>;
    roblox: MockRobloxAccount[];
    otherDiscord: MockOtherAccount[];
}

export interface MockMessage { id: string; authorId: string; content: string; timestamp: number; }

export interface MockExtraSource { id: string; name: string; description: string; discord: boolean; roblox: boolean; }

export interface TestLabState {
    accounts: MockAccount[];
    extraSources: MockExtraSource[];
    channels: Record<string, string>;
    messages: Record<string, MockMessage[]>;
}

export const TEST_FLAG_TYPES: RaywardFlagType[] = [
    { value: 0, name: "Not flagged", description: "", safeToAction: false, severity: 0, tone: "safe", isFlagged: false },
    { value: 1, name: "Under review", description: "", safeToAction: false, severity: 0, tone: "pending", isFlagged: false },
    { value: 2, name: "Flagged", description: "", safeToAction: true, severity: 7, tone: "unsafe", isFlagged: true },
    { value: 3, name: "Confirmed", description: "", safeToAction: true, severity: 9, tone: "unsafe", isFlagged: true },
    { value: 4, name: "Provisional", description: "", safeToAction: false, severity: 0, tone: "pending", isFlagged: false },
    { value: 6, name: "Past offender", description: "", safeToAction: false, severity: 0, tone: "mixed", isFlagged: true },
];

const ERROR_TEXT: Record<ErrorKind, [message: string, status?: number]> = {
    config: ["Add a Rayward API key in the plugin settings"],
    auth: ["Invalid API key", 401],
    quota: ["Daily quota reached", 429],
    rate: ["Too many requests", 429],
    server: ["Internal server error", 500],
    network: ["Failed to fetch"],
    timeout: ["The request timed out"],
    parse: ["Unexpected response"],
    client: ["Bad request", 400],
};

let state: TestLabState | null = null;
const listeners = new Set<() => void>();

export const labState = () => state;
export const isLabActive = () => !!state?.accounts.length;

export const findAccount = (id: string) => state?.accounts.find(a => a.id === id);
export const isMockDiscord = (id: string | undefined) => !!id && !!findAccount(id);

function findRoblox(id: string): { account: MockAccount; roblox: MockRobloxAccount; } | undefined {
    for (const account of state?.accounts ?? []) {
        const roblox = account.roblox.find(r => r.id === id);
        if (roblox) return { account, roblox };
    }
}
export const isMockRoblox = (id: string) => !!findRoblox(id);

export function accountForChannel(channelId: string): MockAccount | undefined {
    const entry = Object.entries(state?.channels ?? {}).find(([, c]) => c === channelId);
    return entry ? findAccount(entry[0]) : undefined;
}
export const isMockChannel = (channelId: string | undefined) => !!channelId && !!accountForChannel(channelId);

export function subscribeLab(cb: () => void) {
    listeners.add(cb);
    return () => void listeners.delete(cb);
}

export function useLab(): TestLabState | null {
    const [, forceUpdate] = useState(0);
    useEffect(() => subscribeLab(() => forceUpdate(n => n + 1)), []);
    return state;
}

const EPOCH = 1420070400000n;
export function mockSnowflake(at = Date.now()): string {
    return String(BigInt(at) - EPOCH << 22n | BigInt(Math.floor(Math.random() * 4096)));
}

export const mockRobloxId = () => String(9_000_000_000 + Math.floor(Math.random() * 900_000_000));
export const nowSeconds = () => Math.floor(Date.now() / 1000);

export function extraProvider(source: MockExtraSource, order: number): RaywardProvider {
    return {
        id: source.id,
        name: source.name,
        description: source.description,
        defaultEnabled: true,
        order,
        capabilities: { lookup: true, batch: true, reasons: true, membership: false, discord: source.discord, groups: false },
        flagTypes: TEST_FLAG_TYPES,
    };
}

function sourceAnswer(source: MockSource | undefined, id: string, linked?: RaywardConnection[]): Intercepted {
    const links = linked?.length ? { linkedRobloxAccounts: linked } : {};
    if (!source || source.state === "none") return { ok: true, value: linked?.length ? { id, flagType: 0, ...links } : null };
    if (source.state === "checking") return "pending";
    if (source.state === "ok") return { ok: true, value: { flagType: 0, ...source.result, id, ...links } };

    const [message, status] = ERROR_TEXT[source.state] ?? ERROR_TEXT.server;
    return { ok: false, error: makeError(source.state, message, status ? { status } : {}) };
}

const connectionOf = (r: MockRobloxAccount): RaywardConnection => ({
    robloxUserId: Number(r.id),
    robloxUsername: r.username,
    detectedAt: r.detectedAt,
    updatedAt: r.detectedAt,
    sources: r.linkSources,
});

function membershipOf(account: MockAccount, roblox: MockRobloxAccount): RaywardMembership {
    return {
        robloxUserId: Number(roblox.id),
        discordAccounts: [{ id: account.id, detectedAt: roblox.detectedAt, updatedAt: roblox.detectedAt, sources: roblox.linkSources, servers: roblox.servers.map(s => ({ ...s, updatedAt: s.firstSeenAt })) }],
        altAccounts: account.roblox.filter(r => r.alt).map(connectionOf),
    };
}

const splitKey = (key: string) => {
    const at = key.indexOf(":");
    return [key.slice(0, at), key.slice(at + 1)] as const;
};

export function answer(store: string, key: string): Intercepted {
    if (!state) return;

    switch (store) {
        case "lookup_discord": {
            const [providerId, id] = splitKey(key);
            const account = findAccount(id);
            if (!account) return;
            const linked = providerId === "rotector" ? account.roblox.filter(r => !r.alt).map(connectionOf) : undefined;
            return sourceAnswer(account.sources[providerId], id, linked);
        }
        case "lookup_roblox": {
            const [providerId, id] = splitKey(key);
            const found = findRoblox(id);
            return found && sourceAnswer(found.roblox.sources[providerId], id);
        }
        case "rotector_discord_alts": {
            const account = findAccount(key);
            if (!account) return;
            const alts: DiscordAlt[] = account.otherDiscord.map(o => ({ id: o.id, detectedAt: o.detectedAt, updatedAt: o.detectedAt, sources: o.sources }));
            return { ok: true, value: alts };
        }
    }

    const found = findRoblox(key);
    if (!found) return;
    const { account, roblox } = found;
    switch (store) {
        case "rotector_membership":
            return { ok: true, value: membershipOf(account, roblox) };
        case "easi": {
            const value: EasiResult = roblox.easi?.note ? { kind: "note", note: { is_erp: roblox.easi.erp, moderation_note: roblox.easi.note } } : { kind: "none" };
            return { ok: true, value };
        }
        case "roblox_avatar":
            return { ok: true, value: roblox.avatarUrl || null };
        case "roblox_profile": {
            const value: RobloxProfile = { id: Number(roblox.id), name: roblox.username, displayName: roblox.displayName || roblox.username, isBanned: roblox.banned, hasVerifiedBadge: roblox.verified };
            return { ok: true, value };
        }
    }
}

const allProviderIds = () => (peekProviders() ?? []).map(p => p.id);

function keysOf(snapshot: TestLabState | null): [SourceStore<any>, string[]][] {
    const accounts = snapshot?.accounts ?? [];
    const providers = [...new Set([...allProviderIds(), ...(snapshot?.extraSources ?? []).map(s => s.id)])];
    const robloxIds = accounts.flatMap(a => a.roblox.map(r => r.id));
    const discordIds = accounts.map(a => a.id);
    return [
        [discordStore, discordIds.flatMap(id => providers.map(p => sourceKey(p, id)))],
        [robloxStore, robloxIds.flatMap(id => providers.map(p => sourceKey(p, id)))],
        [discordAltsStore, discordIds],
        [membershipStore, robloxIds],
        [easiStore, robloxIds],
        [robloxAvatarStore, robloxIds],
        [robloxProfileStore, robloxIds],
    ];
}

function syncExtras() {
    setExtraProviders((state?.extraSources ?? []).map((s, i) => extraProvider(s, 10_000 + i)));
}

const dataSignature = (snapshot: TestLabState | null) => snapshot
    ? JSON.stringify([snapshot.extraSources, snapshot.accounts.map(a => [a.id, a.sources, a.roblox, a.otherDiscord])])
    : "";

function apply(next: TestLabState | null, force = false) {
    const previous = keysOf(state);
    const changed = force || dataSignature(state) !== dataSignature(next && next.accounts.length ? next : null);
    state = next && next.accounts.length ? next : null;
    setInterceptor(state ? answer : undefined);

    if (changed) {
        syncExtras();
        for (const [store, keys] of previous) for (const key of keys) store.evict(key);
        for (const [store, keys] of keysOf(state)) for (const key of keys) void store.prefetch(key);
    }

    listeners.forEach(cb => cb());
}

async function persist() {
    try {
        if (state) await DataStore.set(STORAGE_KEY, state);
        else await DataStore.del(STORAGE_KEY);
    } catch (e) {
        logger.error("Failed to save the test lab", e);
    }
}

export async function loadLab(): Promise<TestLabState | null> {
    try {
        const stored = await DataStore.get<unknown>(STORAGE_KEY);
        if (stored) apply(normalizeState(stored), true);
    } catch (e) {
        logger.error("Failed to restore the test lab, discarding it", e);
        await DataStore.del(STORAGE_KEY).catch(() => { });
    }
    return state;
}

export async function setLab(next: TestLabState | null) {
    apply(next);
    await persist();
}

export function updateLab(mutate: (draft: TestLabState) => void) {
    if (!state) return Promise.resolve();
    const draft = structuredClone(state);
    mutate(draft);
    return setLab(draft);
}

export const updateAccount = (id: string, mutate: (account: MockAccount) => void) =>
    updateLab(draft => {
        const account = draft.accounts.find(a => a.id === id);
        if (account) mutate(account);
    });

export function refreshLab() {
    apply(state, true);
}

export function unloadLab() {
    setInterceptor(undefined);
    setExtraProviders([]);
    state = null;
    listeners.forEach(cb => cb());
}

export function newAccount(index: number): MockAccount {
    return {
        id: mockSnowflake(),
        username: `testaccount${index}`,
        globalName: `TestAccount${index}`,
        avatar: String((index - 1) % 6),
        bio: "Test account",
        accentColor: null,
        bot: false,
        sources: {},
        roblox: [],
        otherDiscord: [],
    };
}

export function newRobloxAccount(index: number, alt = false): MockRobloxAccount {
    return {
        id: mockRobloxId(),
        username: `TestRoblox${index}`,
        displayName: `Test Roblox ${index}`,
        banned: false,
        verified: false,
        avatarUrl: "",
        alt,
        linkSources: [1],
        detectedAt: nowSeconds() - 86_400 * 12,
        sources: {},
        servers: [],
        easi: null,
    };
}

export const emptyState = (): TestLabState => ({ accounts: [], extraSources: [], channels: {}, messages: {} });

const isRecord = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const SNOWFLAKE = /^\d{15,21}$/;
const ROBLOX_ID = /^\d{1,19}$/;
const SOURCE_STATES = new Set<string>(["none", "ok", "checking", ...ERROR_KINDS]);

function fail(path: string, problem: string): never {
    throw new Error(`${path}: ${problem}`);
}

function str(v: unknown, path: string, fallback?: string): string {
    if (v === undefined && fallback !== undefined) return fallback;
    if (typeof v !== "string") fail(path, "expected text");
    return v;
}

function sources(v: unknown, path: string): Record<string, MockSource> {
    if (v === undefined) return {};
    if (!isRecord(v)) fail(path, "expected an object keyed by source id");
    const out: Record<string, MockSource> = {};
    for (const [id, source] of Object.entries(v)) {
        if (!isRecord(source)) fail(`${path}.${id}`, "expected an object");
        if (!SOURCE_STATES.has(source.state)) fail(`${path}.${id}.state`, `use one of ${[...SOURCE_STATES].join(", ")}`);
        if (source.result !== undefined && !isRecord(source.result)) fail(`${path}.${id}.result`, "expected an object");
        if (source.result?.flagType !== undefined && typeof source.result.flagType !== "number") fail(`${path}.${id}.result.flagType`, "expected a number");
        out[id] = { state: source.state, ...(source.result ? { result: source.result as MockResult } : {}) };
    }
    return out;
}

function robloxAccount(v: unknown, path: string): MockRobloxAccount {
    if (!isRecord(v)) fail(path, "expected an object");
    const id = String(v.id ?? "");
    if (!ROBLOX_ID.test(id) || !Number.isSafeInteger(Number(id))) fail(`${path}.id`, "expected a numeric Roblox ID");
    const username = str(v.username, `${path}.username`);
    return {
        id,
        username,
        displayName: str(v.displayName, `${path}.displayName`, username),
        banned: !!v.banned,
        verified: !!v.verified,
        avatarUrl: str(v.avatarUrl, `${path}.avatarUrl`, ""),
        alt: !!v.alt,
        linkSources: Array.isArray(v.linkSources) ? v.linkSources.filter((n: unknown) => typeof n === "number") : [],
        detectedAt: typeof v.detectedAt === "number" ? v.detectedAt : nowSeconds(),
        sources: sources(v.sources, `${path}.sources`),
        servers: Array.isArray(v.servers)
            ? v.servers.map((s: unknown, i: number) => {
                if (!isRecord(s)) fail(`${path}.servers[${i}]`, "expected an object");
                return {
                    serverId: str(s.serverId, `${path}.servers[${i}].serverId`),
                    safeName: str(s.safeName, `${path}.servers[${i}].safeName`),
                    joinedAt: typeof s.joinedAt === "number" ? s.joinedAt : null,
                    firstSeenAt: typeof s.firstSeenAt === "number" ? s.firstSeenAt : nowSeconds(),
                };
            })
            : [],
        easi: isRecord(v.easi) && typeof v.easi.note === "string" ? { note: v.easi.note, erp: !!v.easi.erp } : null,
    };
}

function account(v: unknown, path: string): MockAccount {
    if (!isRecord(v)) fail(path, "expected an object");
    if (!SNOWFLAKE.test(String(v.id ?? ""))) fail(`${path}.id`, "expected a Discord ID");
    const username = str(v.username, `${path}.username`);
    if (!username.trim()) fail(`${path}.username`, "can't be empty");
    const accent = v.accentColor;
    return {
        id: String(v.id),
        username,
        globalName: str(v.globalName, `${path}.globalName`, username),
        avatar: str(v.avatar, `${path}.avatar`, "0"),
        bio: str(v.bio, `${path}.bio`, ""),
        accentColor: typeof accent === "number" && accent >= 0 && accent <= 0xffffff ? accent : null,
        bot: !!v.bot,
        sources: sources(v.sources, `${path}.sources`),
        roblox: Array.isArray(v.roblox) ? v.roblox.map((r: unknown, i: number) => robloxAccount(r, `${path}.roblox[${i}]`)) : [],
        otherDiscord: Array.isArray(v.otherDiscord)
            ? v.otherDiscord.map((o: unknown, i: number) => {
                if (!isRecord(o) || !SNOWFLAKE.test(String(o.id ?? ""))) fail(`${path}.otherDiscord[${i}].id`, "expected a Discord ID");
                return { id: String(o.id), detectedAt: typeof o.detectedAt === "number" ? o.detectedAt : null, sources: Array.isArray(o.sources) ? o.sources.filter((n: unknown) => typeof n === "number") : [] };
            })
            : [],
    };
}

export function normalizeState(raw: unknown): TestLabState {
    if (!isRecord(raw)) fail("session", "expected an object");
    if (!Array.isArray(raw.accounts)) fail("accounts", "expected a list");

    const accounts = raw.accounts.map((a: unknown, i: number) => account(a, `accounts[${i}]`));
    const ids = new Set<string>();
    for (const a of accounts) {
        if (ids.has(a.id)) fail("accounts", `the ID ${a.id} is used twice`);
        ids.add(a.id);
    }

    const extraSources: MockExtraSource[] = Array.isArray(raw.extraSources)
        ? raw.extraSources.map((s: unknown, i: number) => {
            if (!isRecord(s)) fail(`extraSources[${i}]`, "expected an object");
            const id = str(s.id, `extraSources[${i}].id`);
            if (!/^test-[a-z0-9-]{1,32}$/.test(id)) fail(`extraSources[${i}].id`, "must look like test-name");
            return { id, name: str(s.name, `extraSources[${i}].name`, id), description: str(s.description, `extraSources[${i}].description`, ""), discord: s.discord !== false, roblox: s.roblox !== false };
        })
        : [];

    const channels: Record<string, string> = {};
    if (isRecord(raw.channels)) {
        for (const [accountId, channelId] of Object.entries(raw.channels)) {
            if (ids.has(accountId) && typeof channelId === "string" && SNOWFLAKE.test(channelId)) channels[accountId] = channelId;
        }
    }

    const channelIds = new Set(Object.values(channels));
    const messages: Record<string, MockMessage[]> = {};
    if (isRecord(raw.messages)) {
        for (const [channelId, list] of Object.entries(raw.messages)) {
            if (!channelIds.has(channelId) || !Array.isArray(list)) continue;
            messages[channelId] = list.filter((m): m is MockMessage =>
                isRecord(m) && typeof m.id === "string" && typeof m.authorId === "string" && typeof m.content === "string" && typeof m.timestamp === "number");
        }
    }

    return { accounts, extraSources, channels, messages };
}
