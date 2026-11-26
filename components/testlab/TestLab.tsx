/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Paragraph } from "@components/Paragraph";
import { openUserProfile } from "@utils/discord";
import type { RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, showToast, TextArea, TextInput, useState } from "@webpack/common";

import { isEasiEnabled } from "../../data/easi";
import { userFromTag } from "../../data/guard";
import { labState, type MockAccount, type MockRelationship, type MockRobloxAccount, mockSnowflake, newRobloxAccount, normalizeState, nowSeconds, setLab, type TestLabState, updateAccount, updateLab, useLab } from "../../data/mock";
import { type PresetId, PRESETS, supportsSubject } from "../../data/mockPresets";
import { useProviders } from "../../data/providers";
import type { RaywardProvider } from "../../data/types";
import { addAccount, applyAccountPreset, clearMessages, materialize, openDm, removeAccount, sendAs, startSession, stopSession } from "../../lib/testSession";
import { cl } from "../../lib/utils";
import { settings } from "../../settings";
import { RobloxIcon } from "../brand/Brand";
import { openReportModal } from "../report/ReportModal";
import { Tabs, type TabSpec } from "../shared";
import { Choice, Field, Group, ImageField, TextField, Toggle } from "./fields";
import { SourceEditor } from "./SourceEditor";

type LabTab = "profile" | "discord" | "roblox" | "messages" | "session";

export function openTestLab() {
    openModal(props => <ErrorBoundary><TestLabModal modalProps={props} /></ErrorBoundary>);
}

const presetOptions = PRESETS.map(p => ({ label: p.label, value: p.id as PresetId }));
const isDefaultAvatar = (avatar: string) => /^[0-5]$/.test(avatar);

function usernameProblem(name: string, accountId: string) {
    if (!/^[a-z0-9_.]{2,32}$/.test(name)) return "2 to 32 lowercase letters, numbers, _ or .";
    const real = userFromTag(name);
    if (real && real.id !== accountId) return "A real Discord user has this username. Pick another.";
}
const recordCount = (sources: MockAccount["sources"]) => Object.values(sources).filter(s => s.state !== "none").length;

function TestLabModal({ modalProps }: { modalProps: RenderModalProps; }) {
    const lab = useLab();
    const providers = useProviders() ?? [];
    const [selected, setSelected] = useState<string>();
    const [tab, setTab] = useState<LabTab>("profile");
    const [preset, setPreset] = useState<PresetId>("full");
    const [busy, setBusy] = useState(false);
    const account = lab?.accounts.find(a => a.id === selected) ?? lab?.accounts[0];

    if (!lab || !account) {
        const start = async () => {
            setBusy(true);
            try {
                await startSession(preset);
                modalProps.onClose();
            } finally {
                setBusy(false);
            }
        };

        return (
            <Modal
                {...modalProps}
                title="Test lab"
                subtitle="Try every feature on fake accounts"
                actions={[
                    { text: "Start", variant: "primary", onClick: start, loading: busy },
                    { text: "Close", variant: "secondary", onClick: modalProps.onClose },
                ]}
            >
                <div className={cl("scope", "testlab")}>
                    <Paragraph>Creates a fake DM with TestAccount1. It only exists in your client. Nothing is sent to Discord or Rayward.</Paragraph>
                    <Field label="Start with">
                        <Choice<PresetId> options={presetOptions} value={preset} onChange={setPreset} />
                    </Field>
                </div>
            </Modal>
        );
    }

    const robloxCount = account.roblox.length + account.otherDiscord.length;
    const tabs: TabSpec<LabTab>[] = [
        { id: "profile", label: "Profile" },
        { id: "discord", label: "Discord", badge: recordCount(account.sources) },
        { id: "roblox", label: "Roblox", badge: robloxCount },
        { id: "messages", label: "Messages", badge: lab.messages[lab.channels[account.id]]?.length },
        { id: "session", label: "Session" },
    ];

    const stop = async () => {
        await stopSession();
        modalProps.onClose();
        showToast({ text: "Test session removed", variant: "success" });
    };

    return (
        <Modal
            {...modalProps}
            size="lg"
            title="Test lab"
            subtitle={`${lab.accounts.length} test account${lab.accounts.length === 1 ? "" : "s"}. Only you can see them.`}
            actions={[
                { text: "Stop and delete all", variant: "critical-primary", onClick: stop },
                { text: "Close", variant: "secondary", onClick: modalProps.onClose },
            ]}
        >
            <div className={cl("scope", "testlab")}>
                <div className={cl("lab-bar")}>
                    <div className={cl("lab-picker")}>
                        <Choice<string> options={lab.accounts.map(a => ({ label: `${a.globalName || a.username} (@${a.username})`, value: a.id }))} value={account.id} onChange={setSelected} />
                    </div>
                    <Button size="small" variant="primary" onClick={() => { openDm(account.id); modalProps.onClose(); }}>Open DM</Button>
                    <Button size="small" variant="secondary" onClick={() => openUserProfile(account.id)}>Profile</Button>
                    <Button size="small" variant="secondary" onClick={() => openReportModal(account.id)}>Report</Button>
                    <span className={cl("lab-spacer")} />
                    <Button size="small" variant="secondary" onClick={async () => {
                        const id = await addAccount();
                        if (id) setSelected(id);
                    }}>Add</Button>
                    <Button size="small" variant="dangerSecondary" onClick={() => removeAccount(account.id)}>Remove</Button>
                </div>

                <Tabs<LabTab> tabs={tabs} active={tab} onSelect={setTab} />

                <div className={cl("lab-panel")} key={`${account.id}-${tab}`}>
                    {tab === "profile" && <ProfilePanel account={account} />}
                    {tab === "discord" && (
                        <Group title="Discord results" hint="What each source returns for this Discord account.">
                            <SourceEditor
                                subject="discord"
                                providers={providers.filter(p => supportsSubject(p, "discord"))}
                                sources={account.sources}
                                subjectId={account.id}
                                onChange={(id, next) => updateAccount(account.id, a => { a.sources[id] = next; })}
                            />
                        </Group>
                    )}
                    {tab === "roblox" && <RobloxPanel account={account} accounts={lab.accounts} providers={providers.filter(p => supportsSubject(p, "roblox"))} />}
                    {tab === "messages" && <MessagesPanel account={account} lab={lab} />}
                    {tab === "session" && <SessionPanel lab={lab} />}
                </div>
            </div>
        </Modal>
    );
}

function ProfilePanel({ account }: { account: MockAccount; }) {
    const change = (mutate: (a: MockAccount) => void) => updateAccount(account.id, mutate);
    const custom = !isDefaultAvatar(account.avatar);

    return (
        <>
            <Group title="Profile">
                <div className={cl("lab-grid")}>
                    <Field label="Username">
                        <TextField value={account.username} validate={v => usernameProblem(v, account.id)} onCommit={v => change(a => { a.username = v; })} />
                    </Field>
                    <Field label="Display name">
                        <TextField value={account.globalName} onCommit={v => change(a => { a.globalName = v.trim(); })} />
                    </Field>
                    <Field label="Avatar">
                        <Choice
                            options={[...Array.from({ length: 6 }, (_, i) => ({ label: `Default ${i + 1}`, value: String(i) })), { label: "Custom image", value: "custom" }]}
                            value={custom ? "custom" : account.avatar}
                            onChange={v => change(a => { a.avatar = v === "custom" ? "" : v; })}
                        />
                    </Field>
                    <Field label="Banner colour">
                        <TextField
                            value={account.accentColor === null ? "" : `#${account.accentColor.toString(16).padStart(6, "0")}`}
                            placeholder="#5865f2"
                            validate={v => !v.trim() || /^#?[\da-f]{6}$/i.test(v.trim()) ? undefined : "Use a hex colour like #5865f2"}
                            onCommit={v => change(a => { a.accentColor = v.trim() ? parseInt(v.trim().replace("#", ""), 16) : null; })}
                        />
                    </Field>
                    {custom && (
                        <Field label="Custom image" wide>
                            <ImageField value={account.avatar} onChange={v => change(a => { a.avatar = v; })} />
                        </Field>
                    )}
                    <Field label="Bio" wide>
                        <TextField multiline value={account.bio} onCommit={v => change(a => { a.bio = v; })} />
                    </Field>
                    <Field label="Friend status">
                        <Choice<MockRelationship>
                            options={[
                                { label: "Not friends", value: "none" },
                                { label: "Sent you a request", value: "incoming" },
                                { label: "You sent a request", value: "outgoing" },
                                { label: "Friends", value: "friend" },
                            ]}
                            value={account.relationship}
                            onChange={v => change(a => { a.relationship = v; })}
                        />
                    </Field>
                    <div className={cl("lab-toggles")}>
                        <Toggle label="Bot" checked={account.bot} onChange={v => change(a => { a.bot = v; })} />
                    </div>
                </div>
            </Group>
            <Group title="Presets" hint="Replaces this account's results.">
                <div className={cl("lab-presets")}>
                    {PRESETS.map(p => (
                        <button key={p.id} className={cl("lab-preset")} onClick={() => applyAccountPreset(account.id, p.id)}>
                            <strong>{p.label}</strong>
                            <span className={cl("muted")}>{p.description}</span>
                        </button>
                    ))}
                </div>
            </Group>
        </>
    );
}

function RobloxPanel({ account, accounts, providers }: { account: MockAccount; accounts: MockAccount[]; providers: RaywardProvider[]; }) {
    settings.use(["easiEnabled", "easiSecret"]);
    const easi = isEasiEnabled();
    const change = (id: string, mutate: (r: MockRobloxAccount) => void) => updateAccount(account.id, a => {
        const r = a.roblox.find(x => x.id === id);
        if (r) mutate(r);
    });
    const add = (alt: boolean) => updateAccount(account.id, a => { a.roblox.push(newRobloxAccount(a.roblox.length + 1, alt)); });
    const others = accounts.filter(a => a.id !== account.id && !account.otherDiscord.some(o => o.id === a.id));

    return (
        <>
            <Group
                title="Roblox accounts"
                hint="Linked accounts come from Rotector's Discord result, so Rotector needs to be on."
                actions={<>
                    <Button size="small" variant="secondary" onClick={() => add(false)}>Add linked</Button>
                    <Button size="small" variant="secondary" onClick={() => add(true)}>Add alt</Button>
                </>}
            >
                {!account.roblox.length && <p className={cl("muted")}>No Roblox accounts.</p>}
                {account.roblox.map(r => (
                    <div className={cl("lab-card")} key={r.id}>
                        <div className={cl("lab-card-head")}>
                            <RobloxIcon size={16} />
                            <strong>{r.displayName || r.username}</strong>
                            <span className={cl("muted")}>@{r.username} · {r.id}</span>
                            {r.alt && <span className={cl("lab-tag")}>Alt</span>}
                            <span className={cl("lab-spacer")} />
                            <Button size="small" variant="dangerSecondary" onClick={() => updateAccount(account.id, a => { a.roblox = a.roblox.filter(x => x.id !== r.id); })}>Remove</Button>
                        </div>
                        <div className={cl("lab-grid")}>
                            <Field label="Username"><TextField value={r.username} onCommit={v => change(r.id, x => { x.username = v.trim(); })} /></Field>
                            <Field label="Display name"><TextField value={r.displayName} onCommit={v => change(r.id, x => { x.displayName = v.trim(); })} /></Field>
                            <Field label="Roblox ID">
                                <TextField
                                    value={r.id}
                                    validate={v => !/^\d{1,19}$/.test(v) ? "Numbers only" : accounts.some(a => a.roblox.some(o => o.id === v && o !== r)) ? "Already used" : undefined}
                                    onCommit={v => change(r.id, x => { x.id = v; })}
                                />
                            </Field>
                            <Field label="Avatar" wide><ImageField value={r.avatarUrl} placeholder="Blank for none" onChange={v => change(r.id, x => { x.avatarUrl = v; })} /></Field>
                            <div className={cl("lab-toggles")}>
                                <Toggle label="Alt" checked={r.alt} onChange={v => change(r.id, x => { x.alt = v; })} />
                                <Toggle label="Banned" checked={r.banned} onChange={v => change(r.id, x => { x.banned = v; })} />
                                <Toggle label="Verified badge" checked={r.verified} onChange={v => change(r.id, x => { x.verified = v; })} />
                            </div>
                            {easi && (
                                <>
                                    <Field label="EASI note" wide>
                                        <TextField multiline rows={2} value={r.easi?.note ?? ""} placeholder="Blank for no note" onCommit={v => change(r.id, x => { x.easi = v.trim() ? { note: v.trim(), erp: x.easi?.erp ?? false } : null; })} />
                                    </Field>
                                    <div className={cl("lab-toggles")}>
                                        <Toggle label="ERP" checked={!!r.easi?.erp} onChange={v => change(r.id, x => { x.easi = { note: x.easi?.note || "Example moderation note.", erp: v }; })} />
                                    </div>
                                </>
                            )}
                        </div>
                        <ServerList
                            servers={r.servers}
                            onChange={servers => change(r.id, x => { x.servers = servers; })}
                        />
                        <SourceEditor
                            subject="roblox"
                            providers={providers}
                            sources={r.sources}
                            subjectId={account.id}
                            onChange={(id, next) => change(r.id, x => { x.sources[id] = next; })}
                        />
                    </div>
                ))}
            </Group>

            <Group
                title="Other Discord accounts"
                hint="Discord accounts Rotector links to the same Roblox account."
                actions={<>
                    {others.map(o => (
                        <Button key={o.id} size="small" variant="secondary" onClick={() => updateAccount(account.id, a => { a.otherDiscord.push({ id: o.id, detectedAt: nowSeconds(), sources: [3] }); })}>
                            Add {o.globalName || o.username}
                        </Button>
                    ))}
                    <Button size="small" variant="secondary" onClick={() => updateAccount(account.id, a => { a.otherDiscord.push({ id: mockSnowflake(), detectedAt: nowSeconds(), sources: [3] }); })}>Add random</Button>
                </>}
            >
                {!account.otherDiscord.length && <p className={cl("muted")}>None.</p>}
                {account.otherDiscord.map(o => {
                    const known = accounts.find(a => a.id === o.id);
                    return (
                        <div className={cl("lab-row")} key={o.id}>
                            <span>{known ? `@${known.username}` : <code>{o.id}</code>}</span>
                            <span className={cl("lab-spacer")} />
                            <Button size="min" variant="dangerSecondary" onClick={() => updateAccount(account.id, a => { a.otherDiscord = a.otherDiscord.filter(x => x.id !== o.id); })}>Remove</Button>
                        </div>
                    );
                })}
            </Group>
        </>
    );
}

function ServerList({ servers, onChange }: { servers: MockRobloxAccount["servers"]; onChange(servers: MockRobloxAccount["servers"]): void; }) {
    return (
        <div className={cl("lab-reasons")}>
            <div className={cl("lab-reasons-head")}>
                <span className={cl("lab-label")}>Tracked servers</span>
                <Button size="small" variant="secondary" onClick={() => onChange([...servers, { serverId: mockSnowflake(), safeName: "Example server", joinedAt: nowSeconds() - 30 * 86_400, firstSeenAt: nowSeconds() - 29 * 86_400 }])}>Add server</Button>
            </div>
            {servers.map(server => (
                <div className={cl("lab-row")} key={server.serverId}>
                    <TextField value={server.safeName} onCommit={safeName => onChange(servers.map(s => s.serverId === server.serverId ? { ...s, safeName } : s))} />
                    <Button size="min" variant="dangerSecondary" onClick={() => onChange(servers.filter(s => s.serverId !== server.serverId))}>Remove</Button>
                </div>
            ))}
        </div>
    );
}

function MessagesPanel({ account, lab }: { account: MockAccount; lab: TestLabState; }) {
    const [text, setText] = useState("");
    const messages = lab.messages[lab.channels[account.id]] ?? [];
    const name = account.globalName || account.username;
    const send = () => {
        if (!text.trim()) return;
        sendAs(account.id, text.trim());
        setText("");
    };

    return (
        <Group
            title="Messages"
            hint="Your own messages in this DM stay local too. Your first one shows the send warning if the account is flagged."
            actions={<Button size="small" variant="dangerSecondary" disabled={!messages.length} onClick={() => clearMessages(account.id)}>Clear</Button>}
        >
            <div className={cl("lab-messages")}>
                {!messages.length && <p className={cl("muted")}>No messages yet.</p>}
                {messages.map(m => (
                    <div className={cl("lab-message")} key={m.id}>
                        <strong>{m.authorId === account.id ? name : "You"}</strong>
                        <span>{m.content || (m.stickerIds?.length ? "Sticker" : "")}</span>
                    </div>
                ))}
            </div>
            <div className={cl("lab-row")}>
                <div className={cl("lab-grow")}>
                    <TextInput
                        value={text}
                        onChange={setText}
                        placeholder={`Message as ${name}`}
                        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                            if (e.key === "Enter") send();
                        }}
                    />
                </div>
                <Button size="small" variant="primary" disabled={!text.trim()} onClick={send}>Send</Button>
            </div>
        </Group>
    );
}

function SessionPanel({ lab }: { lab: TestLabState; }) {
    const [json, setJson] = useState(() => JSON.stringify(lab, null, 2));
    const [error, setError] = useState<string>();

    const apply = async () => {
        try {
            await setLab(normalizeState(JSON.parse(json)));
            materialize();
            setError(undefined);
            showToast({ text: "Session updated", variant: "success" });
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    return (
        <>
            <Group
                title="Test sources"
                hint="Extra sources that only exist during this session."
                actions={<Button size="small" variant="secondary" onClick={() => updateLab(d => {
                    const n = d.extraSources.length + 1;
                    d.extraSources.push({ id: `test-source-${n}`, name: `Test source ${n}`, description: "Test source", discord: true, roblox: true });
                })}>Add source</Button>}
            >
                {!lab.extraSources.length && <p className={cl("muted")}>None.</p>}
                {lab.extraSources.map(s => {
                    const edit = (mutate: (x: typeof s) => void) => updateLab(d => {
                        const x = d.extraSources.find(e => e.id === s.id);
                        if (x) mutate(x);
                    });
                    return (
                        <div className={cl("lab-row")} key={s.id}>
                            <div className={cl("lab-grow")}><TextField value={s.name} onCommit={v => edit(x => { x.name = v.trim() || x.name; })} /></div>
                            <Toggle label="Discord lookups" checked={s.discord} onChange={v => edit(x => { x.discord = v; })} />
                            <Button size="min" variant="dangerSecondary" onClick={() => updateLab(d => { d.extraSources = d.extraSources.filter(x => x.id !== s.id); })}>Remove</Button>
                        </div>
                    );
                })}
            </Group>
            <Group
                title="Session data"
                hint="Everything above as JSON, for edits the forms don't cover."
                actions={<>
                    <Button size="small" variant="secondary" onClick={() => { setJson(JSON.stringify(labState(), null, 2)); setError(undefined); }}>Reload</Button>
                    <Button size="small" variant="primary" onClick={apply}>Apply</Button>
                </>}
            >
                <div className={cl("lab-textarea", "lab-code")}>
                    <TextArea value={json} onChange={setJson} rows={16} />
                </div>
                {error && <span className={cl("lab-error")}>{error}</span>}
            </Group>
        </>
    );
}
