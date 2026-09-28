export const SITE_NAME = "ZCraft Studios";
export const SITE_URL = "https://www.zcraftstudios.com";

export const SITE_DESCRIPTION =
  "Minecraft plugins, server configs and tools from ZCraft Studios. Browse product details, supported platforms and setup guides.";

export function absoluteUrl(path = "/") {
  return new URL(path.startsWith("/") ? path : `/${path}`, SITE_URL).toString();
}
