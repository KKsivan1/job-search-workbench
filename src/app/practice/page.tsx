"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { TodoList } from "@/components/todo-list";
import { api, ErrorBlock, LoadingBlock, useAsync } from "@/lib/data-provider";
import { getPracticeGroups } from "@/lib/core";
import { MarkdownView } from "@/components/markdown-view";

export default function PracticePage() {
  const { data, error, loading, reload } = useAsync(async () => {
    const [interviews, todos, questions] = await Promise.all([api.getInterviews(), api.getOverview().then((overview) => overview.todos), api.getAnswerDoc("questions/interview-core/复练方法.md")]);
    return { interviews, todos, questions };
  }, []);
  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error || "加载失败"} onRetry={reload} />;
  const groups = getPracticeGroups(data.interviews);
  return <div className="page-wrap"><div className="page-heading"><span className="eyebrow">PRACTICE ROOM</span><h1>让复盘产生下一次的改变。</h1><p>从真实面试反复出现的问题出发，找到对应场次，再把要练的内容写成可完成的任务。</p></div><section className="panel practice-todos"><div className="panel-head"><div><span className="eyebrow">ACTION LIST</span><h2>我的复练任务</h2></div><span className="muted small">{data.todos.filter((item) => !item.done).length} 项待完成</span></div><TodoList todos={data.todos} showForm onChanged={reload} /></section><div className="section-heading"><div><span className="eyebrow">RECURRING PATTERNS</span><h2>跨场次高频问题</h2></div><span className="muted small">根据迁移映射表的优化点归类</span></div>{groups.some((group) => group.interviews.length)
    ? <div className="practice-grid">{groups.map((group, index) => <section className="practice-card" key={group.title}><div className="practice-number">0{index + 1}</div><h3>{group.title}</h3><p>关联 {group.interviews.length} 场面试</p><div className="practice-links">{group.interviews.slice(-6).reverse().map((interview) => <Link key={interview.id} href={`/interviews/view?id=${encodeURIComponent(interview.id)}`}><span>{interview.company} · {interview.round}</span><ArrowUpRight size={14} /></Link>)}</div></section>)}</div>
    : <div className="empty-inline">还没有可复练的面试记录。</div>}
    <section className="panel practice-source"><div className="panel-head"><h2>高频问题与候选口述</h2><Link href="/answers?doc=meta%2F%E6%B1%82%E8%81%8C%E5%87%86%E5%A4%87%E5%BE%85%E5%8A%9E.md">Wiki 求职待办 →</Link></div><p className="muted small">引用知识库的跨公司训练稿，不是自动读取 ChatGPT 待办；候选个人话术仍需本人确认。网页任务与 Wiki 待办分别管理。</p>{data.questions ? data.questions.sections.filter((s) => s.level === 3).map((s) => <details className="practice-question" key={s.key}><summary>{s.title}</summary><MarkdownView source={s.body} /><button className="text-button" onClick={async () => { try { await api.addTodo(`复练：${s.title}`.slice(0, 200), "", ""); reload(); } catch (e) { window.alert(e instanceof Error ? e.message : "添加失败"); } }}>＋加入我的复练任务</button></details>) : <p className="muted">高频训练稿尚未同步到此账号，请先查看关联复盘。</p>}</section>
    </div>;
}
