/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useState } from "@webpack/common";
import type { ReactNode } from "react";

import type { RaywardReport } from "../../data/hooks";
import type { RaywardProvider, RaywardResult, Tone } from "../../data/types";
import { okResults, statusLabel, TONE_RANK, toneOf, verdictSources, worstTone } from "../../data/verdict";
import { cl, listAnd, plural, Severity } from "../../lib/utils";
import { RobloxIcon, SourceLogo } from "../brand/Brand";
import { ChevronIcon, DiscordIcon } from "../brand/icons";
import { StatusIcon, StatusLabel, TONE_LABEL } from "../brand/StatusIcon";
import { IncompleteBanner, Reveal, type TabId } from "../shared";
import { EasiCard, easiFlags, easiRejected, EasiRejectedNotice } from "./EasiCard";
import { SourceFrame } from "./SourceCard";

interface Row { provider: RaywardProvider; result: RaywardResult | null; tone: Tone; }

function ResultRow({ row, index }: { row: Row; index: number; }) {
    return (
        <SourceFrame
            index={index}
            tone={row.tone}
            logo={<SourceLogo provider={row.provider} />}
            summary={row.result?.reasons?.map(r => r.title).join(", ")}
            status={<StatusLabel tone={row.tone} label={statusLabel(row.provider, row.result)} />}
        />
    );
}

function headline(report: RaywardReport, rows: Row[]): string {
    const { verdict } = report;
    if (verdict.severity > Severity.Clean) return `Flagged by ${listAnd(verdictSources(verdict))}`;

    const notable = rows.filter(r => r.tone !== "safe");
    if (notable.length) {
        const tone = worstTone(notable.map(r => r.tone));
        const names = listAnd(notable.filter(r => r.tone === tone).map(r => r.provider.name));
        return tone === "pending" ? `Under review by ${names}` : `${TONE_LABEL[tone]} result from ${names}`;
    }
    if (!rows.length && verdict.failed.length) return "Couldn't complete the check";
    return verdict.failed.length ? "Not flagged" : "Not flagged";
}

function LinkRow({ icon, label, value, tone, onClick }: { icon?: ReactNode; label: string; value: string; tone?: Tone; onClick(): void; }) {
    return (
        <button className={cl("card", "card-head", "card-head-toggle", "link-row", "enter")} onClick={onClick}>
            <span className={cl("cell-icon")}>{icon}</span>
            <span className={cl("cell-name")}>{label}</span>
            <span className={cl("cell-summary")} />
            <span className={cl("cell-status")}>
                <span className={cl("status")}>
                    {tone && <StatusIcon tone={tone} size={14} />}
                    <span className={cl("status-text")}>{value}</span>
                </span>
            </span>
            <span className={cl("cell-action")}><ChevronIcon expanded={false} /></span>
        </button>
    );
}

export function Overview({ report, onOpenTab }: { report: RaywardReport; onOpenTab(tab: TabId): void; }) {
    const [showClear, setShowClear] = useState(false);

    const rows: Row[] = okResults(report.discord)
        .map(({ provider, result }) => ({ provider, result, tone: toneOf(provider, result) }))
        .sort((a, b) => TONE_RANK[b.tone] - TONE_RANK[a.tone]);
    const notable = rows.filter(r => r.tone !== "safe");
    const clear = rows.filter(r => r.tone === "safe");
    const checking = report.discord.outcomes.filter(o => o.state === "loading").map(o => o.provider.name);

    const linked = [...report.connections, ...report.alts];
    const linkedTones = [...report.accounts.values()].map(l => worstTone(okResults(l).map(o => toneOf(o.provider, o.result))));
    const flaggedAccounts = linkedTones.filter(t => t !== "safe").length;
    const flags = easiFlags(report.notes, new Map(linked.map(c => [c.robloxUserId, c.robloxUsername])));

    return (
        <div className={cl("list")}>
            <p className={cl("headline", "full")}>{headline(report, rows)}</p>

            <div className={cl("full")}><IncompleteBanner failed={report.verdict.failed} onRetry={report.retrySource} /></div>

            {notable.map((row, i) => <ResultRow key={row.provider.id} row={row} index={i} />)}
            <EasiCard flags={flags} index={notable.length} />
            {easiRejected(report.notes) && <div className={cl("full")}><EasiRejectedNotice /></div>}

            {!!checking.length && <div className={cl("muted", "checking", "full")}>Still checking {listAnd(checking)}</div>}

            {!!clear.length && (
                <>
                    <button className={cl("toggle", "full")} onClick={() => setShowClear(v => !v)} aria-expanded={showClear}>
                        <span>{plural(clear.length, "source")} found nothing</span>
                        <span className={cl("muted", "toggle-names")}>{listAnd(clear.map(r => r.provider.name))}</span>
                        <ChevronIcon expanded={showClear} />
                    </button>
                    <Reveal open={showClear} className={cl("full", "sublist")}>
                        {clear.map((row, i) => <ResultRow key={row.provider.id} row={row} index={i} />)}
                    </Reveal>
                </>
            )}

            {!!linked.length && (
                <LinkRow
                    icon={<RobloxIcon />}
                    label="Linked Roblox accounts"
                    value={`${linked.length}${flaggedAccounts ? `, ${flaggedAccounts} with results` : ""}`}
                    tone={flaggedAccounts ? worstTone(linkedTones) : undefined}
                    onClick={() => onOpenTab("roblox")}
                />
            )}
            {!!report.discordAlts?.length && (
                <LinkRow icon={<DiscordIcon size={16} />} label="Other Discord accounts" value={String(report.discordAlts.length)} onClick={() => onOpenTab("roblox")} />
            )}
        </div>
    );
}
