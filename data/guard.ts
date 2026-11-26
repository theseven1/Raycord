/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import type { User } from "@vencord/discord-types";
import { ChannelStore, MessageActions, MessageStore, RelationshipStore, UserStore } from "@webpack/common";

import { confirmSend } from "../components/chat/SendGuardModal";
import { DM_CHANNEL_TYPES, PREVIOUS_DISMISS_KEY, SEND_APPROVAL_MS, SEND_GUARD_TIMEOUT_MS, STORAGE_PREFIX } from "../lib/constants";
import { logger } from "../lib/utils";
import { settings } from "../settings";
import { peekVerdict, resolveVerdict } from "./hooks";
import type { Verdict } from "./types";

const DISMISS_KEY = `${STORAGE_PREFIX}sendGuardDismissed`;

export function shouldSkipUser(user: User | undefined): boolean {
    if (!user?.id) return true;
    if (user.bot && settings.store.ignoreBots) return true;
    if (user.id === UserStore.getCurrentUser()?.id) return true;
    return settings.store.ignoreFriends && RelationshipStore.isFriend(user.id);
}

let dismissed = new Set<string>();

export async function loadDismissed() {
    try {
        let stored = await DataStore.get<string[]>(DISMISS_KEY);
        if (!stored) {
            stored = await DataStore.get<string[]>(PREVIOUS_DISMISS_KEY);
            if (stored) {
                await DataStore.set(DISMISS_KEY, stored);
                await DataStore.del(PREVIOUS_DISMISS_KEY);
            }
        }
        if (stored) dismissed = new Set(stored);
    } catch (e) {
        logger.error("Failed to load send guard dismissals", e);
    }
}

async function dismiss(userId: string) {
    dismissed.add(userId);
    try {
        await DataStore.set(DISMISS_KEY, [...dismissed]);
    } catch (e) {
        logger.error("Failed to save send guard dismissal", e);
    }
}

export async function clearDismissed() {
    dismissed.clear();
    approvedUntil.clear();
    await DataStore.del(DISMISS_KEY).catch(e => logger.error("Failed to clear send guard dismissals", e));
}

const pending = new Map<string, Promise<boolean>>();
const approvedUntil = new Map<string, number>();

export function resetChannelApproval(channelId: string) {
    approvedUntil.delete(channelId);
    pending.delete(channelId);
}

async function verdictWithin(userId: string): Promise<Verdict | null> {
    const cached = peekVerdict(userId);
    if (cached) return cached;
    return Promise.race([
        resolveVerdict(userId),
        new Promise<null>(resolve => setTimeout(() => resolve(null), SEND_GUARD_TIMEOUT_MS)),
    ]);
}

async function check(channelId: string, recipients: string[]): Promise<boolean> {
    for (const recipientId of recipients) {
        const user = UserStore.getUser(recipientId);
        if (!user || shouldSkipUser(user) || dismissed.has(user.id)) continue;

        try {
            const verdict = await verdictWithin(user.id);
            if (!verdict || verdict.severity < settings.store.sendGuardThreshold) continue;

            const { send, dontAskAgain } = await confirmSend(user, verdict);
            if (!send) return false;
            if (dontAskAgain) void dismiss(user.id);
        } catch (e) {
            logger.error("Send guard failed, allowing the message", e);
        }
    }

    approvedUntil.set(channelId, Date.now() + SEND_APPROVAL_MS);
    return true;
}

export function guardFirstContact(channelId: string): Promise<boolean> {
    if (!settings.store.sendGuard) return Promise.resolve(true);

    const channel = ChannelStore.getChannel(channelId);
    if (!channel || !DM_CHANNEL_TYPES.has(channel.type)) return Promise.resolve(true);
    if (MessageStore.hasCurrentUserSentMessage(channelId)) return Promise.resolve(true);
    if ((approvedUntil.get(channelId) ?? 0) > Date.now()) return Promise.resolve(true);

    const existing = pending.get(channelId);
    if (existing) return existing;

    const promise = check(channelId, channel.recipients ?? []).finally(() => pending.delete(channelId));
    pending.set(channelId, promise);
    return promise;
}

const INTERCEPTED = ["sendGreetMessage", "sendStickers"] as const;
const originals = new Map<string, (...args: any[]) => unknown>();

export function interceptDirectSends() {
    const actions = MessageActions as Record<string, unknown>;
    for (const name of INTERCEPTED) {
        const original = actions[name];
        if (typeof original !== "function" || originals.has(name)) {
            if (typeof original !== "function") logger.warn(`MessageActions.${name} not found, its sends are unguarded`);
            continue;
        }

        originals.set(name, original as (...args: any[]) => unknown);
        actions[name] = async function (this: unknown, channelId: unknown, ...rest: unknown[]) {
            if (typeof channelId === "string" && !await guardFirstContact(channelId)) return;
            return (original as (...args: unknown[]) => unknown).call(this, channelId, ...rest);
        };
    }
}

export function restoreDirectSends() {
    const actions = MessageActions as Record<string, unknown>;
    for (const [name, original] of originals) actions[name] = original;
    originals.clear();
}

