"use server";

import { revalidatePath } from "next/cache";
import { archiveLocalTodo, ensureActiveTodo, TODO_ARCHIVE_FILE } from "./todo-archive";
import { addLinkedTodo, updateLinkedTodo } from "./todo-document-store";
import { validateDocumentId } from "./todo-document";
import { listLinkableWikiDocuments } from "./wiki";
import { validSchedule } from "./recruitment-calendar";
import { readPins, writePin } from "./pins";
import { learningStatus, generateLearningDraft, saveLearningDraft, listLearningDocs } from "./learning";
import { randomUUID } from "node:crypto";
import { ensureApplicationForInterview, ensureSeeded, getApplications, getCompanySites, getTodos, saveApplication, saveCompanySite, setTodoDone, getDb } from "./db";
import { archivedIds, setArchived, ARCHIVE_FILE } from "./application-archive";
import type { Application } from "./types";
import { ANSWER_DOCUMENTS, createInterviewNote, findWikiDocument, readWikiDocument, saveWikiSection as saveWikiSectionFile, addWikiSection as addWikiSectionFile } from "./wiki";
import { addManualInterview } from "./manual-interviews";
import { getAllInterviews, getStoredReview } from "./interview-store";
import { validateApplicationInput, validateInterviewInput, type AnswerSummary, type ApplicationInput, type InterviewNoteInput, type Todo, type WikiDocument } from "./core";

function toTodo(row: Todo): Todo {
  return { id: String(row.id), title: row.title, due_date: row.due_date, done: Boolean(row.done), interview_id: row.interview_id, document_id: row.document_id || "" };
}

export async function getOverview() {
  await ensureSeeded();
  const [interviews, applications, todos] = await Promise.all([getAllInterviews(), getApplications(), getTodos()]);
  return { interviews, applications, todos: todos.map(toTodo) };
}

export async function getInterviewsList() {
  return getAllInterviews();
}

export async function getQuestionIndex() {
  const interviews = await getAllInterviews();
  const entries = await Promise.all(interviews.map(async (item) => [item.id, item.reviewId ? (await readWikiDocument(item.reviewId)).sections.map((section) => section.title).join(" ") : ""] as const));
  return Object.fromEntries(entries);
}

export async function getReview(id: string) {
  return getStoredReview(id);
}

export async function getAnswerSummaries() {
  const items = [...ANSWER_DOCUMENTS, ...(await listLearningDocs()).map((id) => ({ id, category: "学习入库", description: "外部资料学习草稿；个人事实与技术细节需核验" }))];
  return Promise.all(items.map(async (item): Promise<AnswerSummary> => {
    const doc = await readWikiDocument(item.id);
    return { ...item, title: doc.title, sectionTitles: doc.sections.map((section) => section.title), searchText: doc.content };
  }));
}

export async function getAnswerDoc(id: string): Promise<WikiDocument | null> {
  if (!ANSWER_DOCUMENTS.some((item) => item.id === id) && !(await listLearningDocs()).includes(id)) return null;
  return readWikiDocument(id);
}

export async function resolveWikiTarget(target: string) {
  return findWikiDocument(target);
}

export async function getWikiDocument(id: string) {
  return readWikiDocument(id);
}

async function allowedDocIds(): Promise<Set<string>> {
  return new Set<string>([
    ...ANSWER_DOCUMENTS.map((doc) => doc.id),
    ...(await listLearningDocs()),
    ...(await getAllInterviews()).flatMap((interview) => interview.reviewId ? [interview.reviewId] : []),
  ]);
}

export async function isEditableDoc(id: string) {
  return (await allowedDocIds()).has(id);
}

export async function saveWikiSectionApi(id: string, key: string, body: string, expectedVersion: string) {
  if (!(await allowedDocIds()).has(id)) throw new Error("此文档不在网页编辑范围内");
  return saveWikiSectionFile(id, key, body, expectedVersion);
}

export async function addWikiSectionApi(id: string, title: string, body: string, expectedVersion: string) {
  if (!(await allowedDocIds()).has(id)) throw new Error("此文档不在网页编辑范围内");
  return addWikiSectionFile(id, title, body, expectedVersion);
}

export async function getApplicationsList() {
  await ensureSeeded();
  return getApplications();
}

export async function getCompanySitesList() {
  return getCompanySites();
}

export async function saveApplicationApi(input: ApplicationInput) {
  await ensureSeeded();
  const clean = validateApplicationInput(input);
  if (clean.id === "new") clean.id = randomUUID();
  const existing = (await getApplications()).find((item) => item.id === clean.id);
  if (existing && (existing.company !== clean.company || existing.role !== clean.role)) {
    throw new Error("已有岗位的公司和岗位名称不能在此修改");
  }
  if (!existing && (await getApplications()).some((item) => item.company === clean.company && item.role === clean.role)) {
    throw new Error("该公司和岗位已经在看板中");
  }
  if ((await getArchivedApplications()).some((item) => item.company === clean.company && item.role === clean.role)) throw new Error("该岗位在回收站中，请先恢复记录，避免重复创建");
  saveApplication({
    id: clean.id, company: clean.company, role: clean.role, status: clean.status, applied_at: clean.applied_at,
    next_action: clean.next_action, next_action_date: clean.next_action_date, notes: clean.notes,
  });
  const currentSite = getCompanySites().find((site) => site.company === clean.company);
  if (clean.career_url && clean.career_url !== currentSite?.url) saveCompanySite(clean.company, clean.career_url, "自定义招聘入口");
  revalidatePath("/");
  revalidatePath("/applications");
}

export async function createInterviewApi(input: InterviewNoteInput) {
  await ensureSeeded();
  const clean = validateInterviewInput(input);
  const reviewId = await createInterviewNote(clean);
  const id = `m-${randomUUID()}`;
  addManualInterview({ id, date: clean.date, company: clean.company, role: clean.role, round: clean.round, optimization: clean.optimization, review_id: reviewId });
  ensureApplicationForInterview(clean.company, clean.role);
  revalidatePath("/");
  revalidatePath("/interviews");
  revalidatePath("/applications");
  revalidatePath("/practice");
  return id;
}

export async function getLinkableDocuments() { return listLinkableWikiDocuments(); }
async function checkTodoDocument(id?: string) {
  if (id === undefined) return;
  validateDocumentId(id);
  if (id && !(await listLinkableWikiDocuments()).some((doc) => doc.id === id)) throw new Error("关联文档不存在，请重新选择");
}
export async function addTodoApi(title: string, dueDate: string, interviewId: string, documentId = "") {
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length > 200) throw new Error("请填写 1—200 字的任务标题");
  if (!validSchedule(dueDate)) throw new Error("请填写有效的日期与时间");
  if (interviewId && !(await getAllInterviews()).some((i) => i.id === interviewId)) throw new Error("面试记录不存在");
  await checkTodoDocument(documentId);
  addLinkedTodo(getDb(), cleanTitle, dueDate, interviewId, documentId);
  revalidatePath("/");
  revalidatePath("/practice");
}

export async function setTodoDoneApi(id: string, done: boolean) {
  ensureActiveTodo(getDb(), id);
  const numeric = Number(id);
  if (!Number.isInteger(numeric) || numeric <= 0) throw new Error("待办编号不正确");
  setTodoDone(numeric, done);
  revalidatePath("/");
  revalidatePath("/practice");
}

export async function updateTodoApi(id: string, title: string, dueDate: string, expected: { title: string; due_date: string; document_id?: string }, documentId?: string) {
  await checkTodoDocument(documentId);
  ensureActiveTodo(getDb(), id);
  updateLinkedTodo(getDb(), id, title, dueDate, expected, documentId);
  revalidatePath("/");
  revalidatePath("/practice");
}

export async function archiveTodoApi(id: string) {
  archiveLocalTodo(getDb(), id, true);
  revalidatePath("/"); revalidatePath("/practice");
}
export async function restoreTodoApi(id: string) {
  archiveLocalTodo(getDb(), id, false);
  revalidatePath("/"); revalidatePath("/practice");
}
export async function getArchivedTodosApi() {
  const ids = archivedIds(TODO_ARCHIVE_FILE);
  return (await getTodos(true)).filter((todo) => ids.has(todo.id)).map(toTodo);
}

export async function getAnswerPins() { return readPins(); }
export async function getArchivedApplications(): Promise<Application[]> {
  await ensureSeeded();
  const ids = archivedIds(ARCHIVE_FILE);
  return (getDb().prepare("SELECT * FROM applications ORDER BY company, role").all() as unknown as Application[]).filter((a) => ids.has(a.id));
}
export async function archiveApplication(id: string) {
  if (!(await getApplications()).some((a) => a.id === id)) throw new Error("投递记录不存在或已在回收站");
  setArchived(ARCHIVE_FILE, id, true);
  revalidatePath("/"); revalidatePath("/applications"); revalidatePath("/companies");
}
export async function restoreApplication(id: string) {
  if (!(await getArchivedApplications()).some((a) => a.id === id)) throw new Error("回收站记录不存在");
  setArchived(ARCHIVE_FILE, id, false);
  revalidatePath("/"); revalidatePath("/applications"); revalidatePath("/companies");
}
export async function setAnswerPin(id: string, pinned: boolean) {
  if (!(await allowedDocIds()).has(id)) throw new Error("该文档不在回答库范围内");
  if (typeof pinned !== "boolean") throw new Error("置顶参数错误");
  await writePin(id, pinned);
}
export async function getLearningStatus() { return learningStatus(); }
export async function generateLearning(input: { title: string; sourceUrl: string; text: string; consent: boolean; image?: { name: string; data: string } }) {
  const result = await generateLearningDraft(input);
  const id = await saveLearningDraft({ title: result.title, markdown: result.markdown, source: result.source, confirmed: false, asDraft: true });
  revalidatePath("/answers");
  return { ...result, id };
}
export async function saveLearning(input: { title: string; markdown: string; source: string; confirmed: boolean; asDraft?: boolean }) {
  const id = await saveLearningDraft(input); revalidatePath("/answers"); return id;
}
