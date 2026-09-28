export type AnalyticsRow = Record<string, any>;
export function dateRange(days: number, now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}
export function summarize(
  rows: AnalyticsRow[],
  days: number,
  kind: "pages" | "blog",
  now = new Date(),
) {
  const range = dateRange(days, now);
  const daily = new Map<string, { day: string; views: number; minutes: number }>();
  for (let i = 0; i < days; i++) {
    const day = new Date(`${range.start}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + i);
    const key = day.toISOString().slice(0, 10);
    daily.set(key, { day: key, views: 0, minutes: 0 });
  }
  const ranked = new Map<string, number>();
  let total = 0,
    seconds = 0,
    scroll = 0;
  for (const row of rows) {
    const point = daily.get(row.day);
    if (!point) continue;
    const n = Math.max(0, Number(kind === "pages" ? row.pageviews : row.opens) || 0);
    const time = Math.max(0, Number(row.read_seconds) || 0);
    point.views += n;
    point.minutes += time / 60;
    total += n;
    seconds += time;
    scroll += (Number(row.scroll_pct) || 0) * n;
    const key = String(kind === "pages" ? row.path : row.slug);
    ranked.set(key, (ranked.get(key) || 0) + n);
  }
  return {
    daily: [...daily.values()],
    total,
    seconds,
    average: total / days,
    scroll: total ? scroll / total : 0,
    distinct: ranked.size,
    ranked: [...ranked]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value })),
  };
}
