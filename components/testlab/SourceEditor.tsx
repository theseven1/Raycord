/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { useState } from "@webpack/common";

import { describeError, makeError } from "../../data/errors";
import { ERROR_KINDS, type MockResult, type MockSource, type MockSourceState, nowSeconds } from "../../data/mock";
import { allowedFlags, exampleServer, flagFor, type LabSubject, outfitReason, relabel, statusFor, textReason, userReason } from "../../data/mockPresets";
import type { DiscordGuildEvidence, RaywardEvidence, RaywardProvider, RaywardReason } from "../../data/types";
import { cl } from "../../lib/utils";
import { SourceLogo } from "../brand/Brand";
import { Choice, Field, optional, TextField, Toggle, wholeNumber } from "./fields";

const STATE_OPTIONS: { label: string; value: MockSourceState; }[] = [
    { label: "No record", value: "none" },
    { label: "Has a record", value: "ok" },
    { label: "Still checking", value: "checking" },
    ...ERROR_KINDS.map(kind => ({ label: `Error: ${describeError(makeError(kind, ""))}`, value: kind })),
];

const HOUR = 3600;
const DAY = 86_400;

const ago = (ts: number | undefined, unit: number) => ts ? String(Math.max(0, Math.round((nowSeconds() - ts) / unit))) : "";
const fromAgo = (value: string, unit: number) => value.trim() ? nowSeconds() - Number(value) * unit : undefined;

export function SourceEditor({ subject, providers, sources, subjectId, onChange }: {
    subject: LabSubject;
    providers: RaywardProvider[];
    sources: Record<string, MockSource>;
    subjectId: string;
    onChange(providerId: string, source: MockSource): void;
}) {
    if (!providers.length) return <p className={cl("muted")}>Rayward's source list hasn't loaded yet.</p>;

    return (
        <div className={cl("lab-sources")}>
            {providers.map(provider => (
                <SourceRow
                    key={provider.id}
                    subject={subject}
                    provider={provider}
                    source={sources[provider.id] ?? { state: "none" }}
                    subjectId={subjectId}
                    onChange={next => onChange(provider.id, next)}
                />
            ))}
        </div>
    );
}

function SourceRow({ subject, provider, source, subjectId, onChange }: { subject: LabSubject; provider: RaywardProvider; source: MockSource; subjectId: string; onChange(source: MockSource): void; }) {
    const [open, setOpen] = useState(false);
    const result = source.result ?? {};
    const hasRecord = source.state === "ok";
    const update = (patch: MockResult) => onChange({ state: "ok", result: { ...result, ...patch } });

    const flags = allowedFlags(provider, subject).map(t => ({ label: statusFor(provider, t.value) ?? t.name, value: t.value }));
    const setFlag = (flagType: number) => onChange({ state: "ok", result: relabel(provider, subject, result, flagType, subjectId) });
    const setState = (state: MockSourceState) => onChange({
        state,
        result: state === "ok" && result.flagType === undefined ? relabel(provider, subject, result, flagFor(provider, "unsafe", subject) ?? 0, subjectId) : source.result,
    });

    return (
        <div className={cl("lab-source")}>
            <div className={cl("lab-source-row")}>
                <div className={cl("lab-source-name")}><SourceLogo provider={provider} height={16} /></div>
                <Choice options={STATE_OPTIONS} value={source.state} onChange={setState} />
                <Choice options={flags} value={hasRecord ? result.flagType ?? 0 : undefined} onChange={setFlag} disabled={!hasRecord} />
                <Button size="small" variant="secondary" disabled={!hasRecord} onClick={() => setOpen(o => !o)}>
                    {open && hasRecord ? "Hide" : "Details"}
                </Button>
            </div>
            {open && hasRecord && (
                <div className={cl("lab-details")}>
                    <div className={cl("lab-grid")}>
                        <Field label="Status label">
                            <TextField value={result.statusLabel ?? ""} placeholder="Uses the flag name" onCommit={v => update({ statusLabel: optional(v) })} />
                        </Field>
                        <Field label="Message" wide>
                            <TextField multiline rows={2} value={result.headerMessage ?? ""} onCommit={v => update({ headerMessage: optional(v) })} />
                        </Field>
                        {subject === "roblox" && <>
                            <Field label="Category">
                                <TextField value={result.categoryLabel ?? ""} onCommit={v => update({ categoryLabel: optional(v), category: optional(v)?.toLowerCase() })} />
                            </Field>
                            <Field label="Reviewed by">
                                <TextField value={result.reviewer?.displayName ?? ""} onCommit={v => update({ reviewer: optional(v) ? { username: v.trim(), displayName: v.trim() } : undefined })} />
                            </Field>
                            <Field label="Queued (hours ago)">
                                <TextField value={ago(result.queuedAt, HOUR)} validate={wholeNumber} onCommit={v => update({ queuedAt: fromAgo(v, HOUR) })} />
                            </Field>
                            <Field label="Updated (days ago)">
                                <TextField value={ago(result.lastUpdated, DAY)} validate={wholeNumber} onCommit={v => update({ lastUpdated: fromAgo(v, DAY) })} />
                            </Field>
                            <div className={cl("lab-toggles")}>
                                <Toggle label="Locked" checked={!!result.isLocked} onChange={isLocked => update({ isLocked })} />
                                <Toggle label="Processed" checked={!!result.processed} onChange={processed => update({ processed, processedAt: processed ? result.processedAt ?? nowSeconds() : undefined })} />
                            </div>
                        </>}
                    </div>
                    <ReasonList title="Reasons" reasons={result.reasons ?? []} subjectId={subjectId} onChange={reasons => update({ reasons })} />
                    {subject === "roblox" && <ReasonList title="Provisional reasons" reasons={result.provisionalReasons ?? []} subjectId={subjectId} onChange={provisionalReasons => update({ provisionalReasons })} />}
                </div>
            )}
        </div>
    );
}

function ReasonList({ title, reasons, subjectId, onChange }: { title: string; reasons: RaywardReason[]; subjectId: string; onChange(reasons: RaywardReason[]): void; }) {
    const edit = (index: number, mutate: (reason: RaywardReason) => void) => onChange(reasons.map((reason, i) => {
        if (i !== index) return reason;
        const next = structuredClone(reason);
        mutate(next);
        return next;
    }));
    const addEvidence = (index: number, evidence: RaywardEvidence) => edit(index, r => {
        r.evidence = [...r.evidence ?? [], evidence];
    });

    return (
        <div className={cl("lab-reasons")}>
            <div className={cl("lab-reasons-head")}>
                <span className={cl("lab-label")}>{title}</span>
                <Button size="small" variant="secondary" onClick={() => onChange([...reasons, textReason("New reason")])}>Add reason</Button>
            </div>
            {reasons.map((reason, index) => (
                <div className={cl("lab-reason")} key={index}>
                    <div className={cl("lab-grid")}>
                        <Field label="Title">
                            <TextField value={reason.title} onCommit={v => edit(index, r => { r.title = v; })} />
                        </Field>
                        <Field label="Detected by">
                            <TextField value={reason.sources[0]?.label ?? ""} onCommit={v => edit(index, r => { r.sources = v.trim() ? [{ ...r.sources[0] ?? { id: "test" }, label: v.trim() }] : []; })} />
                        </Field>
                    </div>
                    {(reason.evidence ?? []).map((evidence, i) => (
                        <EvidenceRow
                            key={i}
                            evidence={evidence}
                            onChange={next => edit(index, r => { r.evidence = r.evidence!.map((e, j) => j === i ? next : e); })}
                            onRemove={() => edit(index, r => { r.evidence = r.evidence!.filter((_, j) => j !== i); })}
                        />
                    ))}
                    <div className={cl("lab-actions")}>
                        <span className={cl("muted")}>Add evidence:</span>
                        <Button size="small" variant="secondary" onClick={() => addEvidence(index, { kind: "text", text: "Example evidence" })}>Text</Button>
                        <Button size="small" variant="secondary" onClick={() => addEvidence(index, outfitReason().evidence![0])}>Outfit</Button>
                        <Button size="small" variant="secondary" onClick={() => addEvidence(index, exampleServer(subjectId))}>Server</Button>
                        <Button size="small" variant="secondary" onClick={() => addEvidence(index, userReason(subjectId).evidence![0])}>Discord user</Button>
                        <span className={cl("lab-spacer")} />
                        <Button size="small" variant="dangerSecondary" onClick={() => onChange(reasons.filter((_, i) => i !== index))}>Remove reason</Button>
                    </div>
                </div>
            ))}
        </div>
    );
}

const EVIDENCE_NAMES: Record<string, string> = { text: "Text", outfit: "Outfit", discordGuild: "Server", discordUser: "Discord user" };

function EvidenceRow({ evidence, onChange, onRemove }: { evidence: RaywardEvidence; onChange(e: RaywardEvidence): void; onRemove(): void; }) {
    return (
        <div className={cl("lab-evidence")}>
            <div className={cl("lab-evidence-head")}>
                <span className={cl("lab-label")}>{EVIDENCE_NAMES[evidence.kind] ?? evidence.kind}</span>
                <Button size="min" variant="dangerSecondary" onClick={onRemove}>Remove</Button>
            </div>
            <EvidenceFields evidence={evidence} onChange={onChange} />
        </div>
    );
}

function EvidenceFields({ evidence, onChange }: { evidence: RaywardEvidence; onChange(e: RaywardEvidence): void; }) {
    switch (evidence.kind) {
        case "text": {
            const e = evidence as Extract<RaywardEvidence, { kind: "text"; }>;
            return <TextField multiline rows={2} value={e.text} onCommit={text => onChange({ ...e, text })} />;
        }
        case "outfit": {
            const e = evidence as Extract<RaywardEvidence, { kind: "outfit"; }>;
            return (
                <div className={cl("lab-grid")}>
                    <Field label="Name"><TextField value={e.name} onCommit={name => onChange({ ...e, name })} /></Field>
                    <Field label="Category"><TextField value={e.category} onCommit={category => onChange({ ...e, category })} /></Field>
                    <Field label="Description" wide><TextField multiline rows={2} value={e.description} onCommit={description => onChange({ ...e, description })} /></Field>
                </div>
            );
        }
        case "discordGuild": {
            const e = evidence as DiscordGuildEvidence;
            return (
                <div className={cl("lab-grid")}>
                    <Field label="Server name"><TextField value={e.name ?? e.safeName} onCommit={name => onChange({ ...e, name, safeName: name })} /></Field>
                    <Field label="Types"><TextField value={e.types.join(", ")} placeholder="Comma separated" onCommit={v => onChange({ ...e, types: v.split(",").map(s => s.trim()).filter(Boolean) })} /></Field>
                    <Field label="Messages"><TextField value={String(e.messages ?? 0)} validate={wholeNumber} onCommit={v => onChange({ ...e, messages: Number(v) || 0 })} /></Field>
                    <Field label="Joined (days ago)"><TextField value={ago(e.joinedAt ?? undefined, DAY)} validate={wholeNumber} onCommit={v => onChange({ ...e, joinedAt: fromAgo(v, DAY) ?? null })} /></Field>
                </div>
            );
        }
        case "discordUser": {
            const e = evidence as Extract<RaywardEvidence, { kind: "discordUser"; }>;
            return <TextField value={e.discordId} validate={v => /^\d{15,21}$/.test(v) ? undefined : "Use a Discord user ID"} onCommit={discordId => onChange({ ...e, discordId })} />;
        }
        default:
            return <p className={cl("muted")}>Edit this one in the Session tab.</p>;
    }
}
