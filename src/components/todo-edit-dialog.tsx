"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { api } from "@/lib/data-provider";
import { calendarEvents, EVENT_TYPES } from "@/lib/recruitment-calendar";
import type { Todo } from "@/lib/types";
import { TodoDocumentPicker } from "./todo-document-picker";

export function TodoEditDialog({ todo, onClose, onSaved }: { todo: Todo; onClose: () => void; onSaved: (date: string, deleted: boolean) => void }) {
  const item = calendarEvents([todo],[])[0];
  const prefix = todo.title.match(/^【([^】]+)】/)?.[1];
  const [title,setTitle] = useState(prefix && (EVENT_TYPES as readonly string[]).includes(prefix) ? todo.title.slice(prefix.length+2) : todo.title);
  const [type,setType] = useState(item.kind);
  const [date,setDate] = useState(item.date);
  const [time,setTime] = useState(item.time);
  const [documentId,setDocumentId] = useState(todo.document_id || "");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ const node=dialog.current; node?.showModal(); node?.querySelector<HTMLInputElement>("input")?.focus(); return ()=>{if(node?.open) node.close();}; },[]);
  async function run(remove=false) {
    if (!remove && !title.trim()) {setError("请填写要做的事");return;}
    if (!remove && time && !date) {setError("填写具体时间时，也需要填写日期");return;}
    setBusy(true);setError("");
    try {
      if(remove) await api.archiveTodo(todo.id);
      else await api.updateTodo(todo.id,`【${type}】${title.trim()}`,time?`${date}T${time}`:date,{title:todo.title,due_date:todo.due_date,document_id:todo.document_id || ""},documentId);
      onSaved(date,remove);onClose();
    } catch(e) {setError(e instanceof Error?e.message:"操作失败，请重试");}
    finally {setBusy(false);}
  }
  return <dialog ref={dialog} className="calendar-dialog" aria-labelledby="edit-todo-heading" onCancel={(e)=>{e.preventDefault();if(!busy)onClose();}}>
    <div className="calendar-dialog-heading"><div><span className="eyebrow">EDIT TASK</span><h2 id="edit-todo-heading">编辑待办</h2><p>更新原事项，保留完成状态与面试关联。</p></div><button type="button" className="icon-button" disabled={busy} aria-label="关闭待办弹窗" onClick={onClose}><X size={20}/></button></div>
    <form className="calendar-dialog-form" onSubmit={(e)=>{e.preventDefault();void run();}}>
      <label>事项类型<select value={type} disabled={busy} onChange={(e)=>setType(e.target.value)}>{EVENT_TYPES.map((type)=><option key={type}>{type}</option>)}</select></label>
      <label>做什么<input required maxLength={180} value={title} disabled={busy} onChange={(e)=>setTitle(e.target.value)}/></label>
      <div className="calendar-dialog-dates"><label>日期<input type="date" value={date} disabled={busy} onChange={(e)=>setDate(e.target.value)}/></label><label>具体时间<input type="time" step={60} value={time} disabled={busy} onChange={(e)=>setTime(e.target.value)}/></label></div>
      <p className="muted small">按北京时间记录。日期留空为待定，时间留空为全天 / 未定时间。</p>
      <TodoDocumentPicker value={documentId} onChange={setDocumentId} disabled={busy}/>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="calendar-dialog-actions"><button className="text-button todo-delete" type="button" disabled={busy} onClick={()=>{if(window.confirm(`将「${todo.title}」移入待办回收站？\n未保存的修改不会写入，可随时恢复原记录。`))void run(true);}}>删除待办</button><button className="text-button" type="button" disabled={busy} onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={busy}>{busy?"保存中…":"保存修改"}</button></div>
    </form>
  </dialog>;
}
