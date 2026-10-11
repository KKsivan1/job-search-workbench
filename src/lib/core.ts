// Shared pure logic for both the local (SQLite + Obsidian Wiki) and the
// CloudBase (NoSQL + js-sdk) data layers. Must stay free of Node-only APIs.

import { sha256 } from "js-sha256";
import { STATUSES, type Application, type CompanySite, type Todo } from "./types";

export { STATUSES } from "./types";
export type { Application, ApplicationStatus, CompanySite, Todo } from "./types";

export const ANSWER_DOCUMENTS = [
  { id: "questions/自我介绍模板.md", category: "核心口述", description: "填写自己的真实经历，不包含任何个人预置数据" },
  { id: "questions/interview-core/复练方法.md", category: "高频问答", description: "问题、原回答、优化回答和下一步" },
  { id: "meta/求职准备待办.md", category: "复习计划", description: "个人准备清单模板" },
] as const;

export const DEFAULT_PINNED = ["questions/自我介绍模板.md"];

export type ReviewQuestion = { title: string; question: string; original: string; improved: string; analysis: string; key: string };
export function extractReviewQuestions(doc: WikiDocument): ReviewQuestion[] {
  return doc.sections.filter((s) => s.level === 3 && /^Q\d+[｜|.、\s]/i.test(s.title)).map((section) => {
    const blocks = [...section.body.matchAll(/^> \[!(?:quote|tip|note)\][+-]?[^\r\n]*\r?\n((?:>[^\r\n]*(?:\r?\n|$))*)/gm)];
    const block = (term: RegExp) => {
      const m = blocks.find((b) => term.test(b[0].split("\n")[0]));
      return m?.[1].replace(/^> ?/gm, "").replace(/^\*\*时间：\*\*.*\r?\n/m, "").trim() || "";
    };
    const improved = block(/优秀|推荐|优化回答/) || section.body.match(/\*\*优秀回答[^\r\n]*\*\*\s*\r?\n\s*((?:>[^\r\n]*(?:\r?\n|$))*)/)?.[1]?.replace(/^> ?/gm, "").trim() || "";
    const analysis = section.body.match(/\*\*(?:主要问题与解析|问题与解析|解析)[^\r\n]*\*\*\s*([\s\S]*?)(?=\n\*\*|$)/)?.[1]?.trim() || "";
    return { title: section.title, question: block(/面试官|原问题/) || section.title, original: block(/原始回答|原有回答|我的回答/), improved, analysis, key: section.key };
  }).filter((q) => q.original || q.improved);
}

export const TIMELINE_ID = "meta/面试时间线.md";
export const MAPPING_ID = "meta/面试问答映射表.md";

// Only company-owned recruitment pages or links explicitly published by the company are seeded.
// Recruitment outcomes are never inferred from these pages or from interview rounds.
export const INITIAL_COMPANY_SITES: CompanySite[] = [];

export type WikiSection = {
  key: string;
  title: string;
  level: number;
  start: number;
  bodyStart: number;
  end: number;
  body: string;
};

export type WikiDocument = {
  id: string;
  title: string;
  content: string;
  raw: string;
  version: string;
  sections: WikiSection[];
  frontmatter: Record<string, unknown>;
};

export function checksum(text: string): string {
  return sha256(text);
}

export function parseSections(source: string): WikiSection[] {
  const headings = [...source.matchAll(/^(#{2,4})[ \t]+(.+)\r?$/gm)].map((match) => ({
    start: match.index,
    level: match[1].length,
    title: match[2].trim(),
  }));
  return headings.map((heading, index) => {
    const next = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level);
    const end = next?.start ?? source.length;
    const headingEnd = source.indexOf("\n", heading.start);
    const bodyStart = headingEnd < 0 ? end : headingEnd + 1;
    return {
      key: `${heading.start}`,
      title: heading.title,
      level: heading.level,
      start: heading.start,
      bodyStart,
      end,
      body: source.slice(bodyStart, end),
    };
  });
}

export function splitFrontmatter(raw: string): { frontmatter: Record<string, unknown>; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { frontmatter: {}, content: raw };
  const block = match[1];
  const title = block.match(/^title:\s*(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  return { frontmatter: title ? { title } : {}, content: raw.slice(match[0].length) };
}

export function makeWikiDocument(id: string, raw: string): WikiDocument {
  const { frontmatter, content } = splitFrontmatter(raw);
  const fallbackTitle = id.replaceAll("\\", "/").split("/").pop()?.replace(/\.md$/i, "") ?? id;
  return {
    id,
    title: String(frontmatter.title || fallbackTitle),
    content,
    raw,
    version: checksum(raw),
    sections: parseSections(raw),
    frontmatter,
  };
}

export function replaceSection(source: string, key: string, body: string): string {
  const section = parseSections(source).find((item) => item.key === key);
  if (!section) throw new Error("章节已变化，请重新加载文档");
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const normalized = body.replace(/\r?\n/g, newline).replace(/\s*$/, "") + newline + newline;
  return source.slice(0, section.bodyStart) + normalized + source.slice(section.end);
}

export function appendSection(source: string, title: string, body: string): string {
  const cleanTitle = title.trim();
  if (!cleanTitle || /[\r\n]/.test(cleanTitle)) throw new Error("请填写单行章节标题");
  if (parseSections(source).some((section) => section.level === 2 && section.title === cleanTitle)) {
    throw new Error("已有同名章节，请换一个标题");
  }
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const normalizedBody = body.replace(/\r?\n/g, newline).trimEnd();
  return source.trimEnd() + newline + newline + `## ${cleanTitle}` + newline + (normalizedBody ? normalizedBody + newline : newline);
}

export type Interview = {
  id: string;
  date: string;
  company: string;
  role: string;
  round: string;
  confidence: string;
  reviewTitle: string;
  reviewId: string | null;
  optimization: string;
  longTermLinks: string[];
};

export function canonicalCompany(company: string): string {
  return company === "抖音电商" || company === "字节跳动" ? "字节跳动（抖音电商）" : company;
}

export function canonicalRole(role: string): string {
  return role.replace(" AI 商家产品实习生", " AI 商家产品").replace(/，具体名称待确认$/, "（待确认）");
}

export function parseTimeline(content: string): Omit<Interview, "reviewId" | "optimization" | "longTermLinks">[] {
  return content.split(/\r?\n/).flatMap((line) => {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 8 || !/^\d{2}$/.test(cells[0])) return [];
    const match = cells[7].match(/\[\[([^\]]+)\]\]/);
    return [{
      id: cells[0], date: cells[1], company: canonicalCompany(cells[2]), role: cells[3],
      round: cells[4], confidence: cells[5], reviewTitle: match?.[1] ?? "复盘待补",
    }];
  });
}

export function parseMapping(content: string): Map<string, { optimization: string; longTermLinks: string[] }> {
  const result = new Map<string, { optimization: string; longTermLinks: string[] }>();
  const section = content.split("## 真实面试")[1]?.split("## 跨场次高频问题迁移")[0] ?? "";
  for (const line of section.split(/\r?\n/)) {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 5 || !/^\d{2}-\d{2}/.test(cells[0])) continue;
    const review = cells[2].match(/\[\[([^\]]+)\]\]/)?.[1];
    if (review) result.set(review, { optimization: cells[3], longTermLinks: [...cells[4].matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]) });
  }
  return result;
}

export const PRACTICE_THEMES = [
  { title: "项目表达与贡献", terms: ["项目", "贡献", "产出", "系统解释", "口径", "工程化"] },
  { title: "AI 架构与技术边界", terms: ["Agent", "Skill", "Workflow", "LLM", "Harness", "模型", "OCR", "工具"] },
  { title: "评测、指标与数据", terms: ["评测", "指标", "数据", "SQL", "Bad Case", "结果"] },
  { title: "产品判断与业务", terms: ["业务", "场景", "取舍", "替代", "功能", "用户", "安全"] },
  { title: "动机与行为表达", terms: ["动机", "职业", "行为", "Why", "稳定性", "规划", "离职"] },
] as const;

export function getPracticeGroups(interviews: Interview[]) {
  return PRACTICE_THEMES.map((theme) => ({
    title: theme.title,
    interviews: interviews.filter((interview) => theme.terms.some((term) => interview.optimization.toLowerCase().includes(term.toLowerCase()))),
  })).sort((a, b) => b.interviews.length - a.interviews.length);
}

export function applicationIdFor(company: string, role: string): string {
  return checksum(`${company}\0${role}`).slice(0, 16);
}

export type InterviewNoteInput = { date: string; company: string; role: string; round: string; questions: string; optimization: string };

export function randomIdFragment(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-4);
}

export function buildInterviewNote(input: InterviewNoteInput): { id: string; title: string; content: string } {
  const id = `questions/interview-core/${input.date}-工作台面试记录-${randomIdFragment()}.md`;
  const title = `${input.date} ${input.company} ${input.role}面试记录`;
  const content = [
    "---",
    `title: ${JSON.stringify(title)}`,
    `date: ${input.date}`,
    `company: ${JSON.stringify(input.company)}`,
    `role: ${JSON.stringify(input.role)}`,
    "source: 工作台手动录入",
    "---",
    `# ${title}`,
    "",
    "> [!note] 记录说明",
    "> 这是手动新建的面试记录。现场内容与判断请逐步补全，避免把回忆写成逐字稿。",
    "",
    "## 面试概况",
    `- 公司：${input.company}`,
    `- 岗位：${input.role}`,
    `- 日期：${input.date}`,
    `- 轮次：${input.round}`,
    "",
    "## 现场问题与原有回答",
    input.questions.trim() || "待补充现场问题与自己的原回答。",
    "",
    "## 解析与优化建议",
    input.optimization.trim() || "待复盘。",
    "",
    "## 优秀回答案例",
    "待结合个人知识库与真实经历补充。",
    "",
    "## 最终评分与下一步",
    "待评估。",
    "",
  ].join("\n");
  return { id, title, content };
}

export type AnswerSummary = { id: string; title: string; category: string; description: string; sectionTitles: string[]; searchText: string };

export type ApplicationInput = {
  id: string;
  company: string;
  role: string;
  status: (typeof STATUSES)[number];
  applied_at: string;
  next_action: string;
  next_action_date: string;
  notes: string;
  career_url: string;
};

export function validateApplicationInput(input: ApplicationInput): ApplicationInput {
  const clean = {
    id: input.id, company: input.company.trim(), role: input.role.trim(), status: input.status,
    applied_at: (input.applied_at || "").slice(0, 20), next_action: (input.next_action || "").slice(0, 250),
    next_action_date: (input.next_action_date || "").slice(0, 20), notes: (input.notes || "").slice(0, 3000),
    career_url: (input.career_url || "").trim(),
  };
  if (!clean.id || clean.id.length > 80) throw new Error("投递记录编号不正确");
  if (!clean.company || clean.company.length > 100) throw new Error("请填写公司名称");
  if (!clean.role || clean.role.length > 150) throw new Error("请填写岗位名称");
  if (!STATUSES.includes(clean.status)) throw new Error("招聘阶段不正确");
  if (clean.career_url) {
    let url: URL;
    try { url = new URL(clean.career_url); } catch { throw new Error("招聘网址格式不正确"); }
    if (url.protocol !== "https:") throw new Error("招聘网址须为 HTTPS 链接");
    clean.career_url = url.toString();
  }
  return clean;
}

export function validateInterviewInput(input: InterviewNoteInput): InterviewNoteInput {
  const clean = {
    date: input.date, company: input.company.trim(), role: input.role.trim(), round: input.round.trim(),
    questions: input.questions ?? "", optimization: (input.optimization || "").trim(),
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean.date)) throw new Error("请填写正确的面试日期");
  for (const [label, value, max] of [["公司", clean.company, 100], ["岗位", clean.role, 150], ["轮次", clean.round, 100]] as const) {
    if (!value) throw new Error(`请填写${label}`);
    if (value.length > max || /[\r\n]/.test(value)) throw new Error(`${label}格式不正确`);
  }
  if (clean.questions.length > 20_000) throw new Error("现场问题内容过长");
  if (clean.optimization.length > 2_000) throw new Error("优化点内容过长");
  return clean;
}

export type AuthApi = {
  getSession(): Promise<{ uid: string; username: string } | null>;
  signIn(username: string, password: string): Promise<void>;
  beginRegistration(email: string, password: string): Promise<{ verify: (code: string) => Promise<void> }>;
  openWorkspace(): Promise<void>;
  signOut(): Promise<void>;
  isInvited(): Promise<boolean>;
};

export type DataApi = {
  mode: "local" | "cloud";
  auth?: AuthApi;
  getOverview(): Promise<{ interviews: Interview[]; applications: Application[]; todos: Todo[] }>;
  getInterviews(): Promise<Interview[]>;
  getQuestionIndex(): Promise<Record<string, string>>;
  getReview(id: string): Promise<{ interview: Interview; doc: WikiDocument } | null>;
  getAnswerSummaries(): Promise<AnswerSummary[]>;
  getAnswerDoc(id: string): Promise<WikiDocument | null>;
  resolveWikiTarget(target: string): Promise<string | null>;
  getWikiDocument(id: string): Promise<WikiDocument | null>;
  isEditableDoc(id: string): Promise<boolean>;
  saveWikiSection(id: string, key: string, body: string, expectedVersion: string): Promise<string>;
  addWikiSection(id: string, title: string, body: string, expectedVersion: string): Promise<string>;
  getApplications(): Promise<Application[]>;
  getCompanySites(): Promise<CompanySite[]>;
  saveApplication(input: ApplicationInput): Promise<void>;
  archiveApplication(id: string): Promise<void>;
  restoreApplication(id: string): Promise<void>;
  getArchivedApplications(): Promise<Application[]>;
  createInterview(input: InterviewNoteInput): Promise<string>;
  getLinkableDocuments(): Promise<import("./todo-document").TodoDocument[]>;
  addTodo(title: string, dueDate: string, interviewId: string, documentId?: string): Promise<void>;
  updateTodo(id: string, title: string, dueDate: string, expected: { title: string; due_date: string; document_id?: string }, documentId?: string): Promise<void>;
  setTodoDone(id: string, done: boolean): Promise<void>;
  archiveTodo(id: string): Promise<void>;
  restoreTodo(id: string): Promise<void>;
  getArchivedTodos(): Promise<Todo[]>;
  getAnswerPins(): Promise<Record<string, boolean>>;
  setAnswerPin(id: string, pinned: boolean): Promise<void>;
  getLearningStatus(): Promise<{ available: boolean; description: string }>;
  generateLearning(input: { title: string; sourceUrl: string; text: string; consent: boolean; image?: { name: string; data: string } }): Promise<{ title?: string; id?: string; markdown: string; source: string; quality?: { checks: { name: string; passed: boolean }[]; warnings: string[]; attempts: number; model: string; durationMs: number; tokens: number } }>;
  saveLearning(input: { title: string; markdown: string; source: string; confirmed: boolean; asDraft?: boolean }): Promise<string>;
};
