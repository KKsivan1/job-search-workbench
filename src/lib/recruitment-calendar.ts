import type { Application, Todo } from "./types";

export const EVENT_TYPES = ["面试", "笔试", "测评", "HR沟通", "复习", "其他"] as const;
export type CalendarEvent = { id: string; title: string; date: string; time: string; kind: string; done: boolean; source: "todo" | "application"; sourceId: string; subtitle: string; documentId?: string };
export function scheduleTime(value: string): string {
  return validDay(value) && /^\d{4}-\d{2}-\d{2}[T ]([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value.slice(11, 16) : "";
}
export function validSchedule(value: string): boolean {
  return value === "" || Boolean(validDay(value) && (value.length === 10 || scheduleTime(value)));
}
export function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  return Number(a.done)-Number(b.done) || a.date.localeCompare(b.date) || (a.time || "99:99").localeCompare(b.time || "99:99") || a.title.localeCompare(b.title,"zh-CN");
}
export function shanghaiDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function validDay(value: string): string {
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : "";
}
export function monthDays(month: string): string[] {
  const first = new Date(`${month}-01T00:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first); day.setUTCDate(1 - offset + index);
    return day.toISOString().slice(0, 10);
  });
}
export function shiftMonth(month: string, offset: number): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}
function kind(title: string): string {
  const explicit = title.match(/^【([^】]+)】/)?.[1];
  if (explicit && (EVENT_TYPES as readonly string[]).includes(explicit)) return explicit;
  if (/笔试/.test(title)) return "笔试";
  if (/测评|测验/.test(title)) return "测评";
  if (/HR|谈薪|谈心/i.test(title)) return "HR沟通";
  if (/面试|群面/.test(title)) return "面试";
  if (/复练|复习|准备/.test(title)) return "复习";
  return "其他";
}
export function calendarEvents(todos: Todo[], applications: Application[]): CalendarEvent[] {
  return [
    ...todos.map((todo) => ({ id: `todo:${todo.id}`, title: todo.title, date: validDay(todo.due_date), time: scheduleTime(todo.due_date), kind: kind(todo.title), done: todo.done, source: "todo" as const, sourceId: todo.id, subtitle: "我的待办", documentId: todo.document_id })),
    ...applications.filter((app) => app.next_action.trim() && app.status !== "结束").map((app) => ({ id: `application:${app.id}`, title: app.next_action, date: validDay(app.next_action_date), time: scheduleTime(app.next_action_date), kind: kind(app.next_action), done: false, source: "application" as const, sourceId: app.id, subtitle: `${app.company} · ${app.role}` })),
  ];
}
