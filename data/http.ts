/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { PluginNative } from "@utils/types";

import { MAX_INLINE_RETRY_AFTER_S, MAX_RETRIES, REQUEST_TIMEOUT_MS } from "../lib/constants";
import { type FetchOptions, type FetchResult, performFetch } from "../lib/transport";
import { logger } from "../lib/utils";
import { errorFromResponse, makeError, type RaywardError } from "./errors";

const Native = VencordNative?.pluginHelpers?.Raycord as PluginNative<typeof import("../native")> | undefined;

const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const jitter = (ms: number) => ms * (0.75 + Math.random() * 0.5);

function request(url: string, opts: FetchOptions): Promise<FetchResult> {
    const withTimeout = { timeoutMs: REQUEST_TIMEOUT_MS, ...opts };
    return Native ? Native.fetchJson(url, withTimeout) : performFetch(url, withTimeout);
}

const pausedUntil = new Map<string, number>();

function limiterKey(url: string) {
    try {
        const parsed = new URL(url);
        const provider = parsed.pathname.match(/^\/v2\/lookup\/([^/]+)/)?.[1];
        return provider ? `${parsed.hostname}/${provider}` : parsed.hostname;
    } catch {
        return url;
    }
}

async function awaitRateLimit(key: string) {
    const waitMs = (pausedUntil.get(key) ?? 0) - Date.now();
    if (waitMs > 0) await sleep(waitMs);
}

function noteRateLimit(key: string, result: FetchResult) {
    if (result.status === 429) {
        const seconds = result.retryAfter ?? 5;
        pausedUntil.set(key, Date.now() + seconds * 1000);
        logger.warn(`${key} rate limited, backing off ${seconds}s`);
        return;
    }

    const rl = result.rateLimit;
    if (rl && rl.remaining <= Math.max(2, Math.floor(rl.limit * 0.05))) {
        const untilMs = rl.reset * 1000;
        if (untilMs > Date.now()) pausedUntil.set(key, untilMs);
    }

    if (result.tokenExpires) {
        const daysLeft = (result.tokenExpires * 1000 - Date.now()) / 86_400_000;
        if (daysLeft < 7) logger.warn(`${key} API token expires in ${daysLeft.toFixed(1)} day(s)`);
    }
}

export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
    const key = limiterKey(url);

    for (let attempt = 0; ; attempt++) {
        await awaitRateLimit(key);
        const result = await request(url, opts);
        noteRateLimit(key, result);

        const transient = !!result.failure || RETRYABLE_STATUS.has(result.status);
        if (transient && attempt < MAX_RETRIES) {
            await sleep(jitter(400 * 3 ** attempt));
            continue;
        }

        const shortWait = (result.retryAfter ?? 5) <= MAX_INLINE_RETRY_AFTER_S;
        if (result.status === 429 && shortWait && attempt === 0) continue;

        return result;
    }
}

export function parseBody<T>(result: FetchResult): T | null {
    if (result.body === "null") return null;
    try {
        return JSON.parse(result.body) as T;
    } catch {
        return null;
    }
}

export function failureOf(result: FetchResult, envelope?: Parameters<typeof errorFromResponse>[1]): RaywardError {
    if (result.failure === "timeout") return makeError("timeout", "Request timed out");
    if (result.failure === "network") return makeError("network", "Couldn't connect");
    return errorFromResponse(result.status, envelope);
}

export const isOk = (result: FetchResult) => result.status >= 200 && result.status < 300;
