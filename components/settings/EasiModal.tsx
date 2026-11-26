/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { Paragraph } from "@components/Paragraph";
import type { RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, showToast, TextInput, useState } from "@webpack/common";

import { easiStore, isEasiEnabled, verifyEasiSecret } from "../../data/easi";
import { cl } from "../../lib/utils";
import { settings } from "../../settings";

export function openEasiModal() {
    openModal(props => <ErrorBoundary><EasiModal modalProps={props} /></ErrorBoundary>);
}

function EasiModal({ modalProps }: { modalProps: RenderModalProps; }) {
    settings.use(["easiEnabled", "easiSecret"]);
    const enabled = isEasiEnabled();
    const [secret, setSecret] = useState("");
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState<string>();

    async function enable() {
        setChecking(true);
        setError(undefined);
        const result = await verifyEasiSecret(secret.trim());
        setChecking(false);
        if (!result.ok) {
            setError(result.reason);
            return;
        }
        settings.store.easiSecret = secret.trim();
        settings.store.easiEnabled = true;
        await easiStore.clear();
        showToast({ text: "EASI enabled", variant: "success" });
        modalProps.onClose();
    }

    async function disable() {
        settings.store.easiEnabled = false;
        settings.store.easiSecret = "";
        await easiStore.clear();
        showToast({ text: "EASI disabled", variant: "success" });
        modalProps.onClose();
    }

    return (
        <Modal
            {...modalProps}
            title="EASI"
            subtitle={enabled ? "On" : "Off"}
            actions={enabled
                ? [
                    { text: "Disable", variant: "critical-primary", onClick: disable },
                    { text: "Close", variant: "secondary", onClick: modalProps.onClose },
                ]
                : [
                    { text: "Verify and enable", variant: "primary", onClick: enable, loading: checking, disabled: !secret.trim() },
                    { text: "Cancel", variant: "secondary", onClick: modalProps.onClose },
                ]}
        >
            <div className={cl("scope", "easi-modal")}>
                {enabled
                    ? <Paragraph>EASI is now enabled.</Paragraph>
                    : (
                        <>
                            <Paragraph>Enter your EASI key.</Paragraph>
                            <TextInput
                                type="password"
                                value={secret}
                                onChange={setSecret}
                                placeholder="EASI secret"
                                error={error}
                                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                                    if (e.key === "Enter" && secret.trim() && !checking) void enable();
                                }}
                            />
                        </>
                    )}
            </div>
        </Modal>
    );
}
