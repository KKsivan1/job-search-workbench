"use client";

import { useEffect, useState } from "react";
import { Check, Edit3, Eye, Plus, Save, X } from "lucide-react";
import type { WikiSection } from "@/lib/core";
import { api } from "@/lib/data-provider";
import { MarkdownView } from "./markdown-view";

export function WikiEditor({ id, version, sections, onSaved }: { id: string; version: string; sections: WikiSection[]; onSaved?: () => void }) {
  const [selected, setSelected] = useState<WikiSection | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [body, setBody] = useState("");
  const [currentVersion, setCurrentVersion] = useState(version);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // eslint-disable-next-line react-hooks/set-state-in-effect -- 同步父组件刷新后的最新文档版本
  useEffect(() => { setCurrentVersion(version); }, [version]);

  const dirty = adding ? Boolean(newTitle.trim() || body.trim()) : Boolean(selected && body !== selected.body);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function confirmDiscard(): boolean {
    return !dirty || window.confirm("当前修改尚未保存，确定放弃吗？");
  }
  async function save() {
    if (!selected && !adding) return;
    setSaving(true);
    setMessage("");
    try {
      const nextVersion = adding
        ? await api.addWikiSection(id, newTitle, body, currentVersion)
        : await api.saveWikiSection(id, selected?.key ?? "", body, currentVersion);
      if (nextVersion) setCurrentVersion(nextVersion);
      setSelected(null);
      setAdding(false);
      setNewTitle("");
      setBody("");
      setMessage(adding ? "新章节已保存，修改前的原文已备份。" : "已保存，修改前的原文已备份。");
      onSaved?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return <div className="editor-panel">
    <div className="editor-title"><Edit3 size={17} /><span>章节编辑</span></div>
    <p className="muted small">选择已有章节修改，或新增一道问题。保存前会自动备份原文，并检测版本冲突。</p>
    <button className="add-section-button" type="button" onClick={() => { if (!confirmDiscard()) return; setSelected(null); setAdding(true); setEditing(true); setNewTitle(""); setBody(""); setMessage(""); }}><Plus size={14} />新增章节 / 面试题</button>
    <div className="section-picker">
      {sections.map((section) => <button key={section.key} type="button" className={`section-option ${selected?.key === section.key ? "active" : ""}`} style={{ paddingLeft: section.level === 2 ? 12 : 22 }} onClick={() => { if (selected?.key === section.key && !adding) return; if (!confirmDiscard()) return; setAdding(false); setEditing(false); setSelected(section); setBody(section.body); setMessage(""); }}>
        <span>{section.title}</span><Edit3 size={12} />
      </button>)}
    </div>
    {(selected || adding) && <div className="editor-workspace">
      <div className="editor-workspace-head"><strong>{adding ? "新增章节" : selected?.title}{dirty && <span className="unsaved-tag">未保存</span>}</strong><button className="icon-button" type="button" aria-label="关闭编辑" onClick={() => { if (!confirmDiscard()) return; setSelected(null); setAdding(false); }}><X size={16} /></button></div>
      {adding && <label className="new-section-title">章节标题<input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} maxLength={160} placeholder="例如：Q9. 如果重新做这个项目，你会怎么设计？" /></label>}
      <div className="editor-tabs"><button type="button" className="text-button" onClick={() => setEditing(!editing)}>{editing ? <><Eye size={14} />切换为预览</> : <><Edit3 size={14} />编辑 Markdown</>}</button></div>
      <div className="editor-columns">
        {editing && <textarea aria-label="章节 Markdown 内容" value={body} onChange={(event) => setBody(event.target.value)} spellCheck={false} />}
        <div className={`editor-preview ${!editing ? "read-mode" : ""}`}><MarkdownView source={body} compact /></div>
      </div>
      {(editing || adding || dirty) && <div className="editor-actions"><button className="primary-button" type="button" onClick={() => void save()} disabled={saving || (adding && !newTitle.trim())}><Save size={15} />{saving ? "保存中…" : adding ? "新增并保存" : "保存修改"}</button></div>}
    </div>}
    {message && <p role="status" className={`editor-message ${message.startsWith("已保存") || message.startsWith("新章节") ? "success" : "error"}`}>{(message.startsWith("已保存") || message.startsWith("新章节")) && <Check size={15} />}{message}</p>}
  </div>;
}
