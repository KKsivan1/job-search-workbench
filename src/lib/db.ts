import "server-only";
import { TODO_ARCHIVE_FILE } from "./todo-archive";
import { readTodoDocuments } from "./todo-document-store";

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { canonicalRole, getInterviews } from "./interviews";
import type { Application, CompanySite, Todo } from "./types";
import { archivedIds, ARCHIVE_FILE } from "./application-archive";

// Only company-owned recruitment pages or links explicitly published by the company are seeded.
// Recruitment outcomes are never inferred from these pages or from interview rounds.
const INITIAL_COMPANY_SITES: CompanySite[] = [];

let instance: DatabaseSync | undefined;
let seeded: Promise<void> | undefined;

export function getDb(): DatabaseSync {
  if (instance) return instance;
  const directory = path.resolve(process.cwd(), "data");
  fs.mkdirSync(directory, { recursive: true });
  instance = new DatabaseSync(path.join(directory, "hub.sqlite"));
  instance.exec("PRAGMA journal_mode = WAL");
  instance.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT '待确认',
      applied_at TEXT NOT NULL DEFAULT '',
      next_action TEXT NOT NULL DEFAULT '',
      next_action_date TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company, role)
    );
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      due_date TEXT NOT NULL DEFAULT '',
      done INTEGER NOT NULL DEFAULT 0,
      interview_id TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS company_sites (
      company TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      label TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const insertSite = instance.prepare("INSERT OR IGNORE INTO company_sites (company, url, label, source) VALUES (?, ?, ?, ?)");
  for (const site of INITIAL_COMPANY_SITES) insertSite.run(site.company, site.url, site.label, site.source);
  return instance;
}

export function getCompanySites(): CompanySite[] {
  return getDb().prepare("SELECT company, url, label, source FROM company_sites ORDER BY company").all().map((row) => ({ ...row })) as CompanySite[];
}

export function saveCompanySite(company: string, url: string, label: string): void {
  getDb().prepare(`INSERT INTO company_sites (company, url, label, source) VALUES (?, ?, ?, '')
    ON CONFLICT(company) DO UPDATE SET url=excluded.url, label=excluded.label,
      source='', updated_at=CURRENT_TIMESTAMP`).run(company, url, label);
}

export function ensureApplicationForInterview(company: string, roleName: string): void {
  const role = canonicalRole(roleName);
  const applicationId = createHash("sha256").update(`${company}\0${role}`).digest("hex").slice(0, 16);
  getDb().prepare("INSERT OR IGNORE INTO applications (id, company, role) VALUES (?, ?, ?)").run(applicationId, company, role);
}

export async function ensureSeeded(): Promise<void> {
  if (!seeded) {
    seeded = (async () => {
      const interviews = await getInterviews();
      const insert = getDb().prepare("INSERT OR IGNORE INTO applications (id, company, role) VALUES (?, ?, ?)");
      const pairs = new Set(interviews.map((item) => JSON.stringify([item.company, canonicalRole(item.role)])));
      getDb().exec("BEGIN TRANSACTION");
      try {
        for (const pair of pairs) {
          const [company, role] = JSON.parse(pair) as [string, string];
          const id = createHash("sha256").update(`${company}\0${role}`).digest("hex").slice(0, 16);
          insert.run(id, company, role);
        }
        getDb().exec("COMMIT");
      } catch (error) {
        getDb().exec("ROLLBACK");
        throw error;
      }
    })().catch((error) => {
      seeded = undefined;
      throw error;
    });
  }
  await seeded;
}

export async function getApplications(): Promise<Application[]> {
  await ensureSeeded();
  const deleted = archivedIds(ARCHIVE_FILE);
  return (getDb().prepare("SELECT * FROM applications ORDER BY company COLLATE NOCASE, role COLLATE NOCASE").all().map((row) => ({ ...row })) as Application[]).filter((row) => !deleted.has(row.id));
}

export async function getTodos(includeArchived = false): Promise<Todo[]> {
  await ensureSeeded();
  const hidden = archivedIds(TODO_ARCHIVE_FILE);
  const documents = readTodoDocuments();
  return getDb().prepare("SELECT * FROM todos ORDER BY done ASC, CASE WHEN due_date = '' THEN 1 ELSE 0 END, due_date ASC, id DESC").all().map((row) => ({
    id: String(row.id), title: String(row.title), due_date: String(row.due_date), done: Boolean(row.done), interview_id: String(row.interview_id), document_id: documents[String(row.id)] || "",
  })).filter((todo) => includeArchived || !hidden.has(todo.id));
}

export function saveApplication(input: Pick<Application, "id" | "company" | "role" | "status" | "applied_at" | "next_action" | "next_action_date" | "notes">): void {
  getDb().prepare(`INSERT INTO applications (id, company, role, status, applied_at, next_action, next_action_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status, applied_at=excluded.applied_at,
    next_action=excluded.next_action, next_action_date=excluded.next_action_date,
    notes=excluded.notes, updated_at=CURRENT_TIMESTAMP`).run(input.id, input.company, input.role, input.status, input.applied_at, input.next_action, input.next_action_date, input.notes);
}

export function addTodo(title: string, dueDate: string, interviewId: string): void {
  getDb().prepare("INSERT INTO todos (title, due_date, interview_id) VALUES (?, ?, ?)").run(title, dueDate, interviewId);
}

export function setTodoDone(id: number, done: boolean): void {
  getDb().prepare("UPDATE todos SET done = ? WHERE id = ?").run(done ? 1 : 0, id);
}
