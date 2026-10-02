import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDefinitions, buildBbbQuery } from "../src/bbb-analytics-model.ts";
test("actual BBB response supplies shared periods and array resource filters", () => {
  const defs = normalizeDefinitions({
    periods: ["past_thirty_days", "custom_range"],
    analytics: {
      revenue: {
        label: "Revenue",
        graph: true,
        single: true,
        filters: { resource_ids: { type: "array-uint", desc: "Products" } },
      },
      earnings: { graph: true, single: true, filters: [] },
    },
  });
  assert.deepEqual(defs.revenue.periods, ["past_thirty_days", "custom_range"]);
  assert.deepEqual(defs.earnings.periods, ["past_thirty_days", "custom_range"]);
});
test("custom dates and multiple product IDs are included in applied filters", () => {
  const query = buildBbbQuery(
    "revenue",
    "custom_range",
    { resource_ids: "123,456" },
    "2026-09-01",
    "2026-09-30",
  );
  assert.deepEqual(query.getAll("filters[resource_ids][]"), ["123", "456"]);
  assert.equal(query.get("start_date"), "2026-09-01");
  assert.throws(() => buildBbbQuery("revenue", "custom_range", {}, "2026-09-30", "2026-09-01"));
});

test("actual BBB graph grouping objects have readable labels", async () => {
  const { groupingLabel } = await import("../src/bbb-analytics-model.ts");
  assert.equal(groupingLabel({ grouping: "daily", grouping_display: "Daily" }), "Daily");
  assert.equal(groupingLabel("weekly"), "Weekly");
});
