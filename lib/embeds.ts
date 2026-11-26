/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { sendBotMessage } from "@api/Commands";
import type { User } from "@vencord/discord-types";
import { IconUtils } from "@webpack/common";

import { RAYWARD_ICON_HOSTED } from "../components/brand/Brand";
import { TONE_LABEL } from "../components/brand/StatusIcon";
import { describeError, type RaywardError } from "../data/errors";
import type { RaywardData } from "../data/hooks";
import type { SubjectLookup, Verdict } from "../data/types";
import { failedOutcomes, isActionable, okResults, statusLabel, toneOf, verdictSources } from "../data/verdict";
import { RAYWARD_SITE } from "./constants";
import { escapeMarkdown } from "./summary";
import { listAnd, plural, robloxProfileUrl, Severity, severityPhrase } from "./utils";

interface EmbedField { name: string; value: string; inline?: boolean; }
interface RawEmbed {
    type: "rich";
    title?: string;
    url?: string;
    description?: string;
    color?: number;
    author?: { name: string; url?: string; icon_url?: string; };
    thumbnail?: { url: string; };
    fields?: EmbedField[];
    footer?: { text: string; };
    timestamp?: string;
}

const LIMITS = { title: 256, description: 4096, fieldName: 256, fieldValue: 1024, fields: 25 };
const OVERFLOW = "More in the full report.";

const COLOR = {
    clean: 0x3fb950,
    [Severity.Low]: 0xeab308,
    [Severity.Moderate]: 0xe8842e,
    [Severity.High]: 0xff4444,
    [Severity.Extreme]: 0xf83008,
    mixed: 0xeab308,
    neutral: 0x80848e,
};

const clip = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1)}…` : text;

function verdictColor(verdict: Verdict, answered: boolean): number {
    if (verdict.severity > Severity.Clean) return COLOR[verdict.severity as Severity.Low];
    if (!answered) return COLOR.neutral;
    return verdict.tone === "safe" ? COLOR.clean : COLOR.mixed;
}

function baseEmbed(parts: Omit<RawEmbed, "type" | "author" | "footer" | "timestamp">): RawEmbed {
    return {
        type: "rich",
        author: { name: "Rayward", url: RAYWARD_SITE, icon_url: RAYWARD_ICON_HOSTED },
        footer: { text: "Only you can see this" },
        timestamp: new Date().toISOString(),
        ...parts,
        title: parts.title && clip(parts.title, LIMITS.title),
        description: parts.description && clip(parts.description, LIMITS.description),
    };
}

function sourceFields(lookup: SubjectLookup): EmbedField[] {
    return okResults(lookup)
        .filter(({ provider, result }) => toneOf(provider, result) !== "safe")
        .map(({ provider, result }) => {
            const reasons = result?.reasons?.map(r => escapeMarkdown(r.title)).join(", ");
            return {
                name: clip(provider.name, LIMITS.fieldName),
                value: clip(`**${escapeMarkdown(statusLabel(provider, result))}**${reasons ? `\n${reasons}` : ""}`, LIMITS.fieldValue),
                inline: true,
            };
        });
}

function linesToFields(name: string, lines: string[]): EmbedField[] {
    const fields: EmbedField[] = [];
    let current = "";
    for (const line of lines.map(l => clip(l, LIMITS.fieldValue))) {
        if (current && current.length + line.length + 1 > LIMITS.fieldValue) {
            fields.push({ name: fields.length ? `${name} (cont.)` : name, value: current });
            current = "";
        }
        current = current ? `${current}\n${line}` : line;
    }
    if (current) fields.push({ name: fields.length ? `${name} (cont.)` : name, value: current });
    return fields;
}

function failedField(failed: { source: string; error: RaywardError; }[]): EmbedField[] {
    if (!failed.length) return [];
    return [{ name: "Didn't answer", value: clip(failed.map(f => `${escapeMarkdown(f.source)} (${describeError(f.error)})`).join(", "), LIMITS.fieldValue) }];
}

function capFields(fields: EmbedField[]): EmbedField[] {
    if (fields.length <= LIMITS.fields) return fields;
    return [...fields.slice(0, LIMITS.fields - 1), { name: "More", value: OVERFLOW }];
}

function headline(verdict: Verdict) {
    if (verdict.contributions.length || verdict.tone === "safe") return severityPhrase(verdict.severity);
    return `${TONE_LABEL[verdict.tone]} result`;
}

export function userEmbed(data: RaywardData, user: User | undefined, userId: string): RawEmbed {
    const { verdict } = data;
    const answered = okResults(data.discord).length;
    const username = user?.username ?? userId;

    const summary = verdict.severity > Severity.Clean
        ? `Flagged by ${listAnd(verdictSources(verdict))}.`
        : answered ? `No active flags from ${plural(answered, "source")}.` : "No source answered.";

    const linked = [...data.connections.map(c => ({ c, alt: false })), ...data.alts.map(c => ({ c, alt: true }))];
    const accountLines = linked.map(({ c, alt }) => {
        const flags = okResults(data.accounts.get(c.robloxUserId))
            .filter(o => toneOf(o.provider, o.result) !== "safe")
            .map(o => `${escapeMarkdown(o.provider.name)}: ${escapeMarkdown(statusLabel(o.provider, o.result))}`);
        const note = data.notes.get(c.robloxUserId);
        if (note?.kind === "note") flags.push(note.note.is_erp ? "EASI: ERP" : "EASI: Flagged");
        const name = `[${escapeMarkdown(c.robloxUsername || String(c.robloxUserId))}](${robloxProfileUrl(c.robloxUserId)})`;
        return `${name}${alt ? " (possible alt)" : ""}: ${flags.length ? flags.join(", ") : "no results"}`;
    });

    const easiLines = linked.flatMap(({ c }) => {
        const note = data.notes.get(c.robloxUserId);
        return note?.kind === "note"
            ? [`**${escapeMarkdown(c.robloxUsername || String(c.robloxUserId))}${note.note.is_erp ? " (ERP)" : ""}:** ${escapeMarkdown(note.note.moderation_note)}`]
            : [];
    });

    return baseEmbed({
        title: `${username}: ${headline(verdict)}`,
        description: `${summary}\nDiscord ID \`${userId}\``,
        color: verdictColor(verdict, !!answered),
        thumbnail: user ? { url: IconUtils.getUserAvatarURL(user, false, 128) } : undefined,
        fields: capFields([
            ...sourceFields(data.discord),
            ...linesToFields("Linked Roblox accounts", accountLines),
            ...linesToFields("EASI", easiLines),
            ...linesToFields("Other Discord accounts", (data.discordAlts ?? []).map(a => `\`${a.id}\``)),
            ...failedField(verdict.failed),
        ]),
    });
}

export function lookupEmbed(kind: "user" | "group", id: string, lookup: SubjectLookup, thumbnail?: string | null): RawEmbed {
    const fields = sourceFields(lookup);
    const failed = failedOutcomes(lookup).map(o => ({ source: o.provider.name, error: o.error }));
    const answered = okResults(lookup).length;
    const flagged = okResults(lookup).filter(o => isActionable(o.provider, o.result)).length;

    return baseEmbed({
        title: `Roblox ${kind} ${id}`,
        url: kind === "user" ? robloxProfileUrl(id) : `https://www.roblox.com/communities/${id}`,
        description: fields.length
            ? `${plural(fields.length, "source")} returned results.`
            : answered ? `No results from ${plural(answered, "source")}.` : "No source answered.",
        color: flagged ? COLOR[Severity.High] : fields.length ? COLOR.mixed : answered ? COLOR.clean : COLOR.neutral,
        thumbnail: thumbnail ? { url: thumbnail } : undefined,
        fields: capFields([...fields, ...failedField(failed)]),
    });
}

const NOTICE_COPY: Partial<Record<RaywardError["kind"], string>> = {
    config: "Add your Rayward API key in Settings > Plugins > Raycord.",
    auth: "Your Rayward API key was rejected. Make sure it's valid and active.",
    quota: "You've reached today's lookup quota.",
};

export function noticeEmbed(title: string, error?: RaywardError | string): RawEmbed {
    const description = typeof error === "string" ? error : error ? NOTICE_COPY[error.kind] ?? error.message : undefined;
    return baseEmbed({ title, description, color: COLOR.neutral });
}

export function sendEmbed(channelId: string, embed: RawEmbed) {
    sendBotMessage(channelId, { content: "", embeds: [embed] } as any);
}
