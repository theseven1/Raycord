/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { copyToClipboard } from "@utils/clipboard";
import type { RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, showToast, UserStore } from "@webpack/common";

import { useRayward } from "../../data/hooks";
import { summarise } from "../../lib/summary";
import { cl } from "../../lib/utils";
import { RaywardWordmark } from "../brand/Brand";
import { describeVerdict, VerdictChip } from "../shared";
import { ReportBody } from "./Report";

export function openReportModal(userId: string) {
    openModal(props => <ErrorBoundary><ReportModal modalProps={props} userId={userId} /></ErrorBoundary>);
}

function ReportModal({ modalProps, userId }: { modalProps: RenderModalProps; userId: string; }) {
    const report = useRayward(userId, { deep: true });
    const user = UserStore.getUser(userId);
    const username = user?.username ?? userId;
    const ready = report.state === "ready";

    return (
        <Modal
            {...modalProps}
            size="lg"
            title={`Report for ${username}`}
            subtitle={ready ? describeVerdict(report.verdict) : undefined}
            actions={[
                {
                    text: "Copy summary",
                    variant: "secondary",
                    disabled: !ready,
                    onClick: () => {
                        copyToClipboard(summarise(report, username, userId));
                        showToast({ text: "Copied", variant: "success" });
                    },
                },
                { text: "Refresh", variant: "secondary", onClick: report.refresh, loading: report.discord.outcomes.some(o => o.state === "loading") },
                { text: "Close", variant: "primary", onClick: modalProps.onClose },
            ]}
        >
            <div className={cl("scope", "modal")}>
                <div className={cl("modal-head")}>
                    <RaywardWordmark height={18} />
                    <span className={cl("muted", "modal-id")}>Discord ID {userId}</span>
                    {ready && <VerdictChip verdict={report.verdict} incomplete={!!report.verdict.failed.length} />}
                </div>
                <ReportBody report={report} />
            </div>
        </Modal>
    );
}
