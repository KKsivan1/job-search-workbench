"use client";

import { ApplicationBoard } from "@/components/application-board";
import { api, ErrorBlock, LoadingBlock, useAsync } from "@/lib/data-provider";

export default function ApplicationsPage() {
  const { data, error, loading, reload } = useAsync(async () => {
    const [applications, companySites] = await Promise.all([api.getApplications(), api.getCompanySites()]);
    return { applications, companySites };
  }, []);
  if (loading && !data) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error || "加载失败"} onRetry={reload} />;
  const companies = new Set(data.applications.map((item) => item.company)).size;
  return <div className="page-wrap full-width"><div className="page-heading"><span className="eyebrow">APPLICATION PIPELINE</span><h1>每个岗位，都有清楚的下一步。</h1><p>当前记录 {companies} 家公司、{data.applications.length} 个岗位，来源于 Wiki 归档、手动面试记录和你的新增投递。招聘状态由你确认；点击公司名可前往招聘官网。重复记录可在「更新状态与记录」中删除，并从回收站恢复。</p></div><ApplicationBoard applications={data.applications} companySites={data.companySites} onChanged={reload} /></div>;
}
