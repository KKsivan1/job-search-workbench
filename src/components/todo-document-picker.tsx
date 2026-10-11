"use client";
import "./todo-documents.css";
import { useState } from "react";
import { FileText, Search, X } from "lucide-react";
import { api, isCloud, useAsync } from "@/lib/data-provider";
import { documentLabel } from "@/lib/todo-document";

export function TodoDocumentPicker({value,onChange,disabled=false}: {value:string;onChange:(id:string)=>void;disabled?:boolean}) {
  const [query,setQuery]=useState("");
  const {data,error,loading,reload}=useAsync(()=>api.getLinkableDocuments(),[]);
  const selected=data?.find((doc)=>doc.id===value);
  const terms=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches=(data || []).filter((doc)=>terms.every((term)=>`${doc.title} ${doc.id}`.toLocaleLowerCase().includes(term)));
  const shown=matches.slice(0,8);
  return <div className="todo-document-picker">
    <label>关联文档 <span className="muted">选填 · 面试准备 / 知识库 / 真实面试复盘</span>
      <div className="todo-document-search"><Search size={15}/><input type="search" aria-label="搜索关联文档" placeholder="输入公司、知识点或文档标题" value={query} disabled={disabled} onChange={(e)=>setQuery(e.target.value)}/></div>
    </label>
    {value && <div className="todo-document-selected"><FileText size={16}/><div><strong>{selected?.title || documentLabel(value)}</strong><small>{!loading && data && !selected ? "文档当前不可用，请重新选择或取消关联" : "已关联 · 保存后点击待办标题即可阅读"}</small></div><button type="button" className="icon-button" disabled={disabled} aria-label="取消文档关联" onClick={()=>onChange("")}><X size={16}/></button></div>}
    {loading ? <p className="muted small" role="status">正在读取可关联文档…</p> : error ? <p className="form-error" role="alert">文档列表加载失败。<button type="button" className="text-button" onClick={reload} disabled={disabled}>重试</button> 不关联文档也可以保存待办。</p> :
      <div className="todo-document-results" aria-label="可关联文档">
        {shown.map((doc)=><button type="button" key={doc.id} disabled={disabled} aria-pressed={doc.id===value} onClick={()=>onChange(doc.id)}><FileText size={14}/><div><span>{doc.title}</span><small>{doc.category} · {doc.id}</small></div>{doc.id===value && <b>✓</b>}</button>)}
        {!matches.length && <p className="muted small">没有匹配文档，试试公司名或更短的关键词。</p>}
      </div>}
    {!loading && !error && <p className="muted small">{matches.length>8 ? `共 ${matches.length} 篇，展示前 8 篇；输入关键词缩小范围。` : `找到 ${matches.length} 篇文档。`}{isCloud ? "仅列出当前账号已有的云端文档。" : "搜索本地 Wiki，不修改原文。"}</p>}
  </div>;
}
