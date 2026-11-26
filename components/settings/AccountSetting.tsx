/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";

import { isSignedIn, maskKey, signOut } from "../../data/auth";
import { cl } from "../../lib/utils";
import { settings } from "../../settings";
import { openSignInModal } from "./SignInModal";

export function AccountSetting() {
    const { raywardApiKey, keyStatus } = settings.use(["raywardApiKey", "keyStatus"]);
    const signedIn = isSignedIn();
    const status = signedIn
        ? `Signed in with ${maskKey(raywardApiKey)}`
        : keyStatus === "invalid" && raywardApiKey ? "Your key was rejected. Sign in again." : "Not signed in";

    return (
        <section className={cl("scope", "account")}>
            <h3 className={cl("settings-heading")}>Rayward account</h3>
            <p className={cl("muted")}>{status}</p>
            <div className={cl("settings-buttons")}>
                <Button size="small" variant={signedIn ? "secondary" : "primary"} onClick={openSignInModal}>
                    {signedIn ? "Change key" : "Sign in"}
                </Button>
                {signedIn && <Button size="small" variant="dangerSecondary" onClick={() => void signOut()}>Sign out</Button>}
            </div>
        </section>
    );
}
