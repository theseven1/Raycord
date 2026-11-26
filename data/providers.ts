/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { useEffect, useState } from "@webpack/common";

import { PROVIDERS_TTL_MS, RAYWARD_API, STORAGE_PREFIX } from "../lib/constants";
import { logger } from "../lib/utils";
import { makeError, type RaywardError, toRaywardError } from "./errors";
import { failureOf, fetchWithRetry, isOk, parseBody } from "./http";
import type { RaywardProvider } from "./types";

const STORAGE_KEY = `${STORAGE_PREFIX}providers`;

let cached: { value: RaywardProvider[]; at: number; } | undefined;
let pending: Promise<RaywardProvider[]> | undefined;
let lastError: RaywardError | undefined;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(cb => cb());

let extras: RaywardProvider[] = [];
let combined: { base: RaywardProvider[]; extras: RaywardProvider[]; value: RaywardProvider[]; } | undefined;

function withExtras(base: RaywardProvider[]): RaywardProvider[] {
    if (!extras.length) return base;
    if (combined?.base !== base || combined.extras !== extras) {
        const ids = new Set(base.map(p => p.id));
        combined = { base, extras, value: [...base, ...extras.filter(p => !ids.has(p.id))] };
    }
    return combined.value;
}

export function setExtraProviders(list: RaywardProvider[]) {
    extras = list;
    emit();
}

async function fetchProviders(): Promise<RaywardProvider[]> {
    const result = await fetchWithRetry(`${RAYWARD_API}/providers?audience=api&lang=en`);
    const body = parseBody<{ success?: boolean; data?: RaywardProvider[]; error?: string; code?: string; requestId?: string; }>(result);
    if (!isOk(result) || !body?.success || !Array.isArray(body.data)) {
        throw isOk(result) ? makeError("parse", "Unexpected providers response") : failureOf(result, body);
    }
    return body.data.sort((a, b) => a.order - b.order);
}

export function getProviders(): Promise<RaywardProvider[]> {
    if (cached && Date.now() - cached.at < PROVIDERS_TTL_MS) return Promise.resolve(withExtras(cached.value));

    pending ??= fetchProviders()
        .then(value => {
            cached = { value, at: Date.now() };
            lastError = undefined;
            DataStore.set(STORAGE_KEY, cached).catch(e => logger.error("Failed to save providers", e));
            return value;
        })
        .catch(e => {
            lastError = toRaywardError(e);
            if (cached) {
                logger.warn("Providers refresh failed", e);
                return cached.value;
            }
            throw lastError;
        })
        .finally(() => {
            pending = undefined;
            emit();
        });
    return pending.then(withExtras);
}

export const peekProviders = () => cached ? withExtras(cached.value) : undefined;
export const providersError = () => cached ? undefined : lastError;

export function subscribeProviders(cb: () => void) {
    listeners.add(cb);
    return () => void listeners.delete(cb);
}

export async function loadProviders() {
    try {
        const stored = await DataStore.get<{ value: RaywardProvider[]; at: number; }>(STORAGE_KEY);
        if (stored?.value?.length) cached = stored;
    } catch (e) {
        logger.error("Failed to load cached providers", e);
    }
}

export function invalidateProviders() {
    if (cached) cached.at = 0;
}

export function useProviders(): RaywardProvider[] | undefined {
    const [, forceUpdate] = useState(0);
    useEffect(() => {
        const unsubscribe = subscribeProviders(() => forceUpdate(n => n + 1));
        getProviders().catch(() => { });
        return unsubscribe;
    }, []);
    return peekProviders();
}
