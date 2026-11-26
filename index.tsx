/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption } from "@api/Commands";
import type { NavContextMenuPatchCallback } from "@api/ContextMenu";
import * as DataStore from "@api/DataStore";
import { showNotification } from "@api/Notifications";
import { migratePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import definePlugin from "@utils/types";
import type { Channel, Message, User } from "@vencord/discord-types";
import { ChannelStore, IconUtils, Menu, showToast, UserStore } from "@webpack/common";

import { RAYWARD_MARK_URL, RaywardMenuIcon, RaywardWordmark } from "./components/brand/Brand";
import { ChatWarning, resetWarnings } from "./components/chat/ChatWarning";
import { Indicator } from "./components/chat/Indicator";
import { ProfileTab, RAYWARD_SECTION } from "./components/report/ProfileTab";
import { openReportModal } from "./components/report/ReportModal";
import { Section } from "./components/report/Section";
import { openEasiModal } from "./components/settings/EasiModal";
import { openSignInModal } from "./components/settings/SignInModal";
import { verdictTooltip } from "./components/shared";
import { openTestLab } from "./components/testlab/TestLab";
import { recheckStoredKey } from "./data/auth";
import { toRaywardError } from "./data/errors";
import { clearDismissed, guardFirstContact, interceptDirectSends, interceptRelationships, loadDismissed, restoreDirectSends, restoreRelationships, shouldSkipUser } from "./data/guard";
import { clearAllCaches, loadAllCaches, resolveData, resolveVerdict } from "./data/hooks";
import { loadLab, refreshLab } from "./data/mock";
import { lookupNow } from "./data/rayward";
import { robloxAvatarStore } from "./data/roblox";
import { DM_CHANNEL_TYPES, PLUGIN_NAME, PREVIOUS_PLUGIN_NAME, PREVIOUS_STORAGE_KEYS, RAYWARD_SITE } from "./lib/constants";
import { lookupEmbed, noticeEmbed, sendEmbed, userEmbed } from "./lib/embeds";
import { materialize, unloadSession, watchEdits } from "./lib/testSession";
import { cl } from "./lib/utils";
import { settings } from "./settings";
import managedStyle from "./styles.css?managed";

migratePluginSettings(PLUGIN_NAME, PREVIOUS_PLUGIN_NAME);

const reportMenuItem: NavContextMenuPatchCallback = (children, props: { user?: User; }) => {
    const userId = props?.user?.id;
    if (!userId || settings.store.ignoreBots && props.user?.bot) return;

    children.push(
        <Menu.MenuSeparator />,
        <Menu.MenuItem
            id="vc-rayward-report"
            label="Rayward report"
            icon={RaywardMenuIcon}
            leadingAccessory={{ type: "icon", icon: RaywardMenuIcon }}
            action={() => openReportModal(userId)}
        />,
    );
};

const notified = new Set<string>();
let stopWatchingLab: (() => void) | undefined;
let promptTimer: ReturnType<typeof setTimeout> | undefined;

async function maybeNotify(user: User) {
    if (!settings.store.notifyOnFlaggedDm || shouldSkipUser(user) || notified.has(user.id)) return;

    const verdict = await resolveVerdict(user.id).catch(() => null);
    if (!verdict || verdict.severity < settings.store.warnThreshold || notified.has(user.id)) return;
    notified.add(user.id);

    showNotification({
        title: `${user.username} is flagged on Rayward`,
        body: verdictTooltip(verdict).replace(/\n+/g, "\n"),
        icon: IconUtils.getUserAvatarURL(user, false, 128) ?? RAYWARD_MARK_URL,
        onClick: () => openReportModal(user.id),
    });
}

const dmRecipients = (channel: Channel | undefined) =>
    channel && DM_CHANNEL_TYPES.has(channel.type) ? channel.recipients ?? [] : [];

export default definePlugin({
    name: "Raycord",
    description: "Shows Rayward safety flags in profiles, chat and the member list.",
    authors: [{ name: "MkSeven1", id: 1356781561277579465n }],
    tags: ["Privacy", "Utility", "Servers"],
    searchTerms: ["raycord", "rayward", "rotector", "tase", "rab", "okappiki", "serversweep", "rolock", "rcr", "roblox", "safety"],

    settings,
    managedStyle,

    dependencies: [
        "CommandsAPI",
        "ContextMenuAPI",
        "MemberListDecoratorsAPI",
        "MessageAccessoriesAPI",
        "MessageDecorationsAPI",
        "MessageEventsAPI",
    ],

    settingsAboutComponent: () => (
        <div className={cl("scope", "about")}>
            <RaywardWordmark height={22} />
            <Paragraph>
                Checks Discord users against the safety sources on <Link href={RAYWARD_SITE}>Rayward</Link>.
            </Paragraph>
            <Paragraph>
                Needs your own Rayward API key.
            </Paragraph>
        </div>
    ),

    patches: [
        {
            find: ".SIDEBAR,disableToolbar:",
            predicate: () => settings.store.showInProfile,
            replacement: {
                match: /user:(\i),widgets:.{0,100}?\}\),/,
                replace: "$&$self.renderSection({userId:$1?.id}),",
            },
        },
        {
            find: '"UserProfilePopout");',
            predicate: () => settings.store.showInProfile,
            replacement: {
                match: /user:(\i),widgets:.{0,100}?\}\),/,
                replace: "$&$self.renderSection({userId:$1?.id}),",
            },
        },
        {
            find: ".WIDGETS?",
            replacement: [
                {
                    match: /function \i\((\i)\)\{(?=let\{user:\i,currentUser:\i,displayProfile:\i,guildId:\i,channelId:\i,items:\i,initialSection:)/,
                    replace: "$&$1=$self.withRaywardTab($1);",
                },
                {
                    match: /\(0,\i\.jsx\)\(\i,\{user:(\i),currentUser:\i,displayProfile:\i,guildId:\i,channelId:\i,section:(\i)\.section,onClose:\i\}\)/,
                    replace: "$2.section==='RAYWARD'?$self.renderProfileTab({user:$1}):$&",
                },
                {
                    match: /type:"top",(?!className:)/,
                    replace: '$&className:"vc-rw-profile-tab-bar",',
                },
            ],
        },
        {
            find: "SIZE_32),onlyAnimateOnHoverOrFocus:!0",
            replacement: {
                match: /(\(0,\i\.jsx\)\(\i\.\i,\{user:(\i),nick:\i,botClass:.{0,250}?showGuildTag:!0\}\))/,
                replace: "$self.renderFriendName({user:$2,children:$1})",
            },
        },
    ],

    async start() {
        await Promise.all([loadAllCaches(), loadDismissed()]);
        interceptDirectSends();
        interceptRelationships();
        stopWatchingLab = watchEdits();
        if (await loadLab()) materialize();

        for (const key of PREVIOUS_STORAGE_KEYS) DataStore.del(key).catch(() => { });

        if (settings.store.raywardApiKey?.trim()) void recheckStoredKey();
        else if (!settings.store.signInPrompted) {
            promptTimer = setTimeout(() => {
                settings.store.signInPrompted = true;
                openSignInModal();
            }, 5000);
        }
    },

    stop() {
        clearTimeout(promptTimer);
        stopWatchingLab?.();
        stopWatchingLab = undefined;
        unloadSession();
        restoreDirectSends();
        restoreRelationships();
        notified.clear();
        resetWarnings();
    },

    flux: {
        CHANNEL_SELECT({ channelId }: { channelId?: string; }) {
            if (!channelId) return;
            const recipients = dmRecipients(ChannelStore.getChannel(channelId));

            for (const recipientId of recipients) {
                const user = UserStore.getUser(recipientId);
                if (!user || shouldSkipUser(user)) continue;
                void resolveVerdict(recipientId).catch(() => { });
                void maybeNotify(user);
            }
        },

        MESSAGE_CREATE({ message }: { message: Message; }) {
            if (!settings.store.notifyOnFlaggedDm || !message?.author) return;
            if (!dmRecipients(ChannelStore.getChannel(message.channel_id)).length) return;
            void maybeNotify(message.author as User);
        },
    },

    async onBeforeMessageSend(channelId: string) {
        if (!await guardFirstContact(channelId)) return { cancel: true };
    },

    contextMenus: {
        "user-context": reportMenuItem,
        "user-profile-actions": reportMenuItem,
        "user-profile-overflow-menu": reportMenuItem,
    },

    commands: [
        {
            name: "rayward",
            description: "Check a Discord user on Rayward. Only you see the result.",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [{
                name: "user",
                description: "User to check. Defaults to you.",
                type: ApplicationCommandOptionType.USER,
                required: false,
            }],
            async execute(args, ctx) {
                const userId = findOption<string>(args, "user") ?? UserStore.getCurrentUser().id;
                try {
                    const data = await resolveData(userId, true);
                    sendEmbed(ctx.channel.id, data.blocking
                        ? noticeEmbed("Rayward check unavailable", data.blocking)
                        : userEmbed(data, UserStore.getUser(userId), userId));
                } catch (e) {
                    sendEmbed(ctx.channel.id, noticeEmbed("Rayward check failed", toRaywardError(e)));
                }
            },
        },
        ...(["user", "group"] as const).map(kind => ({
            name: kind === "user" ? "rayward-roblox" : "rayward-group",
            description: `Check a Roblox ${kind} on Rayward. Only you see the result.`,
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [{
                name: "id",
                description: `Roblox ${kind} ID`,
                type: ApplicationCommandOptionType.STRING,
                required: true,
            }],
            async execute(args, ctx) {
                const id = findOption<string>(args, "id")?.trim() ?? "";
                if (!/^\d{1,20}$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
                    sendEmbed(ctx.channel.id, noticeEmbed("Enter a valid Roblox ID", "Roblox IDs are numbers only."));
                    return;
                }
                try {
                    const [lookup, avatar] = await Promise.all([
                        lookupNow(kind === "user" ? "roblox" : "group", id),
                        kind === "user" && settings.store.enableRobloxProfiles ? robloxAvatarStore.prefetch(id) : null,
                    ]);
                    sendEmbed(ctx.channel.id, lookupEmbed(kind, id, lookup, avatar));
                } catch (e) {
                    sendEmbed(ctx.channel.id, noticeEmbed("Rayward check failed", toRaywardError(e)));
                }
            },
        })),
    ],

    toolboxActions: {
        "Rayward: Sign in"() {
            openSignInModal();
        },
        "Rayward: Check yourself"() {
            openReportModal(UserStore.getCurrentUser().id);
        },
        async "Rayward: Clear cache"() {
            await clearAllCaches();
            refreshLab();
            resetWarnings();
            showToast({ text: "Rayward cache cleared", variant: "success" });
        },
        async "Rayward: Reset send warnings"() {
            await clearDismissed();
            showToast({ text: "Send warnings are back on for everyone", variant: "success" });
        },
        "Rayward: Test lab"() {
            openTestLab();
        },
        "Rayward: EASI"() {
            openEasiModal();
        },
    },

    renderSection: ErrorBoundary.wrap(({ userId }: { userId?: string; }) => {
        if (!userId || !settings.store.showInProfile) return null;
        if (settings.store.ignoreBots && UserStore.getUser(userId)?.bot) return null;
        return <Section userId={userId} />;
    }, { noop: true }),

    withRaywardTab(props: { user?: User; items?: { section: string; text: string; }[]; }) {
        try {
            const { user, items } = props ?? {};
            if (!user || !Array.isArray(items) || !settings.store.showInProfile) return props;
            if (settings.store.ignoreBots && user.bot) return props;
            if (items.some(i => i.section === RAYWARD_SECTION)) return props;
            return { ...props, items: [...items, { section: RAYWARD_SECTION, text: "Rayward" }] };
        } catch {
            return props;
        }
    },

    renderProfileTab: ErrorBoundary.wrap(({ user }: { user: User; }) => <ProfileTab user={user} />),

    renderFriendName: ErrorBoundary.wrap(({ user, children }: { user: User; children: React.ReactNode; }) => {
        if (!settings.store.friendsPageMarkers || shouldSkipUser(user)) return <>{children}</>;
        return (
            <div className={cl("friend-name")}>
                {children}
                <Indicator user={user} />
            </div>
        );
    }, { noop: true }),

    renderMemberListDecorator: ({ user }) => {
        if (!settings.store.showMemberListIndicator || shouldSkipUser(user)) return null;
        return <Indicator user={user} />;
    },

    renderMessageDecoration: ({ message }) => {
        if (!settings.store.showMessageIndicator || shouldSkipUser(message?.author as User)) return null;
        return <Indicator user={message.author as User} />;
    },

    renderMessageAccessory: ({ message }) => {
        if (!settings.store.warnInChat) return null;
        return <ChatWarning message={message} />;
    },
});
