"use client";

import { InterviewBrowser } from "@/components/interview-browser";
import { api, ErrorBlock, LoadingBlock, useAsync } from "@/lib/data-provider";

export default function InterviewsPage() {
  const { data, error, loading, reload } = useAsync(async () => {
    const [interviews, questionIndex] = await Promise.all([api.getInterviews(), api.getQuestionIndex()]);
    return { interviews, questionIndex };
  }, []);
  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error || "加载失败"} onRetry={reload} />;
  return <div className="page-wrap"><div className="page-heading"><span className="eyebrow">INTERVIEW ARCHIVE</span><h1>真实面试时间线</h1><p>按实际发生顺序归档；新增面试会同时生成 Wiki 记录，后续可逐章补充原回答与优化答案。</p></div>{data.interviews.length
    ? <InterviewBrowser interviews={data.interviews} questionIndex={data.questionIndex} onChanged={reload} />
    : <div className="empty-state">还没有面试记录。点击右上角「新增面试」创建第一场。</div>}</div>;
}
