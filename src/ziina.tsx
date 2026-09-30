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
  amount?: number;
  currency?: string;
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

    /*
     * IMPORTANT:
     * Capture FormData before any await.
     * Otherwise React's currentTarget may no longer
     * reference the form after an async operation.
     */
    const form = new FormData(e.currentTarget);

    setBusy(true);
    setError("");
    setLink(null);

    try {
      const title = String(
        form.get("title") || "",
      ).trim();

      const description = String(
        form.get("description") || "",
      ).trim();

      const amount = Number(
        form.get("amount") || 0,
      );

      const currency = String(
        form.get("currency") || "AED",
      )
        .trim()
        .toUpperCase();

      if (!title) {
        throw new Error(
          "Please enter a payment title.",
        );
      }

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        throw new Error(
          "Amount must be greater than 0.",
        );
      }

      if (!/^[A-Z]{3}$/.test(currency)) {
        throw new Error(
          "Currency must be a valid 3-letter code.",
        );
      }

      await requireAdmin();

      const session =
        await db!.auth.getSession();

      const token =
        session.data.session?.access_token;

      if (!token) {
        throw new Error(
          "Your session expired. Please sign in again.",
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

          body: JSON.stringify({
            title,
            description,
            amount,
            currency,
          }),
        },
      );

      const body = await response
        .json()
        .catch(() => ({
          message:
            "The server returned an invalid response.",
        }));

      const remaining =
        response.headers.get(
          "X-RateLimit-Remaining",
        );

      const limit =
        response.headers.get(
          "X-RateLimit-Limit",
        );

      if (remaining && limit) {
        setRate(
          `${remaining} of ${limit} payment attempts left this minute`,
        );
      } else {
        setRate("");
      }

      if (!response.ok) {
        let message =
          body?.message ||
          "Ziina rejected the payment request.";

        if (body?.code) {
          message += ` (${body.code})`;
        }

        throw new Error(message);
      }

      if (!body?.paymentLink) {
        throw new Error(
          "Ziina returned a successful response but no payment link was provided.",
        );
      }

      setLink(body.paymentLink);
    } catch (err) {
      setError(errorMessage(err));
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
                Create a secure hosted
                checkout through Ziina.
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
              hint="Enter the normal amount, for example 4.99."
            >
              <input
                className={inputClass}
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                inputMode="decimal"
                placeholder="4.99"
              />
            </Field>

            <Field
              label="Currency"
              hint="For example AED or USD."
            >
              <input
                className={inputClass}
                name="currency"
                defaultValue="AED"
                maxLength={3}
                required
                autoCapitalize="characters"
              />
            </Field>

            <Field label="Description">
              <textarea
                className={inputClass}
                name="description"
                rows={5}
                maxLength={500}
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
                Your generated payment link
                will appear here.
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
                    Payment ID
                  </strong>

                  <code>{link.id}</code>
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
                Create a Ziina payment link
                and it will appear here.
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
