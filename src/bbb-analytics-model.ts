export type BbbDefinition = {
  label: string;
  desc: string;
  graph: boolean;
  single: boolean;
  periods?: string[];
  filters: Record<string, { desc: string; type: string }>;
};
export const periodLabels: Record<string, string> = {
  today: "Today",
  past_thirty_days: "Last 30 days",
  this_month: "This month",
  last_month: "Last month",
  last_three_months: "Last 3 months",
  this_year: "This year",
  last_year: "Last year",
  all_time: "All time",
  custom_range: "Custom dates",
};
export const humanize = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
export function normalizeDefinitions(data: {
  analytics?: Record<string, BbbDefinition>;
  periods?: string[];
}) {
  return Object.fromEntries(
    Object.entries(data.analytics || {})
      .filter(([, d]) => d.graph || d.single)
      .map(([id, definition]) => [
        id,
        {
          ...definition,
          filters: definition.filters || {},
          periods: definition.periods?.length ? definition.periods : data.periods || [],
        },
      ]),
  );
}
export function buildBbbQuery(
  metric: string,
  period: string,
  filters: Record<string, string>,
  start: string,
  end: string,
) {
  const query = new URLSearchParams({ analytics: metric, period });
  for (const [key, value] of Object.entries(filters))
    if (value.trim()) {
      if (key === "resource_ids")
        value
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
          .forEach((id) => query.append(`filters[${key}][]`, id));
      else query.set(`filters[${key}]`, value.trim());
    }
  if (period === "custom_range") {
    if (!start || !end || start > end) throw new Error("Choose a start and end date in order.");
    query.set("start_date", start);
    query.set("end_date", end);
  }
  return query;
}

export function groupingLabel(value?: string | { grouping: string; grouping_display?: string }) {
  if (!value) return "";
  return typeof value === "string"
    ? humanize(value)
    : value.grouping_display || humanize(value.grouping);
}
