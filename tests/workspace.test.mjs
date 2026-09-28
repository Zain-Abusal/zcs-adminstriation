import { test } from "node:test";
import assert from "node:assert/strict";
import { fieldValue, inputValue, slugify, searchFilter } from "../src/record-values.ts";
import { imageSource } from "../src/image-source.ts";
import { dateRange, summarize } from "../src/analytics-model.ts";
const field = (name, type = "text", nullable = false) => ({
  name,
  type,
  required: false,
  nullable,
});
test("prices round-trip as user-facing amounts and integer cents", () => {
  assert.equal(inputValue(field("price_cents", "number"), 1299), "12.99");
  assert.equal(fieldValue(field("price_cents", "number"), "12.99", false), 1299);
  assert.throws(() => fieldValue(field("price_cents", "number"), "-1", false), /negative/);
});
test("list edits, nullable values, and new defaults remain distinct", () => {
  assert.deepEqual(fieldValue(field("features", "json"), "First\n\n Second", false), [
    "First",
    "Second",
  ]);
  assert.deepEqual(fieldValue(field("features", "json"), "", false), []);
  assert.equal(fieldValue(field("category_id", "text", true), "", false), null);
  assert.equal(fieldValue(field("sort_order", "number"), "", true), undefined);
  assert.throws(() => fieldValue(field("sort_order", "number"), "", false), /number/);
  assert.equal(slugify("A New Plugin!"), "a-new-plugin");
});
test("search remains a quoted literal for punctuation and filter-like text", () => {
  assert.equal(searchFilter(["title"], "a,b"), 'title.ilike."%a,b%"');
  assert.equal(searchFilter(["title"], 'a"b'), 'title.ilike."%a\\"b%"');
});
test("external image URLs preserve their host and query parameters", () => {
  const url = "https://images.example.net/cover.webp?width=1200&quality=85";
  assert.equal(imageSource(url, "https://site.example", "https://storage.example/images/"), url);
  assert.equal(imageSource("/cover.jpg", "https://site.example"), "https://site.example/cover.jpg");
  assert.equal(
    imageSource("products/a.png", "https://site.example", "https://storage.example/images/"),
    "https://storage.example/images/products/a.png",
  );
  assert.equal(imageSource("javascript:alert(1)", "https://site.example"), null);
  assert.equal(imageSource("data:text/html,bad", "https://site.example"), null);
});
test("UTC range includes today and fills missing dates without inflating totals", () => {
  const now = new Date("2026-09-28T23:30:00Z");
  assert.deepEqual(dateRange(3, now), {
    start: "2026-09-26",
    end: "2026-09-28",
  });
  const result = summarize(
    [
      { day: "2026-09-26", path: "/pricing", pageviews: 2 },
      { day: "2026-09-26", path: "/pricing", pageviews: 3 },
      { day: "2026-09-28", path: "/", pageviews: 7 },
      { day: "2026-08-01", path: "/", pageviews: 900 },
    ],
    3,
    "pages",
    now,
  );
  assert.deepEqual(
    result.daily.map((d) => d.views),
    [5, 0, 7],
  );
  assert.equal(result.total, 12);
  assert.equal(result.distinct, 2);
  assert.equal(result.ranked[0].name, "/");
});
test("blog charts sum opens and minutes and weight scroll by opens", () => {
  const result = summarize(
    [
      {
        day: "2026-09-28",
        slug: "article",
        opens: 3,
        read_seconds: 120,
        scroll_pct: 100,
      },
      {
        day: "2026-09-28",
        slug: "article",
        opens: 1,
        read_seconds: 60,
        scroll_pct: 20,
      },
    ],
    1,
    "blog",
    new Date("2026-09-28"),
  );
  assert.equal(result.total, 4);
  assert.equal(result.daily[0].minutes, 3);
  assert.equal(result.scroll, 80);
  assert.equal(result.distinct, 1);
});
