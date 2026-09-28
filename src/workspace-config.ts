import schema from "./resources.json";
export type Row = Record<string, any>;
export type Field = { name: string; type: string; required: boolean; nullable: boolean };
export type Resource = {
  name: string;
  label: string;
  singular: string;
  group: string;
  description: string;
  title: string;
  columns: string[];
  search: string[];
  status?: string;
  path?: string;
  mode: string;
  fields: Field[];
  order: string;
  ascending?: boolean;
};
// Explicit allowlist based on the storefront's current reads and relationships.
// Legacy commerce tables stay in Supabase, outside the everyday workspace.
export const archivedResources = [
  "orders",
  "order_items",
  "licenses",
  "downloads",
  "coupons",
  "changelog_entries",
  "product_media",
];
const definitions: Array<
  Omit<Resource, "fields" | "mode" | "order"> & Partial<Pick<Resource, "order" | "mode">>
> = [
  {
    name: "products",
    label: "Products",
    singular: "product",
    group: "Catalog",
    description: "The plugins, configs, and resources in your storefront.",
    title: "title",
    columns: ["product_type", "price_cents", "is_published", "updated_at"],
    search: ["title", "slug"],
    status: "is_published",
    path: "/products/",
  },
  {
    name: "custom_requests",
    label: "Customer requests",
    singular: "request",
    group: "Inbox",
    description: "Review incoming briefs and keep work moving.",
    title: "name",
    columns: ["work_type", "budget_range", "status", "created_at"],
    search: ["name", "email", "brief"],
    status: "status",
  },
  {
    name: "blog_posts",
    label: "Blog posts",
    singular: "post",
    group: "Content",
    description: "Write, preview, and publish stories from the studio.",
    title: "title",
    columns: ["author_name", "is_published", "published_at"],
    search: ["title", "slug"],
    status: "is_published",
    path: "/blog/",
  },
  {
    name: "news_entries",
    label: "News & updates",
    singular: "update",
    group: "Content",
    description: "Keep your community up to date with studio news.",
    title: "title",
    columns: ["kind", "is_published", "published_on"],
    search: ["title", "summary"],
    status: "is_published",
    path: "/news",
  },
  {
    name: "docs_pages",
    label: "Help articles",
    singular: "article",
    group: "Content",
    description: "Maintain the help content used by the website.",
    title: "title",
    columns: ["section", "is_published", "sort_order"],
    search: ["title", "slug"],
    status: "is_published",
    path: "/docs/",
  },
  {
    name: "faq_items",
    label: "FAQs",
    singular: "question",
    group: "Content",
    description: "Clear answers for your customers, grouped by topic.",
    title: "question",
    columns: ["category", "sort_order"],
    search: ["question", "answer"],
    order: "sort_order",
    ascending: true,
  },
  {
    name: "legal_pages",
    label: "Legal pages",
    singular: "page",
    group: "Content",
    description: "Manage the policies published on the website.",
    title: "title",
    columns: ["slug", "updated_at"],
    search: ["title", "slug"],
    path: "/legal/",
  },
  {
    name: "team_members",
    label: "Team",
    singular: "member",
    group: "Content",
    description: "Introduce the people behind ZCraft Studios.",
    title: "name",
    columns: ["role_title", "is_owner", "sort_order"],
    search: ["name", "role_title"],
  },
  {
    name: "blog_media",
    label: "Blog gallery",
    singular: "image",
    group: "Content",
    description: "Images and captions for your blog posts.",
    title: "alt",
    columns: ["caption", "sort_order"],
    search: ["alt", "caption"],
  },
  {
    name: "services",
    label: "Services",
    singular: "service",
    group: "Catalog",
    description: "Custom work, deliverables, and external checkout links.",
    title: "name",
    columns: ["price_cents", "is_active", "sort_order"],
    search: ["name", "slug"],
    status: "is_active",
  },
  {
    name: "pricing_plans",
    label: "Pricing cards",
    singular: "pricing card",
    group: "Catalog",
    description: "The tier cards shown on your pricing page.",
    title: "name",
    columns: ["price_cents", "is_featured", "sort_order"],
    search: ["name", "slug"],
  },
  {
    name: "categories",
    label: "Categories",
    singular: "category",
    group: "Catalog",
    description: "Organize your product catalog.",
    title: "name",
    columns: ["slug", "sort_order"],
    search: ["name", "slug"],
  },
  {
    name: "sales",
    label: "Product discounts",
    singular: "discount",
    group: "Catalog",
    description: "Schedule discounts for individual products.",
    title: "label",
    columns: ["discount_percent", "sale_price_cents", "ends_at"],
    search: ["label"],
  },
  {
    name: "sale_events",
    label: "Sale events",
    singular: "sale event",
    group: "Catalog",
    description: "Manage timed promotions across your storefront.",
    title: "label",
    columns: ["default_discount_percent", "is_active", "ends_at"],
    search: ["label"],
    status: "is_active",
  },
  {
    name: "sale_entries",
    label: "Sale products",
    singular: "sale product",
    group: "Catalog",
    description: "Choose which products belong to a sale event.",
    title: "id",
    columns: ["product_id", "discount_percent"],
    search: [],
  },
  {
    name: "homepage_reviews",
    label: "Testimonials",
    singular: "testimonial",
    group: "Community",
    description: "Customer quotes featured on the home page.",
    title: "author_name",
    columns: ["product_type", "rating", "is_active"],
    search: ["author_name", "content"],
    status: "is_active",
  },
  {
    name: "reviews",
    label: "Product reviews",
    singular: "review",
    group: "Community",
    description: "Review customer feedback before it appears publicly.",
    title: "headline",
    columns: ["author_name", "rating", "is_approved"],
    search: ["headline", "author_name"],
    status: "is_approved",
  },
  {
    name: "newsletter_subscribers",
    label: "Subscribers",
    singular: "subscriber",
    group: "Community",
    description: "View subscribers and manage subscription status.",
    title: "email",
    columns: ["source", "is_active", "created_at"],
    search: ["email"],
    status: "is_active",
  },
  {
    name: "page_view_daily",
    label: "Page traffic",
    singular: "traffic record",
    group: "Insights",
    description: "Daily page views by source, country, and device.",
    title: "path",
    columns: ["day", "pageviews", "country", "device_type"],
    search: ["path"],
    order: "day",
  },
  {
    name: "blog_reads",
    label: "Article engagement",
    singular: "reading record",
    group: "Insights",
    description: "Reading activity and engagement with your articles.",
    title: "slug",
    columns: ["day", "opens", "read_seconds", "country"],
    search: ["slug"],
    order: "day",
  },
  {
    name: "broadcast_log",
    label: "Delivery history",
    singular: "delivery",
    group: "Insights",
    description: "A read-only history of published email broadcasts.",
    title: "title",
    columns: ["kind", "recipients", "failed", "sent_at"],
    search: ["title"],
    order: "sent_at",
  },
  {
    name: "site_settings",
    label: "Site announcement",
    singular: "announcement",
    group: "Workspace",
    description: "The announcement banner at the top of your website.",
    title: "banner_content_md",
    columns: ["banner_enabled", "banner_tone", "updated_at"],
    search: [],
    mode: "update",
  },
  {
    name: "user_roles",
    label: "Admin access",
    singular: "role",
    group: "Workspace",
    description: "Manage access for existing Supabase accounts.",
    title: "user_id",
    columns: ["role", "created_at"],
    search: [],
  },
];
const bannerFields: Field[] = [
  { name: "banner_enabled", type: "boolean", required: false, nullable: false },
  { name: "banner_tone", type: "text", required: true, nullable: false },
  { name: "banner_content_md", type: "text", required: false, nullable: false },
];
export const resources: Resource[] = definitions.map((r) => {
  const table = schema.find((t) => t.name === r.name);
  return {
    ...r,
    mode: r.mode || table?.mode || "read",
    fields: table?.fields || bannerFields,
    order: r.order || "created_at",
  };
});
export const fieldLabels: Record<string, string> = {
  price_cents: "Price",
  sale_price_cents: "Sale price",
  is_published: "Published",
  is_active: "Active",
  is_approved: "Approved",
  is_featured: "Featured",
  external_url: "Marketplace checkout URL",
  cover_image_path: "Cover image path",
  whats_inside: "What’s included",
  storage_path: "Download file path",
  sort_order: "Display order",
  cta_href: "Button destination",
  cta_label: "Button label",
  user_id: "Account",
  product_id: "Product",
  post_id: "Blog post",
  sale_event_id: "Sale event",
  banner_content_md: "Announcement",
  banner_tone: "Banner color",
  banner_enabled: "Show announcement",
  price_label: "Alternative price label",
  role_title: "Job title",
  body: "Content",
  links: "Social links",
  reference_links: "References",
  read_seconds: "Reading time",
  pageviews: "Page views",
  published_at: "Publish date",
  published_on: "Publish date",
  created_at: "Created",
  updated_at: "Updated",
  discount_percent: "Discount (%)",
  default_discount_percent: "Default discount (%)",
  file_size_bytes: "File size (bytes)",
  category_id: "Category",
  checkout_type: "Checkout method",
  view_count: "Views",
  purchase_count: "Purchases",
  download_count: "Downloads",
  full_name: "Full name",
};
export const label = (name: string) =>
  fieldLabels[name] || name.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
export const arrays = ["stack", "tags", "features", "deliverables"];
export const longFields = [
  "body",
  "description",
  "whats_inside",
  "answer",
  "content",
  "brief",
  "bio",
  "license_summary",
  "banner_content_md",
];
export const readonlyFields = ["view_count", "purchase_count", "download_count", "used_count"];
export const relations: Record<string, { table: string; title: string }> = {
  product_id: { table: "products", title: "title" },
  post_id: { table: "blog_posts", title: "title" },
  category_id: { table: "categories", title: "name" },
  sale_event_id: { table: "sale_events", title: "label" },
  user_id: { table: "profiles", title: "email" },
};
export const options: Record<string, string[]> = {
  role: ["admin", "moderator", "user"],
  banner_tone: ["yellow", "orange", "red", "mint", "cyan"],
  cover_color: ["cyan", "yellow", "coral", "mint"],
  checkout_type: ["external", "free"],
  status: ["new", "in_progress", "completed", "closed"],
};
export const hints: Record<string, string> = {
  slug: "Used in the public page URL. Use lowercase words separated by hyphens.",
  external_url: "The marketplace page where customers complete checkout.",
  price_cents: "Enter the amount in the selected currency, e.g. 12.50.",
  sort_order: "Lower numbers appear first.",
  cover_image_path: "A product-images storage path or a full image URL.",
  storage_path: "Path to the file in the private product-files bucket.",
  links: "A JSON object mapping each social name to its URL.",
  banner_content_md: "Supports Markdown links, bold text, and emphasis.",
};
export function fieldGroup(name: string) {
  if (
    [
      "is_published",
      "is_active",
      "is_featured",
      "is_approved",
      "published_at",
      "published_on",
      "sort_order",
      "banner_enabled",
      "status",
    ].includes(name)
  )
    return "Visibility";
  if (/price|currency|cadence|checkout|external_url|cta_|discount|starts_at|ends_at/.test(name))
    return "Pricing & links";
  if (/cover|image|avatar|storage_path|file_size|^url$|^alt$|caption/.test(name)) return "Media";
  if (longFields.includes(name) || arrays.includes(name)) return "Content";
  if (
    [
      "license_name",
      "license_summary",
      "version",
      "links",
      "initials",
      "is_owner",
      "source",
    ].includes(name)
  )
    return "Details";
  return "Basics";
}
export function newRecord(resource: Resource): Row {
  const row: Row = {};
  for (const f of resource.fields) {
    if (f.type === "boolean") row[f.name] = ["is_active"].includes(f.name);
    else if (arrays.includes(f.name)) row[f.name] = [];
  }
  if (resource.fields.some((f) => f.name === "currency")) row.currency = "USD";
  if (resource.name === "products")
    Object.assign(row, { checkout_type: "external", product_type: "plugin", price_cents: 0 });
  if (resource.name === "user_roles") row.role = "user";
  if (resource.name === "site_settings")
    Object.assign(row, { banner_tone: "cyan", banner_enabled: false });
  return row;
}
export function displayValue(key: string, value: any, row: Row = {}): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean")
    return value
      ? key === "is_published"
        ? "Published"
        : key === "is_approved"
          ? "Approved"
          : "Yes"
      : key === "is_published"
        ? "Draft"
        : key === "is_approved"
          ? "Pending"
          : "No";
  if (key.endsWith("_cents")) {
    try {
      return new Intl.NumberFormat("en", {
        style: "currency",
        currency: row.currency || "USD",
      }).format(Number(value) / 100);
    } catch {
      return String(Number(value) / 100);
    }
  }
  if (key.endsWith("_at") || key === "day" || key.endsWith("_on"))
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).replaceAll("_", " ");
}
