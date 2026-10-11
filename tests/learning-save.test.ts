import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

test("learning save requires confirmation and writes only a new page plus backed-up indexes", async () => {
  // Separate test worker and disposable vault: never mutate the real knowledge base.
  const cwd = process.cwd();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hub-learning-save-test-"));
  const app = path.join(root, "app");
  await fs.mkdir(path.join(app, "data", "learning"), { recursive: true });
  await fs.mkdir(path.join(root, "wiki"));
  for (const name of ["index", "log", "hot"]) await fs.writeFile(path.join(root, "wiki", `${name}.md`), `---\ntitle: ${name}\n---\n\n# ${name}\n\nOriginal preserved.\n`);
  const token = randomUUID();
  await fs.writeFile(path.join(app, "data", "learning", `${token}.json`), JSON.stringify({ sourceUrl: "https://example.com/article", sha256: "test-source-hash", quality: { model: "test-model" } }));
  process.env.WIKI_ROOT = path.join(root, "wiki");
  process.chdir(app);
  try {
    const { saveLearningDraft } = await import("../src/lib/learning");
    const input = { title: "测试资料", markdown: "## 结论\n\n测试草稿。", source: token, confirmed: false };
    await assert.rejects(saveLearningDraft(input), /请确认/);
    const id = await saveLearningDraft({ ...input, confirmed: true });
    const raw = await fs.readFile(path.join(root, "wiki", id), "utf8");
    assert.match(raw, /source_sha256: test-source-hash/);
    assert.match(raw, /测试草稿/);
    for (const name of ["index", "log", "hot"]) assert.match(await fs.readFile(path.join(root, "wiki", `${name}.md`), "utf8"), /Original preserved/);
    assert.match(await fs.readFile(path.join(root, "wiki", "hot.md"), "utf8"), /test-model/);
    assert.ok((await fs.readdir(path.join(app, "data", "learning", "index-backups"))).length >= 4);
    await saveLearningDraft({ ...input, confirmed: true });
    assert.equal((await fs.readFile(path.join(root, "wiki", "log.md"), "utf8")).split(`学习入库来源 ${token}`).length, 2);
    await assert.rejects(saveLearningDraft({ ...input, confirmed: true, markdown: "改变已入库正文" }), /未覆盖/);
    assert.equal((await fs.readdir(path.join(root, ".vault-meta", "locks"))).length, 0);
    const draftToken = randomUUID();
    const draft = { title: "自动归档验证", markdown: "## 草稿\n尚未核验", source: draftToken, confirmed: false, asDraft: true };
    await fs.writeFile(path.join(app, "data", "learning", `${draftToken}.json`), JSON.stringify({ title: draft.title, markdown: draft.markdown, sha256: "draft-source", quality: { checks: [{ name: "引用", passed: true }] } }));
    await assert.rejects(saveLearningDraft({ ...draft, markdown: "被修改的稿件" }), /自动归档仅接受/);
    const draftId = await saveLearningDraft(draft);
    const draftRaw = await fs.readFile(path.join(root, "wiki", draftId), "utf8");
    assert.match(draftRaw, /status: draft/);
    assert.match(draftRaw, /reviewed: false/);
    assert.match(draftRaw, /未经本人核验/);
  } finally { process.chdir(cwd); }
});
