// Whether the Meta Ad Library can be called yet. While the owner's Meta identity confirmation is in
// progress, META_AD_LIBRARY_ACCESS_TOKEN is missing or a placeholder (e.g. TEMP_WAITING_ON_META): every
// part of the Viral Demand Engine then says AD_DATA_PENDING instead of calling Meta or failing.

export const AD_DATA_PENDING = "Ad data pending Meta approval";

/** True for a missing token or an obvious placeholder; a real token is never sent anywhere while this holds. */
export function adLibraryTokenPending(token: string | null | undefined): boolean {
  const t = token?.trim() ?? "";
  return t === "" || /^(temp|placeholder|todo|changeme|change_me|pending|xxx|your)/i.test(t) || /waiting/i.test(t);
}
