/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Message } from "@vencord/discord-types";
import { useState } from "@webpack/common";

import { shouldSkipUser } from "../../data/guard";
import { useRayward } from "../../data/hooks";
import { cl } from "../../lib/utils";
import { settings } from "../../settings";
import { RaywardMark } from "../brand/Brand";
import { openReportModal } from "../report/ReportModal";
import { flaggedBy, VerdictChip } from "../shared";

const firstWarned = new Map<string, string>();

export function resetWarnings(channelId?: string) {
    if (!channelId) return firstWarned.clear();
    for (const key of firstWarned.keys()) if (key.startsWith(`${channelId}:`)) firstWarned.delete(key);
}

export function ChatWarning({ message }: { message: Message; }) {
    const [hidden, setHidden] = useState(false);

    const author = message?.author;
    const channelId = message?.channel_id;
    let isFirst = false;
    if (author && channelId && !shouldSkipUser(author)) {
        const key = `${channelId}:${author.id}`;
        const claimedBy = firstWarned.get(key);
        if (claimedBy === undefined) firstWarned.set(key, message.id);
        isFirst = claimedBy === undefined || claimedBy === message.id;
    }

    const { verdict } = useRayward(author?.id, { enabled: isFirst });
    if (!isFirst || hidden || verdict.severity < settings.store.warnThreshold) return null;

    return (
        <div className={cl("scope", "chat-warning", "enter")} role="note">
            <RaywardMark size={18} />
            <span className={cl("chat-warning-text")}>
                <strong>{author.username}</strong> is flagged by {flaggedBy(verdict)}.
            </span>
            <VerdictChip verdict={verdict} />
            <span className={cl("chat-warning-actions")}>
                <button className={cl("link-btn")} onClick={() => openReportModal(author.id)}>Details</button>
                <button className={cl("link-btn")} onClick={() => setHidden(true)}>Hide</button>
            </span>
        </div>
    );
}
