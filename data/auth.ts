/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { UserStore } from "@webpack/common";

import { RAYWARD_API } from "../lib/constants";
import { logger } from "../lib/utils";
import { settings } from "../settings";
import { errorFromResponse } from "./errors";
import { fetchWithRetry, parseBody } from "./http";
import { peekProviders } from "./providers";

const ACCESS_URL = `${new URL(RAYWARD_API).origin}/v1/access/me`;
const RECHECK_MS = 24 * 60 * 60_000;
const KEY_PATTERN = /^rwd_[A-Za-z0-9]{30,64}$/;

export type KeyCheck =
    | { ok: true; quotaReached?: boolean; }
    | { ok: false; reason: string; rejected: boolean; };

const NOT_A_KEY = "That isn't a Rayward API key. API keys start with rwd_.";
const EXTENSION_TOKEN = "This is a Rayward extension sign-in, not an API key. Create an API key on rayward.app.";
const REJECTED = "Your Rayward API key was rejected. Make sure it's valid and active.";

export const normalizeKey = (raw: string) => raw.trim().replace(/^bearer\s+/i, "").trim();
export const maskKey = (key: string | undefined) => key ? `${key.slice(0, 4)}••••••${key.slice(-5)}` : "";

export async function verifyKey(raw: string): Promise<KeyCheck> {
    const key = normalizeKey(raw);
    if (!KEY_PATTERN.test(key)) return { ok: false, reason: NOT_A_KEY, rejected: true };

    const headers = { Authorization: `Bearer ${key}` };

    const access = await fetchWithRetry(ACCESS_URL, { headers });
    if (access.status >= 200 && access.status < 300) {
        const body = parseBody<{ data?: { surface?: string; }; }>(access);
        return { ok: false, reason: body?.data?.surface === "extension" ? EXTENSION_TOKEN : NOT_A_KEY, rejected: true };
    }

    const providers = peekProviders() ?? [];
    const provider = providers.find(p => p.id === "rotector") ?? providers.find(p => p.capabilities.lookup && p.capabilities.discord);
    const userId = UserStore.getCurrentUser()?.id ?? "1";
    const lookup = await fetchWithRetry(`${RAYWARD_API}/lookup/${provider?.id ?? "rotector"}/discord/user/${userId}?lang=en`, { headers });

    if (lookup.failure || lookup.status === 0) return { ok: false, reason: "Couldn't reach Rayward. Try again.", rejected: false };
    if (lookup.status === 200 || lookup.status === 404) return { ok: true };

    const error = errorFromResponse(lookup.status, parseBody(lookup));
    if (error.kind === "quota") return { ok: true, quotaReached: true };
    if (error.kind === "rate") return { ok: true };
    if (error.kind === "auth") return { ok: false, reason: REJECTED, rejected: true };
    if (lookup.status >= 500) return { ok: false, reason: "Rayward had a problem. Try again later.", rejected: false };
    return { ok: false, reason: `Unexpected answer from Rayward (HTTP ${lookup.status}).`, rejected: false };
}

async function clearCaches() {
    const { clearAllCaches } = await import("./hooks");
    await clearAllCaches();
}

export async function signIn(raw: string) {
    settings.store.raywardApiKey = normalizeKey(raw);
    settings.store.keyStatus = "ok";
    settings.store.keyCheckedAt = Date.now();
    await clearCaches();
}

export async function signOut() {
    settings.store.raywardApiKey = "";
    settings.store.keyStatus = "unchecked";
    settings.store.keyCheckedAt = 0;
    await clearCaches();
}

export const isSignedIn = () => !!settings.store.raywardApiKey?.trim() && settings.store.keyStatus !== "invalid";

export async function recheckStoredKey() {
    const key = settings.store.raywardApiKey?.trim();
    if (!key) return;
    if (settings.store.keyStatus === "ok" && Date.now() - (settings.store.keyCheckedAt ?? 0) < RECHECK_MS) return;

    try {
        const result = await verifyKey(key);
        if (settings.store.raywardApiKey?.trim() !== key) return;
        if (result.ok) {
            settings.store.keyStatus = "ok";
            settings.store.keyCheckedAt = Date.now();
        } else if (result.rejected) {
            settings.store.keyStatus = "invalid";
        }
    } catch (e) {
        logger.warn("Couldn't recheck the Rayward API key", e);
    }
}
