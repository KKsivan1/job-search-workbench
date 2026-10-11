"use client";

import { useEffect } from "react";
import { headingId } from "./markdown-view";

export function SectionJump({ title }: { title: string }) {
  useEffect(() => {
    const id = headingId(title);
    const timer = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 80);
    return () => window.clearTimeout(timer);
  }, [title]);
  return null;
}
