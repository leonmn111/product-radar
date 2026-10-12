/** Only same-site paths may be used as the post-sign-in destination. */
export function safeCallback(raw: unknown) {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : "/";
}
