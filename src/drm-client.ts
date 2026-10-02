import { db } from "./client";
import { configurationError } from "./feedback";
export async function drmRequest(path: string, method = "GET", body?: unknown, source = "auto") {
  const session = await db?.auth.getSession();
  let token = session?.data.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const [route, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("path", route);
  params.set("source", source);
  const directUrl = import.meta.env.VITE_DRM_SUPABASE_URL?.trim();
  const directKey = import.meta.env.VITE_DRM_SUPABASE_PUBLISHABLE_KEY?.trim();
  const useDirect = method === "GET" && source !== "api" && !!directUrl && !!directKey;
  if (useDirect) {
    const error = configurationError(directUrl, directKey);
    if (error) throw new Error(error);
  }
  if (useDirect && !directUrl.startsWith("https://"))
    throw new Error("DRM Supabase requires HTTPS.");
  const endpoint = useDirect
    ? `${directUrl}/functions/v1/admin-drm-read?${params}`
    : `/api/drm?${params}`;
  const send = (accessToken: string) => fetch(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(useDirect ? { apikey: directKey!, "x-workspace-authorization": `Bearer ${accessToken}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
  let response = await send(token);
  if (response.status === 401) {
    const refreshed = await db!.auth.refreshSession();
    token = refreshed.data.session?.access_token;
    if (refreshed.error || !token) throw new Error("Your workspace session expired. Please sign in again.");
    response = await send(token);
  }
  const result = await response.json().catch(() => {
    throw new Error("The DRM server returned an unreadable response. Try again.");
  });
  if (!response.ok || result.ok !== true) {
    const retry = response.headers.get("retry-after");
    throw new Error(
      `${result.error?.message || result.message || "DRM request failed."}${retry ? ` Retry in ${retry} seconds.` : ""}${result.request_id ? ` Request: ${result.request_id}` : ""}`,
    );
  }
  return result;
}
