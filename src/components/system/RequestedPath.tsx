"use client";

import { useSyncExternalStore } from "react";

const noSubscription = () => () => {};

// Shows "/café" rather than "/caf%C3%A9"; a malformed address is shown as it came.
const readablePath = () => {
  try {
    return decodeURI(location.pathname);
  } catch {
    return location.pathname;
  }
};

/**
 * The address the visitor asked for, read in the browser. The 404 page is prerendered once for
 * every missing address, so the server renders nothing here and the browser fills it in.
 */
export function RequestedPath() {
  const path = useSyncExternalStore(noSubscription, readablePath, () => null);
  return <>{path}</>;
}
