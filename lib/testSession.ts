/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, FluxDispatcher, IconUtils, MessageActions, NavigationRouter, RestAPI, SelectedChannelStore, UserStore } from "@webpack/common";

import { guardFirstContact } from "../data/guard";
import { accountForChannel, emptyState, findAccount, isLabActive, isMockChannel, isMockDiscord, labState, type MockAccount, type MockMessage, mockSnowflake, newAccount, setLab, subscribeLab, unloadLab, updateLab } from "../data/mock";
import { applyPreset, type PresetId } from "../data/mockPresets";
import { getProviders, peekProviders } from "../data/providers";
import { logger } from "./utils";

type AnyFn = (...args: any[]) => any;

export function avatarUrlOf(account: MockAccount): string {
    const index = /^[0-5]$/.test(account.avatar) ? account.avatar : null;
    return index !== null || !account.avatar ? `https://cdn.discordapp.com/embed/avatars/${index ?? 0}.png` : account.avatar;
}

function rawUser(account: MockAccount) {
    return {
        id: account.id,
        username: account.username,
        global_name: account.globalName || null,
        discriminator: "0",
        avatar: null,
        avatar_decoration_data: null,
        banner: null,
        accent_color: account.accentColor,
        bot: account.bot,
        public_flags: 0,
    };
}

function rawSelf() {
    const me = UserStore.getCurrentUser();
    return { id: me.id, username: me.username, global_name: (me as any).globalName ?? null, discriminator: me.discriminator, avatar: me.avatar, bot: false, public_flags: 0 };
}

function profileBody(account: MockAccount) {
    return {
        user: rawUser(account),
        user_profile: { bio: account.bio, accent_color: account.accentColor, pronouns: "", banner: null, theme_colors: null, emoji: null, profile_effect: null },
        badges: [],
        guild_badges: [],
        connected_accounts: [],
        mutual_guilds: [],
        mutual_friends_count: 0,
        premium_type: null,
        premium_since: null,
        premium_guild_since: null,
        legacy_username: null,
    };
}

function rawMessage(account: MockAccount, channelId: string, message: MockMessage) {
    return {
        id: message.id,
        channel_id: channelId,
        author: message.authorId === account.id ? rawUser(account) : rawSelf(),
        content: message.content,
        timestamp: new Date(message.timestamp).toISOString(),
        edited_timestamp: null,
        type: 0,
        tts: false,
        mention_everyone: false,
        mentions: [],
        mention_roles: [],
        attachments: [],
        embeds: [],
        components: [],
        pinned: false,
        flags: 0,
    };
}

const channelOf = (accountId: string) => labState()?.channels[accountId];

function rawChannel(account: MockAccount, channelId: string) {
    const messages = labState()?.messages[channelId] ?? [];
    return {
        id: channelId,
        type: 1,
        recipients: [rawUser(account)],
        last_message_id: messages.at(-1)?.id ?? channelId,
        flags: 0,
        is_spam: false,
        is_message_request: false,
    };
}

function applyAvatar(account: MockAccount) {
    const user = UserStore.getUser(account.id) as any;
    if (!user) return;
    const url = avatarUrlOf(account);
    user.getAvatarURL = () => url;
}

export function syncAccount(accountId: string) {
    const account = findAccount(accountId);
    if (!account) return;

    FluxDispatcher.dispatch({ type: "USER_UPDATE", user: rawUser(account) });
    applyAvatar(account);
    FluxDispatcher.dispatch({ type: "USER_PROFILE_FETCH_SUCCESS", userProfile: profileBody(account) });

    const channelId = channelOf(account.id);
    if (channelId && !ChannelStore.getChannel(channelId)) FluxDispatcher.dispatch({ type: "CHANNEL_CREATE", channel: rawChannel(account, channelId) });
    applyAvatar(account);
}

function loadMessages(channelId: string) {
    const account = accountForChannel(channelId);
    if (!account) return;
    const messages = (labState()?.messages[channelId] ?? []).map(m => rawMessage(account, channelId, m)).reverse();
    FluxDispatcher.dispatch({
        type: "LOAD_MESSAGES_SUCCESS",
        channelId,
        messages,
        isBefore: false,
        isAfter: false,
        hasMoreBefore: false,
        hasMoreAfter: false,
        limit: 50,
        jump: undefined,
        isStale: false,
        truncate: true,
    });
}

const wrapped: { target: Record<string, unknown>; name: string; original: AnyFn; wrapper: AnyFn; }[] = [];

function wrap(target: Record<string, unknown> | undefined, name: string, make: (original: AnyFn) => AnyFn) {
    const original = target?.[name];
    if (!target || typeof original !== "function" || wrapped.some(w => w.target === target && w.name === name)) return;
    const wrapper = make(original as AnyFn);
    try {
        target[name] = wrapper;
    } catch { }
    if (target[name] === wrapper) wrapped.push({ target, name, original: original as AnyFn, wrapper });
    else logger.debug(`Test lab couldn't wrap ${name}`);
}

function unwrapAll() {
    for (const { target, name, original, wrapper } of wrapped.splice(0).reverse()) {
        if (target[name] === wrapper) target[name] = original;
    }
}

const MOCK_ID = /\d{15,21}/g;
const touchesMock = (url: string) => [...url.matchAll(MOCK_ID)].some(([id]) => isMockDiscord(id) || isMockChannel(id));

function localResponse(url: string) {
    const profile = /\/users\/(\d+)\/profile/.exec(url);
    const account = profile && findAccount(profile[1]);
    if (account) return { ok: true, status: 200, body: profileBody(account), headers: {} };

    const channel = /\/channels\/(\d+)\/messages(?:\?|$)/.exec(url);
    const owner = channel && accountForChannel(channel[1]);
    if (owner) {
        const messages = (labState()?.messages[channel[1]] ?? []).map(m => rawMessage(owner, channel[1], m)).reverse();
        return { ok: true, status: 200, body: messages, headers: {} };
    }
    return { ok: true, status: 204, body: null, headers: {} };
}

function addLocalMessage(channelId: string, authorId: string, content: string) {
    const account = accountForChannel(channelId);
    if (!account) return;
    const message: MockMessage = { id: mockSnowflake(), authorId, content, timestamp: Date.now() };
    void updateLab(draft => {
        (draft.messages[channelId] ??= []).push(message);
        draft.messages[channelId] = draft.messages[channelId].slice(-200);
    });
    MessageActions.receiveMessage(channelId, rawMessage(account, channelId, message));
}

function installWrappers() {
    for (const method of ["get", "post", "put", "patch", "del"]) {
        wrap(RestAPI as unknown as Record<string, unknown>, method, original => function (this: unknown, request: string | { url?: string; }, ...rest: unknown[]) {
            const url = typeof request === "string" ? request : request?.url ?? "";
            if (isLabActive() && touchesMock(url)) return Promise.resolve(localResponse(url));
            return original.call(this, request, ...rest);
        });
    }

    wrap(MessageActions, "fetchMessages", original => function (this: unknown, options: { channelId?: string; }, ...rest: unknown[]) {
        if (options?.channelId && isMockChannel(options.channelId)) {
            loadMessages(options.channelId);
            return Promise.resolve(true);
        }
        return original.call(this, options, ...rest);
    });

    wrap(MessageActions, "sendMessage", original => function (this: unknown, channelId: string, message: { content?: string; }, ...rest: unknown[]) {
        if (!isMockChannel(channelId)) return original.call(this, channelId, message, ...rest);
        addLocalMessage(channelId, UserStore.getCurrentUser().id, message?.content ?? "");
        return Promise.resolve({ ok: true, status: 200, body: null });
    });

    for (const [name, text] of [["sendStickers", "*sent a sticker*"], ["sendGreetMessage", "*waved* 👋"]] as const) {
        wrap(MessageActions, name, original => async function (this: unknown, channelId: string, ...rest: unknown[]) {
            if (!isMockChannel(channelId)) return original.call(this, channelId, ...rest);
            if (!await guardFirstContact(channelId)) return;
            addLocalMessage(channelId, UserStore.getCurrentUser().id, text);
        });
    }

    wrap(IconUtils as unknown as Record<string, unknown>, "getUserAvatarURL", original => function (this: unknown, user: { id?: string; }, ...rest: unknown[]) {
        const account = user?.id ? findAccount(user.id) : undefined;
        return account ? avatarUrlOf(account) : original.call(this, user, ...rest);
    });
}

function onProfileFailure({ userId }: { userId?: string; }) {
    if (userId && isMockDiscord(userId)) setTimeout(() => syncAccount(userId), 0);
}

function onConnectionOpen() {
    setTimeout(materialize, 500);
}

let subscribed = false;
function subscribeFlux() {
    if (subscribed) return;
    subscribed = true;
    FluxDispatcher.subscribe("USER_PROFILE_FETCH_FAILURE", onProfileFailure);
    FluxDispatcher.subscribe("CONNECTION_OPEN", onConnectionOpen);
}

function unsubscribeFlux() {
    if (!subscribed) return;
    subscribed = false;
    FluxDispatcher.unsubscribe("USER_PROFILE_FETCH_FAILURE", onProfileFailure);
    FluxDispatcher.unsubscribe("CONNECTION_OPEN", onConnectionOpen);
}

export function materialize() {
    const state = labState();
    if (!state) return;
    installWrappers();
    subscribeFlux();
    for (const account of state.accounts) syncAccount(account.id);
}

function deleteChannels(channelIds: string[]) {
    const current = SelectedChannelStore.getChannelId();
    if (current && channelIds.includes(current)) NavigationRouter.transitionTo("/channels/@me");
    for (const id of channelIds) {
        const channel = ChannelStore.getChannel(id);
        if (channel) FluxDispatcher.dispatch({ type: "CHANNEL_DELETE", channel: { id, type: channel.type, guild_id: null } });
    }
}

async function providersForPresets() {
    return peekProviders() ?? await getProviders().catch(() => []);
}

export async function startSession(preset: PresetId = "full") {
    if (isLabActive()) return openDm(labState()!.accounts[0].id);

    const providers = await providersForPresets();
    const account = applyPreset(newAccount(1), preset, providers);
    const state = emptyState();
    state.accounts.push(account);
    state.channels[account.id] = mockSnowflake();
    state.messages[state.channels[account.id]] = [{ id: mockSnowflake(), authorId: account.id, content: "Hi! I'm a test account from the Raycord test lab.", timestamp: Date.now() }];

    await setLab(state);
    materialize();
    openDm(account.id);
}

export async function addAccount(preset: PresetId = "clean") {
    const state = labState();
    if (!state) return startSession(preset);

    const index = Math.max(0, ...state.accounts.map(a => Number(/(\d+)$/.exec(a.username)?.[1] ?? 0))) + 1;
    const account = applyPreset(newAccount(index), preset, await providersForPresets());
    await updateLab(draft => {
        draft.accounts.push(account);
        draft.channels[account.id] = mockSnowflake();
    });
    materialize();
    return account.id;
}

export async function removeAccount(accountId: string) {
    const state = labState();
    if (!state) return;
    if (state.accounts.length <= 1) return stopSession();

    const channelId = state.channels[accountId];
    if (channelId) deleteChannels([channelId]);
    await updateLab(draft => {
        draft.accounts = draft.accounts.filter(a => a.id !== accountId);
        for (const a of draft.accounts) a.otherDiscord = a.otherDiscord.filter(o => o.id !== accountId);
        if (channelId) delete draft.messages[channelId];
        delete draft.channels[accountId];
    });
}

export async function applyAccountPreset(accountId: string, preset: PresetId) {
    const providers = await providersForPresets();
    await updateLab(draft => {
        const index = draft.accounts.findIndex(a => a.id === accountId);
        if (index >= 0) draft.accounts[index] = applyPreset(draft.accounts[index], preset, providers);
    });
}

export function openDm(accountId: string) {
    const channelId = channelOf(accountId);
    if (!channelId) return;
    syncAccount(accountId);
    NavigationRouter.transitionTo(`/channels/@me/${channelId}`);
}

export function sendAs(accountId: string, content: string) {
    const channelId = channelOf(accountId);
    if (!channelId || !content.trim()) return;
    if (!ChannelStore.getChannel(channelId)) syncAccount(accountId);
    addLocalMessage(channelId, accountId, content);
}

export async function clearMessages(accountId: string) {
    const channelId = channelOf(accountId);
    if (!channelId) return;
    await updateLab(draft => void delete draft.messages[channelId]);
    loadMessages(channelId);
}

export async function stopSession() {
    const state = labState();
    deleteChannels(Object.values(state?.channels ?? {}));
    unwrapAll();
    unsubscribeFlux();
    await setLab(null);
}

export function unloadSession() {
    const state = labState();
    if (state) deleteChannels(Object.values(state.channels));
    unwrapAll();
    unsubscribeFlux();
    unloadLab();
}

let syncing = false;
export function watchEdits() {
    return subscribeLab(() => {
        if (syncing) return;
        syncing = true;
        queueMicrotask(() => {
            syncing = false;
            const state = labState();
            if (state) for (const a of state.accounts) syncAccount(a.id);
        });
    });
}
