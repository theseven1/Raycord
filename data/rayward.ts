/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RAYWARD_API } from "../lib/constants";
import { clampTtl } from "../lib/utils";
import { settings } from "../settings";
import { makeError, toRaywardError } from "./errors";
import { failureOf, fetchWithRetry, isOk, parseBody } from "./http";
import { getProviders, peekProviders } from "./providers";
import { createSourceStore, intercept, type Settled, type SourceStore } from "./store";
import type { DiscordAlt, RaywardMembership, RaywardProvider, RaywardResult, SourceOutcome, Subject, SubjectLookup } from "./types";

const BATCH_LIMIT = 100;
const ttlMs = () => clampTtl(settings.store.cacheTtlMinutes);

export const hasApiKey = () => !!settings.store.raywardApiKey?.trim();

function authHeaders(): Record<string, string> {
    const key = settings.store.raywardApiKey?.trim();
    if (!key) throw makeError("config", "Add a Rayward API key in the plugin settings");
    return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

interface Envelope<T> { success: boolean; data?: T; error?: string; code?: string; type?: string; requestId?: string; }

async function api<T>(url: string, body?: unknown): Promise<T> {
    const result = await fetchWithRetry(url, {
        method: body === undefined ? "GET" : "POST",
        headers: authHeaders(),
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const parsed = parseBody<Envelope<T>>(result);
    if (!isOk(result)) throw failureOf(result, parsed);
    if (!parsed?.success || parsed.data === undefined) throw makeError("parse", parsed?.error ?? "Unexpected response");
    return parsed.data;
}

export function isSourceEnabled(provider: RaywardProvider): boolean {
    return settings.store.sourceOverrides?.[provider.id] ?? provider.defaultEnabled;
}

export function supportsSubject(provider: RaywardProvider, subject: Subject): boolean {
    if (!provider.capabilities.lookup) return false;
    if (subject === "discord") return provider.capabilities.discord;
    if (subject === "group") return provider.capabilities.groups;
    return true;
}

export function sourcesFor(subject: Subject): RaywardProvider[] | undefined {
    return peekProviders()?.filter(p => isSourceEnabled(p) && supportsSubject(p, subject));
}

export const sourceKey = (providerId: string, id: string | number) => `${providerId}:${id}`;

function splitKey(key: string): [providerId: string, id: string] {
    const at = key.indexOf(":");
    return [key.slice(0, at), key.slice(at + 1)];
}

function lookupPath(provider: RaywardProvider, subject: Subject) {
    const kind = subject === "group" ? "roblox/group" : `${subject}/user`;
    return `${RAYWARD_API}/lookup/${encodeURIComponent(provider.id)}/${kind}`;
}

async function lookupProvider(provider: RaywardProvider, subject: Subject, ids: string[]): Promise<Map<string, Settled<RaywardResult>>> {
    const out = new Map<string, Settled<RaywardResult>>();
    const path = lookupPath(provider, subject);

    if (provider.capabilities.batch) {
        for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
            const chunk = ids.slice(i, i + BATCH_LIMIT);
            try {
                const records = await api<Record<string, RaywardResult>>(`${path}?lang=en`, {
                    ids: subject === "discord" ? chunk : chunk.map(Number),
                });
                for (const id of chunk) out.set(id, { ok: true, value: records[id] ?? null });
            } catch (error) {
                for (const id of chunk) out.set(id, { ok: false, error });
            }
        }
        return out;
    }

    await Promise.all(ids.map(async id => {
        try {
            out.set(id, { ok: true, value: await api<RaywardResult>(`${path}/${id}?lang=en`) });
        } catch (error) {
            const e = toRaywardError(error);
            out.set(id, e.status === 404 ? { ok: true, value: null } : { ok: false, error: e });
        }
    }));
    return out;
}

async function fetchSubject(subject: Subject, keys: string[]): Promise<Map<string, Settled<RaywardResult>>> {
    const out = new Map<string, Settled<RaywardResult>>();
    const remote: string[] = [];
    for (const key of keys) {
        const mocked = intercept(`lookup_${subject}`, key);
        if (mocked === undefined) remote.push(key);
        else out.set(key, mocked === "pending" ? { ok: true, value: null } : mocked as Settled<RaywardResult>);
    }
    if (!remote.length) return out;

    authHeaders();
    const providers = await getProviders();

    const byProvider = new Map<string, string[]>();
    for (const key of remote) {
        const [providerId, id] = splitKey(key);
        const ids = byProvider.get(providerId);
        if (ids) ids.push(id);
        else byProvider.set(providerId, [id]);
    }

    await Promise.all([...byProvider].map(async ([providerId, ids]) => {
        const provider = providers.find(p => p.id === providerId);
        if (!provider) {
            const error = makeError("client", "This source is no longer available");
            for (const id of ids) out.set(sourceKey(providerId, id), { ok: false, error });
            return;
        }
        const results = await lookupProvider(provider, subject, ids);
        for (const [id, settled] of results) out.set(sourceKey(providerId, id), settled);
    }));
    return out;
}

function subjectStore(subject: "discord" | "roblox") {
    return createSourceStore<RaywardResult>({
        name: `lookup_${subject}`,
        ttlMs,
        batchSize: 500,
        fetchMany: keys => fetchSubject(subject, keys),
    });
}

export const discordStore = subjectStore("discord");
export const robloxStore = subjectStore("roblox");

export function storeFor(subject: "discord" | "roblox"): SourceStore<RaywardResult> {
    return subject === "discord" ? discordStore : robloxStore;
}

export function outcomesFor(subject: "discord" | "roblox", id: string | number, providers: RaywardProvider[]): SubjectLookup {
    const store = storeFor(subject);
    return {
        outcomes: providers.map((provider): SourceOutcome => {
            const key = sourceKey(provider.id, id);
            switch (store.stateOf(key)) {
                case "ok": return { provider, state: "ok", result: store.peek(key) ?? null };
                case "error": return { provider, state: "error", error: store.errorOf(key)! };
                default: return { provider, state: "loading" };
            }
        }),
    };
}

export async function lookupNow(subject: Subject, id: string): Promise<SubjectLookup> {
    const providers = (await getProviders()).filter(p => isSourceEnabled(p) && supportsSubject(p, subject));
    const results = await fetchSubject(subject, providers.map(p => sourceKey(p.id, id)));
    return {
        outcomes: providers.map((provider): SourceOutcome => {
            const settled = results.get(sourceKey(provider.id, id)) ?? { ok: true, value: null };
            return settled.ok
                ? { provider, state: "ok", result: settled.value }
                : { provider, state: "error", error: toRaywardError(settled.error) };
        }),
    };
}

export const membershipStore = createSourceStore<RaywardMembership>({
    name: "rotector_membership",
    ttlMs,
    fetchOne: id => api<RaywardMembership>(`${RAYWARD_API}/lookup/rotector/roblox/user/${id}/discord`),
});

export const discordAltsStore = createSourceStore<DiscordAlt[]>({
    name: "rotector_discord_alts",
    ttlMs,
    async fetchOne(id) {
        const data = await api<{ altDiscordAccounts: DiscordAlt[]; }>(`${RAYWARD_API}/lookup/rotector/discord/user/${id}/alts`);
        return data.altDiscordAccounts ?? [];
    },
});

