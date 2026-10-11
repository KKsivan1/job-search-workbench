"use client";
import { useEffect, useRef, useState } from "react";
import { RotateCcw, Trash2, X } from "lucide-react";
import { api, useAsync } from "@/lib/data-provider";

export function TodoTrash({ onChanged }: { onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const { data: todos, loading, error: loadError, reload } = useAsync(() => open ? api.getArchivedTodos() : Promise.resolve([]), [open]);
  useEffect(() => { const element = dialog.current; if (open && element && !element.open) element.showModal(); return () => { if (element?.open) element.close(); }; }, [open]);
  return <>
    <button className="text-button todo-trash-trigger" type="button" aria-haspopup="dialog" onClick={() => { setError(""); setOpen(true); }}><Trash2 size={14} />待办回收站</button>
    <dialog ref={dialog} className="calendar-dialog todo-trash-dialog" aria-labelledby="todo-trash-title" onCancel={(e) => { e.preventDefault(); if (!busy) setOpen(false); }}>
      <div className="calendar-dialog-heading"><div><span className="eyebrow">RECENTLY REMOVED</span><h2 id="todo-trash-title">待办回收站</h2><p>只隐藏待办，不删除关联面试与复盘。恢复后保留原日期、时间和完成状态。</p></div><button className="icon-button" aria-label="关闭待办回收站" disabled={busy} onClick={() => setOpen(false)}><X size={20} /></button></div>
      <div className="todo-trash-content">{loading ? <p className="muted">正在加载…</p> : loadError ? <p role="alert">{loadError}<button className="text-button" onClick={reload}>重试</button></p> : todos?.length ? todos.map((todo) => <div className="todo-trash-row" key={todo.id}><div><strong>{todo.title}</strong><small>{todo.due_date.replace("T", " ") || "日期待定"} · {todo.done ? "已完成" : "未完成"}</small></div><button className="agenda-edit" disabled={busy} onClick={async () => {
        setBusy(true); setError("");
        try { await api.restoreTodo(todo.id); reload(); onChanged?.(); }
        catch (e) { setError(e instanceof Error ? e.message : "恢复失败"); }
        finally { setBusy(false); }
      }}><RotateCcw size={13} />恢复</button></div>) : <p className="muted">没有已删除的待办。</p>}
      {error && <p className="form-error" role="alert">{error}</p>}</div>
    </dialog>
  </>;
}
