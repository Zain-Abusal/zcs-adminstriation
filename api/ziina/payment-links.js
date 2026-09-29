import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const hits = new Map();
const WINDOW_MS = 60_000;
const LIMIT = Number(process.env.ADMIN_API_RATE_LIMIT || 30);

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  res.end(JSON.stringify(body));
}

function ipFrom(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "");
  return forwarded.split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function rateLimit(key) {
  const now = Date.now();
  const bucket = hits.get(key) || { count: 0, reset: now + WINDOW_MS };
  if (bucket.reset <= now) {
    bucket.count = 0;
    bucket.reset = now + WINDOW_MS;
  }
  bucket.count += 1;
  hits.set(key, bucket);
  return {
    ok: bucket.count <= LIMIT,
    remaining: Math.max(0, LIMIT - bucket.count),
    reset: bucket.reset,
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function cleanUrl(value) {
  const text = String(value || "").trim();
  if (!text) return undefined;
  const url = new URL(text);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid URL configuration.");
  return url.toString();
}

function safePaymentIntent(data) {
  return {
    id: data?.id,
    status: data?.status,
    url: data?.redirect_url || data?.embedded_url,
    redirectUrl: data?.redirect_url,
    embeddedUrl: data?.embedded_url,
    amount: data?.amount,
    currency: data?.currency_code,
  };
}

async function adminClient(token) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase server environment is missing.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function audit(db, event) {
  try {
    await db.from("admin_security_events").insert(event);
  } catch {
    // Optional table. Never expose audit write failures to the browser.
  }
}

export default async function handler(req, res) {
  const ip = ipFrom(req);
  const limited = rateLimit(`${ip}:ziina`);
  res.setHeader("X-RateLimit-Limit", String(LIMIT));
  res.setHeader("X-RateLimit-Remaining", String(limited.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(limited.reset / 1000)));

  if (req.method !== "POST") return json(res, 405, { message: "Method not allowed." });
  if (!limited.ok) return json(res, 429, { message: "Too many payment requests. Try again shortly." });

  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(res, 401, { message: "Please sign in again." });

  let db;
  let userId = null;
  try {
    db = await adminClient(token);
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) throw new Error("Unauthorized");
    userId = data.user.id;
    const role = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (role.error || role.data !== true) throw new Error("Forbidden");
  } catch {
    return json(res, 403, { message: "Admin access is required." });
  }

  try {
    const apiKey = process.env.ZIINA_API_KEY || process.env.ZIINA_CLIENT_SECRET;
    if (!apiKey) throw new Error("Ziina API key is not configured.");

    const body = await readBody(req);
    const amount = Math.round(Number(body.amount || 0) * 100);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Amount must be greater than 0.");
    const currency = String(body.currency || "AED").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be a 3-letter code.");

    const payload = {
      amount,
      currency_code: currency,
      message: String(body.description || body.title || "ZCraft Studios order").slice(0, 500),
      success_url: cleanUrl(process.env.ZIINA_COMPLETED_PAYMENT_URL),
      cancel_url: cleanUrl(process.env.ZIINA_PAYMENT_URL),
      failure_url: cleanUrl(process.env.ZIINA_PAYMENT_URL),
      test: process.env.ZIINA_TEST_MODE === "true",
    };

    const base = process.env.ZIINA_API_BASE_URL || "https://api-v2.ziina.com/api";
    const response = await fetch(`${base.replace(/\/+$/, "")}/payment_intent`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    await audit(db, {
      actor_user_id: userId,
      event_type: response.ok ? "ziina.payment_intent.created" : "ziina.payment_intent.failed",
      ip_address: ip === "unknown" ? null : ip,
      ip_hash: hash(ip),
      user_agent: String(req.headers["user-agent"] || "").slice(0, 500),
      metadata: { status: response.status, ziina_id: data?.id || null },
    });
    if (!response.ok) {
      return json(res, 502, { message: "Ziina rejected the payment request. Check the amount, currency, or API key." });
    }
    return json(res, 201, { paymentLink: safePaymentIntent(data) });
  } catch (error) {
    await audit(db, {
      actor_user_id: userId,
      event_type: "ziina.payment_intent.error",
      ip_address: ip === "unknown" ? null : ip,
      ip_hash: hash(ip),
      user_agent: String(req.headers["user-agent"] || "").slice(0, 500),
      metadata: { reason: error instanceof Error ? error.message.slice(0, 120) : "unknown" },
    });
    return json(res, 400, {
      message:
        error instanceof Error && /configured|Amount|Currency|URL/.test(error.message)
          ? error.message
          : "Could not create the Ziina payment link.",
    });
  }
}
