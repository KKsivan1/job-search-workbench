import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { checksum, ANSWER_DOCUMENTS } from "./core";
import { wikiPath, saveChangedFile } from "./wiki";
import { deepseekConfig, generateCheckedLearning } from "./deepseek-learning";
import { withLearningWikiLocks } from "./learning-lock";
import { supportsBrowserSource, readBrowserSource } from "./learning-browser-source";
import { readLearningImage } from "./learning-image";
import { suggestLearningTitle, type LearningInput } from "./learning-input";

const dataRoot = path.resolve(process.cwd(), "data", "learning");
let generating = false;
export function learningStatus() {
  const { key, model } = deepseekConfig();
  return { available: Boolean(key), description: key ? `DeepSeek · ${model}：来源提取 → 目录关联 → 生成 → 质量检查 → 二次校对 → 本人确认入库。每篇最多三次模型调用，仅发送输入资料和相关页面目录，不发送整个私人 Wiki；密钥仅在服务端。` : "请在服务端配置 DEEPSEEK_API_KEY；密钥不会保存在浏览器。" };
}
export function validateLearningInput(input: LearningInput) {
  if (!input.consent) throw new Error("请先确认资料可以发送给模型服务");
  const title = input.title.trim();
  if (title.length > 120 || /[\r\n]/.test(title)) throw new Error("标题须为 120 字以内的单行文字；不填会自动命名");
  if (input.text.length > 60_000) throw new Error("正文最多 6 万字，请分批整理");
  if (/sk-[a-z0-9]{20,}/i.test(input.text + input.sourceUrl)) throw new Error("资料中疑似包含 API Key，请移除密钥后再生成");
  if (input.sourceUrl) {
    const url = new URL(input.sourceUrl);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("来源须为不含账号密码的 HTTPS 链接");
  }
  return { ...input, title, text: input.text.trim() };
}

// URL extraction is intentionally narrow: never fetch arbitrary internal addresses.
// Authenticated pages and recordings need the user to paste the accessible text.
async function sourceText(url: string): Promise<{ text: string; title: string }> {
  const parsed = new URL(url);
  if (supportsBrowserSource(parsed)) return readBrowserSource(parsed);
  const hosts = new Set(["github.com", "raw.githubusercontent.com", "www.anthropic.com", "docs.anthropic.com", "platform.claude.com", "xiaolinnote.com", "www.xiaolinnote.com"]);
  if (!hosts.has(parsed.hostname) || parsed.port) throw new Error("这个网站暂不支持自动提取。请在同一输入框粘贴完整正文/转写稿，或上传文字截图；不要只填链接。");
  const response = await fetch(parsed, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  if (!response.ok) throw new Error(`来源读取失败（${response.status}），请粘贴正文`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("页面无可读正文");
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 1_000_000) throw new Error("来源页面过大，请粘贴正文"); chunks.push(value); } }
  finally { await reader.cancel(); }
  const buffer = Buffer.concat(chunks);
  const html = buffer.toString("utf8");
  if (!(response.headers.get("content-type") || "").includes("html")) return { text: html, title: suggestLearningTitle(html) };
  const article = html.match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i)?.[1] || html;
  const text = article.replace(/<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<\/(?:p|div|h[1-6]|li|section)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (original, hex, decimal) => {
    const point = parseInt(hex || decimal, hex ? 16 : 10);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : original;
  }).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n\n").trim();
  if (text.length < 100) throw new Error("未提取到有效正文，请粘贴资料");
  if (text.length > 60_000) throw new Error("来源正文过长，请分批粘贴");
  return { text, title: html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1].slice(0, 80) || suggestLearningTitle(text) };
}

export async function generateLearningDraft(input: LearningInput) {
  const clean = validateLearningInput(input);
  if (generating) throw new Error("已有资料正在生成，请稍后再试");
  generating = true;
  try {
    const extracted = clean.image ? { text: await readLearningImage(clean.image), title: clean.image.name.replace(/\.[^.]+$/, "") } : clean.text ? { text: clean.text, title: suggestLearningTitle(clean.text) } : clean.sourceUrl ? await sourceText(clean.sourceUrl) : { text: "", title: "" };
    const text = extracted.text;
    clean.title = (clean.title || extracted.title || suggestLearningTitle(text)).replace(/[\r\n]/g, " ").slice(0, 120).trim();
    if (text.length < 30) throw new Error("请粘贴至少 30 字的有效资料，或填写支持提取的来源链接");
    if (text.length > 60_000 || /sk-[a-z0-9]{20,}/i.test(text)) throw new Error("提取正文过长或含疑似密钥，请清理后粘贴正文");
    const sourceHash = checksum(text);
    for (const id of await listLearningDocs()) {
      const existing = await fs.readFile(wikiPath(id), "utf8");
      if (existing.includes(`source_sha256: ${sourceHash}`)) throw new Error(`相同资料已入库：${id}。请在回答库补充已有页，避免重复生成。`);
    }
    const token = randomUUID();
    // Only page titles/descriptions leave the machine. No private answer or project text.
    const related = (await Promise.all(ANSWER_DOCUMENTS.filter((d) => d.category.startsWith("AI") || d.category.includes("产品")).map(async (d) => {
      try { await fs.access(wikiPath(d.id)); return { target: d.id.replace(/\.md$/, ""), description: d.description }; }
      catch { return null; }
    }))).filter((item) => item !== null);
    const result = await generateCheckedLearning(clean.title, clean.sourceUrl, text, related);
    await fs.mkdir(dataRoot, { recursive: true });
    await fs.writeFile(path.join(dataRoot, `${token}.json`), JSON.stringify({ title: clean.title, sourceUrl: clean.sourceUrl, text, sha256: checksum(text), markdown: result.markdown, evidenceQuotes: result.quotes, quality: result.quality, created: new Date().toISOString() }), { flag: "wx" });
    return { title: clean.title, markdown: result.markdown, source: token, quality: result.quality };
  } finally { generating = false; }
}

export async function listLearningDocs(): Promise<string[]> {
  const directory = path.dirname(wikiPath("questions/learning/_index.md"));
  try { return (await fs.readdir(directory)).filter((f) => f.endsWith(".md") && !f.startsWith("_")).map((f) => `questions/learning/${f}`); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return []; throw e; }
}
export async function saveLearningDraft(input: { title: string; markdown: string; source: string; confirmed: boolean; asDraft?: boolean }) {
  if (!input.confirmed && !input.asDraft) throw new Error("请确认个人事实与来源边界后再入库");
  if (!/^[a-f0-9-]{36}$/.test(input.source)) throw new Error("无效的草稿来源");
  if (!input.title.trim() || input.title.length > 120 || !input.markdown.trim() || input.markdown.length > 100_000) throw new Error("标题或正文格式不正确");
  const evidence = JSON.parse(await fs.readFile(path.join(dataRoot, `${input.source}.json`), "utf8"));
  if (input.asDraft && (input.markdown !== evidence.markdown || input.title !== evidence.title || !evidence.quality?.checks?.length || evidence.quality.checks.some((check: { passed: boolean }) => !check.passed))) throw new Error("自动归档仅接受质量检查通过且未改写的原始生成稿");
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  const slug = input.title.replace(/[<>:"/\\|?*\[\]#^\x00-\x1f]/g, "-").replace(/[. ]+$/g, "").slice(0, 80) || "学习资料";
  const id = `questions/learning/${date}-${slug}-${input.source.slice(0, 8)}.md`;
  const boundary = input.asDraft ? "本文是自动归档的 AI 草稿，未经本人核验；不代表本人经历或已确认的最佳回答。" : "本文由外部资料整理，经用户确认入库；第三方观点不等于本人经历。";
  const raw = `---\ntype: question\ntitle: ${JSON.stringify(input.title)}\nstatus: ${input.asDraft ? "draft" : "developing"}\nreviewed: ${!input.asDraft}\ncreated: ${date}\nupdated: ${date}\ntags: [面试题, 学习入库${input.asDraft ? ", 待核验" : ""}]\nsources: [${JSON.stringify(evidence.sourceUrl || `autumn-recruitment-hub/data/learning/${input.source}.json`)}]\nsource_sha256: ${evidence.sha256}\n---\n\n> [!warning] 来源与事实边界\n> ${boundary}技术版本和效果数字仍需核验。\n\n${input.markdown}\n`;
  return withLearningWikiLocks([id, "questions/learning/_index.md", "index.md", "log.md", "hot.md"], async () => {
  const target = wikiPath(id);
  await fs.mkdir(path.dirname(target), { recursive: true });
  try { await fs.writeFile(target, raw, { flag: "wx" }); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST" || await fs.readFile(target, "utf8") !== raw) throw new Error("目标文档已存在或被修改，未覆盖；请在回答库检查已入库文档");
  }
  try {
    const catalogId = "questions/learning/_index.md";
    const catalogPath = wikiPath(catalogId);
    try { await fs.writeFile(catalogPath, `---\ntype: meta\ntitle: 工作台学习入库索引\ncreated: ${date}\nupdated: ${date}\n---\n\n# 工作台学习入库索引\n\n外部资料候选学习稿，不自动替代个人事实台账。\n`, { flag: "wx" }); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
    const link = `[[${id.replace(/\.md$/, "")}]]`;
    const catalog = await fs.readFile(catalogPath, "utf8");
    if (!catalog.includes(link)) await saveChangedFile(catalogPath, (s) => `${s.trimEnd()}\n\n- ${link}\n`, checksum(catalog), path.join(dataRoot, "index-backups"));
    const indexPath = wikiPath("index.md");
    const index = await fs.readFile(indexPath, "utf8");
    if (!index.includes("[[questions/learning/_index|工作台学习入库]]")) await saveChangedFile(indexPath, (s) => `${s.trimEnd()}\n\n## 工作台学习入库\n\n- [[questions/learning/_index|工作台学习入库]] — 外部面经与教学资料，经本人确认的候选学习稿索引。\n`, checksum(index), path.join(dataRoot, "index-backups"));
    const marker = `学习入库来源 ${input.source}`;
    for (const meta of ["log.md", "hot.md"]) {
      const metaPath = wikiPath(meta);
      const before = await fs.readFile(metaPath, "utf8");
      if (before.includes(marker)) continue;
      const entry = `\n## ${date} — 工作台学习入库\n\n- ${link}；${marker}。来源哈希：${evidence.sha256}；模型：${evidence.quality?.model || "历史生成服务"}。${input.asDraft ? "自动归档草稿，待本人核验" : "经本人确认"}；旧知识页不自动覆盖。\n\n`;
      await saveChangedFile(metaPath, (s) => {
        const header = s.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
        const at = header?.[0].length ?? 0;
        return s.slice(0, at) + entry + s.slice(at);
      }, checksum(before), path.join(dataRoot, "index-backups"));
    }
  } catch {
    throw new Error(`文档已保存（${id}），但索引更新遇到冲突。请保留当前草稿并重试入库；正文不会被覆盖。`);
  }
  return id;
  });
}
