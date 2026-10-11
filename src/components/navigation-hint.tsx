"use client";

import { useLinkStatus } from "next/link";

/** Must be rendered inside Link so feedback tracks the actual transition. */
export function NavigationHint() {
  const { pending } = useLinkStatus();
  return pending ? <span className="navigation-hint" role="status">正在打开…</span> : null;
}
