import test from "node:test";
import assert from "node:assert/strict";
import { physicalId, scopedDatabase, type RawDatabase } from "../src/lib/scoped-database";

test("云端同名文档按账号分离，所有查询带归属条件", async () => {
  const calls: Record<string, unknown>[] = [];
  const query = {
    where(filter: Record<string, unknown>) { calls.push(filter); return this; },
    limit() { return this; },
    async get() { return { data: [] }; },
    async count() { return { total: 0 }; },
    async update() { return { updated: 1 }; },
    async add(row: Record<string, unknown>) { calls.push(row); return {}; },
    doc() { throw new Error("不应使用不带归属条件的 doc 操作"); },
  };
  const raw = { collection(name: string) { assert.equal(name, "hub_v2_wiki_docs"); return query; } } as RawDatabase;
  const db = scopedDatabase(raw, async () => "owner-a");
  await db.collection("wiki_docs").where({ ownerId: "owner-b", _openid: "owner-b" }).get();
  assert.equal(calls[0].ownerId, "owner-a");
  assert.equal(calls[0]._openid, "owner-a");
  await db.collection("wiki_docs").doc("same.md").set({ content: "hello" });
  assert.equal(calls.at(-1)?._id, physicalId("owner-a", "wiki_docs", "same.md"));
  assert.notEqual(physicalId("owner-a", "wiki_docs", "same.md"), physicalId("owner-b", "wiki_docs", "same.md"));
  await assert.rejects(db.collection("wiki_docs").doc("same.md").update({ ownerId: "owner-b" }), /不能修改/);
});
