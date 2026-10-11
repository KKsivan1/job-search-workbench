"use client";
import { useState } from "react";
import Link from "next/link";
import { api, useAsync, LoadingBlock, ErrorBlock } from "@/lib/data-provider";

export default function ApplicationTrash() {
  const { data, loading, error, reload } = useAsync(() => api.getArchivedApplications(), []);
  const [busy, setBusy] = useState(""); const [message, setMessage] = useState("");
  async function restore(id: string) {
    setBusy(id); setMessage("");
    try { await api.restoreApplication(id); reload(); setMessage("已恢复到投递看板，原备注与行动安排保留。"); }
    catch (e) { setMessage(e instanceof Error ? e.message : "恢复失败"); }
    finally { setBusy(""); }
  }
  if (loading && !data) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error || "加载失败"} onRetry={reload} />;
  return <div className="page-wrap"><Link href="/applications" className="back-link">← 返回投递看板</Link><div className="page-heading"><span className="eyebrow">APPLICATION RECYCLE BIN</span><h1>投递记录回收站</h1><p>删除只隐藏投递记录，不删除面试、复盘或公司招聘链接。恢复后沿用原有状态、日期、备注与下一步。</p></div>{message && <p role="status">{message}</p>}{data.length ? <div className="answer-grid">{data.map((a) => <section className="panel" key={a.id}><span className="eyebrow">{a.company}</span><h3>{a.role}</h3><p className="muted small">原状态：{a.status} · {a.next_action_date || "日期待定"}</p><p>{a.next_action || "暂无行动安排"}</p><button className="primary-button" disabled={Boolean(busy)} onClick={() => void restore(a.id)}>{busy === a.id ? "恢复中…" : "恢复投递记录"}</button></section>)}</div> : <div className="empty-state">回收站为空。重复记录可从投递编辑窗口移入这里。</div>}</div>;
}
