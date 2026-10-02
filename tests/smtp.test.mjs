import test from "node:test";
import assert from "node:assert/strict";
import { createSmtp, smtpOptions } from "../server/smtp.mjs";
import { configuration, smtpAudience, processEmail } from "../server/emails.mjs";
const env = {
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_USER: "smtp-user",
  SMTP_PASSWORD: "smtp-secret",
  SMTP_FROM: "studio@example.com",
  SUPABASE_SECRET_KEY: "database-secret",
};
const message = { subject: "Studio update", text: "Hello studio", html: "<p>Hello studio</p>" };
test("SMTP needs no SendPulse keys or lists for dashboard subscriber delivery", () => {
  const config = configuration(env);
  assert.equal(config.ready, true);
  assert.equal(config.transport, "smtp");
  assert.equal(config.subscriberSource, "newsletter_subscribers");
  assert.deepEqual(config.missing, []);
  const options = smtpOptions(env);
  assert.equal(options.secure, false);
  assert.equal(options.requireTLS, true);
  assert.equal(options.disableFileAccess, true);
  assert.equal(options.disableUrlAccess, true);
  assert.equal(smtpOptions({ ...env, SMTP_PORT: "465" }).secure, true);
  assert.equal(configuration({ ...env, SMTP_PORT: "bad" }).ready, false);
});
test("dashboard SMTP uses active unique subscribers without any SendPulse request", async () => {
  const emails = await smtpAudience(
    [
      { email: "ONE@example.com", is_active: true },
      { email: "one@example.com", is_active: true },
      { email: "inactive@example.com", is_active: false },
      { email: "invalid", is_active: true },
    ],
  );
  assert.deepEqual(emails, ["one@example.com"]);
});
test("legacy API environment cannot select another delivery provider", () => {
  assert.equal(configuration({ ...env, EMAIL_TRANSPORT: "sendpulse", SENDPULSE_CLIENT_SECRET: "unused" }).transport, "smtp");
});
test("SMTP keeps audience addresses in BCC and envelope, includes unsubscribe instructions", async () => {
  let sent,
    closed = false;
  const provider = createSmtp(env, () => ({
    sendMail: async (message) => {
      sent = message;
      return {
        accepted: ["a@example.com", "b@example.com"],
        rejected: [],
        messageId: message.messageId,
      };
    },
    close: () => {
      closed = true;
    },
  }));
  const id = await provider.campaign(message, ["a@example.com", "b@example.com"], "job-id");
  assert.equal(sent.to, "studio@example.com");
  assert.deepEqual(sent.bcc, ["a@example.com", "b@example.com"]);
  assert.deepEqual(sent.envelope.to, ["a@example.com", "b@example.com"]);
  assert.match(sent.text, /unsubscribe/);
  assert.equal(id, "<zcraft-job-id@example.com>");
  assert.equal(closed, true);
});
test("SMTP refuses oversized audiences before sending and holds partial acceptance as uncertain", async () => {
  let sent = 0;
  const provider = createSmtp({ ...env, SMTP_RECIPIENT_LIMIT: "1" }, () => ({
    sendMail: async () => {
      sent++;
    },
  }));
  await assert.rejects(
    () => provider.campaign(message, ["a@example.com", "b@example.com"], "job"),
    /exceeding/,
  );
  assert.equal(sent, 0);
  const partial = createSmtp(env, () => ({
    sendMail: async () => ({ accepted: ["a@example.com"], rejected: ["b@example.com"] }),
    close() {},
  }));
  await assert.rejects(
    () => partial.campaign(message, ["a@example.com", "b@example.com"], "job"),
    (e) => e.ambiguous === true,
  );
  const rejected = createSmtp(env, () => ({
    sendMail: async () => {
      const e = new Error("secret leaked in raw response");
      e.code = "EAUTH";
      throw e;
    },
    close() {},
  }));
  await assert.rejects(
    () => rejected.test(message, "a@example.com"),
    (e) => e.ambiguous === false && !e.message.includes("secret leaked"),
  );
});
test("existing durable queue can submit a dashboard SMTP email without SendPulse", async () => {
  const updates = [];
  const job = {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "manual",
    subject: "Hello",
    content: "Body",
    format: "text",
    audience: "dashboard",
  };
  const db = {
    rpc: async () => ({ data: [job] }),
    from: (table) =>
      table === "newsletter_subscribers"
        ? {
            select: () => ({
              order: () => ({
                range: async () => ({ data: [{ email: "a@example.com", is_active: true }] }),
              }),
            }),
          }
        : {
            update: (body) => ({
              eq: async () => {
                updates.push(body);
                return {};
              },
            }),
            insert: async () => ({}),
          },
  };
  const result = await processEmail(
    db,
    env,
    null,
    () => ({
      sendMail: async (m) => ({
        accepted: ["a@example.com"],
        rejected: [],
        messageId: m.messageId,
      }),
      close() {},
    }),
  );
  assert.equal(result.status, "submitted");
  assert.equal(updates[0].status, "submitted");
  assert.match(updates[0].provider_id, /^<zcraft-/);
});

test("SMTP timeouts hold the queue job as uncertain", async () => {
  const changes = [];
  const db = {
    rpc: async () => ({ data: [{ id: "job", kind: "manual", subject: "Test", content: "Body", format: "text", audience: "both" }] }),
    from: table => table === "newsletter_subscribers"
      ? { select: () => ({ order: () => ({ range: async () => ({ data: [{ email: "a@example.com", is_active: true }] }) }) }) }
      : { update: payload => ({ eq: async () => { changes.push(payload); return {}; } }) },
  };
  const result = await processEmail(db, env, null, () => ({ sendMail: async () => { const e = new Error("timeout"); e.code = "ETIMEDOUT"; throw e; }, close() {} }));
  assert.equal(result.status, "uncertain");
  assert.equal(changes.at(-1).status, "uncertain");
});
