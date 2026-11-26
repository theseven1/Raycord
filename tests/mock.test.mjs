/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const stub = name => ({ path: join(here, "stubs", name) });
const flagTypes = [
    { value: 0, name: "Safe", description: "", safeToAction: false, severity: 0, tone: "safe", isFlagged: false },
    { value: 2, name: "Flagged", description: "", safeToAction: true, severity: 7, tone: "unsafe", isFlagged: true },
];
const providers = ["rotector", "tase", "rab"].map((id, order) => ({
    id, name: id, description: "", defaultEnabled: true, order,
    capabilities: { lookup: true, batch: true, reasons: true, membership: true, discord: true, groups: false }, flagTypes,
}));
let apiCalls = 0;
let fetches = 0;
let mock;
const realFetch = globalThis.fetch;

before(async () => {
    const outdir = await mkdtemp(join(tmpdir(), "rayward-mock-test-"));
    const outfile = join(outdir, "entry.mjs");
    await build({
        entryPoints: [join(here, "mock-entry.ts")], bundle: true, format: "esm", platform: "node", outfile, logLevel: "error",
        plugins: [{ name: "vencord-stubs", setup(b) {
            b.onResolve({ filter: /^@api\/DataStore$/ }, () => stub("datastore.mjs"));
            b.onResolve({ filter: /^@webpack\/common$/ }, () => stub("webpack-common.mjs"));
            b.onResolve({ filter: /^@utils\/css$/ }, () => stub("css.mjs"));
            b.onResolve({ filter: /^@utils\/Logger$/ }, () => stub("logger.mjs"));
            b.onResolve({ filter: /\/settings$/ }, () => stub("settings.mjs"));
        } }],
    });
    globalThis.VencordNative = undefined;
    globalThis.fetch = async url => {
        fetches++;
        const path = new URL(url).pathname;
        if (path.endsWith("/providers")) return new Response(JSON.stringify({ success: true, data: providers }), { status: 200 });
        apiCalls++;
        return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
    };
    mock = await import(pathToFileURL(outfile).href);
});

after(() => { globalThis.fetch = realFetch; });

test("mock accounts resolve without a key or lookup requests", async () => {
    mock.settings.store.raywardApiKey = "";
    const account = mock.newAccount(1);
    const state = mock.emptyState();
    state.accounts.push(account);
    await mock.setLab(state);
    const data = await mock.resolveData(account.id, true);
    assert.equal(data.state, "ready");
    assert.equal(apiCalls, 0);
    assert.equal(fetches, 1);
});

test("presets produce clean, flagged, blocked and outage verdicts", async () => {
    const sources = await mock.getProviders();
    for (const [preset, expected] of [["flagged", "unsafe"], ["clean", "safe"], ["blocked", "unavailable"], ["outage", "unsafe"]]) {
        const account = mock.applyPreset(mock.newAccount(1), preset, sources);
        const state = mock.emptyState();
        state.accounts.push(account);
        await mock.setLab(state);
        const data = await mock.resolveData(account.id, true);
        if (preset === "blocked") {
            assert.equal(data.state, expected);
            assert.equal(data.blocking?.kind, "auth");
        } else if (preset === "outage") {
            assert.ok(data.verdict.failed.length > 0);
            assert.ok(data.verdict.findings.length > 0);
        } else {
            assert.equal(data.verdict.tone, expected);
            if (preset === "clean") assert.equal(data.verdict.findings.length, 0);
        }
    }
});

test("source edits update the verdict and test sources follow session state", async () => {
    const sources = await mock.getProviders();
    const account = mock.applyPreset(mock.newAccount(1), "flagged", sources);
    const state = mock.emptyState();
    state.accounts.push(account);
    state.extraSources.push({ id: "test-demo", name: "Demo", description: "", discord: true, roblox: true });
    await mock.setLab(state);
    const { peekProviders } = mock;
    assert.ok(peekProviders().some(p => p.id === "test-demo"));
    assert.equal((await mock.resolveData(account.id)).verdict.tone, "unsafe");
    await mock.updateAccount(account.id, a => {
        for (const source of Object.values(a.sources)) source.state = "none";
        for (const roblox of a.roblox) for (const source of Object.values(roblox.sources)) source.state = "none";
    });
    assert.equal((await mock.resolveData(account.id)).verdict.tone, "safe");
    const { id } = account;
    await mock.setLab(null);
    assert.equal(peekProviders().some(p => p.id === "test-demo"), false);
    assert.equal(mock.isMockDiscord(id), false);
    assert.equal((await mock.resolveData(id)).blocking?.kind, "config");
});

test("normalizes serializable state and rejects invalid Discord IDs", () => {
    assert.throws(() => mock.normalizeState({ accounts: [{ id: "bad", username: "x" }] }), /accounts\[0\]\.id: expected a Discord ID/);
    const state = mock.emptyState();
    state.accounts.push(mock.newAccount(1));
    assert.deepEqual(mock.normalizeState(JSON.parse(JSON.stringify(state))), state);
});
