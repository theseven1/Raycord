/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Paragraph } from "@components/Paragraph";
import { Switch } from "@components/Switch";
import { openUserProfile } from "@utils/discord";
import type { RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, showToast, TextInput, useState } from "@webpack/common";

import { isEasiEnabled } from "../../data/easi";
import { type MockAccount, mockSnowflake, type MockSource, newRobloxAccount, normalizeState, nowSeconds, setLab, updateAccount, updateLab, useLab } from "../../data/mock";
import { type PresetId,PRESETS } from "../../data/mockPresets";
import { useProviders } from "../../data/providers";
import { addAccount, applyAccountPreset,clearMessages, openDm, removeAccount, sendAs, startSession, stopSession } from "../../lib/testSession";
import { cl } from "../../lib/utils";
import { settings } from "../../settings";
import { openReportModal } from "../report/ReportModal";
import { Tabs, type TabSpec } from "../shared";
import { LabField, LabSelect, LabSwitch, LabText } from "./fields";
import { SourceEditor } from "./SourceEditor";

type LabTab = "profile" | "sources" | "roblox" | "messages" | "session";

export function openTestLab() {
    openModal(props => <ErrorBoundary><TestLabModal modalProps={props} /></ErrorBoundary>);
}

function TestLabModal({ modalProps }: { modalProps: RenderModalProps; }) {
    const state = useLab();
    const providers = useProviders();
    const [preset, setPreset] = useState<PresetId>("full");
    const [accountId, setAccountId] = useState("");
    const [tab, setTab] = useState<LabTab>("profile");
    const [message, setMessage] = useState("");
    const [json, setJson] = useState("");
    const account = state?.accounts.find(a => a.id === (state.accounts.some(a => a.id === accountId) ? accountId : state.accounts[0]?.id));
    const tabs: TabSpec<LabTab>[] = [
        { id: "profile", label: "Profile" }, { id: "sources", label: "Sources" }, { id: "roblox", label: "Roblox" },
        { id: "messages", label: "Messages" }, { id: "session", label: "Session" },
    ];
    const change = (fn: (a: MockAccount) => void) => account && void updateAccount(account.id, fn);

    if (!state || !account) return <Modal {...modalProps} title="Test lab" actions={[
        { text: "Start test session", variant: "primary", onClick: () => void startSession(preset) },
        { text: "Close", variant: "secondary", onClick: modalProps.onClose },
    ]}>
        <div className={cl("scope", "testlab")}>
            <Paragraph>Creates a fake DM with TestAccount1 that lives only in your client. Nothing is sent to Discord or Rayward. Stop removes everything.</Paragraph>
            <LabField label="Starting preset"><LabSelect<PresetId> options={PRESETS.map(p => ({ value: p.id, label: p.label }))} value={preset} onChange={setPreset} /></LabField>
            {!providers && <p className={cl("muted")}>Presets fill in once the Rayward source list loads.</p>}
        </div>
    </Modal>;

    return <Modal {...modalProps} size="lg" title="Test lab" subtitle={`${state.accounts.length} test account${state.accounts.length === 1 ? "" : "s"}`} actions={[
        { text: "Stop and delete everything", variant: "critical-primary", onClick: async () => { await stopSession(); modalProps.onClose(); showToast({ text: "Test session removed", variant: "success" }); } },
        { text: "Close", variant: "secondary", onClick: modalProps.onClose },
    ]}>
        <div className={cl("scope", "testlab")}>
            <div className={cl("lab-bar")}>
                <LabSelect options={state.accounts.map(a => ({ value: a.id, label: `${a.globalName} (@${a.username})` }))} value={account.id} onChange={setAccountId} />
                <Button size="small" variant="secondary" onClick={() => openDm(account.id)}>Open DM</Button>
                <Button size="small" variant="secondary" onClick={() => openUserProfile(account.id)}>Open profile</Button>
                <Button size="small" variant="secondary" onClick={() => openReportModal(account.id)}>Report</Button>
                <Button size="small" variant="secondary" onClick={() => void addAccount().then(id => { if (id) setAccountId(id); })}>Add account</Button>
                <Button size="small" variant="dangerPrimary" onClick={() => void removeAccount(account.id)}>Remove account</Button>
            </div>
            <Tabs<LabTab> tabs={tabs} active={tab} onSelect={setTab} />
            {tab === "profile" && <div className={cl("lab-grid")}>
                <LabField label="Username"><LabText value={account.username} onCommit={v => change(a => { a.username = v; })} /></LabField>
                <LabField label="Display name"><LabText value={account.globalName} onCommit={v => change(a => { a.globalName = v; })} /></LabField>
                <LabField label="Bio"><LabText multiline value={account.bio} onCommit={v => change(a => { a.bio = v; })} /></LabField>
                <LabField label="Avatar"><LabSelect options={[...Array.from({ length: 6 }, (_, i) => ({ value: String(i), label: `Default ${i + 1}` })), { value: "custom", label: "Custom image URL" }]} value={/^[0-5]$/.test(account.avatar) ? account.avatar : "custom"} onChange={v => change(a => { a.avatar = v === "custom" ? "" : v; })} /></LabField>
                {!/^[0-5]$/.test(account.avatar) && <LabField label="Avatar URL"><LabText value={account.avatar} onCommit={v => change(a => { a.avatar = v; })} /></LabField>}
                <LabField label="Accent colour"><LabText value={account.accentColor === null ? "" : `#${account.accentColor.toString(16).padStart(6, "0")}`} onCommit={v => change(a => { a.accentColor = v ? Number.parseInt(v.replace(/^#/, ""), 16) : null; })} validate={v => v && !/^#?[\da-f]{6}$/i.test(v) ? "Use a six-digit hex colour" : undefined} placeholder="#rrggbb" /></LabField>
                <LabSwitch label="Bot account" checked={account.bot} onChange={v => change(a => { a.bot = v; })} />
                <div className={cl("lab-bar")}>{PRESETS.map(p => <Button key={p.id} size="small" variant="secondary" title={p.description} onClick={() => void applyAccountPreset(account.id, p.id)}>{p.label}</Button>)}</div>
            </div>}
            {tab === "sources" && <SourceEditor providers={providers?.filter(p => p.capabilities.discord) ?? []} sources={account.sources} subjectId={account.id} onChange={(id, next: MockSource) => change(a => { a.sources[id] = next; })} />}
            {tab === "roblox" && <RobloxEditor account={account} accounts={state.accounts} providers={providers?.filter(p => p.capabilities.lookup) ?? []} />}
            {tab === "messages" && <div className={cl("lab-field")}>
                <Paragraph>Messages in this fake DM stay local. To test the first-message warning, type in the DM yourself.</Paragraph>
                <div className={cl("lab-messages")}>{(state.messages[state.channels[account.id]] ?? []).map(m => <div className={cl("lab-message")} key={m.id}><strong>{m.authorId === account.id ? account.globalName : "You"}</strong><span>{m.content}</span></div>)}</div>
                <TextInput value={message} onChange={setMessage} placeholder={`Send as ${account.globalName}`} onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") { sendAs(account.id, message); setMessage(""); } }} />
                <div className={cl("lab-bar")}><Button size="small" variant="primary" onClick={() => { sendAs(account.id, message); setMessage(""); }}>Send as {account.globalName}</Button><Button size="small" variant="secondary" onClick={() => void clearMessages(account.id)}>Clear messages</Button></div>
            </div>}
            {tab === "session" && <div className={cl("lab-field")}>
                <Paragraph>Test-only sources appear during this session.</Paragraph>
                <Button size="small" variant="secondary" onClick={() => void updateLab(d => { const n = d.extraSources.length + 1; d.extraSources.push({ id: `test-source-${n}`, name: `Test source ${n}`, description: "Test-only source", discord: true, roblox: true }); })}>Add test source</Button>
                {state.extraSources.map(s => <div className={cl("lab-bar")} key={s.id}><strong>{s.name}</strong><TextInput value={s.name} onChange={name => void updateLab(d => { const item = d.extraSources.find(x => x.id === s.id); if (item) item.name = name; })} /><span>Discord <Switch checked={s.discord} onChange={discord => void updateLab(d => { const item = d.extraSources.find(x => x.id === s.id); if (item) item.discord = discord; })} /></span><span>Roblox <Switch checked={s.roblox} onChange={roblox => void updateLab(d => { const item = d.extraSources.find(x => x.id === s.id); if (item) item.roblox = roblox; })} /></span><Button size="small" variant="dangerPrimary" onClick={() => void updateLab(d => { d.extraSources = d.extraSources.filter(x => x.id !== s.id); })}>Remove</Button></div>)}
                <textarea className={cl("lab-input", "lab-textarea", "lab-json")} value={json || JSON.stringify(state, null, 2)} onChange={e => setJson(e.currentTarget.value)} />
                <div className={cl("lab-bar")}><Button size="small" variant="primary" onClick={() => { try { void setLab(normalizeState(JSON.parse(json))); setJson(""); showToast({ text: "Test lab state applied", variant: "success" }); } catch (e) { showToast({ text: String(e) }); } }}>Apply JSON</Button><Button size="small" variant="secondary" onClick={() => setJson(JSON.stringify(state, null, 2))}>Reset editor</Button></div>
            </div>}
        </div>
    </Modal>;
}

function RobloxEditor({ account, accounts, providers }: { account: MockAccount; accounts: MockAccount[]; providers: NonNullable<ReturnType<typeof useProviders>>; }) {
    settings.use(["easiEnabled", "easiSecret"]);
    const easiEnabled = isEasiEnabled();
    const change = (id: string, fn: (r: ReturnType<typeof newRobloxAccount>) => void) => void updateAccount(account.id, a => { const r = a.roblox.find(x => x.id === id); if (r) fn(r); });
    const setSources = (id: string, provider: string, source: MockSource) => change(id, r => { r.sources[provider] = source; });
    return <div className={cl("lab-field")}>
        <div className={cl("lab-bar")}><Button size="small" variant="secondary" onClick={() => void updateAccount(account.id, a => { a.roblox.push(newRobloxAccount(a.roblox.length + 1)); })}>Add linked account</Button><Button size="small" variant="secondary" onClick={() => void updateAccount(account.id, a => { a.roblox.push(newRobloxAccount(a.roblox.length + 1, true)); })}>Add alt</Button></div>
        {account.roblox.map(r => <div className={cl("lab-card", "lab-field")} key={r.id}>
            <LabField label="Username"><LabText value={r.username} onCommit={v => change(r.id, x => { x.username = v; })} /></LabField>
            <LabField label="Display name"><LabText value={r.displayName} onCommit={v => change(r.id, x => { x.displayName = v; })} /></LabField>
            <LabField label="Roblox ID"><LabText value={r.id} onCommit={v => change(r.id, x => { x.id = v; })} validate={v => !/^\d{1,19}$/.test(v) ? "Use a numeric Roblox ID" : account.roblox.some(other => other.id === v && other.id !== r.id) ? "This ID is already used" : undefined} /></LabField>
            <LabField label="Avatar image URL"><LabText value={r.avatarUrl} onCommit={v => change(r.id, x => { x.avatarUrl = v; })} /></LabField>
            <LabSwitch label="Banned" checked={r.banned} onChange={v => change(r.id, x => { x.banned = v; })} />
            <LabSwitch label="Verified" checked={r.verified} onChange={v => change(r.id, x => { x.verified = v; })} />
            <LabSwitch label="Alt" checked={r.alt} onChange={v => change(r.id, x => { x.alt = v; })} />
            {easiEnabled && <><LabField label="Optional note"><LabText multiline value={r.easi?.note ?? ""} onCommit={v => change(r.id, x => { x.easi = v ? { note: v, erp: x.easi?.erp ?? false } : null; })} /></LabField><LabSwitch label="ERP" checked={r.easi?.erp ?? false} onChange={v => change(r.id, x => { x.easi = { note: x.easi?.note ?? "", erp: v }; })} /></>}
            <div className={cl("lab-field")}><strong>Tracked servers</strong>{r.servers.map(server => <div className={cl("lab-bar")} key={server.serverId}><TextInput value={server.safeName} onChange={safeName => change(r.id, x => { const target = x.servers.find(s => s.serverId === server.serverId); if (target) target.safeName = safeName; })} /><Button size="small" variant="dangerPrimary" onClick={() => change(r.id, x => { x.servers = x.servers.filter(s => s.serverId !== server.serverId); })}>Remove</Button></div>)}<Button size="small" variant="secondary" onClick={() => change(r.id, x => { x.servers.push({ serverId: mockSnowflake(), safeName: "Example server", joinedAt: null, firstSeenAt: nowSeconds() }); })}>Add tracked server</Button></div>
            <SourceEditor providers={providers} sources={r.sources} subjectId={r.id} onChange={(pid, source) => setSources(r.id, pid, source)} />
            <Button size="small" variant="dangerPrimary" onClick={() => void updateAccount(account.id, a => { a.roblox = a.roblox.filter(x => x.id !== r.id); })}>Remove Roblox account</Button>
        </div>)}
        <h3>Other Discord accounts</h3>
        {account.otherDiscord.map(o => <div className={cl("lab-bar")} key={o.id}>{o.id}<Button size="small" variant="dangerPrimary" onClick={() => void updateAccount(account.id, a => { a.otherDiscord = a.otherDiscord.filter(x => x.id !== o.id); })}>Remove</Button></div>)}
        {accounts.filter(a => a.id !== account.id && !account.otherDiscord.some(o => o.id === a.id)).map(a => <Button key={a.id} size="small" variant="secondary" onClick={() => void updateAccount(account.id, current => { current.otherDiscord.push({ id: a.id, detectedAt: nowSeconds(), sources: [1] }); })}>Add {a.globalName}</Button>)}
        <Button size="small" variant="secondary" onClick={() => void updateAccount(account.id, a => { a.otherDiscord.push({ id: mockSnowflake(), detectedAt: nowSeconds(), sources: [1] }); })}>Add random ID</Button>
    </div>;
}
