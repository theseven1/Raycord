/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Link } from "@components/Link";
import { TooltipContainer } from "@components/TooltipContainer";
import { UserStore } from "@webpack/common";

import type { RaywardReport } from "../../data/hooks";
import { robloxAvatarStore, robloxProfileStore } from "../../data/roblox";
import { useSourceValue } from "../../data/store";
import type { DiscordAlt, EasiResult, RaywardConnection, SourceOutcome, SubjectLookup } from "../../data/types";
import { buildVerdict, sortOutcomes, TONE_RANK, toneOf } from "../../data/verdict";
import { cl, fmtDateUnix, fmtRelativeUnix, robloxProfileUrl } from "../../lib/utils";
import { settings } from "../../settings";
import { DiscordIcon } from "../brand/icons";
import { StatusLabel } from "../brand/StatusIcon";
import { LoadingBlock, VerdictChip } from "../shared";
import { EasiCard, easiFlags } from "./EasiCard";
import { serversFromMembership } from "./ServerTile";
import { SourceCard, SourceFrame } from "./SourceCard";

const LINK_SOURCES: Record<number, string> = { 2: "Discord profile", 3: "Rayward" };
const viaText = (sources: number[] | undefined) => sources?.length ? `via ${sources.map(s => LINK_SOURCES[s] ?? `source ${s}`).join(", ")}` : "";

function RobloxAvatar({ id }: { id: number; }) {
    const avatar = useSourceValue(robloxAvatarStore, String(id), settings.store.enableRobloxProfiles);
    return avatar
        ? <img className={cl("avatar")} src={avatar} width={28} height={28} alt="" aria-hidden />
        : <span className={cl("avatar")} aria-hidden />;
}

function RobloxName({ id, fallback }: { id: number; fallback: string; }) {
    const profile = useSourceValue(robloxProfileStore, String(id), settings.store.enableRobloxProfiles);
    const display = profile?.displayName || fallback || String(id);
    const handle = profile?.name ?? fallback;
    return (
        <span className={cl("identity-text")}>
            <strong>{display}</strong>
            <span className={cl("muted")}>
                {handle && handle !== display ? `@${handle}` : `ID ${id}`}
                {profile?.hasVerifiedBadge && " · verified"}
                {profile?.isBanned && <span className={cl("error-text")}> · banned</span>}
            </span>
        </span>
    );
}

function AccountVerdict({ lookup, notes }: { lookup?: SubjectLookup; notes: Map<number, EasiResult | null>; }) {
    if (!lookup || lookup.outcomes.every(o => o.state === "loading")) return <StatusLabel tone="loading" />;
    const verdict = buildVerdict({ outcomes: [] }, [lookup], notes);
    return <VerdictChip verdict={verdict} incomplete={!!verdict.failed.length} />;
}

function AccountCard({ connection: c, alt, lookup, report, index }: { connection: RaywardConnection; alt: boolean; lookup?: SubjectLookup; report: RaywardReport; index: number; }) {
    const trackedServers = serversFromMembership(report.memberships.get(c.robloxUserId));
    const accountNotes = new Map([[c.robloxUserId, report.notes.get(c.robloxUserId) ?? null]]);
    const flags = easiFlags(accountNotes, new Map([[c.robloxUserId, c.robloxUsername]]));
    const outcomes = sortOutcomes(lookup?.outcomes ?? []);
    const flagged = outcomes.filter(o => o.state === "ok" && toneOf(o.provider, o.result) !== "safe");
    const rest = outcomes.filter(o => !flagged.includes(o));
    const card = (o: SourceOutcome, i: number) => (
        <SourceCard
            key={o.provider.id}
            index={i}
            outcome={o}
            onRetry={() => report.retrySource(o.provider.id)}
            extraServers={o.provider.id === "rotector" ? trackedServers : undefined}
        />
    );

    return (
        <SourceFrame
            index={index}
            icon={<RobloxAvatar id={c.robloxUserId} />}
            name={<RobloxName id={c.robloxUserId} fallback={c.robloxUsername} />}
            summary={alt ? "Possible alt" : "Linked account"}
            status={<AccountVerdict lookup={lookup} notes={accountNotes} />}
        >
            <p className={cl("muted")}>
                {alt ? "Linked through another account" : "Linked to this Discord account"}
                {c.detectedAt ? <TooltipContainer text={fmtDateUnix(c.detectedAt)}><span> {fmtRelativeUnix(c.detectedAt)}</span></TooltipContainer> : null}
                {c.sources?.length ? ` ${viaText(c.sources)}` : ""}
                {" · "}<Link href={robloxProfileUrl(c.robloxUserId)}>Roblox profile</Link>
            </p>
            <div className={cl("list")}>
                {flagged.map(card)}
                <EasiCard flags={flags} index={flagged.length} showAccount={false} />
                {rest.map((o, i) => card(o, flagged.length + 1 + i))}
            </div>
        </SourceFrame>
    );
}

function DiscordAlts({ alts }: { alts: DiscordAlt[]; }) {
    return (
        <div className={cl("full", "body-section")}>
            <h4 className={cl("subheading")}><DiscordIcon />Other Discord accounts on the same Roblox account</h4>
            <ul className={cl("alts")}>
                {alts.map(alt => {
                    const user = UserStore.getUser(alt.id);
                    return (
                        <li key={alt.id} className={cl("alt")}>
                            <strong>{user ? `@${user.username}` : <code>{alt.id}</code>}</strong>
                            <span className={cl("muted")}>{alt.detectedAt ? `linked ${fmtRelativeUnix(alt.detectedAt)}` : ""} {viaText(alt.sources)}</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

export function RobloxPanel({ report }: { report: RaywardReport; }) {
    if (!report.linkedKnown) return <LoadingBlock label="Waiting for Rotector" />;

    const accountRank = (id: number) => {
        const v = buildVerdict({ outcomes: [] }, [report.accounts.get(id) ?? { outcomes: [] }], new Map([[id, report.notes.get(id) ?? null]]));
        return v.severity * 10 + TONE_RANK[v.tone];
    };
    const linked = [...report.connections.map(c => ({ c, alt: false })), ...report.alts.map(c => ({ c, alt: true }))]
        .map(entry => ({ ...entry, rank: accountRank(entry.c.robloxUserId) }))
        .sort((a, b) => b.rank - a.rank);
    if (!linked.length && !report.discordAlts?.length) {
        return <div className={cl("empty", "enter")}>Rotector has no Roblox accounts linked to this account.</div>;
    }

    return (
        <div className={cl("list", "accounts")}>
            {linked.map(({ c, alt }, i) => (
                <AccountCard key={c.robloxUserId} index={i} connection={c} alt={alt} lookup={report.accounts.get(c.robloxUserId)} report={report} />
            ))}
            {!!report.discordAlts?.length && <DiscordAlts alts={report.discordAlts} />}
        </div>
    );
}
