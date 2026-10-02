import nodemailer from "nodemailer";
import { escapeHtml } from "./email-content.mjs";
export function smtpSender(env) {
  return env.SMTP_FROM || "";
}
export function smtpOptions(env) {
  const port = Number(env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Set a valid SMTP_PORT.");
  return {
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  };
}
export function createSmtp(env, makeTransport = nodemailer.createTransport) {
  async function send(message, recipients, id, isTest = false) {
    const limit = Number(env.SMTP_RECIPIENT_LIMIT || 100);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
      throw new Error("Set SMTP_RECIPIENT_LIMIT between 1 and 1000.");
    if (!recipients.length) throw new Error("No eligible subscribers in the selected audience.");
    if (recipients.length > limit)
      throw new Error(
        `This audience has ${recipients.length} contacts, exceeding the SMTP limit of ${limit}. Increase SMTP_RECIPIENT_LIMIT within your provider’s recipient limit.`,
      );
    const from = smtpSender(env),
      transport = makeTransport(smtpOptions(env));
    const footer = `To unsubscribe from studio updates, reply to ${from} with the subject Unsubscribe.`;
    let html = message.html;
    if (!isTest) {
      const markup = `<p style="font-family:Arial,sans-serif;font-size:12px;color:#666">${escapeHtml(footer)}</p>`;
      html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, markup + "</body>") : html + markup;
    }
    try {
      const result = await transport.sendMail({
        from: {
          name: env.SMTP_FROM_NAME || "ZCraft Studios",
          address: from,
        },
        to: from,
        bcc: recipients,
        envelope: { from, to: recipients },
        subject: isTest ? `[Test] ${message.subject}` : message.subject,
        html,
        text: (message.text || "") + (!isTest ? `\n\n${footer}` : ""),
        replyTo: from,
        ...(!isTest
          ? {
              messageId: `<zcraft-${id}@${from.split("@")[1]}>`,
              list: {
                unsubscribe: {
                  url: `mailto:${from}?subject=Unsubscribe`,
                  comment: "Unsubscribe from studio updates",
                },
              },
            }
          : {}),
      });
      if (!result.accepted?.length || result.rejected?.length) {
        const error = new Error(
          result.accepted?.length
            ? "SMTP accepted only part of the audience. Review the provider before resending."
            : "SMTP rejected the audience.",
        );
        error.ambiguous = !!result.accepted?.length;
        throw error;
      }
      return result.messageId;
    } catch (error) {
      if (error.ambiguous === undefined)
        error.ambiguous =
          !["EAUTH", "EDNS", "ECONNECTION", "ETLS"].includes(error.code) &&
          !(error.responseCode >= 400 && error.responseCode < 600);
      // Do not expose credentials or raw SMTP responses in the dashboard.
      const safe = new Error(
        error.ambiguous
          ? "SMTP delivery is uncertain. Review the provider before resending."
          : `SMTP submission failed${error.responseCode ? ` (${error.responseCode})` : ""}. Check credentials, sender and provider limits.`,
      );
      safe.ambiguous = error.ambiguous;
      throw safe;
    } finally {
      transport.close?.();
    }
  }
  return {
    campaign: (message, recipients, id) => send(message, recipients, id),
    test: (message, recipient) => send(message, [recipient], null, true),
  };
}
