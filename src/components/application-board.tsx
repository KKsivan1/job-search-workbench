"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CalendarDays, ExternalLink, Plus, Save, X, Trash2 } from "lucide-react";
import { api } from "@/lib/data-provider";
import { STATUSES, type Application, type CompanySite } from "@/lib/types";

const empty: Pick<Application, "id" | "company" | "role" | "status" | "applied_at" | "next_action" | "next_action_date" | "notes"> = { id: "new", company: "", role: "", status: "待确认", applied_at: "", next_action: "", next_action_date: "", notes: "" };

function ApplicationForm({ application, site, onClose, onChanged }: { application: typeof empty; site?: CompanySite; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    if (!window.confirm(`将「${application.company} · ${application.role}」移入回收站？\n原投递备注会保留，面试记录和 Wiki 复盘不会删除。未保存的编辑不会写入。`)) return;
    setBusy(true); setError("");
    try { await api.archiveApplication(application.id); onChanged(); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "删除失败"); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      await api.saveApplication({
        id: application.id,
        company: String(data.get("company") || ""),
        role: String(data.get("role") || ""),
        status: String(data.get("status") || "待确认") as Application["status"],
        applied_at: String(data.get("applied_at") || ""),
        next_action: String(data.get("next_action") || ""),
        next_action_date: String(data.get("next_action_date") || ""),
        notes: String(data.get("notes") || ""),
        career_url: String(data.get("career_url") || ""),
      });
      onChanged(); onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败，请重试");
    } finally { setBusy(false); }
  }
  return <form className="application-form" onSubmit={submit}>
    <input type="hidden" name="id" value={application.id} />
    <div className="form-head"><strong>{application.id === "new" ? "新增投递" : "更新岗位进度"}</strong><button type="button" className="icon-button" onClick={onClose} aria-label="关闭"><X size={16} /></button></div>
    <div className="form-grid"><label>公司<input name="company" defaultValue={application.company} readOnly={application.id !== "new"} required /></label><label>岗位<input name="role" defaultValue={application.role} readOnly={application.id !== "new"} required /></label></div>
    <div className="form-grid"><label>当前阶段<select name="status" defaultValue={application.status}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label><label>投递日期<input type="date" name="applied_at" defaultValue={application.applied_at} /></label></div>
    <div className="form-grid"><label>下一步<input name="next_action" defaultValue={application.next_action} placeholder="例：复练项目介绍 / 等待 HR 回复" /></label><label>行动日期<input type="date" name="next_action_date" defaultValue={application.next_action_date} /></label></div>
    <label>公司校招 / 招聘入口<input name="career_url" type="url" defaultValue={site?.url ?? ""} placeholder="https://...（留空则不修改现有链接）" /><small>同一公司的岗位共用此链接；修改后公司名会跳转到新地址。</small></label>
    <label>备注<textarea name="notes" defaultValue={application.notes} rows={3} placeholder="面试安排、联系记录或需要确认的信息" /></label>
    {error && <p className="form-error">{error}</p>}
    <button className="primary-button" type="submit" disabled={busy}><Save size={15} />{busy ? "保存中…" : "保存进度"}</button>
    {application.id !== "new" && <div className="delete-record-area"><p>重复投递或录入错误？只删除这条投递记录，可从回收站恢复，不影响真实面试与复盘。</p><button type="button" className="danger-button" disabled={busy} onClick={() => void remove()}><Trash2 size={15} />删除投递记录</button></div>}
  </form>;
}

export function ApplicationBoard({ applications, companySites, onChanged }: { applications: Application[]; companySites: CompanySite[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部阶段");
  const siteByCompany = new Map(companySites.map((site) => [site.company, site]));
  const normalized = applications.map((item) => ({ ...item, status: String(item.status) === "待投递" ? "待确认" as const : item.status }));
  const visible = normalized.filter((item) => (statusFilter === "全部阶段" || item.status === statusFilter) && `${item.company} ${item.role} ${item.next_action}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => (a.next_action_date || "9999").localeCompare(b.next_action_date || "9999"));
  const columns = statusFilter === "全部阶段" ? STATUSES : STATUSES.filter((status) => status === statusFilter);
  return <><div className="toolbar application-toolbar"><label className="searchbox"><input aria-label="搜索公司、岗位、下一步" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司、岗位、下一步" /></label><label className="selectbox"><select aria-label="按招聘阶段筛选" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>全部阶段</option>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label><Link className="text-link" href="/applications/trash"><Trash2 size={15} />回收站</Link><button className="primary-button" onClick={() => setEditing("new")}><Plus size={16} />新增岗位</button></div>
    <div className="board-summary"><span>当前显示 {visible.length} / {applications.length} 个岗位</span><span>面试、Offer 优先 · 上下滚动查看 · 按行动日期排序</span></div>
    {editing === "new" && <div className="modal-backdrop" onClick={() => setEditing(null)}><div className="modal-card" onClick={(event) => event.stopPropagation()}><ApplicationForm application={empty} onClose={() => setEditing(null)} onChanged={onChanged} /></div></div>}
    {!visible.length && (query || statusFilter !== "全部阶段") && <div className="empty-state">当前条件下没有岗位。<button className="text-button" onClick={() => { setQuery(""); setStatusFilter("全部阶段"); }}>清除筛选</button></div>}
    <div className="board-scroller vertical-board"><div className="kanban-board">{columns.map((status) => {
      const cards = visible.filter((item) => item.status === status);
      return <section className="kanban-column" key={status}><div className="kanban-head"><span className={`status-dot status-${status}`} /><h2>{status}</h2><span className="kanban-count">{cards.length}</span></div>
        <div className="kanban-cards">{cards.map((item) => { const site = siteByCompany.get(item.company); return <div className="kanban-card" key={item.id}><div className="kanban-card-top">{site?.url ? <a className="company-link" href={site.url} target="_blank" rel="noopener noreferrer" title={`${site.label} · 新标签页打开`}>{item.company}<ExternalLink size={13} /></a> : <span>{item.company}</span>}<span className="company-site-label">{site?.label ?? "链接待补"}</span></div><strong>{item.role}</strong><p>{item.next_action || "下一步尚未填写"}</p>{item.next_action_date && <div className="date-pill"><CalendarDays size={13} />{item.next_action_date}</div>}<button className="card-edit" onClick={() => setEditing(item.id)}>更新状态与记录 →</button></div>; })}{!cards.length && <p className="kanban-empty">暂无岗位</p>}</div>
      </section>;
    })}</div></div>
    {editing && editing !== "new" && <div className="modal-backdrop" onClick={() => setEditing(null)}><div className="modal-card" onClick={(event) => event.stopPropagation()}><ApplicationForm application={normalized.find((item) => item.id === editing) || empty} site={siteByCompany.get(normalized.find((item) => item.id === editing)?.company ?? "")} onClose={() => setEditing(null)} onChanged={onChanged} /></div></div>}
  </>;
}
