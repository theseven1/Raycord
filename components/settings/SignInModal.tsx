/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import type { RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, showToast, TextInput, useState } from "@webpack/common";

import { isSignedIn, maskKey, signIn, signOut, verifyKey } from "../../data/auth";
import { RAYWARD_SITE } from "../../lib/constants";
import { cl } from "../../lib/utils";
import { settings } from "../../settings";

export function openSignInModal() {
    openModal(props => <ErrorBoundary><SignInModal modalProps={props} /></ErrorBoundary>);
}

function SignInModal({ modalProps }: { modalProps: RenderModalProps; }) {
    const { raywardApiKey } = settings.use(["raywardApiKey", "keyStatus"]);
    const signedIn = isSignedIn();
    const [editing, setEditing] = useState(!signedIn);
    const [key, setKey] = useState("");
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState<string>();

    async function submit() {
        if (!key.trim() || checking) return;
        setChecking(true);
        setError(undefined);
        try {
            const result = await verifyKey(key);
            if (!result.ok) return setError(result.reason);
            await signIn(key);
            showToast({ text: result.quotaReached ? "Signed in. Today's lookup quota is used up." : "Signed in to Rayward", variant: "success" });
            modalProps.onClose();
        } finally {
            setChecking(false);
        }
    }

    async function leave() {
        await signOut();
        showToast({ text: "Signed out of Rayward", variant: "success" });
        setEditing(true);
    }

    if (!editing) {
        return (
            <Modal
                {...modalProps}
                title="Rayward account"
                subtitle={`Signed in with ${maskKey(raywardApiKey)}`}
                actions={[
                    { text: "Change key", variant: "primary", onClick: () => setEditing(true) },
                    { text: "Sign out", variant: "critical-primary", onClick: leave },
                    { text: "Close", variant: "secondary", onClick: modalProps.onClose },
                ]}
            >
                <div className={cl("scope", "sign-in")}>
                    <Paragraph>Raycord checks people with this key. It's only sent to Rayward.</Paragraph>
                </div>
            </Modal>
        );
    }

    return (
        <Modal
            {...modalProps}
            title="Sign in to Rayward"
            subtitle="Raycord needs your Rayward API key"
            actions={[
                { text: "Sign in", variant: "primary", onClick: submit, loading: checking, disabled: !key.trim() },
                { text: signedIn ? "Back" : "Cancel", variant: "secondary", onClick: signedIn ? () => setEditing(false) : modalProps.onClose },
            ]}
        >
            <div className={cl("scope", "sign-in")}>
                <Paragraph>
                    Paste the API key from your <Link href={`${RAYWARD_SITE}/signin`}>Rayward account</Link>. It starts with <code>rwd_</code>.
                </Paragraph>
                <TextInput
                    type="password"
                    value={key}
                    onChange={v => {
                        setKey(v);
                        setError(undefined);
                    }}
                    placeholder="rwd_..."
                    error={error}
                    autoFocus
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === "Enter") void submit();
                    }}
                />
            </div>
        </Modal>
    );
}
