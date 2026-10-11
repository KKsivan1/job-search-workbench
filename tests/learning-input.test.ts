import test from "node:test";
import assert from "node:assert/strict";
import { splitLearningInput, suggestLearningTitle } from "../src/lib/learning-input";
import { decodeLearningImage } from "../src/lib/learning-image";
import { supportsBrowserSource, isPublicAddress } from "../src/lib/learning-browser-source";

test("share links become separate queue entries and pasted prose is not discarded", () => {
  assert.equal(splitLearningInput("分享 https://xhslink.com/a\nhttps://recorder.coloros.com/s/b").length, 2);
  assert.equal(splitLearningInput("https://xhslink.com/a\nhttps://xhslink.com/a").length, 1);
  const text = "这是完整的已转写文稿。".repeat(30) + "\nhttps://xhslink.com/a";
  assert.ok(splitLearningInput(text)[0].text.length > 200);
  assert.equal(suggestLearningTitle("# 商品 Agent 评测\n正文"), "商品 Agent 评测");
});
test("source adapters and screenshots reject private or executable inputs", () => {
  assert.ok(supportsBrowserSource(new URL("https://recorder.coloros.com/s/test")));
  assert.ok(!supportsBrowserSource(new URL("https://xiaohongshu.com.evil.example/note")));
  for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.0.1", "169.254.169.254", "::1"]) assert.equal(isPublicAddress(ip), false);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.throws(() => decodeLearningImage({ name: "bad.png", data: "data:image/png;base64,SGVsbG8=" }));
  assert.throws(() => decodeLearningImage({ name: "bad.svg", data: "data:image/svg+xml;base64,SGVsbG8=" }));
});
