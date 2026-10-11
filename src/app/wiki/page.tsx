"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { DocumentWorkspace } from "@/components/document-workspace";
import { api, ErrorBlock, LoadingBlock, useAsync } from "@/lib/data-provider";

function WikiInner() {
  const params = useSearchParams();
  const target = params.get("target") ?? "";
  const fromTasks = params.get("from") === "tasks";
  const anchor = target.includes("#") ? target.slice(target.indexOf("#") + 1) : undefined;
  const { data, error, loading, reload } = useAsync(async () => {
    if (!target) return null;
    const plainTarget = target.split("#")[0];
    const id = plainTarget.includes("/") && plainTarget.endsWith(".md") ? plainTarget : await api.resolveWikiTarget(target);
    if (!id) return null;
    const [doc, editable] = await Promise.all([api.getWikiDocument(id), api.isEditableDoc(id)]);
    return doc ? { doc, editable } : null;
  }, [target]);
  if (loading) return <LoadingBlock />;
  if (error) return <div><ErrorBlock message="文档暂时无法打开，可能已被移动、删除或无权访问。可返回待办重新选择关联。" onRetry={reload}/>{fromTasks && <div className="page-wrap"><Link className="text-link" href="/">← 返回日历待办</Link></div>}</div>;
  if (!data) return <div className="page-wrap"><div className="empty-state"><h2>没有找到这篇 Wiki 文档</h2><p>它可能被移动或不在当前账号的工作台范围内。关联待办仍保留，可以编辑待办重新选择文档。</p><Link className="text-link" href={fromTasks ? "/" : "/answers"}>{fromTasks ? "返回日历待办" : "返回回答库"} <ArrowRight size={16} /></Link></div></div>;
  return <div className="page-wrap"><DocumentWorkspace doc={data.doc} editable={data.editable} anchor={anchor} backHref={fromTasks ? "/" : "/answers"} backLabel={fromTasks ? "返回日历待办" : "返回知识库"} onSaved={reload} /></div>;
}

export default function WikiPage() {
  return <Suspense fallback={<LoadingBlock />}><WikiInner /></Suspense>;
}
