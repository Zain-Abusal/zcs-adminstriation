import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
let handler;
globalThis.Deno = {
  serve(fn) {
    handler = fn;
  },
  env: {
    get(name) {
      return name === "SUPABASE_URL" ? "https://secondary.example" : "test-service-role";
    },
  },
};
await import("../supabase/functions/admin-drm-read/index.ts");
test("edge reader rejects anonymous and write requests", async () => {
  let called = false;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    called = true;
    throw Error("Must not fetch");
  };
  try {
    assert.equal((await handler(new Request("https://edge.example?path=licenses"))).status, 401);
    assert.equal(
      (await handler(new Request("https://edge.example?path=licenses", { method: "POST" }))).status,
      405,
    );
    assert.equal(
      (await handler(new Request("https://edge.example", { method: "OPTIONS" }))).status,
      204,
    );
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});
test("edge reader denies staff without page access before reading secondary DB", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return Response.json(calls.length === 1 ? { id: "test-user" } : false);
  };
  try {
    const response = await handler(
      new Request("https://edge.example?path=requests", {
        headers: { Authorization: "Bearer test-primary-token" },
      }),
    );
    assert.equal(response.status, 403);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((url) => !url.includes("secondary.example")));
  } finally {
    globalThis.fetch = original;
  }
});
test("edge reader validates primary identity and permission before safe secondary read", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json(
      calls.length === 1 ? { id: "test-user" } : calls.length === 2 ? true : [],
      { headers: { "content-range": "*/0" } },
    );
  };
  try {
    const response = await handler(
      new Request("https://edge.example?path=licenses&limit=20", {
        headers: { Authorization: "Bearer test-primary-token" },
      }),
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).source, "supabase");
    assert.equal(calls.length, 3);
    assert.deepEqual(JSON.parse(calls[1].options.body), {
      page_key: "drm_licenses",
      action_key: "read",
    });
    assert.ok(calls[2].url.startsWith("https://secondary.example/rest/v1/zcslic_licenses"));
    assert.ok(!calls[2].url.includes("key_hash"));
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  } finally {
    globalThis.fetch = original;
  }
});
test("edge and dashboard readers use the same database adapter", () => {
  assert.equal(
    readFileSync("server/drm-database.mjs", "utf8"),
    readFileSync("supabase/functions/admin-drm-read/drm-database.mjs", "utf8"),
  );
});
