import { promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

// Compatible with the vault's interview-wiki-lock.py (same path hash and payload).
// Do not remove another writer's lock, including stale locks, automatically.
export async function withLearningWikiLocks<T>(ids: string[], action: () => Promise<T>, vaultRoot = path.resolve("..")): Promise<T> {
  const dir = path.join(vaultRoot, ".vault-meta", "locks");
  await fs.mkdir(dir, { recursive: true });
  const locks: { file: string; payload: string }[] = [];
  try {
    for (const id of [...new Set(ids)].sort()) {
      if (!id.endsWith(".md") || id.includes("..") || path.isAbsolute(id)) throw new Error("无效的知识库锁路径");
      const relative = `wiki/${id.replaceAll("\\", "/")}`;
      const file = path.join(dir, `${createHash("sha1").update(relative).digest("hex")}.lock`);
      const payload = `${process.pid} ${Math.floor(Date.now() / 1000)} ${relative} ${randomUUID()}\n`;
      let handle;
      try { handle = await fs.open(file, "wx", 0o600); }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new Error("知识库页面正在被另一任务维护，未覆盖，请稍后重试");
        throw e;
      }
      locks.push({ file, payload });
      try { await handle.writeFile(payload); } finally { await handle.close(); }
    }
    return await action();
  } finally {
    for (const lock of locks.reverse()) {
      try { if (await fs.readFile(lock.file, "utf8") === lock.payload) await fs.unlink(lock.file); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    }
  }
}
