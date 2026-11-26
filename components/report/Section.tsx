/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useState } from "@webpack/common";

import { useRayward } from "../../data/hooks";
import { cl } from "../../lib/utils";
import { settings } from "../../settings";
import { RaycordIcon } from "../brand/Brand";
import { ChevronIcon } from "../brand/icons";
import { type TabId, VerdictChip } from "../shared";
import { ReportBody } from "./Report";
import { openReportModal } from "./ReportModal";

export function Section({ userId }: { userId: string; }) {
    const { showInProfile, defaultExpanded, defaultTab } = settings.use(["showInProfile", "defaultExpanded", "defaultTab"]);
    const report = useRayward(userId, { deep: true, enabled: showInProfile });
    const [expanded, setExpanded] = useState(() => defaultExpanded || (settings.store.sectionExpanded ?? false));

    if (!showInProfile) return null;

    const toggle = () => setExpanded(v => {
        settings.store.sectionExpanded = !v;
        return !v;
    });

    return (
        <div className={cl("scope", "section")}>
            <button className={cl("section-head")} onClick={toggle} aria-expanded={expanded}>
                <RaycordIcon size={18} />
                <span className={cl("section-title")}>Raycord</span>
                {report.state === "ready" && <VerdictChip verdict={report.verdict} incomplete={!!report.verdict.failed.length} />}
                <ChevronIcon expanded={expanded} />
            </button>
            <div className={cl("reveal", expanded && "reveal-open")} aria-hidden={!expanded} inert={!expanded}>
                <div className={cl("reveal-inner")}>
                    <div className={cl("section-body")}>
                        <ReportBody report={report} initialTab={defaultTab as TabId} scroll />
                        {report.state === "ready" && (
                            <button className={cl("view-all")} onClick={() => openReportModal(userId)}>Open full report</button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
