import { db as rawDb, cbAuth, cbApp } from "./cloudbase";
import { validSchedule } from "./recruitment-calendar";
import { validateTodoEdit } from "./todo-update";
import { documentLabel, validateDocumentId } from "./todo-document";
import { scopedDatabase, type RawDatabase } from "./scoped-database";
import {
  ANSWER_DOCUMENTS as PRIVATE_ANSWER_DOCUMENTS, INITIAL_COMPANY_SITES, MAPPING_ID, TIMELINE_ID, applicationIdFor, appendSection, buildInterviewNote,
  canonicalRole, checksum, makeWikiDocument, parseMapping, parseSections, parseTimeline,
  randomIdFragment, replaceSection, validateApplicationInput, validateInterviewInput,
  type AnswerSummary, type Application, type ApplicationInput, type AuthApi, type CompanySite, type DataApi, type Interview,
  type InterviewNoteInput, type Todo,
} from "./core";

const db = scopedDatabase(rawDb as unknown as RawDatabase, currentUid);
const ANSWER_DOCUMENTS = [...PRIVATE_ANSWER_DOCUMENTS,
  { id: "questions/自我介绍模板.md", category: "基础面试", description: "填写自己的自我介绍" },
  { id: "questions/项目经历模板.md", category: "项目经历", description: "用 STAR 整理真实项目" },
  { id: "questions/面试准备清单.md", category: "面试准备", description: "面试前后准备清单" },
].filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index);
const isLearningId = (id: string) => /^questions\/learning\/[^/]+\.md$/.test(id);

type WikiDocRow = { _id: string; content: string; version: string; ownerId: string; updatedAt: string };

async function currentUid(): Promise<string> {
  const { data } = await cbAuth.getSession();
  if (!data?.session?.user?.id) throw new Error("登录状态已失效，请重新登录");
  return data.session.user.id;
}

// ---------- auth ----------

const auth: AuthApi = {
  async getSession() {
    const { data } = await cbAuth.getSession();
    const user = data?.session?.user;
    if (!user?.id) return null;
    return { uid: user.id, username: (user as { username?: string }).username || user.id.slice(0, 8) };
  },
  async signIn(username: string, password: string) {
    resetCaches();
    const { error } = await cbAuth.signInWithPassword(username.includes("@") ? { email: username, password } : { username, password });
    if (error) throw new Error(error.message || "登录失败");
  },
  async signOut() {
    resetCaches();
    await cbAuth.signOut();
  },
  async beginRegistration(email, password) {
    resetCaches();
    const { data, error } = await cbAuth.signUp({ email, password });
    if (error) throw new Error(error.message || "注册暂不可用，请稍后重试");
    if (!data?.verifyOtp) throw new Error("注册验证服务未就绪，请联系管理员检查邮箱验证配置");
    const verifyOtp = data.verifyOtp;
    return { async verify(code) {
      const result = await verifyOtp({ token: code });
      if (result.error) throw new Error(result.error.message || "验证码无效或已过期");
      const { data: session } = await cbAuth.getSession();
      if (!session?.session?.user?.id) {
        const result = await cbAuth.signInWithPassword({ email, password });
        if (result.error) throw new Error("邮箱已验证，请使用邮箱和密码重新登录");
      }
    } };
  },
  async openWorkspace() {
    await currentUid();
    const response = await cbApp.callFunction({ name: "hub-account", data: { op: "enroll" } });
    const result = typeof response.result === "string" ? JSON.parse(response.result) : response.result;
    if (!result?.ok) throw new Error(result?.error || "个人空间初始化失败，请稍后重试");
    resetCaches();
  },
  async isInvited() {
    const uid = await currentUid();
    const result = await rawDb.collection("hub_users").where({ uid, active: true }).limit(1).get();
    return (result.data?.length ?? 0) > 0;
  },
};

// ---------- wiki documents ----------

const rawCache = new Map<string, WikiDocRow>();

async function getWikiRow(id: string): Promise<WikiDocRow | null> {
  const result = await db.collection("wiki_docs").doc(id).get();
  const raw = (result.data && !Array.isArray(result.data) ? result.data : null) as (WikiDocRow & { contentBase64?: string }) | null;
  const row = raw ? { ...raw, content: typeof raw.content === "string" ? raw.content : raw.contentBase64 ? new TextDecoder().decode(Uint8Array.from(atob(raw.contentBase64), (char) => char.charCodeAt(0))) : "" } : null;
  if (row) rawCache.set(id, row);
  return row;
}

async function listWikiIds(): Promise<string[]> {
  const result = await db.collection("wiki_docs").limit(1000).get();
  return (result.data ?? []).map((row) => String((row as { _id: string })._id));
}

async function loadInterviews(): Promise<Interview[]> {
  const [timelineRow, mappingRow] = await Promise.all([getWikiRow(TIMELINE_ID), getWikiRow(MAPPING_ID)]);
  if (!timelineRow) return [];
  const mapped = parseMapping(mappingRow?.content ?? "");
  const ids = await listWikiIds();
  return parseTimeline(timelineRow.content).map((record) => {
    const extras = mapped.get(record.reviewTitle);
    const normalizedTarget = record.reviewTitle.split("#")[0].replace(/\.md$/i, "");
    const exact = ids.find((file) => file.replace(/\.md$/, "") === normalizedTarget);
    const reviewId = exact ?? ids.find((file) => file.split("/").pop()?.replace(/\.md$/, "") === normalizedTarget.split("/").pop()) ?? null;
    return {
      ...record,
      reviewId,
      optimization: extras?.optimization ?? "待整理",
      longTermLinks: extras?.longTermLinks ?? [],
    };
  });
}

let interviewsCache: Promise<Interview[]> | null = null;
function interviews(): Promise<Interview[]> {
  if (!interviewsCache) {
    interviewsCache = loadInterviews().catch((error) => { interviewsCache = null; throw error; });
  }
  return interviewsCache;
}

function invalidateInterviews() {
  interviewsCache = null;
}

async function editableIds(): Promise<Set<string>> {
  return new Set<string>([
    ...ANSWER_DOCUMENTS.map((doc) => doc.id),
    ...(await listWikiIds()).filter(isLearningId),
    ...(await interviews()).flatMap((interview) => interview.reviewId ? [interview.reviewId] : []),
  ]);
}

async function saveDocTransformed(id: string, transform: (source: string) => string, expectedVersion: string): Promise<string> {
  const uid = await currentUid();
  const row = await getWikiRow(id);
  if (!row) throw new Error("文档不存在或无权访问");
  if (row.version !== expectedVersion || checksum(row.content) !== expectedVersion) {
    throw new Error("文档已在别处更新，请重新加载后再编辑");
  }
  const next = transform(row.content);
  const nextVersion = checksum(next);
  const now = new Date().toISOString();
  await db.collection("wiki_backups").add({
    docId: id, content: row.content, version: expectedVersion, ownerId: uid, savedAt: now,
  });
  const result = await db.collection("wiki_docs").where({ _id: id, version: expectedVersion })
    .update({ content: next, version: nextVersion, updatedAt: now });
  const updated = typeof result.updated === "number" ? result.updated : Number(result.updated ?? 0);
  if (updated !== 1) throw new Error("保存冲突：文档已在别处更新，请重新加载");
  rawCache.delete(id);
  return nextVersion;
}

// ---------- seeding ----------

let seeded: Promise<void> | undefined;

function resetCaches() {
  rawCache.clear();
  interviewsCache = null;
  seeded = undefined;
}

function ensureSeeded(): Promise<void> {
  if (!seeded) {
    seeded = (async () => {
      const uid = await currentUid();
      const applications = db.collection("applications");
      const count = await applications.count();
      if (!count?.total) {
        const records = await interviews();
        const pairs = new Set(records.map((item) => JSON.stringify([item.company, canonicalRole(item.role)])));
        for (const pair of pairs) {
          const [company, role] = JSON.parse(pair) as [string, string];
          const id = applicationIdFor(company, role);
          const now = new Date().toISOString();
          await applications.doc(id).set({ company, role, status: "待确认", applied_at: "", next_action: "", next_action_date: "", notes: "", ownerId: uid, created_at: now, updated_at: now });
        }
      }
      const sites = db.collection("company_sites");
      const sitesCount = await sites.count();
      if (!sitesCount?.total && (await interviews()).length > 0) {
        const now = new Date().toISOString();
        for (const site of INITIAL_COMPANY_SITES) {
          await sites.doc(site.company).set({ url: site.url, label: site.label, source: site.source, ownerId: uid, updated_at: now });
        }
      }
    })().catch((error) => {
      seeded = undefined;
      throw error;
    });
  }
  return seeded;
}

// ---------- data api ----------

export const cloudApi: DataApi = {
  mode: "cloud",
  auth,

  async getOverview() {
    await ensureSeeded();
    const [interviewsList, applicationRows, todoRows] = await Promise.all([
      cloudApi.getInterviews(),
      db.collection("applications").limit(1000).get(),
      db.collection("todos").limit(1000).get(),
    ]);
    const applications = (applicationRows.data ?? []).filter((row) => !(row as Record<string, unknown>).deleted).map((row) => {
      const doc = row as Record<string, unknown>;
      return {
        id: String(doc._id), company: String(doc.company ?? ""), role: String(doc.role ?? ""), status: String(doc.status ?? "待确认"),
        applied_at: String(doc.applied_at ?? ""), next_action: String(doc.next_action ?? ""), next_action_date: String(doc.next_action_date ?? ""),
        notes: String(doc.notes ?? ""), created_at: String(doc.created_at ?? ""), updated_at: String(doc.updated_at ?? ""),
      } as Application;
    }).sort((a, b) => a.company.localeCompare(b.company, "zh-CN") || a.role.localeCompare(b.role, "zh-CN"));
    const todos = (todoRows.data ?? []).filter((row) => !row.deleted).map((row) => {
      const doc = row as Record<string, unknown>;
      return {
        id: String(doc._id), title: String(doc.title ?? ""), due_date: String(doc.due_date ?? ""),
        done: Boolean(doc.done), interview_id: String(doc.interview_id ?? ""), document_id: String(doc.document_id ?? ""),
      } as Todo;
    }).sort((a, b) => Number(a.done) - Number(b.done) || (a.due_date || "9999").localeCompare(b.due_date || "9999"));
    return { interviews: interviewsList, applications, todos };
  },

  async getInterviews() {
    await ensureSeeded();
    const [wiki, manualRows] = await Promise.all([
      interviews(),
      db.collection("manual_interviews").limit(1000).get(),
    ]);
    const manual: Interview[] = (manualRows.data ?? []).map((row) => {
      const doc = row as Record<string, unknown>;
      return {
        id: String(doc._id), date: String(doc.date ?? ""), company: String(doc.company ?? ""), role: String(doc.role ?? ""),
        round: String(doc.round ?? ""), confidence: "手动录入",
        reviewTitle: `${doc.date ?? ""} ${doc.company ?? ""} ${doc.role ?? ""}面试记录`,
        reviewId: doc.review_id ? String(doc.review_id) : null,
        optimization: String(doc.optimization || "待整理"), longTermLinks: [],
      };
    });
    return [...wiki, ...manual].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  },

  async getQuestionIndex() {
    const list = await cloudApi.getInterviews();
    const entries = await Promise.all(list.map(async (item) => {
      const row = item.reviewId ? await getWikiRow(item.reviewId) : null;
      return [item.id, row ? parseSections(row.content).map((section) => section.title).join(" ") : ""] as const;
    }));
    return Object.fromEntries(entries);
  },

  async getReview(id: string) {
    const interview = (await cloudApi.getInterviews()).find((item) => item.id === id);
    if (!interview?.reviewId) return null;
    const row = await getWikiRow(interview.reviewId);
    if (!row) return null;
    return { interview, doc: makeWikiDocument(interview.reviewId, row.content) };
  },

  async getAnswerSummaries(): Promise<AnswerSummary[]> {
    const catalog = [...ANSWER_DOCUMENTS, ...(await listWikiIds()).filter(isLearningId).map((id) => ({ id, category: "学习入库", description: "AI生成的待核验草稿" }))];
    const rows = await Promise.all(catalog.map(async (item): Promise<AnswerSummary> => {
      const row = await getWikiRow(item.id);
      if (!row) return { ...item, title: item.id.split("/").pop()!.replace(/\.md$/, ""), sectionTitles: [], searchText: "" };
      const doc = makeWikiDocument(item.id, row.content);
      return { ...item, title: doc.title, sectionTitles: doc.sections.map((section) => section.title), searchText: doc.content };
    }));
    return rows.filter((row) => row.searchText !== "");
  },

  async getAnswerDoc(id: string) {
    if (!ANSWER_DOCUMENTS.some((item) => item.id === id) && !isLearningId(id)) return null;
    const row = await getWikiRow(id);
    return row ? makeWikiDocument(id, row.content) : null;
  },

  async resolveWikiTarget(target: string) {
    const title = decodeURIComponent(target).split("#")[0].replace(/\.md$/i, "");
    if (!title || title.includes("..") || title.includes("\\")) return null;
    const ids = await listWikiIds();
    const exact = ids.find((file) => file.replace(/\.md$/, "") === title);
    return exact ?? ids.find((file) => file.split("/").pop()?.replace(/\.md$/, "") === title.split("/").pop()) ?? null;
  },

  async getWikiDocument(id: string) {
    const row = await getWikiRow(id);
    return row ? makeWikiDocument(id, row.content) : null;
  },

  async isEditableDoc(id: string) {
    return (await editableIds()).has(id);
  },

  async saveWikiSection(id: string, key: string, body: string, expectedVersion: string) {
    if (!(await editableIds()).has(id)) throw new Error("此文档不在网页编辑范围内");
    return saveDocTransformed(id, (source) => replaceSection(source, key, body), expectedVersion);
  },

  async addWikiSection(id: string, title: string, body: string, expectedVersion: string) {
    if (!(await editableIds()).has(id)) throw new Error("此文档不在网页编辑范围内");
    return saveDocTransformed(id, (source) => appendSection(source, title, body), expectedVersion);
  },

  async getApplications() {
    await ensureSeeded();
    const rows = await db.collection("applications").limit(1000).get();
    return (rows.data ?? []).filter((row) => !(row as Record<string, unknown>).deleted).map((row) => {
      const doc = row as Record<string, unknown>;
      return {
        id: String(doc._id), company: String(doc.company ?? ""), role: String(doc.role ?? ""), status: String(doc.status ?? "待确认"),
        applied_at: String(doc.applied_at ?? ""), next_action: String(doc.next_action ?? ""), next_action_date: String(doc.next_action_date ?? ""),
        notes: String(doc.notes ?? ""), created_at: String(doc.created_at ?? ""), updated_at: String(doc.updated_at ?? ""),
      } as Application;
    }).sort((a, b) => a.company.localeCompare(b.company, "zh-CN") || a.role.localeCompare(b.role, "zh-CN"));
  },

  async getCompanySites() {
    await ensureSeeded();
    const rows = await db.collection("company_sites").limit(1000).get();
    return (rows.data ?? []).map((row) => {
      const doc = row as Record<string, unknown>;
      return {
        company: String(doc._id), url: String(doc.url ?? ""), label: String(doc.label ?? ""), source: String(doc.source ?? ""),
      } as CompanySite;
    }).sort((a, b) => a.company.localeCompare(b.company, "zh-CN"));
  },

  async archiveApplication(id: string) {
    const row = await db.collection("applications").doc(id).get();
    if (!row.data || (row.data as Record<string, unknown>).deleted) throw new Error("投递记录不存在或已在回收站");
    const result = await db.collection("applications").doc(id).update({ deleted: true, deletedAt: new Date().toISOString() });
    if (Number(result.updated ?? 0) !== 1) throw new Error("删除失败或无权操作");
  },
  async restoreApplication(id: string) {
    const row = await db.collection("applications").doc(id).get();
    if (!row.data || !(row.data as Record<string, unknown>).deleted) throw new Error("回收站记录不存在");
    const result = await db.collection("applications").doc(id).update({ deleted: false, deletedAt: "" });
    if (Number(result.updated ?? 0) !== 1) throw new Error("恢复失败或无权操作");
  },
  async getArchivedApplications() {
    const rows = await db.collection("applications").limit(1000).get();
    return (rows.data ?? []).filter((row) => Boolean((row as Record<string, unknown>).deleted)).map((row) => {
      const d = row as Record<string, unknown>;
      return { id: String(d._id), company: String(d.company), role: String(d.role), status: String(d.status || "待确认"), applied_at: String(d.applied_at || ""), next_action: String(d.next_action || ""), next_action_date: String(d.next_action_date || ""), notes: String(d.notes || ""), created_at: String(d.created_at || ""), updated_at: String(d.updated_at || "") } as Application;
    });
  },

  async saveApplication(input: ApplicationInput) {
    await ensureSeeded();
    const uid = await currentUid();
    const clean = validateApplicationInput(input);
    let id = clean.id;
    if (id === "new") id = `a-${randomIdFragment()}${randomIdFragment()}`;
    const applications = db.collection("applications");
    const existingRows = await applications.limit(1000).get();
    const existing = (existingRows.data ?? []).map((row) => row as Record<string, unknown>);
    const match = existing.find((row) => String(row._id) === id);
    if (match?.deleted) throw new Error("这条记录已移入回收站，请先恢复再编辑");
    if (match && (String(match.company) !== clean.company || String(match.role) !== clean.role)) {
      throw new Error("已有岗位的公司和岗位名称不能在此修改");
    }
    if (!match && existing.some((row) => String(row.company) === clean.company && String(row.role) === clean.role)) {
      throw new Error("该公司和岗位已经在看板中");
    }
    const now = new Date().toISOString();
    await applications.doc(id).set({
      company: clean.company, role: clean.role, status: clean.status, applied_at: clean.applied_at,
      next_action: clean.next_action, next_action_date: clean.next_action_date, notes: clean.notes,
      ownerId: uid, created_at: match ? String(match.created_at ?? now) : now, updated_at: now,
    });
    if (clean.career_url) {
      const sites = db.collection("company_sites");
      const siteRows = await sites.where({ _id: clean.company }).limit(1).get();
      const site = (siteRows.data ?? [])[0] as Record<string, unknown> | undefined;
      if (!site || String(site.url) !== clean.career_url) {
        await sites.doc(clean.company).set({ url: clean.career_url, label: "自定义招聘入口", source: "", ownerId: uid, updated_at: now });
      }
    }
  },

  async createInterview(input: InterviewNoteInput) {
    await ensureSeeded();
    const uid = await currentUid();
    const clean = validateInterviewInput(input);
    const note = buildInterviewNote(clean);
    const now = new Date().toISOString();
    const noteId = await (async () => {
      let candidate = note.id;
      // ensure the note id is free before writing
      for (let attempt = 0; attempt < 3; attempt++) {
        const taken = await db.collection("wiki_docs").where({ _id: candidate }).limit(1).get();
        if (!(taken.data ?? []).length) break;
        candidate = `questions/interview-core/${clean.date}-工作台面试记录-${randomIdFragment()}.md`;
      }
      return candidate;
    })();
    await db.collection("wiki_docs").doc(noteId).set({ content: note.content, version: checksum(note.content), ownerId: uid, updatedAt: now });
    const id = `m-${randomIdFragment()}${randomIdFragment()}${randomIdFragment()}`;
    await db.collection("manual_interviews").doc(id).set({
      date: clean.date, company: clean.company, role: clean.role, round: clean.round,
      optimization: clean.optimization, review_id: noteId, ownerId: uid, updatedAt: now,
    });
    const applications = db.collection("applications");
    const applicationId = applicationIdFor(clean.company, canonicalRole(clean.role));
    const existing = await applications.where({ _id: applicationId }).limit(1).get();
    if (!(existing.data ?? []).length) {
      await applications.doc(applicationId).set({
        company: clean.company, role: canonicalRole(clean.role), status: "待确认", applied_at: "",
        next_action: "", next_action_date: "", notes: "", ownerId: uid, created_at: now, updated_at: now,
      });
    }
    invalidateInterviews();
    return id;
  },

  async getLinkableDocuments() {
    return (await listWikiIds()).map((id) => ({ id, title: documentLabel(id), category: id.includes("interview-core/") && /复盘|面试记录/.test(id) ? "真实面试" : "知识库" }));
  },
  async addTodo(title: string, dueDate: string, interviewId: string, documentId = "") {
    const uid = await currentUid();
    const cleanTitle = title.trim();
    if (!cleanTitle || cleanTitle.length > 200) throw new Error("请填写 1—200 字的任务标题");
    if (!validSchedule(dueDate)) throw new Error("请填写有效的日期与时间");
    if (interviewId && !(await cloudApi.getInterviews()).some((i) => i.id === interviewId)) throw new Error("面试记录不存在或不属于当前账号");
    validateDocumentId(documentId);
    if (documentId && !(await getWikiRow(documentId))) throw new Error("关联文档不存在或不属于当前账号");
    await db.collection("todos").add({
      title: cleanTitle, due_date: dueDate, done: false, interview_id: interviewId, document_id: documentId, ownerId: uid, createdAt: new Date().toISOString(),
    });
  },

  async setTodoDone(id: string, done: boolean) {
    const result = await db.collection("todos").where({ _id: id, deleted: rawDb.command.neq(true) }).update({ done });
    const updated = typeof result.updated === "number" ? result.updated : Number(result.updated ?? 0);
    if (updated !== 1) throw new Error("待办不存在或无权修改");
  },

  async updateTodo(id, title, dueDate, expected, documentId) {
    const cleanTitle = validateTodoEdit(title, dueDate, expected);
    if (!id || id.length > 200) throw new Error("待办编号不正确");
    if (documentId !== undefined) {
      validateDocumentId(documentId);
      if (documentId && !(await getWikiRow(documentId))) throw new Error("关联文档不存在或不属于当前账号");
    }
    const current = (await db.collection("todos").doc(id).get()).data;
    if (!current || (expected.document_id !== undefined && String(current.document_id ?? "") !== expected.document_id)) throw new Error("关联文档已被修改或无权访问，请刷新后重新编辑");
    const filter: Record<string, unknown> = { _id: id, deleted: rawDb.command.neq(true), title: expected.title, due_date: expected.due_date };
    if (expected.document_id !== undefined) filter.document_id = Object.hasOwn(current, "document_id") ? current.document_id : rawDb.command.exists(false);
    const result = await db.collection("todos").where(filter).update({ title: cleanTitle, due_date: dueDate, ...(documentId !== undefined ? { document_id: documentId } : {}) });
    if (Number(result.updated ?? 0) !== 1) throw new Error("待办已被修改或无权访问，请刷新后重新编辑");
  },

  async archiveTodo(id) {
    const result = await db.collection("todos").doc(id).update({ deleted: true });
    if (Number(result.updated ?? 0) !== 1) throw new Error("待办不存在或无权删除");
  },
  async restoreTodo(id) {
    const result = await db.collection("todos").doc(id).update({ deleted: false });
    if (Number(result.updated ?? 0) !== 1) throw new Error("待办不存在或无权恢复");
  },
  async getArchivedTodos() {
    const rows = await db.collection("todos").where({ deleted: true }).limit(1000).get();
    return rows.data.map((row) => ({ id: String(row._id), title: String(row.title ?? ""), due_date: String(row.due_date ?? ""), done: Boolean(row.done), interview_id: String(row.interview_id ?? ""), document_id: String(row.document_id ?? "") }));
  },

  async getAnswerPins() {
    const key = `hub:answer-pins:${await currentUid()}`;
    return JSON.parse(localStorage.getItem(key) || "{}");
  },
  async setAnswerPin(id: string, pinned: boolean) {
    if (!ANSWER_DOCUMENTS.some((d) => d.id === id) && !isLearningId(id)) throw new Error("未知的回答文档");
    const key = `hub:answer-pins:${await currentUid()}`;
    const pins = JSON.parse(localStorage.getItem(key) || "{}");
    pins[id] = pinned; localStorage.setItem(key, JSON.stringify(pins));
  },
  async getLearningStatus() {
    return { available: false, description: "在线版暂不开放 AI 学习入库，请使用本地版本。" };
  },
  async generateLearning() { throw new Error("在线版暂不开放大模型调用"); },
  async saveLearning() { throw new Error("当前云端版本尚未开放学习文档写入，请使用本地工作台"); },
};
