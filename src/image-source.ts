/** Absolute external image links remain unchanged; never prefix them with storage. */
export function imageSource(value: string, siteUrl: string, storageUrl?: string): string | null {
  const text = value.trim();
  if (!text) return null;
  try {
    const url = /^https?:\/\//i.test(text)
      ? new URL(text)
      : text.startsWith("//")
        ? new URL("https:" + text)
        : new URL(text, storageUrl || siteUrl);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}
export function isImageField(name: string) {
  return ["cover_image_url", "cover_image_path", "avatar_url", "url"].includes(name);
}
