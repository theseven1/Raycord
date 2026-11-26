/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { EasiNote, EasiResult } from "../../data/types";
import { cl } from "../../lib/utils";
import { EasiLogo } from "../brand/Brand";
import { StatusLabel } from "../brand/StatusIcon";
import { SourceFrame } from "./SourceCard";

export interface EasiFlag { id: number; name: string; note: EasiNote; }

export function easiFlags(notes: Map<number, EasiResult | null>, names: Map<number, string>): EasiFlag[] {
    return [...notes].flatMap(([id, n]) => n?.kind === "note" ? [{ id, name: names.get(id) ?? String(id), note: n.note }] : []);
}

export const easiRejected = (notes: Map<number, EasiResult | null>) => [...notes.values()].some(n => n?.kind === "unauthorized");

export function EasiCard({ flags, index, showAccount = true }: { flags: EasiFlag[]; index?: number; showAccount?: boolean; }) {
    if (!flags.length) return null;
    const erp = flags.some(f => f.note.is_erp);

    return (
        <SourceFrame
            index={index}
            tone="unsafe"
            logo={<EasiLogo />}
            summary={flags.length === 1 ? flags[0].note.moderation_note : `Flagged on ${flags.length} linked accounts`}
            status={<StatusLabel tone="unsafe" label={erp ? "ERP" : "Flagged"} />}
        >
            <section className={cl("body-section")}>
                <h4 className={cl("subheading")}>{flags.length === 1 ? "Reason" : "Reasons"}</h4>
                {flags.map(({ id, name, note }) => (
                    <blockquote key={id} className={cl("note")}>
                        {(showAccount || note.is_erp) && (
                            <cite>{[showAccount && `On ${name}`, note.is_erp && "ERP"].filter(Boolean).join(" · ")}</cite>
                        )}
                        <p>{note.moderation_note}</p>
                    </blockquote>
                ))}
            </section>
        </SourceFrame>
    );
}

export function EasiRejectedNotice() {
    return <div className={cl("notice")}>EASI secret rejected or invalid.</div>;
}
