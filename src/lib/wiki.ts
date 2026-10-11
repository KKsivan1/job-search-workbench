import { promises as fs } from "node:fs";
import path from "node:path";
import {
  appendSection,
  buildInterviewNote,
  checksum,
  makeWikiDocument,
  replaceSection,
  type WikiDocument,
} from "./core";

export { ANSWER_DOCUMENTS, appendSection, checksum, parseSections, replaceSection } from "./core";
export type { WikiDocument, WikiSection } from "./core";

// Wiki is runtime user data, not an automatically bundled deployment asset.
export const WIKI_ROOT = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.WIKI_ROOT || "wiki");
const BACKUP_ROOT = path.resolve(process.cwd(), "data", "backups");

export function wikiPath(id: string): string {
  const normalized = id.replaceAll("\\", "/");
  if (!normalized.endsWith(".md") || normalized.startsWith("/") || normalized.includes("\0")) {
    throw new Error("无效的 Wiki 路径");
  }
  const target = path.resolve(/*turbopackIgnore: true*/ WIKI_ROOT, normalized);
  const relative = path.relative(WIKI_ROOT, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("路径不在 Wiki 目录内");
  }
  return target;
}

export async function readWikiDocument(id: string): Promise<WikiDocument> {
  const raw = await fs.readFile(wikiPath(id), "utf8");
  return makeWikiDocument(id, raw);
}

let wikiFilesCache: Promise<string[]> | undefined;
let wikiFilesCachedAt = 0;

export async function findWikiDocument(target: string): Promise<string | null> {
  const title = decodeURIComponent(target).split("#")[0].replace(/\.md$/i, "");
  if (!title || title.includes("..") || title.includes("\\")) return null;
  if (!wikiFilesCache || Date.now() - wikiFilesCachedAt > 5000) {
    wikiFilesCachedAt = Date.now();
    wikiFilesCache = listWikiFiles(WIKI_ROOT);
  }
  const files = await wikiFilesCache;
  const exact = files.find((file) => file.replaceAll("\\", "/").replace(/\.md$/, "") === title);
  return exact ?? files.find((file) => path.basename(file, ".md") === path.basename(title)) ?? null;
}

async function listWikiFiles(directory: string, relative = ""): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    if (entry.name.startsWith(".")) return [];
    const next = path.join(directory, entry.name);
    const rel = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) return listWikiFiles(next, rel);
    return entry.isFile() && entry.name.endsWith(".md") ? [rel] : [];
  }));
  return nested.flat();
}

export async function createInterviewNote(input: { date: string; company: string; role: string; round: string; questions: string; optimization: string }): Promise<string> {
  const note = buildInterviewNote(input);
  await fs.writeFile(wikiPath(note.id), note.content, { encoding: "utf8", flag: "wx" });
  wikiFilesCache = undefined;
  return note.id;
}

export async function listLinkableWikiDocuments() {
  const ids = await listWikiFiles(WIKI_ROOT);
  return Promise.all(ids.map(async (id) => {
    const doc = await readWikiDocument(id);
    return { id, title: doc.title, category: id.includes("interview-core/") && /复盘|面试记录/.test(doc.title) ? "真实面试" : "知识库" };
  }));
}

const writing = new Set<string>();

export async function saveWikiSection(id: string, key: string, body: string, expectedVersion: string): Promise<string> {
  return saveSectionFile(wikiPath(id), key, body, expectedVersion, BACKUP_ROOT);
}

export async function addWikiSection(id: string, title: string, body: string, expectedVersion: string): Promise<string> {
  return saveChangedFile(wikiPath(id), (source) => appendSection(source, title, body), expectedVersion, BACKUP_ROOT);
}

export async function saveSectionFile(target: string, key: string, body: string, expectedVersion: string, backupRoot: string): Promise<string> {
  return saveChangedFile(target, (source) => replaceSection(source, key, body), expectedVersion, backupRoot);
}

export async function saveChangedFile(target: string, transform: (source: string) => string, expectedVersion: string, backupRoot: string): Promise<string> {
  if (writing.has(target)) throw new Error("该文档正在保存，请稍后重试");
  writing.add(target);
  try {
    const current = await fs.readFile(target, "utf8");
    if (checksum(current) !== expectedVersion) throw new Error("文档已在别处更新，请重新加载后再编辑");
    const next = transform(current);
    await fs.mkdir(backupRoot, { recursive: true });
    const backup = path.join(backupRoot, `${path.basename(target, ".md")}-${Date.now()}-${expectedVersion.slice(0, 8)}.md`);
    await fs.writeFile(backup, current, { flag: "wx" });
    const temp = `${target}.hub-${process.pid}-${Date.now()}.tmp`;
    try {
      await fs.writeFile(temp, next, "utf8");
      if (checksum(await fs.readFile(target, "utf8")) !== expectedVersion) {
        throw new Error("保存前文档发生变化，请重新加载");
      }
      await fs.rename(temp, target);
    } catch (error) {
      await fs.rm(temp, { force: true });
      throw error;
    }
    return checksum(next);
  } finally {
    writing.delete(target);
  }
}
