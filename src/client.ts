import type { WorkspaceAccess, AccessAction } from "./access-model";
import { createClient } from "@supabase/supabase-js";
import { configurationError } from "./feedback";
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const setupError = configurationError(url, key);
export const configured = !setupError;
export const db = configured
  ? createClient(url, key, {
      auth: {
        storageKey: "zcs-admin-auth",
        storage: sessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
export async function loadWorkspaceAccess() {
  if (!db) throw new Error("Configure Supabase before signing in.");
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new Error("Please sign in again.");
  const result = await db.rpc("workspace_access_context");
  if (result.error) {
    // Existing owners can still sign in before the permission migration is installed.
    const role = await db.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
    if (role.data === true)
      return {
        user: data.user,
        access: { admin: true, enabled: true, grants: {} } as WorkspaceAccess,
      };
    throw new Error("Staff access is unavailable. Apply the staff permission migration.");
  }
  const access = result.data as WorkspaceAccess;
  if (
    !access.admin &&
    (!access.enabled || !Object.values(access.grants).some((level) => level !== "none"))
  )
    throw new Error("Access denied. Ask an administrator to assign workspace permissions.");
  return { user: data.user, access };
}
// Existing components use this entry point to verify workspace membership.
export async function requireAdmin() {
  return (await loadWorkspaceAccess()).user;
}
export async function requireAccess(page: string, action: AccessAction = "read") {
  if (!db) throw new Error("Please sign in again.");
  const { data, error } = await db.rpc("workspace_can_access", {
    page_key: page,
    action_key: action,
  });
  if (error || data !== true) throw new Error("You do not have permission for this action.");
}
