/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { EASI_API } from "../lib/constants";
import { clampTtl } from "../lib/utils";
import { settings } from "../settings";
import { failureOf, fetchWithRetry, parseBody } from "./http";
import { createSourceStore } from "./store";
import type { EasiNote, EasiResult } from "./types";

export const isEasiEnabled = () => !!settings.store.easiEnabled && !!settings.store.easiSecret?.trim();

export type EasiVerification = { ok: true; } | { ok: false; reason: string; };

export async function verifyEasiSecret(secret: string): Promise<EasiVerification> {
    if (!secret) return { ok: false, reason: "Enter a secret first." };

    const result = await fetchWithRetry(`${EASI_API}/1`, { headers: { "X-Internal-Secret": secret } });
    if (result.failure || result.status === 0) return { ok: false, reason: "Couldn't reach EASI. Check your connection and try again." };
    if (result.status === 401 || result.status === 403) return { ok: false, reason: "EASI rejected this secret." };
    if (result.status >= 500) return { ok: false, reason: `EASI returned an error (HTTP ${result.status}). Try again later.` };
    if (result.status >= 200 && result.status < 300 || result.status === 404) return { ok: true };
    return { ok: false, reason: `Unexpected answer from EASI (HTTP ${result.status}).` };
}

export const easiStore = createSourceStore<EasiResult>({
    name: "easi",
    ttlMs: () => clampTtl(settings.store.cacheTtlMinutes),

    async fetchOne(robloxId) {
        const secret = settings.store.easiSecret?.trim();
        if (!secret) return { kind: "unauthorized" };

        const result = await fetchWithRetry(`${EASI_API}/${robloxId}`, { headers: { "X-Internal-Secret": secret } });
        if (result.status === 401 || result.status === 403) return { kind: "unauthorized" };
        if (result.status === 404 || result.status === 204) return { kind: "none" };
        if (result.status === 0 || result.status >= 400) throw failureOf(result);

        const parsed = parseBody<EasiNote & { error?: string; }>(result);
        if (!parsed || parsed.error || !parsed.moderation_note) return { kind: "none" };
        return { kind: "note", note: { is_erp: !!parsed.is_erp, moderation_note: parsed.moderation_note } };
    },
});
