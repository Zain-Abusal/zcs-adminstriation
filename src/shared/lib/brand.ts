export const BRAND = {
  name: "ZCraft Studios",
  nameLead: "ZCraft",
  nameTail: "Studios",
  tagline: "Premium Minecraft resources and finished tools. Bought once, yours for good.",
  blurb: "A small studio making Minecraft configs, plugins, and tidy finished tools.",
  email: "Support@zcraftstudios.com",
  discord: "https://dsc.gg/zcraftstudios",
  discordLabel: "dsc.gg/zcraftstudios",
} as const;

/**
 * Public social profiles.
 *
 * Each URL is optional. Leave a value as an empty string until the real
 * account exists — the footer and the Organization schema will automatically
 * skip missing profiles (no dead links, no fake profiles). Fill these in when
 * the ZCraft Studios accounts are live:
 *
 *   facebook: "https://www.facebook.com/…"
 *   x:        "https://x.com/…"
 *   youtube:  "https://www.youtube.com/@…"
 *   instagram: "https://www.instagram.com/…"
 */
export const SOCIAL: { facebook: string; x: string; youtube: string; instagram: string } = {
  facebook: "",
  x: "https://x.com/ZCraftNetwork",
  youtube: "https://www.youtube.com/@zcraft_studios",
  instagram: "https://www.instagram.com/ZCraftStudios",
};

export function socialUrls(): string[] {
  return [BRAND.discord, SOCIAL.facebook, SOCIAL.x, SOCIAL.youtube, SOCIAL.instagram].filter(
    (url) => url.length > 0,
  );
}

/**
 * Hosting partner credit shown as a small pill in the footer.
 *
 * To swap in the real artwork: drop the file in `public/` as
 * `paper-nodes-logo.svg` (or .png / .webp) and update `logo` below to match.
 * See `docs/PAPER-NODES.md` for the full checklist. If the file is missing the
 * pill still renders — the logo just falls back to a dot.
 */
export const HOSTING = {
  name: "Paper Nodes",
  label: "PaperNodes - Game server hosting",
  url: "https://billing.papernodes.com/aff/zcs",
  logo: "/papernodes.png",
} as const;
