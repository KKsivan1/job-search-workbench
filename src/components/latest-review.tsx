"use client";
import Link from "next/link";
import { useState } from "react";
import { api, useAsync } from "@/lib/data-provider";
import { extractReviewQuestions, type Interview } from "@/lib/core";
import { MarkdownView } from "./markdown-view";

export function LatestReview({ interviews, onAdded }: { interviews: Interview[]; onAdded?: () => void }) {
  const latest = [...interviews].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
  const { data, error, loading } = useAsync(() => latest ? api.getReview(latest.id) : Promise.resolve(null), [latest?.id]);
  const [index, setIndex] = useState(0);
  if (!latest) return <p className="empty-inline">录入第一场面试后，这里会显示原答与优化方向。</p>;
  if (loading) return <p className="muted small">正在提取最近一场面试的复盘…</p>;
  const questions = data ? extractReviewQuestions(data.doc) : [];
  const q = questions[Math.min(index, questions.length - 1)];
  return <section className="latest-review"><div className="panel-head"><div><span className="eyebrow">LAST INTERVIEW · {latest.date}</span><h3>{latest.company} · 原答对照</h3></div><Link href={`/interviews/view?id=${encodeURIComponent(latest.id)}`}>完整复盘 →</Link></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {q ? <><label className="review-select">选择复练问题<select value={Math.min(index, questions.length - 1)} onChange={(e) => setIndex(Number(e.target.value))}>{questions.map((item, i) => <option key={item.key} value={i}>{item.title}</option>)}</select></label><div className="review-question"><span className="eyebrow">面试官问题</span><MarkdownView source={q.question} compact /></div><details className="review-original" open><summary>我的原始回答（整理版）</summary><MarkdownView source={q.original || "该题没有独立原答，请查看完整复盘。"} compact /></details><div className="review-improved"><span className="eyebrow">候选优化回答 · 不新增个人事实</span><MarkdownView source={q.improved || "该题的优秀回答尚未补齐，请在复盘中补充。"} compact /></div><details open><summary>没答好在哪里 / 应往哪个方向深入</summary><MarkdownView source={q.analysis || latest.optimization} compact /></details><AddPractice key={q.key} title={q.title} interviewId={latest.id} onAdded={onAdded} /></> : <><p>{latest.optimization}</p><p className="muted small">尚未识别到逐题原答与优化回答，保留原文，不自动编写。</p></>}
  </section>;
}
function AddPractice({ title, interviewId, onAdded }: { title: string; interviewId: string; onAdded?: () => void }) {
  const [state, setState] = useState("");
  return <button className="text-button" disabled={Boolean(state)} onClick={async () => { setState("加入中…"); try { await api.addTodo(`复练：${title}`.slice(0, 200), "", interviewId); setState("已加入复练任务"); onAdded?.(); } catch (e) { setState(""); window.alert(e instanceof Error ? e.message : "加入失败"); } }}>{state || "＋加入复练任务"}</button>;
}
