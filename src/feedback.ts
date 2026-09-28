export function errorMessage(error: unknown): string {
  const text =
    error instanceof Error
      ? error.message
      : String((error as { message?: string })?.message || error);
  if (/failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(text)) {
    return "Cannot reach Supabase. Check your internet connection and the Supabase URL in .env, then try again.";
  }
  if (/invalid login credentials/i.test(text))
    return "The email or password is incorrect. Please try again.";
  if (/email not confirmed/i.test(text))
    return "Confirm your email using the Supabase confirmation email before signing in.";
  if (/rate limit|too many requests/i.test(text))
    return "Too many attempts. Please wait a moment before trying again.";
  return text;
}
export function configurationError(url?: string, key?: string): string | null {
  if (!url || !key)
    return "Add the storefront Supabase URL and public key to .env, then restart the admin server.";
  if (/YOUR_PROJECT|YOUR_PUBLIC_KEY|YOUR_ANON_KEY|example\.com/i.test(`${url} ${key}`))
    return ".env still contains example values. Use the same Supabase URL and public key as the original site.";
  try {
    if (!["http:", "https:"].includes(new URL(url).protocol)) throw new Error();
  } catch {
    return "The Supabase URL must be a valid http:// or https:// address.";
  }
  if (key.startsWith("sb_secret_"))
    return "Use a Supabase publishable key, not a secret key, in .env.";
  try {
    if (
      key.split(".").length === 3 &&
      JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role ===
        "service_role"
    )
      return "Use a Supabase public key, not a service-role key, in .env.";
  } catch {
    /* Supabase validates other invalid keys. */
  }
  return null;
}
