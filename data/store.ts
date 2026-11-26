/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { useEffect, useState } from "@webpack/common";

import { FAILURE_BACKOFF_MS, STORAGE_PREFIX } from "../lib/constants";
import { logger } from "../lib/utils";
import { type RaywardError, toRaywardError } from "./errors";
import type { LoadState } from "./types";

const MAX_CACHE_ENTRIES = 5000;
const BATCH_WINDOW_MS = 120;
const MAX_CONCURRENT = 4;

export type Settled<V> = { ok: true; value: V | null; } | { ok: false; error: unknown; };

export type Intercepted = Settled<unknown> | "pending" | undefined;
type Interceptor = (store: string, key: string) => Intercepted;

let interceptor: Interceptor | undefined;

export function setInterceptor(fn: Interceptor | undefined) {
    interceptor = fn;
}

export const intercept = (store: string, key: string): Intercepted => interceptor?.(store, key);

interface CacheEntry<V> {
    value: V | null;
    ts: number;
}

interface Failure {
    error: RaywardError;
    attempts: number;
    retryAt: number;
}

export interface SourceStoreOptions<V> {
    name: string;
    fetchOne?(key: string): Promise<V | null>;
    fetchMany?(keys: string[]): Promise<Map<string, Settled<V>>>;
    batchSize?: number;
    ttlMs(): number;
    persist?: boolean;
}

export interface SourceStore<V> {
    name: string;
    peek(key: string): V | null | undefined;
    prefetch(key: string): Promise<V | null>;
    refresh(key: string): Promise<V | null>;
    evict(key: string): void;
    load(): Promise<void>;
    clear(): Promise<void>;
    subscribe(key: string, cb: () => void): () => void;
    stateOf(key: string): LoadState;
    errorOf(key: string): RaywardError | undefined;
}

export function createSourceStore<V>(opts: SourceStoreOptions<V>): SourceStore<V> {
    const dataStoreKey = STORAGE_PREFIX + opts.name;
    const batchSize = opts.batchSize ?? 100;
    const shouldPersist = opts.persist ?? true;

    const cache = new Map<string, CacheEntry<V>>();
    const failures = new Map<string, Failure>();
    const inFlight = new Map<string, Promise<V | null>>();
    const resolvers = new Map<string, (value: V | null) => void>();
    const subscribers = new Map<string, Set<() => void>>();

    const isFresh = (entry: CacheEntry<V>) => Date.now() - entry.ts < opts.ttlMs();
    const isIntercepted = (key: string) => intercept(opts.name, key) !== undefined;

    const pendingNotify = new Set<string>();
    function notify(key: string) {
        if (!pendingNotify.size) queueMicrotask(flushNotify);
        pendingNotify.add(key);
    }
    function flushNotify() {
        const callbacks = new Set<() => void>();
        for (const key of pendingNotify) subscribers.get(key)?.forEach(cb => callbacks.add(cb));
        pendingNotify.clear();
        callbacks.forEach(cb => cb());
    }

    let running = 0;
    const waiting: (() => void)[] = [];
    async function limited(task: () => Promise<void>) {
        if (running >= MAX_CONCURRENT) await new Promise<void>(r => waiting.push(r));
        running++;
        try {
            await task();
        } finally {
            running--;
            waiting.shift()?.();
        }
    }

    let persistTimer: ReturnType<typeof setTimeout> | undefined;

    async function persistNow() {
        for (const [key, entry] of cache) if (!isFresh(entry)) cache.delete(key);
        const entries = [...cache.entries()].filter(([key]) => !isIntercepted(key));
        if (entries.length) await DataStore.set(dataStoreKey, entries);
        else await DataStore.del(dataStoreKey);
    }

    function schedulePersist() {
        if (!shouldPersist || persistTimer) return;
        persistTimer = setTimeout(async () => {
            persistTimer = undefined;
            try {
                await persistNow();
            } catch (e) {
                logger.error(`[${opts.name}] failed to persist cache`, e);
            }
        }, 5000);
    }

    async function load() {
        if (!shouldPersist) return;
        try {
            const stored = await DataStore.get<[string, CacheEntry<V>][]>(dataStoreKey);
            if (!stored) return;
            for (const [key, entry] of stored) {
                if (entry && isFresh(entry)) cache.set(key, entry);
            }
            if (cache.size !== stored.length) await persistNow();
            logger.debug(`[${opts.name}] restored ${cache.size} cached entries`);
        } catch (e) {
            logger.error(`[${opts.name}] failed to load cache`, e);
        }
    }

    async function clear() {
        if (persistTimer) clearTimeout(persistTimer);
        persistTimer = undefined;
        cache.clear();
        failures.clear();
        for (const key of subscribers.keys()) notify(key);
        if (!shouldPersist) return;
        try {
            await DataStore.del(dataStoreKey);
        } catch (e) {
            logger.error(`[${opts.name}] failed to clear persisted cache`, e);
        }
    }

    function settle(key: string, outcome: Settled<V>) {
        if (outcome.ok) {
            if (cache.size >= MAX_CACHE_ENTRIES && !cache.has(key)) {
                const oldest = cache.keys().next().value;
                if (oldest !== undefined) cache.delete(oldest);
            }
            cache.delete(key);
            cache.set(key, { value: outcome.value, ts: Date.now() });
            failures.delete(key);
            schedulePersist();
        } else {
            const error = toRaywardError(outcome.error);
            const attempts = (failures.get(key)?.attempts ?? 0) + 1;
            const backoff = FAILURE_BACKOFF_MS[Math.min(attempts, FAILURE_BACKOFF_MS.length) - 1];
            failures.set(key, { error, attempts, retryAt: Date.now() + backoff });
            logger.warn(`[${opts.name}] ${key} failed (${error.kind}): ${error.message}`);
        }

        inFlight.delete(key);
        const resolve = resolvers.get(key);
        resolvers.delete(key);
        resolve?.(outcome.ok ? outcome.value : null);
        notify(key);
    }

    function runSerial(key: string) {
        void limited(async () => {
            try {
                settle(key, { ok: true, value: await opts.fetchOne!(key) });
            } catch (error) {
                settle(key, { ok: false, error });
            }
        });
    }

    let pendingBatch: Set<string> | null = null;
    let batchTimer: ReturnType<typeof setTimeout> | undefined;

    function flushBatch() {
        const keys = pendingBatch ? [...pendingBatch] : [];
        pendingBatch = null;
        if (batchTimer) clearTimeout(batchTimer);
        batchTimer = undefined;

        for (let i = 0; i < keys.length; i += batchSize) {
            const chunk = keys.slice(i, i + batchSize);
            void limited(async () => {
                let results: Map<string, Settled<V>>;
                try {
                    results = await opts.fetchMany!(chunk);
                } catch (error) {
                    for (const key of chunk) settle(key, { ok: false, error });
                    return;
                }
                for (const key of chunk) settle(key, results.get(key) ?? { ok: true, value: null });
            });
        }
    }

    function queueBatched(key: string) {
        pendingBatch ??= new Set();
        pendingBatch.add(key);
        if (pendingBatch.size >= batchSize) flushBatch();
        else batchTimer ??= setTimeout(flushBatch, BATCH_WINDOW_MS);
    }

    function fetchKey(key: string): Promise<V | null> {
        const existing = inFlight.get(key);
        if (existing) return existing;

        const mocked = intercept(opts.name, key);
        if (mocked === "pending") {
            inFlight.set(key, new Promise<V | null>(resolve => resolvers.set(key, resolve)));
            notify(key);
            return Promise.resolve(null);
        }

        const promise = new Promise<V | null>(resolve => resolvers.set(key, resolve));
        inFlight.set(key, promise);
        notify(key);

        if (mocked) queueMicrotask(() => settle(key, mocked as Settled<V>));
        else if (opts.fetchMany) queueBatched(key);
        else runSerial(key);
        return promise;
    }

    function subscribe(key: string, cb: () => void) {
        let set = subscribers.get(key);
        if (!set) subscribers.set(key, set = new Set());
        set.add(cb);
        return () => {
            set!.delete(cb);
            if (set!.size === 0) subscribers.delete(key);
        };
    }

    return {
        name: opts.name,

        peek(key) {
            const entry = cache.get(key);
            return entry && isFresh(entry) ? entry.value : undefined;
        },

        prefetch(key) {
            const entry = cache.get(key);
            if (entry && isFresh(entry)) return Promise.resolve(entry.value);
            const failure = failures.get(key);
            if (failure && failure.retryAt > Date.now() && !inFlight.has(key)) return Promise.resolve(null);
            return fetchKey(key);
        },

        refresh(key) {
            if (inFlight.has(key)) return inFlight.get(key)!;
            cache.delete(key);
            failures.delete(key);
            return fetchKey(key);
        },

        evict(key) {
            const resolve = resolvers.get(key);
            resolvers.delete(key);
            inFlight.delete(key);
            cache.delete(key);
            failures.delete(key);
            resolve?.(null);
            notify(key);
        },

        load,
        clear,
        subscribe,

        stateOf(key) {
            const entry = cache.get(key);
            if (entry && isFresh(entry)) return "ok";
            if (inFlight.has(key)) return "loading";
            if (failures.has(key)) return "error";
            return "idle";
        },

        errorOf: key => failures.get(key)?.error,
    };
}

export interface Subscription {
    store: SourceStore<any>;
    keys: string[];
}

export function useSubscriptions(subscriptions: Subscription[], enabled = true, extra?: (cb: () => void) => () => void) {
    const [, forceUpdate] = useState(0);
    const signature = subscriptions.map(s => `${s.store.name}:${s.keys.join(",")}`).join("|");

    useEffect(() => {
        if (!enabled) return;
        const rerender = () => forceUpdate(n => n + 1);
        const unsubscribes: (() => void)[] = [];
        for (const { store, keys } of subscriptions) {
            for (const key of keys) {
                unsubscribes.push(store.subscribe(key, rerender));
                void store.prefetch(key);
            }
        }
        if (extra) unsubscribes.push(extra(rerender));
        return () => unsubscribes.forEach(fn => fn());
    }, [signature, enabled]);
}

export function useSourceValue<V>(store: SourceStore<V>, key: string | undefined, enabled = true): V | null {
    useSubscriptions(key ? [{ store, keys: [key] }] : [], enabled && !!key);
    return enabled && key ? store.peek(key) ?? null : null;
}
