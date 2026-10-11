import type { DatabaseSync } from "node:sqlite";
import { validSchedule } from "./recruitment-calendar";

export function validateTodoEdit(title: string, dueDate: string, expected: { title: string; due_date: string }) {
  const clean = title.trim();
  if (!clean || clean.length > 200) throw new Error("请填写 1—200 字的任务标题");
  if (!validSchedule(dueDate)) throw new Error("请填写有效的日期与时间");
  if (!expected || typeof expected.title !== "string" || typeof expected.due_date !== "string") throw new Error("请重新打开待办后编辑");
  return clean;
}
export function updateLocalTodo(db: DatabaseSync, id: string, title: string, dueDate: string, expected: { title: string; due_date: string }) {
  const clean = validateTodoEdit(title, dueDate, expected);
  const numeric = Number(id);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) throw new Error("待办编号不正确");
  const result = db.prepare("UPDATE todos SET title = ?, due_date = ? WHERE id = ? AND title = ? AND due_date = ?").run(clean, dueDate, numeric, expected.title, expected.due_date);
  if (Number(result.changes) !== 1) throw new Error("待办已被修改或不存在，请刷新后重新编辑");
}
