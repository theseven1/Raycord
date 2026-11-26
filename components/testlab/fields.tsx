/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FormSwitch } from "@components/FormSwitch";
import { Select, TextInput, useEffect, useState } from "@webpack/common";

import { cl } from "../../lib/utils";

export function LabField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode; }) {
    return <label className={cl("lab-field")}><span className={cl("lab-label")}>{label}</span>{children}{hint && <span className={cl("lab-hint")}>{hint}</span>}</label>;
}

export function LabText({ value, onCommit, multiline, placeholder, validate }: { value: string; onCommit(value: string): void; multiline?: boolean; placeholder?: string; validate?(value: string): string | undefined; }) {
    const [draft, setDraft] = useState(value);
    useEffect(() => setDraft(value), [value]);
    const commit = () => { if (!validate?.(draft)) onCommit(draft); };
    return multiline
        ? <textarea className={cl("lab-input", "lab-textarea")} value={draft} onChange={e => setDraft(e.currentTarget.value)} onBlur={commit} placeholder={placeholder} />
        : <TextInput value={draft} onChange={setDraft} onBlur={commit} placeholder={placeholder} error={validate?.(draft)} onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}

export function LabSelect<T extends string>({ options, value, onChange }: { options: { label: string; value: T; }[]; value: T; onChange(value: T): void; }) {
    return <Select options={options} isSelected={o => o.value === value} select={o => onChange(o.value)} serialize={o => o.label} closeOnSelect />;
}

export function LabSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void; }) {
    return <FormSwitch title={label} value={checked} onChange={onChange} />;
}
