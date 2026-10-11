import path from "node:path";
import { archivedIds, setArchived } from "./application-archive";
import type { DatabaseSync } from "node:sqlite";

export const TODO_ARCHIVE_FILE = path.resolve(process.cwd(), "data", "todo-archive.json");
export function ensureActiveTodo(db: DatabaseSync, id: string, archiveFile = TODO_ARCHIVE_FILE) {
  const numeric = Number(id);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) throw new Error("待办编号不正确");
  if (!db.prepare("SELECT id FROM todos WHERE id = ?").get(numeric)) throw new Error("待办不存在");
  if (archivedIds(archiveFile).has(String(numeric))) throw new Error("待办已在回收站，请先恢复");
}
export function archiveLocalTodo(db: DatabaseSync, id: string, archived: boolean, archiveFile = TODO_ARCHIVE_FILE) {
  const numeric = Number(id);
  if (!Number.isSafeInteger(numeric) || numeric <= 0 || !db.prepare("SELECT id FROM todos WHERE id = ?").get(numeric)) throw new Error("待办不存在");
  setArchived(archiveFile, String(numeric), archived);
}
