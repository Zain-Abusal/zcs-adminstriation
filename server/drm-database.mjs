export const drmTables = {
  products: {
    table: "zcslic_products",
    fields:
      "id,name,slug,active,metadata,created_at,updated_at,bbb_resource_id,bbb_validation_enabled,retire_at",
    date: "created_at",
    search: ["name", "slug"],
    filters: ["active", "bbb_validation_enabled", "bbb_resource_id"],
  },
  customers: {
    table: "zcslic_customers",
    fields: "id,name,email,metadata,created_at,updated_at",
    date: "created_at",
    search: ["name", "email"],
    filters: [],
  },
  licenses: {
    table: "zcslic_licenses",
    fields:
      "id,product_id,customer_id,key_hint,status,expires_at,max_ips,metadata,created_at,updated_at,last_validated_at",
    date: "created_at",
    search: ["key_hint"],
    filters: ["product_id", "customer_id", "status"],
  },
  requests: {
    table: "zcslic_request_events",
    fields: "id,request_id,method,route,status_code,requester_ip,duration_ms,error_code,logged_at",
    date: "logged_at",
    search: ["route", "error_code"],
    filters: ["method", "status_code", "request_id", "route", "error_code"],
  },
  validations: {
    table: "zcslic_validation_events",
    fields: "id,request_id,license_id,product_id,ip_address,valid,reason,validated_at",
    date: "validated_at",
    search: ["reason"],
    filters: ["license_id", "product_id", "valid", "reason", "request_id"],
  },
  audit: {
    table: "zcslic_admin_audit",
    fields: "id,request_id,actor,action,entity_type,entity_id,changed_fields,details,logged_at",
    date: "logged_at",
    search: ["action", "actor"],
    filters: ["entity_id", "request_id", "entity_type", "action"],
  },
  ips: {
    table: "zcslic_ip_bindings",
    fields: "id,license_id,ip_address,first_seen_at,last_seen_at",
    date: "first_seen_at",
    search: [],
    filters: ["license_id"],
  },
};
export function validateDrmQuery(params) {
  const limit = Number(params.get("limit") || 20),
    offset = Number(params.get("offset") || 0);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isInteger(offset) ||
    offset < 0
  )
    throw new Error("Invalid pagination.");
  for (const [key, value] of params) {
    if (value.length > 300) throw new Error("Filter is too long.");
    if (
      key.endsWith("_id") &&
      value &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    )
      throw new Error("Filters require a valid UUID.");
    if (
      ["from", "to"].includes(key) &&
      value &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)))
    )
      throw new Error("Invalid date filter.");
  }
  if (params.get("from") && params.get("to") && params.get("from") > params.get("to"))
    throw new Error("From date must precede through date.");
  return { limit, offset };
}
export function databaseUrl(path, params, base) {
  const parts = path.split("/");
  const spec = drmTables[parts[2] === "ips" ? "ips" : parts[0]];
  if (!spec) throw new Error("Unsupported database read.");
  const { limit, offset } = validateDrmQuery(params);
  const url = new URL(`/rest/v1/${spec.table}`, base);
  url.searchParams.set("select", spec.fields);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("order", `${spec.date}.desc,id.desc`);
  if (parts[2] === "ips") url.searchParams.set("license_id", `eq.${parts[1]}`);
  else if (parts[1]) url.searchParams.set("id", `eq.${parts[1]}`);
  for (const field of spec.filters)
    if (params.get(field)) url.searchParams.set(field, `eq.${params.get(field)}`);
  if (params.get("from"))
    url.searchParams.append(spec.date, `gte.${params.get("from")}T00:00:00.000Z`);
  if (params.get("to")) url.searchParams.append(spec.date, `lte.${params.get("to")}T23:59:59.999Z`);
  if (params.get("search") && spec.search.length) {
    const text = String(params.get("search"))
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("%", "")
      .replaceAll("_", "");
    url.searchParams.set(
      "or",
      `(${spec.search.map((field) => `${field}.ilike."%${text}%"`).join(",")})`,
    );
  }
  return url;
}
export async function readDrmDatabase(path, params, env, fetcher) {
  const base = new URL(env.DRM_SUPABASE_URL);
  if (base.protocol !== "https:") throw new Error("Database requires HTTPS.");
  const url = databaseUrl(path, params, base);
  const key = env.DRM_SUPABASE_SECRET_KEY;
  const response = await fetcher(url, {
    headers: {
      apikey: key,
      ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }),
      Prefer: "count=exact",
    },
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("DRM database read failed.");
  const rows = await response.json();
  const isRecord = path.split("/").length === 2;
  if (isRecord && !rows.length)
    return { status: 404, body: { ok: false, error: { message: "Record not found." } } };
  const total = response.headers.get("content-range")?.split("/")[1];
  return {
    status: 200,
    body: {
      ok: true,
      data: isRecord ? rows[0] : rows,
      count: total && total !== "*" ? Number(total) : null,
      source: "supabase",
    },
  };
}
export function filterApiPage(data, resource, params) {
  if (!Array.isArray(data)) return { data, local: false };
  const spec = drmTables[resource];
  if (!spec) return { data, local: false };
  const native =
    {
      licenses: ["product_id", "customer_id"],
      validations: ["license_id"],
      audit: ["entity_id", "request_id"],
    }[resource] || [];
  const filters = spec.filters.filter((f) => params.get(f) && !native.includes(f));
  const local =
    filters.length > 0 || !!params.get("from") || !!params.get("to") || !!params.get("search");
  return {
    local,
    data: data.filter(
      (row) =>
        filters.every((f) => String(row[f]) === params.get(f)) &&
        (!params.get("from") || row[spec.date] >= `${params.get("from")}T00:00:00.000Z`) &&
        (!params.get("to") || row[spec.date] <= `${params.get("to")}T23:59:59.999Z`) &&
        (!params.get("search") ||
          spec.search.some((f) =>
            String(row[f] || "")
              .toLowerCase()
              .includes(params.get("search").toLowerCase()),
          )),
    ),
  };
}
