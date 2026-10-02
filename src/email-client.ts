import { db } from "./client";
export async function emailRequest(body?: Record<string, unknown>) {
  const session = await db!.auth.getSession();
  if (!session.data.session) throw new Error("Please sign in again.");
  const response = await fetch("/api/emails", {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${session.data.session.access_token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(65000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Email service unavailable.");
  return result;
}
