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
export async function requireAdmin() {
  if (!db) throw new Error("Configure the Supabase URL and public key before signing in.");
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new Error("Please sign in again.");
  const result = await db.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
  if (result.error) throw result.error;
  if (result.data !== true) throw new Error("Access denied. An administrator account is required.");
  return data.user;
}
