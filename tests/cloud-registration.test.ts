import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";

function handler(file: string, uid: string, initial: Record<string, unknown>[] = []) {
  const records = new Map<string, Record<string, unknown>[]>([["hub_users", [...initial]]]);
  const db = { collection(name: string) {
    if (!records.has(name)) records.set(name, []);
    const rows = records.get(name)!;
    return {
      where(filter: Record<string, unknown>) { return { limit() { return { async get() { return { data: rows.filter((row) => Object.entries(filter).every(([key, value]) => row[key] === value)) }; } }; } }; },
      async add(row: Record<string, unknown>) { rows.push(row); },
    };
  } };
  const exports: { main?: (event: Record<string, unknown>, context: object) => Promise<{ ok: boolean; available?: boolean }> } = {};
  vm.runInNewContext(fs.readFileSync(file, "utf8"), {
    exports, require(name: string) {
      if (name === "node:crypto") return crypto;
      if (name === "@cloudbase/node-sdk") return { SYMBOL_CURRENT_ENV: "test", init: () => ({ database: () => db }), getCloudbaseContext: () => ({ TCB_UUID: uid }) };
      if (name === "./core") return { TIMELINE_ID: "timeline.md", MAPPING_ID: "mapping.md", ANSWER_DOCUMENTS: [] };
      if (name === "./deepseek-learning") return { generateCheckedLearning: () => { throw new Error("Provider must not be invoked"); } };
      throw new Error("Unexpected module");
    }, process: { env: { DEEPSEEK_API_KEY: "synthetic" } }, Date,
  });
  return { run: exports.main!, records };
}

test("cloud enrollment trusts runtime uid only and seeds generic owned documents", async () => {
  const { run, records } = handler("cloud/functions/account/index.cjs", "new-user");
  assert.equal((await run({ op: "enroll", uid: "victim", active: true, role: "admin", aiAccess: true }, {})).ok, true);
  const member = records.get("hub_users")![0];
  assert.equal(member.uid, "new-user"); assert.equal(member.role, "member"); assert.equal(member.aiAccess, false);
  const docs = records.get("hub_v2_wiki_docs")!;
  assert.equal(docs.length, 5);
  assert.ok(docs.every((row) => row.ownerId === "new-user" && row._openid === "new-user"));
  assert.equal((await run({ op: "enroll" }, {})).ok, true);
  assert.equal(docs.length, 5);
});
test("disabled and unauthenticated accounts cannot enroll or overwrite membership", async () => {
  const disabled = handler("cloud/functions/account/index.cjs", "disabled", [{ uid: "disabled", active: false }]);
  assert.equal((await disabled.run({ op: "enroll" }, {})).ok, false);
  assert.equal(disabled.records.get("hub_v2_wiki_docs"), undefined);
  const anonymous = handler("cloud/functions/account/index.cjs", "");
  assert.equal((await anonymous.run({ op: "enroll", uid: "forged" }, {})).ok, false);
});
test("public learning handler rejects every operation without provider calls or database writes", async () => {
  const { run, records } = handler("cloud/functions/learning/index.cjs", "new-user");
  assert.equal((await run({ op: "status" }, {})).available, false);
  for (const op of ["start", "run", "poll", "unknown"]) assert.equal((await run({ op }, {})).ok, false);
  assert.equal(records.size, 1);
});
