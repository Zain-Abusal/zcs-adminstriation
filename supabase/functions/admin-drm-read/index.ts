import { readDrmDatabase, validateDrmQuery } from "./drm-database.mjs";
const PRIMARY_URL = "https://esrjajilhtjdleheettk.supabase.co";
const PRIMARY_KEY = "sb_publishable_CE_eX4Aj70h373NVim9TWw_-imMRBOl";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Max-Age": "600",
  "Cache-Control": "private, no-store",
  "Content-Type": "application/json",
};
const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
Deno.serve(async (req: Request) => {
  const request_id = crypto.randomUUID();
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify({ ...body, request_id }), { status, headers: cors });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET")
    return json(405, { ok: false, error: { message: "Read-only endpoint." } });
  try {
    const url = new URL(req.url),
      path = url.searchParams.get("path") || "";
    if (
      !/^(products|customers|licenses|requests|validations|audit)$/.test(path) &&
      !new RegExp(`^(products|customers|licenses)/${uuid}$`).test(path) &&
      !new RegExp(`^licenses/${uuid}/ips$`).test(path)
    )
      return json(404, { ok: false, error: { message: "Unknown DRM read." } });
    try {
      validateDrmQuery(url.searchParams);
    } catch (e) {
      return json(400, {
        ok: false,
        error: { message: e instanceof Error ? e.message : "Invalid filter." },
      });
    }
    const authorization = req.headers.get("authorization") || "";
    if (!/^Bearer \S+$/.test(authorization))
      return json(401, { ok: false, error: { message: "Please sign in again." } });
    const headers = {
      apikey: PRIMARY_KEY,
      Authorization: authorization,
      "Content-Type": "application/json",
    };
    const [user, permission] = await Promise.all([
      fetch(`${PRIMARY_URL}/auth/v1/user`, {
        headers,
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      }),
      fetch(`${PRIMARY_URL}/rest/v1/rpc/workspace_can_access`, {
        method: "POST",
        headers,
        body: JSON.stringify({ page_key: `drm_${path.split("/")[0]}`, action_key: "read" }),
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      }),
    ]);
    if (!user.ok || !(await user.json()).id)
      return json(401, { ok: false, error: { message: "Please sign in again." } });
    if (!permission.ok)
      return json(503, { ok: false, error: { message: "Unable to verify page access." } });
    if ((await permission.json()) !== true)
      return json(403, {
        ok: false,
        error: { message: "This DRM page is not allowed for your account." },
      });
    const result = await readDrmDatabase(
      path,
      url.searchParams,
      {
        DRM_SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
        DRM_SUPABASE_SECRET_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      },
      fetch,
    );
    return json(result.status, result.body);
  } catch {
    return json(503, { ok: false, error: { message: "DRM database is temporarily unavailable." } });
  }
});
