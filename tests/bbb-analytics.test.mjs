import test from "node:test";
import assert from "node:assert/strict";
import { handleBbbAnalytics } from "../server/bbb-analytics.mjs";
const env = {
  VITE_SUPABASE_URL: "https://workspace.example",
  VITE_SUPABASE_PUBLISHABLE_KEY: "public",
  BBB_API_TOKEN: "private-bbb-token",
};
function response() {
  return {
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(body) {
      this.body = JSON.parse(body);
    },
  };
}
async function run(
  query,
  {
    authorization = "Bearer workspace-token",
    allowed = true,
    upstream = Response.json({ result: "success", data: { analytics: { sales: 42 } } }),
    token = env.BBB_API_TOKEN,
  } = {},
) {
  const calls = [],
    res = response();
  await handleBbbAnalytics(
    {
      method: "GET",
      url: `/api/bbb-analytics?${query}`,
      headers: authorization ? { authorization } : {},
    },
    res,
    { ...env, BBB_API_TOKEN: token },
    async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "staff-user" });
      if (String(url).includes("workspace_can_access")) return Response.json(allowed);
      return upstream;
    },
  );
  return { res, calls };
}
test("BBB analytics authenticates and enforces its own permission before contacting BBB", async () => {
  const anonymous = await run("", { authorization: "" });
  assert.equal(anonymous.res.statusCode, 401);
  assert.equal(anonymous.calls.length, 0);
  const denied = await run("", { allowed: false });
  assert.equal(denied.res.statusCode, 403);
  assert.equal(denied.calls.length, 2);
  assert.deepEqual(JSON.parse(denied.calls[1].options.body), {
    page_key: "bbb_analytics",
    action_key: "read",
  });
});
test("BBB analytics forwards filters and dates, using only the server's BBB token", async () => {
  const { res, calls } = await run(
    "operation=graph&analytics=sales&period=custom_range&start_date=2026-09-01&end_date=2026-09-30&filters[resource_id]=123",
  );
  assert.equal(res.statusCode, 200);
  const upstream = new URL(calls[2].url);
  assert.equal(upstream.pathname, "/v2/analytics/graph");
  assert.equal(upstream.searchParams.get("filters[resource_id]"), "123");
  assert.equal(upstream.searchParams.get("start_date"), "2026-09-01");
  assert.equal(upstream.searchParams.has("operation"), false);
  assert.equal(calls[2].options.headers.Authorization, "Token private-bbb-token");
  assert.equal(JSON.stringify(res.body).includes(env.BBB_API_TOKEN), false);
  assert.equal(res.headers["Cache-Control"], "private, no-store");
});
test("definitions and totals use documented endpoints", async () => {
  for (const [query, path] of [
    ["", "/v2/analytics"],
    ["operation=single&analytics=sales&period=month", "/v2/analytics/single"],
  ]) {
    const { res, calls } = await run(query);
    assert.equal(res.statusCode, 200);
    assert.equal(new URL(calls[2].url).pathname, path);
  }
});
test("invalid routes, parameters, dates, and missing credentials never reach BBB", async () => {
  for (const query of [
    "operation=../resources",
    "operation=graph&analytics=sales&period=month&target=evil",
    "operation=graph",
    "operation=graph&analytics=sales&period=custom_range&start_date=2026-02-30&end_date=2026-03-01",
    "operation=graph&analytics=sales&period=custom_range&start_date=2026-09-30&end_date=2026-09-01",
  ]) {
    const { res, calls } = await run(query);
    assert.equal(res.statusCode, 400);
    assert.ok(calls.length < 3);
  }
  const missing = await run("", { token: "" });
  assert.equal(missing.res.statusCode, 503);
  assert.equal(missing.calls.length, 2);
});
test("BBB rate limits retain millisecond Retry-After and provide a readable delay", async () => {
  const { res } = await run("", {
    upstream: Response.json(
      { result: "error" },
      { status: 429, headers: { "retry-after": "3500" } },
    ),
  });
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers["Retry-After"], "3500");
  assert.match(res.body.error, /4 seconds/);
});

test("product listing requires analytics permission and returns names with BBB IDs", async () => {
  const denied = await run("operation=products", { allowed: false });
  assert.equal(denied.res.statusCode, 403);
  const { res, calls } = await run("operation=products", {
    upstream: Response.json({
      result: "success",
      data: {
        resources: [
          { resource_id: 123, title: "Studio plugin", published_at: 1700000000, purchase_count: 4 },
          { resource_id: 456, title: "Draft", published_at: 0 },
          { resource_id: 789, title: "Hidden", published_at: 1700000000, is_public: false },
        ],
        stats: { max_page: 1 },
      },
    }),
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.products, [{ id: "123", name: "Studio plugin", purchases: 4 }]);
  assert.match(calls[2].url, /resources\/creator\/resources/);
});
test("product picker never substitutes an unverified synced catalog for published products", async () => {
  const res = response(),
    calls = [];
  await handleBbbAnalytics(
    {
      method: "GET",
      url: "/api/bbb-analytics?operation=products",
      headers: { authorization: "Bearer workspace" },
    },
    res,
    {
      ...env,
      DRM_SUPABASE_URL: "https://catalog.example",
      DRM_SUPABASE_SECRET_KEY: "sb_secret_private",
    },
    async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "staff" });
      if (String(url).includes("workspace_can_access")) return Response.json(true);
      if (String(url).includes("builtbybit"))
        return Response.json({ result: "error" }, { status: 403 });
      return Response.json([{ bbb_resource_id: 321, name: "Synced plugin" }]);
    },
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.products, []);
  assert.match(res.body.warning, /cannot verify marketplace visibility/);
  assert.equal(calls.length, 3);
  assert.equal(JSON.stringify(res.body).includes("sb_secret_private"), false);
});

test("multiple resource filters are forwarded as a BBB array", async () => {
  const { res, calls } = await run(
    "operation=single&analytics=revenue&period=past_thirty_days&filters[resource_ids][]=123&filters[resource_ids][]=456",
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(new URL(calls[2].url).searchParams.getAll("filters[resource_ids][]"), [
    "123",
    "456",
  ]);
});
