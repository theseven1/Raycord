/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { RenderModalProps, User } from "@vencord/discord-types";
import { ConfirmModal, openModal, useState } from "@webpack/common";

import type { Verdict } from "../../data/types";
import { verdictReasons } from "../../data/verdict";
import { cl, severityPhrase } from "../../lib/utils";
import { RaywardMark } from "../brand/Brand";
import { StatusIcon } from "../brand/StatusIcon";
import { flaggedBy } from "../shared";

interface Answer { send: boolean; dontAskAgain: boolean; }

export type GuardKind = "message" | "friend";

const COPY: Record<GuardKind, { title(name: string): string; confirm: string; cancel: string; footnote: string; }> = {
    message: {
        title: name => `Before you message ${name}`,
        confirm: "Send anyway",
        cancel: "Don't send",
        footnote: "A flag isn't proof. You only see this before your first message.",
    },
    friend: {
        title: name => `Before you add ${name} as a friend`,
        confirm: "Add anyway",
        cancel: "Don't add",
        footnote: "A flag isn't proof.",
    },
};

function SendGuardModal({ modalProps, user, verdict, kind, resolve }: {
    modalProps: RenderModalProps;
    user: User;
    verdict: Verdict;
    kind: GuardKind;
    resolve(answer: Answer): void;
}) {
    const [dontAsk, setDontAsk] = useState(false);
    const copy = COPY[kind];

    return (
        <ConfirmModal
            {...modalProps}
            title={copy.title(user.username)}
            subtitle={`${flaggedBy(verdict)} flagged this account.`}
            confirmText={copy.confirm}
            cancelText={copy.cancel}
            variant="critical-primary"
            onConfirm={() => resolve({ send: true, dontAskAgain: dontAsk })}
            onCloseCallback={() => setImmediate(() => resolve({ send: false, dontAskAgain: false }))}
            checkboxProps={{
                label: "Don't warn me about this person again",
                checked: dontAsk,
                onChange: setDontAsk,
            }}
        >
            <div className={cl("scope", "guard")}>
                <div className={cl("guard-head")}>
                    <RaywardMark size={20} />
                    <strong>{severityPhrase(verdict.severity)}</strong>
                </div>
                <ul className={cl("guard-reasons")}>
                    {verdictReasons(verdict).map(({ source, tone, reasons }) => (
                        <li key={source}>
                            <StatusIcon tone={tone} size={16} />
                            <span><strong>{source}</strong>: {reasons.join("; ")}</span>
                        </li>
                    ))}
                </ul>
                <p className={cl("muted", "guard-footnote")}>
                    {copy.footnote}
                </p>
            </div>
        </ConfirmModal>
    );
}

export function confirmSend(user: User, verdict: Verdict, kind: GuardKind = "message"): Promise<Answer> {
    return new Promise(resolve => {
        let settled = false;
        const once = (answer: Answer) => {
            if (settled) return;
            settled = true;
            resolve(answer);
        };
        openModal(props => <SendGuardModal modalProps={props} user={user} verdict={verdict} kind={kind} resolve={once} />);
    });
}
