/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FormSwitch } from "@components/FormSwitch";

import { describeError } from "../../data/errors";
import { providersError, useProviders } from "../../data/providers";
import { cl } from "../../lib/utils";
import { settings } from "../../settings";
import { SourceLogo } from "../brand/Brand";

export function SourceToggles() {
    const { sourceOverrides } = settings.use(["sourceOverrides"]);
    const providers = useProviders()?.filter(p => p.capabilities.lookup);
    const error = providersError();

    return (
        <section className={cl("scope", "source-toggles")}>
            <h3 className={cl("settings-heading")}>Sources</h3>
            {!providers && (
                <p className={cl("muted")}>
                    {error ? `Couldn't load sources (${describeError(error)}).` : "Loading sources"}
                </p>
            )}
            {providers?.map(provider => (
                <FormSwitch
                    key={provider.id}
                    title={<span className={cl("source-toggle-title")}><SourceLogo provider={provider} height={18} /></span>}
                    description={provider.description}
                    value={sourceOverrides?.[provider.id] ?? provider.defaultEnabled}
                    onChange={value => {
                        settings.store.sourceOverrides = { ...settings.store.sourceOverrides, [provider.id]: value };
                    }}
                />
            ))}
        </section>
    );
}
