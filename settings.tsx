/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { OptionType } from "@utils/types";
import { showToast } from "@webpack/common";

import { SourceToggles } from "./components/settings/SourceToggles";
import { cl, Severity } from "./lib/utils";

const clearCaches = async (toast = false) => {
    const { clearAllCaches } = await import("./data/hooks");
    await clearAllCaches();
    if (toast) showToast({ text: "Rayward cache cleared", variant: "success" });
};

const thresholdOptions = (defaultValue: Severity) => [
    { label: "Any flag", value: Severity.Low },
    { label: "Moderate", value: Severity.Moderate },
    { label: "High", value: Severity.High },
    { label: "Severe", value: Severity.Extreme },
].map(o => ({ ...o, default: o.value === defaultValue }));

export const settings = definePluginSettings({
    raywardApiKey: {
        type: OptionType.STRING,
        displayName: "API key",
        description: "Your Rayward API key",
        default: "",
        placeholder: "rwd_...",
        onChange: () => void clearCaches(),
    },
    sources: {
        type: OptionType.COMPONENT,
        component: SourceToggles,
    },
    sourceOverrides: {
        type: OptionType.CUSTOM,
        default: {} as Record<string, boolean>,
    },
    enableRobloxProfiles: {
        type: OptionType.BOOLEAN,
        displayName: "Roblox accounts",
        description: "Show linked Roblox accounts in reports",
        default: true,
    },

    showInProfile: {
        type: OptionType.BOOLEAN,
        displayName: "Profile section",
        description: "Show Rayward in profiles and DM sidebars",
        default: true,
        restartNeeded: true,
    },
    defaultExpanded: { type: OptionType.BOOLEAN, displayName: "Start expanded", description: "Expand the profile section by default", default: true },
    defaultTab: {
        type: OptionType.SELECT,
        displayName: "Default tab",
        description: "Tab the profile section opens on",
        options: [
            { label: "Overview", value: "overview", default: true },
            { label: "Sources", value: "sources" },
            { label: "Roblox", value: "roblox" },
        ],
    },
    showMemberListIndicator: {
        type: OptionType.BOOLEAN,
        displayName: "Member list markers",
        description: "Mark flagged users in the member list",
        default: false,
    },
    showMessageIndicator: {
        type: OptionType.BOOLEAN,
        displayName: "Chat markers",
        description: "Mark flagged users in chat",
        default: false,
    },
    indicatorStyle: {
        type: OptionType.SELECT,
        displayName: "Marker style",
        description: "How markers look",
        options: [
            { label: "Icon", value: "icon", default: true },
            { label: "Dot", value: "dot" },
            { label: "Pill", value: "pill" },
        ],
    },
    indicatorThreshold: {
        type: OptionType.SELECT,
        displayName: "Marker level",
        description: "Lowest level that shows a marker",
        options: thresholdOptions(Severity.Moderate),
    },

    sendGuard: {
        type: OptionType.BOOLEAN,
        displayName: "Send warning",
        description: "Warn you before messaging a flagged user",
        default: true,
    },
    sendGuardThreshold: {
        type: OptionType.SELECT,
        displayName: "Send warning level",
        description: "Lowest level that triggers the warning",
        options: thresholdOptions(Severity.Moderate),
    },
    warnInChat: {
        type: OptionType.BOOLEAN,
        displayName: "Chat warnings",
        description: "Show a warning under a flagged user's first message",
        default: false,
    },
    notifyOnFlaggedDm: { type: OptionType.BOOLEAN, displayName: "DM notifications", description: "Notify when a flagged user DMs you", default: false },
    warnThreshold: {
        type: OptionType.SELECT,
        displayName: "Chat warning level",
        description: "Lowest level for chat warnings and notifications",
        options: thresholdOptions(Severity.High),
    },
    ignoreBots: { type: OptionType.BOOLEAN, displayName: "Skip bots", description: "No checks, markers or warnings for bots", default: true },
    ignoreFriends: { type: OptionType.BOOLEAN, displayName: "Skip friends", description: "No markers or warnings for friends", default: false },

    cacheTtlMinutes: {
        type: OptionType.SELECT,
        displayName: "Cache duration",
        description: "How long to keep results",
        options: [
            { label: "5 minutes", value: 5 },
            { label: "15 minutes", value: 15 },
            { label: "30 minutes", value: 30 },
            { label: "1 hour", value: 60 },
            { label: "3 hours", value: 180 },
            { label: "6 hours", value: 360 },
            { label: "1 day", value: 1440, default: true },
            { label: "3 days", value: 4320 },
            { label: "7 days", value: 10080 },
        ],
        onChange: () => void clearCaches(),
    },
    clearCache: {
        type: OptionType.COMPONENT,
        component: () => (
            <div className={cl("settings-buttons")}>
                <Button variant="dangerSecondary" onClick={() => clearCaches(true)}>Clear cached results</Button>
            </div>
        ),
    },
}, {
    indicatorStyle: { disabled() { return !this.store.showMemberListIndicator && !this.store.showMessageIndicator; } },
    indicatorThreshold: { disabled() { return !this.store.showMemberListIndicator && !this.store.showMessageIndicator; } },
    sendGuardThreshold: { disabled() { return !this.store.sendGuard; } },
    warnThreshold: { disabled() { return !this.store.warnInChat && !this.store.notifyOnFlaggedDm; } },
    defaultTab: { disabled() { return !this.store.showInProfile; } },
    defaultExpanded: { disabled() { return !this.store.showInProfile; } },
}).withPrivateSettings<{ sectionExpanded?: boolean; easiEnabled?: boolean; easiSecret?: string; }>();
