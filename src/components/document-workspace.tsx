"use client";
import { useState } from "react";
import Link from "next/link";
import { isCloud } from "@/lib/data-provider";
import { ArrowLeft, FilePenLine, Link2 } from "lucide-react";
import type { WikiDocument } from "@/lib/core";
import { MarkdownView } from "./markdown-view";
import { WikiEditor } from "./wiki-editor";
import { SectionJump } from "./section-jump";

export function DocumentWorkspace({ doc, editable, anchor, backHref = "/answers", backLabel = "返回回答库", onSaved }: { doc: WikiDocument; editable: boolean; anchor?: string; backHref?: string; backLabel?: string; onSaved?: () => void }) {
  const [showEditor, setShowEditor] = useState(false);
  return <>{anchor && <SectionJump title={anchor} />}<div className="doc-top"><Link href={backHref} className="back-link"><ArrowLeft size={16} />{backLabel}</Link><span className="source-badge"><Link2 size={14} />{isCloud ? "云端" : "本地"} Wiki 文档</span></div>
    <div className="document-heading"><span className="eyebrow">WIKI DOCUMENT</span><h1>{doc.title}</h1><p>文档：{doc.id}</p></div>
    {editable && !showEditor && <button className="primary-button document-edit-toggle" onClick={() => setShowEditor(true)}><FilePenLine size={16} />编辑章节 / 新增问题</button>}
    <div className={`document-layout ${editable && showEditor ? "with-editor" : ""}`}><article className="document-card"><MarkdownView source={doc.content.replace(/^\s*#\s+[^\r\n]+\r?\n/, "")} /></article>{editable && showEditor && <aside className="document-editor"><div className="editor-notice"><FilePenLine size={16} />先预览章节，点击「编辑 Markdown」才显示源码。</div><WikiEditor id={doc.id} version={doc.version} sections={doc.sections} onSaved={onSaved} /></aside>}</div>
  </>;
}
