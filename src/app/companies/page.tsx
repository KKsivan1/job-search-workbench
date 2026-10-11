"use client";
import Link from "next/link";
import { api, useAsync, LoadingBlock, ErrorBlock } from "@/lib/data-provider";

export default function CompaniesPage() {
  const { data, loading, error, reload } = useAsync(() => api.getOverview(), []);
  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error || "加载失败"} onRetry={reload} />;
  const companies = [...new Set(data.interviews.map((i) => i.company))];
  return <div className="page-wrap"><Link className="back-link" href="/">← 返回总览</Link><div className="page-heading"><span className="eyebrow">INTERVIEWED COMPANIES</span><h1>已面试的 {companies.length} 家公司</h1><p>面试次数来自真实记录；当前招聘进度来自投递台账，两者独立，不根据轮次推断结果。</p></div><div className="company-progress-grid">{companies.map((company) => <section className="panel" key={company}><div className="panel-head"><h2>{company}</h2><span className="muted small">{data.interviews.filter((i) => i.company === company).length} 场面试</span></div>{data.applications.filter((a) => a.company === company).map((a) => <div className="company-role" key={a.id}><strong>{a.role}</strong><span className="source-badge">{String(a.status) === "待投递" ? "待确认" : a.status}</span><p>{a.next_action || "下一步待补充"} · {a.next_action_date || "日期待定"}</p></div>)}<div className="practice-links">{data.interviews.filter((i) => i.company === company).map((i) => <Link key={i.id} href={`/interviews/view?id=${encodeURIComponent(i.id)}`}>{i.date} · {i.round} →</Link>)}</div><Link className="text-link" href="/applications">更新岗位进度 →</Link></section>)}</div></div>;
}
