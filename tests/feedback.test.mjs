import { test } from "node:test";
import assert from "node:assert/strict";
import { configurationError, errorMessage } from "../src/feedback.ts";

test("example configuration is rejected before issuing a network request", () => {
  assert.match(
    configurationError("https://YOUR_PROJECT.supabase.co", "YOUR_PUBLIC_KEY"),
    /example values/,
  );
  assert.match(configurationError("invalid", "sb_publishable_test"), /valid http/);
  assert.equal(configurationError("https://project.supabase.co", "sb_publishable_test"), null);
});
test("privileged keys cannot initialize the browser client", () => {
  assert.match(
    configurationError("https://project.supabase.co", "sb_secret_test"),
    /not a secret key/,
  );
  const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
  assert.match(
    configurationError("https://project.supabase.co", `header.${payload}.signature`),
    /not a service-role key/,
  );
});
test("auth failures provide actionable and distinct messages", () => {
  assert.match(errorMessage(new TypeError("Failed to fetch")), /Cannot reach Supabase/);
  assert.match(
    errorMessage({ message: "Invalid login credentials" }),
    /email or password is incorrect/,
  );
  assert.match(errorMessage({ message: "Email not confirmed" }), /Confirm your email/);
  assert.match(
    errorMessage({
      message: "Access denied. An administrator account is required.",
    }),
    /administrator account/,
  );
});
