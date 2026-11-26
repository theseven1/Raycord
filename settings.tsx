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
        description: "Rayward API key",
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
        description: "Display linked Roblox accounts in full reports",
        default: true,
    },

    showInProfile: {
        type: OptionType.BOOLEAN,
        description: "Show Rayward in profiles and DM sidebars",
        default: true,
        restartNeeded: true,
    },
    defaultExpanded: { type: OptionType.BOOLEAN, description: "Open the profile section by default", default: true },
    defaultTab: {
        type: OptionType.SELECT,
        description: "Tab to open in profile reports",
        options: [
            { label: "Overview", value: "overview", default: true },
            { label: "Sources", value: "sources" },
            { label: "Roblox", value: "roblox" },
        ],
    },
    showMemberListIndicator: {
        type: OptionType.BOOLEAN,
        description: "Check users visible in the member list",
        default: false,
    },
    showMessageIndicator: {
        type: OptionType.BOOLEAN,
        description: "Check users visible in chat",
        default: false,
    },
    indicatorStyle: {
        type: OptionType.SELECT,
        description: "Indicator style",
        options: [
            { label: "Icon", value: "icon", default: true },
            { label: "Dot", value: "dot" },
            { label: "Pill", value: "pill" },
        ],
    },
    indicatorThreshold: {
        type: OptionType.SELECT,
        description: "Lowest flag level that displays an indicator",
        options: thresholdOptions(Severity.Moderate),
    },

    sendGuard: {
        type: OptionType.BOOLEAN,
        description: "Warn you before interacting with flagged user",
        default: true,
    },
    sendGuardThreshold: {
        type: OptionType.SELECT,
        description: "Lowest flag level that triggers the warning",
        options: thresholdOptions(Severity.Moderate),
    },
    warnInChat: {
        type: OptionType.BOOLEAN,
        description: "Show a warning under a flagged user's first message in a channel",
        default: false,
    },
    notifyOnFlaggedDm: { type: OptionType.BOOLEAN, description: "Notify when a flagged user DMs you", default: false },
    warnThreshold: {
        type: OptionType.SELECT,
        description: "Lowest flag level for chat warnings and DM notifications",
        options: thresholdOptions(Severity.High),
    },
    ignoreBots: { type: OptionType.BOOLEAN, description: "Skip bots", default: true },
    ignoreFriends: { type: OptionType.BOOLEAN, description: "Skip friends", default: false },

    cacheTtlMinutes: {
        type: OptionType.SLIDER,
        description: "",
        markers: [5, 15, 30, 60, 180, 360, 1440, 4320, 10080],
        default: 1440,
        stickToMarkers: true,
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
