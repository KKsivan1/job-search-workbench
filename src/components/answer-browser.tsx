"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pin, Search } from "lucide-react";
import { api, useAsync } from "@/lib/data-provider";
import { DEFAULT_PINNED } from "@/lib/core";

type AnswerCard = { id: string; title: string; category: string; description: string; sectionTitles: string[]; searchText: string };

export function AnswerBrowser({ documents }: { documents: AnswerCard[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部分类");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const { data: pins, error, reload } = useAsync(() => api.getAnswerPins(), []);
  const isPinned = (id: string) => pins?.[id] ?? DEFAULT_PINNED.includes(id);
  const filtered = useMemo(() => documents.filter((doc) => (category === "全部分类" || doc.category === category) && `${doc.title} ${doc.category} ${doc.description} ${doc.searchText}`.toLowerCase().includes(query.toLowerCase())), [documents, category, query]);
  async function toggle(id: string) {
    setBusy(id); setMessage("");
    try { await api.setAnswerPin(id, !isPinned(id)); reload(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "置顶保存失败"); }
    finally { setBusy(""); }
  }
  const cards = (items: AnswerCard[]) => <div className="answer-grid">{items.map((doc) => <article className="answer-card pinned-card" key={doc.id}><button aria-label={`${isPinned(doc.id) ? "取消置顶" : "置顶"}：${doc.title}`} aria-pressed={isPinned(doc.id)} className={`pin-button ${isPinned(doc.id) ? "active" : ""}`} disabled={Boolean(busy) || !pins} onClick={() => void toggle(doc.id)}><Pin size={16} /></button><Link href={`/answers?doc=${encodeURIComponent(doc.id)}`}><span className="eyebrow">{doc.category}</span><h3>{doc.title}</h3><p>{doc.description}</p><div className="answer-card-foot">{doc.sectionTitles.length} 个章节 <span>进入阅读 →</span></div></Link></article>)}</div>;
  return <><div className="toolbar"><label className="searchbox wide"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索自我介绍、项目、产品思维或 AI 知识点" /></label><label className="selectbox"><select aria-label="回答库分类" value={category} onChange={(e) => setCategory(e.target.value)}><option>全部分类</option>{[...new Set(documents.map((d) => d.category))].map((c) => <option key={c}>{c}</option>)}</select></label></div>
    {(error || message) && <p role="alert" className="form-error">{error || message}</p>}
    <p className="muted small">收录 {documents.length} 篇 · 点击图钉可置顶或取消。「高频口述稿」与「22 问」为同一篇，不重复收录。</p>
    {filtered.some((d) => isPinned(d.id)) && <><h2 className="library-heading">置顶 · 优先复习</h2>{cards(filtered.filter((d) => isPinned(d.id)))}</>}
    <h2 className="library-heading">全部知识与回答</h2>{cards(filtered.filter((d) => !isPinned(d.id)))}
    {!filtered.length && <div className="empty-state">没有找到相关回答。</div>}
  </>;
}
