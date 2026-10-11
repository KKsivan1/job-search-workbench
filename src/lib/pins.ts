import { promises as fs } from "node:fs";
import path from "node:path";
const target = path.resolve(process.cwd(), "data", "answer-pins.json");
let queue: Promise<void> = Promise.resolve();
export async function readPins(): Promise<Record<string, boolean>> {
  try { return JSON.parse(await fs.readFile(target, "utf8")); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return {}; throw e; }
}
export async function writePin(id: string, pinned: boolean): Promise<void> {
  const operation = queue.catch(() => {}).then(async () => {
    const pins = await readPins(); pins[id] = pinned;
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(pins, null, 2));
    await fs.rename(temp, target);
  });
  queue = operation; return operation;
}
