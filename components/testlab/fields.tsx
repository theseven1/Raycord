/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Switch } from "@components/Switch";
import { classes } from "@utils/misc";
import { Select, TextArea, TextInput, useEffect, useState } from "@webpack/common";
import type { ReactNode } from "react";

import { cl } from "../../lib/utils";

export function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode; }) {
    return (
        <div className={classes(cl("lab-field"), wide && cl("lab-wide"))}>
            <span className={cl("lab-label")}>{label}</span>
            {children}
        </div>
    );
}

interface TextFieldProps {
    value: string;
    onCommit(value: string): void;
    placeholder?: string;
    multiline?: boolean;
    rows?: number;
    code?: boolean;
    validate?(value: string): string | undefined;
}

export function TextField({ value, onCommit, placeholder, multiline, rows = 3, code, validate }: TextFieldProps) {
    const [draft, setDraft] = useState(value);
    const [error, setError] = useState<string>();
    useEffect(() => {
        setDraft(value);
        setError(undefined);
    }, [value]);

    const commit = () => {
        if (draft === value) return setError(undefined);
        const problem = validate?.(draft);
        setError(problem);
        if (!problem) onCommit(draft);
    };

    if (multiline) {
        return (
            <div className={classes(cl("lab-textarea"), code && cl("lab-code"))}>
                <TextArea value={draft} onChange={setDraft} onBlur={commit} placeholder={placeholder} rows={rows} />
                {error && <span className={cl("lab-error")}>{error}</span>}
            </div>
        );
    }

    return (
        <TextInput
            value={draft}
            onChange={setDraft}
            onBlur={commit}
            placeholder={placeholder}
            error={error}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") commit();
            }}
        />
    );
}

export function Choice<T extends string | number>({ options, value, onChange, disabled }: {
    options: { label: string; value: T; }[];
    value: T | undefined;
    onChange(value: T): void;
    disabled?: boolean;
}) {
    return (
        <Select
            options={options}
            isSelected={v => v === value}
            select={onChange}
            serialize={v => String(v)}
            isDisabled={disabled}
            closeOnSelect
        />
    );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void; }) {
    return (
        <div className={cl("lab-toggle")}>
            <span>{label}</span>
            <Switch checked={checked} onChange={onChange} />
        </div>
    );
}

export function Group({ title, hint, actions, children }: { title: string; hint?: string; actions?: ReactNode; children?: ReactNode; }) {
    return (
        <section className={cl("lab-group")}>
            <div className={cl("lab-group-head")}>
                <div>
                    <h4 className={cl("lab-group-title")}>{title}</h4>
                    {hint && <p className={cl("muted")}>{hint}</p>}
                </div>
                {actions && <div className={cl("lab-actions")}>{actions}</div>}
            </div>
            {children}
        </section>
    );
}

export const optional = (value: string) => value.trim() || undefined;

export function wholeNumber(value: string) {
    return value && !/^\d+$/.test(value.trim()) ? "Use a whole number" : undefined;
}

export async function pickImage(size = 256): Promise<string | undefined> {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/gif,image/webp";
    const file = await new Promise<File | undefined>(resolve => {
        input.onchange = () => resolve(input.files?.[0]);
        input.oncancel = () => resolve(undefined);
        input.click();
    });
    if (!file) return;

    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        canvas.getContext("2d")!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
        return canvas.toDataURL("image/webp", 0.85);
    } finally {
        URL.revokeObjectURL(url);
    }
}

export function ImageField({ value, onChange, placeholder = "https://..." }: { value: string; onChange(value: string): void; placeholder?: string; }) {
    const uploaded = value.startsWith("data:");
    return (
        <div className={cl("lab-image")}>
            {value && <img className={cl("lab-image-preview")} src={value} alt="" />}
            <div className={cl("lab-grow")}>
                <TextField
                    value={uploaded ? "" : value}
                    placeholder={uploaded ? "Uploaded image" : placeholder}
                    validate={v => !v.trim() || /^https:\/\/\S+$/.test(v.trim()) ? undefined : "Use an https link"}
                    onCommit={v => onChange(v.trim())}
                />
            </div>
            <Button size="small" variant="secondary" onClick={async () => {
                const data = await pickImage();
                if (data) onChange(data);
            }}>Upload</Button>
            {value && <Button size="small" variant="dangerSecondary" onClick={() => onChange("")}>Remove</Button>}
        </div>
    );
}
