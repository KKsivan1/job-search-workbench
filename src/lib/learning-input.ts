export type LearningImage = { name: string; data: string };
export type LearningInput = { title: string; sourceUrl: string; text: string; consent: boolean; image?: LearningImage };

// Share-sheet text often includes a caption and one or more links.
export function splitLearningInput(value: string): { sourceUrl: string; text: string }[] {
  const originals = [...new Set((value.match(/https?:\/\/[^\s<>"\]\u3000-\u9fff]+/g) || []).map((url) => url.replace(/[),，。；;！!]+$/, "")))];
  const links = originals.map((url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" && ["xhslink.com", "v.douyin.com"].includes(parsed.hostname)) parsed.protocol = "https:";
      return parsed.href;
    } catch { return url; } // Server validation reports an item-level error.
  });
  if (!links.length) return value.trim() ? [{ sourceUrl: "", text: value.trim() }] : [];
  if (links.length === 1) {
    const remainder = value.replace(originals[0], "").replace(/^[\s\[\]()]+|[\s\[\]()]+$/g, "").trim();
    // A share caption is not the article. Full pasted transcripts take precedence.
    return [{ sourceUrl: links[0], text: remainder.length >= 200 ? remainder : "" }];
  }
  // Multi-source prose is ambiguous: preserve it as one source, never discard it.
  const prose = value.replace(/https?:\/\/[^\s<>"\]\u3000-\u9fff]+/g, "").trim();
  if (prose.length >= 200) return [{ sourceUrl: links[0], text: value.trim() }];
  return links.map((sourceUrl) => ({ sourceUrl, text: "" }));
}

export function suggestLearningTitle(text: string, fallback = "学习资料") {
  return text.split(/\r?\n/).map((line) => line.replace(/^#+\s*/, "").trim()).find((line) => line.length >= 4 && !line.startsWith("https://"))?.slice(0, 55) || fallback;
}
