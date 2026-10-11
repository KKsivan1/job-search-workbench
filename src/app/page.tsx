"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, CircleDot, FileText, Sparkles } from "lucide-react";
import { api, isCloud, useAsync } from "@/lib/data-provider";
import { getPracticeGroups } from "@/lib/core";
import { TodoList } from "@/components/todo-list";
import { LatestReview } from "@/components/latest-review";
import { ErrorBlock, LoadingBlock } from "@/lib/data-provider";
import { RecruitmentCalendar } from "@/components/recruitment-calendar";

export default function HomePage() {
  const { data, error, loading, reload } = useAsync(() => api.getOverview(), []);
  if (loading && !data) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error || "加载失败"} onRetry={reload} />;
  const { interviews, applications, todos } = data;
  const companyCount = new Set(interviews.map((item) => item.company)).size;
  const nextActions = applications.filter((item) => item.next_action).sort((a, b) => (a.next_action_date || "9999").localeCompare(b.next_action_date || "9999")).slice(0, 4);
  const themes = getPracticeGroups(interviews).slice(0, 3);
  return <div className="page-wrap">
    <RecruitmentCalendar todos={todos} applications={applications} onChanged={reload} />
    <div className="section-heading"><div><span className="eyebrow">OVERVIEW</span><h2>当前进度</h2></div><span className="muted small">{isCloud ? "数据保存在云端，仅当前账号可见" : "数据取自现有 Wiki 与本地投递台账"}</span></div>
    <div className="stat-grid"><Link href="/interviews" className="stat-card"><span>面试记录</span><strong>{interviews.length}<small> 场</small></strong><p>逐场复盘与问题入口 →</p><FileText size={20} /></Link><Link href="/companies" className="stat-card"><span>已面试公司</span><strong>{companyCount}<small> 家</small></strong><p>查看公司及各岗位当前进度 →</p><Sparkles size={20} /></Link><Link href="/applications" className="stat-card"><span>投递岗位记录</span><strong>{applications.length}<small> 个</small></strong><p>招聘状态由你确认 →</p><CircleDot size={20} /></Link><Link href="/practice#tasks" className="stat-card"><span>待办任务</span><strong>{todos.filter((item) => !item.done).length}<small> 项</small></strong><p>把优化点转成行动 →</p><CalendarDays size={20} /></Link></div>
    <div className="dashboard-grid"><section className="panel"><div className="panel-head"><div><span className="eyebrow">NEXT ACTIONS</span><h2>接下来做什么</h2></div><Link href="/practice">管理复练 <ArrowUpRight size={15} /></Link></div>
      {todos.some((t) => !t.done) && <div className="priority-todos"><span className="eyebrow">优先：未完成复练</span><TodoList todos={todos.filter((t) => !t.done).slice(0, 4)} onChanged={reload} /></div>}
      <LatestReview interviews={interviews} onAdded={reload} />
      <details className="next-applications"><summary>投递下一步 · {nextActions.length} 项</summary>{nextActions.length ? nextActions.map((item) => <div className="action-row" key={item.id}><span className="action-company">{item.company}</span><div><strong>{item.next_action}</strong><small>{item.role}</small></div><span className="action-date">{item.next_action_date || "待定"}</span></div>) : <p className="muted small">暂无下一步行动，可到投递看板补充。</p>}</details>
    </section><section className="panel"><div className="panel-head"><div><span className="eyebrow">REFLECTION</span><h2>高频优化主题</h2></div><Link href="/practice">去复练 <ArrowUpRight size={15} /></Link></div>{themes.map((theme, index) => <Link href="/practice" className="theme-row" key={theme.title}><span className="theme-index">0{index + 1}</span><div><strong>{theme.title}</strong><small>关联 {theme.interviews.length} 场面试</small></div><ArrowUpRight size={16} /></Link>)}<div className="panel-footnote">主题根据迁移映射表的优化点归类，数量表示关联场次。<br /><Link href="/learn">学习新面经，整理成 Wiki →</Link></div></section></div>
    <section className="recent-section"><div className="section-heading"><div><span className="eyebrow">LATEST REVIEWS</span><h2>最近的真实面试</h2></div><Link href="/interviews" className="text-link">查看全部 {interviews.length} 场 <ArrowRight size={16} /></Link></div>{interviews.length ? <div className="recent-grid">{interviews.slice(-3).reverse().map((item) => <Link href={`/interviews/view?id=${encodeURIComponent(item.id)}`} className="recent-card" key={item.id}><span>{item.date}</span><h3>{item.company}</h3><p>{item.role} · {item.round}</p><div>{item.optimization}</div><ArrowUpRight size={19} /></Link>)}</div> : <div className="empty-inline">还没有面试记录。到「真实面试」页新增第一场。</div>}</section>
  </div>;
}
