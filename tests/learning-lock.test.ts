import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { withLearningWikiLocks } from "../src/lib/learning-lock";

test("learning writes use shared vault locks, reject concurrent writers and release after failures", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hub-learning-lock-test-"));
  await withLearningWikiLocks(["index.md"], async () => {
    await assert.rejects(withLearningWikiLocks(["index.md"], async () => null, root), /另一任务/);
  }, root);
  await assert.rejects(withLearningWikiLocks(["index.md"], async () => { throw new Error("test failure"); }, root), /test failure/);
  assert.equal(await withLearningWikiLocks(["index.md"], async () => "released", root), "released");
  assert.equal((await fs.readdir(path.join(root, ".vault-meta", "locks"))).length, 0);
});
