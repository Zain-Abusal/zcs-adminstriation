import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const hits = new Map();

const WINDOW_MS = 60_000;

const LIMIT = Number(
  process.env.ADMIN_API_RATE_LIMIT || 30,
);

function json(res, status, body) {
  res.statusCode = status;

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8",
  );

  res.setHeader(
    "Cache-Control",
    "private, no-store",
  );

  res.end(JSON.stringify(body));
}

function ipFrom(req) {
  const forwarded = String(
    req.headers["x-forwarded-for"] || "",
  );

  return (
    forwarded.split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex");
}

function rateLimit(key) {
  const now = Date.now();

  const bucket = hits.get(key) || {
    count: 0,
    reset: now + WINDOW_MS,
  };

  if (bucket.reset <= now) {
    bucket.count = 0;
    bucket.reset = now + WINDOW_MS;
  }

  bucket.count += 1;

  hits.set(key, bucket);

  return {
    ok: bucket.count <= LIMIT,

    remaining: Math.max(
      0,
      LIMIT - bucket.count,
    ),

    reset: bucket.reset,
  };
}

async function readBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const text = Buffer.concat(
    chunks,
  ).toString("utf8");

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      "Invalid JSON request body.",
    );
  }
}

function cleanUrl(value) {
  const text = String(
    value || "",
  ).trim();

  if (!text) {
    return undefined;
  }

  const url = new URL(text);

  if (
    !["http:", "https:"].includes(
      url.protocol,
    )
  ) {
    throw new Error(
      "Invalid URL configuration.",
    );
  }

  return url.toString();
}

function safePaymentIntent(data) {
  return {
    id: data?.id,

    status: data?.status,

    url:
      data?.redirect_url ||
      data?.embedded_url,

    redirectUrl:
      data?.redirect_url,

    embeddedUrl:
      data?.embedded_url,

    amount: data?.amount,

    currency:
      data?.currency_code,
  };
}

/*
 * Extract a useful Ziina error without
 * returning the whole upstream response
 * to the browser.
 */
function ziinaError(data) {
  if (!data) {
    return {
      message:
        "Ziina returned an empty error response.",
      code: undefined,
    };
  }

  let message;

  if (
    typeof data.message === "string"
  ) {
    message = data.message;
  } else if (
    typeof data.error === "string"
  ) {
    message = data.error;
  } else if (
    typeof data.error?.message ===
    "string"
  ) {
    message =
      data.error.message;
  } else if (
    Array.isArray(data.errors) &&
    data.errors.length
  ) {
    const first =
      data.errors[0];

    if (
      typeof first === "string"
    ) {
      message = first;
    } else if (
      typeof first?.message ===
      "string"
    ) {
      message =
        first.message;
    }
  }

  const code =
    typeof data.code === "string"
      ? data.code
      : typeof data.error?.code ===
          "string"
        ? data.error.code
        : undefined;

  return {
    message:
      message ||
      "Ziina rejected the payment request.",

    code,
  };
}

async function adminClient(token) {
  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;

  const key =
    process.env
      .SUPABASE_PUBLISHABLE_KEY ||
    process.env
      .VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase server environment is missing.",
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },

    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

async function audit(db, event) {
  try {
    await db
      .from(
        "admin_security_events",
      )
      .insert(event);
  } catch {
    /*
     * Audit logging should never prevent
     * the payment operation from working.
     */
  }
}

export default async function handler(
  req,
  res,
) {
  const ip = ipFrom(req);

  const limited = rateLimit(
    `${ip}:ziina`,
  );

  res.setHeader(
    "X-RateLimit-Limit",
    String(LIMIT),
  );

  res.setHeader(
    "X-RateLimit-Remaining",
    String(limited.remaining),
  );

  res.setHeader(
    "X-RateLimit-Reset",
    String(
      Math.ceil(
        limited.reset / 1000,
      ),
    ),
  );

  if (req.method !== "POST") {
    return json(res, 405, {
      message:
        "Method not allowed.",
    });
  }

  if (!limited.ok) {
    return json(res, 429, {
      message:
        "Too many payment requests. Try again shortly.",
    });
  }

  const token = String(
    req.headers.authorization || "",
  ).replace(
    /^Bearer\s+/i,
    "",
  );

  if (!token) {
    return json(res, 401, {
      message:
        "Please sign in again.",
    });
  }

  let db;
  let userId = null;

  /*
   * Verify Supabase account and
   * administrator role.
   */
  try {
    db = await adminClient(token);

    const {
      data,
      error,
    } = await db.auth.getUser(
      token,
    );

    if (
      error ||
      !data.user
    ) {
      throw new Error(
        "Unauthorized",
      );
    }

    userId = data.user.id;

    const role = await db.rpc(
      "has_role",
      {
        _user_id: userId,
        _role: "admin",
      },
    );

    if (
      role.error ||
      role.data !== true
    ) {
      throw new Error(
        "Forbidden",
      );
    }
  } catch {
    return json(res, 403, {
      message:
        "Admin access is required.",
    });
  }

  try {
    /*
     * Ziina server API credential.
     * Never expose this variable to
     * browser/client code.
     */
    const apiKey =
      process.env.ZIINA_API_KEY ||
      process.env
        .ZIINA_CLIENT_SECRET;

    if (!apiKey) {
      throw new Error(
        "Ziina API key is not configured.",
      );
    }

    const body =
      await readBody(req);

    /*
     * Client sends normal currency:
     *
     * 4.99 USD
     *
     * Ziina receives:
     *
     * 499
     */
    const enteredAmount = Number(
      body.amount || 0,
    );

    if (
      !Number.isFinite(
        enteredAmount,
      ) ||
      enteredAmount <= 0
    ) {
      throw new Error(
        "Amount must be greater than 0.",
      );
    }

    const amount = Math.round(
      enteredAmount * 100,
    );

    if (
      !Number.isSafeInteger(
        amount,
      ) ||
      amount <= 0
    ) {
      throw new Error(
        "Invalid payment amount.",
      );
    }

    const currency = String(
      body.currency || "AED",
    )
      .trim()
      .toUpperCase();

    if (
      !/^[A-Z]{3}$/.test(
        currency,
      )
    ) {
      throw new Error(
        "Currency must be a 3-letter code.",
      );
    }

    const message = String(
      body.description ||
        body.title ||
        "ZCraft Studios order",
    )
      .trim()
      .slice(0, 500);

    const payload = {
      amount,

      currency_code:
        currency,

      message,

      success_url: cleanUrl(
        process.env
          .ZIINA_COMPLETED_PAYMENT_URL,
      ),

      cancel_url: cleanUrl(
        process.env
          .ZIINA_PAYMENT_URL,
      ),

      failure_url: cleanUrl(
        process.env
          .ZIINA_PAYMENT_URL,
      ),

      test:
        process.env
          .ZIINA_TEST_MODE ===
        "true",
    };

    /*
     * Avoid sending keys with
     * undefined values.
     */
    Object.keys(
      payload,
    ).forEach((key) => {
      if (
        payload[key] ===
        undefined
      ) {
        delete payload[key];
      }
    });

    const base =
      process.env
        .ZIINA_API_BASE_URL ||
      "https://api-v2.ziina.com/api";

    const endpoint = `${base.replace(
      /\/+$/,
      "",
    )}/payment_intent`;

    const response =
      await fetch(endpoint, {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${apiKey}`,

          "Content-Type":
            "application/json",

          "Idempotency-Key":
            crypto.randomUUID(),
        },

        body:
          JSON.stringify(
            payload,
          ),
      });

    const data =
      await response
        .json()
        .catch(() => ({}));

    /*
     * Log useful server-side information.
     * Never log the API key.
     */
    if (!response.ok) {
      console.error(
        "[Ziina payment error]",
        {
          status:
            response.status,

          statusText:
            response.statusText,

          currency,

          amount,

          response: data,
        },
      );
    }

    await audit(db, {
      actor_user_id:
        userId,

      event_type:
        response.ok
          ? "ziina.payment_intent.created"
          : "ziina.payment_intent.failed",

      ip_address:
        ip === "unknown"
          ? null
          : ip,

      ip_hash:
        hash(ip),

      user_agent:
        String(
          req.headers[
            "user-agent"
          ] || "",
        ).slice(0, 500),

      metadata: {
        status:
          response.status,

        ziina_id:
          data?.id || null,

        currency,

        amount,
      },
    });

    if (!response.ok) {
      const upstream =
        ziinaError(data);

      return json(
        res,
        response.status >=
          400 &&
          response.status <
            600
          ? response.status
          : 502,
        {
          message:
            upstream.message,

          ...(upstream.code
            ? {
                code:
                  upstream.code,
              }
            : {}),
        },
      );
    }

    if (!data?.id) {
      return json(res, 502, {
        message:
          "Ziina accepted the request but did not return a payment ID.",
      });
    }

    return json(res, 201, {
      paymentLink:
        safePaymentIntent(
          data,
        ),
    });
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.message
        : "Unknown error";

    console.error(
      "[Ziina API error]",
      reason,
    );

    await audit(db, {
      actor_user_id:
        userId,

      event_type:
        "ziina.payment_intent.error",

      ip_address:
        ip === "unknown"
          ? null
          : ip,

      ip_hash:
        hash(ip),

      user_agent:
        String(
          req.headers[
            "user-agent"
          ] || "",
        ).slice(0, 500),

      metadata: {
        reason:
          reason.slice(
            0,
            200,
          ),
      },
    });

    const safeMessage =
      /configured|Amount|amount|Currency|currency|URL|JSON/.test(
        reason,
      )
        ? reason
        : "Could not create the Ziina payment link.";

    return json(res, 400, {
      message: safeMessage,
    });
  }
}
