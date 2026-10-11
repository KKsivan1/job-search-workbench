import fs from "node:fs";
import path from "node:path";

// Soft deletion: original SQLite rows remain intact, including recruitment notes.
// A persisted tombstone also prevents Wiki seeding from resurrecting the record.
export function archivedIds(file: string): Set<string> {
  try { return new Set(JSON.parse(fs.readFileSync(file, "utf8")) as string[]); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Set(); throw error; }
}
export function setArchived(file: string, id: string, archived: boolean): void {
  const ids = archivedIds(file);
  if (archived) ids.add(id); else ids.delete(id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify([...ids], null, 2));
  fs.renameSync(temp, file);
}
export const ARCHIVE_FILE = path.resolve(process.cwd(), "data", "application-archive.json");
