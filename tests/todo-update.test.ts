import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { updateLocalTodo, validateTodoEdit } from "../src/lib/todo-update";

test("todo edit updates the same row, persists time and preserves completion and interview link", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE todos (id INTEGER PRIMARY KEY, title TEXT, due_date TEXT, done INTEGER, interview_id TEXT); INSERT INTO todos VALUES (1, '面试准备', '2026-10-09', 1, '22'); INSERT INTO todos VALUES (2, '其他待办', '', 0, '');");
    const expected = { title: "面试准备", due_date: "2026-10-09" };
    updateLocalTodo(db,"1","【面试】面试沟通","2026-10-10T14:30",expected);
    assert.deepEqual({...db.prepare("SELECT * FROM todos WHERE id=1").get()}, {id:1,title:"【面试】面试沟通",due_date:"2026-10-10T14:30",done:1,interview_id:"22"});
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM todos").get()?.n,2);
    assert.equal(db.prepare("SELECT title FROM todos WHERE id=2").get()?.title,"其他待办");
    assert.throws(()=>updateLocalTodo(db,"1","覆盖","2026-10-11",expected),/已被修改/);
    assert.throws(()=>updateLocalTodo(db,"999","无效","",expected),/不存在/);
    assert.equal(db.prepare("SELECT title FROM todos WHERE id=1").get()?.title,"【面试】面试沟通");
  } finally { db.close(); }
});
test("todo edit rejects empty text, invalid dates and malformed snapshot", () => {
  const expected={title:"原任务",due_date:""};
  assert.throws(()=>validateTodoEdit(" ","",expected));
  assert.throws(()=>validateTodoEdit("任务","2026-10-09T25:00",expected));
  assert.throws(()=>validateTodoEdit("任务","2026-02-30",expected));
  assert.equal(validateTodoEdit(" 任务 ","",expected),"任务");
});
