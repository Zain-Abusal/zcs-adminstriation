import { readDrmDatabase, filterApiPage, validateDrmQuery } from "./drm-database.mjs";
const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
export function allowedRoute(path, method) {
  if (/^(products|customers|licenses)$/.test(path)) return ["GET", "POST"].includes(method);
  if (new RegExp(`^(products|customers|licenses)/${uuid}$`).test(path))
    return ["GET", "PATCH", "DELETE"].includes(method);
  if (new RegExp(`^licenses/${uuid}/ips$`).test(path)) return method === "GET";
  if (new RegExp(`^licenses/${uuid}/(reset-ips|rotate-key)$`).test(path)) return method === "POST";
  if (/^(requests|validations|audit)$/.test(path)) return method === "GET";
  return /^bbb\/sync-products(\/retry)?$/.test(path) && method === "POST";
}
export async function handleDrm(req, res, env = process.env, fetcher = fetch) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", "application/json");
  const fail = (status, message) => {
    res.statusCode = status;
    res.end(JSON.stringify({ ok: false, error: { message } }));
  };
  try {
    const url = new URL(req.url, "http://localhost");
    const path = url.searchParams.get("path") || "";
    if (!allowedRoute(path, req.method)) return fail(404, "Unknown DRM operation.");
    const token = req.headers.authorization;
    if (typeof token !== "string" || !/^Bearer \S+$/.test(token))
      return fail(401, "Please sign in again.");
    const supabase = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    const key = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!supabase || !key) return fail(503, "Workspace authentication is not configured.");
    try {
      validateDrmQuery(url.searchParams);
    } catch (e) {
      return fail(400, e.message);
    }
    const headers = { apikey: key, Authorization: token, "Content-Type": "application/json" };
    const page = path.startsWith("bbb/") ? "drm_sync" : `drm_${path.split("/")[0]}`;
    const action =
      req.method === "GET"
        ? "read"
        : req.method === "DELETE" || /reset-ips|rotate-key|bbb\//.test(path)
          ? "manage"
          : "edit";
    const [userResponse, roleResponse] = await Promise.all([
      fetcher(`${supabase}/auth/v1/user`, {
        headers,
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      }),
      fetcher(`${supabase}/rest/v1/rpc/workspace_can_access`, {
        method: "POST",
        headers,
        body: JSON.stringify({ page_key: page, action_key: action }),
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      }),
    ]);
    if (!userResponse.ok) return fail(401, "Please sign in again.");
    const user = await userResponse.json();
    if (!user.id) return fail(401, "Please sign in again.");
    if (!roleResponse.ok) return fail(503, "Unable to verify administrator access.");
    if ((await roleResponse.json()) !== true) return fail(403, "Administrator access required.");
    const mode = url.searchParams.get("source") || env.DRM_READ_SOURCE || "auto";
    if (!["auto", "api", "supabase"].includes(mode)) return fail(400, "Invalid DRM read source.");
    if (
      req.method === "GET" &&
      (mode === "supabase" ||
        (mode === "auto" && env.DRM_SUPABASE_URL && env.DRM_SUPABASE_SECRET_KEY))
    ) {
      if (!env.DRM_SUPABASE_URL || !env.DRM_SUPABASE_SECRET_KEY)
        return fail(
          503,
          "Set DRM_SUPABASE_URL and DRM_SUPABASE_SECRET_KEY on the server to use database reads.",
        );
      const result = await readDrmDatabase(path, url.searchParams, env, fetcher);
      res.statusCode = result.status;
      res.end(JSON.stringify(result.body));
      return;
    }
    if (!/^[A-Za-z0-9_-]{32}$/.test(env.LICENSE_ADMIN_API_TOKEN || ""))
      return fail(503, "Set LICENSE_ADMIN_API_TOKEN on the server to use the licensing API.");
    let body;
    if (["POST", "PATCH"].includes(req.method)) {
      if (req.body !== undefined)
        body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      else {
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk);
          if (size > 16384) return fail(413, "Body exceeds 16 KB.");
          chunks.push(Buffer.from(chunk));
        }
        body = Buffer.concat(chunks).toString();
      }
      if (body && Buffer.byteLength(body) > 16384) return fail(413, "Body exceeds 16 KB.");
      if (body) {
        if (!String(req.headers["content-type"] || "").startsWith("application/json"))
          return fail(415, "Use application/json.");
        try {
          JSON.parse(body);
        } catch {
          return fail(400, "Invalid JSON.");
        }
      }
    }
    const base = new URL(env.LICENSE_API_URL || "https://licenses.zcraftstudios.com");
    if (base.protocol !== "https:") return fail(503, "Licensing API requires HTTPS.");
    const upstream = new URL(`/api/admin/v1/${path}`, base);
    for (const [name, value] of url.searchParams)
      if (
        [
          "limit",
          "offset",
          "product_id",
          "customer_id",
          "license_id",
          "entity_id",
          "request_id",
        ].includes(name)
      )
        upstream.searchParams.set(name, value);
    const response = await fetcher(upstream, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${env.LICENSE_ADMIN_API_TOKEN}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body || undefined,
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    for (const name of ["retry-after", "x-request-id"])
      if (response.headers.has(name)) res.setHeader(name, response.headers.get(name));
    res.statusCode = response.status;
    const result = await response.json();
    const unfilteredCount = Array.isArray(result.data) ? result.data.length : null;
    const filtered = filterApiPage(result.data, path.split("/")[0], url.searchParams);
    if (result.ok) {
      result.data = filtered.data;
      result.source = "api";
      result.filtered_locally = filtered.local;
      result.page_size = unfilteredCount;
    }
    res.end(JSON.stringify(result));
  } catch {
    fail(503, "DRM service is unavailable. Try again later.");
  }
}
