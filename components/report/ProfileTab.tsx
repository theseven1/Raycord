/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { copyToClipboard } from "@utils/clipboard";
import type { User } from "@vencord/discord-types";
import { showToast } from "@webpack/common";

import { useRayward } from "../../data/hooks";
import { summarise } from "../../lib/summary";
import { cl } from "../../lib/utils";
import { settings } from "../../settings";
import { RaywardWordmark } from "../brand/Brand";
import { type TabId, VerdictChip } from "../shared";
import { ReportBody } from "./Report";

export const RAYWARD_SECTION = "RAYWARD";

export function ProfileTab({ user }: { user: User; }) {
    const report = useRayward(user.id, { deep: true });
    const ready = report.state === "ready";
    const loading = report.discord.outcomes.some(o => o.state === "loading");

    return (
        <div className={cl("scope", "modal", "profile-tab")}>
            <div className={cl("modal-head")}>
                <RaywardWordmark height={18} />
                {ready && <VerdictChip verdict={report.verdict} incomplete={!!report.verdict.failed.length} />}
                <span className={cl("modal-id")} />
                {ready && (
                    <button
                        className={cl("link-btn")}
                        onClick={() => {
                            copyToClipboard(summarise(report, user.username, user.id));
                            showToast({ text: "Summary copied", variant: "success" });
                        }}
                    >
                        Copy summary
                    </button>
                )}
                <button className={cl("link-btn")} disabled={loading} onClick={report.refresh}>Refresh</button>
            </div>
            <ReportBody report={report} initialTab={settings.store.defaultTab as TabId} />
        </div>
    );
}
