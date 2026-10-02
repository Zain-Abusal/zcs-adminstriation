import { useEffect, useRef, useState } from "react";
import { Button, Field, inputClass } from "@/components/kit";
import { useAccess } from "./access";
import { emailRequest } from "./email-client";
import { errorMessage } from "./feedback";
import "./emails.css";
import { emailTemplates, renderEmailTemplate } from "./email-templates";
type Audience = "dashboard";
type Settings = {
  enabled: boolean;
  news: boolean;
  blog: boolean;
  product: boolean;
  sale: boolean;
  audience: Audience;
};
type Job = {
  id: string;
  kind: string;
  subject: string;
  audience: Audience;
  status: string;
  available_at: string;
  created_at: string;
  provider_id: string | null;
  last_error: string | null;
  attempts: number;
};
type Configuration = {
  ready: boolean;
  transport?: "smtp";
  missing: string[];
  sender: string;
  subscriberSource: "newsletter_subscribers";
};
const defaults: Settings = {
  enabled: false,
  news: true,
  blog: true,
  product: true,
  sale: true,
  audience: "dashboard",
};
function Preview({ content, format }: { content: string; format: "html" | "text" }) {
  return format === "html" ? (
    <iframe
      title="Email preview"
      className="email-preview"
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><style>body{font-family:Arial,sans-serif;line-height:1.6;padding:20px;overflow-wrap:anywhere}</style>${content}`}
    />
  ) : (
    <pre className="email-preview email-text-preview">
      {content || "Your email preview will appear here."}
    </pre>
  );
}
export function Emails() {
  const access = useAccess(),
    canEdit = access.can("emails", "edit"),
    canManage = access.can("emails", "manage");
  const [config, setConfig] = useState<Configuration | null>(null),
    [settings, setSettings] = useState<Settings>(defaults);
  const [jobs, setJobs] = useState<Job[]>([]),
    [queued, setQueued] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [subject, setSubject] = useState(""),
    [content, setContent] = useState(""),
    [format, setFormat] = useState<"html" | "text">("text");
  const [templateId, setTemplateId] = useState<string>("announcement");
  const template = emailTemplates.find(t => t.id === templateId)!;
  const [templateFields, setTemplateFields] = useState({ title: template.title as string, content: template.content as string, action: template.action as string, url: "https://www.zcraftstudios.com" + template.path });
  const [templateSubject, setTemplateSubject] = useState<string>(template.subject);
  function selectTemplate(id: string) {
    const selected = emailTemplates.find(t => t.id === id)!;
    setTemplateId(id);
    setTemplateSubject(selected.subject);
    setTemplateFields({ title: selected.title, content: selected.content, action: selected.action, url: "https://www.zcraftstudios.com" + selected.path });
  }
  function applyTemplate() {
    try {
      const html = renderEmailTemplate(template, templateFields);
      if ((subject.trim() || content.trim()) && !window.confirm("Replace your current draft with this template?")) return;
      setSubject(templateSubject);
      setContent(html);
      setFormat("html");
      change();
      setError("");
      setNotice("Template applied. Review your details and send a test before sending to subscribers.");
    } catch (e) { setError(errorMessage(e)); }
  }
  const [status, setStatus] = useState("all"),
    [review, setReview] = useState(false);
  const reviewTitle = useRef<HTMLHeadingElement>(null);
  const reviewDialog = useRef<HTMLDialogElement>(null),
    requestKey = useRef(crypto.randomUUID());
  async function load() {
    setLoading(true);
    try {
      const result = await emailRequest();
      setConfig(result.configuration);
      setSettings({ ...result.settings, audience: "dashboard" });
      setJobs(result.jobs);
      setQueued(result.queued);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (review) {
      reviewDialog.current?.showModal();
      reviewTitle.current?.focus({ preventScroll: true });
      if (reviewDialog.current) reviewDialog.current.scrollTop = 0;
    } else reviewDialog.current?.close();
  }, [review]);
  async function run(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await emailRequest(body);
      if (result.error) {
        await load();
        throw new Error(result.error);
      }
      setNotice(
        result.status === "submitted"
          ? "Email submitted to your SMTP provider."
          : result.message || "Request completed.",
      );
      if (body.action === "manual") {
        setReview(false);
      }
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const message = { subject, content, format, audience: "dashboard" };
  const valid = !!subject.trim() && subject.length <= 200 && !!content.trim();
  const visible = jobs.filter((j) => status === "all" || j.status === status);
  const change = () => {
    requestKey.current = crypto.randomUUID();
  };
  return (
    <section className="emails-page">
      <div className="page-heading">
        <div>
          <span className="workspace-kicker">COMMUNITY / EMAIL</span>
          <h1>Email studio</h1>
          <p>
            Send announcements and custom emails to your active newsletter subscribers.
          </p>
        </div>
        <Button type="button" tone="paper" disabled={loading || busy} onClick={() => void load()}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {error && (
        <p className="workspace-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="email-notice" role="status">
          {notice}
        </p>
      )}
      <div className="email-overview">
        <div>
          <small>Sender</small>
          <strong>{config?.sender || "Not configured"}</strong>
        </div>
        <div>
          <small>Automatic announcements</small>
          <strong>{settings.enabled ? "Enabled" : "Paused"}</strong>
        </div>
        <div>
          <small>Waiting in queue</small>
          <strong>{queued}</strong>
        </div>
      </div>
      {config && !config.ready && (
        <div className="workspace-card email-setup">
          <h2>Connect SMTP</h2>
          <p>Add these server environment variables, then refresh:</p>
          <code>{config.missing.join(", ")}</code>
          <p>
            Use a verified sender. You can reuse the SMTP host, port, username and password configured in Supabase Auth. Subscribers come from your Supabase newsletter_subscribers table. {" "}
            Credentials stay on the server.
          </p>
        </div>
      )}
      <div className="email-layout">
        <section className="workspace-card email-compose">
          <div>
            <h2>Compose an email</h2>
            <p>Write your email, then review it before sending to active newsletter subscribers.</p>
          </div>
          <details className="email-template-picker" open>
            <summary>Start with a studio template</summary>
            <p>Styled to match the storefront. Choose a layout, personalize it, then apply it to your draft.</p>
            <div className="email-template-options" role="group" aria-label="Email templates">
              {emailTemplates.map(t => <button type="button" key={t.id} aria-pressed={templateId === t.id} disabled={!canEdit || busy} onClick={() => selectTemplate(t.id)}>
                <span className="email-template-swatch" style={{ background: t.color }} />
                <strong>{t.label}</strong><small>{t.description}</small>
              </button>)}
            </div>
            <div className="email-template-fields">
              <Field label="Template subject"><input className={inputClass} value={templateSubject} maxLength={200} disabled={!canEdit || busy} onChange={e => setTemplateSubject(e.target.value)} /></Field>
              <Field label="Headline"><input className={inputClass} value={templateFields.title} disabled={!canEdit || busy} onChange={e => setTemplateFields({ ...templateFields, title: e.target.value })} /></Field>
              <Field label="Message"><textarea className={inputClass} rows={6} value={templateFields.content} disabled={!canEdit || busy} onChange={e => setTemplateFields({ ...templateFields, content: e.target.value })} /></Field>
              <div className="email-form-row">
                <Field label="Button text"><input className={inputClass} value={templateFields.action} disabled={!canEdit || busy} onChange={e => setTemplateFields({ ...templateFields, action: e.target.value })} /></Field>
                <Field label="Button link"><input type="url" className={inputClass} value={templateFields.url} disabled={!canEdit || busy} onChange={e => setTemplateFields({ ...templateFields, url: e.target.value })} /></Field>
              </div>
              <Button type="button" tone="paper" disabled={!canEdit || busy || !templateSubject.trim() || !templateFields.title.trim() || !templateFields.content.trim() || !templateFields.action.trim()} onClick={applyTemplate}>Use {template.label.toLowerCase()} template</Button>
            </div>
          </details>
          <Field label="Subject">
            <input
              className={inputClass}
              value={subject}
              maxLength={200}
              disabled={!canEdit || busy}
              onChange={(e) => {
                setSubject(e.target.value);
                change();
              }}
              placeholder="What’s new at ZCraft Studios?"
            />
          </Field>
          <div className="email-form-row">
            <Field label="Recipients" hint="Supabase newsletter_subscribers · active subscribers only">
              <p>Newsletter subscribers</p>
            </Field>
            <Field label="Content format">
              <select
                className={inputClass}
                value={format}
                disabled={!canEdit || busy}
                onChange={(e) => {
                  setFormat(e.target.value as "html" | "text");
                  change();
                }}
              >
                <option value="text">Text</option>
                <option value="html">HTML</option>
              </select>
            </Field>
          </div>
          <Field
            label={format === "html" ? "HTML content" : "Email content"}
            hint={
              format === "html"
                ? "Paste your email HTML. Preview blocks scripts and external images."
                : "Text is preserved; SMTP also sends a plain-text version."
            }
          >
            <textarea
              className={inputClass}
              rows={12}
              value={content}
              disabled={!canEdit || busy}
              onChange={(e) => {
                setContent(e.target.value);
                change();
              }}
              placeholder={
                format === "html"
                  ? "<h1>Hello from ZCraft Studios</h1>\n<p>Your message here…</p>"
                  : "Write your message…"
              }
            />
          </Field>
          <div className="email-compose-actions">
            <Button
              type="button"
              tone="paper"
              disabled={!canEdit || !config?.ready || !valid || busy}
              onClick={() => void run({ action: "test", ...message })}
            >
              Send test to me
            </Button>
            <Button
              type="button"
              disabled={!canManage || !config?.ready || !valid || busy}
              onClick={() => setReview(true)}
            >
              Review & send
            </Button>
          </div>
          {!canManage && (
            <p className="readonly-label">
              Manage access is required to send audience campaigns or change automation.
            </p>
          )}
          <details className="email-preview-disclosure">
            <summary>Preview email</summary>
            <Preview content={content} format={format} />
          </details>
        </section>
        <section className="workspace-card email-automation">
          <h2>Automatic announcements</h2>
          <p>
            Send once when a news item, blog post, or product becomes published, or a sale becomes
            active. Saving an existing published item does not resend it.
          </p>
          <label className="email-toggle">
            <input
              type="checkbox"
              disabled={!canManage || busy}
              checked={settings.enabled}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            />
            <strong>Enable automatic email</strong>
          </label>
          <p>Recipients: active newsletter subscribers from Supabase.</p>
          {(["news", "blog", "product", "sale"] as const).map((kind) => (
            <label className="email-toggle" key={kind}>
              <input
                type="checkbox"
                disabled={!canManage || busy}
                checked={settings[kind]}
                onChange={(e) => setSettings({ ...settings, [kind]: e.target.checked })}
              />
              {
                {
                  news: "News & updates",
                  blog: "Blog posts",
                  product: "New products",
                  sale: "Sales & offers",
                }[kind]
              }
            </label>
          ))}
          <Button
            type="button"
            disabled={!canManage || busy || loading}
            onClick={() => void run({ action: "settings", settings })}
          >
            Save automation
          </Button>
          <p className="readonly-label">
            Announcements begin after you enable automation. Existing content is not backfilled.
            Scheduled content waits until its publish/start time.
          </p>
          <p className="readonly-label">
            Unsubscribe replies must be processed by deactivating the subscriber. {" "}
            A queue worker is needed for scheduled delivery and unattended retries; see README
            setup.
          </p>
        </section>
      </div>
      <section className="workspace-card email-history">
        <div className="email-history-heading">
          <div>
            <h2>Announcement queue & history</h2>
            <p>
              “Submitted” means your email provider accepted the message. Check your provider for
              delivery results.
            </p>
          </div>
          <div className="email-compose-actions">
            <select
              className={inputClass}
              aria-label="Filter email status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {["all", "queued", "processing", "submitted", "failed", "uncertain", "cancelled"].map(
                (s) => (
                  <option key={s} value={s}>
                    {s === "all" ? "All statuses" : s[0].toUpperCase() + s.slice(1)}
                  </option>
                ),
              )}
            </select>
            <Button
              type="button"
              tone="paper"
              disabled={!canManage || busy || !config?.ready || !queued}
              onClick={() => void run({ action: "process" })}
            >
              {busy ? "Working…" : "Process next email"}
            </Button>
          </div>
        </div>
        {loading && !jobs.length ? (
          <p className="email-empty" role="status">
            Loading email history…
          </p>
        ) : visible.length ? (
          <div className="collection-table-scroll">
            <table className="collection-table">
              <thead>
                <tr>
                  <th>Email</th>

                  <th>Status</th>
                  <th>Scheduled</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <strong>{job.subject}</strong>
                      <small className="email-job-meta">
                        {job.kind} · {new Date(job.created_at).toLocaleString()}
                      </small>
                      {job.provider_id && (
                        <small className="email-job-meta">Provider ID: {job.provider_id}</small>
                      )}
                      {job.last_error && <p className="email-job-error">{job.last_error}</p>}
                    </td>
                    <td>
                      <span className={`email-status email-status-${job.status}`}>
                        {job.status}
                      </span>
                    </td>
                    <td>{new Date(job.available_at).toLocaleString()}</td>
                    <td>
                      <div className="email-job-actions">
                        {canManage && job.status === "failed" && (
                          <button
                            disabled={busy}
                            onClick={() => void run({ action: "retry", id: job.id })}
                          >
                            Queue retry
                          </button>
                        )}
                        {canManage && job.status === "uncertain" && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              const providerId = window.prompt(
                                "Check your provider for the SMTP message for job " +
                                  job.id +
                                  ". If it exists, enter its SMTP Message-ID (including angle brackets) to mark this job as submitted.",
                              );
                              if (providerId)
                                void run({ action: "reconcile", id: job.id, providerId });
                            }}
                          >
                            Mark submitted
                          </button>
                        )}
                        {canManage && ["queued", "failed", "uncertain"].includes(job.status) && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Cancel this queued job? This cannot recall a message already accepted by the provider.",
                                )
                              )
                                void run({ action: "cancel", id: job.id });
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="email-empty">
            {status === "all"
              ? "No campaigns yet. Send a manual email or enable automatic announcements."
              : "No emails match this status."}
          </p>
        )}
      </section>
      <dialog
        ref={reviewDialog}
        className="email-review"
        aria-labelledby="email-review-title"
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) setReview(false);
        }}
      >
        <h2 id="email-review-title" ref={reviewTitle} tabIndex={-1}>
          Review your email
        </h2>
        {error && (
          <p className="workspace-error" role="alert">
            {error}
          </p>
        )}
        <p>
          <strong>{subject}</strong>
        </p>
        <p>
          Newsletter subscribers · From {config?.sender}
        </p>
        <Preview content={content} format={format} />
        <p>
          This submits your email to the active newsletter subscribers. Your provider applies its account and
          delivery rules.
        </p>
        <div className="email-compose-actions">
          <Button type="button" tone="paper" disabled={busy} onClick={() => setReview(false)}>
            Keep editing
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void run({ action: "manual", requestKey: requestKey.current, ...message })
            }
          >
            {busy ? "Submitting…" : "Send email"}
          </Button>
        </div>
      </dialog>
    </section>
  );
}
