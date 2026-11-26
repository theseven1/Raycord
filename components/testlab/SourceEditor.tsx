/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";

import { describeError, makeError } from "../../data/errors";
import { ERROR_KINDS, type MockSource, type MockSourceState, nowSeconds, TEST_FLAG_TYPES } from "../../data/mock";
import { exampleServer, flagFor, outfitReason, textReason, userReason } from "../../data/mockPresets";
import type { RaywardEvidence, RaywardProvider, RaywardReason } from "../../data/types";
import { cl } from "../../lib/utils";
import { SourceLogo } from "../brand/Brand";
import { LabField, LabSelect, LabSwitch, LabText } from "./fields";

const states: MockSourceState[] = ["none", "ok", "checking", ...ERROR_KINDS];

export function SourceEditor({ providers, sources, subjectId, onChange }: { providers: RaywardProvider[]; sources: Record<string, MockSource>; subjectId: string; onChange(id: string, source: MockSource): void; }) {
    return <div className={cl("lab-grid")}>{providers.map(provider => {
        const source = sources[provider.id] ?? { state: "none" as const };
        const result = source.result ?? {};
        const flags = [...provider.flagTypes];
        for (const special of TEST_FLAG_TYPES.filter(f => [4, 6].includes(f.value))) {
            if (!flags.some(f => f.value === special.value)) flags.push(special);
        }
        const updateResult = (patch: NonNullable<MockSource["result"]>) => onChange(provider.id, { ...source, state: "ok", result: { ...result, ...patch } });
        return <div key={provider.id} className={cl("lab-source", "lab-card")}>
            <div className={cl("lab-source-head")}><SourceLogo provider={provider} height={18} /><strong>{provider.name}</strong></div>
            <LabSelect<MockSourceState> options={states.map(state => ({ value: state, label: state === "none" ? "No record" : state === "ok" ? "Has a record" : state === "checking" ? "Still checking" : `Error: ${describeError(makeError(state, ""))}` }))} value={source.state} onChange={state => onChange(provider.id, { ...source, state, ...(state === "ok" && result.flagType === undefined ? { result: { ...result, flagType: flagFor(provider, "unsafe") } } : {}) })} />
            {source.state === "ok" && <>
                <LabSelect options={flags.map(flag => ({ value: String(flag.value), label: `${flag.name} (${flag.value})` }))} value={String(result.flagType ?? flagFor(provider, "unsafe"))} onChange={value => updateResult({ flagType: Number(value) })} />
                <LabText value={result.statusLabel ?? ""} placeholder="Status label" onCommit={statusLabel => updateResult({ statusLabel: statusLabel || undefined })} />
                <LabText value={result.headerMessage ?? ""} placeholder="Header message" onCommit={headerMessage => updateResult({ headerMessage: headerMessage || undefined })} />
                <LabText value={result.categoryLabel ?? ""} placeholder="Category label" onCommit={categoryLabel => updateResult({ categoryLabel: categoryLabel || undefined })} />
                <LabText value={result.reviewer?.displayName ?? ""} placeholder="Reviewer display name" onCommit={displayName => updateResult({ reviewer: displayName ? { username: displayName, displayName } : undefined })} />
                <LabSwitch label="Locked" checked={!!result.isLocked} onChange={isLocked => updateResult({ isLocked })} />
                <LabSwitch label="Processed" checked={!!result.processed} onChange={processed => updateResult({ processed })} />
                <LabField label="Queued hours ago"><LabText value={result.queuedAt ? String(Math.max(0, Math.round((nowSeconds() - result.queuedAt) / 3600))) : ""} onCommit={v => updateResult({ queuedAt: v ? nowSeconds() - Number(v) * 3600 : undefined })} validate={v => v && !/^\d+$/.test(v) ? "Enter hours as a whole number" : undefined} /></LabField>
                <LabField label="Updated days ago"><LabText value={result.lastUpdated ? String(Math.max(0, Math.round((nowSeconds() - result.lastUpdated) / 86400))) : ""} onCommit={v => updateResult({ lastUpdated: v ? nowSeconds() - Number(v) * 86400 : undefined })} validate={v => v && !/^\d+$/.test(v) ? "Enter days as a whole number" : undefined} /></LabField>
                <ReasonsEditor title="Reasons" reasons={result.reasons ?? []} subjectId={subjectId} onChange={reasons => updateResult({ reasons })} />
                <ReasonsEditor title="Provisional reasons" reasons={result.provisionalReasons ?? []} subjectId={subjectId} onChange={provisionalReasons => updateResult({ provisionalReasons })} />
            </>}
        </div>;
    })}</div>;
}

function ReasonsEditor({ title, reasons, subjectId, onChange }: { title: string; reasons: RaywardReason[]; subjectId: string; onChange(reasons: RaywardReason[]): void; }) {
    const updateReason = (index: number, mutate: (reason: RaywardReason) => void) => onChange(reasons.map((reason, i) => {
        if (i !== index) return reason;
        const next = structuredClone(reason);
        mutate(next);
        return next;
    }));
    const addReason = () => onChange([...reasons, textReason("New reason")]);
    const addEvidence = (index: number, evidence: RaywardEvidence) => updateReason(index, reason => { reason.evidence = [...(reason.evidence ?? []), evidence]; });
    return <div className={cl("lab-field")}>
        <strong>{title}</strong>
        {reasons.map((reason, index) => <div className={cl("lab-reason")} key={`${reason.type}-${index}`}>
            <LabText value={reason.title} placeholder="Reason title" onCommit={title => updateReason(index, r => { r.title = title; })} />
            <LabText value={reason.sources[0]?.label ?? ""} placeholder="Detector label" onCommit={label => updateReason(index, r => { r.sources = [{ ...(r.sources[0] ?? { id: "test" }), label }]; })} />
            {(reason.evidence ?? []).map((evidence, evidenceIndex) => <EvidenceEditor key={evidenceIndex} evidence={evidence} onChange={next => updateReason(index, r => { r.evidence = [...(r.evidence ?? [])].map((item, i) => i === evidenceIndex ? next : item); })} />)}
            <div className={cl("lab-bar")}>
                <Button size="small" variant="secondary" onClick={() => addEvidence(index, { kind: "text", text: "Example evidence" })}>Text</Button>
                <Button size="small" variant="secondary" onClick={() => addEvidence(index, outfitReason().evidence![0])}>Outfit</Button>
                <Button size="small" variant="secondary" onClick={() => addEvidence(index, exampleServer(subjectId, "Example server"))}>Server</Button>
                <Button size="small" variant="secondary" onClick={() => addEvidence(index, userReason(subjectId).evidence![0])}>Discord user</Button>
                <Button size="small" variant="dangerPrimary" onClick={() => onChange(reasons.filter((_, i) => i !== index))}>Remove reason</Button>
            </div>
        </div>)}
        <Button size="small" variant="secondary" onClick={addReason}>Add reason</Button>
    </div>;
}

function EvidenceEditor({ evidence, onChange }: { evidence: RaywardEvidence; onChange(evidence: RaywardEvidence): void; }) {
    if (evidence.kind === "text") {
        const textEvidence = evidence as Extract<RaywardEvidence, { kind: "text"; }>;
        return <LabText multiline value={textEvidence.text} onCommit={text => onChange({ ...textEvidence, text })} placeholder="Evidence text" />;
    }
    if (evidence.kind === "outfit") {
        const outfit = evidence as Extract<RaywardEvidence, { kind: "outfit"; }>;
        return <div className={cl("lab-evidence")}>
        <LabText value={outfit.name} onCommit={name => onChange({ ...outfit, name })} placeholder="Outfit name" />
        <LabText value={outfit.category} onCommit={category => onChange({ ...outfit, category })} placeholder="Category" />
        <LabText multiline value={outfit.description} onCommit={description => onChange({ ...outfit, description })} placeholder="Description" />
    </div>;
    }
    if (evidence.kind === "discordGuild") {
        const guild = evidence as Extract<RaywardEvidence, { kind: "discordGuild"; }>;
        return <div className={cl("lab-evidence")}>
            <LabText value={guild.name ?? guild.safeName} onCommit={name => onChange({ ...guild, name, safeName: name })} placeholder="Server name" />
            <LabText value={guild.types.join(", ")} onCommit={value => onChange({ ...guild, types: value.split(",").map(s => s.trim()).filter(Boolean) })} placeholder="Types, comma separated" />
            <LabText value={String(guild.messages ?? 0)} onCommit={value => onChange({ ...guild, messages: Number(value) || 0 })} placeholder="Message count" />
        </div>;
    }
    if (evidence.kind === "discordUser") {
        const discordUser = evidence as Extract<RaywardEvidence, { kind: "discordUser"; }>;
        return <LabText value={discordUser.discordId} onCommit={discordId => onChange({ ...discordUser, discordId })} placeholder="Discord ID" validate={value => /^\d{15,21}$/.test(value) ? undefined : "Enter a Discord ID"} />;
    }
    return <p className={cl("lab-hint")}>This evidence type is read-only. Edit it in the Session tab: {evidence.kind}</p>;
}
