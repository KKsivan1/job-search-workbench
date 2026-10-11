"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/data-provider";
import type { Todo } from "@/lib/types";
import { TodoTrash } from "./todo-trash";
import { TodoEditDialog } from "./todo-edit-dialog";
import { TodoDocumentPicker } from "./todo-document-picker";
import { documentLabel, todoDocumentHref } from "@/lib/todo-document";

export function TodoList({ todos, showForm = false, onChanged }: { todos: Todo[]; showForm?: boolean; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing,setEditing] = useState<Todo | null>(null);
  const [documentId,setDocumentId]=useState("");

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  return <div className="todo-list" id={showForm ? "tasks" : undefined}>
    {showForm && <form className="todo-add" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const title = String(new FormData(form).get("title") || "");
      const dueDate = String(new FormData(form).get("due_date") || "");
      void run(async () => {
        await api.addTodo(title, dueDate, "", documentId);
        form.reset();
        setDocumentId("");
      });
    }}>
      <input name="title" placeholder="新增复练任务，例如：重讲牵牛花 30 秒介绍" required />
      <input name="due_date" type="date" aria-label="截止日期" />
      <button className="primary-button" type="submit" disabled={busy}>添加</button>
    </form>}
    {showForm && <TodoDocumentPicker value={documentId} onChange={setDocumentId} disabled={busy}/>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {todos.length ? todos.map((todo) => <div key={todo.id} className={`todo-item ${todo.done ? "done" : ""}`}>
      <button type="button" aria-label={todo.done ? "标记为未完成" : "完成任务"} className="todo-checkbox" disabled={busy} onClick={() => void run(() => api.setTodoDone(todo.id, !todo.done))}>{todo.done ? "✓" : ""}</button><div>{todo.document_id ? <><Link className="todo-title-link" href={todoDocumentHref(todo.document_id)}>{todo.title}</Link><Link className="todo-document-link" href={todoDocumentHref(todo.document_id)}>阅读：{documentLabel(todo.document_id)} →</Link></> : <span>{todo.title}</span>}{todo.interview_id && <Link href={`/interviews/view?id=${encodeURIComponent(todo.interview_id)}`}>面试 #{todo.interview_id}</Link>}</div>{todo.due_date && <small>{todo.due_date.replace("T", " ")}</small>}
      <button className="text-button" disabled={busy} aria-label={`编辑：${todo.title}`} onClick={()=>setEditing({...todo})}>编辑</button><button className="text-button todo-delete" disabled={busy} aria-label={`删除：${todo.title}`} onClick={() => {
        if (!window.confirm(`将「${todo.title}」移入待办回收站？可随时恢复，关联面试不会删除。`)) return;
        void run(() => api.archiveTodo(todo.id));
      }}>删除</button>
    </div>) : <p className="muted">还没有复练任务，可以从最近面试的优化点开始添加。</p>}
    {showForm && <TodoTrash onChanged={onChanged} />}
    {editing && <TodoEditDialog todo={editing} onClose={()=>setEditing(null)} onSaved={()=>onChanged?.()}/>}
  </div>;
}
