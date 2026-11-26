/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { plugins } from "@api/PluginManager";
import { openPluginModal } from "@components/settings";
import { TooltipContainer } from "@components/TooltipContainer";
import { classes } from "@utils/misc";
import type { ReactNode } from "react";

import { describeError, type RaywardError } from "../data/errors";
import type { FailedSource, Verdict } from "../data/types";
import { verdictReasons, verdictSources } from "../data/verdict";
import { PLUGIN_NAME } from "../lib/constants";
import { cl, listAnd, plural, Severity, severityName, severityPhrase } from "../lib/utils";
import { RaywardMark, SourceLogoById } from "./brand/Brand";
import { RetryIcon } from "./brand/icons";
import { StatusIcon, StatusLabel, TONE_LABEL } from "./brand/StatusIcon";

export type TabId = "overview" | "sources" | "roblox";

export interface TabSpec<T extends string = TabId> {
    id: T;
    label: string;
    badge?: number;
}

export function Tabs<T extends string = TabId>({ tabs, active, onSelect }: { tabs: TabSpec<T>[]; active: T; onSelect(id: T): void; }) {
    const index = Math.max(0, tabs.findIndex(t => t.id === active));
    return (
        <div className={cl("tabs")} role="tablist" style={{ "--n": tabs.length, "--i": index } as React.CSSProperties}>
            <span className={cl("tab-pill")} aria-hidden />
            {tabs.map(tab => (
                <button
                    key={tab.id}
                    role="tab"
                    aria-selected={tab.id === active}
                    className={classes(cl("tab"), tab.id === active && cl("tab-active"))}
                    onClick={() => onSelect(tab.id)}
                >
                    <span className={cl("tab-label")}>{tab.label}</span>
                    {!!tab.badge && <span className={cl("tab-badge")}>{tab.badge}</span>}
                </button>
            ))}
        </div>
    );
}

export function Reveal({ open, children, className }: { open: boolean; children: ReactNode; className?: string; }) {
    return (
        <div className={classes(cl("reveal"), open && cl("reveal-open"), className)} aria-hidden={!open} inert={!open}>
            <div className={cl("reveal-inner")}>{children}</div>
        </div>
    );
}

export function verdictTooltip(verdict: Verdict): string {
    if (!verdict.contributions.length) return verdict.tone === "safe" ? "No active flags" : TONE_LABEL[verdict.tone];
    return [
        severityPhrase(verdict.severity),
        ...verdictReasons(verdict).map(({ source, reasons }) => `${source}: ${reasons.join("; ")}`),
    ].join("\n");
}

export function SourcesTooltip({ verdict }: { verdict: Verdict; }) {
    const title = verdict.contributions.length
        ? severityPhrase(verdict.severity)
        : verdict.tone === "safe" ? "No active flags" : `${TONE_LABEL[verdict.tone]} result`;

    return (
        <div className={cl("scope", "tooltip")}>
            <div className={cl("tooltip-head")}>
                <RaywardMark size={14} />
                <strong>{title}</strong>
            </div>
            {verdict.findings.map(f => (
                <div key={f.providerId} className={cl("tooltip-row")}>
                    <SourceLogoById id={f.providerId} name={f.source} height={14} />
                    <StatusLabel tone={f.tone} label={f.label} size={12} />
                    {!!f.reasons.length && <span className={cl("tooltip-reasons")}>{f.reasons.join(", ")}</span>}
                </div>
            ))}
            {!!verdict.failed.length && (
                <div className={cl("tooltip-foot")}>
                    Didn't answer: {verdict.failed.map(f => f.source).join(", ")}
                </div>
            )}
        </div>
    );
}

export function describeVerdict(verdict: Verdict): string {
    if (!verdict.contributions.length) return verdict.tone === "safe" ? "No active flags" : `${TONE_LABEL[verdict.tone]} result`;
    return `${severityPhrase(verdict.severity)}, flagged by ${listAnd(verdictSources(verdict))}`;
}

export const flaggedBy = (verdict: Verdict) => listAnd(verdictSources(verdict));

export function VerdictChip({ verdict, incomplete }: { verdict: Verdict; incomplete?: boolean; }) {
    const flagged = verdict.severity > Severity.Clean;
    const tone = flagged ? "unsafe" : verdict.tone;
    const label = flagged
        ? `${severityName(verdict.severity)} · ${plural(verdictSources(verdict).length, "source")}`
        : incomplete && tone === "safe" ? "Incomplete" : tone === "safe" ? "No flags" : TONE_LABEL[tone];

    return (
        <TooltipContainer text={<SourcesTooltip verdict={verdict} />}>
            <span key={label} className={cl("chip", `chip-${tone}`, flagged && `chip-severity-${verdict.severity}`, "pop")}>
                <StatusIcon tone={tone} size={14} />
                {label}
            </span>
        </TooltipContainer>
    );
}

export function Skeleton({ width }: { width: string; }) {
    return <div className={cl("skeleton")} style={{ width }} />;
}

export function LoadingBlock({ label = "Checking sources.." }: { label?: string; }) {
    return (
        <div className={cl("loading")} aria-busy role="status" aria-label={label}>
            <Skeleton width="55%" />
            <Skeleton width="85%" />
            <Skeleton width="40%" />
        </div>
    );
}

const openSettings = () => {
    const plugin = plugins[PLUGIN_NAME];
    if (plugin) openPluginModal(plugin);
};

const BLOCKING_COPY: Partial<Record<RaywardError["kind"], { title: string; body: string; }>> = {
    config: { title: "Add your Rayward API key", body: "Lookups need a key from your approved Rayward account." },
    auth: { title: "Your Rayward API key was rejected", body: "Check that the key is valid and your access is approved." },
    quota: { title: "Daily lookup quota reached", body: "Rayward resets the quota daily." },
};

export function BlockingState({ error, onRetry }: { error: RaywardError; onRetry(): void; }) {
    const copy = BLOCKING_COPY[error.kind] ?? { title: "Couldn't reach Rayward", body: error.message };
    const fixable = error.kind === "config" || error.kind === "auth";

    return (
        <div className={cl("blocking", "enter")}>
            <RaywardMark size={28} />
            <div className={cl("blocking-text")}>
                <strong>{copy.title}</strong>
                <span>{copy.body}</span>
            </div>
            <button className={cl("button")} onClick={fixable ? openSettings : onRetry}>
                {fixable ? "Open settings" : "Retry"}
            </button>
        </div>
    );
}

export function RetryButton({ source, onRetry }: { source: string; onRetry(): void; }) {
    return (
        <TooltipContainer text="Retry">
            <button
                className={cl("icon-btn")}
                aria-label={`Retry ${source}`}
                onClick={e => {
                    e.stopPropagation();
                    onRetry();
                }}
            >
                <RetryIcon size={15} />
            </button>
        </TooltipContainer>
    );
}

export function ErrorStatus({ error }: { error: RaywardError; }) {
    return (
        <TooltipContainer text={
            <div className={cl("scope", "tooltip")}>
                <strong>{describeError(error).replace(/^./, c => c.toUpperCase())}</strong>
                <span className={cl("tooltip-reasons")}>{error.message}</span>
            </div>
        }>
            <StatusLabel tone="error" />
        </TooltipContainer>
    );
}

export function IncompleteBanner({ failed, onRetry }: { failed: FailedSource[]; onRetry(providerId: string): void; }) {
    if (!failed.length) return null;
    return (
        <div className={cl("incomplete", "enter")} role="status">
            <RaywardMark size={16} />
            <span className={cl("incomplete-text")}>
                {failed.length === 1 ? `${failed[0].source} didn't answer` : `${listAnd(failed.map(f => f.source))} didn't answer`}. Other sources are shown.
            </span>
            {failed.length === 1
                ? <RetryButton source={failed[0].source} onRetry={() => onRetry(failed[0].providerId)} />
                : <button className={cl("link-btn")} onClick={() => failed.forEach(f => onRetry(f.providerId))}>Retry all</button>}
        </div>
    );
}
