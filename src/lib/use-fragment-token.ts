"use client";

import { useSyncExternalStore } from "react";

let captured: string | null = null;

/**
 * Read `#token=...` from the URL once, then remove it from the address bar and history so it is
 * not left on screen, in bookmarks, or in shared links. Fragments are never sent to the server.
 */
function readTokenFromFragment(): string {
  if (captured === null) {
    const match = /(?:^|&)token=([A-Za-z0-9_-]{20,100})/.exec(window.location.hash.slice(1));
    captured = match?.[1] ?? "";
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }
  return captured;
}

const subscribe = () => () => {};

/** null during server render; "" when the link has no valid token. */
export function useFragmentToken(): string | null {
  return useSyncExternalStore(subscribe, readTokenFromFragment, () => null);
}
