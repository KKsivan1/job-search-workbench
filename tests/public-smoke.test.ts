import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ANSWER_DOCUMENTS, TIMELINE_ID, MAPPING_ID, parseTimeline } from "../src/lib/core";
test("public templates have no real interviews and every library entry resolves",async()=>{
  for(const doc of ANSWER_DOCUMENTS) await fs.access(path.resolve("wiki",doc.id));
  await fs.access(path.resolve("wiki",MAPPING_ID));
  assert.equal(parseTimeline(await fs.readFile(path.resolve("wiki",TIMELINE_ID),"utf8")).length,0);
});
