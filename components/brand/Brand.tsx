/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classes } from "@utils/misc";
import { useState } from "@webpack/common";
import easiIcon from "file://../../assets/easi.png?base64";
import raycordIcon from "file://../../assets/raycord-icon.png?base64";
import mark32 from "file://../../assets/rayward/32.png?base64";
import mark48 from "file://../../assets/rayward/48.png?base64";
import mark96 from "file://../../assets/rayward/96.png?base64";
import wordmarkDark from "file://../../assets/rayward/wordmark-dark.webp?base64";
import wordmarkLight from "file://../../assets/rayward/wordmark-light.webp?base64";
import robloxIcon from "file://../../assets/roblox.png?base64";

import { peekProviders } from "../../data/providers";
import type { RaywardProvider } from "../../data/types";
import { cl } from "../../lib/utils";

const png = (b64: string) => `data:image/png;base64,${b64}`;
const webp = (b64: string) => `data:image/webp;base64,${b64}`;

export const RAYWARD_MARK_URL = png(mark96);
export const RAYWARD_ICON_HOSTED = "https://rayward.app/icon/128.png";
const EASI_ICON_URL = png(easiIcon);
const ROBLOX_MASK = `url("${png(robloxIcon)}")`;

export function RaywardMark({ size = 16, className }: { size?: number; className?: string; }) {
    const src = png(size <= 16 ? mark32 : size <= 24 ? mark48 : mark96);
    return <img className={classes(cl("mark"), className)} src={src} width={size} height={size} alt="" aria-hidden draggable={false} />;
}

export function RaycordIcon({ size = 16, className }: { size?: number; className?: string; }) {
    return <img className={classes(cl("mark"), className)} src={png(raycordIcon)} width={size} height={size} alt="" aria-hidden draggable={false} />;
}

export const RaywardMenuIcon = ({ className }: { className?: string; }) => <RaywardMark size={18} className={className} />;

export function RaywardWordmark({ height = 18 }: { height?: number; }) {
    return (
        <span className={cl("wordmark")} style={{ height }}>
            <img className={cl("on-light")} src={webp(wordmarkLight)} alt="Rayward" draggable={false} />
            <img className={cl("on-dark")} src={webp(wordmarkDark)} alt="Rayward" draggable={false} />
        </span>
    );
}

export function SourceLogo({ provider, height = 16 }: { provider: RaywardProvider; height?: number; }) {
    const [failed, setFailed] = useState(false);
    const light = provider.tabImageLightUrl ?? provider.tabImageDarkUrl;
    const dark = provider.tabImageDarkUrl ?? provider.tabImageLightUrl;
    if (!light || !dark || failed) return <span className={cl("source-name")}>{provider.name}</span>;

    return (
        <span className={cl("source-logo")} style={{ height }} role="img" aria-label={provider.name}>
            <img className={cl("on-light")} src={light} alt="" draggable={false} onError={() => setFailed(true)} />
            <img className={cl("on-dark")} src={dark} alt="" draggable={false} onError={() => setFailed(true)} />
        </span>
    );
}

export function EasiIcon({ size = 18 }: { size?: number; }) {
    return <img className={cl("source-icon")} src={EASI_ICON_URL} width={size} height={size} alt="" aria-hidden draggable={false} />;
}

export function EasiLogo({ height = 16 }: { height?: number; }) {
    return (
        <span className={cl("easi-logo")} style={{ height }}>
            <EasiIcon size={height} />
            <span className={cl("source-name")}>EASI</span>
        </span>
    );
}

export function SourceLogoById({ id, name, height = 14 }: { id: string; name: string; height?: number; }) {
    if (id === "easi") return <EasiLogo height={height} />;
    const provider = peekProviders()?.find(p => p.id === id);
    return provider ? <SourceLogo provider={provider} height={height} /> : <span className={cl("source-name")}>{name}</span>;
}

export function RobloxIcon({ size = 16 }: { size?: number; }) {
    return <span className={cl("roblox-icon")} style={{ width: size, height: size, maskImage: ROBLOX_MASK, WebkitMaskImage: ROBLOX_MASK }} aria-hidden />;
}
