export type PageFilter = {
  field: string;
  label: string;
  values?: string[];
  database?: boolean;
  type?: "date" | "text" | "number";
  operator?: "eq" | "gte" | "lte";
};
export const pageFilters: Record<string, PageFilter[]> = {
  custom_requests: [
    { field: "work_type", label: "Work type", database: true },
    { field: "budget_range", label: "Budget range", database: true },
  ],
  orders: [
    { field: "priority", label: "Priority", values: ["low", "normal", "high", "urgent"] },
    {
      field: "payment_status",
      label: "Payment",
      values: ["unpaid", "pending", "paid", "refunded"],
    },
    { field: "provider", label: "Payment provider", database: true },
  ],
  products: [
    {
      field: "product_type",
      label: "Product type",
      database: true,
    },
    { field: "category_id", label: "Category", database: true },
  ],
  reviews: [
    { field: "source", label: "Source", values: ["BuiltByBit", "Trustpilot", "Other"] },
    { field: "rating", label: "Rating", values: ["1", "2", "3", "4", "5"] },
    { field: "product_id", label: "Product", database: true },
  ],
  homepage_reviews: [
    { field: "source", label: "Source", values: ["BuiltByBit", "Trustpilot", "Other"] },
    { field: "rating", label: "Rating", values: ["1", "2", "3", "4", "5"] },
    { field: "product_type", label: "Product type", database: true },
  ],
  news_entries: [{ field: "kind", label: "Update kind", database: true }],
  docs_pages: [{ field: "section", label: "Help section", database: true }],
  faq_items: [{ field: "category", label: "Category", database: true }],
  newsletter_subscribers: [{ field: "source", label: "Subscription source", database: true }],
  admin_security_events: [
    { field: "event_type", label: "Event type", database: true },
    { field: "actor_user_id", label: "Actor UUID" },
  ],
  broadcast_log: [{ field: "kind", label: "Broadcast kind", database: true }],
};
export function filtersForPage(name: string, fields: string[]): PageFilter[] {
  const date =
    name === "broadcast_log" ? "sent_at" : fields.includes("created_at") ? "created_at" : null;
  return [
    ...(pageFilters[name] || []),
    ...(date
      ? [
          {
            field: `${date}:from`,
            label: "From date",
            type: "date" as const,
            operator: "gte" as const,
          },
          {
            field: `${date}:to`,
            label: "Through date",
            type: "date" as const,
            operator: "lte" as const,
          },
        ]
      : []),
  ];
}
export function dateFilterValue(value: string, end: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Enter a valid date.");
  return new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`).toISOString();
}
