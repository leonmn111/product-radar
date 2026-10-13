"use client";

import { useSyncExternalStore } from "react";
import { formatDateTime, formatRelative } from "./format";

const noSubscribe = () => () => {};

/**
 * "3 days ago", worked out in the browser. The server and the first (hydrating) render show the
 * fixed UTC date instead, because "now" differs between the two and React would reject the mismatch.
 */
export function RelativeTime({ iso, prefix = "" }: { iso: string; prefix?: string }) {
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  const absolute = formatDateTime(iso);
  return (
    <time dateTime={iso} title={absolute}>
      {prefix}
      {inBrowser ? formatRelative(iso) : absolute}
    </time>
  );
}
