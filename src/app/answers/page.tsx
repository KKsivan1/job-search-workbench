"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AnswerBrowser } from "@/components/answer-browser";
import { DocumentWorkspace } from "@/components/document-workspace";
import { api, ErrorBlock, LoadingBlock, useAsync } from "@/lib/data-provider";

function AnswersInner() {
  const requested = useSearchParams().get("doc");
  const { data, error, loading, reload } = useAsync<import("@/lib/core").WikiDocument | import("@/lib/core").AnswerSummary[] | null>(
    () => (requested ? api.getAnswerDoc(requested) : api.getAnswerSummaries()),
    [requested],
  );
  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error || "加载失败"} onRetry={reload} />;

  if (requested) {
    const doc = data as import("@/lib/core").WikiDocument | null;
    if (!doc) return <ErrorBlock message="没有找到这篇回答文档。" />;
    return <div className="page-wrap"><DocumentWorkspace doc={doc} editable onSaved={reload} /></div>;
  }
  const docs = data as Awaited<ReturnType<typeof api.getAnswerSummaries>>;
  if (!docs.length) return <div className="page-wrap"><div className="page-heading"><span className="eyebrow">ANSWER LIBRARY</span><h1>把回答，讲成自己的话。</h1></div><div className="empty-state">当前账号还没有回答库文档。</div></div>;
  return <div className="page-wrap"><div className="page-heading"><span className="eyebrow">ANSWER LIBRARY</span><h1>把回答，讲成自己的话。</h1><p>自我介绍、项目深挖和基础问答都在这里。直接阅读、搜索，也可以按章节修改，修改前自动备份。</p></div><AnswerBrowser documents={docs} /></div>;
}

export default function AnswersPage() {
  return <Suspense fallback={<LoadingBlock />}><AnswersInner /></Suspense>;
}
