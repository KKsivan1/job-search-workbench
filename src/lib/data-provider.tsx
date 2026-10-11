"use client";

import { useEffect, useRef, useState } from "react";
import type { DataApi } from "./core";
import { api as entryApi } from "./api-entry";

export const api: DataApi = entryApi;
export const isCloud = entryApi.mode === "cloud";

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });
  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(() => {
        setLoading(true);
        setError("");
        return fnRef.current();
      })
      .then((result) => { if (alive) { setData(result); setLoading(false); } })
      .catch((reason) => { if (alive) { setError(reason instanceof Error ? reason.message : "加载失败"); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);
  return { data, error, loading, reload: () => setNonce((value) => value + 1) };
}

export function LoadingBlock({ label = "加载中…" }: { label?: string }) {
  return <div className="page-wrap"><div className="empty-inline">{label}</div></div>;
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="page-wrap"><div className="empty-state">
    <p>{message}</p>
    {onRetry && <button className="text-button" onClick={onRetry}>重试</button>}
  </div></div>;
}
