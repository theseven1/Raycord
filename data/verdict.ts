/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Severity } from "../lib/utils";
import type { EasiResult, FailedSource, Finding, RaywardFlagType, RaywardProvider, RaywardResult, SourceOutcome, SourceVerdict, SubjectLookup, Tone, Verdict } from "./types";

const PROVISIONAL_FLAG = 4;
const PAST_OFFENDER_FLAG = 6;
const SPECIAL_LABELS: Record<number, string> = { [PROVISIONAL_FLAG]: "Provisional", [PAST_OFFENDER_FLAG]: "Past offender" };

export const TONE_RANK: Record<Tone, number> = { safe: 0, pending: 1, provisional: 2, mixed: 3, unsafe: 4 };
export const worstTone = (tones: Tone[]): Tone => tones.reduce<Tone>((a, b) => TONE_RANK[b] > TONE_RANK[a] ? b : a, "safe");

export const flagTypeOf = (provider: RaywardProvider, result: RaywardResult | null): RaywardFlagType | undefined =>
    result ? provider.flagTypes.find(t => t.value === result.flagType) : undefined;

export function toneOf(provider: RaywardProvider, result: RaywardResult | null): Tone {
    if (!result || result.flagType === 0) return "safe";
    if (result.flagType === PROVISIONAL_FLAG) return "provisional";
    if (result.flagType === PAST_OFFENDER_FLAG) return "mixed";

    const type = flagTypeOf(provider, result);
    switch (type?.tone) {
        case "safe":
        case "pending":
        case "mixed":
        case "unsafe":
            return type.tone;
        default:
            return type?.safeToAction ? "unsafe" : "pending";
    }
}

export function statusLabel(provider: RaywardProvider, result: RaywardResult | null): string {
    if (!result || result.flagType === 0) return "Not flagged";
    return result.statusLabel ?? flagTypeOf(provider, result)?.name ?? SPECIAL_LABELS[result.flagType] ?? `Status ${result.flagType}`;
}

export const isActionable = (provider: RaywardProvider, result: RaywardResult | null) =>
    !!flagTypeOf(provider, result)?.safeToAction;

export const okResults = (lookup: SubjectLookup | undefined) =>
    (lookup?.outcomes ?? []).filter((o): o is Extract<SourceOutcome, { state: "ok"; }> => o.state === "ok");

export const failedOutcomes = (lookup: SubjectLookup | undefined) =>
    (lookup?.outcomes ?? []).filter((o): o is Extract<SourceOutcome, { state: "error"; }> => o.state === "error");

function contributionsOf(lookup: SubjectLookup, subject: "Discord" | "Roblox"): SourceVerdict[] {
    return okResults(lookup).flatMap(({ provider, result }) => {
        const type = flagTypeOf(provider, result);
        if (!result || !type?.safeToAction) return [];
        const reasons = result.reasons?.map(r => r.title).filter(Boolean) ?? [];
        return [{
            providerId: provider.id,
            source: provider.name,
            severity: type.severity >= 9 ? Severity.Extreme : Severity.High,
            tone: toneOf(provider, result),
            detail: `${subject} account: ${statusLabel(provider, result).toLowerCase()}${reasons.length ? ` (${reasons.join(", ")})` : ""}`,
        }];
    });
}

export const easiFlagTexts = (notes: Map<number, EasiResult | null>) =>
    [...notes.values()].flatMap(n => n?.kind === "note" ? [n.note.moderation_note] : []);

function easiContribution(notes: Map<number, EasiResult | null>): SourceVerdict | null {
    const texts = easiFlagTexts(notes);
    if (!texts.length) return null;
    const erp = [...notes.values()].some(n => n?.kind === "note" && n.note.is_erp);
    return {
        providerId: "easi",
        source: "EASI",
        severity: erp ? Severity.High : Severity.Moderate,
        tone: "unsafe",
        detail: `Roblox account: ${erp ? "flagged for ERP" : "flagged"}`,
    };
}

export function buildVerdict(discord: SubjectLookup, accounts: Iterable<SubjectLookup>, notes: Map<number, EasiResult | null> = new Map()): Verdict {
    const lookups = [discord, ...accounts];

    const easi = easiContribution(notes);
    const contributions = [
        ...contributionsOf(discord, "Discord"),
        ...lookups.slice(1).flatMap(l => contributionsOf(l, "Roblox")),
        ...(easi ? [easi] : []),
    ].sort((a, b) => b.severity - a.severity);

    const tone = worstTone([
        ...lookups.flatMap(l => okResults(l).map(o => toneOf(o.provider, o.result))),
        ...contributions.map(c => c.tone),
    ]);

    const findings = new Map<string, Finding>();
    const addFinding = (f: Finding) => {
        const existing = findings.get(f.providerId);
        if (!existing) return void findings.set(f.providerId, { ...f, reasons: [...f.reasons] });
        if (TONE_RANK[f.tone] > TONE_RANK[existing.tone]) Object.assign(existing, { tone: f.tone, label: f.label });
        for (const r of f.reasons) if (!existing.reasons.includes(r)) existing.reasons.push(r);
    };
    for (const lookup of lookups) {
        for (const { provider, result } of okResults(lookup)) {
            const tone = toneOf(provider, result);
            if (tone === "safe") continue;
            addFinding({ providerId: provider.id, source: provider.name, tone, label: statusLabel(provider, result), reasons: result?.reasons?.map(r => r.title) ?? [] });
        }
    }
    if (easi) {
        const erp = easi.severity === Severity.High;
        addFinding({ providerId: "easi", source: "EASI", tone: "unsafe", label: erp ? "ERP" : "Flagged", reasons: easiFlagTexts(notes) });
    }

    const failed = new Map<string, FailedSource>();
    for (const lookup of lookups) {
        for (const { provider, error } of failedOutcomes(lookup)) {
            if (!failed.has(provider.id)) failed.set(provider.id, { source: provider.name, providerId: provider.id, error });
        }
    }

    return {
        severity: contributions[0]?.severity ?? Severity.Clean,
        tone,
        contributions,
        findings: [...findings.values()].sort((a, b) => TONE_RANK[b.tone] - TONE_RANK[a.tone]),
        failed: [...failed.values()],
    };
}

export const EMPTY_VERDICT: Verdict = { severity: Severity.Clean, tone: "safe", contributions: [], findings: [], failed: [] };

export const verdictSources = (verdict: Verdict) => [...new Set(verdict.contributions.map(c => c.source))];

export interface GroupedReason { providerId: string; source: string; tone: Tone; reasons: string[]; }

export function verdictReasons(verdict: Verdict): GroupedReason[] {
    const grouped = new Map<string, GroupedReason>();
    for (const { providerId, source, tone, detail } of verdict.contributions) {
        const entry = grouped.get(providerId);
        if (entry) {
            entry.reasons.push(detail);
            entry.tone = worstTone([entry.tone, tone]);
        } else grouped.set(providerId, { providerId, source, tone, reasons: [detail] });
    }
    return [...grouped.values()];
}

function outcomeRank(o: SourceOutcome) {
    if (o.state === "ok") return 10 + TONE_RANK[toneOf(o.provider, o.result)];
    return o.state === "error" ? 5 : 0;
}

export const sortOutcomes = (outcomes: SourceOutcome[]) => [...outcomes].sort((a, b) => outcomeRank(b) - outcomeRank(a));
