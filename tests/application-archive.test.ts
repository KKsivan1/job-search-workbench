import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { archivedIds, setArchived } from "../src/lib/application-archive";

test("soft deletion survives reload, preserves unrelated rows and supports restoration", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hub-archive-test-"));
  const file = path.join(directory, "archive.json");
  assert.equal(archivedIds(file).size, 0);
  const rows = [{ id: "keep", notes: "备注" }, { id: "duplicate", notes: "原备注" }];
  setArchived(file, "duplicate", true);
  assert.deepEqual(rows.filter((a) => !archivedIds(file).has(a.id)), [rows[0]]);
  setArchived(file, "duplicate", true);
  assert.equal(archivedIds(file).size, 1);
  assert.equal(rows[1].notes, "原备注");
  setArchived(file, "duplicate", false);
  assert.equal(archivedIds(file).size, 0);
  assert.equal(rows.length, 2);
});
