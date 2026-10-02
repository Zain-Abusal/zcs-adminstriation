import test from "node:test";
import assert from "node:assert/strict";
import { allowedRoute, handleDrm } from "../server/drm.mjs";
const id = "12345678-1234-1234-1234-123456789abc";
const env = {
  VITE_SUPABASE_URL: "https://auth.example",
  VITE_SUPABASE_PUBLISHABLE_KEY: "public",
  LICENSE_ADMIN_API_TOKEN: "a".repeat(32),
};
function response() {
  return {
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(v) {
      this.body = JSON.parse(v);
    },
  };
}
test("only documented routes and methods are forwarded", () => {
  assert.equal(allowedRoute(`licenses/${id}/rotate-key`, "POST"), true);
  for (const path of ["../products", "https://evil.example", "products/../../x", "audit/anything"])
    assert.equal(allowedRoute(path, "GET"), false);
  assert.equal(allowedRoute("audit", "DELETE"), false);
});
test("unauthenticated requests never reach upstream", async () => {
  const res = response();
  await handleDrm({ url: "/api/drm?path=products", method: "GET", headers: {} }, res, env, () => {
    throw Error("Must not fetch");
  });
  assert.equal(res.statusCode, 401);
});
test("authenticated non-admin is rejected without licensing request", async () => {
  let calls = 0;
  const res = response();
  await handleDrm(
    {
      url: "/api/drm?path=products",
      method: "GET",
      headers: { authorization: "Bearer user-token" },
    },
    res,
    env,
    async () => {
      calls++;
      return Response.json(calls === 1 ? { id } : false);
    },
  );
  assert.equal(res.statusCode, 403);
  assert.equal(calls, 2);
});
test("admin request forwards only server token and allowlisted query parameters", async () => {
  const calls = [];
  const res = response();
  await handleDrm(
    {
      url: "/api/drm?path=licenses&limit=20&offset=0&target=evil",
      method: "GET",
      headers: { authorization: "Bearer user-token" },
    },
    res,
    env,
    async (url, options) => {
      calls.push({ url: String(url), options });
      return Response.json(
        calls.length === 1
          ? { id }
          : calls.length === 2
            ? true
            : { ok: true, data: [], request_id: id },
        { headers: { "x-request-id": id } },
      );
    },
  );
  assert.equal(res.statusCode, 200);
  assert.equal(calls[2].options.headers.Authorization, `Bearer ${env.LICENSE_ADMIN_API_TOKEN}`);
  assert.equal(
    calls[2].url,
    "https://licenses.zcraftstudios.com/api/admin/v1/licenses?limit=20&offset=0",
  );
  assert.equal(res.headers["Cache-Control"], "private, no-store");
  assert.equal(res.headers["x-request-id"], id);
});
test("auth outage fails closed without forwarding", async () => {
  const res = response();
  await handleDrm(
    {
      url: "/api/drm?path=products",
      method: "GET",
      headers: { authorization: "Bearer user-token" },
    },
    res,
    env,
    async () => {
      throw Error("outage");
    },
  );
  assert.equal(res.statusCode, 503);
});
test("read-only permission blocks mutations before any licensing call", async () => {
  const calls = [];
  const res = response();
  await handleDrm(
    {
      url: "/api/drm?path=licenses",
      method: "POST",
      headers: { authorization: "Bearer staff-token", "content-type": "application/json" },
      body: { product_id: id },
    },
    res,
    env,
    async (url, options) => {
      calls.push({ url: String(url), options });
      return Response.json(calls.length === 1 ? { id } : false);
    },
  );
  assert.equal(res.statusCode, 403);
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    page_key: "drm_licenses",
    action_key: "edit",
  });
});
test("direct database reads need no admin API token and never call licensing API", async () => {
  const calls = [];
  const res = response();
  const config = {
    ...env,
    LICENSE_ADMIN_API_TOKEN: undefined,
    DRM_SUPABASE_URL: "https://drm-db.example",
    DRM_SUPABASE_SECRET_KEY: "sb_secret_test_only",
  };
  await handleDrm(
    {
      url: "/api/drm?path=licenses&source=supabase&limit=20",
      method: "GET",
      headers: { authorization: "Bearer staff-token" },
    },
    res,
    config,
    async (url, options) => {
      calls.push({ url: String(url), options });
      return Response.json(calls.length === 1 ? { id } : calls.length === 2 ? true : [], {
        headers: { "content-range": "*/0" },
      });
    },
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.source, "supabase");
  assert.equal(calls.length, 3);
  assert.ok(calls[2].url.startsWith("https://drm-db.example/rest/v1/zcslic_licenses?"));
  assert.ok(!calls[2].url.includes("key_hash"));
  assert.equal(calls[2].options.headers.apikey, "sb_secret_test_only");
});
