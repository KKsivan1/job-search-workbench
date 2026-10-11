import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { archiveLocalTodo, ensureActiveTodo } from "../src/lib/todo-archive";
import { archivedIds } from "../src/lib/application-archive";
import { updateLocalTodo } from "../src/lib/todo-update";

test("todo trash survives reload, restores original time and preserves completed tasks and links", () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"hub-todo-trash-"));
  const file=path.join(root,"archive.json");
  const db=new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE todos(id INTEGER PRIMARY KEY,title TEXT,due_date TEXT,done INTEGER,interview_id TEXT); INSERT INTO todos VALUES(1,'【面试】待办','2026-10-10T14:30',1,'22'); INSERT INTO todos VALUES(2,'复练','',0,'');");
    const before=db.prepare("SELECT * FROM todos WHERE id=1").get();
    archiveLocalTodo(db,"1",true,file);
    archiveLocalTodo(db,"1",true,file);
    assert.deepEqual([...archivedIds(file)],["1"]);
    assert.deepEqual(db.prepare("SELECT * FROM todos WHERE id=1").get(),before);
    assert.throws(()=>ensureActiveTodo(db,"1",file),/回收站/);
    assert.doesNotThrow(()=>ensureActiveTodo(db,"2",file));
    archiveLocalTodo(db,"1",false,file);
    assert.equal(archivedIds(file).size,0);
    assert.doesNotThrow(()=>ensureActiveTodo(db,"1",file));
    updateLocalTodo(db,"1","【面试】修改后","2026-10-11T09:00",{title:"【面试】待办",due_date:"2026-10-10T14:30"});
    archiveLocalTodo(db,"1",true,file); archiveLocalTodo(db,"1",false,file);
    assert.equal(db.prepare("SELECT due_date FROM todos WHERE id=1").get()?.due_date,"2026-10-11T09:00");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM todos").get()?.n,2);
    assert.throws(()=>archiveLocalTodo(db,"999",true,file),/不存在/);
    assert.throws(()=>ensureActiveTodo(db,"999",file),/不存在/);
  } finally { db.close(); }
});
