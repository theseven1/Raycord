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
const pluginRoot = join(here, "..");
const stub = name => ({ path: join(here, "stubs", name) });

const VALID = `rwd_${"A".repeat(40)}`;
const REJECTED = `rwd_${"B".repeat(40)}`;
const QUOTA = `rwd_${"C".repeat(40)}`;
const EXTENSION = `rwd_${"D".repeat(40)}`;
const requests = [];

function fakeRayward(url, init) {
    const { pathname } = new URL(url);
    const key = (init?.headers?.Authorization ?? "").replace(/^Bearer /, "");
    const json = (status, body) => new Response(JSON.stringify(body), { status });
    requests.push(pathname);

    if (pathname === "/v1/access/me") {
        return key === EXTENSION
            ? json(200, { success: true, data: { id: 1, surface: "extension", status: "approved" } })
            : json(401, { success: false, error: "Authorization: Bearer <roblox-session-token> required", type: "AuthenticationError" });
    }
    if (pathname === "/v2/lookup/rotector/discord/user/999") {
        if (key === VALID) return json(200, { success: true, data: { id: "999", flagType: 0 } });
        if (key === QUOTA) return json(429, { success: false, error: "Daily quota reached", type: "DailyQuotaError" });
        return json(401, { success: false, error: "Invalid API key", type: "AuthenticationError" });
    }
    return json(404, { success: false });
}

let auth;
const realFetch = globalThis.fetch;

before(async () => {
    const outdir = await mkdtemp(join(tmpdir(), "raycord-auth-"));
    const outfile = join(outdir, "auth.mjs");
    await build({
        entryPoints: [join(pluginRoot, "data", "auth.ts")],
        bundle: true,
        format: "esm",
        platform: "node",
        outfile,
        logLevel: "error",
        plugins: [{
            name: "vencord-stubs",
            setup(b) {
                b.onResolve({ filter: /^@api\/DataStore$/ }, () => stub("datastore.mjs"));
                b.onResolve({ filter: /^@webpack\/common$/ }, () => stub("webpack-common.mjs"));
                b.onResolve({ filter: /^@utils\/css$/ }, () => stub("css.mjs"));
                b.onResolve({ filter: /^@utils\/Logger$/ }, () => stub("logger.mjs"));
                b.onResolve({ filter: /\/settings$/ }, () => stub("settings.mjs"));
            },
        }],
    });

    globalThis.VencordNative = undefined;
    globalThis.fetch = async (url, init) => fakeRayward(url, init);
    auth = await import(pathToFileURL(outfile).href);
});

after(() => {
    globalThis.fetch = realFetch;
});

test("refuses anything that isn't shaped like an API key, without a request", async () => {
    const before = requests.length;
    for (const raw of ["Bearer 0123456789abcdef0123456789abcdef0123456789abcdef", "0123456789abcdef0123456789abcdef", "rwd_short", ""]) {
        const result = await auth.verifyKey(raw);
        assert.equal(result.ok, false);
        assert.equal(result.rejected, true);
        assert.match(result.reason, /rwd_/);
    }
    assert.equal(requests.length, before);
});

test("refuses an extension sign-in token", async () => {
    const result = await auth.verifyKey(EXTENSION);
    assert.equal(result.ok, false);
    assert.match(result.reason, /extension sign-in/);
});

test("refuses a key the test lookup rejects", async () => {
    const result = await auth.verifyKey(REJECTED);
    assert.equal(result.ok, false);
    assert.equal(result.rejected, true);
    assert.match(result.reason, /rejected/);
});

test("accepts a valid key, with or without Bearer", async () => {
    assert.deepEqual(await auth.verifyKey(VALID), { ok: true });
    assert.deepEqual(await auth.verifyKey(`Bearer ${VALID}`), { ok: true });
    assert.equal(auth.normalizeKey(`  Bearer ${VALID} `), VALID);
});

test("accepts a key whose daily quota is used up", async () => {
    assert.deepEqual(await auth.verifyKey(QUOTA), { ok: true, quotaReached: true });
});

test("reports a network failure without rejecting the key", async () => {
    globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
    try {
        const result = await auth.verifyKey(VALID);
        assert.equal(result.ok, false);
        assert.equal(result.rejected, false);
    } finally {
        globalThis.fetch = async (url, init) => fakeRayward(url, init);
    }
});

test("masks keys for display", () => {
    assert.equal(auth.maskKey(VALID), "rwd_••••••AAAAA");
    assert.equal(auth.maskKey(""), "");
});
