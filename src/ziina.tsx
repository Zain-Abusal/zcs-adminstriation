import { useState } from "react";
import { Button, Field, inputClass } from "@/components/kit";
import {
  Copy,
  CreditCard,
  ExternalLink,
  Loader2,
  ShieldCheck,
} from "@/lib/icons";
import { db, requireAdmin } from "./client";
import { errorMessage } from "./feedback";

type PaymentLink = {
  id?: string;
  url?: string;
  redirectUrl?: string;
  embeddedUrl?: string;
  status?: string;
};

function resolvedUrl(link: PaymentLink) {
  return (
    link.redirectUrl ||
    link.url ||
    link.embeddedUrl ||
    ""
  );
}

export function ZiinaPayments() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] =
    useState<PaymentLink | null>(null);
  const [rate, setRate] = useState("");

  async function create(
    e: React.FormEvent<HTMLFormElement>,
  ) {
    e.preventDefault();

    // Capture the actual form before any await.
    const formElement = e.currentTarget;
    const form = new FormData(formElement);

    setBusy(true);
    setError("");
    setLink(null);

    try {
      await requireAdmin();

      const session =
        await db!.auth.getSession();

      const token =
        session.data.session?.access_token;

      if (!token) {
        throw new Error(
          "Please sign in again.",
        );
      }

      const amount = Number(
        form.get("amount") || 0,
      );

      const payload = {
        title: String(
          form.get("title") || "",
        ).trim(),

        description: String(
          form.get("description") || "",
        ).trim(),

        amount,

        currency: String(
          form.get("currency") || "AED",
        )
          .trim()
          .toUpperCase(),
      };

      if (!payload.title) {
        throw new Error(
          "Please enter a payment title.",
        );
      }

      if (
        !Number.isFinite(payload.amount) ||
        payload.amount <= 0
      ) {
        throw new Error(
          "Amount must be greater than 0.",
        );
      }

      if (
        !/^[A-Z]{3}$/.test(payload.currency)
      ) {
        throw new Error(
          "Currency must be a 3-letter code.",
        );
      }

      const response = await fetch(
        "/api/ziina/payment-links",
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify(payload),
        },
      );

      const body = await response
        .json()
        .catch(() => ({}));

      const remaining =
        response.headers.get(
          "X-RateLimit-Remaining",
        );

      const limit =
        response.headers.get(
          "X-RateLimit-Limit",
        );

      setRate(
        remaining && limit
          ? `${remaining} of ${limit} payment attempts left this minute`
          : "",
      );

      if (!response.ok) {
  const ziinaMessage =
    typeof data?.message === "string"
      ? data.message
      : "Ziina rejected the payment request.";

  const ziinaCode =
    typeof data?.code === "string"
      ? data.code
      : undefined;

  return json(res, response.status, {
    message: ziinaMessage,
    code: ziinaCode,
  });
}

      setLink(
        body.paymentLink || {},
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const href = link
    ? resolvedUrl(link)
    : "";

  return (
    <section>
      <div className="page-heading">
        <div>
          <span className="workspace-kicker">
            PAYMENTS
          </span>

          <h1>
            Ziina payment links
          </h1>

          <p>
            Create a hosted payment URL,
            then paste it into the related
            order.
          </p>
        </div>
      </div>

      <div className="ziina-layout">
        <section className="workspace-card ziina-form-card">
          <div className="card-heading">
            <div>
              <h2>
                New payment link
              </h2>

              <p>
                Configure URLs and the API
                key in env. The browser
                never receives your Ziina
                key.
              </p>
            </div>

            <CreditCard />
          </div>

          <form
            onSubmit={create}
            className="ziina-form"
          >
            {error && (
              <div
                className="workspace-error"
                role="alert"
              >
                {error}
              </div>
            )}

            {rate && (
              <p className="ziina-rate-note">
                {rate}
              </p>
            )}

            <Field label="Title *">
              <input
                className={inputClass}
                name="title"
                required
                placeholder="Custom plugin order"
              />
            </Field>

            <Field
              label="Amount *"
              hint="Entered as normal money, sent to Ziina in base units."
            >
              <input
                className={inputClass}
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="25.00"
              />
            </Field>

            <Field label="Currency">
              <input
                className={inputClass}
                name="currency"
                defaultValue="AED"
                maxLength={3}
              />
            </Field>

            <Field label="Description">
              <textarea
                className={inputClass}
                name="description"
                rows={5}
                placeholder="Short payment note for the customer."
              />
            </Field>

            <Button
              type="submit"
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="spin" />
              ) : (
                <CreditCard />
              )}

              {busy
                ? "Creating link..."
                : "Create payment link"}
            </Button>
          </form>
        </section>

        <aside className="workspace-card ziina-result-card">
          <div className="card-heading">
            <div>
              <h2>Result</h2>

              <p>
                Only non-secret Ziina
                response fields are shown
                here.
              </p>
            </div>

            <ShieldCheck />
          </div>

          {link ? (
            <div className="ziina-result">
              <span className="status-badge positive">
                <span />

                {link.status ||
                  "Created"}
              </span>

              {link.id && (
                <p>
                  <strong>
                    Payment link ID
                  </strong>

                  <code>
                    {link.id}
                  </code>
                </p>
              )}

              {href && (
                <p>
                  <strong>
                    Payment URL
                  </strong>

                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {href}

                    <ExternalLink />
                  </a>
                </p>
              )}

              {href && (
                <Button
                  type="button"
                  tone="paper"
                  onClick={() =>
                    void navigator.clipboard.writeText(
                      href,
                    )
                  }
                >
                  <Copy />

                  Copy payment URL
                </Button>
              )}
            </div>
          ) : (
            <div className="workspace-empty">
              <span>
                <CreditCard />
              </span>

              <h3>No link yet</h3>

              <p>
                Create a Ziina link and
                attach it to an order when
                it is ready.
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
