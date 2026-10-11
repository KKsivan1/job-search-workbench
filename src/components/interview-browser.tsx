"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { api } from "@/lib/data-provider";
import type { Interview } from "@/lib/core";
import { NavigationHint } from "./navigation-hint";

function NewInterviewForm({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const id = await api.createInterview({
        date: String(data.get("date") || ""),
        company: String(data.get("company") || ""),
        role: String(data.get("role") || ""),
        round: String(data.get("round") || ""),
        questions: String(data.get("questions") || ""),
        optimization: String(data.get("optimization") || ""),
      });
      onChanged();
      router.push(`/interviews/view?id=${encodeURIComponent(id)}`);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "创建失败，请检查输入后重试");
    } finally { setSaving(false); }
  }
  return <form className="application-form" onSubmit={submit}>
    <div className="form-head"><strong>新增面试记录</strong><button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><X size={17} /></button></div>
    <p className="muted small">保存后会在 Wiki 的面试复盘目录生成一篇可继续编辑的记录，并在投递看板添加对应岗位（状态为待确认）。</p>
    <div className="form-grid"><label>面试日期<input name="date" type="date" defaultValue={new Date().toLocaleDateString("sv-SE")} required /></label><label>公司<input name="company" placeholder="公司名称" required /></label></div>
    <div className="form-grid"><label>岗位<input name="role" placeholder="例如：AI 产品经理" required /></label><label>轮次<input name="round" placeholder="例如：一面 / HR 面" required /></label></div>
    <label>现场问题与原有回答<textarea name="questions" rows={5} placeholder="先记事实：面试官问了什么、你当时怎样回答。也可以创建后再补充。" /></label>
    <label>本场最需要优化的点<textarea name="optimization" rows={3} placeholder="一句话概括，后续可在复盘正文中展开。" /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary-button" type="submit" disabled={saving}><Plus size={15} />{saving ? "创建中…" : "创建面试记录"}</button>
  </form>;
}

export function InterviewBrowser({ interviews, questionIndex, onChanged }: { interviews: Interview[]; questionIndex: Record<string, string>; onChanged: () => void }) {
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("全部公司");
  const [sort, setSort] = useState("latest");
  const [creating, setCreating] = useState(false);
  const companies = ["全部公司", ...new Set(interviews.map((item) => item.company))];
  const visible = useMemo(() => interviews.filter((item) => (company === "全部公司" || item.company === company) && `${item.company} ${item.role} ${item.round} ${item.optimization} ${questionIndex[item.id] || ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === "latest" ? b.date.localeCompare(a.date) || b.id.localeCompare(a.id) : a.date.localeCompare(b.date) || a.id.localeCompare(b.id)), [interviews, company, sort, query, questionIndex]);
  return <>
    <div className="toolbar interview-toolbar"><label className="searchbox"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司、岗位、问题或优化点" /></label><label className="selectbox"><SlidersHorizontal size={16} /><select aria-label="按公司筛选" value={company} onChange={(event) => setCompany(event.target.value)}>{companies.map((item) => <option key={item}>{item}</option>)}</select></label><label className="selectbox"><select aria-label="面试排序" value={sort} onChange={(event) => setSort(event.target.value)}><option value="latest">最近优先</option><option value="oldest">最早优先</option></select></label><button className="primary-button" onClick={() => setCreating(true)}><Plus size={16} />新增面试</button></div>
    <div className="results-count">显示 {visible.length} / {interviews.length} 场面试</div>
    <div className="interview-list">{visible.map((item) => <Link href={`/interviews/view?id=${encodeURIComponent(item.id)}`} className="interview-row" key={item.id}>
      <div className="interview-seq">{item.id.startsWith("m-") ? "+" : item.id}</div><div className="interview-date">{item.date}</div><div className="interview-main"><strong>{item.company}</strong><span>{item.role} · {item.round}{item.confidence === "手动录入" ? " · 新建记录" : ""}</span><NavigationHint /></div><div className="interview-improve">{item.optimization}</div><ArrowUpRight size={18} className="row-arrow" />
    </Link>)}</div>
    {!visible.length && <div className="empty-state">没有找到匹配的面试。<button className="text-button" onClick={() => { setQuery(""); setCompany("全部公司"); }}>清除筛选</button></div>}
    {creating && <div className="modal-backdrop" onClick={() => setCreating(false)}><div className="modal-card" onClick={(event) => event.stopPropagation()}><NewInterviewForm onClose={() => setCreating(false)} onChanged={onChanged} /></div></div>}
  </>;
}
