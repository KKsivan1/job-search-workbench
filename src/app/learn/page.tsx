"use client";
import { useState } from "react";
import Link from "next/link";
import { api, useAsync, isCloud } from "@/lib/data-provider";
import { MarkdownView } from "@/components/markdown-view";
import { splitLearningInput, type LearningImage } from "@/lib/learning-input";

type Task = { label: string; sourceUrl: string; text: string; image?: LearningImage; state: "等待" | "生成中" | "已归档" | "失败"; error?: string; id?: string; markdown?: string };
function fileImage(file: File): Promise<LearningImage> {
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 4_194_304) return Promise.reject(new Error("图片须为 4MB 以内的 PNG/JPG"));
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve({ name: file.name || "粘贴截图", data: String(reader.result) });
    reader.onerror = () => reject(new Error("图片读取失败")); reader.readAsDataURL(file);
  });
}
export default function LearningPage() {
  const { data: status, error: statusError } = useAsync(() => api.getLearningStatus(), []);
  const [input, setInput] = useState(""); const [title, setTitle] = useState("");
  const [images, setImages] = useState<LearningImage[]>([]); const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [preview, setPreview] = useState<number | null>(null);
  async function addImages(files: File[]) {
    try {
      if (files.length + images.length > 10) throw new Error("每批最多 10 张图片");
      const added = await Promise.all(files.map(fileImage)); setImages((current) => [...current, ...added]); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "图片读取失败"); }
  }
  async function run(queue: Task[]) {
    setBusy(true); setError(""); setTasks(queue); setPreview(null);
    const next = [...queue];
    for (let index = 0; index < next.length; index++) {
      if (next[index].state === "已归档") continue;
      next[index] = { ...next[index], state: "生成中", error: undefined }; setTasks([...next]);
      try {
        const result = await api.generateLearning({ title: queue.length === 1 ? title : "", sourceUrl: next[index].sourceUrl, text: next[index].text, image: next[index].image, consent: true });
        next[index] = { ...next[index], label: result.title || next[index].label, state: "已归档", id: result.id, markdown: result.markdown };
      } catch (e) { next[index] = { ...next[index], state: "失败", error: e instanceof Error ? e.message : "生成失败" }; }
      setTasks([...next]);
    }
    setBusy(false);
  }
  function generate() {
    const items: Task[] = [
      ...splitLearningInput(input).map((item) => ({ ...item, label: item.sourceUrl || "粘贴文稿", state: "等待" as const })),
      ...images.map((image) => ({ sourceUrl: "", text: "", image, label: image.name, state: "等待" as const })),
    ];
    if (!items.length) { setError("只需粘贴链接、正文，或添加一张文字截图。"); return; }
    if (items.length > 10) { setError("每批最多 10 份资料，请分批提交。"); return; }
    void run(items);
  }
  const selected = preview !== null ? tasks[preview] : undefined;
  return <div className="page-wrap">
    <div className="page-heading"><span className="eyebrow">SOURCE → DRAFT → ANSWER LIBRARY</span><h1>把资料放进来，其余交给工作台。</h1><p>粘贴链接、文稿，或上传文字截图。自动提取、命名、生成并归档到回答库，不再逐篇填写标题。</p></div>
    <section className="panel learning-input">
      <label>资料输入 · 唯一必填项<textarea value={input} disabled={busy} maxLength={60_000} rows={9} onChange={(e) => setInput(e.target.value)} onPaste={(e) => {
        const files = [...e.clipboardData.files].filter((file) => file.type.startsWith("image/"));
        if (files.length) { e.preventDefault(); void addImages(files); }
      }} placeholder={"可以直接粘贴：\n• 小红书笔记 / ColorOS 面试录音分享链接\n• 一批链接（每行一条）\n• 面经、文章、已转写文稿\n也可以在这里粘贴截图，或在下方上传图片。"} /></label>
      <label>添加文字截图（可选，PNG/JPG，每张最多 4MB）<input type="file" accept="image/png,image/jpeg" multiple disabled={busy} onChange={(e) => { void addImages([...e.target.files || []]); e.target.value = ""; }} /></label>
      {images.length > 0 && <ul>{images.map((image, index) => <li key={`${image.name}-${index}`}>{image.name} <button className="text-button" disabled={busy} onClick={() => setImages((current) => current.filter((_, at) => at !== index))}>移除</button></li>)}</ul>}
      <details><summary>可选设置：自定义单篇标题</summary><label>标题（不填自动命名；批量时分别命名）<input value={title} maxLength={120} disabled={busy} onChange={(e) => setTitle(e.target.value)} /></label></details>
      <p className="muted small">点击生成即授权将本次提取的文字和相关知识页目录发送给 DeepSeek；图片先在本机 OCR，不发送私人项目全文。请勿提交密钥、未经授权的公司资料。</p>
      <button className="primary-button" disabled={!status?.available || busy} onClick={generate}>{busy ? "正在逐份处理…" : "生成草稿并归档到回答库"}</button>
      <p className="muted small">{statusError || (!status ? "检查生成服务…" : !status.available ? status.description : "DeepSeek 已就绪 · 每份通常 1—3 分钟 · 成功一份即保存一份，失败不影响其他资料。")}</p>
      <details><summary>哪些链接能直接读取？</summary><p>{isCloud ? "云端支持白名单公开技术文章和可读取的完整小红书文字页。小红书短链、ColorOS动态分享页、抖音视频暂请粘贴完整正文/转写稿或文字截图。" : "公开小红书文字笔记尝试读取正文；ColorOS 分享页读取「原文」转写；公开技术文章继续支持。"}登录、验证码、风控和过期链接不会绕过；纯音视频尚未接入 ASR，不会拿标题或摘要编造内容。</p><p>图片仅识别文字，不解析图表语义。{isCloud ? "截图在浏览器识别；草稿保存在当前账号云端回答库，不自动同步本地Wiki。" : "草稿保存在本地Wiki；不自动同步云端。"}</p></details>
    </section>
    {error && <p className="form-error" role="alert">{error}</p>}
    {tasks.length > 0 && <section className="panel learning-draft"><div className="panel-head"><h2>本批处理 · {tasks.filter((task) => task.state === "已归档").length}/{tasks.length} 已归档</h2>{!busy && tasks.some((task) => task.state === "失败") && <button className="text-button" onClick={() => void run(tasks)}>重试失败项</button>}</div>
      <p className="muted small">归档的是「待核验草稿」，不是已确认的个人事实或最佳口述稿。完成后可在回答库「学习入库」分类中阅读、编辑。</p>
      <ul className="learning-queue">{tasks.map((task, index) => <li key={index}><strong>{index + 1}. {task.label}</strong><span role="status">{task.state}</span>{task.error && <p className="form-error">{task.error}</p>}{task.id && <Link className="text-link" href={`/answers?doc=${encodeURIComponent(task.id)}`}>在回答库阅读 →</Link>}{task.markdown && <button className="text-button" onClick={() => setPreview(preview === index ? null : index)}>预览草稿</button>}</li>)}</ul>
      {busy && <p role="status">请暂时保留此页以继续处理剩余队列；已经完成的草稿已保存到 Wiki，刷新不会丢失。</p>}
    </section>}
    {selected?.markdown && <section className="panel learning-draft"><h2>{selected.label} · 待核验草稿</h2><MarkdownView source={selected.markdown} /></section>}
  </div>;
}
