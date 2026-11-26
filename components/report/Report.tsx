/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useState } from "@webpack/common";

import type { RaywardReport } from "../../data/hooks";
import { sortOutcomes, toneOf } from "../../data/verdict";
import { cl } from "../../lib/utils";
import { BlockingState, LoadingBlock, type TabId, Tabs, type TabSpec } from "../shared";
import { EasiCard, easiFlags } from "./EasiCard";
import { Overview } from "./Overview";
import { RobloxPanel } from "./RobloxPanel";
import { SourceCard } from "./SourceCard";

function SourcesPanel({ report }: { report: RaywardReport; }) {
    const outcomes = sortOutcomes(report.discord.outcomes);
    const flagged = outcomes.filter(o => o.state === "ok" && toneOf(o.provider, o.result) !== "safe");
    const rest = outcomes.filter(o => !flagged.includes(o));
    const flags = easiFlags(report.notes, new Map([...report.connections, ...report.alts].map(c => [c.robloxUserId, c.robloxUsername])));

    if (!outcomes.length) return <div className={cl("empty", "enter")}>No sources available.</div>;

    return (
        <div className={cl("list")}>
            {flagged.map((o, i) => <SourceCard key={o.provider.id} index={i} outcome={o} onRetry={() => report.retrySource(o.provider.id)} />)}
            <EasiCard flags={flags} index={flagged.length} />
            {rest.map((o, i) => <SourceCard key={o.provider.id} index={flagged.length + 1 + i} outcome={o} onRetry={() => report.retrySource(o.provider.id)} />)}
        </div>
    );
}

export function ReportBody({ report, initialTab = "overview", scroll }: { report: RaywardReport; initialTab?: TabId; scroll?: boolean; }) {
    const [tab, setTab] = useState<TabId>(initialTab);

    if (report.blocking) return <BlockingState error={report.blocking} onRetry={report.refresh} />;
    if (report.state !== "ready") return <LoadingBlock />;

    const hasEasi = [...report.notes.values()].some(n => n?.kind === "note");
    const notable = report.discord.outcomes.filter(o => o.state === "error" || (o.state === "ok" && toneOf(o.provider, o.result) !== "safe")).length;
    const tabs: TabSpec[] = [
        { id: "overview", label: "Overview" },
        { id: "sources", label: "Sources", badge: notable + (hasEasi ? 1 : 0) },
        { id: "roblox", label: "Roblox", badge: report.connections.length + report.alts.length },
    ];

    return (
        <div className={cl("report", "enter")}>
            <Tabs<TabId> tabs={tabs} active={tab} onSelect={setTab} />
            <div key={tab} className={cl("tabpanel", scroll && "scroll")} role="tabpanel">
                {tab === "overview" && <Overview report={report} onOpenTab={setTab} />}
                {tab === "sources" && <SourcesPanel report={report} />}
                {tab === "roblox" && <RobloxPanel report={report} />}
            </div>
        </div>
    );
}
