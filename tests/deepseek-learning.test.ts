import test from "node:test";
import assert from "node:assert/strict";
import { evaluateLearningDraft, generateCheckedLearning, groundLearningEvidence, LEARNING_HEADINGS, normalizeLearningLinks, normalizeLearningMetrics, requestLearningDraft } from "../src/lib/deepseek-learning";

const quote = "RAG通过从外部知识库检索相关资料，再将资料注入上下文。";
const body = LEARNING_HEADINGS.map((heading) => `## ${heading}\n\n来源观点，待核验。${quote}解决知识时效和私有知识，但无法消灭全部幻觉。`.repeat(2)).join("\n\n") + "\n[[concepts/RAG与知识库]]";
const related = [{ target: "concepts/RAG与知识库", description: "检索增强生成" }];
const response = (markdown = body, evidenceQuotes = [quote]) => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ markdown, evidenceQuotes }) } }], usage: { total_tokens: 500 } }));
const config = { key: "test-only-not-real", model: "deepseek-flash" };

test("learning gate verifies source quotes, headings, valid links and fact boundaries", () => {
  assert.equal(evaluateLearningDraft(body, [quote], quote, related.map((r) => r.target)).passed, true);
  for (const invalid of [body.replaceAll("## 面试问答", "## 其他"), body + "[[不存在的文章]]", body + "我在美团推动了项目", body + "<script>alert(1)</script>"]) {
    assert.equal(evaluateLearningDraft(invalid, [quote], quote, related.map((r) => r.target)).passed, false);
  }
  assert.equal(evaluateLearningDraft(body, ["这是一个原文完全没有的虚构引用片段"], quote, related.map((r) => r.target)).passed, false);
});
test("provider uses fixed HTTPS endpoint and never leaks upstream errors", async () => {
  const mock: typeof fetch = async (url, init) => {
    assert.equal(url, "https://api.deepseek.com/chat/completions");
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.response_format.type, "json_object");
    assert.equal(payload.tools, undefined);
    assert.equal(payload.model, config.model);
    return new Response("sensitive upstream secret", { status: 401 });
  };
  await assert.rejects(requestLearningDraft([], config, mock), /API Key 无效/);
});
test("truncated or invalid JSON is rejected", async () => {
  await assert.rejects(requestLearningDraft([], config, async () => new Response(JSON.stringify({ choices: [{ finish_reason: "length" }] }))), /截断/);
  await assert.rejects(requestLearningDraft([], config, async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "not JSON" } }] }))), /JSON/);
});
test("known short wikilinks are canonicalized; unknown and ambiguous links are not guessed", () => {
  assert.equal(normalizeLearningLinks("[[RAG与知识库#评测|学习]]", [related[0].target]), "[[concepts/RAG与知识库#评测|学习]]");
  assert.equal(normalizeLearningLinks("[[不存在]]", [related[0].target]), "[[不存在]]");
  assert.equal(normalizeLearningLinks("[[同名]]", ["a/同名", "b/同名"]), "[[同名]]");
});
test("only source-verified missing quotes can be added to the displayed evidence", () => {
  const markdown = "## 原文依据\n\n来源：测试。";
  assert.ok(groundLearningEvidence(markdown, [quote], quote).includes(quote));
  assert.equal(groundLearningEvidence(markdown, ["从不存在的材料中伪造了很长的引文"], quote), markdown);
});
test("known metric names follow denominators without rewriting original quotes", () => {
  const raw = "## 业务价值与评测方案\n\n检索召回率：包含相关文档的查询数 / 总查询数。\n审批触发准确率：正确触发数 / 应触发数。\n拒答率：正确拒答数 / 应拒答数。\n> 检索召回率：查询数 / 总查询数。\n\n## 原文依据\n检索召回率：查询数 / 总查询数。";
  const normalized = normalizeLearningMetrics(raw);
  assert.match(normalized, /检索命中率（Hit@K）/);
  assert.match(normalized, /审批触发召回率/);
  assert.match(normalized, /正确拒答召回率/);
  assert.match(normalized, /> 检索召回率：查询数/);
  assert.match(normalized, /## 原文依据\n检索召回率/);
});
test("malformed schema is repaired once without losing token accounting", async () => {
  let calls = 0;
  const result = await generateCheckedLearning("RAG", "", quote, related, config, async () => ++calls === 1 ? new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{}' } }], usage: { total_tokens: 10 } })) : response());
  assert.equal(result.quality.attempts, 3);
  assert.equal(result.quality.tokens, 1010);
});
test("failed gate gets one bounded repair and records both requests", async () => {
  let calls = 0;
  const result = await generateCheckedLearning("RAG", "", quote, related, config, async () => response(++calls === 1 ? "太短了" : body));
  assert.equal(calls, 3); assert.equal(result.quality.attempts, 3); assert.equal(result.quality.tokens, 1500);
  calls = 0;
  await assert.rejects(generateCheckedLearning("RAG", "", quote, related, config, async () => { calls++; return response("太短了"); }), /最多修复一次/);
  assert.equal(calls, 2);
});
