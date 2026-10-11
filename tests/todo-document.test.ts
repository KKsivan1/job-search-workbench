import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addLinkedTodo, readTodoDocuments, updateLinkedTodo } from "../src/lib/todo-document-store";
import { validateDocumentId, todoDocumentHref } from "../src/lib/todo-document";
import { archiveLocalTodo } from "../src/lib/todo-archive";
import { calendarEvents } from "../src/lib/recruitment-calendar";
const document="questions/示例面试准备.md";
test("safe Chinese Wiki paths round-trip and never accept external/raw/traversal paths",()=>{
  assert.equal(new URL(todoDocumentHref(document),"http://localhost").searchParams.get("target"),document);
  for(const id of ["../raw/file.md","/file.md","https://example.com/a.md","a\\b.md","a/../../b.md","a//b.md","a/./b.md","file.pdf"]) assert.throws(()=>validateDocumentId(id));
  assert.equal(validateDocumentId(""),"");
});
test("create, replace, unlink, legacy edits, conflict, completion and restoration preserve links",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"hub-todo-doc-"));
  const file=path.join(root,"documents.json");
  const archive=path.join(root,"archive.json");
  const db=new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE todos(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT,due_date TEXT,done INTEGER DEFAULT 0,interview_id TEXT)");
    const id=addLinkedTodo(db,"【面试】示例群面","2026-10-10T16:30","22",document,file);
    assert.equal(readTodoDocuments(file)[id],document);
    db.prepare("UPDATE todos SET done=1 WHERE id=?").run(id);
    archiveLocalTodo(db,id,true,archive); archiveLocalTodo(db,id,false,archive);
    assert.equal(readTodoDocuments(file)[id],document);
    updateLinkedTodo(db,id,"准备群面","2026-10-10T16:30",{title:"【面试】示例群面",due_date:"2026-10-10T16:30"},undefined,file);
    assert.equal(readTodoDocuments(file)[id],document);
    assert.equal(db.prepare("SELECT done,interview_id FROM todos WHERE id=?").get(id)?.done,1);
    assert.equal(db.prepare("SELECT interview_id FROM todos WHERE id=?").get(id)?.interview_id,"22");
    const snapshot={title:"准备群面",due_date:"2026-10-10T16:30",document_id:document};
    updateLinkedTodo(db,id,snapshot.title,snapshot.due_date,snapshot,"concepts/Agent核心概念与构成.md",file);
    assert.throws(()=>updateLinkedTodo(db,id,"不可覆盖","",snapshot,"",file),/已被修改/);
    assert.equal(db.prepare("SELECT title FROM todos WHERE id=?").get(id)?.title,"准备群面");
    updateLinkedTodo(db,id,snapshot.title,snapshot.due_date,{...snapshot,document_id:"concepts/Agent核心概念与构成.md"},"",file);
    assert.equal(readTodoDocuments(file)[id],undefined);
    assert.throws(()=>updateLinkedTodo(db,id,"不可覆盖","",{title:"错误快照",due_date:""},"",file),/已被修改/);
    assert.equal(calendarEvents([{id,title:"待办",done:false,due_date:"",interview_id:"",document_id:document}],[])[0].documentId,document);
  } finally {db.close();}
});
test("metadata write failure rolls back insertion and does not leave partial todos",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"hub-todo-doc-failure-"));
  const db=new DatabaseSync(":memory:");
  try{
    db.exec("CREATE TABLE todos(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT,due_date TEXT,done INTEGER DEFAULT 0,interview_id TEXT)");
    const rename=fs.renameSync;
    try {
      fs.renameSync=()=>{throw new Error("模拟元数据写入失败");};
      assert.throws(()=>addLinkedTodo(db,"任务","","",document,path.join(root,"documents.json")),/写入失败/);
    } finally {fs.renameSync=rename;}
    assert.equal(db.prepare("SELECT COUNT(*) n FROM todos").get()?.n,0);
  }finally{db.close();}
});
