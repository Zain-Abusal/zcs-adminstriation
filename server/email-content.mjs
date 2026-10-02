export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );
export function emailHtml(content, format) {
  if (format === "html") return content;
  return `<div style="font-family:Arial,sans-serif;white-space:pre-wrap;line-height:1.6">${escapeHtml(content)}</div>`;
}
export function announcement(kind, row, siteUrl = "https://www.zcraftstudios.com") {
  const title = row.title || row.label || "Studio update";
  const path = ["product", "discount"].includes(kind)
    ? `/products/${encodeURIComponent(row.slug)}`
    : kind === "blog"
      ? `/blog/${encodeURIComponent(row.slug)}`
      : kind === "news"
        ? "/news"
        : "/products";
  const url = new URL(path, siteUrl).toString();
  const summary = ["sale", "discount"].includes(kind)
    ? `Save ${Number(row.default_discount_percent || row.discount_percent) || 0}% in ${title}.`
    : String(row.summary || row.excerpt || "").slice(0, 2000);
  const text = `${title}\n\n${summary}\n\nView on ZCraft Studios: ${url}`;
  return {
    subject: title.slice(0, 200),
    text,
    html: `<div style="max-width:600px;margin:auto;padding:32px;font-family:Arial,sans-serif;line-height:1.6;color:#21392e"><p style="font-size:12px;letter-spacing:2px">ZCRAFT STUDIOS</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(summary).replace(/\n/g, "<br>")}</p><p><a href="${escapeHtml(url)}" style="color:#287451">View on ZCraft Studios →</a></p></div>`,
  };
}
