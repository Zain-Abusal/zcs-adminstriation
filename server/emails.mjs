import { createClient } from "@supabase/supabase-js";
import { createSmtp, smtpSender } from "./smtp.mjs";
import { timingSafeEqual } from "node:crypto";
import { announcement, emailHtml } from "./email-content.mjs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sources = {
  news: "news_entries",
  blog: "blog_posts",
  product: "products",
  sale: "sale_events",
  discount: "sales",
};
const tests = new Map();
function secretMatch(a, b) {
  if (!a || !b) return false;
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
async function bodyOf(req) {
  let value = req.body;
  if (value === undefined) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > 225000) throw new Error("Email exceeds 200 KB.");
      chunks.push(Buffer.from(chunk));
    }
    value = Buffer.concat(chunks).toString();
  }
  if (typeof value === "string") {
    if (Buffer.byteLength(value) > 225000) throw new Error("Email exceeds 200 KB.");
    value = JSON.parse(value || "{}");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid request.");
  return value;
}
export function validateMessage(body) {
  if (
    typeof body.subject !== "string" ||
    !body.subject.trim() ||
    body.subject.length > 200 ||
    /[\r\n]/.test(body.subject)
  )
    throw new Error("Enter a subject of up to 200 characters.");
  if (
    !["html", "text"].includes(body.format) ||
    typeof body.content !== "string" ||
    !body.content.trim() ||
    Buffer.byteLength(body.content) > 204800
  )
    throw new Error("Enter HTML or text content, up to 200 KB.");
  if (body.audience !== undefined && body.audience !== "dashboard")
    throw new Error("Emails use active newsletter subscribers.");
  return {
    subject: body.subject.trim(),
    content: body.content,
    format: body.format,
    audience: "dashboard",
  };
}
export function configuration(env) {
  const sender = smtpSender(env);
  const missing = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SUPABASE_SECRET_KEY"].filter(key => !env[key]);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) missing.push("SMTP_FROM (valid sender address)");
  const port = Number(env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) missing.push("SMTP_PORT (valid port)");
  return { ready: missing.length === 0, missing, sender, transport: "smtp", subscriberSource: "newsletter_subscribers" };
}
export function smtpAudience(subscribers) {
  return [...new Set(subscribers.filter(row => row.is_active).map(row => String(row.email).trim().toLowerCase()))]
    .filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}
async function subscribers(db) {
  const result = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    const { data, error } = await db
      .from("newsletter_subscribers")
      .select("email,is_active")
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    result.push(...data);
    if (data.length < 1000) return result;
  }
  throw new Error(
    "More than 10,000 dashboard subscribers. Sync the audience in batches before sending.",
  );
}
export async function processEmail(db, env, targetId, makeSmtpTransport) {
  const { data, error } = await db.rpc("workspace_claim_email", { target_id: targetId || null });
  if (error) throw error;
  const job = data?.[0];
  if (!job)
    return {
      processed: false,
      message: "No due jobs, automation paused, or hourly campaign limit reached.",
    };
  const update = async (payload) => {
    const r = await db.from("workspace_email_jobs").update(payload).eq("id", job.id);
    if (r.error) throw r.error;
  };
  let submitted = false;
  try {
    let message;
    if (job.kind === "manual")
      message = {
        subject: job.subject,
        html: emailHtml(job.content, job.format),
        text: job.format === "text" ? job.content : "",
      };
    else {
      const { data: row, error: readError } = await db
        .from(sources[job.kind])
        .select("*")
        .eq("id", job.ref_id)
        .maybeSingle();
      if (readError) throw readError;
      let live =
        row &&
        (job.kind === "sale" ? row.is_active : job.kind === "discount" ? true : row.is_published);
      if (live && job.kind === "discount") {
        const product = await db
          .from("products")
          .select("slug,is_published")
          .eq("id", row.product_id)
          .maybeSingle();
        if (product.error) throw product.error;
        live = !!product.data?.is_published;
        row.slug = product.data?.slug;
      }
      if (
        !live ||
        (["sale", "discount"].includes(job.kind) &&
          row.ends_at &&
          new Date(row.ends_at) <= new Date())
      ) {
        await update({
          status: "cancelled",
          last_error: "Content is no longer public or the sale has ended.",
        });
        return { processed: true, status: "cancelled" };
      }
      const liveAt =
        row[
          ["sale", "discount"].includes(job.kind)
            ? "starts_at"
            : job.kind === "news"
              ? "published_on"
              : "published_at"
        ];
      if (liveAt && new Date(liveAt) > new Date()) {
        await update({ status: "queued", available_at: liveAt, last_error: null });
        return { processed: true, status: "queued" };
      }
      message = announcement(job.kind, row, env.PUBLIC_SITE_URL);
    }
    const recipients = smtpAudience(await subscribers(db));
    const recipientCount = recipients.length;
    const providerId = await createSmtp(env, makeSmtpTransport).campaign(message, recipients, job.id);
    submitted = true;
    await update({
      status: "submitted",
      provider_id: providerId,
      submitted_at: new Date().toISOString(),
      last_error: null,
    });
    // SMTP acceptance does not confirm final delivery.
    const log = await db.from("broadcast_log").insert({
      kind: job.kind,
      ref_id: job.ref_id || job.id,
      title: message.subject,
      recipients: recipientCount,
      failed: 0,
    });
    return {
      processed: true,
      status: "submitted",
      providerId,
      ...(log.error
        ? { warning: "Campaign submitted; broadcast history could not be updated." }
        : {}),
    };
  } catch (e) {
    const status = submitted || e.ambiguous ? "uncertain" : "failed";
    await update({
      status,
      last_error: String(e.message || "Email submission failed.").slice(0, 500),
    });
    return { processed: true, status, error: e.message };
  }
}
export async function handleEmails(
  req,
  res,
  env = process.env,
  { fetcher = fetch, makeDb = createClient, makeSmtpTransport } = {},
) {
  const respond = (status, data) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "private, no-store");
    res.end(JSON.stringify(data));
  };
  try {
    const url = new URL(req.url || "/", "https://admin.local");
    if (!["GET", "POST"].includes(req.method)) return respond(405, { error: "Use GET or POST." });
    const authorization = String(req.headers.authorization || "");
    const worker = [env.EMAIL_WORKER_SECRET, env.CRON_SECRET].some(
      (secret) => !!secret && secretMatch(authorization, `Bearer ${secret}`),
    );
    const supabase = env.SUPABASE_URL || env.VITE_SUPABASE_URL,
      key = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!worker && !/^Bearer \S+$/.test(authorization))
      return respond(401, { error: "Please sign in again." });
    if (!supabase || !key)
      return respond(503, { error: "Workspace authentication is not configured." });
    const make = (key, auth) =>
      makeDb(supabase, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: fetcher, ...(auth ? { headers: { Authorization: auth } } : {}) },
      });
    let user, userDb;
    if (!worker) {
      userDb = make(key, authorization);
      const result = await userDb.auth.getUser(authorization.slice(7));
      if (result.error || !result.data.user?.id)
        return respond(401, { error: "Please sign in again." });
      user = result.data.user;
    }
    const body = req.method === "POST" ? await bodyOf(req) : {};
    const action = body.action || url.searchParams.get("action") || "status";
    if (
      ![
        "status",
        "settings",
        "manual",
        "test",
        "process",
        "dispatch",
        "retry",
        "cancel",
        "reconcile",
      ].includes(action)
    )
      return respond(400, { error: "Unknown email action." });
    if (
      (req.method === "GET" && action !== "status" && !(worker && action === "process")) ||
      (req.method === "POST" && action === "status")
    )
      return respond(405, { error: "Invalid method for this action." });
    if (worker && action !== "process")
      return respond(403, { error: "Workers can only process the email queue." });
    const can = async (page, permission) => {
      const r = await userDb.rpc("workspace_can_access", {
        page_key: page,
        action_key: permission,
      });
      if (r.error) throw new Error("Unable to verify permissions.");
      return r.data === true;
    };
    if (!worker) {
      const page = action === "dispatch" ? sources[body.kind] : "emails";
      const permission =
        action === "status"
          ? "read"
          : action === "test" || action === "dispatch"
            ? "edit"
            : "manage";
      if (!page || !(await can(page, permission)))
        return respond(403, { error: "You do not have permission for this email action." });
    }
    if (action === "status") {
      const [settings, jobs, counts] = await Promise.all([
        userDb.from("workspace_email_settings").select("*").single(),
        userDb
          .from("workspace_email_jobs")
          .select(
            "id,kind,subject,audience,status,available_at,created_at,provider_id,last_error,attempts",
          )
          .order("created_at", { ascending: false })
          .limit(50),
        userDb
          .from("workspace_email_jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", "queued"),
      ]);
      if (settings.error || jobs.error || counts.error)
        return respond(503, {
          error: "Email tables are not ready. Apply the email migrations.",
        });
      return respond(200, {
        configuration: configuration(env),
        settings: settings.data,
        jobs: jobs.data,
        queued: counts.count,
      });
    }
    const config = configuration(env);
    if (action === "dispatch" && !config.ready)
      return respond(200, { processed: false, message: "Email delivery is not configured." });
    if (!env.SUPABASE_SECRET_KEY)
      return respond(503, { error: "Configure SUPABASE_SECRET_KEY on the server." });
    const db = make(env.SUPABASE_SECRET_KEY);
    if (action === "settings") {
      const value = body.settings;
      if (
        !value ||
        !["enabled", "news", "blog", "product", "sale"].every(
          (k) => typeof value[k] === "boolean",
        ) ||
        value.audience !== "dashboard"
      )
        return respond(400, { error: "Invalid automation settings." });
      if (value.enabled && !config.ready)
        return respond(503, { error: `Configure: ${config.missing.join(", ")}.` });
      const r = await db
        .from("workspace_email_settings")
        .update(
          Object.fromEntries([
            ...["enabled", "news", "blog", "product", "sale", "audience"].map((k) => [k, value[k]]),
            ["updated_at", new Date().toISOString()],
          ]),
        )
        .eq("id", true);
      if (r.error) throw r.error;
      return respond(200, { message: "Automation settings saved." });
    }
    if (["retry", "cancel", "reconcile"].includes(action)) {
      if (!uuid.test(body.id || "")) return respond(400, { error: "Invalid job ID." });
      if (
        action === "reconcile" &&
        !/^<[^\s<>]{1,250}>$/.test(String(body.providerId || ""))
      )
        return respond(400, { error: "Enter the SMTP Message-ID confirmed by your provider." });
      const r = await db
        .from("workspace_email_jobs")
        .update(
          action === "reconcile"
            ? {
                status: "submitted",
                provider_id: String(body.providerId),
                submitted_at: new Date().toISOString(),
                last_error: null,
              }
            : action === "retry"
              ? { status: "queued", available_at: new Date().toISOString(), last_error: null }
              : { status: "cancelled" },
        )
        .eq("id", body.id)
        .in(
          "status",
          action === "retry"
            ? ["failed"]
            : action === "reconcile"
              ? ["uncertain"]
              : ["queued", "failed", "uncertain"],
        )
        .select("id");
      if (r.error) throw r.error;
      if (!r.data?.length)
        return respond(409, { error: "This job changed or cannot be updated. Refresh the queue." });
      return respond(200, {
        message:
          action === "reconcile"
            ? "Campaign marked as submitted."
            : action === "retry"
              ? "Job queued for retry."
              : "Job cancelled.",
      });
    }
    if (!config.ready) return respond(503, { error: `Configure: ${config.missing.join(", ")}.` });
    if (action === "test") {
      let message;
      try {
        message = validateMessage(body);
      } catch (e) {
        return respond(400, { error: e.message });
      }
      if (!user.email)
        return respond(400, { error: "Your account needs an email address to receive a test." });
      const now = Date.now(),
        previous = tests.get(user.id) || 0;
      if (now - previous < 60000)
        return respond(429, { error: "Wait a minute before sending another test." });
      tests.set(user.id, now);
      const provider = createSmtp(env, makeSmtpTransport);
      const id = await provider.test(
        {
          subject: message.subject,
          html: emailHtml(message.content, message.format),
          text: message.format === "text" ? message.content : "",
        },
        user.email,
      );
      return respond(200, { message: `Test submitted to ${user.email}.`, providerId: id });
    }
    let targetId = null;
    if (action === "manual") {
      let message;
      try {
        message = validateMessage(body);
      } catch (e) {
        return respond(400, { error: e.message });
      }
      if (!uuid.test(body.requestKey || ""))
        return respond(400, { error: "A valid request key is required." });
      const existing = await db
        .from("workspace_email_jobs")
        .select("id,status")
        .eq("request_key", body.requestKey)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data)
        return respond(200, { message: "This campaign is already queued.", job: existing.data });
      const r = await db
        .from("workspace_email_jobs")
        .insert({ ...message, kind: "manual", request_key: body.requestKey, created_by: user.id })
        .select("id")
        .single();
      if (r.error) {
        if (r.error.code === "23505")
          return respond(409, { error: "This campaign was already queued. Refresh the queue." });
        throw r.error;
      }
      targetId = r.data.id;
    } else if (action === "dispatch") {
      if (!uuid.test(body.refId || "")) return respond(400, { error: "Invalid content ID." });
      const r = await db
        .from("workspace_email_jobs")
        .select("id")
        .eq("kind", body.kind)
        .eq("ref_id", body.refId)
        .eq("status", "queued")
        .maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) return respond(200, { processed: false, message: "No announcement queued." });
      targetId = r.data.id;
    } else if (action === "process" && body.id) {
      if (!uuid.test(body.id)) return respond(400, { error: "Invalid job ID." });
      targetId = body.id;
    }
    const result = await processEmail(db, env, targetId, makeSmtpTransport);
    return respond(200, {
      ...result,
      ...(targetId ? { jobId: targetId } : {}),
      ...(action === "manual" && !result.processed
        ? { message: "Campaign queued. It will be submitted when the queue worker can process it." }
        : {}),
    });
  } catch (e) {
    return respond(e instanceof SyntaxError ? 400 : 502, {
      error: e.message || "Email service unavailable.",
    });
  }
}
