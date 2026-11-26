/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";

import { MAX_CACHE_TTL_MS, MIN_CACHE_TTL_MS } from "./constants";

export const cl = classNameFactory("vc-rw-");
export const logger = new Logger("Raycord", "#f83008");

export const enum Severity { Clean = 0, Low = 1, Moderate = 2, High = 3, Extreme = 4 }

const names: Record<Severity, string> = {
    [Severity.Clean]: "No flags",
    [Severity.Low]: "Low",
    [Severity.Moderate]: "Moderate",
    [Severity.High]: "High",
    [Severity.Extreme]: "Severe",
};
const phrases: Record<Severity, string> = {
    [Severity.Clean]: "No active flags",
    [Severity.Low]: "Low concern",
    [Severity.Moderate]: "Moderate concern",
    [Severity.High]: "High concern",
    [Severity.Extreme]: "Severe concern",
};

export const severityName = (severity: Severity) => names[severity];
export const severityPhrase = (severity: Severity) => phrases[severity];
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function clampTtl(minutes: number | undefined): number {
    const ms = (minutes ?? 1440) * 60_000;
    return Math.min(MAX_CACHE_TTL_MS, Math.max(MIN_CACHE_TTL_MS, ms));
}

export function listAnd(items: string[]): string {
    if (items.length <= 1) return items[0] ?? "";
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function fmtRelativeUnix(seconds: number | null | undefined): string {
    if (!seconds) return "unknown";
    const date = new Date(seconds * 1000);
    const age = Math.max(0, Date.now() - date.getTime());
    if (age < 60_000) return "just now";
    if (age < 3_600_000) return `${Math.floor(age / 60_000)}m ago`;
    if (age < 86_400_000) return `${Math.floor(age / 3_600_000)}h ago`;
    if (age < 2_592_000_000) return `${Math.floor(age / 86_400_000)}d ago`;
    return date.toLocaleDateString();
}

export const fmtDateUnix = (seconds: number) => new Date(seconds * 1000).toLocaleString();

export const robloxProfileUrl = (id: number | string) => `https://www.roblox.com/users/${id}/profile`;
