import { chromium } from "playwright-core";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const domains = ["xiaohongshu.com", "xhslink.com", "douyin.com", "iesdouyin.com", "recorder.coloros.com"];
export function supportsBrowserSource(url: URL) {
  return domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
}
export function isPublicAddress(ip: string) {
  if (isIP(ip) === 6) return false; // fail closed; supported services also expose IPv4
  const n = ip.split(".").map(Number);
  return isIP(ip) === 4 && ![0, 10, 127].includes(n[0]) && n[0] < 224 && !(n[0] === 169 && n[1] === 254) && !(n[0] === 172 && n[1] >= 16 && n[1] <= 31) && !(n[0] === 192 && n[1] === 168) && !(n[0] === 100 && n[1] >= 64 && n[1] <= 127) && !(n[0] === 198 && [18, 19].includes(n[1]));
}
export async function readBrowserSource(url: URL): Promise<{ text: string; title: string }> {
  if (!supportsBrowserSource(url) || url.protocol !== "https:" || url.port || url.username || url.password) throw new Error("来源网址不受支持");
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
  try {
    // No local cookies/profile, media downloads or access to private network addresses.
    await context.route("**/*", async (route) => {
      try {
        const request = route.request(); const target = new URL(request.url());
        if (target.protocol !== "https:" || target.port || target.username || target.password || ["media", "image", "font"].includes(request.resourceType())) return route.abort();
        if (request.isNavigationRequest() && !supportsBrowserSource(target)) return route.abort();
        const ips = await lookup(target.hostname, { all: true, family: 4 });
        if (!ips.length || !ips.every((entry) => isPublicAddress(entry.address))) return route.abort();
        await route.continue();
      } catch { await route.abort(); }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    let text: string;
    if (url.hostname === "recorder.coloros.com") {
      await page.getByText("原文", { exact: true }).first().click();
      await page.waitForFunction(() => /讲话人|说话人/.test(document.body.innerText) && /\d{2}:\d{2}/.test(document.body.innerText), null, { timeout: 25_000 });
      text = await page.locator("body").innerText();
      if (text.length < 300) throw new Error("录音原文不完整，请粘贴完整转写稿；不会根据摘要补写");
    } else if (url.hostname.includes("douyin")) {
      throw new Error("已识别抖音链接，但视频不等于可读转写。请在同一输入框补充字幕/转写稿，或上传文字截图；当前未接入视频 ASR。");
    } else {
      const description = page.locator("#detail-desc, .note-content .desc, .note-text").first();
      await description.waitFor({ state: "visible", timeout: 15_000 }).catch(() => { throw new Error("小红书正文不可读（可能需要登录、链接过期或风控）。请粘贴笔记正文或上传截图，再重试；不使用登录提示生成草稿。"); });
      text = await description.innerText();
    }
    if (text.trim().length < 30 || text.length > 60_000) throw new Error("没有取得足够有效正文，或正文超过 6 万字，请粘贴原文分批处理");
    return { text, title: (await page.title()).replace(/[-|｜].*(小红书|抖音).*$/, "").slice(0, 80) };
  } finally { await context.close(); await browser.close(); }
}
