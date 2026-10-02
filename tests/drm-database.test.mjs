import test from "node:test";
import assert from "node:assert/strict";
import { databaseUrl, filterApiPage, validateDrmQuery } from "../server/drm-database.mjs";
test("direct database reads omit secrets and apply filters before pagination", () => {
  const p = new URLSearchParams({
    limit: "20",
    offset: "40",
    status: "suspended",
    from: "2026-10-01",
    to: "2026-10-02",
    search: "abc",
    select: "key_hash",
    table: "evil",
  });
  const url = databaseUrl("licenses", p, "https://db.example");
  assert.equal(url.pathname, "/rest/v1/zcslic_licenses");
  assert.ok(!url.searchParams.get("select").includes("key_hash"));
  assert.equal(url.searchParams.get("status"), "eq.suspended");
  assert.equal(url.searchParams.get("offset"), "40");
  assert.equal(url.searchParams.getAll("created_at").length, 2);
  assert.throws(() => validateDrmQuery(new URLSearchParams({ limit: "101" })), /pagination/);
  assert.throws(() => validateDrmQuery(new URLSearchParams({ license_id: "invalid" })), /UUID/);
});
test("API mode reports local filtering explicitly", () => {
  const result = filterApiPage(
    [{ status_code: 200 }, { status_code: 503 }],
    "requests",
    new URLSearchParams({ status_code: "503" }),
  );
  assert.equal(result.local, true);
  assert.deepEqual(result.data, [{ status_code: 503 }]);
});
