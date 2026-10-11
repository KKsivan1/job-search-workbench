"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight, List } from "lucide-react";
import { DocumentWorkspace } from "@/components/document-workspace";
import { BackToTop } from "@/components/back-to-top";
import { api, ErrorBlock, LoadingBlock, useAsync } from "@/lib/data-provider";

function InterviewDetailInner() {
  const id = useSearchParams().get("id") ?? "";
  const { data, error, loading, reload } = useAsync(async () => {
    if (!id) return null;
    const [result, interviews] = await Promise.all([api.getReview(id), api.getInterviews()]);
    if (!result) return null;
    const index = interviews.findIndex((item) => item.id === id);
    return { ...result, previous: interviews[index - 1], next: interviews[index + 1] };
  }, [id]);
  if (loading) return <LoadingBlock label="正在读取本场面试复盘…" />;
  if (error) return <><ErrorBlock message={error} onRetry={reload} /><div className="page-wrap"><Link className="back-link" href="/interviews">返回面试时间线</Link></div></>;
  if (!data) return <div className="page-wrap"><div className="empty-state"><h2>没有找到这场面试</h2><p>记录可能已被删除，或不属于当前账号。</p><Link className="text-link" href="/interviews">返回面试时间线 <ArrowRight size={16} /></Link></div></div>;
  const { interview, doc, previous, next } = data;
  return <div className="page-wrap"><div className="interview-context"><span className="eyebrow">INTERVIEW #{interview.id.startsWith("m-") ? "NEW" : interview.id} · {interview.date}</span><div><strong>{interview.company}</strong><span>{interview.role} / {interview.round}</span></div><p><b>本场重点：</b>{interview.optimization}</p>{interview.confidence.includes("待确认") && <small>来源提示：{interview.confidence}</small>}{interview.longTermLinks.length > 0 && <div className="longterm-links">长期复习入口：{interview.longTermLinks.map((target) => <Link key={target} href={`/wiki?target=${encodeURIComponent(target)}`}>{target.split("#")[0]} <ArrowUpRight size={12} /></Link>)}</div>}</div><DocumentWorkspace doc={doc} editable backHref="/interviews" backLabel="返回面试时间线" onSaved={reload} /><nav className="interview-pagination" aria-label="面试记录导航"><div>{previous && <Link href={`/interviews/view?id=${encodeURIComponent(previous.id)}`}><ArrowLeft size={16} /><span>上一场<small>{previous.company}</small></span></Link>}</div><Link href="/interviews" className="pagination-all"><List size={16} />返回面试时间线</Link><div>{next && <Link href={`/interviews/view?id=${encodeURIComponent(next.id)}`}><span>下一场<small>{next.company}</small></span><ArrowRight size={16} /></Link>}</div></nav><BackToTop /></div>;
}

export default function InterviewDetailPage() {
  return <Suspense fallback={<LoadingBlock />}><InterviewDetailInner /></Suspense>;
}
