"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, X, Clock3, Pencil, Trash2 } from "lucide-react";
import { TodoTrash } from "./todo-trash";
import { TodoEditDialog } from "./todo-edit-dialog";
import { api, isCloud } from "@/lib/data-provider";
import { calendarEvents, compareEvents, EVENT_TYPES, monthDays, shanghaiDate, shiftMonth, type CalendarEvent } from "@/lib/recruitment-calendar";
import type { Application, Todo } from "@/lib/types";
import { TodoDocumentPicker } from "./todo-document-picker";
import { documentLabel, todoDocumentHref } from "@/lib/todo-document";

export function RecruitmentCalendar({ todos, applications, onChanged }: { todos: Todo[]; applications: Application[]; onChanged: () => void }) {
  const today = shanghaiDate();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [bucket, setBucket] = useState<"date" | "overdue" | "undated">("date");
  const [showDone, setShowDone] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("面试");
  const [dueDate, setDueDate] = useState(today);
  const [dueTime, setDueTime] = useState("");
  const [documentId,setDocumentId]=useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (formOpen && element && !element.open) { element.showModal(); element.querySelector<HTMLInputElement>("input")?.focus(); }
    return () => { if (element?.open) element.close(); };
  }, [formOpen]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const events = calendarEvents(todos, applications);
  const overdue = events.filter((item) => !item.done && item.date && item.date < today);
  const undated = events.filter((item) => !item.done && !item.date);
  const visible = (bucket === "overdue" ? overdue : bucket === "undated" ? undated : events.filter((item) => item.date === selected && (showDone || !item.done))).sort(compareEvents);
  async function run(action: () => Promise<void>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(message); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : "保存失败，请重试"); }
    finally { setBusy(false); }
  }
  function select(day: string) { setSelected(day); setMonth(day.slice(0, 7)); setBucket("date"); }
  function edit(item: CalendarEvent) {
    const original = todos.find((todo) => todo.id === item.sourceId);
    if (!original) return;
    setEditing({ ...original }); setError(""); setNotice(""); setFormOpen(true);
  }
  function itemRow(item: CalendarEvent) {
    return <div className={`agenda-item ${item.done ? "is-done" : ""}`} key={item.id}>
      {item.source === "todo" ? <button className="todo-checkbox" disabled={busy} aria-label={`${item.done ? "恢复" : "完成"}：${item.title}`} onClick={() => void run(() => api.setTodoDone(item.sourceId, !item.done), item.done ? "已恢复待办" : "已完成待办")}>{item.done ? "✓" : ""}</button> : <span className="agenda-source-dot" aria-label="投递行动" />}
      <div className="agenda-item-copy"><div className="agenda-item-meta"><span className={`agenda-tag kind-${item.kind}`}>{item.kind}</span><span className="agenda-time"><Clock3 size={12} />{item.time || "全天 / 未定时间"}</span></div><strong>{item.documentId ? <Link className="todo-title-link" href={todoDocumentHref(item.documentId)}>{item.title}</Link> : item.title}</strong><small>{item.subtitle}{bucket !== "date" && item.date ? ` · ${item.date}` : ""}</small>
        {item.documentId && <Link className="todo-document-link" href={todoDocumentHref(item.documentId)}>阅读：{documentLabel(item.documentId)} →</Link>}
        {item.source === "application" && <Link href="/applications">到投递看板更新行动 →</Link>}
      </div>
      {item.source === "todo" && <div className="agenda-item-actions"><button type="button" className="agenda-edit" disabled={busy} aria-label={`编辑：${item.title}`} aria-haspopup="dialog" onClick={() => edit(item)}><Pencil size={13} />编辑</button><button type="button" className="agenda-edit todo-delete" disabled={busy} aria-label={`删除：${item.title}`} onClick={() => {
        if (!window.confirm(`将「${item.title}」移入待办回收站？\n可随时恢复，关联面试与复盘不会删除。`)) return;
        void run(() => api.archiveTodo(item.sourceId), "已移入待办回收站，可从回收站恢复");
      }}><Trash2 size={13} />删除</button></div>}
    </div>;
  }
  return <section className="recruitment-calendar" aria-label="求职日历待办">
    <div className="calendar-heading"><div><span className="eyebrow">YOUR CAREER AGENDA</span><h1>把求职安排，放进每一天。</h1><p>面试、笔试、测评与沟通，都有自己的位置。</p></div><button className="primary-button" onClick={() => { setEditing(null); setTitle(""); setType("面试"); setDueDate(selected); setDueTime(""); setDocumentId(""); setError(""); setNotice(""); setFormOpen(true); }} aria-haspopup="dialog"><Plus size={16} /> 新增待办</button></div>
    <div className="calendar-layout"><div className="calendar-month">
      <div className="calendar-toolbar"><h2>{month.replace("-", " 年 ")} 月</h2><div><button aria-label="上个月" onClick={() => select(`${shiftMonth(month,-1)}-01`)}><ChevronLeft size={18} /></button><button onClick={() => select(today)}>今天</button><button aria-label="下个月" onClick={() => select(`${shiftMonth(month,1)}-01`)}><ChevronRight size={18} /></button></div></div>
      <div className="calendar-weekdays" aria-hidden="true">{["一","二","三","四","五","六","日"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-days">{monthDays(month).map((day) => {
        const items = events.filter((item) => item.date === day && (showDone || !item.done)).sort(compareEvents);
        return <button key={day} className={`calendar-day ${day.slice(0,7) !== month ? "outside" : ""} ${day === today ? "today" : ""} ${day === selected && bucket === "date" ? "selected" : ""}`} aria-label={`${day}${day === today ? " 今天" : ""}，${items.length}项安排${items.length ? `：${items.map((item) => `${item.time || "全天"} ${item.title}`).join("；")}` : ""}`} aria-pressed={day === selected && bucket === "date"} onClick={() => select(day)}><span className="day-number">{Number(day.slice(-2))}</span>{items.length > 0 && <><span className="day-events">{items.slice(0,2).map((item) => <span key={item.id} title={`${item.time || "全天 / 未定时间"} ${item.title}`}>{item.time && `${item.time} `}{item.title}</span>)}</span><small>{items.length} 项</small></>}</button>;
      })}</div>
      <div className="calendar-footer"><span>日期按北京时间 · 任务按日期归档</span><label><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />显示已完成</label><TodoTrash onChanged={onChanged} /></div>
    </div><div className="calendar-agenda">
      <div className="agenda-tabs"><button className={bucket === "date" ? "active" : ""} onClick={() => setBucket("date")}>当天</button><button className={bucket === "overdue" ? "active" : ""} onClick={() => setBucket("overdue")}>逾期 {overdue.length}</button><button className={bucket === "undated" ? "active" : ""} onClick={() => setBucket("undated")}>待定 {undated.length}</button></div>
      <div className="agenda-title"><h2>{bucket === "date" ? `${selected.slice(5).replace("-", "月")}日${selected === today ? " · 今天" : ""}` : bucket === "overdue" ? "尚未完成的过期安排" : "还没定日期的安排"}</h2><span>{visible.length} 项</span></div>
      <div className="agenda-items">{visible.length ? visible.map(itemRow) : <div className="agenda-empty"><span>☀</span><p>{bucket === "date" ? "这一天暂时没有待办" : "这里暂时没有待办"}</p><small>可以添加安排，或到投递看板填写下一步日期。</small></div>}</div>
      <p className="muted small">{isCloud ? "云端账号的待办与投递行动" : "本地待办与投递行动"} · 投递行动需到看板更新，不会自动标记完成。</p>
    </div></div>
    {editing && formOpen ? <TodoEditDialog todo={editing} onClose={()=>setFormOpen(false)} onSaved={(date,deleted)=>{setNotice(deleted?"已移入待办回收站，可从回收站恢复":"待办已更新"); if(!deleted){if(date)select(date);else setBucket("undated");} onChanged();}}/> : <dialog ref={dialog} className="calendar-dialog" aria-labelledby="calendar-dialog-title" onCancel={(e) => { e.preventDefault(); if (!busy) setFormOpen(false); }}>
      <div className="calendar-dialog-heading"><div><span className="eyebrow">NEW TASK</span><h2 id="calendar-dialog-title">新增待办</h2><p>定好日期和时间，把下一步安排妥当。</p></div><button type="button" className="icon-button" aria-label="关闭待办弹窗" disabled={busy} onClick={() => setFormOpen(false)}><X size={20} /></button></div>
      <form className="calendar-dialog-form" onSubmit={(e) => { e.preventDefault(); if (!title.trim()) { setError("请填写要做的事"); return; } if (dueTime && !dueDate) { setError("填写具体时间时，也需要填写日期"); return; } void run(async () => {
        const updatedTitle = `【${type}】${title.trim()}`;
        const dateTime = dueTime ? `${dueDate}T${dueTime}` : dueDate;
        await api.addTodo(updatedTitle, dateTime, "", documentId);
        setTitle(""); setFormOpen(false); if (dueDate) select(dueDate); else setBucket("undated");
      }, "已添加到日历待办"); }}>
      <label>事项类型<select value={type} onChange={(e) => setType(e.target.value)} disabled={busy}>{EVENT_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>做什么<input required maxLength={180} value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} placeholder="例如：滴滴 HR 沟通" /></label>
      <div className="calendar-dialog-dates"><label>日期<input required type="date" value={dueDate} disabled={busy} onChange={(e) => setDueDate(e.target.value)} /></label><label>具体时间<input type="time" step={60} value={dueTime} disabled={busy} onChange={(e) => setDueTime(e.target.value)} /></label></div>
      <p className="muted small">按北京时间记录，精确到分钟。时间留空表示全天 / 未定时间。</p>
      {formOpen && <TodoDocumentPicker value={documentId} onChange={setDocumentId} disabled={busy}/>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="calendar-dialog-actions"><button className="text-button" type="button" disabled={busy} onClick={() => setFormOpen(false)}>取消</button><button className="primary-button" disabled={busy} type="submit">{busy ? "保存中…" : "保存待办"}</button></div>
    </form></dialog>}
    {!formOpen && error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="calendar-notice" role="status">{notice}</p>}
  </section>;
}
