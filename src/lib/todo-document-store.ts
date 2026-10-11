import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { updateLocalTodo } from "./todo-update";
import { validateDocumentId } from "./todo-document";

// Sidecar metadata avoids migrating the existing SQLite database.
// Completion and soft deletion leave the association intact.
export const TODO_DOCUMENT_FILE = path.resolve(process.cwd(), "data", "todo-documents.json");
export function readTodoDocuments(file = TODO_DOCUMENT_FILE): Record<string, string> {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data || Array.isArray(data) || typeof data !== "object") throw new Error("待办关联数据格式错误");
    for (const [key, value] of Object.entries(data)) {
      if (!/^\d+$/.test(key)) throw new Error("待办关联编号错误");
      validateDocumentId(value as string);
    }
    return data;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; }
}
function write(file: string, data: Record<string, string>) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), { flag: "wx" });
  fs.renameSync(temp, file);
}
function transaction<T>(db: DatabaseSync, file: string, mutation: (map: Record<string, string>) => T): T {
  db.exec("BEGIN IMMEDIATE");
  let before: Record<string, string> | undefined;
  let written = false;
  try {
    before = readTodoDocuments(file);
    const next = { ...before };
    const result = mutation(next);
    if (JSON.stringify(before) !== JSON.stringify(next)) { write(file, next); written = true; }
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    if (written && before) write(file, before);
    throw error;
  }
}
export function addLinkedTodo(db: DatabaseSync, title: string, date: string, interview: string, document = "", file = TODO_DOCUMENT_FILE) {
  validateDocumentId(document);
  return transaction(db, file, (map) => {
    const result = db.prepare("INSERT INTO todos (title, due_date, interview_id) VALUES (?, ?, ?)").run(title, date, interview);
    const id = String(result.lastInsertRowid);
    if (document) map[id] = document;
    return id;
  });
}
export function updateLinkedTodo(db: DatabaseSync, id: string, title: string, date: string, expected: {title: string; due_date: string; document_id?: string}, document?: string, file = TODO_DOCUMENT_FILE) {
  if (document !== undefined) validateDocumentId(document);
  return transaction(db, file, (map) => {
    if (expected.document_id !== undefined && (map[id] || "") !== expected.document_id) throw new Error("关联文档已被修改，请刷新后重新编辑");
    updateLocalTodo(db, id, title, date, expected);
    if (document !== undefined) { if (document) map[id] = document; else delete map[id]; }
  });
}
